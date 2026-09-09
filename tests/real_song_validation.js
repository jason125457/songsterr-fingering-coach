/**
 * real_song_validation.js
 * 
 * Phase 2.5 - Real Song Validation
 * Song: Schoolgirl byebye - 傍晚去太子灣嗎 (Songsterr Song ID: 6557798)
 * 
 * Features:
 * - Fetches or uses cached Songsterr data for at least 20 measures
 * - Runs through TabNormalizer + FingeringEngine
 * - Generates detailed beat-by-beat and measure-by-measure fingering breakdown
 * - Specifically detects and flags:
 *   1. Position shifts
 *   2. Same finger rapid string crossings
 *   3. Simultaneous notes / mini-barres
 *   4. Large finger spans / stretches
 *   5. High algorithm cost / human verification candidate segments
 */

const fs = require('fs');
const path = require('path');
const { normalizeSongsterrPart } = require('../src/normalizer');
const { analyzeTab, calculateTransitionCost } = require('../src/fingering_engine');

const CDN_HOSTS = ['dqsljvtekg760', 'd34shlm8p2ums2', 'd3cqchs6g3b5ew'];
const SONG_ID = 6557798;
const REVISION_ID = 8562606;
const IMAGE_HASH = 'v0-3-2-j1ljGukT4OozJIol';
const CACHE_FILE = path.join(__dirname, 'taiziwan_part0_raw.json');

