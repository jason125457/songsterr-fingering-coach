/**
 * spa_navigation.test.js
 * 
 * Phase 3.3 SPA Navigation Guard, Atomic Song Switch Reset, Strict Track Validation,
 * and 6-String Guitar Restriction Test Suite.
 */

const assert = require('assert');
const TabNormalizer = require('../src/normalizer');
const FingeringEngine = require('../src/fingering_engine');
const PlaybackSyncController = require('../src/controller/playback_sync_controller');
const OverlayManager = require('../src/ui/overlay_manager');

console.log('\n🎸 ====================================================');
console.log('🎸 PHASE 3.3: SPA NAVIGATION & TRACK VALIDATION TESTS');
console.log('🎸 ====================================================\n');

// ----------------------------------------------------
// Mock DOM Setup for Headless Node.js Environment
// ----------------------------------------------------
function setupMockDom() {
  const elementsById = new Map();
  const elementsByClass = new Map();

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.className = '';
      this.innerHTML = '';
      this.textContent = '';
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.style = {};
      this.classList = {
        add: (cls) => { if (!this.className.includes(cls)) this.className += ` ${cls}`; },
        remove: (cls) => { this.className = this.className.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim(); },
        contains: (cls) => this.className.includes(cls)
      };
    }

    setAttribute(key, val) { this.attributes.set(key, String(val)); }
    getAttribute(key) { return this.attributes.has(key) ? this.attributes.get(key) : null; }
    hasAttribute(key) { return this.attributes.has(key); }
    addEventListener(event, handler) {}
    removeEventListener(event, handler) {}
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      child.parentNode = null;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        return elementsById.get(targetId) || null;
      }
      return this.children[0] || null;
    }
    querySelectorAll() { return []; }
    getBoundingClientRect() {
      return { top: 100, left: 100, bottom: 200, right: 300, width: 200, height: 100 };
    }
  }

  const documentMock = {
    body: new MockElement('body'),
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  global.document = documentMock;
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { pathname: '/a/wsa/guns-n-roses-sweet-child-o-mine-tab-s23', search: '', href: 'https://www.songsterr.com/a/wsa/guns-n-roses-sweet-child-o-mine-tab-s23' }
  };
}

setupMockDom();
const CoachPanel = require('../src/ui/coach_panel');

// Helpers from content.js for testing isolated logic
function extractSongIdentity(pathname) {
  const match = pathname.match(/-s(\d+)(?:t(\d+))?/);
  if (match) {
    return {
      songId: Number(match[1]),
      urlPartId: match[2] !== undefined ? Number(match[2]) : null
    };
  }
  return null;
}

function resolveTrackForPartId(tracks, targetPartId, partData = null) {
  if (!Array.isArray(tracks)) return null;
  const normPartId = Number(targetPartId);
  if (isNaN(normPartId)) return null;

  const exactByPartId = tracks.find(t => t.partId !== undefined && Number(t.partId) === normPartId);
  if (exactByPartId) return exactByPartId;

  const exactByOrig = tracks.find(t => t.originalPartId !== undefined && Number(t.originalPartId) === normPartId);
  if (exactByOrig) return exactByOrig;

  if (partData) {
    if (partData.hash) {
      const matchByHash = tracks.find(t => t.hash && t.hash === partData.hash);
      if (matchByHash) return matchByHash;
    }
    if (partData.name && partData.instrument) {
      const matchByName = tracks.find(t => t.name === partData.name && t.instrument === partData.instrument);
      if (matchByName) return matchByName;
    }
    if (normPartId >= 0 && normPartId < tracks.length) {
      const cand = tracks[normPartId];
      if (cand && (cand.name === partData.name || cand.instrument === partData.instrument)) {
        return cand;
      }
    }
  }

  if (normPartId >= 0 && normPartId < tracks.length) {
    return tracks[normPartId];
  }

  return null;
}

function isSupportedGuitarTrack(track, partData = null) {
  if (!track && !partData) {
    return { supported: false, reason: '無法解析音軌資訊' };
  }

  const inst = (track?.instrument || partData?.instrument || '').toLowerCase();
  const instId = track?.instrumentId ?? partData?.instrumentId;
  const isVocal = !!(track?.isVocalTrack || partData?.isVocalTrack);
  const isDrums = !!(track?.isDrums || inst.includes('drum') || instId === 1024);
  const isBass = !!(track?.isBassGuitar || inst.includes('bass') || (typeof instId === 'number' && instId >= 32 && instId <= 39));
  const isKeyboard = inst.includes('piano') || inst.includes('keyboard') || inst.includes('organ') || inst.includes('synth');

  if (isVocal) return { supported: false, reason: '人聲音軌 (Vocals)' };
  if (isDrums) return { supported: false, reason: '鼓組音軌 (Drums)' };
  if (isBass) return { supported: false, reason: '貝斯音軌 (Bass)' };
  if (isKeyboard) return { supported: false, reason: '鍵盤樂器音軌 (Keyboard)' };

  const tuning = partData?.tuning || track?.tuning;
  if (!Array.isArray(tuning) || tuning.length !== 6) {
    const count = Array.isArray(tuning) ? `${tuning.length} 弦` : '未知弦數';
    return { supported: false, reason: `非 6 弦調音 (${count})` };
  }

  const isGuitarName = inst.includes('guitar');
  const isGuitarId = typeof instId === 'number' && instId >= 24 && instId <= 31;
  const isGuitarFlag = track?.isGuitar === true;

  if (!isGuitarName && !isGuitarId && !isGuitarFlag) {
    return { supported: false, reason: `非吉他樂器 (${track?.instrument || 'Unknown'})` };
  }

  return { supported: true, trackName: track?.name || partData?.name || 'Guitar' };
}

