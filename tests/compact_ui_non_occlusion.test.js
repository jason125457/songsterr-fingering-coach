/**
 * compact_ui_non_occlusion.test.js
 * 
 * Comprehensive Automated Test Suite for Phase 3.4.3:
 * Non-Occluding Layout & Compact Coach UI
 * 
 * Verifies:
 * 1. Inline Hand Map Default Compact Dimensions & Metrics (small: 52x40 SVG, 58x46 card)
 * 2. Strict Non-Occlusion Mathematical Invariant: overlay.bottom <= notationTop - safeGap
 * 3. Header Conciseness (removal of redundant M{n}, retaining P{pos})
 * 4. CoachPanel Compact Mode Default & Dimension Constraints
 * 5. Windowed Finger Flow in Compact Mode ([curEv - 1, curEv + 2])
 * 6. Expanded Mode Toggle & Full Event View
 * 7. Minimized Floating FAB Mode (toggle, text M{n} Ev{e}, restore)
 * 8. Snap Left / Right Controls & LocalStorage Persistence
 */

const assert = require('assert');

// Mock browser DOM environment if running in Node.js
if (typeof document === 'undefined') {
  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };

  class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...args) { args.forEach(c => this.classes.add(c)); }
    remove(...args) { args.forEach(c => this.classes.delete(c)); }
    contains(c) { return this.classes.has(c); }
    toggle(c) { if (this.contains(c)) { this.remove(c); return false; } else { this.add(c); return true; } }
  }

  class MockElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.classList = new MockClassList();
      this.children = [];
      this._innerHTML = '';
      this.style = {};
      this.attributes = {};
    }
    get className() { return Array.from(this.classList.classes).join(' '); }
    set className(val) {
      this.classList.classes.clear();
      if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(val) {
      this._innerHTML = val;
      this._syncChildrenFromHtml(val);
    }
    get textContent() { return this._innerHTML.replace(/<[^>]+>/g, ''); }
    set textContent(val) { this._innerHTML = val; }
    appendChild(child) { this.children.push(child); return child; }
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
      }
    }
    setAttribute(name, val) { this.attributes[name] = String(val); }
    getAttribute(name) { return this.attributes[name] || null; }
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return this._findChild(c => c.id === id);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this._findChild(c => c.classList.contains(cls));
      }
      return null;
    }
    querySelectorAll(sel) {
      const results = [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        this._collectChildren(c => c.classList.contains(cls), results);
      }
      return results;
    }
    _findChild(predicate) {
      for (const c of this.children) {
        if (predicate(c)) return c;
        const found = c._findChild(predicate);
        if (found) return found;
      }
      return null;
    }
    _collectChildren(predicate, list) {
      for (const c of this.children) {
        if (predicate(c)) list.push(c);
        c._collectChildren(predicate, list);
      }
    }
    _syncChildrenFromHtml(html) {
      this.children = [];
      const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9]+)([^>]*)\/>/gi;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const tag = match[1] || match[4];
        const attrs = match[2] || match[5] || '';
        const el = new MockElement(tag);
        const idMatch = attrs.match(/id="([^"]+)"/);
        if (idMatch) el.id = idMatch[1];
        const classMatch = attrs.match(/class="([^"]+)"/);
        if (classMatch) el.className = classMatch[1];
        const dataEvMatch = attrs.match(/data-event="([^"]+)"/);
        if (dataEvMatch) el.setAttribute('data-event', dataEvMatch[1]);
        const dataSegMatch = attrs.match(/data-segment="([^"]+)"/);
        if (dataSegMatch) el.setAttribute('data-segment', dataSegMatch[1]);
        el.parentNode = this;
        this.children.push(el);
      }
    }
    addEventListener() {}
    getBoundingClientRect() {
      return { top: 100, left: 100, width: 200, height: 80, bottom: 180, right: 300 };
    }
  }

  global.document = {
    createElement(tag) { return new MockElement(tag); },
    getElementById(id) {
      if (global.document.body) {
        return global.document.body.querySelector('#' + id);
      }
      return null;
    },
    body: new MockElement('body')
  };
  global.window = {
    addEventListener() {}
  };
}

const MeasureOverlay = require('../src/ui/measure_overlay');
const ShapeDiagram = require('../src/ui/shape_diagram');
const CoachPanel = require('../src/ui/coach_panel');

