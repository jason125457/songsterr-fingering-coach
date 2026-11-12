/**
 * Regression: a chord at frets 3-5 (Cmaj7, x3545x) must show all four notes and a "3fr" label,
 * not a nut-style window that silently drops the fret-5 notes.
 */
const assert = require('assert');
const SD = require('../src/ui/shape_diagram');

const seg = {
  position: 3,
  beats: [{
    beatNumber: 1, eventIndex: 1,
    notes: [
      { string: 1, fret: 5, recommendedFinger: 4 },
      { string: 2, fret: 4, recommendedFinger: 2 },
      { string: 3, fret: 5, recommendedFinger: 3 },
      { string: 4, fret: 3, recommendedFinger: 1 }
    ]
  }]
};

[{ compact: true }, { compact: false }].forEach((opts) => {
  const shape = SD.aggregateSegmentShape(seg, null, opts);
  assert.strictEqual(shape.minFret, 3, 'window starts at fret 3');
  const svg = SD.renderSVG(seg, null, opts);
  assert.strictEqual((svg.match(/>[1-4]<\/text>/g) || []).length, 4, 'all four fingers drawn');
  assert.ok(svg.includes('3fr'), 'fret label shown');
});

// Open-position G (320003) keeps the nut view
const g = { position: 1, beats: [{ beatNumber: 1, eventIndex: 1, notes: [
  { string: 5, fret: 3, recommendedFinger: 2 }, { string: 4, fret: 2, recommendedFinger: 1 },
  { string: 3, fret: 0 }, { string: 0, fret: 3, recommendedFinger: 3 }] }] };
assert.strictEqual(SD.aggregateSegmentShape(g, null, { compact: true }).minFret, 1);

console.log('🏆 ALL SHAPE DIAGRAM WINDOW TESTS PASSED');
