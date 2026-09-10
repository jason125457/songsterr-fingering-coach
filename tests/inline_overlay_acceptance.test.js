/**
 * inline_overlay_acceptance.test.js
 * 
 * Phase 3.2A Inline Measure Fingering Overlay Acceptance Test Suite:
 * 1. Measure Anchor Mapping (rect[data-testid="tab-measure-target"] discovery)
 * 2. Viewport Virtualization (Strict 4-6 overlays in DOM limit for 146-measure song)
 * 3. Compact Target Measures Showcase:
 *    - M1: Pos 7 compact shape
 *    - M3: Multi-segment switching (Pos 8 -> Pos 10 on active event)
 *    - M4: 12 + 10 + 10 mini-barre capsule
 *    - M17: Pos 1 Open chord nut line
 *    - M19: Open string shift window
 * 4. Multi-Voice Polyphonic Romanza M1 Event 1 Compact Highlight
 * 5. Smoke On The Water Double-Stop Synchronous Highlight
 * 6. Positioning, Scroll Stability & Zero Occlusion (pointer-events: none)
 * 7. Live Playback Sync Controller Coordination (M1 -> M2 -> Seek -> Pause)
 */

const fs = require('fs');
const path = require('path');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const ShapeDiagram = require('../src/ui/shape_diagram');
const MeasureOverlay = require('../src/ui/measure_overlay');
const OverlayManager = require('../src/ui/overlay_manager');
const PlaybackObserver = require('../src/songsterr/playback_observer');
const PlaybackMapper = require('../src/songsterr/playback_mapper');
const PlaybackSyncController = require('../src/controller/playback_sync_controller');
const CoachPanel = require('../src/ui/coach_panel');

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
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.className = '';
      this._innerHTML = '';
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.listeners = {};
      this.style = {};
      this.offsetWidth = 88;
      this.offsetHeight = 88;
      this._clientRect = { top: 200, left: 100, width: 150, height: 80, bottom: 280, right: 250 };
      this.classList = {
        _classes: new Set(),
        add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
        contains: (c) => this.classList._classes.has(c)
      };
    }

    get innerHTML() {
      if (this.children.length > 0) {
        return this.children.map(c => c.outerHTML).join('');
      }
      return this._innerHTML;
    }

    get outerHTML() {
      const tag = this.tagName.toLowerCase();
      let attrs = '';
      if (this.id) attrs += ` id="${this.id}"`;
      if (this.className) attrs += ` class="${this.className}"`;
      for (const [k, v] of this.attributes.entries()) {
        if (k !== 'id' && k !== 'class') {
          attrs += ` ${k}="${v}"`;
        }
      }
      if (this.style && Object.keys(this.style).length > 0) {
        const cssText = Object.entries(this.style).map(([k, v]) => `${k}: ${v}`).join('; ');
        attrs += ` style="${cssText}"`;
      }
      const inner = this.children.length > 0 ? this.children.map(c => c.outerHTML).join('') : this._innerHTML;
      return `<${tag}${attrs}>${inner}</${tag}>`;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      this._parseInnerTags(html);
    }

    _parseInnerTags(html) {
      if (typeof html !== 'string') return;
      const tagRegex = /<([a-zA-Z0-9_-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9_-]+)([^>]*)\/>/g;
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

    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }

    removeEventListener(event, fn) {
      if (!this.listeners[event]) return;
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }

    dispatchEvent(event) {
      const fns = this.listeners[event.type] || [];
      fns.forEach(fn => fn(event));
    }

    getAttribute(attr) {
      return this.attributes.get(attr) || null;
    }

    setAttribute(attr, val) {
      this.attributes.set(attr, String(val));
    }

    hasAttribute(attr) {
      return this.attributes.has(attr);
    }

    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(selector) {
      const results = [];
      this._matchSelectorRecursive(this, selector, results);
      return results;
    }

    _matchSelectorRecursive(node, selector, results) {
      for (const child of node.children) {
        if (this._matches(child, selector)) {
          results.push(child);
        }
        this._matchSelectorRecursive(child, selector, results);
      }
    }

    _matches(el, selector) {
      const parts = selector.split(',').map(s => s.trim());
      return parts.some(part => {
        if (part.startsWith('.')) {
          return el.classList.contains(part.slice(1));
        }
        if (part.startsWith('#')) {
          return el.id === part.slice(1);
        }
        if (part.includes('[') && part.includes(']')) {
          // Tag + attr or pure attr e.g. rect[data-testid="tab-measure-target"]
          const tagMatch = part.match(/^([a-zA-Z0-9_-]+)?\[([^\]]+)\]/);
          if (tagMatch) {
            const tag = tagMatch[1];
            const attrExpr = tagMatch[2];
            if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
            if (attrExpr.includes('=')) {
              const [k, v] = attrExpr.split('=');
              const cleanV = v.replace(/["']/g, '');
              return el.getAttribute(k) === cleanV;
            } else {
              return el.hasAttribute(attrExpr);
            }
          }
        }
        return el.tagName.toLowerCase() === part.toLowerCase();
      });
    }

    getBoundingClientRect() {
      return Object.assign({}, this._clientRect);
    }

    setClientRect(rect) {
      this._clientRect = Object.assign({}, rect);
    }
  }

  const document = {
    body: new MockElement('BODY'),
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => document.querySelector(`#${id}`),
    querySelector: (sel) => {
      if (document.body._matches(document.body, sel)) return document.body;
      return document.body.querySelector(sel);
    },
    querySelectorAll: (sel) => {
      const results = [];
      if (document.body._matches(document.body, sel)) results.push(document.body);
      document.body._matchSelectorRecursive(document.body, sel, results);
      return results;
    }
  };

  const window = {
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  global.document = document;
  global.window = window;

  return { document, window, MockElement };
}