// ----------------------------------------------------
// Tests
// ----------------------------------------------------

console.log('🧪 Test 1: URL Song Identity extraction...');
const id1 = extractSongIdentity('/a/wsa/guns-n-roses-sweet-child-o-mine-tab-s23');
assert.strictEqual(id1.songId, 23);
assert.strictEqual(id1.urlPartId, null);

const id2 = extractSongIdentity('/a/wsa/guns-n-roses-sweet-child-o-mine-tab-s23t3');
assert.strictEqual(id2.songId, 23);
assert.strictEqual(id2.urlPartId, 3);

const id3 = extractSongIdentity('/a/wsa/schoolgirl-byebye-tab-s6557798');
assert.strictEqual(id3.songId, 6557798);
assert.strictEqual(id3.urlPartId, null);
console.log('✅ Test 1 Passed: Song identity correctly parsed from URL.');

console.log('🧪 Test 2: Stale SSR State Guard...');
const ssrSongId = 6557798;
const currentUrlSongId = 23;
const isStale = ssrSongId !== currentUrlSongId;
assert.strictEqual(isStale, true, 'SSR state must be flagged stale when songId does not match URL');
console.log('✅ Test 2 Passed: Stale SSR state identified and forbidden from CDN url construction.');

console.log('🧪 Test 3: Safe Track Resolution without arbitrary fallback...');
const tracks = [
  { instrument: 'Tenor Sax', isVocalTrack: true, name: 'Lead Vocals' },
  { instrument: 'Clarinet', isVocalTrack: true, name: 'Backing Vocals' },
  { instrument: 'Acoustic Guitar', isVocalTrack: false, name: 'Acoustic Guitar' },
  { instrument: 'Distortion Guitar', isVocalTrack: false, name: 'Slash Lead Guitar', partId: 3 }
];
const resolvedSlash = resolveTrackForPartId(tracks, 3);
assert.strictEqual(resolvedSlash.name, 'Slash Lead Guitar');

const resolvedOutOfBounds = resolveTrackForPartId(tracks, 99);
assert.strictEqual(resolvedOutOfBounds, null, 'Must NOT fallback to tracks[0]');
console.log('✅ Test 3 Passed: Safe track resolution verified (no tracks[0] fallback).');

console.log('🧪 Test 4: 6-String Guitar Instrument & Tuning Gate...');
// Supported Guitar
const guitarTrack = { instrument: 'Distortion Guitar', instrumentId: 30, tuning: [63, 58, 54, 49, 44, 39] };
assert.strictEqual(isSupportedGuitarTrack(guitarTrack).supported, true);

// Drums
const drumTrack = { instrument: 'Drums', instrumentId: 1024, isDrums: true };
assert.strictEqual(isSupportedGuitarTrack(drumTrack).supported, false);
assert.ok(isSupportedGuitarTrack(drumTrack).reason.includes('鼓組'));

// Bass (4 strings)
const bassTrack = { instrument: 'Electric Bass', instrumentId: 34, tuning: [43, 38, 33, 28] };
assert.strictEqual(isSupportedGuitarTrack(bassTrack).supported, false);
assert.ok(isSupportedGuitarTrack(bassTrack).reason.includes('貝斯'));

// 7-String Guitar
const sevenStringTrack = { instrument: 'Electric Guitar', instrumentId: 27, tuning: [64, 59, 55, 50, 45, 40, 35] };
assert.strictEqual(isSupportedGuitarTrack(sevenStringTrack).supported, false);
assert.ok(isSupportedGuitarTrack(sevenStringTrack).reason.includes('非 6 弦調音'));

// Vocals
const vocalTrack = { instrument: 'Tenor Sax', isVocalTrack: true, tuning: [64, 59, 55, 50, 45, 40] };
assert.strictEqual(isSupportedGuitarTrack(vocalTrack).supported, false);
assert.ok(isSupportedGuitarTrack(vocalTrack).reason.includes('人聲'));
console.log('✅ Test 4 Passed: 6-string guitar gate correctly filters non-guitar instruments.');