console.log('🎸 ====================================================');
console.log('🎸 PHASE 3.4.3: NON-OCCLUDING LAYOUT & COMPACT COACH UI');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// Fixture Data
// ----------------------------------------------------
const fixtureMeasure = {
  measureNumber: 7,
  timeSignature: '4/4',
  recommendedPosition: 6,
  isPositionShift: false,
  beats: [
    { eventIndex: 1, timing: '1/8', recommendedPosition: 6, notes: [{ string: 2, fret: 6, recommendedFinger: 1, pitch: 'F#4' }] },
    { eventIndex: 2, timing: '1/8', recommendedPosition: 6, notes: [{ string: 2, fret: 8, recommendedFinger: 3, pitch: 'G#4' }] },
    { eventIndex: 3, timing: '1/8', recommendedPosition: 6, notes: [{ string: 1, fret: 6, recommendedFinger: 1, pitch: 'A#4' }] },
    { eventIndex: 4, timing: '1/8', recommendedPosition: 6, notes: [{ string: 1, fret: 7, recommendedFinger: 2, pitch: 'B4' }] },
    { eventIndex: 5, timing: '1/8', recommendedPosition: 6, notes: [{ string: 1, fret: 9, recommendedFinger: 4, pitch: 'C#5' }] },
    { eventIndex: 6, timing: '1/8', recommendedPosition: 6, notes: [{ string: 1, fret: 7, recommendedFinger: 2, pitch: 'B4' }] },
    { eventIndex: 7, timing: '1/8', recommendedPosition: 6, notes: [{ string: 1, fret: 6, recommendedFinger: 1, pitch: 'A#4' }] },
    { eventIndex: 8, timing: '1/8', recommendedPosition: 6, notes: [{ string: 2, fret: 8, recommendedFinger: 3, pitch: 'G#4' }] }
  ]
};

const fakeFingeringResult = {
  song: { title: 'Sweet Child O Mine', songId: '23' },
  track: { name: 'Lead Guitar', tuning: [64, 59, 55, 50, 45, 40] },
  measures: [fixtureMeasure]
};

// ----------------------------------------------------
// Test 1: Default Compact Inline Hand Map Dimensions
// ----------------------------------------------------
console.log('🧪 Test 1: Default Compact Inline Hand Map Dimensions...');

const defaultOverlay = new MeasureOverlay(fixtureMeasure);
assert.strictEqual(defaultOverlay.density, 'small', 'Default density must be small');
assert.strictEqual(defaultOverlay.svgWidth, 52, 'Default svgWidth must be 52');
assert.strictEqual(defaultOverlay.svgHeight, 40, 'Default svgHeight must be 40');
assert.strictEqual(defaultOverlay.overlayWidth, 58, 'Default overlayWidth must be 58');
assert.strictEqual(defaultOverlay.overlayHeight, 46, 'Default overlayHeight must be 46');

console.log('  ✓ Default overlay density is "small" with 52x40 SVG and 58x46 card');
console.log('✅ Test 1 Passed: Default compact dimensions verified.\n');

// ----------------------------------------------------
// Test 2: Strict Non-Occlusion Math Invariant
// ----------------------------------------------------
console.log('🧪 Test 2: Strict Non-Occlusion Mathematical Invariant...');

// Scenario A: Standard staff line layout with stringsTop at 240px
const anchorA = {
  left: 120,
  top: 200,
  width: 180,
  height: 90,
  stringsTop: 240,
  stringsBottom: 290,
  notationTop: 236,
  notationBottom: 290
};

defaultOverlay.updatePosition(anchorA, { scrollX: 0, scrollY: 0 });
const parsedTopA = parseFloat(defaultOverlay.domElement.style.top);
const overlayBottomA = parsedTopA + defaultOverlay.overlayHeight;
const safeGap = 4;

assert.ok(overlayBottomA <= anchorA.notationTop - safeGap, 
  `Overlay bottom (${overlayBottomA}) must NOT exceed notationTop - safeGap (${anchorA.notationTop - safeGap})`);
console.log(`  ✓ Scenario A: Overlay bottom ${overlayBottomA}px <= notation boundary ${anchorA.notationTop - safeGap}px`);