console.log('🎸 ====================================================');
console.log('🎸 PHASE 3.2A: INLINE MEASURE OVERLAY ACCEPTANCE TESTS');
console.log('🎸 ====================================================\n');

const { document, window, MockElement } = setupMockDom();

// Helper to create mock Songsterr tab measure targets in DOM
function createMeasureTargets(count = 146) {
  // Clear body children
  document.body.children = [];
  const anchors = [];
  for (let m = 0; m < count; m++) {
    const rect = new MockElement('rect');
    rect.setAttribute('data-testid', 'tab-measure-target');
    rect.setAttribute('data-measure-index', String(m)); // 0-based index
    rect.setClientRect({
      top: 150 + m * 90,
      left: 100,
      width: 240,
      height: 75,
      bottom: 150 + m * 90 + 75,
      right: 340
    });
    document.body.appendChild(rect);
    anchors.push(rect);
  }
  return anchors;
}

// ----------------------------------------------------
// Load fixtures and generate fingering analysis
// ----------------------------------------------------
const taiziwanRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'taiziwan_part0_raw.json'), 'utf8'));
const taiziwanTrack = TabNormalizer.normalizeSongsterrPart(taiziwanRaw, {
  title: '傍晚去太子灣嗎',
  artist: 'Schoolgirl byebye',
  songId: 6557798
});
const taiziwanResult = FingeringEngine.analyzeTab(taiziwanTrack);

const romanzaRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'romanza_part0_raw.json'), 'utf8'));
const romanzaTrack = TabNormalizer.normalizeSongsterrPart(romanzaRaw, {
  title: 'Romance Anonimo',
  artist: 'Spanish Classical Guitar'
});
const romanzaResult = FingeringEngine.analyzeTab(romanzaTrack);

// ----------------------------------------------------
// Test 1: Measure Anchor Mapping
// ----------------------------------------------------
console.log('🧪 Test 1: Measure Anchor Mapping (Discovery & Schema)...');
createMeasureTargets(10);
const overlayManager = new OverlayManager({ maxOverlays: 5 });
overlayManager.scanAnchors();

assert(overlayManager.anchorMap.size === 10, `Expected 10 discovered measure anchors, found ${overlayManager.anchorMap.size}`);
const m1Anchor = overlayManager.anchorMap.get(1);
assert(m1Anchor !== undefined, 'M1 anchor must be mapped');
assert(m1Anchor.getAttribute('data-measure-index') === '0', 'M1 anchor corresponds to data-measure-index 0');

const m10Anchor = overlayManager.anchorMap.get(10);
assert(m10Anchor !== undefined, 'M10 anchor must be mapped');
assert(m10Anchor.getAttribute('data-measure-index') === '9', 'M10 anchor corresponds to data-measure-index 9');

// Test data-measure-number support
const explicitNumEl = new MockElement('rect');
explicitNumEl.setAttribute('data-measure-number', '11');
document.body.appendChild(explicitNumEl);
overlayManager.scanAnchors();
assert(overlayManager.anchorMap.get(11) === explicitNumEl, 'data-measure-number attribute must be mapped directly');
console.log('✅ Test 1 Passed: Songsterr measure targets discovered and mapped accurately.\n');

