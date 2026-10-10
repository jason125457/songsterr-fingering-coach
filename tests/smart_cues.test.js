/**
 * smart_cues.test.js
 *
 * Inline cue density rules (dense Songsterr layouts, light/dark themes):
 * 1. 'smart' mode shows a chord diagram wherever the chord shape changes (even at the same
 *    position), skips exact repeats, reminds at each line start; rests never get a cue
 * 2. 'all' keeps the every-measure contract, 'off' shows nothing
 * 3. The chord diagram is used wherever it fits between the previous line's drawing and the
 *    staff; the one-line chip is only a last resort
 * 4. Chip text: position + fret span, shift path, narrow fallback
 * 5. Theme follows the first opaque background behind the score
 */

const assert = require('assert');
const OverlayManager = require('../src/ui/overlay_manager');
const MeasureOverlay = require('../src/ui/measure_overlay');

console.log('\n🎸 ====================================================');
console.log('🎸 SMART INLINE CUES: DENSITY, FIT & THEME TESTS');
console.log('🎸 ====================================================\n');

const note = (string, fret, finger = 1) => ({ string, fret, isRest: false, recommendedFinger: finger });
const rest = () => ({ string: -1, fret: -1, isRest: true });
const beat = (pos, notes, ev) => ({ eventIndex: ev, beatNumber: ev, recommendedPosition: pos, notes });
// measure(n, [[position, notes], ...])
const measure = (n, beats) => ({
  measureNumber: n,
  recommendedPosition: beats[0][0],
  beats: beats.map(([pos, notes], i) => beat(pos, notes, i + 1))
});

const song = [
  measure(1, [[7, [note(2, 8)]], [7, [note(1, 9, 2)]]]),          // P7 chord A (first: change)
  measure(2, [[7, [note(2, 8)]], [7, [note(1, 9, 2)]]]),          // exact repeat of A -> skipped
  measure(3, [[7, [rest()]]]),                                      // rest
  measure(4, [[7, [note(3, 9, 3)]]]),                               // same position, new chord -> change
  measure(5, [[7, [note(2, 8)]], [10, [note(1, 10)]]]),             // P7 -> P10 inside the measure
  measure(6, [[10, [note(1, 12, 3)]]]),                             // P10 chord
  measure(7, [[10, [note(1, 12, 3)]]]),                             // repeat, but first on its line
  measure(8, [[1, [note(4, 0, 0)]]]),                               // open string only
  measure(9, [[10, [note(1, 12, 3)]]])                              // repeat after open-only measure
];

function managerFor(mode, lineOf = {}) {
  const mgr = new OverlayManager({ displayMode: mode });
  mgr.setFingeringResult({ measures: song });
  // Pretend measures sit on score lines (geometry anchors carry lineIndex)
  Object.entries(lineOf).forEach(([m, line]) => mgr.anchorMap.set(Number(m), { geometry: { lineIndex: line } }));
  return mgr;
}

// ---------------------------------------------------------------
console.log('🧪 Test 1: Smart mode shows only position changes and line-start reminders...');
{
  const mgr = managerFor('smart', { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1, 9: 1 });
  const lineStarts = mgr.getLineStartMeasures();
  const shown = {};
  song.forEach(m => { const c = mgr.cueFor(m.measureNumber, lineStarts); if (c) shown[m.measureNumber] = c.emphasis; });
  assert.deepStrictEqual(shown, { 1: 'change', 4: 'change', 5: 'change', 6: 'change', 7: 'continue' },
    `unexpected smart cues: ${JSON.stringify(shown)}`);
  console.log('  ✓ new chords shown (m4 at the same position too), repeats/rest/open-only skipped, m7 reminds at line start');
}