// Scenario B: Extremely tight measure spacing (crowded multi-track score)
const tightAnchor = {
  left: 100,
  top: 210,
  width: 150,
  height: 80,
  stringsTop: 235,
  notationTop: 230
};
defaultOverlay.updatePosition(tightAnchor, { scrollX: 0, scrollY: 0 });
const parsedTopB = parseFloat(defaultOverlay.domElement.style.top);
const overlayBottomB = parsedTopB + defaultOverlay.overlayHeight;

assert.ok(overlayBottomB <= tightAnchor.notationTop - safeGap,
  `Tight measure: Overlay bottom (${overlayBottomB}) must NOT exceed notationTop - safeGap (${tightAnchor.notationTop - safeGap})`);
console.log(`  ✓ Scenario B: Tight measure safely clamped above notation lines`);

console.log('✅ Test 2 Passed: Strict non-occlusion mathematical invariant verified.\n');

// ----------------------------------------------------
// Test 3: Header Conciseness (Removal of Redundant M{n})
// ----------------------------------------------------
console.log('🧪 Test 3: Header Conciseness (Removal of Redundant M{n})...');

const overlayHtml = defaultOverlay.domElement.innerHTML;
assert.ok(overlayHtml.includes('P6'), 'Overlay header must contain position badge P6');
assert.ok(!overlayHtml.includes('M7 · P6'), 'Overlay header must NOT include redundant M7 prefix');
console.log('  ✓ Header simplified to "P6 · 6–9" (no redundant M7 label)');
console.log('✅ Test 3 Passed: Header conciseness verified.\n');

// ----------------------------------------------------
// Test 4: CoachPanel Compact Mode Default & Sizing
// ----------------------------------------------------
console.log('🧪 Test 4: CoachPanel Compact Mode Default & Sizing...');

global.localStorage.clear();
const panel = new CoachPanel(fakeFingeringResult);

assert.strictEqual(panel.uiMode, 'compact', 'Default uiMode must be "compact"');
assert.ok(panel.panelEl.classList.contains('sfc-compact'), 'Panel container must have .sfc-compact class');

const bodyHtml = panel.panelEl.querySelector('#sfc-panel-body').innerHTML;
assert.ok(bodyHtml.includes('sfc-step-strip-compact'), 'Step strip must have compact styling class');
assert.ok(!bodyHtml.includes('sfc-beats-row'), 'Redundant event pill row must be omitted in compact mode');

console.log('  ✓ CoachPanel initializes in Compact Mode by default');
console.log('  ✓ Redundant .sfc-beats-row omitted to preserve vertical viewport');
console.log('✅ Test 4 Passed: CoachPanel compact mode verified.\n');

// ----------------------------------------------------
// Test 5: Windowed Finger Flow in Compact Mode
// ----------------------------------------------------
console.log('🧪 Test 5: Windowed Finger Flow in Compact Mode...');

// Set current event to Ev 4 (middle of measure with 8 events)
panel.currentEventIndex = 4;
panel.updateView();

const bodyEl = document.getElementById('sfc-panel-body');
const compactHtml = bodyEl.innerHTML;
const compactStepMatches = compactHtml.match(/class="[^"]*sfc-step-item[^"]*"/g) || [];

// In compact mode, beats are filtered to [cur - 1, cur + 2] = Ev 3, 4, 5, 6 (4 items instead of 8)
assert.strictEqual(compactStepMatches.length, 4, `Windowed Finger Flow should show 4 items around Ev 4 (got ${compactStepMatches.length})`);
assert.ok(compactHtml.includes('data-event="3"'), 'First visible item in window should be Ev 3');
assert.ok(compactHtml.includes('data-event="4"'), 'Second item in window should be active Ev 4');
assert.ok(compactHtml.includes('data-event="5"'), 'Third item in window should be Ev 5');
assert.ok(compactHtml.includes('data-event="6"'), 'Fourth item in window should be Ev 6');
assert.ok(!compactHtml.includes('data-event="1"'), 'Ev 1 should be outside window');
assert.ok(!compactHtml.includes('data-event="8"'), 'Ev 8 should be outside window');

console.log('  ✓ Finger Flow correctly windowed to [Ev 3 ➔ [Ev 4] ➔ Ev 5 ➔ Ev 6]');
console.log('✅ Test 5 Passed: Windowed Finger Flow verified.\n');

