/**
 * overlay_render_loop.test.js
 *
 * Regression tests for the inline overlay layer's DOM-observer feedback loop:
 * 1. Mutations inside our own UI or on Songsterr's playback cursor never schedule a reconcile
 *    (previously every overlay re-render triggered the next reconcile, forever, even when idle)
 * 2. Score SVG mutations invalidate cached anchors; other page mutations only reposition
 * 3. While a MutationObserver is active, reconciles reuse cached anchors (no full score rescan)
 * 4. Re-applying the same active event does not re-render the overlay
 */

const assert = require('assert');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const OverlayManager = require('../src/ui/overlay_manager');
const MeasureOverlay = require('../src/ui/measure_overlay');

console.log('\n🎸 ====================================================');
console.log('🎸 OVERLAY RENDER LOOP & ANCHOR CACHE REGRESSION TESTS');
console.log('🎸 ====================================================\n');

// Minimal element stand-ins: only what handleMutations inspects
const el = ({ tagName = 'div', id = '', href = null, inside = [] } = {}) => ({
  nodeType: 1,
  tagName,
  id,
  getAttribute: (k) => (k === 'href' ? href : null),
  // `inside` lists selectors this node matches via closest()
  closest: (sel) => (sel.split(',').some(s => inside.includes(s.trim())) ? {} : null),
  querySelector: () => null
});

function managerWithSpy() {
  const mgr = new OverlayManager({}); // no window/document in Node: observers are not attached
  mgr.scheduled = 0;
  mgr.scheduleReconciliation = () => { mgr.scheduled++; };
  mgr.anchorsDirty = false;
  return mgr;
}

// ---------------------------------------------------------------
console.log('🧪 Test 1: Own UI and playback cursor mutations are ignored...');
{
  const mgr = managerWithSpy();
  const overlayNode = el({ inside: ['.sfc-overlay-container', 'svg'] });
  const panelNode = el({ inside: ['#sfc-coach-panel'] });
  const playhead = el({ tagName: 'use', href: '#cursor-playhead-3', inside: ['svg'] });
  const cursorMarker = el({ id: 'cursorMarker', inside: ['svg'] });
  mgr.handleMutations([
    { type: 'childList', target: overlayNode, addedNodes: [], removedNodes: [] },
    { type: 'attributes', target: overlayNode },
    { type: 'attributes', target: panelNode },
    { type: 'attributes', target: playhead },
    { type: 'attributes', target: cursorMarker }
  ]);
  assert.strictEqual(mgr.scheduled, 0, 'no reconcile scheduled for self-inflicted or cursor mutations');
  assert.strictEqual(mgr.anchorsDirty, false, 'anchors stay cached');
  console.log('  ✓ Overlay re-renders, panel updates and cursor motion schedule nothing');
}

// ---------------------------------------------------------------
console.log('🧪 Test 2: Score SVG changes invalidate anchors; other changes only reposition...');
{
  const mgr = managerWithSpy();
  mgr.handleMutations([{ type: 'attributes', target: el({ inside: [] }) }]);
  assert.strictEqual(mgr.scheduled, 1, 'layout change outside the score schedules a reposition');
  assert.strictEqual(mgr.anchorsDirty, false, 'but keeps cached anchors');

  mgr.handleMutations([{ type: 'attributes', target: el({ tagName: 'text', inside: ['svg'] }) }]);
  assert.strictEqual(mgr.anchorsDirty, true, 'mutation inside a score SVG invalidates anchors');

  const mgr2 = managerWithSpy();
  const textNode = { nodeType: 3, parentElement: el({ tagName: 'text', inside: ['svg'] }) };
  mgr2.handleMutations([{ type: 'characterData', target: textNode }]);
  assert.strictEqual(mgr2.anchorsDirty, true, 'measure-number text change invalidates anchors');

  const mgr3 = managerWithSpy();
  const ownContainer = Object.assign(el({ inside: ['.sfc-overlay-container'] }), { classList: { contains: (c) => c === 'sfc-overlay-container' }, querySelector: () => ({}) });
  mgr3.handleMutations([{ type: 'childList', target: el(), addedNodes: [ownContainer], removedNodes: [] }]);
  assert.strictEqual(mgr3.anchorsDirty, false, 'moving our own container into the score host is not a score change');
  console.log('  ✓ SVG content / text changes rescan; unrelated changes reposition only');
}

// ---------------------------------------------------------------
console.log('🧪 Test 3: Reconciles reuse cached anchors while observing...');
{
  const mgr = new OverlayManager({});
  mgr.totalMeasures = 10;
  let scans = 0;
  const realScan = mgr.scanAnchors.bind(mgr);
  mgr.scanAnchors = () => { scans++; return realScan(); };

  mgr.mutationObserver = null; // cannot observe -> must rescan every time
  mgr.reconcileOverlays();
  mgr.reconcileOverlays();
  assert.strictEqual(scans, 2, 'without an observer every reconcile rescans');

  mgr.mutationObserver = { disconnect() {} };
  mgr.anchorsDirty = true;
  mgr.reconcileOverlays();
  mgr.reconcileOverlays();
  mgr.reconcileOverlays();
  assert.strictEqual(scans, 3, 'with an observer only the dirty reconcile rescans');
  console.log('  ✓ 1 rescan for 3 reconciles (scrolls reuse anchors)');
}

// ---------------------------------------------------------------
console.log('🧪 Test 4: Same active event does not re-render the overlay...');
{
  const mockEl = () => ({
    className: '', innerHTML: '', style: {}, parentNode: null, offsetWidth: 58, offsetHeight: 46,
    classList: { add() {}, remove() {} },
    setAttribute() {}
  });
  global.document = { createElement: mockEl };
  try {
    const raw = require('./taiziwan_part0_raw.json');
    const result = FingeringEngine.analyzeTab(TabNormalizer.normalizeSongsterrPart(raw, {}));
    const measure = result.measures.find(m => m.beats.length >= 3);
    const overlay = new MeasureOverlay(measure, { density: 'small', anchorWidth: 220 });
    let renders = 0;
    const realRender = overlay.render.bind(overlay);
    overlay.render = () => { renders++; return realRender(); };

    overlay.setActiveEvent(2);
    overlay.setActiveEvent(2);
    overlay.setActiveEvent(2);
    assert.strictEqual(renders, 1, 're-applying the same event renders once');
    overlay.setActiveEvent(3);
    assert.strictEqual(renders, 2, 'a new event renders');

    // Known anchor width at construction: first positioning must not re-render
    const fresh = new MeasureOverlay(measure, { density: 'small', anchorWidth: 220 });
    let freshRenders = 0;
    const freshRender = fresh.render.bind(fresh);
    fresh.render = () => { freshRenders++; return freshRender(); };
    fresh.updatePosition({ left: 0, right: 220, top: 100, bottom: 200, width: 220, notationTop: 120 }, { scrollX: 0, scrollY: 0 });
    assert.strictEqual(freshRenders, 0, 'no second render on first updatePosition');
    console.log('  ✓ Duplicate setActiveEvent and first positioning skip re-rendering');
  } finally {
    delete global.document;
  }
}

console.log('\n====================================================');
console.log('🏆 ALL OVERLAY RENDER LOOP TESTS PASSED!');
console.log('====================================================\n');
