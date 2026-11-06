/**
 * chord_tools.js
 *
 * Pure, DOM-free helpers built on top of the FingeringEngine output:
 * 1. Chord naming tuned for electric guitar: power chords (E5), inverted power chords (D5/A),
 *    triads, sevenths, sus and add9 shapes, with slash bass. Only exact pitch-class matches are
 *    named; ambiguous note sets (single notes, plain intervals) get no name instead of a guess.
 * 2. "Next hand shape" lookup for practice: the next beat whose fretted grip differs from the one
 *    currently held, with the distance in beats so the player can prepare in time.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChordTools = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Spellings guitarists commonly use (F#, but Bb / Eb / Ab)
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];

  // Interval sets above the root (pitch classes) -> chord suffix. Order = preference on ties.
  const CHORD_TEMPLATES = [
    { intervals: [0, 7], suffix: '5' },          // power chord (root + fifth, octaves allowed)
    { intervals: [0, 4, 7], suffix: '' },
    { intervals: [0, 3, 7], suffix: 'm' },
    { intervals: [0, 5, 7], suffix: 'sus4' },
    { intervals: [0, 2, 7], suffix: 'sus2' },
    { intervals: [0, 4, 7, 10], suffix: '7' },
    { intervals: [0, 3, 7, 10], suffix: 'm7' },
    { intervals: [0, 4, 7, 11], suffix: 'maj7' },
    { intervals: [0, 4, 10], suffix: '7' },      // shell voicing without the fifth
    { intervals: [0, 3, 10], suffix: 'm7' },
    { intervals: [0, 4, 11], suffix: 'maj7' },
    { intervals: [0, 2, 4, 7], suffix: 'add9' },
    { intervals: [0, 2, 3, 7], suffix: 'm(add9)' },
    { intervals: [0, 5, 7, 10], suffix: '7sus4' },
    { intervals: [0, 2, 4, 7, 10], suffix: '9' },
    { intervals: [0, 4, 7, 9], suffix: '6' },
    { intervals: [0, 3, 7, 9], suffix: 'm6' },
    { intervals: [0, 3, 6], suffix: 'dim' },
    { intervals: [0, 3, 6, 10], suffix: 'm7b5' },
    { intervals: [0, 3, 6, 9], suffix: 'dim7' },
    { intervals: [0, 4, 8], suffix: 'aug' }
  ];

  const templateIndex = new Map(CHORD_TEMPLATES.map((t, i) => [t.intervals.join(','), { suffix: t.suffix, rank: i }]));

  const isFretted = (n) => n && !n.isRest && typeof n.fret === 'number' && n.fret > 0;
  const isSounding = (n) => n && !n.isRest && typeof n.fret === 'number' && n.fret >= 0 && typeof n.string === 'number' && n.string >= 0;

  /**
   * Name the chord formed by MIDI pitches, or null when the set is not a recognised chord.
   * @param {number[]} midiNotes
   * @returns {null | {name: string, root: string, suffix: string, bass: string|null}}
   */
  function nameChord(midiNotes) {
    const notes = (midiNotes || []).filter(n => typeof n === 'number' && !isNaN(n));
    if (notes.length < 2) return null;
    const bassMidi = Math.min(...notes);
    const bassPc = ((bassMidi % 12) + 12) % 12;
    const pcs = Array.from(new Set(notes.map(n => ((n % 12) + 12) % 12)));
    if (pcs.length < 2) return null; // octaves / unisons: no chord

    let best = null;
    pcs.forEach((rootPc) => {
      const intervals = pcs.map(pc => (pc - rootPc + 12) % 12).sort((a, b) => a - b).join(',');
      const match = templateIndex.get(intervals);
      if (!match) return;
      // Prefer the reading whose root is in the bass, then the simpler template
      const score = (rootPc === bassPc ? 0 : 100) + match.rank;
      if (!best || score < best.score) best = { rootPc, suffix: match.suffix, score };
    });
    if (!best) return null;

    const rootName = NOTE_NAMES[best.rootPc];
    const bass = best.rootPc === bassPc ? null : NOTE_NAMES[bassPc];
    return { name: rootName + best.suffix + (bass ? '/' + bass : ''), root: rootName, suffix: best.suffix, bass };
  }

  /**
   * Name the chord sounding on one beat (fretted and open strings), using the track tuning
   */
  function nameBeatChord(beat, tuning = DEFAULT_TUNING) {
    if (!beat || !Array.isArray(beat.notes)) return null;
    const tun = Array.isArray(tuning) && tuning.length ? tuning : DEFAULT_TUNING;
    const midi = beat.notes.filter(isSounding).map(n => tun[n.string] + n.fret).filter(m => typeof m === 'number' && !isNaN(m));
    return nameChord(midi);
  }

  /**
   * Annotate every beat of a FingeringResult with `chordName` (string or null). Idempotent.
   */
  function annotateChordNames(fingeringResult) {
    if (!fingeringResult || !Array.isArray(fingeringResult.measures)) return fingeringResult;
    const tuning = fingeringResult.track?.tuning || fingeringResult.track?.tuningMidi || DEFAULT_TUNING;
    fingeringResult.measures.forEach((m) => {
      (m.beats || []).forEach((b) => {
        const chord = nameBeatChord(b, tuning);
        b.chordName = chord ? chord.name : null;
      });
    });
    return fingeringResult;
  }

  /**
   * Most frequent chord name among beats (first occurrence wins ties); null when none is named
   */
  function dominantChordName(beats) {
    const counts = new Map();
    (beats || []).forEach((b) => {
      if (b && b.chordName) counts.set(b.chordName, (counts.get(b.chordName) || 0) + 1);
    });
    let best = null;
    counts.forEach((count, name) => { if (!best || count > best.count) best = { name, count }; });
    return best ? best.name : null;
  }

  /**
   * Identity of the fretted hand shape on a beat ("string:fret" pairs); '' when nothing is fretted.
   * Open strings and fingers are ignored: they do not change what the fretting hand must prepare.
   */
  function gripKey(beat) {
    if (!beat || !Array.isArray(beat.notes)) return '';
    return Array.from(new Set(beat.notes.filter(isFretted).map(n => n.string + ':' + n.fret))).sort().join(',');
  }

  function measureLength(measure) {
    const parts = String(measure?.timeSignature || '4/4').split('/').map(Number);
    return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 1;
  }

  function beatUnit(measure) {
    const parts = String(measure?.timeSignature || '4/4').split('/').map(Number);
    return parts.length === 2 && parts[1] > 0 ? 1 / parts[1] : 0.25;
  }

  const startCache = new WeakMap();
  function measureStarts(measures) {
    if (startCache.has(measures)) return startCache.get(measures);
    const starts = [];
    let acc = 0;
    measures.forEach((m) => { starts.push(acc); acc += measureLength(m); });
    startCache.set(measures, starts);
    return starts;
  }

  function beatOffset(beat, measure) {
    if (typeof beat?.timeOffset?.value === 'number') return beat.timeOffset.value;
    const idx = (measure?.beats || []).indexOf(beat);
    return idx > 0 ? (idx / measure.beats.length) * measureLength(measure) : 0;
  }

  /**
   * Find the next beat whose fretted hand shape differs from the one currently held.
   * The held shape is the last fretted beat at or before (measureIndex, eventIndex), so rests in
   * between do not count as a change; beats with only open strings or rests are skipped.
   *
   * @param {Object[]} measures FingeringResult measures
   * @param {number} measureIndex 0-based current measure
   * @param {number} eventIndex 1-based current event in that measure
   * @returns {null | {measureIndex, measureNumber, eventIndex, beat, measure, chordName, beatsAway, measuresAway}}
   */
  function findNextShapeChange(measures, measureIndex, eventIndex) {
    if (!Array.isArray(measures) || !measures[measureIndex]) return null;
    const evOf = (b) => b.eventIndex || b.beatNumber;
    const current = measures[measureIndex];
    const currentPos = Math.max(0, current.beats.findIndex(b => evOf(b) === eventIndex));

    // Shape currently held: walk back to the last fretted beat
    let heldKey = '';
    for (let mi = measureIndex; mi >= 0 && !heldKey; mi--) {
      const beats = measures[mi].beats || [];
      for (let bi = mi === measureIndex ? currentPos : beats.length - 1; bi >= 0; bi--) {
        const key = gripKey(beats[bi]);
        if (key) { heldKey = key; break; }
      }
    }

    for (let mi = measureIndex; mi < measures.length; mi++) {
      const m = measures[mi];
      const beats = m.beats || [];
      for (let bi = mi === measureIndex ? currentPos + 1 : 0; bi < beats.length; bi++) {
        const key = gripKey(beats[bi]);
        if (!key || key === heldKey) continue;
        const starts = measureStarts(measures);
        const from = starts[measureIndex] + beatOffset(current.beats[currentPos], current);
        const to = starts[mi] + beatOffset(beats[bi], m);
        return {
          measureIndex: mi,
          measureNumber: m.measureNumber || mi + 1,
          eventIndex: evOf(beats[bi]),
          beat: beats[bi],
          measure: m,
          chordName: beats[bi].chordName !== undefined ? beats[bi].chordName : null,
          beatsAway: Math.max(0, (to - from) / beatUnit(current)),
          measuresAway: mi - measureIndex
        };
      }
    }
    return null;
  }

  return {
    nameChord,
    nameBeatChord,
    annotateChordNames,
    dominantChordName,
    gripKey,
    findNextShapeChange,
    NOTE_NAMES
  };
});
