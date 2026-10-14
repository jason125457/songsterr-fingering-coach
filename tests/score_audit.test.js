const assert = require('assert');
const TabNormalizer = require('../src/normalizer.js');
const ScoreAudit = require('../src/score_audit.js');

const chord = (s) => s.map(([string, fret]) => ({ string, fret }));
const emaj7 = chord([[1, 9], [2, 8], [3, 9], [4, 7]]);
const key = { accidentalCount: 4, mode: 'major', transposeAs: '#' };
const meas = (beats, extra = {}) => ({ signature: [4, 4], keySignature: key, voices: [{ beats }], ...extra });
const q = (notes) => ({ duration: [1, 4], notes });
const part = (measures) => ({ tuning: [64, 59, 55, 50, 45, 40], measures });

// key signature is carried through the normalizer
const clean = TabNormalizer.normalizeSongsterrPart(part([meas([q(emaj7), q(emaj7), q(emaj7), q(emaj7)])]));
assert.deepStrictEqual(clean.measures[0].keySignature, { accidentals: 4, mode: 'major' });
assert.strictEqual(ScoreAudit.auditTrack(clean).summary.flagged, 0, 'a clean measure is not flagged');

// rhythm: three quarter notes in 4/4
const short = TabNormalizer.normalizeSongsterrPart(part([meas([q(emaj7), q(emaj7), q(emaj7)])]));
assert.strictEqual(ScoreAudit.auditTrack(short).measures[0].issues[0].type, 'rhythm');

// odd one out: identical neighbours, middle measure differs by one note
const bent = chord([[1, 9], [2, 9], [3, 9], [4, 7]]);
const trio = TabNormalizer.normalizeSongsterrPart(part([
  meas([q(emaj7), q(emaj7), q(emaj7), q(emaj7)]),
  meas([q(bent), q(emaj7), q(emaj7), q(emaj7)]),
  meas([q(emaj7), q(emaj7), q(emaj7), q(emaj7)])
]));
const odd = ScoreAudit.auditTrack(trio).measures;
assert.strictEqual(odd.length, 1);
assert.strictEqual(odd[0].measureNumber, 2);
assert.strictEqual(odd[0].issues[0].type, 'odd-one-out');

// out of key: a bar of C natural in E major
const cs = chord([[1, 1], [2, 1], [3, 2]]);
const off = TabNormalizer.normalizeSongsterrPart(part([meas([q(cs), q(cs), q(cs), q(cs)])]));
assert.ok(ScoreAudit.auditTrack(off).measures[0].issues.some(i => i.type === 'out-of-key'));

console.log('✅ score audit tests passed');
