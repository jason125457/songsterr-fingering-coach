const fs = require('fs');
const path = require('path');

const rawSongData = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part0_raw.json'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Songsterr Fingering Coach - UI Preview (Phase 3.0)</title>
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
      max-width: 900px;
      margin: 30px auto;
      padding: 0 20px;
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

    .mock-tab-sheet {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
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
      margin-bottom: 20px;
    }
    .mock-tab-lines {
      font-family: "Courier New", Courier, monospace;
      color: #71717a;
      font-size: 13px;
      line-height: 1.6;
      background: #18181b;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #27272a;
    }

    .performance-banner {
      margin-top: 16px;
      font-size: 12px;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  </style>
</head>
<body>

  <!-- Mock Songsterr Top Navigation Bar -->
  <header class="mock-header">
    <div class="mock-logo">🎸 Songsterr <span style="font-size: 12px; color: #a1a1aa; font-weight: normal; margin-left: 8px;">Phase 3.0 Interactive UI Foundation</span></div>
    <div class="mock-tabs">
      <span>Songs</span>
      <span>Artists</span>
      <span style="color: #00d26a; font-weight: 600;">Fingering Coach Active</span>
    </div>
  </header>

  <main class="mock-container">
    <!-- Quick Showcase Navigation Bar -->
    <section class="demo-showcase-bar">
      <div class="demo-showcase-title">🎯 Phase 3.0 Acceptance Target Measures Quick Jump:</div>
      <div class="demo-btn-group">
        <button class="demo-btn" onclick="jumpTo(1)">M1: Pos 7 (1-2-3 Shape)</button>
        <button class="demo-btn" onclick="jumpTo(3)">M3: Pos 8 ➔ Pos 10 Shift (2 Segments)</button>
        <button class="demo-btn" onclick="jumpTo(4)">M4: 12 + 10 + 10 Mini-Barre</button>
        <button class="demo-btn" onclick="jumpTo(17)">M17: Pos 1 Open C Shape</button>
        <button class="demo-btn" onclick="jumpTo(19)">M19: Open String Shift Window</button>
      </div>
      <div class="performance-banner" id="perf-banner">
        <span>⏱️ Engine Status: Loading and analyzing full 146 measures...</span>
      </div>
    </section>

    <!-- Mock Tab Area -->
    <article class="mock-tab-sheet">
      <div class="mock-song-title">傍晚去太子灣嗎</div>
      <div class="mock-song-artist">Schoolgirl byebye • Lead Guitar (Standard Tuning E A D G B E)</div>

      <div class="mock-tab-lines">
        <div>e|----------------------------------------------------------|</div>
        <div>B|--------8-------8-----------------10------10-------10----|</div>
        <div>G|--7--9----7--9----7--------9--10-----10-------10---------|</div>
        <div>D|----------------------------------------------------------|</div>
        <div>A|----------------------------------------------------------|</div>
        <div>E|----------------------------------------------------------|</div>
        <div style="color: #00d26a; margin-top: 8px; font-weight: bold;">
          👈 Please interact with the floating Fingering Coach panel on the right!
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
  <script src="../src/ui/coach_panel.js"></script>
  <script src="../src/songsterr/playback_observer.js"></script>

  <script>
    let coachInstance = null;

    function jumpTo(measureNumber) {
      if (coachInstance) {
        coachInstance.goToMeasure(measureNumber - 1);
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

      coachInstance = new CoachPanel(fingeringResult, { initialMeasure: 1 });
      window.__COACH_PANEL__ = coachInstance;
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'tests', 'ui_preview.html'), htmlContent, 'utf8');
console.log('✅ Generated tests/ui_preview.html successfully.');
