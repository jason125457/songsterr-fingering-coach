/**
 * fingering_engine.js
 * 
 * Independent, decoupled Left-Hand Guitar Fingering Recommendation Engine (Phase 2 v1).
 * 
 * Converts Normalized Tab Data into ergonomically optimized left-hand fingerings.
 * - recommendedFinger: 1 (Index), 2 (Middle), 3 (Ring), 4 (Pinky), 0 (Open String)
 * - recommendedPosition: Base fret where Index finger rests (e.g. Position 7)
 * - isPositionShift: true if entering this beat/measure required shifting hand position
 * 
 * Features:
 * - Dynamic Programming / Global Cost Optimization across the full passage (not just 1 measure)
 * - Minimizes unnecessary position shifts
 * - Enforces physical hand ergonomics and four-finger span
 * - Enforces physically playable simultaneous notes (double stops & chords)
 * - Keeps open strings from disrupting hand position
 * - Zero dependencies (No DOM, No Songsterr, No Network)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FingeringEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function midiToPitch(midi) {
    if (typeof midi !== 'number') return '?';
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }

  function getBaseStringName(stringIndex, tuning) {
    // 0 = High E, 1 = B, 2 = G, 3 = D, 4 = A, 5 = Low E
    if (Array.isArray(tuning) && tuning[stringIndex] !== undefined) {
      const midi = tuning[stringIndex];
      return NOTE_NAMES[midi % 12];
    }
    const defaultGuitarStrings = ['e', 'B', 'G', 'D', 'A', 'E'];
    return defaultGuitarStrings[stringIndex] || `S${stringIndex + 1}`;
  }

  /**
   * Cost Weights for Scoring Engine
   */
  const WEIGHTS = {
    POSITION_SHIFT_BASE: 40,      // Penalty for any position shift
    POSITION_SHIFT_PER_FRET: 12,  // Penalty per fret of shift distance
    NATURAL_SPAN_IDEAL: 0,        // Natural fret = position + finger - 1
    FINGER_DEVIATION: 16,         // Penalty for each finger deviation from natural position
    STRETCH_INDEX: 15,            // Minor index stretch (fret = pos - 1)
    STRETCH_PINKY: 18,            // Minor pinky stretch (fret = pos + 4)
    AWKWARD_STRETCH: 80,          // Stretch beyond 5 frets
    BARRE_COST: 6,                // Using same finger across multiple strings at same fret
    CONSECUTIVE_NOTE_CONSISTENCY: -12, // Bonus for using same finger on exact same note
    INVERTED_FINGER_MOTION: 25,   // Penalty for playing higher fret with lower finger in rapid sequence
    EXTREME_INFEASIBLE: 10000     // Physically impossible configurations
  };

  /**
   * Generate candidate (position, [finger_1, finger_2, ...]) options for a single beat
   */
  function generateBeatCandidates(beatNotes, previousPosition = null, allFrettedFretsInPiece = []) {
    const frettedNotes = beatNotes.filter(n => !n.isRest && n.fret > 0);

    // If beat has no fretted notes (only rests or open strings):
    if (frettedNotes.length === 0) {
      // Open string / rest: finger is 0 for all notes.
      // Generate flexible candidate positions so open strings don't force or restrict hand position.
      const fingerAssignments = beatNotes.map(() => 0);
      const candidatePositions = new Set();
      if (previousPosition) candidatePositions.add(previousPosition);
      if (allFrettedFretsInPiece.length > 0) {
        allFrettedFretsInPiece.forEach(f => candidatePositions.add(f));
      }
      if (candidatePositions.size === 0) candidatePositions.add(1);

      return Array.from(candidatePositions).map(pos => ({
        position: pos,
        fingerAssignments,
        intraCost: 0
      }));
    }

    const frets = frettedNotes.map(n => n.fret);
    const minFret = Math.min(...frets);
    const maxFret = Math.max(...frets);

    // Hand can cover at most ~5-6 frets with index & pinky stretch [pos - 1, pos + 4]
    // Therefore candidate positions P satisfy: maxFret - 4 <= P <= minFret + 1
    const minCandidatePos = Math.max(1, maxFret - 4);
    const maxCandidatePos = Math.min(20, minFret + 1);

    const candidates = [];

    for (let pos = minCandidatePos; pos <= maxCandidatePos; pos++) {
      // Check if all frets can be reached from this position
      let canReach = true;
      for (const f of frets) {
        if (f < pos - 1 || f > pos + 4) {
          canReach = false;
          break;
        }
      }
      if (!canReach) continue;

      // Generate valid finger assignments for the fretted notes in this position
      const validAssignments = generateFrettedAssignments(frettedNotes, pos);

      for (const assignment of validAssignments) {
        // Map back to all notes in the beat (fretted gets finger, open string gets 0, rest gets 0)
        let frettedIdx = 0;
        const fullFingerAssignments = beatNotes.map((n) => {
          if (n.isRest || n.fret === 0) return 0;
          return assignment.fingers[frettedIdx++];
        });

        candidates.push({
          position: pos,
          fingerAssignments: fullFingerAssignments,
          intraCost: assignment.cost
        });
      }
    }

    // Fallback if no clean candidate found (e.g. extreme multi-fret chord):
    if (candidates.length === 0) {
      const pos = Math.max(1, minFret);
      const fullFingerAssignments = beatNotes.map(n => (n.isRest || n.fret === 0 ? 0 : 1));
      candidates.push({
        position: pos,
        fingerAssignments: fullFingerAssignments,
        intraCost: WEIGHTS.AWKWARD_STRETCH
      });
    }

    return candidates;
  }

  /**
   * For fretted notes within a beat, generate physically playable fingerings for position P
   */
  function generateFrettedAssignments(frettedNotes, pos) {
    if (frettedNotes.length === 1) {
      const fret = frettedNotes[0].fret;
      const naturalFinger = fret - pos + 1;
      const options = [];

      // Finger strength preference: Index (1) is strongest/anchor, then Middle (2), Ring (3), Pinky (4)
      const fingerPref = (f) => f === 1 ? 0 : f === 2 ? 1 : f === 3 ? 2 : 4;

      // Primary ideal finger
      if (naturalFinger >= 1 && naturalFinger <= 4) {
        options.push({ fingers: [naturalFinger], cost: fingerPref(naturalFinger) });
      } else if (fret === pos - 1) {
        // Index stretch back
        options.push({ fingers: [1], cost: WEIGHTS.STRETCH_INDEX + fingerPref(1) });
      } else if (fret === pos + 4) {
        // Pinky stretch forward
        options.push({ fingers: [4], cost: WEIGHTS.STRETCH_PINKY + fingerPref(4) });
      }

      // Secondary viable fingers with small penalty (adds flexibility to prevent shifts)
      for (let altFinger = 1; altFinger <= 4; altFinger++) {
        if (!options.some(o => o.fingers[0] === altFinger)) {
          const dev = Math.abs(altFinger - naturalFinger);
          if (dev <= 2) {
            options.push({ fingers: [altFinger], cost: (dev * WEIGHTS.FINGER_DEVIATION) + fingerPref(altFinger) });
          }
        }
      }

      return options;
    }

    // Multiple fretted notes at the same beat (Chords / Double Stops)
    // We must ensure physical hand feasibility!
    const results = [];
    const numNotes = frettedNotes.length;

    // Helper: generate combinations of fingers 1..4 for numNotes
    function searchCombinations(idx, currentFingers) {
      if (idx === numNotes) {
        const cost = evaluateSimultaneousCost(frettedNotes, currentFingers, pos);
        if (cost < WEIGHTS.EXTREME_INFEASIBLE) {
          results.push({ fingers: [...currentFingers], cost });
        }
        return;
      }

      for (let finger = 1; finger <= 4; finger++) {
        currentFingers.push(finger);
        searchCombinations(idx + 1, currentFingers);
        currentFingers.pop();
      }
    }

    searchCombinations(0, []);

    if (results.length === 0) {
      // Fallback
      results.push({
        fingers: frettedNotes.map((_, i) => Math.min(4, i + 1)),
        cost: WEIGHTS.AWKWARD_STRETCH
      });
    }

    return results;
  }

  /**
   * Evaluate whether a simultaneous chord/double stop fingering is physically possible and its cost
   */
  function evaluateSimultaneousCost(notes, fingers, pos) {
    let cost = 0;

    for (let i = 0; i < notes.length; i++) {
      const f_i = notes[i].fret;
      const finger_i = fingers[i];
      const ideal_i = f_i - pos + 1;

      // Check single note ergonomics
      if (f_i === pos - 1 && finger_i === 1) {
        cost += WEIGHTS.STRETCH_INDEX;
      } else if (f_i === pos + 4 && finger_i === 4) {
        cost += WEIGHTS.STRETCH_PINKY;
      } else if (ideal_i >= 1 && ideal_i <= 4) {
        cost += Math.abs(finger_i - ideal_i) * WEIGHTS.FINGER_DEVIATION;
      } else {
        cost += WEIGHTS.AWKWARD_STRETCH;
      }

      // Check pairwise physical constraints with other simultaneous notes
      for (let j = i + 1; j < notes.length; j++) {
        const f_j = notes[j].fret;
        const finger_j = fingers[j];

        // 1. Same finger on different frets simultaneously is IMPOSSIBLE!
        if (f_i !== f_j && finger_i === finger_j) {
          return WEIGHTS.EXTREME_INFEASIBLE;
        }

        // 2. Same finger on same fret across strings = Barre
        if (f_i === f_j && finger_i === finger_j) {
          // Usually Finger 1 or 3 does barre, Finger 2 or 4 is rare
          if (finger_i === 1 || finger_i === 3) {
            cost += WEIGHTS.BARRE_COST;
          } else {
            cost += WEIGHTS.BARRE_COST * 3;
          }
        }

        // 3. Physical ordering:
        // Lower fret MUST use lower or equal finger (Cannot have finger 4 on fret 5 and finger 1 on fret 7)
        if (f_i < f_j && finger_i > finger_j) {
          return WEIGHTS.EXTREME_INFEASIBLE;
        }
        if (f_i > f_j && finger_i < finger_j) {
          return WEIGHTS.EXTREME_INFEASIBLE;
        }
      }
    }

    return cost;
  }

  /**
   * Transition cost between beat (k-1) and beat (k)
   */
  function calculateTransitionCost(prevCand, currCand, prevBeatNotes, currBeatNotes) {
    let cost = 0;

    // 2. Note consistency & melodic phrasing
    const prevFretted = prevBeatNotes.map((n, i) => ({ note: n, finger: prevCand.fingerAssignments[i] })).filter(x => !x.note.isRest && x.note.fret > 0);
    const currFretted = currBeatNotes.map((n, i) => ({ note: n, finger: currCand.fingerAssignments[i] })).filter(x => !x.note.isRest && x.note.fret > 0);

    // 1. Position shift cost
    if (currCand.position !== prevCand.position) {
      const shiftDistance = Math.abs(currCand.position - prevCand.position);
      const prevHasFretted = prevFretted.length > 0;
      const currHasFretted = currFretted.length > 0;

      if (prevHasFretted && currHasFretted) {
        // Direct shift between fretted notes
        cost += WEIGHTS.POSITION_SHIFT_BASE + (shiftDistance * WEIGHTS.POSITION_SHIFT_PER_FRET);
        // Anchored shift principle:
        // When shifting to a new position, landing on Finger 1 provides an ergonomic anchor.
        // Landing on Finger 2, 3, or 4 without Finger 1 anchored incurs an unanchored shift penalty.
        if (currFretted[0].finger > 1) {
          cost += (currFretted[0].finger - 1) * 16;
        }
      } else {
        // Shift across open strings or rests: moderate cost so the hand doesn't drift 1 fret needlessly,
        // but can easily shift if moving to a distant register.
        cost += (WEIGHTS.POSITION_SHIFT_BASE * 0.4) + (shiftDistance * 4);
      }
    }

    if (prevFretted.length > 0 && currFretted.length > 0) {
      for (const p of prevFretted) {
        for (const c of currFretted) {
          // Same string & same fret
          if (p.note.string === c.note.string && p.note.fret === c.note.fret) {
            if (p.finger === c.finger) {
              cost += WEIGHTS.CONSECUTIVE_NOTE_CONSISTENCY; // Bonus
            } else {
              cost += WEIGHTS.FINGER_DEVIATION; // Inconsistency penalty
            }
          }

          // Inverted finger motion on same string (e.g. higher fret played with lower finger)
          if (p.note.string === c.note.string) {
            if (p.note.fret < c.note.fret && p.finger > c.finger && currCand.position === prevCand.position) {
              cost += WEIGHTS.INVERTED_FINGER_MOTION;
            } else if (p.note.fret > c.note.fret && p.finger < c.finger && currCand.position === prevCand.position) {
              cost += WEIGHTS.INVERTED_FINGER_MOTION;
            }
          }
        }
      }
    }

    return cost;
  }

  /**
   * Main Engine Entry Point:
   * Analyzes normalized tab data and attaches left-hand fingerings.
   */
  function analyzeTab(normalizedTabData) {
    if (!normalizedTabData || !Array.isArray(normalizedTabData.measures)) {
      throw new Error('Invalid normalized tab data passed to FingeringEngine');
    }

    const tuning = normalizedTabData.track?.tuning || [64, 59, 55, 50, 45, 40];

    // Flatten beats with reference to measure
    const flatBeats = [];
    normalizedTabData.measures.forEach((m) => {
      if (!Array.isArray(m.beats)) return;
      m.beats.forEach((b) => {
        flatBeats.push({
          measureNumber: m.measureNumber,
          timeSignature: m.timeSignature,
          beat: b
        });
      });
    });

    if (flatBeats.length === 0) {
      return {
        song: normalizedTabData.song,
        track: normalizedTabData.track,
        measures: []
      };
    }

    // Step 1: Pre-compute candidate states for each beat
    const allFrettedNotes = flatBeats.flatMap(fb => fb.beat.notes.filter(n => !n.isRest && n.fret > 0));
    const allFrettedFrets = Array.from(new Set(allFrettedNotes.map(n => n.fret)));
    const initialPos = allFrettedNotes.length > 0 ? allFrettedNotes[0].fret : 1;

    const beatCandidates = [];
    let lastPos = initialPos;

    for (let k = 0; k < flatBeats.length; k++) {
      const cands = generateBeatCandidates(flatBeats[k].beat.notes, lastPos, allFrettedFrets);
      beatCandidates.push(cands);
      if (cands.length > 0) {
        lastPos = cands[0].position;
      }
    }

    // Step 2: Viterbi / Dynamic Programming Forward Pass
    // dp[k][i] = { minCost, prevCandIndex }
    const dp = [];

    // Initialize beat 0
    dp[0] = beatCandidates[0].map(c => ({
      cost: c.intraCost,
      prevIndex: -1
    }));

    for (let k = 1; k < flatBeats.length; k++) {
      const prevCands = beatCandidates[k - 1];
      const currCands = beatCandidates[k];
      const prevNotes = flatBeats[k - 1].beat.notes;
      const currNotes = flatBeats[k].beat.notes;

      dp[k] = [];

      for (let cIdx = 0; cIdx < currCands.length; cIdx++) {
        const currCand = currCands[cIdx];
        let bestCost = Infinity;
        let bestPrevIndex = -1;

        for (let pIdx = 0; pIdx < prevCands.length; pIdx++) {
          const prevCand = prevCands[pIdx];
          const transCost = calculateTransitionCost(prevCand, currCand, prevNotes, currNotes);
          const totalCost = dp[k - 1][pIdx].cost + transCost + currCand.intraCost;

          if (totalCost < bestCost) {
            bestCost = totalCost;
            bestPrevIndex = pIdx;
          }
        }

        dp[k][cIdx] = {
          cost: bestCost,
          prevIndex: bestPrevIndex
        };
      }
    }

    // Step 3: Backtrack Optimal Path
    const lastBeatIndex = flatBeats.length - 1;
    let minFinalCost = Infinity;
    let bestFinalCandIndex = 0;

    for (let cIdx = 0; cIdx < dp[lastBeatIndex].length; cIdx++) {
      if (dp[lastBeatIndex][cIdx].cost < minFinalCost) {
        minFinalCost = dp[lastBeatIndex][cIdx].cost;
        bestFinalCandIndex = cIdx;
      }
    }

    const optimalPath = new Array(flatBeats.length);
    let currBestIndex = bestFinalCandIndex;

    for (let k = lastBeatIndex; k >= 0; k--) {
      optimalPath[k] = beatCandidates[k][currBestIndex];
      currBestIndex = dp[k][currBestIndex]?.prevIndex ?? 0;
    }

    // Step 4: Re-assemble into Measures and attach annotations
    let previousActivePos = null;
    let beatIdx = 0;

    const annotatedMeasures = normalizedTabData.measures.map((m) => {
      let measurePosition = null;
      let measureHasShift = false;

      const annotatedBeats = m.beats.map((b) => {
        const chosen = optimalPath[beatIdx++];
        const currentPos = chosen.position;

        const hasFrettedNote = b.notes.some(n => !n.isRest && n.fret > 0);
        const isShift = hasFrettedNote && previousActivePos !== null && currentPos !== previousActivePos;

        if (hasFrettedNote) {
          if (measurePosition === null) measurePosition = currentPos;
          if (isShift) measureHasShift = true;
          previousActivePos = currentPos;
        }

        const annotatedNotes = b.notes.map((n, nIdx) => {
          const finger = chosen.fingerAssignments[nIdx] ?? 0;
          const openStrName = getBaseStringName(n.string, tuning);
          const pitch = (!n.isRest && n.string >= 0 && Array.isArray(tuning)) 
            ? midiToPitch(tuning[n.string] + Math.max(0, n.fret)) 
            : null;

          return {
            string: n.string,
            stringName: openStrName,
            fret: n.fret,
            recommendedFinger: finger,
            recommendedPosition: currentPos,
            isPositionShift: isShift,
            pitch,
            isRest: !!n.isRest,
            isTie: !!n.isTie,
            isSlide: !!n.isSlide
          };
        });

        return {
          beatNumber: b.beatNumber,
          timing: b.timing,
          recommendedPosition: currentPos,
          isPositionShift: isShift,
          notes: annotatedNotes
        };
      });

      return {
        measureNumber: m.measureNumber,
        timeSignature: m.timeSignature,
        marker: m.marker,
        recommendedPosition: measurePosition || (previousActivePos || 1),
        isPositionShift: measureHasShift,
        beats: annotatedBeats
      };
    });

    return {
      song: normalizedTabData.song,
      track: normalizedTabData.track,
      measures: annotatedMeasures
    };
  }

  return {
    analyzeTab,
    generateBeatCandidates,
    calculateTransitionCost,
    WEIGHTS
  };
});
