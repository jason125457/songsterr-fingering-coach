/**
 * tests/coach_panel_rebalance.test.js
 * 
 * Phase 3.4.1 Acceptance Tests:
 * - Hand Frame Diagram SVG (structural ghosted notes + active note highlight)
 * - CoachPanel Dual-Layer Architecture (.sfc-overview-card + .sfc-now-playing-card)
 * - Sequence Measure: Hand Frame + Step Strip / Finger Flow
 * - Shape Measure: Complete Chord Grip diagram
 * - Rest Event handling in Now Playing card without blanking the Overview card
 * - Glanceable Inline Overlays (.sfc-overlay-glance-seq)
 */

const assert = require('assert');
const ShapeDiagram = require('../src/ui/shape_diagram');
const MeasureOverlay = require('../src/ui/measure_overlay');

// Mock browser document/window for testing DOM components in Node
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        innerHTML: '',
        children: [],
        dataset: {},
        setAttribute: (k, v) => { el[k] = v; },
        getAttribute: (k) => el[k],
        classList: {
          classes: new Set(),
          add: (c) => el.classList.classes.add(c),
          remove: (c) => el.classList.classes.delete(c),
          contains: (c) => el.classList.classes.has(c)
        },
        appendChild: (child) => el.children.push(child),
        querySelectorAll: (sel) => [],
        querySelector: (sel) => null,
        addEventListener: () => {},
        remove: () => {}
      };
      return el;
    },
    getElementById: (id) => null
  };
  global.document.body = global.document.createElement('body');
}

const CoachPanel = require('../src/ui/coach_panel');

console.log('\n🎸 ====================================================');
console.log('🎸 PHASE 3.4.1: COACHPANEL UX REBALANCE TESTS');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// Test 1: Hand Frame Overview Diagram SVG
// ----------------------------------------------------
console.log('🧪 Test 1: Hand Frame Overview Diagram SVG...');

const seqMeasureData = {
  measureNumber: 2,
  recommendedPosition: 9,
  beats: [
    {
      eventIndex: 1,
      beatNumber: 1,
      timing: '1/8',
      recommendedPosition: 9,
      notes: [{ string: 3, fret: 10, recommendedFinger: 2, pitch: 'C4' }] // D string fret 10
    },
    {
      eventIndex: 2,
      beatNumber: 2,
      timing: '1/8',
      recommendedPosition: 9,
      notes: [{ string: 2, fret: 9, recommendedFinger: 1, pitch: 'E4' }]  // G string fret 9
    },
    {
      eventIndex: 3,
      beatNumber: 3,
      timing: '1/8',
      recommendedPosition: 9,
      notes: [{ string: 2, fret: 11, recommendedFinger: 3, pitch: 'F#4' }] // G string fret 11
    }
  ]
};

const segment = ShapeDiagram.splitMeasureIntoSegments(seqMeasureData)[0];

// Render with active event 1
const handFrameSvg = ShapeDiagram.renderHandFrameSVG(segment, 1, {
  width: 260,
  height: 190
});

assert(handFrameSvg.includes('stroke-dasharray="2.5,1.5"'), 'Non-active structural notes in hand frame must have ghosted dashed stroke');
assert(handFrameSvg.includes('fill="#00d26a"'), 'Active event note must have solid vibrant green fill');
assert(handFrameSvg.includes('rgba(0, 210, 106, 0.32)'), 'Active event note must have glowing outer pulse ring');

// Verify zero fake barres in hand frame mode
const shapeData = ShapeDiagram.aggregateSegmentShape(segment, 1, { handFrameMode: true });
assert.strictEqual(shapeData.barres.length, 0, 'Sequential notes must NOT form fake barres in Hand Frame mode');
console.log('  ✓ Hand frame SVG renders structural ghosted notes + active note highlight with 0 fake barres');
console.log('✅ Test 1 Passed: Hand Frame SVG verified.\n');

// ----------------------------------------------------
// Test 2: Rich Measure Classification (eventSteps)
// ----------------------------------------------------
console.log('🧪 Test 2: Rich Measure Classification...');
const classification = ShapeDiagram.classifyMeasure(seqMeasureData);
assert.strictEqual(classification.type, 'sequence', 'Single notes must classify as sequence');
assert.strictEqual(classification.handSpan.minFret, 9, 'Min fret must be 9');
assert.strictEqual(classification.handSpan.maxFret, 11, 'Max fret must be 11');
assert.strictEqual(classification.fingerSequence.length, 3, 'Must have 3 fingers in sequence');
assert.deepStrictEqual(classification.fingerSequence, [2, 1, 3], 'Finger progression must match [2, 1, 3]');
assert(Array.isArray(classification.eventSteps) && classification.eventSteps.length === 3, 'Must provide 3 event steps');
console.log('  ✓ Classification provides accurate hand span (Hand 9–11) and eventSteps');
console.log('✅ Test 2 Passed: Classification verified.\n');

// ----------------------------------------------------
// Test 3: CoachPanel Dual-Layer Output Structure
// ----------------------------------------------------
console.log('🧪 Test 3: CoachPanel Dual-Layer Output Structure...');

// Create mock container for CoachPanel DOM
const panelBody = document.createElement('div');
panelBody.id = 'sfc-panel-body';
document.getElementById = (id) => {
  if (id === 'sfc-panel-body') return panelBody;
  return null;
};