// ----------------------------------------------------
// Test 2: Viewport Virtualization (Strict 4-6 Overlays Limit)
// ----------------------------------------------------
console.log('🧪 Test 2: Viewport Virtualization (4–6 Overlays Limit on 146-Measure Song)...');
createMeasureTargets(146);
overlayManager.setFingeringResult(taiziwanResult);

// Initial state: active measure = 1
let activeOverlays = overlayManager.getActiveOverlays();
assert(activeOverlays.size <= 6 && activeOverlays.size >= 4, `Overlays in DOM should be 4-6, got ${activeOverlays.size}`);
assert(activeOverlays.has(1), 'Active measure 1 must be present in DOM');
assert(activeOverlays.has(2), 'Measure 2 must be present in sliding window');
assert(!activeOverlays.has(50), 'Measure 50 must NOT be in DOM for measure 1');
assert(!activeOverlays.has(146), 'Measure 146 must NOT be in DOM for measure 1');

// Slide to measure 50
overlayManager.updateVirtualWindow(50);
activeOverlays = overlayManager.getActiveOverlays();
assert(activeOverlays.size <= 6 && activeOverlays.size >= 4, `Overlays in DOM for M50 should be 4-6, got ${activeOverlays.size}`);
assert(activeOverlays.has(50), 'Active measure 50 must be present');
assert(activeOverlays.has(49), 'Previous measure 49 must be present');
assert(activeOverlays.has(51), 'Next measure 51 must be present');
assert(!activeOverlays.has(1), 'Measure 1 must be unmounted when sliding to M50');
assert(!activeOverlays.has(10), 'Measure 10 must be unmounted');

// Slide to measure 146 (last measure of song)
overlayManager.updateVirtualWindow(146);
activeOverlays = overlayManager.getActiveOverlays();
assert(activeOverlays.size <= 6 && activeOverlays.size >= 4, `Overlays in DOM for M146 should be 4-6, got ${activeOverlays.size}`);
assert(activeOverlays.has(146), 'Final measure 146 must be present');
assert(activeOverlays.has(145), 'Measure 145 must be present');
assert(!activeOverlays.has(50), 'Measure 50 must be unmounted');

console.log(`  Virtualized window size: ${activeOverlays.size} (Constant O(1) DOM footprint for 146 measures)`);
console.log('✅ Test 2 Passed: Strict 4-6 overlays limit verified across entire song.\n');

// ----------------------------------------------------
// Test 3: Target Measures Compact Presentation & Segment Switching
// ----------------------------------------------------
console.log('🧪 Test 3: Target Measures Compact Presentation & Segment Switching...');
overlayManager.updateVirtualWindow(1);

// 3.1 M1: Pos 7 Compact Diagram
const m1Overlay = overlayManager.getActiveOverlays().get(1);
assert(m1Overlay !== undefined, 'M1 overlay must be present');
assert(m1Overlay.domElement.innerHTML.includes('M1 · P7'), 'M1 header must display measure 1 and Pos 7');
assert(m1Overlay.domElement.innerHTML.includes('sfc-shape-compact'), 'Diagram must use compact SVG mode');
assert(m1Overlay.domElement.innerHTML.includes('>7fr<'), 'M1 must display 7fr label');

// 3.2 M3: Multi-Segment Switching (Pos 8 -> Pos 10)
overlayManager.updateVirtualWindow(3);
const m3Overlay = overlayManager.getActiveOverlays().get(3);
assert(m3Overlay !== undefined, 'M3 overlay must be present');
assert(m3Overlay.segments.length === 2, 'M3 must have 2 position segments (Pos 8 & Pos 10)');
assert(m3Overlay.domElement.innerHTML.includes('P8➔P10'), 'M3 header must display shift chip P8➔P10');
assert(m3Overlay.domElement.innerHTML.includes('M3 · P8'), 'M3 initially starts on Pos 8 segment');

// Simulate event 1 (Pos 8 beat)
m3Overlay.setActiveEvent(1);
assert(m3Overlay.currentSegmentIndex === 0, 'Event 1 must stay in segment 0 (Pos 8)');
assert(m3Overlay.domElement.innerHTML.includes('M3 · P8'), 'Header remains P8');

// Advance to event 6 (Beat 6 in Pos 10)
m3Overlay.setActiveEvent(6);
assert(m3Overlay.currentSegmentIndex === 1, 'Event 6 must switch to segment 1 (Pos 10)');
assert(m3Overlay.domElement.innerHTML.includes('M3 · P10'), 'Header must dynamically update to P10');
assert(m3Overlay.domElement.innerHTML.includes('>10fr<'), 'Diagram must now display 10fr label');