async function getPartData(partId = 0) {
  if (fs.existsSync(CACHE_FILE) && partId === 0) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      // ignore and fetch
    }
  }

  const url = `https://${CDN_HOSTS[0]}.cloudfront.net/${SONG_ID}/${REVISION_ID}/${IMAGE_HASH}/${partId}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch part data: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (partId === 0) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
  return data;
}

function runValidation(targetMeasuresCount = 20) {
  return (async () => {
    console.log('🎸 ====================================================');
    console.log('🎸 PHASE 2.5 REAL SONG VALIDATION: Schoolgirl byebye');
    console.log('🎸 Song: 傍晚去太子灣嗎 (Lead Guitar)');
    console.log('🎸 ====================================================\n');

    const rawPartData = await getPartData(0);
    const meta = {
      songId: SONG_ID,
      title: '傍晚去太子灣嗎',
      artist: 'Schoolgirl byebye',
      partId: 0,
      trackName: 'Lead Guitar',
      instrument: 'Distortion Guitar'
    };

    const normalized = normalizeSongsterrPart(rawPartData, meta);
    const targetSlice = {
      ...normalized,
      measures: normalized.measures.slice(0, targetMeasuresCount)
    };

    const analyzed = analyzeTab(targetSlice);

    return analyzeValidationResults(analyzed);
  })();
}

function analyzeValidationResults(analyzed) {
  const resultData = {
    song: analyzed.song,
    track: analyzed.track,
    totalMeasures: analyzed.measures.length,
    measureSummaries: [],
    allBeats: [],
    positionShifts: [],
    rapidSameFingerCrossings: [],
    simultaneousOrBarreNotes: [],
    largeStretches: [],
    topHighCostSegments: []
  };

  // Flatten beats to calculate transitions and sequential ergonomics
  const flatBeats = [];
  analyzed.measures.forEach((m) => {
    m.beats.forEach((b) => {
      flatBeats.push({
        measureNumber: m.measureNumber,
        beat: b
      });
    });
  });

  // Measure summary & Beat detail collection
  analyzed.measures.forEach((m) => {
    const usedFingersSet = new Set();
    let hasShift = false;

    m.beats.forEach((b) => {
      if (b.isPositionShift) hasShift = true;
      b.notes.forEach((n) => {
        if (!n.isRest && n.recommendedFinger > 0) {
          usedFingersSet.add(n.recommendedFinger);
        }

        resultData.allBeats.push({
          measure: m.measureNumber,
          beat: b.beatNumber,
          timing: b.timing,
          string: n.string,
          stringName: n.stringName,
          stringNumber: n.string + 1,
          fret: n.fret,
          pitch: n.pitch,
          recommendedFinger: n.recommendedFinger,
          recommendedPosition: n.recommendedPosition,
          isPositionShift: n.isPositionShift,
          costBreakdown: b.costBreakdown,
          isRest: n.isRest,
          isTie: n.isTie
        });

        if (n.isPositionShift) {
          resultData.positionShifts.push({
            measure: m.measureNumber,
            beat: b.beatNumber,
            string: n.stringName,
            fret: n.fret,
            recommendedFinger: n.recommendedFinger,
            recommendedPosition: n.recommendedPosition,
            costBreakdown: b.costBreakdown
          });
        }
      });
    });

    const usedFingers = Array.from(usedFingersSet).sort((a, b) => a - b);
    resultData.measureSummaries.push({
      measureNumber: m.measureNumber,
      primaryPosition: m.recommendedPosition,
      hasPositionShift: hasShift,
      usedFingers: usedFingers
    });
  });

  // Analyze sequential beat transitions
  for (let i = 0; i < flatBeats.length; i++) {
    const curr = flatBeats[i];
    const currActive = curr.beat.notes.filter(n => !n.isRest && n.fret > 0);

    // 3. Simultaneous notes / mini-barre detection
    if (currActive.length > 1) {
      const isBarre = currActive.every(n => n.recommendedFinger === currActive[0].recommendedFinger);
      const isSameFret = currActive.every(n => n.fret === currActive[0].fret);
      resultData.simultaneousOrBarreNotes.push({
        measure: curr.measureNumber,
        beat: curr.beat.beatNumber,
        timing: curr.beat.timing,
        notes: currActive.map(n => ({
          string: n.stringName,
          stringNumber: n.string + 1,
          fret: n.fret,
          finger: n.recommendedFinger
        })),
        isBarre,
        isSameFret,
        description: isBarre
          ? `Mini-barre across strings ${currActive.map(n => n.stringName).join('/')} on fret ${currActive[0].fret} using finger ${currActive[0].recommendedFinger}`
          : `Chord / Double-stop across strings ${currActive.map(n => `${n.stringName}${n.fret}(fg:${n.recommendedFinger})`).join(' + ')}`
      });
    }

    // 4. Large finger span / stretch within beat
    currActive.forEach(n => {
      const pos = curr.beat.recommendedPosition;
      if (n.fret === pos - 1 && n.recommendedFinger === 1) {
        resultData.largeStretches.push({
          measure: curr.measureNumber,
          beat: curr.beat.beatNumber,
          string: n.stringName,
          fret: n.fret,
          finger: n.recommendedFinger,
          position: pos,
          type: 'Index Stretch Back',
          description: `Fret ${n.fret} in Pos ${pos}: Finger 1 stretches 1 fret back to pos - 1`
        });
      } else if (n.fret === pos + 4 && n.recommendedFinger === 4) {
        resultData.largeStretches.push({
          measure: curr.measureNumber,
          beat: curr.beat.beatNumber,
          string: n.stringName,
          fret: n.fret,
          finger: n.recommendedFinger,
          position: pos,
          type: 'Pinky Stretch Forward',
          description: `Fret ${n.fret} in Pos ${pos}: Finger 4 stretches forward to fret 12 (pos + 4)`
        });
      }
    });

    if (i > 0) {
      const prev = flatBeats[i - 1];
      const prevActive = prev.beat.notes.filter(n => !n.isRest && n.fret > 0);

      // 2. Same finger rapid string crossing detection
      if (prevActive.length > 0 && currActive.length > 0) {
        for (const p of prevActive) {
          for (const c of currActive) {
            if (p.string !== c.string && p.recommendedFinger === c.recommendedFinger && p.recommendedFinger > 0) {
              resultData.rapidSameFingerCrossings.push({
                from: {
                  measure: prev.measureNumber,
                  beat: prev.beat.beatNumber,
                  string: p.stringName,
                  stringNumber: p.string + 1,
                  fret: p.fret,
                  finger: p.recommendedFinger
                },
                to: {
                  measure: curr.measureNumber,
                  beat: curr.beat.beatNumber,
                  string: c.stringName,
                  stringNumber: c.string + 1,
                  fret: c.fret,
                  finger: c.recommendedFinger
                },
                finger: p.recommendedFinger,
                fretDiff: c.fret - p.fret,
                description: `Finger ${p.recommendedFinger} rapid string hop: ${p.stringName}${p.fret} (M${prev.measureNumber} B${prev.beat.beatNumber}) → ${c.stringName}${c.fret} (M${curr.measureNumber} B${curr.beat.beatNumber})`
              });
            }
          }
        }
      }

      // 5. Cost calculation for finding most uncertain / high-cost transitions
      const cb = curr.beat.costBreakdown || {};
      const totalCost = cb.total !== undefined ? cb.total : 0;
      if (curr.beat.isPositionShift || totalCost > 10) {
        resultData.topHighCostSegments.push({
          measure: curr.measureNumber,
          beat: curr.beat.beatNumber,
          prevMeasure: prev.measureNumber,
          prevBeat: prev.beat.beatNumber,
          fromNotes: prevActive.map(n => `${n.stringName}${n.fret}(Fg:${n.recommendedFinger})`).join('+') || 'Rest/Open',
          toNotes: currActive.map(n => `${n.stringName}${n.fret}(Fg:${n.recommendedFinger})`).join('+') || 'Rest/Open',
          prevPosition: prev.beat.recommendedPosition,
          currPosition: curr.beat.recommendedPosition,
          isPositionShift: curr.beat.isPositionShift,
          costBreakdown: cb,
          totalCost: totalCost
        });
      }
    }
  }

  // Sort candidate high-cost segments descending
  resultData.topHighCostSegments.sort((a, b) => b.totalCost - a.totalCost);

  return resultData;
}

if (require.main === module) {
  runValidation(20).then(data => {
    console.log(`\n✅ Analyzed ${data.totalMeasures} measures (${data.allBeats.length} beats)`);
    console.log(`\n📌 Total Position Shifts: ${data.positionShifts.length}`);
    console.log(`📌 Total Rapid Same-Finger Crossings: ${data.rapidSameFingerCrossings.length}`);
    console.log(`📌 Total Simultaneous / Barre Chords: ${data.simultaneousOrBarreNotes.length}`);
    console.log(`📌 Total Stretches (pos-1 / pos+4): ${data.largeStretches.length}`);
    console.log(`\n🔥 Top 5 Highest-Cost / Most Uncertain Segments:`);
    data.topHighCostSegments.slice(0, 5).forEach((s, idx) => {
      console.log(`\n  ${idx + 1}. [Cost ${s.totalCost}] M${s.measure} B${s.beat}: ${s.fromNotes} (Pos ${s.prevPosition}) → ${s.toNotes} (Pos ${s.currPosition}) | Shift: ${s.isPositionShift}`);
      if (s.costBreakdown) {
        console.log(`     Position ${s.costBreakdown.position}`);
        console.log(`     movementCost: ${s.costBreakdown.movementCost}`);
        console.log(`     stretchCost: ${s.costBreakdown.stretchCost}`);
        console.log(`     phraseBoundaryBonus: ${s.costBreakdown.phraseBoundaryBonus}`);
        console.log(`     repeatedPatternBonus: ${s.costBreakdown.repeatedPatternBonus}`);
        console.log(`     shapeCost: ${s.costBreakdown.shapeCost}`);
        console.log(`     openWindowBonus: ${s.costBreakdown.openWindowBonus}`);
        console.log(`     total: ${s.costBreakdown.total}`);
      }
    });
  }).catch(console.error);
}

function formatBeatsTableMarkdown(allBeats) {
  const lines = [];
  lines.push('| Measure | Beat | String | Fret | Finger | Position | Shift | Note / Special |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  allBeats.forEach(b => {
    const special = [];
    if (b.isPositionShift) special.push('⚡換把 (Shift)');
    if (b.isTie) special.push('Tie (延音)');
    if (b.fret === 0) special.push('空弦音 (Open)');
    const strDesc = `Str ${b.stringNumber} (${b.stringName})`;
    const fgDesc = b.fret === 0 ? '0 (Open)' : `${b.recommendedFinger}`;
    const shiftDesc = b.isPositionShift ? '⚡ true' : 'false';
    lines.push(`| M${b.measure} | B${b.beat} | ${strDesc} | ${b.fret} | ${fgDesc} | Pos ${b.recommendedPosition} | ${shiftDesc} | ${special.join(', ') || '—'} |`);
  });
  return lines.join('\n');
}

module.exports = {
  runValidation,
  analyzeValidationResults,
  formatBeatsTableMarkdown
};
