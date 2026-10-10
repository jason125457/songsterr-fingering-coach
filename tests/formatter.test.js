const assert = require('assert');
const FingeringFormatter = require('../src/formatter');

console.log('🧪 Running Formatter Unit Tests...');

// Test 1: Standard measure
const standardMeasure = {
  measureNumber: 3,
  recommendedPosition: 7,
  isPositionShift: false,
  beats: [
    { notes: [{ fret: 7, isRest: false }] },
    { notes: [{ fret: 9, isRest: false }] }
  ]
};
const res1 = FingeringFormatter.formatMeasureSummary(standardMeasure);
assert.strictEqual(res1, 'Measure 3: Position 7, Shift: false, Notes: 2', 'Standard measure mismatch');
console.log('  ✓ Test 1 Passed: Standard measure formatted correctly');

// Test 2: Measure with Marker
const markerMeasure = {
  measureNumber: 5,
  marker: 'Solo',
  recommendedPosition: 12,
  isPositionShift: true,
  beats: [
    { notes: [{ fret: 12, isRest: false }] }
  ]
};
const res2 = FingeringFormatter.formatMeasureSummary(markerMeasure);
assert.strictEqual(res2, 'Measure 5 (Solo): Position 12, Shift: true, Notes: 1', 'Marker measure mismatch');
console.log('  ✓ Test 2 Passed: Measure with marker formatted correctly');

// Test 3: Rest / Empty measure
const restMeasure = {
  measureNumber: 1,
  recommendedPosition: 0,
  isPositionShift: false,
  beats: [
    { notes: [{ fret: 0, isRest: true }] }
  ]
};
const res3 = FingeringFormatter.formatMeasureSummary(restMeasure);
assert.strictEqual(res3, 'Measure 1: Position 0, Shift: false, Notes: 0', 'Rest measure mismatch');
console.log('  ✓ Test 3 Passed: Rest measure formatted correctly');

// Test 4: Null / invalid safety
assert.strictEqual(FingeringFormatter.formatMeasureSummary(null), '', 'Null input should return empty string');
assert.strictEqual(FingeringFormatter.formatMeasureSummary(undefined), '', 'Undefined input should return empty string');
const corruptedMeasure = {
  measureNumber: 2,
  recommendedPosition: 5,
  isPositionShift: false,
  beats: [null, { notes: null }, { notes: [null, { fret: 5, isRest: false }] }]
};
const resCorrupted = FingeringFormatter.formatMeasureSummary(corruptedMeasure);
assert.strictEqual(resCorrupted, 'Measure 2: Position 5, Shift: false, Notes: 1', 'Corrupted beat elements should be gracefully skipped');
console.log('  ✓ Test 4 Passed: Safe handling of null/undefined inputs and corrupted beat arrays');
// Test 5: Position badge tests
assert.strictEqual(FingeringFormatter.formatPositionBadge(7), 'Pos 7', 'Fretted position should format as Pos X');
assert.strictEqual(FingeringFormatter.formatPositionBadge(0), 'Open', 'Position 0 should format as Open');
assert.strictEqual(FingeringFormatter.formatPositionBadge(null), '', 'Null position should return empty string');
assert.strictEqual(FingeringFormatter.formatPositionBadge('invalid'), '', 'Invalid position type should return empty string');
console.log('  ✓ Test 5 Passed: formatPositionBadge formatted badges and edge cases correctly');

console.log('🏆 All Formatter unit tests passed successfully!');