// ----------------------------------------------------
// Test 6: Expanded Mode Toggle & Full Event View
// ----------------------------------------------------
console.log('🧪 Test 6: Expanded Mode Toggle & Full Event View...');

panel.toggleExpand();
assert.strictEqual(panel.uiMode, 'expanded', 'Mode must switch to expanded');
assert.ok(panel.panelEl.classList.contains('sfc-expanded'), 'Panel must have .sfc-expanded class');
assert.strictEqual(global.localStorage.getItem('sfc_coach_ui_mode'), 'expanded', 'Expanded mode saved to localStorage');

const expandedHtml = document.getElementById('sfc-panel-body').innerHTML;
const expandedStepMatches = expandedHtml.match(/class="[^"]*sfc-step-item[^"]*"/g) || [];
assert.strictEqual(expandedStepMatches.length, 8, `Expanded mode should show all 8 beats (got ${expandedStepMatches.length})`);
assert.ok(expandedHtml.includes('sfc-beats-row'), 'Expanded mode restores .sfc-beats-row selector pills');

// Toggle back to compact
panel.toggleExpand();
assert.strictEqual(panel.uiMode, 'compact', 'Mode must toggle back to compact');
assert.ok(panel.panelEl.classList.contains('sfc-compact'), 'Panel restores .sfc-compact class');

console.log('  ✓ Toggle expand/compact switches views and persists to localStorage');
console.log('✅ Test 6 Passed: Expanded mode toggle verified.\n');

// ----------------------------------------------------
// Test 7: Minimized Floating FAB Mode
// ----------------------------------------------------
console.log('🧪 Test 7: Minimized Floating FAB Mode...');

panel.currentMeasureIndex = 6; // M7
panel.currentEventIndex = 3;   // Ev3
panel.toggleMinimize(true);

assert.strictEqual(panel.isMinimized, true, 'Panel must be in minimized state');
assert.ok(panel.panelEl.classList.contains('sfc-hidden'), 'Panel must be hidden');
assert.ok(!panel.fabEl.classList.contains('sfc-hidden'), 'FAB must be visible');

const fabText = panel.fabEl.querySelector('#sfc-fab-text');
assert.ok(fabText, 'FAB text element must exist');
assert.strictEqual(fabText.textContent, 'M7 Ev3', 'FAB must display current M7 Ev3 summary');

// Restore from FAB
panel.toggleMinimize(false);
assert.strictEqual(panel.isMinimized, false, 'Panel must be restored');
assert.ok(!panel.panelEl.classList.contains('sfc-hidden'), 'Panel must be visible again');
assert.ok(panel.fabEl.classList.contains('sfc-hidden'), 'FAB must be hidden again');

console.log('  ✓ Minimized mode renders compact floating FAB with M7 Ev3');
console.log('  ✓ Restoring immediately brings back full panel without state loss');
console.log('✅ Test 7 Passed: Minimized FAB mode verified.\n');

// ----------------------------------------------------
// Test 8: Snap Left / Snap Right Controls & Persistence
// ----------------------------------------------------
console.log('🧪 Test 8: Snap Left / Snap Right Controls & Persistence...');

panel.snapLeft();
assert.strictEqual(panel.currentSnap, 'left', 'Snap position must be left');
assert.strictEqual(panel.panelEl.style.left, '16px', 'Left style must be 16px');
assert.strictEqual(panel.panelEl.style.right, 'auto', 'Right style must be auto');
assert.strictEqual(global.localStorage.getItem('sfc_coach_snap'), 'left', 'Snap left persisted');

panel.snapRight();
assert.strictEqual(panel.currentSnap, 'right', 'Snap position must be right');
assert.strictEqual(panel.panelEl.style.right, '16px', 'Right style must be 16px');
assert.strictEqual(panel.panelEl.style.left, 'auto', 'Left style must be auto');
assert.strictEqual(global.localStorage.getItem('sfc_coach_snap'), 'right', 'Snap right persisted');

console.log('  ✓ Snap Left/Right moves panel cleanly and persists to localStorage');
console.log('✅ Test 8 Passed: Snap controls verified.\n');

console.log('====================================================');
console.log('🏆 ALL PHASE 3.4.3 NON-OCCLUSION & COMPACT TESTS PASSED!');
console.log('====================================================\n');
