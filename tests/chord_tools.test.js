/**
 * chord_tools.test.js
 *
 * 1. Electric-guitar chord naming: power chords, inverted power chords, open chords, 7ths,
 *    slash bass; no name for single notes / octaves / unknown sets
 * 2. Names on a real song match hand-checked spellings
 * 3. "Next hand shape": skips repeats, rests and open-string-only beats; counts beats across
 *    measures; null at the end of the song
 */

const assert = require('assert');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const ChordTools = require('../src/chord_tools');

console.log('\n🎸 ====================================================');
console.log('🎸 CHORD NAMES & NEXT HAND SHAPE TESTS');
console.log('🎸 ====================================================\n');

const T = [64, 59, 55, 50, 45, 40]; // string 0 = high E ... 5 = low E
const midi = (string, fret) => T[string] + fret;
const name = (pairs) => ChordTools.nameChord(pairs.map(([s, f]) => midi(s, f)))?.name ?? null;

// ---------------------------------------------------------------
console.log('🧪 Test 1: Chord naming...');
{
  const cases = [
    ['E5 power chord (0-2-2)', [[5, 0], [4, 2], [3, 2]], 'E5'],
    ['A5 two-note power chord', [[4, 0], [3, 2]], 'A5'],
    ['G5 at 3rd fret', [[5, 3], [4, 5], [3, 5]], 'G5'],
    ['inverted power chord D5/A', [[4, 0], [3, 0]], 'D5/A'],
    ['open C', [[4, 3], [3, 2], [2, 0], [1, 1], [0, 0]], 'C'],
    ['open Am', [[4, 0], [3, 2], [2, 2], [1, 1], [0, 0]], 'Am'],
    ['open G7', [[5, 3], [4, 2], [3, 0], [2, 0], [1, 0], [0, 1]], 'G7'],
    ['F barre', [[5, 1], [4, 3], [3, 3], [2, 2], [1, 1], [0, 1]], 'F'],
    ['Cmaj7 (song m1)', [[1, 5], [2, 4], [3, 5], [4, 3]], 'Cmaj7'],
    ['Dsus2', [[3, 0], [2, 2], [1, 3], [0, 0]], 'Dsus2'],
    ['C/G slash bass', [[5, 3], [4, 3], [3, 2], [2, 0], [1, 1], [0, 0]], 'C/G']
  ];
  cases.forEach(([label, pairs, expected]) => {
    assert.strictEqual(name(pairs), expected, `${label}: expected ${expected}, got ${name(pairs)}`);
  });
  assert.strictEqual(name([[0, 5]]), null, 'single note -> no name');
  assert.strictEqual(name([[5, 0], [3, 2], [0, 0]]), null, 'octaves only -> no name');
  assert.strictEqual(name([[0, 1], [0, 2]].map(([s, f], i) => [i, f])), null, 'minor second -> no guess');
  console.log(`  ✓ ${cases.length} shapes named correctly (E5, D5/A, C, Am, G7, F, Cmaj7, Dsus2, C/G); no guesses`);
}

// ---------------------------------------------------------------
console.log('🧪 Test 2: Real song names...');
const result = ChordTools.annotateChordNames(
  FingeringEngine.analyzeTab(TabNormalizer.normalizeSongsterrPart(require('./taiziwan_part1_raw.json'), {}))
);
{
  const at = (m) => ChordTools.dominantChordName(result.measures[m - 1].beats);
  assert.strictEqual(at(1), 'Cmaj7', 'm1 = C E G B');
  assert.strictEqual(at(3), 'Fmaj7', 'm3 = F A C E');
  assert.strictEqual(at(9), 'G', 'm9 = G B D');
  assert.strictEqual(at(51), 'Fmaj7', 'm51 open-position Fmaj7');
  console.log('  ✓ m1 Cmaj7, m3 Fmaj7, m9 G, m51 Fmaj7');
}

// ---------------------------------------------------------------
console.log('🧪 Test 3: Next hand shape...');
{
  const next = ChordTools.findNextShapeChange(result.measures, 0, 1);
  assert.strictEqual(next.measureNumber, 3, 'm2 repeats m1, so the next change is m3');
  assert.strictEqual(next.chordName, 'Fmaj7');
  assert.strictEqual(next.beatsAway, 8, 'two 4/4 measures away');

  const note = (string, fret) => ({ string, fret, isRest: false });
  const rest = { string: -1, fret: -1, isRest: true };
  const beat = (ev, notes, offset) => ({ eventIndex: ev, beatNumber: ev, notes, timeOffset: { value: offset } });
  const measures = [
    { measureNumber: 1, timeSignature: '4/4', beats: [beat(1, [note(4, 7), note(3, 9)], 0), beat(2, [rest], 0.5)] },
    { measureNumber: 2, timeSignature: '4/4', beats: [beat(1, [note(1, 0)], 0), beat(2, [note(4, 7), note(3, 9)], 0.25), beat(3, [note(4, 5), note(3, 7)], 0.5)] }
  ];
  const n = ChordTools.findNextShapeChange(measures, 0, 2); // standing on the rest
  assert.strictEqual(n.measureNumber, 2);
  assert.strictEqual(n.eventIndex, 3, 'rest, open string and the same grip are skipped');
  assert.strictEqual(n.beatsAway, 2 + 2, 'from beat 3 of m1 to beat 3 of m2 = 4 beats');
  assert.strictEqual(ChordTools.findNextShapeChange(measures, 1, 3), null, 'nothing after the last shape');
  console.log('  ✓ repeats/rests/open strings skipped, beats counted across measures, null at the end');
}

console.log('\n====================================================');
console.log('🏆 ALL CHORD TOOLS TESTS PASSED!');
console.log('====================================================\n');
