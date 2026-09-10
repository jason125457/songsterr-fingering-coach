/**
 * multi_voice_acceptance.test.js
 * 
 * Phase 3.1A.1 - Canonical Multi-Voice Timeline & Live Playback Validation Acceptance Test Suite.
 * 
 * Validates:
 * 1. Multi-voice rational fraction time alignment on real Romanza fixture (52 measures).
 * 2. Canonical event aggregation: Romanza M1 Event 1 has both melody (Voice 0 E7) and bass (Voice 1 E0).
 * 3. Exact event count: M1 has exactly 9 canonical events (triplets), with zero rogue "Event 10".
 * 4. Preserved source identity: sources array and note.source linkage across voices.
 * 5. FingeringEngine execution: Analyzes full polyphonic Romanza track without errors.
 * 6. PlaybackMapper: Exact source-identity mapping (V0/B0 and V1/B0 -> Event 1, V0/B8 -> Event 9),
 *    temporal fraction offset mapping, and measure fallback.
 * 7. PlaybackObserver: Multi-line staff protection (lineIndex disambiguation & 2D proximity) and source tagging.
 */

const fs = require('fs');
const path = require('path');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const PlaybackMapper = require('../src/songsterr/playback_mapper');
const PlaybackObserver = require('../src/songsterr/playback_observer');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🎸 ====================================================');
console.log('🎸 PHASE 3.1A.1 - MULTI-VOICE TIMELINE & PLAYBACK TEST');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// 1. Multi-Voice Rational Normalizer (Romanza Fixture)
// ----------------------------------------------------
console.log('🧪 Test 1: Multi-Voice Rational Normalization on Romanza...');
const romanzaRawPath = path.join(__dirname, 'romanza_part0_raw.json');
assert(fs.existsSync(romanzaRawPath), 'Romanza fixture romanza_part0_raw.json must exist');

const romanzaRaw = JSON.parse(fs.readFileSync(romanzaRawPath, 'utf8'));
const normalizedTrack = TabNormalizer.normalizeSongsterrPart(romanzaRaw, {
  title: 'Romanza',
  artist: 'Anonymous',
  songId: 65187,
  partId: 0
});

assert(normalizedTrack.measures && normalizedTrack.measures.length === 52, 
  `Normalized track should contain 52 measures, got ${normalizedTrack.measures?.length}`);

const m1 = normalizedTrack.measures[0];
assert(m1.measureNumber === 1, 'M1 measureNumber must be 1');
assert(m1.beats.length === 9, `M1 must have exactly 9 canonical events, got ${m1.beats.length} (no Event 10!)`);

// Check Event 1 (simultaneous notes at t = 0)
const ev1 = m1.beats[0];
assert(ev1.eventIndex === 1, 'Event 1 must have eventIndex 1');
assert(ev1.timeOffset.num === 0 && ev1.timeOffset.den === 1, 'Event 1 timeOffset must be 0/1');
assert(ev1.notes.length === 2, `Event 1 must aggregate 2 simultaneous notes, got ${ev1.notes.length}`);

// Find melody note (Voice 0) and bass note (Voice 1)
const highENote = ev1.notes.find(n => n.string === 0 && n.fret === 7);
const lowENote = ev1.notes.find(n => n.string === 5 && n.fret === 0);
assert(highENote, 'Event 1 must contain High E string (string 0) fret 7');
assert(lowENote, 'Event 1 must contain Low E string (string 5) fret 0');

assert(highENote.source && highENote.source.voiceIndex === 0 && highENote.source.beatIndex === 0,
  'High E note source must point to Voice 0 Beat 0');
assert(lowENote.source && lowENote.source.voiceIndex === 1 && lowENote.source.beatIndex === 0,
  'Low E note source must point to Voice 1 Beat 0');

assert(ev1.sources && ev1.sources.length === 2, 'Event 1 must have 2 source records');
assert(ev1.sources.some(s => s.voiceIndex === 0 && s.beatIndex === 0), 'Event 1 must record Voice 0 Beat 0');
assert(ev1.sources.some(s => s.voiceIndex === 1 && s.beatIndex === 0), 'Event 1 must record Voice 1 Beat 0');

// Check Event 2 (triplet note 2 at t = 1/12)
const ev2 = m1.beats[1];
assert(ev2.eventIndex === 2, 'Event 2 must have eventIndex 2');
assert(ev2.timeOffset.num === 1 && ev2.timeOffset.den === 12, `Event 2 timeOffset must be 1/12, got ${ev2.timeOffset.text}`);
assert(ev2.notes.length === 1 && ev2.notes[0].string === 1 && ev2.notes[0].fret === 0, 'Event 2 note must be open B string (fret 0)');

