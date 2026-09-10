/**
 * tests/barre_and_presentation.test.js
 * 
 * Phase 3.4 Acceptance Test Suite:
 * - Real-World Playback Event Mapping (M18 & generic temporal grids)
 * - Modern ScoreGeometry DOM Adapter
 * - True Simultaneous Barre vs Fake Barre Rejection (Taiziwan M4 real barre vs sequential notes)
 * - Presentation Classification (sequence, shape, mixed, multi-shape)
 * - Hand Span & Finger Sequence calculation
 * - Rest Event state presentation in CoachPanel
 */

const assert = require('assert');
const ShapeDiagram = require('../src/ui/shape_diagram');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const PlaybackMapper = require('../src/songsterr/playback_mapper');
const PlaybackObserver = require('../src/songsterr/playback_observer');
const ScoreGeometry = require('../src/songsterr/score_geometry');

console.log('\n🎸 ====================================================');
console.log('🎸 PHASE 3.4: FINGERING CORRECTNESS & PRESENTATION TESTS');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// Test 1: Real Barre vs Fake Barre
// ----------------------------------------------------
console.log('🧪 Test 1: Real Barre vs Fake Barre (C1)...');

// 1.1 Verified Taiziwan Measure 4 (Fret 12 on string 1 + Fret 10 on string 2 + Fret 10 on string 3 in same beat)
const taiziwanM4Data = {
  measureNumber: 4,
  recommendedPosition: 10,
  beats: [
    {
      eventIndex: 1,
      beatNumber: 1,
      recommendedPosition: 10,
      notes: [
        { string: 0, fret: 12, recommendedFinger: 3 },
        { string: 1, fret: 10, recommendedFinger: 1 },
        { string: 2, fret: 10, recommendedFinger: 1 }
      ]
    },
    {
      eventIndex: 2,
      beatNumber: 2,
      recommendedPosition: 10,
      notes: [
        { string: 0, fret: 12, recommendedFinger: 3 }
      ]
    }
  ]
};

const m4Shape = ShapeDiagram.aggregateSegmentShape(taiziwanM4Data, 1);
assert(m4Shape.barres.length === 1, 'Taiziwan M4 must detect exactly 1 true simultaneous mini-barre');
assert.strictEqual(m4Shape.barres[0].fret, 10, 'M4 barre fret must be 10');
assert.strictEqual(m4Shape.barres[0].finger, 1, 'M4 barre finger must be 1');
console.log('  ✓ Real simultaneous barre in Taiziwan M4 correctly detected');

// 1.2 Fake Barre Rejection: Sequential notes across different events sharing same fret & finger
const sequentialNotesMeasure = {
  measureNumber: 20,
  recommendedPosition: 9,
  beats: [
    {
      eventIndex: 1,
      beatNumber: 1,
      recommendedPosition: 9,
      notes: [{ string: 3, fret: 9, recommendedFinger: 1 }] // D string fret 9
    },
    {
      eventIndex: 2,
      beatNumber: 2,
      recommendedPosition: 9,
      notes: [{ string: 0, fret: 12, recommendedFinger: 4 }]
    },
    {
      eventIndex: 3,
      beatNumber: 3,
      recommendedPosition: 9,
      notes: [{ string: 2, fret: 9, recommendedFinger: 1 }] // G string fret 9 at a DIFFERENT point in time
    }
  ]
};

const seqShape = ShapeDiagram.aggregateSegmentShape(sequentialNotesMeasure, null);
assert.strictEqual(seqShape.barres.length, 0, 'Sequential notes across different events MUST NOT form a fake barre');
console.log('  ✓ Fake barre across sequential events successfully rejected (0 barres formed)');
console.log('✅ Test 1 Passed: True simultaneous barre detection verified.\n');

// ----------------------------------------------------
// Test 2: Presentation Classification
// ----------------------------------------------------
console.log('🧪 Test 2: Presentation Classification (C2)...');

