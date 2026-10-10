/**
 * content_runtime.test.js
 *
 * Runs the real content.js inside a Node vm sandbox (fake clock, fake fetch, fake DOM) to cover
 * the runtime orchestration that the other suites cannot reach:
 * 1. Initial load mounts the panel once and downloads the part once
 * 2. Re-requesting the track already on screen does not rebuild the UI
 * 3. A failing download backs off exponentially instead of retrying on every 400ms poll,
 *    hides the previous track's overlays, and returning to a working track restores it
 * 4. Unsupported tracks show a card; switching back to the guitar track restores fingerings
 * 5. Non-song pages hide the coach; returning to the same song shows it again
 * 6. A download that finishes after the user navigated away is discarded
 * 7. Song metadata from user-submitted content is HTML-escaped by CoachPanel
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const PlaybackSyncController = require('../src/controller/playback_sync_controller');

const CONTENT_SRC = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const PART_RAW = JSON.parse(fs.readFileSync(path.join(__dirname, 'taiziwan_part0_raw.json'), 'utf8'));

const GUITAR_TUNING = [64, 59, 55, 50, 45, 40];
const TRACKS = [
  { partId: 0, name: 'Lead Guitar', instrument: 'Electric Guitar (clean)', instrumentId: 27, tuning: GUITAR_TUNING },
  { partId: 1, name: 'Rhythm Guitar', instrument: 'Distortion Guitar', instrumentId: 30, tuning: GUITAR_TUNING },
  { partId: 2, name: 'Drums', instrument: 'Drums', instrumentId: 1024, isDrums: true },
  { partId: 3, name: 'Clean Guitar', instrument: 'Electric Guitar (clean)', instrumentId: 27, tuning: GUITAR_TUNING }
];

function metaFor(songId) {
  return { songId, revisionId: 7, image: 'img', title: `Song ${songId}`, artist: 'Artist', tracks: TRACKS, defaultTrack: 0 };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

/**
 * Build a sandbox around content.js. Everything the script touches on the page is faked here.
 */
