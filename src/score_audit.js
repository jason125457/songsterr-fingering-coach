/**
 * score_audit.js
 *
 * Report-only sanity check for a normalized track. It never edits the score: it only flags
 * measures that are likely wrong, which matters for AI-generated Songsterr tabs where the notes
 * themselves can be off. Every flag carries a severity and a plain-language reason.
 *
 * Signals (cheapest / most objective first):
 * 1. rhythm      - beat durations do not add up to the time signature
 * 2. unplayable  - a chord no hand shape can reach (engine had to fall back)
 * 3. out-of-key  - many notes outside the key signature (may also be a deliberate borrowed chord)
 * 4. odd-one-out - measure differs by one note from the identical measures around it
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./fingering_engine.js'));
  } else {
    root.ScoreAudit = factory(root.FingeringEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (FingeringEngine) {
  'use strict';

  const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];
  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  const isSoundingNote = (n) => n && !n.isRest && !n.isDead && n.string >= 0 && n.fret >= 0;
  const mod12 = (n) => ((n % 12) + 12) % 12;

  /** Pitch classes of the key's scale, or null when the key is unknown */
  function scaleOf(key) {
    if (!key || typeof key.accidentals !== 'number') return null;
    const majorTonic = mod12(key.accidentals * 7);
    return { tonic: key.mode === 'minor' ? mod12(majorTonic - 3) : majorTonic, set: new Set(MAJOR_STEPS.map(s => mod12(majorTonic + s))) };
  }

  function measureLength(m) {
    const [n, d] = String(m.timeSignature || '4/4').split('/').map(Number);
    return n > 0 && d > 0 ? n / d : 1;
  }

  /** Total length of the longest voice in the measure, from the rational source durations */
  function playedLength(m) {
    const byVoice = new Map();
    (m.beats || []).forEach((b) => {
      (b.sources || []).forEach((s) => {
        const v = s.duration && typeof s.duration.value === 'number' ? s.duration.value : 0;
        byVoice.set(s.voiceIndex, (byVoice.get(s.voiceIndex) || 0) + v);
      });
    });
    return byVoice.size ? Math.max(...byVoice.values()) : null;
  }

  const sameBeatNotes = (b) => (b.notes || []).filter(isSoundingNote).map(n => n.string + ':' + n.fret).sort().join(',');
  const measureSignature = (m) => (m.beats || []).map(sameBeatNotes).join('|');

  function noteDistance(a, b) {
    const sa = new Set(a.split('|').flatMap((x, i) => x ? x.split(',').map(n => i + '/' + n) : []));
    const sb = new Set(b.split('|').flatMap((x, i) => x ? x.split(',').map(n => i + '/' + n) : []));
    let diff = 0;
    sa.forEach(x => { if (!sb.has(x)) diff++; });
    sb.forEach(x => { if (!sa.has(x)) diff++; });
    return diff;
  }

  /**
   * @param {Object} normalizedTrack output of TabNormalizer
   * @returns {{measures: Array<{measureNumber, severity, issues: Array}>, summary: Object}}
   */
  function auditTrack(normalizedTrack, options = {}) {
    const tuning = normalizedTrack?.track?.tuning || DEFAULT_TUNING;
    const measures = normalizedTrack?.measures || [];
    const awkward = FingeringEngine ? FingeringEngine.WEIGHTS.AWKWARD_STRETCH : Infinity;
    const outOfKeyRatio = options.outOfKeyRatio ?? 0.3;
    const signatures = measures.map(measureSignature);

    const flagged = [];
    measures.forEach((m, mi) => {
      const issues = [];

      // 1. Rhythm
      const len = playedLength(m);
      const expected = measureLength(m);
      if (len !== null && Math.abs(len - expected) > 1e-9) {
        issues.push({ type: 'rhythm', severity: 'high', reason: `拍數加起來是 ${+(len / expected * 100).toFixed(0)}% 小節長度（應為 100%）` });
      }

      // 2. Unplayable chords
      if (FingeringEngine) {
        const bad = (m.beats || []).filter((b) => {
          const fretted = (b.notes || []).filter(n => !n.isRest && !n.isDead && n.fret > 0);
          if (fretted.length < 2) return false;
          const cands = FingeringEngine.generateBeatCandidates(b.notes.filter(n => !n.isDead));
          return cands.every(c => c.intraCost >= awkward);
        });
        if (bad.length) issues.push({ type: 'unplayable', severity: 'high', reason: `${bad.length} 拍的和弦按法沒有任何合理手型`, beats: bad.map(b => b.eventIndex) });
      }

      // 3. Out of key
      const scale = scaleOf(m.keySignature);
      if (scale) {
        const pcs = (m.beats || []).flatMap(b => (b.notes || []).filter(isSoundingNote).map(n => mod12(tuning[n.string] + n.fret)));
        const out = pcs.filter(pc => !scale.set.has(pc));
        if (pcs.length && out.length / pcs.length >= outOfKeyRatio) {
          const names = Array.from(new Set(out)).map(pc => NOTE_NAMES[pc]);
          issues.push({ type: 'out-of-key', severity: 'low', reason: `${Math.round(out.length / pcs.length * 100)}% 的音不在調內（${names.join('、')}）`, notes: names });
        }
      }

      // 4. Odd one out: nearly identical to both neighbours' repeated pattern but for a note or two
      const sig = signatures[mi];
      if (sig && mi > 0 && mi < measures.length - 1) {
        const prev = signatures[mi - 1];
        const next = signatures[mi + 1];
        if (prev && prev === next && sig !== prev) {
          const diff = noteDistance(sig, prev);
          if (diff > 0 && diff <= 4) issues.push({ type: 'odd-one-out', severity: 'medium', reason: `前後兩小節完全相同，唯獨這小節有 ${diff} 個音不同` });
        }
      }

      if (issues.length) {
        const rank = { high: 3, medium: 2, low: 1 };
        const top = issues.reduce((a, i) => Math.max(a, rank[i.severity]), 0);
        flagged.push({ measureNumber: m.measureNumber, severity: ['', 'low', 'medium', 'high'][top], issues });
      }
    });

    const summary = { totalMeasures: measures.length, flagged: flagged.length };
    ['high', 'medium', 'low'].forEach(s => { summary[s] = flagged.filter(f => f.severity === s).length; });
    return { measures: flagged, summary };
  }

  return { auditTrack, scaleOf };
});
