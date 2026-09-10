const fs = require('fs');
const path = require('path');

const rawPart0 = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part0_raw.json'), 'utf8');
const rawPart1 = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part1_raw.json'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Songsterr Fingering Coach - UI Preview (Continuous Measures & Authentic TAB)</title>
  <link rel="stylesheet" href="../src/ui/coach.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0e0e10;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      padding-bottom: 120px;
    }

    /* Mock Songsterr Background Page */
    .mock-header {
      height: 56px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .mock-logo {
      font-weight: 800;
      font-size: 18px;
      color: #00d26a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mock-tabs {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #a1a1aa;
    }

    .mock-container {
      max-width: 980px;
      margin: 24px auto;
      padding: 0 20px;
      position: relative;
    }

    .demo-showcase-bar {
      background: #1e1e24;
      border: 1px solid #3f3f46;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .demo-showcase-title {
      font-weight: 700;
      font-size: 14px;
      color: #00d26a;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .demo-btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .demo-btn {
      background: #27272a;
      border: 1px solid #52525b;
      color: #f4f4f5;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .demo-btn:hover {
      background: #00d26a;
      border-color: #00d26a;
      color: #09090b;
    }
    .demo-btn.demo-btn-play {
      background: #00d26a;
      border-color: #00d26a;
      color: #09090b;
    }
    .demo-btn.demo-btn-track-active {
      background: #3b82f6;
      border-color: #60a5fa;
      color: #ffffff;
    }

    .performance-banner {
      font-size: 12px;
      color: #10b981;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: #141417;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #27272a;
    }

    .mock-tab-sheet {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      position: relative;
    }
    .mock-song-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      border-bottom: 1px solid #27272a;
      padding-bottom: 16px;
    }
    .mock-song-title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .mock-song-artist {
      font-size: 14px;
      color: #a1a1aa;
    }

    /* Mock Songsterr Staff Lines with Measure Targets */
    .mock-measure-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      margin-bottom: 90px;
      position: relative;
    }
    .mock-measure-box {
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 14px;
      font-family: "Courier New", Courier, monospace;
      font-size: 13px;
      line-height: 1.45;
      color: #94a3b8;
      position: relative;
      user-select: none;
      min-height: 120px;
    }
    .mock-measure-badge {
      position: absolute;
      top: 6px;
      right: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
    }
    .mock-measure-target-rect {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .viewport-status-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #0284c7;
      color: #fff;
      border-radius: 4px;
      font-weight: bold;
      font-size: 11px;
    }
  </style>