// Check Event 9 (final triplet note at t = 8/12 = 2/3)
const ev9 = m1.beats[8];
assert(ev9.eventIndex === 9, 'Event 9 must have eventIndex 9');
assert(ev9.timeOffset.num === 2 && ev9.timeOffset.den === 3, `Event 9 timeOffset must be simplified to 2/3, got ${ev9.timeOffset.text}`);
assert(ev9.notes.length === 1 && ev9.notes[0].string === 2 && ev9.notes[0].fret === 0, 'Event 9 note must be open G string (fret 0)');

console.log('✅ Test 1 Passed: Multi-voice aggregation to 9 canonical events verified without Event 10.\n');

// ----------------------------------------------------
// 2. FingeringEngine on Full Polyphonic Track
// ----------------------------------------------------
console.log('🧪 Test 2: FingeringEngine Analysis on Polyphonic Romanza...');
const fingeringResult = FingeringEngine.analyzeTab(normalizedTrack);

assert(fingeringResult && Array.isArray(fingeringResult.measures), 'FingeringEngine must return measures array');
assert(fingeringResult.measures.length === 52, `Fingering analysis should cover 52 measures, got ${fingeringResult.measures.length}`);

const fM1 = fingeringResult.measures[0];
assert(fM1.beats.length === 9, `Fingering M1 beats length must match canonical events (9), got ${fM1.beats.length}`);

// Event 1 fingering: 2 notes played simultaneously
const fEv1 = fM1.beats[0];
assert(fEv1.notes.length === 2, 'Fingered Event 1 must have 2 notes');
const fHighE = fEv1.notes.find(n => n.string === 0 && n.fret === 7);
const fLowE = fEv1.notes.find(n => n.string === 5 && n.fret === 0);
assert(fHighE && fHighE.recommendedFinger > 0, 'High E fret 7 must have a valid non-zero finger');
assert(fLowE && fLowE.recommendedFinger === 0, 'Low E open string (fret 0) must have finger 0');

console.log(`  M1 Event 1 Fingering: High E7 -> Finger ${fHighE.recommendedFinger}, Low E0 -> Finger ${fLowE.recommendedFinger}`);
console.log('✅ Test 2 Passed: FingeringEngine polyphonic analysis succeeded on 52 measures.\n');

// ----------------------------------------------------
// 3. PlaybackMapper Mapping Strategies
// ----------------------------------------------------
console.log('🧪 Test 3: PlaybackMapper Mapping Strategies...');

// Strategy 1A: Map Voice 0 Beat 0 -> Canonical Event 1
const mappedV0B0 = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 1,
  voiceIndex: 0,
  beatIndex: 0
}, normalizedTrack);
assert(mappedV0B0 !== null, 'Mapped result for V0 B0 must not be null');
assert(mappedV0B0.measureNumber === 1, 'Mapped measureNumber must be 1');
assert(mappedV0B0.eventIndex === 1, 'Mapped eventIndex must be 1');
assert(mappedV0B0.mappingStrategy === 'source-identity', 'Mapping strategy must be source-identity');

// Strategy 1B: Map Voice 1 Beat 0 -> Canonical Event 1 (Simultaneous Note!)
const mappedV1B0 = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 1,
  voiceIndex: 1,
  beatIndex: 0
}, normalizedTrack);
assert(mappedV1B0 !== null, 'Mapped result for V1 B0 must not be null');
assert(mappedV1B0.eventIndex === 1, 'Simultaneous Voice 1 Beat 0 must map to Canonical Event 1');
assert(mappedV1B0.mappingStrategy === 'source-identity', 'Mapping strategy must be source-identity');

// Strategy 1C: Map Voice 0 Beat 8 -> Canonical Event 9
const mappedV0B8 = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 1,
  voiceIndex: 0,
  beatIndex: 8
}, normalizedTrack);
assert(mappedV0B8.eventIndex === 9, 'Voice 0 Beat 8 must map to Canonical Event 9');
assert(mappedV0B8.mappingStrategy === 'source-identity', 'Mapping strategy must be source-identity');

// Strategy 2: Temporal Position in Measure (continuous time offset)
const mappedHalf = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 1,
  positionInMeasure: 0.5
}, normalizedTrack);
assert(mappedHalf !== null, 'Mapped result for position 0.5 must not be null');
assert(mappedHalf.measureNumber === 1, 'Mapped measureNumber must be 1');
assert(mappedHalf.mappingStrategy === 'time-offset', 'Mapping strategy must be time-offset');
// In Romanza 3/4 with 9 triplets, 0.5 (halfway) corresponds to around event 5
assert(mappedHalf.eventIndex >= 4 && mappedHalf.eventIndex <= 6, `Event index at 0.5 should be mid-measure, got ${mappedHalf.eventIndex}`);