// ---------------------------------------------------------------
console.log('🧪 Test 2: All and Off modes...');
{
  const all = managerFor('all');
  assert.ok(song.every(m => all.cueFor(m.measureNumber, new Set())), "'all' shows every measure");
  const off = managerFor('off');
  assert.ok(song.every(m => !off.cueFor(m.measureNumber, new Set())), "'off' shows nothing");
  const mgr = managerFor('all');
  mgr.setDisplayMode('bogus');
  assert.strictEqual(mgr.displayMode, 'all', 'invalid modes are ignored');
  console.log("  ✓ 'all' = every measure, 'off' = none, invalid mode ignored");
}

// ---------------------------------------------------------------
console.log('🧪 Test 3: Chord diagram wherever it fits; chip only as a last resort...');
{
  const mgr = new OverlayManager({ density: 'small' });
  mgr.setFingeringResult({ measures: song });
  // Real Songsterr compact layout: 34px svg band, but 51px down to the previous line's beams
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134, freeTop: 83 }, 1), 'map', '51px free -> chord diagram');
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134 }, 1), 'map', 'first line (nothing above) -> chord diagram');
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134, freeTop: 100 }, 1), 'chip', '34px free -> chip');
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134, freeTop: 83 }, 5), 'map', 'shift measure: two shrunk diagrams fit the same 51px');
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134, freeTop: 85 }, 5), 'chip', 'shift measure falls back when even that does not fit');
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 100 }, 1), 'card', 'legacy target without geometry keeps the classic card');
  mgr.density = 'large';
  assert.strictEqual(mgr.variantFor({ top: 100, notationTop: 134, freeTop: 83 }, 1), 'chip', 'large density needs more room');
  console.log('  ✓ 51px -> diagram, 34px -> chip, shift measures too, density-aware, legacy -> card');
}

// ---------------------------------------------------------------
console.log('🧪 Test 4: Chip text...');
{
  global.document = { createElement: () => ({ className: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} }, setAttribute() {} }) };
  try {
    const single = new MeasureOverlay(song[0], { variant: 'chip', anchorWidth: 200 });
    assert.ok(/P7<\/span><span class="sfc-chip-span">8–9/.test(single.domElement.innerHTML), `single position chip: ${single.domElement.innerHTML}`);
    const shift = new MeasureOverlay(song[4], { variant: 'chip', anchorWidth: 200 });
    assert.ok(shift.domElement.innerHTML.includes('P7→P10') && shift.domElement.innerHTML.includes('sfc-chip-shift'), 'shift chip shows the path');
    const narrow = new MeasureOverlay(song[0], { variant: 'chip', anchorWidth: 60 });
    assert.ok(!narrow.domElement.innerHTML.includes('sfc-chip-span'), 'narrow measure drops the fret span');
    assert.deepStrictEqual(MeasureOverlay.frettedPositions(song[3]), [7], 'rest beats do not add positions');
    console.log('  ✓ "P7 8–9", "P7→P10", narrow "P7"');
  } finally {
    delete global.document;
  }
}

// ---------------------------------------------------------------
console.log('🧪 Test 5: Theme follows the score background...');
{
  global.window = { getComputedStyle: (el) => ({ backgroundColor: el.bg }) };
  try {
    const body = { bg: 'rgb(28, 29, 31)', parentElement: null };
    const section = { bg: 'rgba(0, 0, 0, 0)', parentElement: body };
    const svg = { bg: 'rgba(0, 0, 0, 0)', parentElement: section };
    const mgr = new OverlayManager({});
    mgr.syncTheme(svg);
    assert.strictEqual(mgr.theme, 'dark', 'transparent layers skipped, dark body detected');
    body.bg = 'rgb(255, 255, 255)';
    mgr.syncTheme(svg);
    assert.strictEqual(mgr.theme, 'light', 'white body -> light');
    console.log('  ✓ Dark Songsterr theme -> dark cues; light -> light');
  } finally {
    delete global.window;
  }
}

console.log('\n====================================================');
console.log('🏆 ALL SMART INLINE CUE TESTS PASSED!');
console.log('====================================================\n');
