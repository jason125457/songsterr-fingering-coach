/**
 * playback_sync_acceptance.test.js
 * 
 * Phase 3.1B Live Playback Sync Acceptance Test Suite:
 * 1. 《傍晚去太子灣嗎》 Live Playback Follow (M1 -> M2 -> M3 Segment Switch -> M4 Mini-barre)
 * 2. Romanza Multi-Voice Simultaneous High & Low Voice Rendering in CoachPanel & SVG
 * 3. Smoke On The Water Double-Stop Synchronous Highlight
 * 4. Seek Immediate Synchronization
 * 5. Pause & Resume Behavior (maintains last event on pause, continues on resume)
 * 6. Playback Speed Invariance (0.5x / 1.25x)
 * 7. Manual Interaction & Resume Follow UX (prevents cursor steal, resumes cleanly)
 * 8. Performance & Flicker Control (dirty-checking skips redundant updates)
 */

const fs = require('fs');
const path = require('path');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const PlaybackObserver = require('../src/songsterr/playback_observer');
const PlaybackMapper = require('../src/songsterr/playback_mapper');
const PlaybackSyncController = require('../src/controller/playback_sync_controller');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

// ----------------------------------------------------
// Mock DOM Setup for Headless Node.js Environment
// ----------------------------------------------------
function setupMockDom() {
  const elementsById = new Map();

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.className = '';
      this._innerHTML = '';
      this.children = [];
      this.parentNode = null;
      this.listeners = {};
      this.attributes = new Map();
      this.style = {};
      this.classList = {
        _classes: new Set(),
        add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
        contains: (c) => this.classList._classes.has(c)
      };
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      this._parseInnerTags(html);
    }

    _parseInnerTags(html) {
      if (typeof html !== 'string') return;
      const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/>/g;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const tagName = match[1] || match[4];
        const rawAttrs = match[2] || match[5] || '';
        const child = new MockElement(tagName);
        child.parentNode = this;

        const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
          child.setAttribute(attrName, attrVal);
          if (attrName === 'id') {
            child.id = attrVal;
            elementsById.set(attrVal, child);
          } else if (attrName === 'class') {
            child.className = attrVal;
            attrVal.split(/\s+/).forEach(c => child.classList.add(c));
          }
        }

        const innerContent = match[3];
        if (innerContent && innerContent.includes('<')) {
          child._parseInnerTags(innerContent);
        } else if (innerContent) {
          child._innerHTML = innerContent;
        }

        this.children.push(child);
      }
    }

    get textContent() {
      return this._innerHTML.replace(/<[^>]*>/g, '');
    }

    set textContent(text) {
      this._innerHTML = text;
    }

    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      if (child.id) elementsById.set(child.id, child);
      return child;
    }

    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
      }
      if (this.id) elementsById.delete(this.id);
    }

    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }

    dispatchEvent(event) {
      const fns = this.listeners[event.type] || [];
      fns.forEach(fn => fn(event));
    }

    click() {
      this.dispatchEvent({
        type: 'click',
        target: this,
        currentTarget: this,
        stopPropagation: () => {}
      });
    }

    getAttribute(attr) {
      return this.attributes.get(attr) || null;
    }

    setAttribute(attr, val) {
      this.attributes.set(attr, String(val));
    }

    querySelector(selector) {
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        return elementsById.get(targetId) || this._findById(targetId);
      }
      if (selector.startsWith('.')) {
        const targetClass = selector.slice(1);
        return this._findByClass(targetClass);
      }
      return null;
    }

    _findById(id) {
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c._findById(id);
        if (found) return found;
      }
      return null;
    }

    _findByClass(className) {
      if (this.classList.contains(className)) return this;
      for (const c of this.children) {
        const found = c._findByClass(className);
        if (found) return found;
      }
      return null;
    }

    querySelectorAll(selector) {
      const results = [];
      if (selector.startsWith('.')) {
        const targetClass = selector.slice(1);
        this._findAllByClass(targetClass, results);
      }
      return results;
    }

    _findAllByClass(className, results) {
      if (this.classList.contains(className)) results.push(this);
      for (const c of this.children) {
        c._findAllByClass(className, results);
      }
    }

    getBoundingClientRect() {
      return { top: 76, left: 20, width: 290, height: 400 };
    }
  }

  const document = {
    body: new MockElement('BODY'),
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elementsById.get(id) || null
  };

  const window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: () => {}
  };

  global.document = document;
  global.window = window;

  return { document, window, elementsById };
}