// 2.1 Pure Melody -> 'sequence'
const melodyMeasure = {
  measureNumber: 1,
  recommendedPosition: 9,
  beats: [
    { notes: [{ string: 0, fret: 9, recommendedFinger: 1 }] },
    { notes: [{ string: 0, fret: 11, recommendedFinger: 3 }] },
    { notes: [{ string: 0, fret: 12, recommendedFinger: 4 }] },
    { notes: [{ string: 0, fret: 9, recommendedFinger: 1 }] }
  ]
};
const classMelody = ShapeDiagram.classifyMeasure(melodyMeasure);
assert.strictEqual(classMelody.type, 'sequence', 'Single-note melody must be classified as sequence');
assert.strictEqual(classMelody.handSpan.text, 'Hand 9–12', 'Hand span for melody must be Hand 9–12');
assert.deepStrictEqual(classMelody.fingerSequence, [1, 3, 4, 1], 'Finger progression must be [1, 3, 4, 1]');
console.log('  ✓ Melody classified as sequence with Hand 9–12 and finger progression [1, 3, 4, 1]');

// 2.2 Single Stable Chord Grip -> 'shape'
const repeatedChordMeasure = {
  measureNumber: 2,
  recommendedPosition: 1,
  beats: [
    { notes: [{ string: 1, fret: 1, recommendedFinger: 1 }, { string: 3, fret: 2, recommendedFinger: 2 }] },
    { notes: [{ string: 1, fret: 1, recommendedFinger: 1 }, { string: 3, fret: 2, recommendedFinger: 2 }] }
  ]
};
const classChord = ShapeDiagram.classifyMeasure(repeatedChordMeasure);
assert.strictEqual(classChord.type, 'shape', 'Repeated identical chord grip must be classified as shape');
console.log('  ✓ Single stable chord grip classified as shape');

// 2.3 Multiple Materially Different Simultaneous Grips -> 'multi-shape'
const multiChordMeasure = {
  measureNumber: 3,
  recommendedPosition: 1,
  beats: [
    { notes: [{ string: 1, fret: 1, recommendedFinger: 1 }, { string: 3, fret: 2, recommendedFinger: 2 }] }, // Grip A
    { notes: [{ string: 0, fret: 3, recommendedFinger: 3 }, { string: 1, fret: 3, recommendedFinger: 4 }] }  // Grip B (different shape!)
  ]
};
const classMultiChord = ShapeDiagram.classifyMeasure(multiChordMeasure);
assert.strictEqual(classMultiChord.type, 'multi-shape', 'Different simultaneous grips within measure must be classified as multi-shape');
console.log('  ✓ Multiple different chord grips classified as multi-shape (no super-shape merging)');

// 2.4 Mixed: Single Notes + Chord -> 'mixed'
const mixedMeasure = {
  measureNumber: 4,
  recommendedPosition: 5,
  beats: [
    { notes: [{ string: 0, fret: 5, recommendedFinger: 1 }] },
    { notes: [{ string: 1, fret: 7, recommendedFinger: 3 }, { string: 2, fret: 7, recommendedFinger: 3 }] }
  ]
};
const classMixed = ShapeDiagram.classifyMeasure(mixedMeasure);
assert.strictEqual(classMixed.type, 'mixed', 'Melody + chord must be classified as mixed');
console.log('  ✓ Melody + chord combination classified as mixed');
console.log('✅ Test 2 Passed: Presentation classification semantics verified.\n');

// ----------------------------------------------------
// Test 3: Playback Event Mapping (M18 & Generic Grids)
// ----------------------------------------------------
console.log('🧪 Test 3: Playback Event Mapping (Part A)...');

// 3.1 Raw Song 6835363 Measure 18 Fixture
const m18RawPart = {
  songTitle: 'Test M18',
  measures: [
    {
      voices: [
        {
          beats: [
            { duration: [1, 8], notes: [{ fret: 16, string: 0 }] }, // Ev 1: t = 0.0
            { duration: [1, 8], notes: [{ rest: true }] },           // Ev 2: t = 0.125
            { duration: [1, 16], notes: [{ fret: 16, string: 0 }] }, // Ev 3: t = 0.25
            { duration: [1, 16], notes: [{ fret: 12, string: 0 }] }, // Ev 4: t = 0.3125
            { duration: [1, 16], notes: [{ rest: true }] },          // Ev 5: t = 0.375
            { duration: [1, 16], notes: [{ fret: 14, string: 0 }] }, // Ev 6: t = 0.4375 (Fret 14 note in user screenshot)
            { duration: [1, 16], notes: [{ rest: true }] },          // Ev 7: t = 0.5
            { duration: [1, 16], notes: [{ fret: 11, string: 0 }] }, // Ev 8: t = 0.5625
            { duration: [1, 16], notes: [{ fret: 12, string: 1 }] }, // Ev 9: t = 0.625
            { duration: [1, 16], notes: [{ fret: 13, string: 2 }] }, // Ev 10: t = 0.6875
            { duration: [1, 16], notes: [{ fret: 12, string: 1 }] }, // Ev 11: t = 0.75
            { duration: [3, 16], notes: [{ fret: 14, string: 1 }] }  // Ev 12: t = 0.8125
          ]
        }
      ]
    }
  ]
};