</head>
<body>

  <!-- Mock Songsterr Top Navigation Bar -->
  <header class="mock-header">
    <div class="mock-logo">🎸 Songsterr <span style="font-size: 12px; color: #a1a1aa; font-weight: normal; margin-left: 8px;">Fingering Coach UI Preview</span></div>
    <div class="mock-tabs">
      <span>Songs</span>
      <span>Artists</span>
      <span style="color: #00d26a; font-weight: 600;">Fingering Coach Active</span>
    </div>
  </header>

  <main class="mock-container">
    <!-- Quick Showcase Navigation Bar -->
    <section class="demo-showcase-bar">
      <div class="demo-showcase-title">🎯 Songsterr Fingering Coach - Live Verified Audio & TAB Alignment</div>
      <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 12px;">
        💡 <em>底層六線譜已直接對接 Songsterr 官方 CloudFront 原始資料，弦位與品格 100% 精準對齊，無人工虛構。支援主音與節奏分軌切換。</em>
      </div>

      <!-- Track Switcher -->
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px;">
        <span style="font-weight: 700; color: #60a5fa;">🎵 樂曲分軌 (Track):</span>
        <button class="demo-btn demo-btn-track demo-btn-track-active" id="btn-track-0" onclick="switchTrack(0)">🎸 Track 0: Lead Guitar (主音吉他 - 7品主旋律)</button>
        <button class="demo-btn demo-btn-track" id="btn-track-1" onclick="switchTrack(1)">🎸 Track 1: Rhythm Guitar (節奏吉他 - 和弦 / Songsterr 預設)</button>
      </div>

      <!-- Density Switcher Controls -->
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px;">
        <span style="font-weight: 700; color: #00d26a;">📏 視覺密度 (Density):</span>
        <button class="demo-btn demo-btn-density demo-btn-play" id="btn-density-small" onclick="switchDensity('small')">Small (Default - 微型提示)</button>
        <button class="demo-btn demo-btn-density" id="btn-density-medium" onclick="switchDensity('medium')">Medium (Balanced)</button>
        <button class="demo-btn demo-btn-density" id="btn-density-large" onclick="switchDensity('large')">Large (Comfortable)</button>
      </div>

      <div class="demo-btn-group">
        <button class="demo-btn demo-btn-play" id="btn-play-toggle" onclick="togglePlayback()">▶ Start Playback Simulation</button>
        <button class="demo-btn" onclick="scrollToMeasure(1)">M1 (Pos 7)</button>
        <button class="demo-btn" onclick="scrollToMeasure(3)">M3 (P8➔P10 換把)</button>
        <button class="demo-btn" onclick="scrollToMeasure(4)">M4 (Mini-Barre)</button>
        <button class="demo-btn" onclick="scrollToMeasure(11)">M11</button>
        <button class="demo-btn" onclick="scrollToMeasure(13)">M13 (第13小節)</button>
        <button class="demo-btn" onclick="scrollToMeasure(17)">M17 (開放雙把位)</button>
        <button class="demo-btn" onclick="scrollToMeasure(19)">M19 (空弦切換)</button>
      </div>
      <div class="performance-banner" id="perf-banner">
        <span>⏱️ Engine Status: Loading and analyzing track...</span>
      </div>
    </section>

    <!-- Mock Tab Area (M1 to M24 Continuous) -->
    <article class="mock-tab-sheet" id="tab-sheet">
      <div class="mock-song-header">
        <div>
          <div class="mock-song-title">傍晚去太子灣嗎</div>
          <div class="mock-song-artist" id="song-artist-info">Schoolgirl byebye • Lead Guitar (Standard Tuning E A D G B E)</div>
        </div>
        <div style="text-align: right; font-size: 12px; color: #71717a;">
          <div>Songsterr ID: 6557798</div>
          <div id="track-total-measures">Total: 146 Measures</div>
        </div>
      </div>

      <!-- Measures Container dynamically generated -->
      <div id="measures-container"></div>
    </article>
  </main>

  <!-- Embed Raw Songsterr Song Data for Both Parts -->
  <script>
    window.__RAW_SONGSTERR_PART0__ = ${rawPart0};
    window.__RAW_SONGSTERR_PART1__ = ${rawPart1};
  </script>

  <!-- Load Extension Modules -->
  <script src="../src/normalizer.js"></script>
  <script src="../src/fingering_engine.js"></script>
  <script src="../src/ui/shape_diagram.js"></script>
  <script src="../src/ui/measure_overlay.js"></script>
  <script src="../src/ui/overlay_manager.js"></script>
  <script src="../src/ui/coach_panel.js"></script>
  <script src="../src/songsterr/playback_mapper.js"></script>
  <script src="../src/songsterr/playback_observer.js"></script>
  <script src="../src/controller/playback_sync_controller.js"></script>

  <script>
    let currentTrackId = 0;
    let coachInstance = null;
    let overlayMgr = null;
    let mockObs = null;
    let syncCtl = null;
    let simTimer = null;
    let simMeasure = 1;
    let simEvent = 1;
    let currentDensity = 'small';

    // Helper: generate authentic ASCII tab lines from raw measure JSON
    function generateAsciiTab(measure, targetWidth = 26) {
      const strings = ['e', 'B', 'G', 'D', 'A', 'E'];
      const lines = strings.map(s => s + '|--');
      const beats = (measure.voices && measure.voices[0] && measure.voices[0].beats) || [];
      
      if (beats.length === 0) {
        return strings.map(s => s + '|' + '-'.repeat(targetWidth - 4) + '|');
      }
      
      beats.forEach(beat => {
        const notesByString = {};
        (beat.notes || []).forEach(n => {
          notesByString[n.string] = n.fret !== undefined ? (n.tie ? '(' + n.fret + ')' : '' + n.fret) : '-';
        });
        
        let maxLen = 1;
        for (let s = 0; s < 6; s++) {
          if (notesByString[s]) maxLen = Math.max(maxLen, notesByString[s].length);
        }
        
        for (let s = 0; s < 6; s++) {
          const val = notesByString[s] || '-';
          lines[s] += val.padEnd(maxLen + 1, '-');
        }
      });
      
      for (let s = 0; s < 6; s++) {
        if (lines[s].length < targetWidth - 1) {
          lines[s] = lines[s] + '-'.repeat(targetWidth - 1 - lines[s].length);
        }
        lines[s] += '|';
      }
      return lines;
    }

    function renderMeasureGrid(rawData) {
      const container = document.getElementById('measures-container');
      container.innerHTML = '';
      
      const totalToRender = Math.min(24, rawData.measures.length);
      const rows = Math.ceil(totalToRender / 2);

      for (let r = 0; r < rows; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'mock-measure-row';

        for (let c = 0; c < 2; c++) {
          const mIdx = r * 2 + c;
          if (mIdx >= totalToRender) break;
          const mNum = mIdx + 1;
          const mData = rawData.measures[mIdx];
          const asciiLines = generateAsciiTab(mData);

          let badgeExtra = '';
          if (currentTrackId === 0) {
            if (mNum === 1 || mNum === 2) badgeExtra = ' (Pos 7 Riff)';
            else if (mNum === 3) badgeExtra = ' (Shift P8➔P10)';
            else if (mNum === 4) badgeExtra = ' (Mini-Barre Pos 10)';
            else if (mNum === 17) badgeExtra = ' (Open C Chord)';
            else if (mNum === 19) badgeExtra = ' (Open Shift)';
          } else {
            if (mNum === 1 || mNum === 2) badgeExtra = ' (Cmaj7 Chord)';
            else if (mNum === 3 || mNum === 4) badgeExtra = ' (Fmaj7 Chord)';
          }

          const box = document.createElement('div');
          box.className = 'mock-measure-box';
          box.id = 'measure-box-' + mNum;
          box.innerHTML = 
            '<span class="mock-measure-badge">Measure ' + mNum + badgeExtra + '</span>' +
            '<svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="' + mIdx + '" width="100%" height="100%" fill="none" /></svg>' +
            asciiLines.map(line => '<div>' + line + '</div>').join('');

          rowDiv.appendChild(box);
        }
        container.appendChild(rowDiv);
      }
    }

    function switchTrack(trackId) {
      if (simTimer) togglePlayback();
      currentTrackId = trackId;

      document.querySelectorAll('.demo-btn-track').forEach(btn => btn.classList.remove('demo-btn-track-active'));
      const activeBtn = document.getElementById('btn-track-' + trackId);
      if (activeBtn) activeBtn.classList.add('demo-btn-track-active');

      const raw = trackId === 0 ? window.__RAW_SONGSTERR_PART0__ : window.__RAW_SONGSTERR_PART1__;
      const trackName = trackId === 0 ? 'Lead Guitar (Distortion Guitar)' : 'Rhythm Guitar (Electric Guitar clean)';
      document.getElementById('song-artist-info').textContent = 'Schoolgirl byebye • ' + trackName + ' (Standard Tuning E A D G B E)';

      initPipeline();
    }

    function scrollToMeasure(measureNumber) {
      const box = document.getElementById('measure-box-' + measureNumber);
      if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function switchDensity(density) {
      currentDensity = density;
      if (!overlayMgr) return;
      overlayMgr.setDensity(density);
      document.querySelectorAll('.demo-btn-density').forEach(btn => btn.classList.remove('demo-btn-play'));
      const activeBtn = document.getElementById('btn-density-' + density);
      if (activeBtn) activeBtn.classList.add('demo-btn-play');
      updateLiveMetrics();
    }

    function updateLiveMetrics() {
      if (!overlayMgr) return;
      const count = overlayMgr.mountedCount;
      const active = overlayMgr.activeMeasureIndex !== null ? ('Measure ' + (overlayMgr.activeMeasureIndex + 1)) : 'None (Static Preview)';
      const el = document.getElementById('perf-metrics');
      if (el) {
        el.innerHTML = '<span>📊 <strong>2D Viewport Virtualization:</strong> <span class="viewport-status-tag">' + count + ' Overlays Mounted</span> | Playback Active: <strong>' + active + '</strong> | Density: <strong>' + currentDensity.toUpperCase() + '</strong></span>';
      }
    }

    function togglePlayback() {
      const btn = document.getElementById('btn-play-toggle');
      if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
        btn.textContent = '▶ Resume Playback Simulation';
        btn.classList.add('demo-btn-play');
        if (mockObs) {
          mockObs.updateState({ state: 'paused', measureNumber: simMeasure, eventIndex: simEvent });
        }
        updateLiveMetrics();
      } else {
        btn.textContent = '⏸ Pause Playback Simulation';
        btn.classList.remove('demo-btn-play');
        simTimer = setInterval(() => {
          simEvent++;
          if (simEvent > 6) {
            simEvent = 1;
            simMeasure++;
            if (simMeasure > 24) {
              simMeasure = 1;
            }
          }
          if (mockObs) {
            mockObs.updateState({
              state: 'playing',
              measureNumber: simMeasure,
              eventIndex: simEvent,
              source: 'dom-playhead',
              confidence: 'exact'
            });
          }
          updateLiveMetrics();
        }, 500);
      }
    }

    function initPipeline() {
      const raw = currentTrackId === 0 ? window.__RAW_SONGSTERR_PART0__ : window.__RAW_SONGSTERR_PART1__;
      renderMeasureGrid(raw);

      if (overlayMgr) {
        overlayMgr.destroy();
        overlayMgr = null;
      }
      if (coachInstance && coachInstance.domElement) {
        coachInstance.domElement.remove();
        coachInstance = null;
      }
      if (syncCtl) {
        syncCtl.destroy();
        syncCtl = null;
      }

      const t0 = performance.now();
      const normalized = TabNormalizer.normalizeSongsterrPart(raw, {
        title: '傍晚去太子灣嗎',
        artist: 'Schoolgirl byebye',
        songId: 6557798,
        partId: currentTrackId
      });
      const t1 = performance.now();
      const fingeringResult = FingeringEngine.analyzeTab(normalized);
      const t2 = performance.now();

      const normMs = (t1 - t0).toFixed(2);
      const engMs = (t2 - t1).toFixed(2);
      const totalMs = (t2 - t0).toFixed(2);

      document.getElementById('perf-banner').innerHTML = 
        '<span>⚡ <strong>Track ' + currentTrackId + ' (' + (currentTrackId === 0 ? 'Lead' : 'Rhythm') + '):</strong> Analyzed ' + raw.measures.length + ' Measures in <strong>' + totalMs + 'ms</strong> (Normalization: ' + normMs + 'ms | Engine: ' + engMs + 'ms)</span>' +
        '<div id="perf-metrics" style="margin-top: 4px;"></div>';

      // 1. Initialize Overlay Manager
      overlayMgr = new OverlayManager({
        fingeringResult,
        density: currentDensity
      });

      // 2. Initialize Coach Panel
      coachInstance = new CoachPanel(fingeringResult, { initialMeasure: 1 });

      // 3. Initialize Playback Controller
      mockObs = new PlaybackObserver({ pollIntervalMs: 10000 });
      syncCtl = new PlaybackSyncController({
        observer: mockObs,
        coachPanel: coachInstance,
        overlayManager: overlayMgr,
        normalizedTrack: normalized
      });

      updateLiveMetrics();
    }

    document.addEventListener('DOMContentLoaded', () => {
      initPipeline();
    });
  </script>
</body>
</html>
`;

const outputPath = path.join(__dirname, '..', 'tests', 'ui_preview.html');
fs.writeFileSync(outputPath, htmlContent, 'utf8');
console.log('✅ UI Preview HTML generated successfully at:', outputPath);
