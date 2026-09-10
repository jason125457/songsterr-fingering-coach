const fs = require('fs');
const path = require('path');

const rawSongData = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part0_raw.json'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Songsterr Fingering Coach - UI Preview (Phase 3.2A)</title>
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
      padding-bottom: 80px;
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
      max-width: 960px;
      margin: 30px auto;
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
      margin-bottom: 10px;
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

    .performance-banner {
      font-size: 12px;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mock-tab-sheet {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      position: relative;
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
      margin-bottom: 24px;
    }

    /* Mock Songsterr Staff Lines with Measure Targets */
    .mock-measure-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 110px;
      position: relative;
    }
    .mock-measure-box {
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 14px;
      font-family: "Courier New", Courier, monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #71717a;
      position: relative;
      user-select: none;
    }
    .mock-measure-badge {
      position: absolute;
      top: 6px;
      right: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #52525b;
    }
    .mock-measure-target-rect {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  </style>
</head>
<body>

  <!-- Mock Songsterr Top Navigation Bar -->
  <header class="mock-header">
    <div class="mock-logo">🎸 Songsterr <span style="font-size: 12px; color: #a1a1aa; font-weight: normal; margin-left: 8px;">Phase 3.2A Inline Measure Overlay & Floating Coach</span></div>
    <div class="mock-tabs">
      <span>Songs</span>
      <span>Artists</span>
      <span style="color: #00d26a; font-weight: 600;">Fingering Coach Active</span>
    </div>
  </header>

  <main class="mock-container">
    <!-- Quick Showcase Navigation Bar -->
    <section class="demo-showcase-bar">
      <div class="demo-showcase-title">🎯 Phase 3.2A Inline Measure Overlays + Playback Simulation:</div>
      <div class="demo-btn-group">
        <button class="demo-btn demo-btn-play" id="btn-play-toggle" onclick="togglePlayback()">▶ Start Playback Simulation</button>
        <button class="demo-btn" onclick="jumpTo(1)">M1: Pos 7 (1-2-3 Shape)</button>
        <button class="demo-btn" onclick="jumpTo(3)">M3: Pos 8 ➔ 10 Shift</button>
        <button class="demo-btn" onclick="jumpTo(4)">M4: 12+10+10 Mini-Barre</button>
        <button class="demo-btn" onclick="jumpTo(17)">M17: Pos 1 Open Chord</button>
        <button class="demo-btn" onclick="jumpTo(19)">M19: Open String Shift</button>
      </div>
      <div class="performance-banner" id="perf-banner">
        <span>⏱️ Engine Status: Loading and analyzing full 146 measures...</span>
      </div>
    </section>

    <!-- Mock Tab Area -->
    <article class="mock-tab-sheet">
      <div class="mock-song-title">傍晚去太子灣嗎</div>
      <div class="mock-song-artist">Schoolgirl byebye • Lead Guitar (Standard Tuning E A D G B E)</div>

      <!-- Measures 1 & 2 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 1</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="0" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 2</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="1" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 3 & 4 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 3 (Shift 8➔10)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="2" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 4 (Mini-Barre)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="3" width="100%" height="100%" fill="none" /></svg>
          <div>e|--12--------------------|</div>
          <div>B|------10------10--------|</div>
          <div>G|----------10------10----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 17 & 19 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 17 (Open C Chord)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="16" width="100%" height="100%" fill="none" /></svg>
          <div>e|--------0---------------|</div>
          <div>B|------1---1-------------|</div>
          <div>G|----0-------0-----------|</div>
          <div>D|--2---------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box">
          <span class="mock-measure-badge">Measure 19 (Open Shift)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="18" width="100%" height="100%" fill="none" /></svg>
          <div>e|--5--7--0---------------|</div>
          <div>B|-----------1--0---------|</div>
          <div>G|-----------------2------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>
    </article>
  </main>

  <!-- Embed Raw Songsterr Song Data -->
  <script>
    window.__RAW_SONGSTERR_DATA__ = ${rawSongData};
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
    let coachInstance = null;
    let overlayMgr = null;
    let mockObs = null;
    let syncCtl = null;
    let simTimer = null;
    let simMeasure = 1;
    let simEvent = 1;

    function jumpTo(measureNumber) {
      simMeasure = measureNumber;
      simEvent = 1;
      if (mockObs) {
        mockObs.updateState({
          state: 'playing',
          measureNumber: simMeasure,
          eventIndex: simEvent,
          source: 'dom-playhead',
          confidence: 'exact'
        });
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
      } else {
        btn.textContent = '⏸ Pause Playback Simulation';
        btn.classList.remove('demo-btn-play');
        simTimer = setInterval(() => {
          simEvent++;
          if (simEvent > 8) {
            simEvent = 1;
            simMeasure++;
            if (simMeasure > 4 && simMeasure < 17) {
              simMeasure = 17; // Jump to demonstrated measures
            }
            if (simMeasure > 20) {
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
        }, 500);
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      const t0 = performance.now();
      const raw = window.__RAW_SONGSTERR_DATA__;
      const normalized = TabNormalizer.normalizeSongsterrPart(raw, {
        title: '傍晚去太子灣嗎',
        artist: 'Schoolgirl byebye',
        songId: 6557798,
        partId: 0
      });
      const t1 = performance.now();
      const fingeringResult = FingeringEngine.analyzeTab(normalized);
      const t2 = performance.now();

      const normMs = (t1 - t0).toFixed(2);
      const engMs = (t2 - t1).toFixed(2);
      const totalMs = (t2 - t0).toFixed(2);

      document.getElementById('perf-banner').innerHTML = \`
        <span>⚡ <strong>146 Measures Analyzed:</strong> Normalization: \${normMs}ms | Engine: \${engMs}ms | Total: <strong>\${totalMs}ms</strong> (Non-blocking)</span>
      \`;

      // 1. Initialize Overlay Manager (Virtualized Window 4-6 overlays)
      overlayMgr = new OverlayManager({
        fingeringResult,
        initialMeasure: 1,
        maxOverlays: 5
      });

      // 2. Initialize Floating Coach Panel
      coachInstance = new CoachPanel(fingeringResult, { initialMeasure: 1 });

      // 3. Initialize Mock Playback Observer & Sync Controller
      mockObs = new PlaybackObserver({ debugLog: false });
      syncCtl = new PlaybackSyncController({
        observer: mockObs,
        mapper: PlaybackMapper,
        coachPanel: coachInstance,
        overlayManager: overlayMgr,
        normalizedTrack: normalized,
        autoStart: true
      });

      window.__COACH_PANEL__ = coachInstance;
      window.__OVERLAY_MANAGER__ = overlayMgr;
      window.__SYNC_CONTROLLER__ = syncCtl;

      // Initial position refresh
      setTimeout(() => {
        overlayMgr.repositionAll();
      }, 100);
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'tests', 'ui_preview.html'), htmlContent, 'utf8');
console.log('✅ Generated tests/ui_preview.html successfully.');