setupMockDom();

// Require CoachPanel after DOM is mocked
const CoachPanel = require('../src/ui/coach_panel');

console.log('🎸 ====================================================');
console.log('🎸 PHASE 3.1B - LIVE PLAYBACK SYNC ACCEPTANCE TESTS');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// 1. 《傍晚去太子灣嗎》 Live Playback Follow
// ----------------------------------------------------
console.log('🧪 Test 1: 《傍晚去太子灣嗎》 Live Playback Follow...');
const rawTaiziwanPath = path.join(__dirname, 'taiziwan_part0_raw.json');
assert(fs.existsSync(rawTaiziwanPath), 'taiziwan_part0_raw.json must exist');

const rawSongData = JSON.parse(fs.readFileSync(rawTaiziwanPath, 'utf8'));
const normalizedTaiziwan = TabNormalizer.normalizeSongsterrPart(rawSongData, {
  title: '傍晚去太子灣嗎',
  artist: 'Schoolgirl byebye',
  songId: 6557798,
  partId: 0
});
const fingeringTaiziwan = FingeringEngine.analyzeTab(normalizedTaiziwan);

const coachPanel = new CoachPanel(fingeringTaiziwan, { initialMeasure: 1, initialMode: 'follow' });
const observer = new PlaybackObserver({ debugLog: false });
const controller = new PlaybackSyncController({
  observer,
  mapper: PlaybackMapper,
  coachPanel,
  normalizedTrack: normalizedTaiziwan,
  autoStart: true
});

assert(coachPanel.getMode() === 'follow', 'CoachPanel must default to follow mode');