// 3.3 M4: Mini-Barre Capsule (12 + 10 + 10)
overlayManager.updateVirtualWindow(4);
const m4Overlay = overlayManager.getActiveOverlays().get(4);
assert(m4Overlay !== undefined, 'M4 overlay must be present');
assert(m4Overlay.domElement.innerHTML.includes('<rect') && m4Overlay.domElement.innerHTML.includes('rx="6"'), 'M4 must render compact mini-barre capsule (rx=6)');

// 3.4 M17: Pos 1 Open Chord Shape with Nut Line
overlayManager.updateVirtualWindow(17);
const m17Overlay = overlayManager.getActiveOverlays().get(17);
assert(m17Overlay !== undefined, 'M17 overlay must be present');
assert(m17Overlay.domElement.innerHTML.includes('stroke-width="3.5"'), 'Pos 1 open chord must render thick nut line (stroke-width=3.5)');
assert(m17Overlay.domElement.innerHTML.includes('<circle') && m17Overlay.domElement.innerHTML.includes('r="3.5"'), 'Open string O circles must be rendered compactly');

// 3.5 M19: Open String Shift Window
overlayManager.updateVirtualWindow(19);
const m19Overlay = overlayManager.getActiveOverlays().get(19);
assert(m19Overlay !== undefined, 'M19 overlay must be present');
assert(m19Overlay.segments.length >= 2, 'M19 must split into segments across open string window');
assert(m19Overlay.domElement.innerHTML.includes('P5➔P1'), 'M19 transition chip must display P5➔P1');

console.log('✅ Test 3 Passed: Target measures (M1, M3, M4, M17, M19) compact presentation verified.\n');

// ----------------------------------------------------
// Test 4: Multi-Voice Polyphonic Romanza M1 Event 1 Compact Highlight
// ----------------------------------------------------
console.log('🧪 Test 4: Multi-Voice Polyphonic Romanza M1 Event 1 Compact Highlight...');
createMeasureTargets(50);
overlayManager.setFingeringResult(romanzaResult);
overlayManager.updateVirtualWindow(1);

const romanzaM1Overlay = overlayManager.getActiveOverlays().get(1);
assert(romanzaM1Overlay !== undefined, 'Romanza M1 overlay must be present');

// Event 1 has both melody note (High E fret 7) and bass open string (Low E fret 0)
romanzaM1Overlay.setActiveEvent(1);
const romanzaSVG = romanzaM1Overlay.domElement.innerHTML;
assert(romanzaSVG.includes('fill="#00d26a"'), 'Active melody note dot must be highlighted in emerald (#00d26a)');
assert(romanzaSVG.includes('stroke="#00d26a"'), 'Active open bass string circle must be highlighted in emerald');
console.log('✅ Test 4 Passed: Multi-voice polyphonic notes highlighted concurrently on compact diagram.\n');

// ----------------------------------------------------
// Test 5: Double-Stop Synchronous Highlight (Smoke On The Water)
// ----------------------------------------------------
console.log('🧪 Test 5: Double-Stop Synchronous Highlight...');
const smokeMeasureData = {
  measureNumber: 1,
  recommendedPosition: 3,
  beats: [
    {
      beatNumber: 1,
      eventIndex: 1,
      notes: [
        { string: 2, fret: 5, recommendedFinger: 1, isRest: false },
        { string: 3, fret: 5, recommendedFinger: 1, isRest: false }
      ]
    }
  ]
};
const smokeOverlay = new MeasureOverlay(smokeMeasureData, { svgWidth: 80, svgHeight: 66 });
smokeOverlay.setActiveEvent(1);
const smokeSVG = smokeOverlay.domElement.innerHTML;
// Count active note elements or barre capsule
assert(smokeSVG.includes('rx="6"'), 'Smoke double stop with same finger should form mini-barre capsule');
assert(smokeSVG.includes('stroke="#00d26a"'), 'Double stop barre must be highlighted as active');
console.log('✅ Test 5 Passed: Double-stops highlighted synchronously on compact overlay.\n');

// ----------------------------------------------------
// Test 6: Positioning, Scroll Stability & Zero Occlusion
// ----------------------------------------------------
console.log('🧪 Test 6: Positioning, Scroll Stability & Zero Occlusion...');
const anchorRect = { top: 320, left: 150, width: 220, height: 70 };
const testOverlay = new MeasureOverlay(smokeMeasureData, { width: 88, height: 88 });