const normalizedM18 = TabNormalizer.normalizeSongsterrPart(m18RawPart);

// Verified user screenshot case: playhead at ~0.437
const userPlayheadEvent = {
  measureNumber: 1,
  eventIndex: null,
  beatIndex: null,
  positionInMeasure: 0.437,
  confidence: 'exact',
  source: 'dom-playhead'
};
const userMapped = PlaybackMapper.mapPlaybackEventToCanonical(userPlayheadEvent, normalizedM18);
assert.strictEqual(userMapped.eventIndex, 6, 'M18 at positionInMeasure = 0.437 must map to Event 6 (the note 14), NOT Event 1!');
assert.strictEqual(userMapped.canonicalEvent.notes[0].fret, 14, 'Canonical event note fret must be 14');
console.log('  ✓ User screenshot case verified: positionInMeasure 0.437 maps to Event 6 (Fret 14)');

// 3.2 Continuous Playhead Advance Across M18
const testPositions = [
  { pos: 0.00, expectedEv: 1 },
  { pos: 0.13, expectedEv: 2 },
  { pos: 0.25, expectedEv: 3 },
  { pos: 0.32, expectedEv: 4 },
  { pos: 0.38, expectedEv: 5 },
  { pos: 0.44, expectedEv: 6 },
  { pos: 0.50, expectedEv: 7 },
  { pos: 0.57, expectedEv: 8 },
  { pos: 0.63, expectedEv: 9 },
  { pos: 0.69, expectedEv: 10 },
  { pos: 0.76, expectedEv: 11 },
  { pos: 0.82, expectedEv: 12 }
];

testPositions.forEach(({ pos, expectedEv }) => {
  const res = PlaybackMapper.mapPlaybackEventToCanonical({
    measureNumber: 1,
    eventIndex: null,
    beatIndex: null,
    positionInMeasure: pos,
    source: 'dom-playhead'
  }, normalizedM18);
  assert.strictEqual(res.eventIndex, expectedEv, `Position ${pos} must map to Event ${expectedEv}, got ${res.eventIndex}`);
});
console.log('  ✓ Continuous playback advance across all 12 events in M18 verified');

// 3.3 Note Click via cursorMarker retains exact source-identity mapping
const clickEvent = {
  measureNumber: 1,
  eventIndex: 6,
  beatIndex: 5,
  voiceIndex: 0,
  positionInMeasure: 0.0,
  source: 'cursor-marker'
};
const clickMapped = PlaybackMapper.mapPlaybackEventToCanonical(clickEvent, normalizedM18);
assert.strictEqual(clickMapped.eventIndex, 6, 'Direct click must retain exact mapping');
assert.strictEqual(clickMapped.mappingStrategy, 'source-identity', 'Direct click must use source-identity strategy');
console.log('  ✓ Note click retains exact source-identity mapping');
console.log('✅ Test 3 Passed: Playback event mapping verified.\n');

// ----------------------------------------------------
// Test 4: ScoreGeometry Modern DOM Adapter
// ----------------------------------------------------
console.log('🧪 Test 4: ScoreGeometry Modern DOM Adapter (Part B)...');

