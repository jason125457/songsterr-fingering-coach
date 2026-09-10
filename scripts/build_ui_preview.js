const fs = require('fs');
const path = require('path');

const rawSongData = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part0_raw.json'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Songsterr Fingering Coach - UI Preview (Phase 3.2B Every Visible Measure)</title>
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
      gap: 24px;
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
      min-height: 115px;
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
    <div class="mock-logo">🎸 Songsterr <span style="font-size: 12px; color: #a1a1aa; font-weight: normal; margin-left: 8px;">Phase 3.2C Inline Overlay Visual Density & Scale Tuning</span></div>
    <div class="mock-tabs">
      <span>Songs</span>
      <span>Artists</span>
      <span style="color: #00d26a; font-weight: 600;">Fingering Coach Active</span>
    </div>
  </header>

  <main class="mock-container">
    <!-- Quick Showcase Navigation Bar -->
    <section class="demo-showcase-bar">
      <div class="demo-showcase-title">🎯 Phase 3.2C Principle: Inline Overlay = Glanceable Hint (Never Dominates TAB)</div>
      <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 12px;">
        💡 <em>Overlay scaled down 35%~50%, translucent background, compressed 3~4 fret rows. CoachPanel remains detailed view.</em>
      </div>

      <!-- Density Switcher Controls -->
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px;">
        <span style="font-weight: 700; color: #00d26a;">📏 Visual Density:</span>
        <button class="demo-btn demo-btn-density demo-btn-play" id="btn-density-small" onclick="switchDensity('small')">Small (Default - Glanceable)</button>
        <button class="demo-btn demo-btn-density" id="btn-density-medium" onclick="switchDensity('medium')">Medium (Balanced)</button>
        <button class="demo-btn demo-btn-density" id="btn-density-large" onclick="switchDensity('large')">Large (Comfortable)</button>
      </div>

      <div class="demo-btn-group">
        <button class="demo-btn demo-btn-play" id="btn-play-toggle" onclick="togglePlayback()">▶ Start Playback Simulation</button>
        <button class="demo-btn" onclick="scrollToMeasure(1)">Jump to M1 (Pos 7)</button>
        <button class="demo-btn" onclick="scrollToMeasure(3)">Jump to M3 (Pos 8➔10 Shift)</button>
        <button class="demo-btn" onclick="scrollToMeasure(4)">Jump to M4 (Mini-Barre)</button>
        <button class="demo-btn" onclick="scrollToMeasure(11)">Scroll to M11 (Pos 7 Riff)</button>
        <button class="demo-btn" onclick="scrollToMeasure(17)">Scroll to M17 (Open C Chord)</button>
        <button class="demo-btn" onclick="scrollToMeasure(19)">Scroll to M19 (Open Shift)</button>
      </div>
      <div class="performance-banner" id="perf-banner">
        <span>⏱️ Engine Status: Loading and analyzing full 146 measures...</span>
      </div>
    </section>

    <!-- Mock Tab Area (M1 to M20) -->
    <article class="mock-tab-sheet" id="tab-sheet">
      <div class="mock-song-title">傍晚去太子灣嗎</div>
      <div class="mock-song-artist">Schoolgirl byebye • Lead Guitar (Standard Tuning E A D G B E)</div>

      <!-- Measures 1 & 2 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box" id="measure-box-1">
          <span class="mock-measure-badge">Measure 1</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="0" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-2">
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
        <div class="mock-measure-box" id="measure-box-3">
          <span class="mock-measure-badge">Measure 3 (Multi-Segment P8➔P10)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="2" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-4">
          <span class="mock-measure-badge">Measure 4 (Mini-Barre Pos 10)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="3" width="100%" height="100%" fill="none" /></svg>
          <div>e|--12--------------------|</div>
          <div>B|------10------10--------|</div>
          <div>G|----------10------10----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 5 & 6 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box" id="measure-box-5">
          <span class="mock-measure-badge">Measure 5</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="4" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-6">
          <span class="mock-measure-badge">Measure 6</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="5" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 7 & 8 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box" id="measure-box-7">
          <span class="mock-measure-badge">Measure 7 (Shift P8➔P10)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="6" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-8">
          <span class="mock-measure-badge">Measure 8 (Mini-Barre)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="7" width="100%" height="100%" fill="none" /></svg>
          <div>e|--12--------------------|</div>
          <div>B|------10------10--------|</div>
          <div>G|----------10------10----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 9 & 10 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box" id="measure-box-9">
          <span class="mock-measure-badge">Measure 9</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="8" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-10">
          <span class="mock-measure-badge">Measure 10</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="9" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <!-- Measures 11 & 12 -->
      <div class="mock-measure-row">
        <div class="mock-measure-box" id="measure-box-11">
          <span class="mock-measure-badge">Measure 11</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="10" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-12">
          <span class="mock-measure-badge">Measure 12</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="11" width="100%" height="100%" fill="none" /></svg>
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
        <div class="mock-measure-box" id="measure-box-17">
          <span class="mock-measure-badge">Measure 17 (Open C Chord)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="16" width="100%" height="100%" fill="none" /></svg>
          <div>e|--------0---------------|</div>
          <div>B|------1---1-------------|</div>
          <div>G|----0-------0-----------|</div>
          <div>D|--2---------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
        <div class="mock-measure-box" id="measure-box-19">
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

    function scrollToMeasure(measureNumber) {
      const box = document.getElementById('measure-box-' + measureNumber);
      if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function switchDensity(density) {
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
        el.innerHTML = '<span>📊 <strong>2D Viewport Virtualization:</strong> <span class="viewport-status-tag">' + count + ' Overlays Mounted</span> | Playback Active: <strong>' + active + '</strong> | Scroll Cost: &lt;1ms</span>';
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
          if (simEvent > 8) {
            simEvent = 1;
            simMeasure++;
            if (simMeasure > 12 && simMeasure < 17) {
              simMeasure = 17;
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
          updateLiveMetrics();
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

      document.getElementById('perf-banner').innerHTML = 
        '<span>⚡ <strong>146 Measures Analyzed:</strong> Normalization: ' + normMs + 'ms | Engine: ' + engMs + 'ms | Total: <strong>' + totalMs + 'ms</strong> (Non-blocking)</span>' +
        '<div id="perf-metrics" style="margin-top: 4px;"></div>';

      // 1. Initialize Overlay Manager (Phase 3.2B: Viewport-driven 2D Virtualization)
      overlayMgr = new OverlayManager({
        fingeringResult
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

      // Listen to scroll to update live overlay count metrics
      window.addEventListener('scroll', () => {
        requestAnimationFrame(updateLiveMetrics);
      }, { passive: true });

      // Initial layout refresh
      setTimeout(() => {
        overlayMgr.repositionAll();
        updateLiveMetrics();
      }, 100);
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'tests', 'ui_preview.html'), htmlContent, 'utf8');
console.log('✅ Generated tests/ui_preview.html successfully.');