function createRuntime({ pathname }) {
  const rt = {
    now: 1_000_000,
    timers: [],
    nextTimerId: 1,
    pathname,
    domPartId: 0,              // what Songsterr's DOM reports as the selected part
    failingParts: new Set(),   // part ids whose CDN download fails
    cdnRequests: [],
    apiRequests: [],
    pendingCdn: null,          // when set, CDN responses wait for rt.releaseCdn()
    panels: [],
    overlayManagers: [],
    mutationCallbacks: [],
    windowListeners: {}
  };

  // ---- Fake UI collaborators (record what content.js asks of them) ----
  class FakeCoachPanel {
    constructor(result) {
      this.calls = [['construct', result.measures.length]];
      this.mode = 'follow';
      rt.panels.push(this);
    }
    updateData(result) { this.calls.push(['updateData', result.track?.partId]); }
    showUnsupported(track, reason) { this.calls.push(['showUnsupported', reason]); }
    showLoading(msg) { this.calls.push(['showLoading', msg]); }
    setPageVisible(v) { this.calls.push(['setPageVisible', v]); }
    getMode() { return this.mode; }
    onResumeFollow() {}
    onUserAction() {}
    syncPlayback() {}
  }
  class FakeOverlayManager {
    constructor(opts) { this.calls = [['construct']]; rt.overlayManagers.push(this); }
    setFingeringResult(result) { this.calls.push(['setFingeringResult', result.track?.partId]); }
    clearAll() { this.calls.push(['clearAll']); }
    setDensity() {}
    syncPlayback() {}
  }
  class FakePlaybackObserver {
    start() { return this; }
    on() { return this; }
    off() { return this; }
    reset() { return this; }
    getCurrentPosition() { return null; }
  }

  // ---- Fake DOM ----
  const partEl = { getAttribute: (k) => (k === 'data-part-id' && rt.domPartId !== null ? String(rt.domPartId) : null) };
  const document = {
    getElementById: (id) => {
      if (id === 'state') {
        const m = rt.pathname.match(/-s(\d+)/);
        return m ? { textContent: JSON.stringify({ meta: { current: metaFor(Number(m[1])) } }) } : null;
      }
      return null;
    },
    querySelector: (sel) => (sel === '[data-part-id]' && rt.domPartId !== null ? partEl : null),
    addEventListener: () => {}
  };
  const location = {
    get pathname() { return rt.pathname; },
    get href() { return 'https://www.songsterr.com' + rt.pathname; },
    search: ''
  };

  class FakeMutationObserver {
    constructor(cb) { rt.mutationCallbacks.push(cb); }
    observe() {}
    disconnect() {}
  }

  const response = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(JSON.stringify(body)) });
  const fetch = async (url) => {
    if (url.includes('/api/meta/')) {
      rt.apiRequests.push(url);
      return response(metaFor(Number(url.match(/meta\/(\d+)/)[1])));
    }
    rt.cdnRequests.push(url);
    const partId = Number(url.match(/\/(\d+)\.json$/)[1]);
    if (rt.pendingCdn) await rt.pendingCdn;
    if (rt.failingParts.has(partId)) throw new TypeError('simulated network failure');
    return response(Object.assign({}, PART_RAW, { partId, name: TRACKS[partId].name, instrument: TRACKS[partId].instrument }));
  };

  const addTimer = (fn, ms, interval) => {
    const id = rt.nextTimerId++;
    rt.timers.push({ id, at: rt.now + (ms || 0), fn, interval: interval ? (ms || 1) : 0 });
    return id;
  };

  const window = {
    addEventListener: (type, fn) => { (rt.windowListeners[type] = rt.windowListeners[type] || []).push(fn); }
  };

  const sandbox = {
    window, document, location, fetch, console: { log() {}, warn() {}, error() {} },
    MutationObserver: FakeMutationObserver,
    URLSearchParams,
    setTimeout: (fn, ms) => addTimer(fn, ms, false),
    setInterval: (fn, ms) => addTimer(fn, ms, true),
    clearTimeout: (id) => { rt.timers = rt.timers.filter(t => t.id !== id); },
    clearInterval: (id) => { rt.timers = rt.timers.filter(t => t.id !== id); },
    performance: { now: () => rt.now },
    Date: class extends Date { static now() { return rt.now; } },
    TabNormalizer, FingeringEngine, PlaybackSyncController,
    CoachPanel: FakeCoachPanel,
    OverlayManager: FakeOverlayManager,
    PlaybackObserver: FakePlaybackObserver
  };
  window.location = location;
  vm.createContext(sandbox);
  vm.runInContext(CONTENT_SRC, sandbox, { filename: 'content.js' });
  rt.api = window.__SONGSTERR_FINGERING_COACH__;

  /** Advance the fake clock, firing due timers in order and letting async work settle */
  rt.advance = async (ms) => {
    const end = rt.now + ms;
    for (;;) {
      const due = rt.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      rt.now = Math.max(rt.now, due.at);
      if (due.interval) due.at += due.interval; else rt.timers = rt.timers.filter(t => t !== due);
      due.fn();
      for (let i = 0; i < 10; i++) await flush();
    }
    rt.now = end;
    for (let i = 0; i < 10; i++) await flush();
  };

  /** Simulate an SPA URL change as seen by content.js's MutationObserver */
  rt.navigate = async (newPath) => {
    rt.pathname = newPath;
    rt.mutationCallbacks.forEach(cb => cb([]));
    await rt.advance(0);
  };

  rt.panel = () => rt.panels[rt.panels.length - 1];
  rt.overlays = () => rt.overlayManagers[rt.overlayManagers.length - 1];
  rt.callNames = (obj) => obj.calls.map(c => c[0]);
  return rt;
}