// Mock DOM for ScoreGeometry
function createMockDoc() {
  const lineG = {
    getAttribute: (name) => (name === 'data-line' ? '0' : '0'),
    closest: (sel) => (sel === 'svg' ? mockSvg : null),
    ownerSVGElement: null
  };

  const mockTexts = [
    { textContent: '17', getAttribute: (a) => (a === 'y' ? '-8' : (a === 'x' ? '10' : '')), className: 'number', closest: () => null },
    { textContent: '18', getAttribute: (a) => (a === 'y' ? '-8' : (a === 'x' ? '300' : '')), className: 'number', closest: () => null }
  ];

  const mockStringsPath = {
    getAttribute: (a) => (a === 'd' ? 'M10,0.5v59.5M300,0.5v59.5M600,0.5v59.5' : '')
  };

  const mockSvg = {
    getBoundingClientRect: () => ({ left: 50, top: 100, right: 650, bottom: 200, width: 600, height: 100 }),
    viewBox: { baseVal: { width: 600, height: 100 } },
    parentElement: { className: 'line-container' },
    querySelectorAll: (sel) => (sel === 'text' ? mockTexts : []),
    querySelector: (sel) => (sel.includes('tab-strings-path') ? mockStringsPath : null)
  };

  const mockPlayhead = {
    getAttribute: (a) => (a === 'href' ? '#cursor-playhead-0-0' : ''),
    style: { transform: 'translate3d(350px, -22px, 0px)', visibility: 'visible' },
    closest: (sel) => (sel === 'svg' ? mockSvg : (sel === 'g[data-line]' ? lineG : null))
  };

  return {
    querySelectorAll: (sel) => {
      if (sel.includes('g[data-line]')) return [lineG];
      if (sel.includes('cursor-playhead')) return [mockPlayhead];
      return [];
    },
    defaultView: {
      getComputedStyle: (el) => ({ visibility: 'visible', display: 'block', opacity: '1' })
    }
  };
}

const mockDoc = createMockDoc();
const lines = ScoreGeometry.getVisibleLines(mockDoc);
assert.strictEqual(lines.length, 1, 'ScoreGeometry must find 1 visible score line');

const playheadGeom = ScoreGeometry.getActivePlayheadGeometry(mockDoc);
assert(playheadGeom !== null, 'ScoreGeometry must find active playhead');
assert.strictEqual(playheadGeom.cursorX, 350, 'Cursor X must be 350');
assert.strictEqual(playheadGeom.screenX, 400, 'Screen X must be 50 + 350 = 400');

const measureGeoms = ScoreGeometry.getMeasureGeometries(mockDoc);
assert.strictEqual(measureGeoms.length, 2, 'Must extract 2 measure geometries');
assert.strictEqual(measureGeoms[0].measureNumber, 17, 'Measure 17 extracted');
assert.strictEqual(measureGeoms[0].left, 60, 'M17 left = 50 + 10 = 60');
assert.strictEqual(measureGeoms[0].right, 350, 'M17 right = 50 + 300 = 350');

assert.strictEqual(measureGeoms[1].measureNumber, 18, 'Measure 18 extracted');
assert.strictEqual(measureGeoms[1].left, 350, 'M18 left = 50 + 300 = 350');
assert.strictEqual(measureGeoms[1].right, 650, 'M18 right = 50 + 600 = 650');
console.log('  ✓ Modern ScoreGeometry extraction and viewport coordinate transformation verified');
console.log('✅ Test 4 Passed: ScoreGeometry modern DOM adapter verified.\n');

// ----------------------------------------------------
// Test 5: Single-Event Active Diagram & Rest State (C4)
// ----------------------------------------------------
console.log('🧪 Test 5: Single-Event Active Diagram & Rest State (C4)...');

// 5.1 Single-event only rendering: active beat only
const multiBeatSegment = {
  position: 13,
  beats: [
    { eventIndex: 1, beatNumber: 1, notes: [{ string: 0, fret: 16, recommendedFinger: 4 }] },
    { eventIndex: 2, beatNumber: 2, notes: [{ isRest: true, string: -1, fret: -1 }] },
    { eventIndex: 3, beatNumber: 3, notes: [{ string: 0, fret: 14, recommendedFinger: 2 }] }
  ]
};

// With singleEventOnly: true on Event 1
const singleEv1Shape = ShapeDiagram.aggregateSegmentShape(multiBeatSegment, 1, { singleEventOnly: true });
assert.strictEqual(singleEv1Shape.notes.length, 1, 'Only Event 1 notes should be present on diagram');
assert.strictEqual(singleEv1Shape.notes[0].fret, 16, 'Note on diagram must be fret 16');

// With singleEventOnly: true on Event 2 (Rest)
const singleEv2Shape = ShapeDiagram.aggregateSegmentShape(multiBeatSegment, 2, { singleEventOnly: true });
assert.strictEqual(singleEv2Shape.notes.length, 0, 'Rest event must have 0 active notes on diagram');
console.log('  ✓ Single-event diagram isolates current event notes and leaves Rest events clean');
console.log('✅ Test 5 Passed: Single-event diagram and Rest state verified.\n');

console.log('====================================================');
console.log('🏆 ALL PHASE 3.4 UNIT & REGRESSION TESTS PASSED!');
console.log('====================================================\n');