const fakeFingeringResult = {
  song: { title: '藍夜', songId: 6835363 },
  track: { name: 'Lead Guitar', tuningNames: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'] },
  measures: [
    seqMeasureData,
    {
      measureNumber: 4,
      recommendedPosition: 10,
      beats: [
        {
          eventIndex: 1,
          beatNumber: 1,
          timing: '1/4',
          recommendedPosition: 10,
          notes: [
            { string: 0, fret: 12, recommendedFinger: 3, pitch: 'E5' },
            { string: 1, fret: 10, recommendedFinger: 1, pitch: 'A4' },
            { string: 2, fret: 10, recommendedFinger: 1, pitch: 'F4' }
          ]
        }
      ]
    }
  ]
};

const panel = new CoachPanel(fakeFingeringResult, { initialMeasure: 1, initialEvent: 1 });

// Check that panel body has both Overview Card and Now Playing Card
assert(panelBody.innerHTML.includes('sfc-overview-card'), 'CoachPanel body must contain .sfc-overview-card (Block 1)');
assert(panelBody.innerHTML.includes('sfc-now-playing-card'), 'CoachPanel body must contain .sfc-now-playing-card (Block 2)');
assert(panelBody.innerHTML.includes('sfc-step-strip'), 'Sequence measure overview must contain .sfc-step-strip');
assert(panelBody.innerHTML.includes('sfc-step-item sfc-step-active'), 'Active step must be highlighted in step strip');
assert(panelBody.innerHTML.includes('Fret 10') || panelBody.innerHTML.includes('第 10 品'), 'Now Playing card must display current note fret');
assert(panelBody.innerHTML.includes('Next ➔'), 'Now Playing card must contain next note preview');
console.log('  ✓ Sequence Measure: Block 1 (Overview + Step Strip) and Block 2 (Now Playing) co-exist seamlessly');

// Switch to Measure 2 (Chord Shape)
panel.goToMeasure(1, false);
assert(panelBody.innerHTML.includes('sfc-overview-card'), 'Chord measure must contain .sfc-overview-card');
assert(panelBody.innerHTML.includes('Chord Grip') || panelBody.innerHTML.includes('Shape'), 'Chord measure title must indicate Shape/Chord');
assert(panelBody.innerHTML.includes('sfc-now-playing-card'), 'Chord measure must still have .sfc-now-playing-card');
console.log('  ✓ Shape Measure: Overview Card displays full chord grip diagram without degrading to single note');
console.log('✅ Test 3 Passed: Dual-layer structure verified.\n');

// ----------------------------------------------------
// Test 4: Rest Event in Dual-Layer Mode
// ----------------------------------------------------
console.log('🧪 Test 4: Rest Event in Dual-Layer Architecture...');

const restMeasureData = {
  measureNumber: 18,
  recommendedPosition: 13,
  beats: [
    {
      eventIndex: 1,
      beatNumber: 1,
      timing: '1/8',
      recommendedPosition: 13,
      notes: [{ string: 1, fret: -1, isRest: true }] // Rest
    },
    {
      eventIndex: 2,
      beatNumber: 2,
      timing: '1/8',
      recommendedPosition: 13,
      notes: [{ string: 1, fret: 14, recommendedFinger: 2, pitch: 'C#5' }]
    }
  ]
};

const restTrackResult = {
  song: { title: 'Test Rest' },
  track: { name: 'Guitar' },
  measures: [restMeasureData]
};

const restPanel = new CoachPanel(restTrackResult, { initialMeasure: 1, initialEvent: 1 });
assert(panelBody.innerHTML.includes('sfc-overview-card'), 'Rest event must NOT blank or destroy Overview Card');
assert(panelBody.innerHTML.includes('sfc-now-playing-rest-box'), 'Now Playing card must show rest box');
assert(panelBody.innerHTML.includes('休止 / 左手放鬆'), 'Rest card must advise left hand relaxation');
assert(panelBody.innerHTML.includes('即將進入 Pos 13'), 'Rest card must preview upcoming Position 13');
console.log('  ✓ Rest Event: Overview Card remains intact while Now Playing card displays clean Rest banner');
console.log('✅ Test 4 Passed: Rest event handling verified.\n');

// ----------------------------------------------------
// Test 5: Glanceable Inline Overlay Output
// ----------------------------------------------------
console.log('🧪 Test 5: Glanceable Inline Overlay Output (C1 & C2)...');

// 5.1 Sequence Measure Overlay
const seqOverlay = new MeasureOverlay(seqMeasureData, { density: 'small' });
const seqHtml = seqOverlay.domElement.innerHTML;
assert(seqHtml.includes('sfc-overlay-glance-seq'), 'Sequence measure must use .sfc-overlay-glance-seq single-row pill');
assert(seqHtml.includes('M2 · P9'), 'Sequence overlay must show measure and position');
assert(seqHtml.includes('Hand 9–11'), 'Sequence overlay must show hand span');
console.log('  ✓ Sequence overlay renders sleek glanceable pill (M2 · P9 · Hand 9–11 [2➔1➔3])');

// 5.2 Shape Measure Overlay
const chordMeasureData = fakeFingeringResult.measures[1];
const chordOverlay = new MeasureOverlay(chordMeasureData, { density: 'small' });
const chordHtml = chordOverlay.domElement.innerHTML;
assert(chordHtml.includes('sfc-shape-svg'), 'Chord measure overlay must render compact mini SVG diagram');
console.log('  ✓ Shape overlay renders clean mini chord SVG diagram');
console.log('✅ Test 5 Passed: Glanceable inline overlays verified.\n');

console.log('====================================================');
console.log('🏆 ALL PHASE 3.4.1 REBALANCE TESTS PASSED!');
console.log('====================================================\n');