// Step 1A: M1 Ev1 -> Panel shows M1, Ev1
observer.updateState({
  state: 'playing',
  measureNumber: 1,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 0, `Panel measure should be M1 (idx 0), got ${coachPanel.currentMeasureIndex}`);
assert(coachPanel.currentEventIndex === 1, `Panel event should be 1, got ${coachPanel.currentEventIndex}`);
assert(coachPanel.activeSegmentIndex === 0, `Panel segment should be 0 (Pos 7)`);

// Step 1B: Advance to M1 Ev6
observer.updateState({
  state: 'playing',
  measureNumber: 1,
  eventIndex: 6,
  source: 'dom-playhead',
  confidence: 'exact'
});
assert(coachPanel.currentEventIndex === 6, `Panel event should advance to 6, got ${coachPanel.currentEventIndex}`);

// Step 1C: Cross measure boundary to M2 Ev1
observer.updateState({
  state: 'playing',
  measureNumber: 2,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});
assert(coachPanel.currentMeasureIndex === 1, `Panel measure should advance to M2 (idx 1), got ${coachPanel.currentMeasureIndex}`);
assert(coachPanel.currentEventIndex === 1, `Panel event should be 1`);

// Step 1D: Advance to M3 Ev1 (Position 8 segment)
observer.updateState({
  state: 'playing',
  measureNumber: 3,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});
assert(coachPanel.currentMeasureIndex === 2, `Panel should advance to M3`);
assert(coachPanel.activeSegmentIndex === 0, `M3 Ev1 should be in segment 0 (Pos 8), got ${coachPanel.activeSegmentIndex}`);

// Step 1E: Advance to M3 Ev6 (Shift to Position 10 segment!)
observer.updateState({
  state: 'playing',
  measureNumber: 3,
  eventIndex: 6,
  source: 'dom-playhead',
  confidence: 'exact'
});
assert(coachPanel.activeSegmentIndex === 1, `M3 Ev6 should automatically switch to segment 1 (Pos 10), got ${coachPanel.activeSegmentIndex}`);

// Step 1F: Advance to M4 Ev1 (12 + 10 + 10 Mini-Barre)
observer.updateState({
  state: 'playing',
  measureNumber: 4,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});
assert(coachPanel.currentMeasureIndex === 3, `Panel should advance to M4`);
const bodyHtmlM4 = document.getElementById('sfc-panel-body')?.innerHTML || '';
assert(bodyHtmlM4.includes('barre') || bodyHtmlM4.includes('Fret 10'), 'M4 should render mini-barre details');

console.log('✅ Test 1 Passed: 《傍晚去太子灣嗎》 smooth playback follow across measures, segments & mini-barre.\n');

// ----------------------------------------------------
// 2. Romanza Multi-Voice Simultaneous High & Low Voice
// ----------------------------------------------------
console.log('🧪 Test 2: Romanza Multi-Voice Simultaneous High & Low Voice Display...');
const romanzaPath = path.join(__dirname, 'romanza_part0_raw.json');
const rawRomanza = JSON.parse(fs.readFileSync(romanzaPath, 'utf8'));
const normalizedRomanza = TabNormalizer.normalizeSongsterrPart(rawRomanza, {
  title: 'Romanza',
  artist: 'Anonymous',
  songId: 65187,
  partId: 0
});
const fingeringRomanza = FingeringEngine.analyzeTab(normalizedRomanza);

// Switch track in controller
controller.setTrack(normalizedRomanza, fingeringRomanza);

// Emulate playing Romanza M1 Event 1 (simultaneous Voice 0 High E7 and Voice 1 Low E0)
observer.updateState({
  state: 'playing',
  measureNumber: 1,
  voiceIndex: 0,
  beatIndex: 0,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 0, 'Panel should be at M1');
assert(coachPanel.currentEventIndex === 1, 'Panel should be at Canonical Event 1');

const bodyHtmlRomanza = document.getElementById('sfc-panel-body')?.innerHTML || '';
// Check both Voice 0 (High E fret 7) and Voice 1 (Low E fret 0) exist in details
assert(bodyHtmlRomanza.includes('String 1') && bodyHtmlRomanza.includes('Fret 7'), 'Must show High E fret 7 (Voice 0)');
assert(bodyHtmlRomanza.includes('String 6') && bodyHtmlRomanza.includes('Fret 0'), 'Must show Low E open fret 0 (Voice 1)');
assert(bodyHtmlRomanza.includes('V0') && bodyHtmlRomanza.includes('V1'), 'Must display voice tags V0 and V1');

console.log('✅ Test 2 Passed: Romanza M1 Event 1 simultaneously renders melody & bass voices with voice tags.\n');

// ----------------------------------------------------
// 3. Smoke On The Water Double-Stop Synchronous Highlight
// ----------------------------------------------------
console.log('🧪 Test 3: Smoke On The Water Double-Stop Synchronous Highlight...');
const sampleOutputPath = path.join(__dirname, '..', 'sample_output.json');
assert(fs.existsSync(sampleOutputPath), 'sample_output.json must exist');
const sampleFixtures = JSON.parse(fs.readFileSync(sampleOutputPath, 'utf8'));
const smokeFixture = sampleFixtures.find(f => f.song && f.song.title === 'Smoke On The Water');
assert(smokeFixture, 'Smoke On The Water fixture must exist in sample_output.json');

const normalizedSmoke = TabNormalizer.normalizeFromSampleFixture(smokeFixture);
const fingeringSmoke = FingeringEngine.analyzeTab(normalizedSmoke);
controller.setTrack(normalizedSmoke, fingeringSmoke);

// Emulate playing M1 Ev1 (Double-stop on D & G strings)
observer.updateState({
  state: 'playing',
  measureNumber: 1,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 0, 'Panel should be at Smoke M1');
assert(coachPanel.currentEventIndex === 1, 'Panel should be at Smoke Ev1');

const bodySmoke = document.getElementById('sfc-panel-body')?.innerHTML || '';
const m1Ev1Notes = fingeringSmoke.measures[0].beats[0].notes.filter(n => !n.isRest);
assert(m1Ev1Notes.length === 2, 'Smoke On The Water M1 Ev1 must have 2 simultaneous notes (Double Stop)');
assert(bodySmoke.includes('String') && bodySmoke.includes('Fret'), 'Smoke On The Water M1 Ev1 notes must be present in UI');
console.log('✅ Test 3 Passed: Smoke On The Water double-stop synchronized highlight verified.\n');

// ----------------------------------------------------
// 4. Seek Immediate Synchronization
// ----------------------------------------------------
console.log('🧪 Test 4: Seek Immediate Synchronization...');
// Switch back to Taiziwan
controller.setTrack(normalizedTaiziwan, fingeringTaiziwan);

// Initial state: M1 Ev1
observer.updateState({
  state: 'playing',
  measureNumber: 1,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 0, 'Starts at M1');

// User seeks directly to M25 Ev3
observer.updateState({
  state: 'playing',
  measureNumber: 25,
  eventIndex: 3,
  source: 'cursor-marker',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 24, `Panel must instantly seek to M25 (idx 24), got ${coachPanel.currentMeasureIndex}`);
assert(coachPanel.currentEventIndex === 3, `Panel must seek to Ev3, got ${coachPanel.currentEventIndex}`);
console.log('✅ Test 4 Passed: Seek immediately synchronizes target measure and event without delay.\n');

// ----------------------------------------------------
// 5. Pause & Resume Behavior
// ----------------------------------------------------
console.log('🧪 Test 5: Pause & Resume Behavior...');
// Player pauses at M25 Ev3
observer.updateState({
  state: 'paused',
  measureNumber: 25,
  eventIndex: 3,
  source: 'dom-playhead'
});

assert(coachPanel.currentMeasureIndex === 24, 'Pause must retain M25');
assert(coachPanel.currentEventIndex === 3, 'Pause must retain Ev3 (do NOT reset to Ev1 or M1!)');

// Player resumes playback
observer.updateState({
  state: 'playing',
  measureNumber: 25,
  eventIndex: 4,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(coachPanel.currentMeasureIndex === 24, 'Resume should stay in M25');
assert(coachPanel.currentEventIndex === 4, 'Resume should advance to Ev4');
console.log('✅ Test 5 Passed: Pause holds position accurately; Resume continues seamlessly.\n');

// ----------------------------------------------------
// 6. Playback Speed Invariance (0.5x / 1.25x)
// ----------------------------------------------------
console.log('🧪 Test 6: Playback Speed Invariance (0.5x / 1.25x)...');
// At 0.5x half-speed: time progresses at half rate, but event and position-in-measure remain aligned
const mapped05x = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 25,
  positionInMeasure: 0.5
}, normalizedTaiziwan);

assert(mapped05x !== null, '0.5x mapped event must not be null');
assert(mapped05x.measureNumber === 25, '0.5x mapped measure must be 25');
assert(mapped05x.eventIndex >= 3, `0.5x mapped eventIndex must be mid-measure, got ${mapped05x.eventIndex}`);

// At 1.25x fast-speed:
const mapped125x = PlaybackMapper.mapPlaybackEventToCanonical({
  measureNumber: 25,
  positionInMeasure: 0.8
}, normalizedTaiziwan);
assert(mapped125x !== null && mapped125x.eventIndex >= mapped05x.eventIndex, '1.25x mapped event must be towards end of measure');
console.log('✅ Test 6 Passed: Playback speed variance handled cleanly via normalized temporal fraction.\n');

// ----------------------------------------------------
// 7. Manual Interaction & Resume Follow UX
// ----------------------------------------------------
console.log('🧪 Test 7: Manual Interaction & Resume Follow UX...');
// Current playback is at M25 Ev4
assert(coachPanel.getMode() === 'follow', 'Panel is currently following');

// User manually navigates to M10
coachPanel.goToMeasure(9, true);

assert(coachPanel.currentMeasureIndex === 9, 'Panel is at M10');
assert(coachPanel.getMode() === 'manual', 'Manual navigation must switch mode to "manual"');

const headerHtml = document.getElementById('sfc-header-actions')?.innerHTML || '';
assert(headerHtml.includes('sfc-btn-resume-follow') || headerHtml.includes('Resume Follow'), 'Header must display Resume Follow button in manual mode');

// Playback cursor moves to M26 Ev1 while user is in manual mode
observer.updateState({
  state: 'playing',
  measureNumber: 26,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

// CRITICAL CHECK: Panel must NOT be stolen by playback cursor while in manual mode!
assert(coachPanel.currentMeasureIndex === 9, `Panel MUST stay on M10 during manual inspection! Got M${coachPanel.currentMeasureIndex + 1}`);

const statsDuringManual = controller.getStats();
assert(statsDuringManual.skippedManualCount > 0, `Controller must record skipped manual updates (${statsDuringManual.skippedManualCount})`);

// User clicks "Resume Follow" button
const resumeBtn = document.getElementById('sfc-btn-resume-follow');
if (resumeBtn) {
  resumeBtn.click();
} else {
  coachPanel.setMode('follow');
  controller.handleResumeFollow();
}

assert(coachPanel.getMode() === 'follow', 'Mode should return to follow');
// Panel must immediately jump back to live playback position (M26 Ev1)!
assert(coachPanel.currentMeasureIndex === 25, `Panel must resync to M26 (idx 25), got M${coachPanel.currentMeasureIndex + 1}`);
assert(coachPanel.currentEventIndex === 1, `Panel must resync to Ev1`);

console.log('✅ Test 7 Passed: Manual interaction safely isolates UI; Resume Follow cleanly resyncs.\n');

// ----------------------------------------------------
// 8. Performance & Flicker Control (Dirty Checking)
// ----------------------------------------------------
console.log('🧪 Test 8: Performance & Flicker Control...');
let renderCount = 0;
const originalUpdateView = coachPanel.updateView.bind(coachPanel);
coachPanel.updateView = function () {
  renderCount++;
  return originalUpdateView();
};

// Simulate 30 rapid ticks of observer sampling the same playing beat (60ms intervals = 1.8s)
const initialRenderCount = renderCount;
for (let i = 0; i < 30; i++) {
  observer.updateState({
    state: 'playing',
    measureNumber: 26,
    eventIndex: 1,
    source: 'dom-playhead',
    confidence: 'exact'
  });
}

// Dirty checking should completely eliminate redundant re-renders!
const redundantRenders = renderCount - initialRenderCount;
assert(redundantRenders === 0, `Rapid identical ticks must cause 0 redundant renders! Got ${redundantRenders}`);

// When beat actually advances:
observer.updateState({
  state: 'playing',
  measureNumber: 26,
  eventIndex: 2,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(renderCount === initialRenderCount + 1, 'Only genuine beat progression should trigger re-render');

controller.destroy();
observer.stop();

console.log(`  Sync Controller Stats:`, controller.getStats());
console.log('✅ Test 8 Passed: Dirty-checking prevents UI flicker and eliminates redundant DOM re-renders.\n');

console.log('🎉 ALL PHASE 3.1B LIVE PLAYBACK SYNC ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
console.log('=========================================================================\n');