// Strategy 3: Measure-Only Fallback
const mappedMeasureOnly = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 5,
  confidence: 'measure-only'
}, normalizedTrack);
assert(mappedMeasureOnly !== null, 'Mapped measure-only must not be null');
assert(mappedMeasureOnly.measureNumber === 5, 'Mapped measureNumber must be 5');
assert(mappedMeasureOnly.eventIndex === 1, 'Fallback eventIndex must be 1');
assert(mappedMeasureOnly.confidence === 'measure-only', 'Confidence must be measure-only');

console.log('✅ Test 3 Passed: PlaybackMapper source-identity, temporal, and fallback verified.\n');

// ----------------------------------------------------
// 4. PlaybackObserver Multi-Line Protection & Sources
// ----------------------------------------------------
console.log('🧪 Test 4: PlaybackObserver Multi-Line Disambiguation & Source Tagging...');

// Emulate Songsterr SVG DOM with multiple staff lines
function createMockDom() {
  const playhead = {
    tagName: 'use',
    getAttribute: (attr) => (attr === 'href' ? '#cursor-playhead-0-1' : null),
    style: {
      visibility: 'visible',
      transform: 'translate3d(120.0px, 250.0px, 0px)'
    },
    closest: () => svg
  };

  const beatTargetLine0 = {
    tagName: 'rect',
    getAttribute: (attr) => {
      if (attr === 'data-testid') return 'tab-beat-target';
      if (attr === 'data-line-index') return '0';
      if (attr === 'data-measure-index') return '0';
      if (attr === 'data-voice-index') return '0';
      if (attr === 'data-beat-index') return '1';
      if (attr === 'x') return '120.0';
      if (attr === 'y') return '50.0'; // Line 0 Y is near 50
      return null;
    }
  };

  const beatTargetLine1 = {
    tagName: 'rect',
    getAttribute: (attr) => {
      if (attr === 'data-testid') return 'tab-beat-target';
      if (attr === 'data-line-index') return '1'; // Matches playhead lineIndex 1!
      if (attr === 'data-measure-index') return '4';
      if (attr === 'data-voice-index') return '0';
      if (attr === 'data-beat-index') return '3';
      if (attr === 'x') return '121.0';
      if (attr === 'y') return '250.0'; // Line 1 Y is near 250
      return null;
    }
  };

  const svg = {
    tagName: 'svg',
    querySelectorAll: (selector) => {
      if (selector === 'rect[data-testid="tab-beat-target"]') {
        return [beatTargetLine0, beatTargetLine1];
      }
      return [];
    }
  };

  return {
    document: {
      querySelectorAll: (sel) => (sel.includes('cursor-playhead') ? [playhead] : []),
      getElementById: () => null
    }
  };
}

const mockEnv = createMockDom();
global.document = mockEnv.document;

const testObserver = new PlaybackObserver({ debugLog: false });
const probeResult = testObserver.probeDomPlayhead();

assert(probeResult !== null, 'probeDomPlayhead must find active beat target');
assert(probeResult.measureNumber === 5, `Must resolve to Line 1 target (M5), got M${probeResult.measureNumber}`);
assert(probeResult.beatIndex === 3, `Must resolve to Line 1 target (beatIndex 3), got ${probeResult.beatIndex}`);
assert(probeResult.source === 'dom-playhead', 'Source must be dom-playhead');

// Test cursorMarker probe
const mockMarker = {
  getAttribute: (attr) => (attr === 'data-cursor' ? '0,11,0,2,3' : null)
};
global.document.getElementById = (id) => (id === 'cursorMarker' ? mockMarker : null);

const markerResult = testObserver.probeCursorMarker();
assert(markerResult !== null, 'probeCursorMarker must parse data-cursor');
assert(markerResult.measureNumber === 12, 'Measure 11 (0-indexed) must become M12');
assert(markerResult.eventIndex === 3, 'Beat 2 (0-indexed) must become eventIndex 3');
assert(markerResult.source === 'cursor-marker', 'Source must be cursor-marker');

delete global.document;

console.log('✅ Test 4 Passed: Multi-line disambiguation and source tagging verified.\n');

console.log('🎉 ALL PHASE 3.1A.1 MULTI-VOICE ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
console.log('===================================================================\n');