// Initial positioning with zero scroll
testOverlay.updatePosition(anchorRect, { scrollX: 0, scrollY: 0 });
const expectedTop1 = 320 + 0 - 88 - 6; // 226px
const expectedLeft1 = 150 + 0 + 4; // 154px
assert(testOverlay.domElement.style.top === `${expectedTop1}px`, `Expected top ${expectedTop1}px, got ${testOverlay.domElement.style.top}`);
assert(testOverlay.domElement.style.left === `${expectedLeft1}px`, `Expected left ${expectedLeft1}px, got ${testOverlay.domElement.style.left}`);

// Check zero occlusion safety: pointer-events: none
assert(testOverlay.domElement.style.pointerEvents === 'none', 'Measure overlay MUST have pointer-events: none to avoid blocking TAB clicks');
assert(overlayManager.container.style.pointerEvents === 'none', 'Overlay root container MUST have pointer-events: none');

// Simulate vertical page scrolling
testOverlay.updatePosition(anchorRect, { scrollX: 0, scrollY: 450 });
const expectedTopScroll = 320 + 450 - 88 - 6; // 676px
assert(testOverlay.domElement.style.top === `${expectedTopScroll}px`, `Scroll repositioning failed: expected ${expectedTopScroll}px, got ${testOverlay.domElement.style.top}`);

console.log('✅ Test 6 Passed: Positioning sits safely above staff line with zero pointer interception.\n');

// ----------------------------------------------------
// Test 7: Live Playback Sync Controller Coordination
// ----------------------------------------------------
console.log('🧪 Test 7: Live Playback Sync Controller Coordination...');
createMeasureTargets(146);
overlayManager.setFingeringResult(taiziwanResult);

const mockObserver = new PlaybackObserver();
const coachPanel = new CoachPanel(taiziwanResult, { initialMeasure: 1 });
const syncController = new PlaybackSyncController({
  observer: mockObserver,
  mapper: PlaybackMapper,
  coachPanel: coachPanel,
  overlayManager: overlayManager,
  normalizedTrack: taiziwanTrack,
  autoStart: true
});

// 7.1 Dispatch M1 Event 1 playback event
mockObserver.updateState({
  state: 'playing',
  measureNumber: 1,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(overlayManager.activeMeasureNumber === 1, 'Overlay manager should be at M1');
const activeM1 = overlayManager.getActiveOverlays().get(1);
assert(activeM1.isHighlighted === true, 'M1 overlay must have isHighlighted = true');
assert(activeM1.domElement.classList.contains('sfc-overlay-active'), 'M1 DOM element must have sfc-overlay-active class');

// 7.2 Advance to M2
mockObserver.updateState({
  state: 'playing',
  measureNumber: 2,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(overlayManager.activeMeasureNumber === 2, 'Overlay manager should advance to M2');
const activeM2 = overlayManager.getActiveOverlays().get(2);
assert(activeM2.isHighlighted === true, 'M2 overlay must be highlighted');
assert(activeM1.isHighlighted === false, 'M1 overlay must no longer be highlighted');

// 7.3 Seek to M30
mockObserver.updateState({
  state: 'playing',
  measureNumber: 30,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(overlayManager.activeMeasureNumber === 30, 'Overlay manager should immediately seek to M30');
assert(overlayManager.getActiveOverlays().has(30), 'M30 overlay must be mounted in DOM');
assert(overlayManager.getActiveOverlays().get(30).isHighlighted === true, 'M30 overlay must be highlighted');
assert(!overlayManager.getActiveOverlays().has(1), 'M1 overlay must be unmounted');
assert(overlayManager.getActiveOverlays().size <= 6, 'Sliding window remains constrained to 4-6 overlays after seek');

// 7.4 Pause playback
mockObserver.updateState({
  state: 'paused',
  measureNumber: 30,
  eventIndex: 1,
  source: 'dom-playhead',
  confidence: 'exact'
});

assert(overlayManager.activeMeasureNumber === 30, 'Overlay manager must hold current measure on pause');
assert(overlayManager.getActiveOverlays().get(30).isHighlighted === true, 'M30 remains highlighted on pause');

// Cleanup
syncController.destroy();
overlayManager.destroy();

console.log('✅ Test 7 Passed: Live Playback Sync coordination verified across measures, seek and pause.\n');

console.log('====================================================');
console.log('🎉 ALL PHASE 3.2A ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
console.log('====================================================\n');
