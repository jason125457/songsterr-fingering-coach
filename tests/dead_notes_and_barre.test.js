/**
 * Dead (muted) strums must not count as open strings, and the engine must never
 * suggest a finger that lies across a string holding a lower fret (impossible barre).
 */
const assert = require('assert');
const TabNormalizer = require('../src/normalizer.js');
const FingeringEngine = require('../src/fingering_engine.js');
const ChordTools = require('../src/chord_tools.js');

function part(beats) {
  return { tuning: [64, 59, 55, 50, 45, 40], measures: [{ signature: [4, 4], voices: [{ beats }] }] };
}
const chord = [{ string: 1, fret: 9 }, { string: 2, fret: 8 }, { string: 3, fret: 9 }, { string: 4, fret: 7 }];
const deadChop = [1, 2, 3, 4].map(string => ({ string, fret: 0, dead: true }));

// 1. normalizer keeps the dead flag
const norm = TabNormalizer.normalizeSongsterrPart(part([
  { duration: [1, 4], notes: chord }, { duration: [1, 4], notes: deadChop }
]));
assert.ok(norm.measures[0].beats[1].notes.every(n => n.isDead), 'dead notes keep isDead');
assert.ok(norm.measures[0].beats[0].notes.every(n => !n.isDead), 'normal notes are not dead');

// 2. chord naming ignores dead strums (open B-G-D-A would read as a chord)
const res = FingeringEngine.analyzeTab(norm);
ChordTools.annotateChordNames(res);
assert.strictEqual(res.measures[0].beats[0].chordName, 'Emaj7');
assert.strictEqual(res.measures[0].beats[1].chordName, null, 'dead strum has no chord name');
assert.ok(res.measures[0].beats[1].notes.every(n => n.isDead), 'engine passes isDead through');

// 3. no ring-finger barre across a lower fret (the old 3-2-3-1 answer)
const f = res.measures[0].beats[0].notes.map(n => n.recommendedFinger);
assert.notStrictEqual(f[0], f[2], `B9 and D9 must not share a finger around G8, got ${f.join('')}`);

// 4. a barre with an open string inside it is rejected
const open = FingeringEngine.generateBeatCandidates([
  { string: 1, fret: 5 }, { string: 2, fret: 0 }, { string: 3, fret: 5 }
]);
open.forEach(c => assert.notStrictEqual(c.fingerAssignments[0], c.fingerAssignments[2], 'open string inside a barre'));

// 5. a proper index barre is still allowed
const barre = FingeringEngine.generateBeatCandidates([
  { string: 3, fret: 5 }, { string: 4, fret: 5 }, { string: 5, fret: 5 }
]);
assert.ok(barre.some(c => c.fingerAssignments.every(x => x === 1)), 'index barre across 3 strings stays valid');

console.log('✅ dead notes + barre feasibility tests passed');