async function run() {
  console.log('\n🎸 ====================================================');
  console.log('🎸 CONTENT SCRIPT RUNTIME ORCHESTRATION TESTS');
  console.log('🎸 ====================================================\n');

  // ---------------------------------------------------------------
  console.log('🧪 Test 1: Initial load mounts once and downloads once...');
  const rt = createRuntime({ pathname: '/a/wsa/artist-song-tab-s100' });
  await rt.advance(2000);
  assert.strictEqual(rt.panels.length, 1, 'exactly one CoachPanel mounted');
  assert.strictEqual(rt.cdnRequests.length, 1, 'part JSON downloaded once');
  assert.strictEqual(rt.api.getActivePartId(), 0);
  assert.strictEqual(rt.api.getLastFingeringResult().measures.length, PART_RAW.measures.length);
  console.log('  ✓ Panel mounted, 1 CDN request, active part 0');

  // ---------------------------------------------------------------
  console.log('🧪 Test 2: Re-requesting the displayed track is a no-op...');
  // setPageVisible(true) is a cheap visibility write on every extraction, not a re-render
  const panelRenders = () => rt.panel().calls.filter(c => c[0] !== 'setPageVisible').length;
  const panelCallsBefore = panelRenders();
  const overlayCallsBefore = rt.overlays().calls.length;
  await rt.api.extract();
  await rt.advance(1000);
  assert.strictEqual(panelRenders(), panelCallsBefore, 'panel not re-rendered');
  assert.strictEqual(rt.overlays().calls.length, overlayCallsBefore, 'overlays not rebuilt');
  assert.strictEqual(rt.cdnRequests.length, 1, 'no extra download');
  console.log('  ✓ No panel/overlay rebuild and no extra download');

  // ---------------------------------------------------------------
  console.log('🧪 Test 3: Failing download backs off and recovers...');
  rt.failingParts.add(1);
  const cdnBefore = rt.cdnRequests.length;
  rt.domPartId = 1;
  await rt.advance(9000);
  const part1Attempts = rt.cdnRequests.slice(cdnBefore).filter(u => u.endsWith('/1.json')).length;
  assert.ok(part1Attempts >= 2 && part1Attempts <= 4, `expected 2-4 backed-off attempts in 9s, got ${part1Attempts} (unthrottled polling would be ~22)`);
  assert.ok(rt.panel().calls.some(c => c[0] === 'showUnsupported' && /simulated network failure/.test(c[1])), 'error card shown');
  assert.ok(rt.callNames(rt.overlays()).includes('clearAll'), 'previous track overlays cleared');
  console.log(`  ✓ ${part1Attempts} attempts in 9s, error card shown, stale overlays cleared`);

  const restoreFrom = rt.overlays().calls.length;
  rt.domPartId = 0;
  await rt.advance(1000);
  assert.strictEqual(rt.api.getActivePartId(), 0, 'back on part 0');
  assert.ok(rt.overlays().calls.slice(restoreFrom).some(c => c[0] === 'setFingeringResult' && c[1] === 0), 'part 0 fingerings pushed again');
  console.log('  ✓ Switching back to the working track restores it immediately (from cache)');

  // ---------------------------------------------------------------
  console.log('🧪 Test 4: Unsupported track, then back to guitar...');
  rt.domPartId = 2;
  await rt.advance(1000);
  assert.ok(rt.panel().calls.some(c => c[0] === 'showUnsupported' && /Drums/.test(c[1])), 'drums card shown');
  const afterDrums = rt.overlays().calls.length;
  rt.domPartId = 0;
  await rt.advance(1000);
  assert.ok(rt.overlays().calls.slice(afterDrums).some(c => c[0] === 'setFingeringResult' && c[1] === 0), 'guitar fingerings restored after drums');
  console.log('  ✓ Drums card shown; returning to guitar restores fingerings');

  // ---------------------------------------------------------------
  console.log('🧪 Test 5: Non-song page hides the coach; returning restores it...');
  await rt.navigate('/a/wsa/artist-tabs-a20');
  rt.domPartId = null;
  await rt.advance(1000);
  assert.deepStrictEqual(rt.panel().calls.filter(c => c[0] === 'setPageVisible').pop(), ['setPageVisible', false], 'panel hidden on artist page');
  assert.strictEqual(rt.overlays().calls[rt.overlays().calls.length - 1][0], 'clearAll', 'overlays cleared on artist page');
  const beforeReturn = rt.overlays().calls.length;
  rt.domPartId = 0;
  await rt.navigate('/a/wsa/artist-song-tab-s100');
  await rt.advance(1000);
  assert.deepStrictEqual(rt.panel().calls.filter(c => c[0] === 'setPageVisible').pop(), ['setPageVisible', true], 'panel shown again');
  assert.ok(rt.overlays().calls.slice(beforeReturn).some(c => c[0] === 'setFingeringResult'), 'same song re-displayed');
  console.log('  ✓ Hidden on artist page, restored on return to the same song');

  // ---------------------------------------------------------------
  console.log('🧪 Test 6: Download finishing after navigation is discarded...');
  let releaseCdn;
  rt.pendingCdn = new Promise(resolve => { releaseCdn = resolve; });
  rt.domPartId = 3;
  await rt.advance(500);                      // poll starts downloading part 3 of song 100
  assert.ok(rt.cdnRequests[rt.cdnRequests.length - 1].endsWith('/3.json'), 'download of part 3 in flight');
  const beforeStale = rt.overlays().calls.length;
  rt.domPartId = null;
  await rt.navigate('/a/wsa/artist-tabs-a20'); // user leaves while it downloads
  rt.pendingCdn = null;
  releaseCdn();
  await rt.advance(100);
  assert.ok(!rt.overlays().calls.slice(beforeStale).some(c => c[0] === 'setFingeringResult' && c[1] === 3), 'stale part 3 result not displayed');
  assert.notStrictEqual(rt.api.getActivePartId(), 3, 'stale part not marked active');
  console.log('  ✓ Late result for a page the user left is not shown');

  // ---------------------------------------------------------------
  console.log('🧪 Test 7: CoachPanel escapes user-submitted metadata...');
  const CoachPanel = require('../src/ui/coach_panel');
  const created = [];
  const mockEl = () => {
    const el = {
      id: '', className: '', innerHTML: '', textContent: '', style: {}, children: [],
      classList: { add() {}, remove() {}, contains: () => false },
      _q: new Map(),
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {},
      remove() {},
      querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, mockEl()); return this._q.get(sel); },
      querySelectorAll() { return []; }
    };
    created.push(el);
    return el;
  };
  global.document = { createElement: mockEl, getElementById: () => null, body: mockEl() };
  try {
    const evil = '<img src=x onerror="alert(1)">';
    const panel = new CoachPanel({ song: { title: evil }, track: { name: evil }, measures: [] });
    const header = panel.panelEl.children[0];
    assert.ok(!header.innerHTML.includes('<img'), 'title/track not injected as HTML');
    assert.ok(header.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'title rendered as escaped text');
    panel.showUnsupported({ name: 'x' }, `非吉他樂器 (${evil})`);
    const body = panel.panelEl.querySelector('#sfc-panel-body');
    assert.ok(!body.innerHTML.includes('<img'), 'unsupported reason not injected as HTML');
    console.log('  ✓ Title, track name and unsupported reason are escaped');
  } finally {
    delete global.document;
  }

  console.log('\n====================================================');
  console.log('🏆 ALL CONTENT SCRIPT RUNTIME TESTS PASSED!');
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('\n❌ CONTENT SCRIPT RUNTIME TEST FAILED:');
  console.error(err);
  process.exit(1);
});