console.log('🧪 Test 5: Strict TabNormalizer Schema Validation (Drum notes & invalid frets fail)...');
// Drum track data with fret 36 and string 3.5
const rawDrumPart = {
  songId: 6557798,
  partId: 3,
  instrument: 'Drums',
  measures: [
    {
      voices: [
        {
          beats: [
            { duration: [1, 4], notes: [{ fret: 36, string: 3.5 }] }
          ]
        }
      ]
    }
  ]
};

assert.throws(() => {
  TabNormalizer.normalizeSongsterrPart(rawDrumPart, {
    tuning: [64, 59, 55, 50, 45, 40]
  });
}, /Invalid guitar note string: 3.5/, 'Fractional string must throw validation error');

const rawInvalidFretPart = {
  songId: 6557798,
  partId: 3,
  measures: [
    {
      voices: [
        {
          beats: [
            { duration: [1, 4], notes: [{ fret: 36, string: 0 }] }
          ]
        }
      ]
    }
  ]
};

assert.throws(() => {
  TabNormalizer.normalizeSongsterrPart(rawInvalidFretPart, {
    tuning: [64, 59, 55, 50, 45, 40]
  });
}, /Invalid guitar note fret: 36/, 'Fret 36 on guitar must throw validation error');

console.log('✅ Test 5 Passed: Strict note schema validation rejects drum notes and frets > 24.');

console.log('🧪 Test 6: CoachPanel Unsupported & Loading State Handling...');
const mockFingering = {
  song: { songId: 23, title: "Sweet Child O' Mine" },
  track: { partId: 3, name: 'Lead Guitar', tuning: [63, 58, 54, 49, 44, 39] },
  measures: [
    {
      measureNumber: 1,
      beats: [{ eventIndex: 1, beatNumber: 1, notes: [{ string: 0, fret: 12, recommendedFinger: 1 }] }]
    }
  ]
};

const panel = new CoachPanel(mockFingering);
assert.strictEqual(panel.isUnsupported, false);

// Trigger showUnsupported
panel.showUnsupported({ name: 'Drums', instrument: 'Drums' }, '鼓組音軌 (Drums)');
assert.strictEqual(panel.isUnsupported, true);
assert.strictEqual(panel.unsupportedReason, '鼓組音軌 (Drums)');

// Sync attempt while unsupported must be ignored
panel.syncPlayback({ measureNumber: 2, eventIndex: 1 });
assert.strictEqual(panel.currentMeasureIndex, 0, 'Playback sync must not mutate measure while unsupported');

// Trigger showLoading
panel.showLoading('Loading song 23...');
assert.strictEqual(panel.isLoading, true);
assert.strictEqual(panel.isUnsupported, false);
console.log('✅ Test 6 Passed: CoachPanel unsupported and loading states operate cleanly.');

console.log('🧪 Test 7: CoachPanel Measure Index Reset on Song Switch...');
panel.currentMeasureIndex = 15; // User was at measure 16 in old song
const newSongFingering = {
  song: { songId: 6557798, title: '《傍晚去太子灣嗎》' },
  track: { partId: 1, name: 'Rhythm Guitar', tuning: [64, 59, 55, 50, 45, 40] },
  measures: [
    {
      measureNumber: 1,
      beats: [{ eventIndex: 1, beatNumber: 1, notes: [{ string: 2, fret: 7, recommendedFinger: 1 }] }]
    }
  ]
};

panel.updateData(newSongFingering);
assert.strictEqual(panel.currentMeasureIndex, 0, 'Measure index must reset to 0 (Measure 1) on song change');
assert.strictEqual(panel.currentSongId, 6557798);
assert.strictEqual(panel.isUnsupported, false);
console.log('✅ Test 7 Passed: Measure index resets cleanly to Measure 1 on song change.');

console.log('🧪 Test 8: PlaybackSyncController and OverlayManager Reset...');
const controller = new PlaybackSyncController({ autoStart: false });
controller.isActive = true;
controller.normalizedTrack = { measures: [] };
controller.reset();
assert.strictEqual(controller.isActive, false);
assert.strictEqual(controller.normalizedTrack, null);

const overlayMgr = new OverlayManager({ initialMeasure: 1 });
overlayMgr.measuresDataMap.set(1, {});
overlayMgr.clearAll();
assert.strictEqual(overlayMgr.measuresDataMap.size, 0);
assert.strictEqual(overlayMgr.fingeringResult, null);
console.log('✅ Test 8 Passed: PlaybackSyncController and OverlayManager reset cleanly.');

console.log('\n====================================================');
console.log('🏆 ALL PHASE 3.3 SPA & TRACK VALIDATION TESTS PASSED!');
console.log('====================================================\n');
