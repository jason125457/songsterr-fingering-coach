/**
 * fingering_engine.js
 * 
 * Independent, decoupled Left-Hand Guitar Fingering Recommendation Engine (Phase 2.6).
 * 
 * Converts Normalized Tab Data into ergonomically optimized left-hand fingerings.
 * - recommendedFinger: 1 (Index), 2 (Middle), 3 (Ring), 4 (Pinky), 0 (Open String)
 * - recommendedPosition: Base fret where Index finger rests (e.g. Position 7)
 * - isPositionShift: true if entering this beat/measure required shifting hand position
 * - costBreakdown: Detailed explainability metrics for position & finger selection
 * 
 * Phase 2.6 Features:
 * 1. Phrase / Measure Boundary Preference (shifts prefer bar lines & pauses, penalty for mid-phrase jumps)
 * 2. Repeated Pattern Consistency (re-use canonical position and fingerings across recurring motifs)
 * 3. Generic Shape Coherence (natural Open Position / Position 1 anchor for low frets + open strings)
 * 4. Open-String Shift Window (zero-effort gliding window across open strings, rests, and ties)
 * 5. Explainable Cost Breakdown (transparent debug breakdown for every position choice)
 * 
 * Zero dependencies (No DOM, No Songsterr, No Network).
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
   * Cost Weights for Scoring Engine (Phase 2.6 Rebalanced)
   * 
   * Scoring Philosophy Priority:
   * 1. Physically playable (EXTREME_INFEASIBLE)
   * 2. Stable / natural hand shape (FINGER_DEVIATION, STRETCH_INDEX, STRETCH_PINKY)
   * 3. Repeated riff consistency (REPEATED_PATTERN_BONUS)
   * 4. Musical phrase-aware shifting (BOUNDARY_SHIFT_BONUS, MID_PHRASE_PREEMPTIVE_SHIFT_PENALTY)
   * 5. Open string shift window (OPEN_WINDOW_SHIFT_BASE, OPEN_WINDOW_BONUS)
   * 6. Minimize unnecessary shifts
   * 7. Minimize absolute fret travel (lowered per-fret cost so 2 frets difference never overrules natural hand shapes)
   */
  const WEIGHTS = {
    POSITION_SHIFT_BASE: 36,               // Base penalty for shifting positions
    POSITION_SHIFT_PER_FRET: 5,            // Fret shift penalty (lowered from 12 to 5)
    OPEN_WINDOW_SHIFT_BASE: 10,            // Shifting during open strings/rests is easy
    OPEN_WINDOW_SHIFT_PER_FRET: 2,         // Very low per-fret cost during open strings
    BOUNDARY_SHIFT_BONUS: -18,             // Bonus for shifting at measure boundary or after rest/long note
    MID_PHRASE_PREEMPTIVE_SHIFT_PENALTY: 18,// Penalty for shifting mid-measure in continuous notes
    REPEATED_PATTERN_BONUS: -25,           // Bonus for reusing canonical position for recurring motifs
    OPEN_POSITION_SHAPE_BONUS: -24,        // Bonus for anchoring low frets (1-3) with open strings to Pos 1
    LOW_FRET_STRETCH_AVOIDANCE: 22,        // Penalty for backward index stretch in frets 1-3 when Pos 1 is available
    NATURAL_SPAN_IDEAL: 0,                 // Natural fret = position + finger - 1
    FINGER_DEVIATION: 16,                  // Penalty for each finger deviation from natural position
    STRETCH_INDEX: 16,                     // Minor index stretch (fret = pos - 1)
    STRETCH_PINKY: 18,                     // Minor pinky stretch (fret = pos + 4)
    CONSECUTIVE_STRETCH_PENALTY: 14,       // Accumulative penalty for repeatedly stretching within a phrase
    AWKWARD_STRETCH: 80,                   // Stretch beyond 5 frets
    BARRE_COST: 6,                         // Using same finger across multiple strings at same fret
    CONSECUTIVE_NOTE_CONSISTENCY: -12,     // Bonus for using same finger on exact same note
    INVERTED_FINGER_MOTION: 25,            // Penalty for playing higher fret with lower finger in rapid sequence
    EXTREME_INFEASIBLE: 10000              // Physically impossible configurations
  };

  /**
   * Pre-pass: Detect Melodic Motifs / Repeated Patterns
   * Discovers recurring measure riffs and determines the canonical position in isolation.
   */
  function detectMelodicMotifs(flatBeats) {
    const canonicalPosMap = new Array(flatBeats.length).fill(null);

    // Group beats by measureNumber
    const measureMap = new Map();
    flatBeats.forEach((fb, idx) => {
      if (!measureMap.has(fb.measureNumber)) {
        measureMap.set(fb.measureNumber, []);
      }
      measureMap.get(fb.measureNumber).push({ idx, fb });
    });

    const measureSignatures = new Map();
    for (const [mNum, beats] of measureMap.entries()) {
      const frettedBeats = beats.filter(b => b.fb.beat.notes.some(n => !n.isRest && n.fret > 0));
      if (frettedBeats.length >= 2) {
        const sig = beats.map(b => {
          const fretted = b.fb.beat.notes.filter(n => !n.isRest && n.fret > 0);
          if (fretted.length === 0) return 'O';
          return fretted.map(n => `s${n.string}f${n.fret}`).sort().join('+');
        }).join('|');

        if (!measureSignatures.has(sig)) {
          measureSignatures.set(sig, []);
        }
        measureSignatures.get(sig).push(beats);
      }
    }

    for (const [sig, measureList] of measureSignatures.entries()) {
      if (measureList.length >= 2) {
        // Find canonical position in isolation for this recurring measure
        const firstBeats = measureList[0];
        const allNotes = firstBeats.flatMap(b => b.fb.beat.notes.filter(n => !n.isRest && n.fret > 0));
        if (allNotes.length > 0) {
          const frets = allNotes.map(n => n.fret);
          const minF = Math.min(...frets);
          const maxF = Math.max(...frets);

          let bestPos = minF;
          let bestCost = Infinity;

          for (let testP = Math.max(1, maxF - 4); testP <= Math.min(20, minF + 1); testP++) {
            let pCost = 0;
            let possible = true;
            for (const n of allNotes) {
              if (n.fret < testP - 1 || n.fret > testP + 4) {
                possible = false;
                break;
              }
              const natFinger = n.fret - testP + 1;
              if (natFinger >= 1 && natFinger <= 4) {
                pCost += (natFinger === 1 ? 0 : natFinger === 2 ? 1 : natFinger === 3 ? 2 : 4);
              } else if (n.fret === testP - 1) {
                pCost += WEIGHTS.STRETCH_INDEX;
              } else if (n.fret === testP + 4) {
                pCost += WEIGHTS.STRETCH_PINKY;
              }
            }
            if (possible && pCost < bestCost) {
              bestCost = pCost;
              bestPos = testP;
            }
          }

          measureList.forEach(beats => {
            beats.forEach(b => {
              canonicalPosMap[b.idx] = bestPos;
            });
          });
        }
      }
    }

    return canonicalPosMap;
  }

  /**
   * Pre-pass: Detect Generic Open Position Hand Shape
   * Identifies note groups containing low frets (1-3) combined with open strings across adjacent strings/beats.
   */
  function detectOpenPositionShape(flatBeats, k) {
    const currentMeasure = flatBeats[k].measureNumber;
    const measureBeats = flatBeats.filter(fb => fb.measureNumber === currentMeasure);
    const measureNotes = measureBeats.flatMap(fb => fb.beat.notes).filter(n => !n.isRest);

    if (measureNotes.length === 0) return false;

    const frettedNotes = measureNotes.filter(n => n.fret > 0);
    const hasOpenStrings = measureNotes.some(n => n.fret === 0);

    // If fretted notes are in low frets (1..3) and open strings are present
    if (frettedNotes.length > 0 && frettedNotes.every(n => n.fret <= 3) && hasOpenStrings) {
      return true;
    }
    return false;
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
        options.push({ fingers: [naturalFinger], cost: fingerPref(naturalFinger), stretchCost: 0 });
      } else if (fret === pos - 1) {
        // Index stretch back
        options.push({ fingers: [1], cost: WEIGHTS.STRETCH_INDEX + fingerPref(1), stretchCost: WEIGHTS.STRETCH_INDEX });
      } else if (fret === pos + 4) {
        // Pinky stretch forward
        options.push({ fingers: [4], cost: WEIGHTS.STRETCH_PINKY + fingerPref(4), stretchCost: WEIGHTS.STRETCH_PINKY });
      }

      // Secondary viable fingers with small penalty (adds flexibility to prevent shifts)
      for (let altFinger = 1; altFinger <= 4; altFinger++) {
        if (!options.some(o => o.fingers[0] === altFinger)) {
          const dev = Math.abs(altFinger - naturalFinger);
          if (dev <= 2) {
            options.push({ fingers: [altFinger], cost: (dev * WEIGHTS.FINGER_DEVIATION) + fingerPref(altFinger), stretchCost: 0 });
          }
        }
      }

      return options;
    }

    // Multiple fretted notes at the same beat (Chords / Double Stops)
    const results = [];
    const numNotes = frettedNotes.length;

    function searchCombinations(idx, currentFingers) {
      if (idx === numNotes) {
        let cost = 0;
        let stretchCost = 0;
        for (let i = 0; i < frettedNotes.length; i++) {
          const f_i = frettedNotes[i].fret;
          const finger_i = currentFingers[i];
          const ideal_i = f_i - pos + 1;

          if (f_i === pos - 1 && finger_i === 1) {
            cost += WEIGHTS.STRETCH_INDEX;
            stretchCost += WEIGHTS.STRETCH_INDEX;
          } else if (f_i === pos + 4 && finger_i === 4) {
            cost += WEIGHTS.STRETCH_PINKY;
            stretchCost += WEIGHTS.STRETCH_PINKY;
          } else if (ideal_i >= 1 && ideal_i <= 4) {
            cost += Math.abs(finger_i - ideal_i) * WEIGHTS.FINGER_DEVIATION;
          } else {
            cost += WEIGHTS.AWKWARD_STRETCH;
          }

          for (let j = i + 1; j < frettedNotes.length; j++) {
            const f_j = frettedNotes[j].fret;
            const finger_j = currentFingers[j];
            if (f_i !== f_j && finger_i === finger_j) return; // impossible
            if (f_i === f_j && finger_i === finger_j) {
              cost += (finger_i === 1 || finger_i === 3) ? WEIGHTS.BARRE_COST : WEIGHTS.BARRE_COST * 3;
            }
            if (f_i < f_j && finger_i > finger_j) return;
            if (f_i > f_j && finger_i < finger_j) return;
          }
        }
        results.push({ fingers: [...currentFingers], cost, stretchCost });
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
      results.push({
        fingers: frettedNotes.map((_, i) => Math.min(4, i + 1)),
        cost: WEIGHTS.AWKWARD_STRETCH,
        stretchCost: WEIGHTS.AWKWARD_STRETCH
      });
    }

    return results;
  }

  /**
   * Generate candidate (position, [finger_1, finger_2, ...]) options for a single beat
   */
  function generateBeatCandidates(beatNotes, previousPosition = null, allFrettedFretsInPiece = []) {
    const frettedNotes = beatNotes.filter(n => !n.isRest && n.fret > 0);

    // If beat has no fretted notes (only rests or open strings):
    if (frettedNotes.length === 0) {
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
        intraCost: 0,
        stretchCost: 0
      }));
    }

    const frets = frettedNotes.map(n => n.fret);
    const minFret = Math.min(...frets);
    const maxFret = Math.max(...frets);

    const minCandidatePos = Math.max(1, maxFret - 4);
    const maxCandidatePos = Math.min(20, minFret + 1);

    const candidates = [];

    for (let pos = minCandidatePos; pos <= maxCandidatePos; pos++) {
      let canReach = true;
      for (const f of frets) {
        if (f < pos - 1 || f > pos + 4) {
          canReach = false;
          break;
        }
      }
      if (!canReach) continue;

      const validAssignments = generateFrettedAssignments(frettedNotes, pos);

      for (const assignment of validAssignments) {
        let frettedIdx = 0;
        const fullFingerAssignments = beatNotes.map((n) => {
          if (n.isRest || n.fret === 0) return 0;
          return assignment.fingers[frettedIdx++];
        });

        candidates.push({
          position: pos,
          fingerAssignments: fullFingerAssignments,
          intraCost: assignment.cost,
          stretchCost: assignment.stretchCost || 0
        });
      }
    }

    if (candidates.length === 0) {
      const pos = Math.max(1, minFret);
      const fullFingerAssignments = beatNotes.map(n => (n.isRest || n.fret === 0 ? 0 : 1));
      candidates.push({
        position: pos,
        fingerAssignments: fullFingerAssignments,
        intraCost: WEIGHTS.AWKWARD_STRETCH,
        stretchCost: WEIGHTS.AWKWARD_STRETCH
      });
    }

    return candidates;
  }

  /**
   * Detailed Transition Calculation with Cost Breakdown
   */
  function calculateTransition(prevCand, currCand, prevFlatBeat, currFlatBeat) {
    const breakdown = {
      movementCost: 0,
      anchorCost: 0,
      openWindowBonus: 0,
      phraseBoundaryBonus: 0,
      midPhrasePenalty: 0,
      noteConsistencyBonus: 0,
      invertedMotionPenalty: 0,
      total: 0
    };

    const prevNotes = prevFlatBeat.beat?.notes || [];
    const currNotes = currFlatBeat.beat?.notes || [];

    const prevFretted = prevNotes.map((n, i) => ({ note: n, finger: prevCand.fingerAssignments[i] })).filter(x => !x.note.isRest && x.note.fret > 0);
    const currFretted = currNotes.map((n, i) => ({ note: n, finger: currCand.fingerAssignments[i] })).filter(x => !x.note.isRest && x.note.fret > 0);

    // 1. Position Shift Cost
    if (currCand.position !== prevCand.position) {
      const shiftDistance = Math.abs(currCand.position - prevCand.position);
      const prevHasFretted = prevFretted.length > 0;
      const currHasFretted = currFretted.length > 0;

      const isMeasureBoundary = (currFlatBeat.measureNumber !== prevFlatBeat.measureNumber) || (currFlatBeat.beat.beatNumber === 1);
      const prevIsRestOrOpen = !prevHasFretted;
      const prevIsLongNote = prevFlatBeat.beat.timing === '1/2' || prevFlatBeat.beat.timing === '1/1' || prevFlatBeat.beat.timing === '3/4';
      const isNaturalBoundary = isMeasureBoundary || prevIsRestOrOpen || prevIsLongNote;

      if (prevHasFretted && currHasFretted) {
        // Direct fretted shift
        breakdown.movementCost = WEIGHTS.POSITION_SHIFT_BASE + (shiftDistance * WEIGHTS.POSITION_SHIFT_PER_FRET);

        // Anchored shift principle:
        // When shifting to a new position up the neck (> Pos 1), landing on Finger 1 provides an ergonomic anchor.
        // In Position 1 (open position), the guitar nut anchors the hand, so fingers 1/2/3 naturally take frets 1/2/3.
        if (currCand.position > 1 && currFretted[0].finger > 1) {
          breakdown.anchorCost = (currFretted[0].finger - 1) * 16;
        }

        // Phrase / Measure boundary scoring
        if (isNaturalBoundary) {
          breakdown.phraseBoundaryBonus = WEIGHTS.BOUNDARY_SHIFT_BONUS;
        } else {
          breakdown.midPhrasePenalty = WEIGHTS.MID_PHRASE_PREEMPTIVE_SHIFT_PENALTY;
        }
      } else {
        // Open-string / rest shift window:
        // Significantly reduced shift penalty because fingers are not pressing strings.
        // Moving across open strings is cheap (base 12 + 2/fret), but never negative.
        breakdown.movementCost = WEIGHTS.OPEN_WINDOW_SHIFT_BASE + (shiftDistance * WEIGHTS.OPEN_WINDOW_SHIFT_PER_FRET);
        breakdown.openWindowBonus = 0;
      }
    }

    // 2. Note Consistency & Melodic Phrasing
    if (prevFretted.length > 0 && currFretted.length > 0) {
      for (const p of prevFretted) {
        for (const c of currFretted) {
          // Same string & same fret
          if (p.note.string === c.note.string && p.note.fret === c.note.fret) {
            if (p.finger === c.finger) {
              breakdown.noteConsistencyBonus += WEIGHTS.CONSECUTIVE_NOTE_CONSISTENCY;
            } else {
              breakdown.noteConsistencyBonus += WEIGHTS.FINGER_DEVIATION;
            }
          }

          // Inverted finger motion on same string
          if (p.note.string === c.note.string) {
            if (p.note.fret < c.note.fret && p.finger > c.finger && currCand.position === prevCand.position) {
              breakdown.invertedMotionPenalty += WEIGHTS.INVERTED_FINGER_MOTION;
            } else if (p.note.fret > c.note.fret && p.finger < c.finger && currCand.position === prevCand.position) {
              breakdown.invertedMotionPenalty += WEIGHTS.INVERTED_FINGER_MOTION;
            }
          }
        }
      }
    }

    breakdown.total = breakdown.movementCost + breakdown.anchorCost + breakdown.openWindowBonus +
                      breakdown.phraseBoundaryBonus + breakdown.midPhrasePenalty +
                      breakdown.noteConsistencyBonus + breakdown.invertedMotionPenalty;

    return breakdown;
  }

  /**
   * Transition cost between beat (k-1) and beat (k) - Backward compatible
   */
  function calculateTransitionCost(prevCand, currCand, prevParam, currParam) {
    const prevFlatBeat = Array.isArray(prevParam) 
      ? { measureNumber: 1, beat: { timing: '1/4', notes: prevParam } } 
      : (prevParam && prevParam.beat ? prevParam : { measureNumber: 1, beat: { timing: '1/4', notes: [] } });
    const currFlatBeat = Array.isArray(currParam) 
      ? { measureNumber: 1, beat: { timing: '1/4', notes: currParam } } 
      : (currParam && currParam.beat ? currParam : { measureNumber: 1, beat: { timing: '1/4', notes: [] } });

    const breakdown = calculateTransition(prevCand, currCand, prevFlatBeat, currFlatBeat);
    return breakdown.total;
  }

  /**
   * Main Engine Entry Point:
   * Analyzes normalized tab data and attaches left-hand fingerings + cost breakdowns.
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

    // Step 1: Pre-compute candidate states, recurring motifs, and open position shapes
    const allFrettedNotes = flatBeats.flatMap(fb => fb.beat.notes.filter(n => !n.isRest && n.fret > 0));
    const allFrettedFrets = Array.from(new Set(allFrettedNotes.map(n => n.fret)));
    const initialPos = allFrettedNotes.length > 0 ? allFrettedNotes[0].fret : 1;

    const motifCanonicalPos = detectMelodicMotifs(flatBeats);
    const isOpenShapeMeasure = flatBeats.map((_, k) => detectOpenPositionShape(flatBeats, k));

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
    const dp = [];

    // Initialize beat 0
    dp[0] = beatCandidates[0].map(c => {
      let intraCost = c.intraCost;
      let shapeCost = 0;
      let repeatedPatternBonus = 0;

      if (motifCanonicalPos[0] !== null && c.position === motifCanonicalPos[0]) {
        repeatedPatternBonus = WEIGHTS.REPEATED_PATTERN_BONUS;
      }
      if (isOpenShapeMeasure[0]) {
        if (c.position === 1) shapeCost = WEIGHTS.OPEN_POSITION_SHAPE_BONUS;
        else if (c.position >= 3 && c.stretchCost > 0) shapeCost = WEIGHTS.LOW_FRET_STRETCH_AVOIDANCE;
      }

      const total = intraCost + shapeCost + repeatedPatternBonus;
      return {
        cost: total,
        prevIndex: -1,
        breakdown: {
          position: c.position,
          movementCost: 0,
          anchorCost: 0,
          openWindowBonus: 0,
          phraseBoundaryBonus: 0,
          midPhrasePenalty: 0,
          repeatedPatternBonus,
          shapeCost,
          stretchCost: c.stretchCost || 0,
          intraCost,
          total
        }
      };
    });

    for (let k = 1; k < flatBeats.length; k++) {
      const prevCands = beatCandidates[k - 1];
      const currCands = beatCandidates[k];
      const prevFlat = flatBeats[k - 1];
      const currFlat = flatBeats[k];

      dp[k] = [];

      for (let cIdx = 0; cIdx < currCands.length; cIdx++) {
        const currCand = currCands[cIdx];
        let bestCost = Infinity;
        let bestPrevIndex = -1;
        let bestBreakdown = null;

        let shapeCost = 0;
        let repeatedPatternBonus = 0;

        if (motifCanonicalPos[k] !== null && currCand.position === motifCanonicalPos[k]) {
          repeatedPatternBonus = WEIGHTS.REPEATED_PATTERN_BONUS;
        }
        if (isOpenShapeMeasure[k]) {
          if (currCand.position === 1) shapeCost = WEIGHTS.OPEN_POSITION_SHAPE_BONUS;
          else if (currCand.position >= 3 && currCand.stretchCost > 0) shapeCost = WEIGHTS.LOW_FRET_STRETCH_AVOIDANCE;
        }

        for (let pIdx = 0; pIdx < prevCands.length; pIdx++) {
          const prevCand = prevCands[pIdx];
          const trans = calculateTransition(prevCand, currCand, prevFlat, currFlat);
          const totalTransitionAndCand = trans.total + currCand.intraCost + shapeCost + repeatedPatternBonus;
          const totalCost = dp[k - 1][pIdx].cost + totalTransitionAndCand;

          if (totalCost < bestCost) {
            bestCost = totalCost;
            bestPrevIndex = pIdx;
            bestBreakdown = {
              position: currCand.position,
              movementCost: trans.movementCost,
              anchorCost: trans.anchorCost,
              openWindowBonus: trans.openWindowBonus,
              phraseBoundaryBonus: trans.phraseBoundaryBonus,
              midPhrasePenalty: trans.midPhrasePenalty,
              repeatedPatternBonus,
              shapeCost,
              stretchCost: currCand.stretchCost || 0,
              intraCost: currCand.intraCost,
              total: totalTransitionAndCand
            };
          }
        }

        dp[k][cIdx] = {
          cost: bestCost,
          prevIndex: bestPrevIndex,
          breakdown: bestBreakdown
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
      optimalPath[k] = {
        ...beatCandidates[k][currBestIndex],
        costBreakdown: dp[k][currBestIndex]?.breakdown
      };
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
            costBreakdown: chosen.costBreakdown,
            pitch,
            isRest: !!n.isRest,
            isTie: !!n.isTie,
            isSlide: !!n.isSlide,
            source: n.source || null
          };
        });

        return {
          eventIndex: b.eventIndex || b.beatNumber,
          beatNumber: b.beatNumber,
          timing: b.timing,
          timeOffset: b.timeOffset,
          sources: b.sources || [],
          recommendedPosition: currentPos,
          isPositionShift: isShift,
          costBreakdown: chosen.costBreakdown,
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
    calculateTransition,
    detectMelodicMotifs,
    detectOpenPositionShape,
    WEIGHTS
  };
});
