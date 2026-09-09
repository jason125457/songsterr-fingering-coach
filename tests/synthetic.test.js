/**
 * synthetic.test.js
 * 
 * Verifies core left-hand fingering algorithms against 5 critical synthetic test cases:
 * 1. 7 → 8 → 9 → 10: Maintains a single reasonable position (Pos 7, fingers 1-2-3-4).
 * 2. 7 → 9 → 8 → 7 | 8 → 9 → 10: Cross-measure analysis prevents unnecessary position shift.
 * 3. Open strings + fretted notes: Open strings get finger 0 and do not disrupt hand position.
 * 4. Simultaneous notes (same beat double stops): Enforces physically possible hand shapes.
 * 5. Obvious position shift needed: 3 → 5 → 10 → 12 correctly triggers isPositionShift.
 */

const assert = require('assert');
const { createSyntheticData } = require('../src/normalizer');
const { analyzeTab } = require('../src/fingering_engine');
const { formatConsoleDebug } = require('../src/formatter');

function runSyntheticTests() {
  console.log('🧪 Running Synthetic Fingering Engine Tests...\n');

  // Case 1: 7 → 8 → 9 → 10
  console.log('--- Test 1: 7 → 8 → 9 → 10 (Single Position Span) ---');
  const tab1 = createSyntheticData([
    {
      measureNumber: 1,
      beats: [
        { notes: [{ fret: 7 }] },
        { notes: [{ fret: 8 }] },
        { notes: [{ fret: 9 }] },
        { notes: [{ fret: 10 }] }
      ]
    }
  ]);
  const res1 = analyzeTab(tab1);
  const m1 = res1.measures[0];
  console.log(`Measure 1 Position: ${m1.recommendedPosition}`);
  const fingers1 = m1.beats.map(b => b.notes[0].recommendedFinger);
  console.log(`Fingers: ${fingers1.join(' → ')}`);

  assert.strictEqual(m1.recommendedPosition, 7, 'Position should be 7');
  assert.deepStrictEqual(fingers1, [1, 2, 3, 4], 'Fingers should naturally be 1, 2, 3, 4');
  console.log('✅ Test 1 Passed: Maintained Position 7 with natural fingers 1-2-3-4.\n');


  // Case 2: Cross-measure: Measure 1: 7 → 9 → 8 → 7 | Measure 2: 8 → 9 → 10
  console.log('--- Test 2: 7 → 9 → 8 → 7 | 8 → 9 → 10 (Cross-Measure Stability) ---');
  const tab2 = createSyntheticData([
    {
      measureNumber: 1,
      beats: [
        { notes: [{ fret: 7 }] },
        { notes: [{ fret: 9 }] },
        { notes: [{ fret: 8 }] },
        { notes: [{ fret: 7 }] }
      ]
    },
    {
      measureNumber: 2,
      beats: [
        { notes: [{ fret: 8 }] },
        { notes: [{ fret: 9 }] },
        { notes: [{ fret: 10 }] }
      ]
    }
  ]);
  const res2 = analyzeTab(tab2);
  const c2_m1 = res2.measures[0];
  const c2_m2 = res2.measures[1];

  console.log(`Measure 1 Position: ${c2_m1.recommendedPosition}`);
  console.log(`Measure 2 Position: ${c2_m2.recommendedPosition}`);
  console.log(`Measure 2 isPositionShift: ${c2_m2.isPositionShift}`);

  const m1Fingers = c2_m1.beats.map(b => b.notes[0].recommendedFinger);
  const m2Fingers = c2_m2.beats.map(b => b.notes[0].recommendedFinger);
  console.log(`M1 Fingers (7→9→8→7): ${m1Fingers.join(' → ')}`);
  console.log(`M2 Fingers (8→9→10):  ${m2Fingers.join(' → ')}`);

  assert.strictEqual(c2_m1.recommendedPosition, 7, 'Measure 1 position should be 7');
  assert.strictEqual(c2_m2.recommendedPosition, 7, 'Measure 2 position should STAY 7 (no shift to 8)');
  assert.strictEqual(c2_m2.isPositionShift, false, 'Measure 2 should NOT trigger a position shift');
  assert.deepStrictEqual(m1Fingers, [1, 3, 2, 1], 'M1 fingers should be 1-3-2-1');
  assert.deepStrictEqual(m2Fingers, [2, 3, 4], 'M2 fingers should be 2-3-4 in Position 7');
  console.log('✅ Test 2 Passed: No unnecessary position shift across measures (stayed in Pos 7).\n');


  // Case 3: Open strings + fretted notes: 0 → 7 → 0 → 8
  console.log('--- Test 3: Open Strings + Fretted Notes ---');
  const tab3 = createSyntheticData([
    {
      measureNumber: 1,
      beats: [
        { notes: [{ fret: 0 }] }, // Open string
        { notes: [{ fret: 7 }] },
        { notes: [{ fret: 0 }] }, // Open string
        { notes: [{ fret: 8 }] }
      ]
    }
  ]);
  const res3 = analyzeTab(tab3);
  const m3 = res3.measures[0];
  const fingers3 = m3.beats.map(b => b.notes[0].recommendedFinger);
  console.log(`Beats: ${m3.beats.map(b => `Fret ${b.notes[0].fret} → Finger ${b.notes[0].recommendedFinger}`).join(', ')}`);

  assert.strictEqual(fingers3[0], 0, 'Open string note 0 should have finger 0');
  assert.strictEqual(fingers3[2], 0, 'Open string note 2 should have finger 0');
  assert.strictEqual(m3.recommendedPosition, 7, 'Position should remain anchored at 7');
  assert.strictEqual(fingers3[1], 1, 'Fret 7 in Position 7 should be Finger 1');
  assert.strictEqual(fingers3[3], 2, 'Fret 8 in Position 7 should be Finger 2');
  console.log('✅ Test 3 Passed: Open strings have finger 0 and preserve position anchor.\n');


  // Case 4: Simultaneous notes on the same beat (Double Stops / Chords)
  console.log('--- Test 4: Simultaneous Notes (Same Beat Double Stop) ---');
  const tab4 = createSyntheticData([
    {
      measureNumber: 1,
      beats: [
        // Two notes pressed together: String 3 Fret 5 + String 4 Fret 5 (Smoke on the Water style)
        {
          notes: [
            { string: 3, fret: 5 },
            { string: 4, fret: 5 }
          ]
        },
        // Two notes pressed together: String 3 Fret 5 + String 2 Fret 7
        {
          notes: [
            { string: 3, fret: 5 },
            { string: 2, fret: 7 }
          ]
        }
      ]
    }
  ]);
  const res4 = analyzeTab(tab4);
  const b1Notes = res4.measures[0].beats[0].notes;
  const b2Notes = res4.measures[0].beats[1].notes;

  console.log(`Beat 1 simultaneous fingers: [${b1Notes.map(n => n.recommendedFinger).join(', ')}]`);
  console.log(`Beat 2 simultaneous fingers: [${b2Notes.map(n => n.recommendedFinger).join(', ')}]`);

  // Beat 1 (fret 5 + fret 5): can be barre (1, 1) or (1, 2)
  assert.ok(b1Notes.every(n => n.recommendedFinger >= 1 && n.recommendedFinger <= 4), 'All fingers must be 1..4');
  // Beat 2 (fret 5 + fret 7): lower fret must use lower finger than higher fret!
  assert.ok(b2Notes[0].recommendedFinger < b2Notes[1].recommendedFinger, 'Fret 5 must use lower finger than Fret 7');
  console.log('✅ Test 4 Passed: Simultaneous notes generated physically plausible hand shapes.\n');


  // Case 5: Obvious Position Shift: 3 → 5 → 10 → 12
  console.log('--- Test 5: Obvious Position Shift (3 → 5 → 10 → 12) ---');
  const tab5 = createSyntheticData([
    {
      measureNumber: 1,
      beats: [
        { notes: [{ fret: 3 }] },
        { notes: [{ fret: 5 }] },
        { notes: [{ fret: 10 }] },
        { notes: [{ fret: 12 }] }
      ]
    }
  ]);
  const res5 = analyzeTab(tab5);
  const m5Beats = res5.measures[0].beats;
  console.log(`Beat 1 (Fret 3): Pos ${m5Beats[0].recommendedPosition}, Shift: ${m5Beats[0].isPositionShift}`);
  console.log(`Beat 2 (Fret 5): Pos ${m5Beats[1].recommendedPosition}, Shift: ${m5Beats[1].isPositionShift}`);
  console.log(`Beat 3 (Fret 10): Pos ${m5Beats[2].recommendedPosition}, Shift: ${m5Beats[2].isPositionShift}`);
  console.log(`Beat 4 (Fret 12): Pos ${m5Beats[3].recommendedPosition}, Shift: ${m5Beats[3].isPositionShift}`);

  assert.ok(m5Beats[0].recommendedPosition <= 3, 'First note should be in low position (<= 3)');
  assert.strictEqual(m5Beats[2].isPositionShift, true, 'Moving to fret 10 MUST trigger isPositionShift = true');
  assert.ok(m5Beats[2].recommendedPosition >= 9 && m5Beats[2].recommendedPosition <= 10, 'Fret 10 should be in high position (9-10)');
  assert.strictEqual(m5Beats[3].isPositionShift, false, 'Fret 12 should stay in high position without shifting again');
  console.log('✅ Test 5 Passed: Successfully detected and applied necessary position shift (Pos 3 → Pos 10).\n');

  console.log('🎉 ALL 5 SYNTHETIC TESTS PASSED!\n');
}

if (require.main === module) {
  runSyntheticTests();
}

module.exports = { runSyntheticTests };
