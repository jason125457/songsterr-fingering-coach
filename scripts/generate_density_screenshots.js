const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgePath)) {
  console.error('Edge executable not found at:', edgePath);
  process.exit(1);
}

const artifactDir = 'C:\\Users\\jason\\.gemini\\antigravity\\brain\\f750a2fa-0717-490b-b623-f099ffd73faa';
const outputDir = path.join(__dirname, '..', 'tests', 'screenshots');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Generate an HTML page that presents the 3 densities side by side and in full sheet
const rawSongData = fs.readFileSync(path.join(__dirname, '..', 'tests', 'taiziwan_part0_raw.json'), 'utf8');

function buildDensityComparisonHTML() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>Phase 3.2C Visual Density Comparison</title>
  <link rel="stylesheet" href="../src/ui/coach.css">
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #0e0e10;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header {
      border-bottom: 1px solid #27272a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: #a1a1aa;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .density-column {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 16px;
    }
    .density-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-small { background: #00d26a; color: #09090b; }
    .badge-medium { background: #0284c7; color: #ffffff; }
    .badge-large { background: #a855f7; color: #ffffff; }

    .mock-measure-row {
      margin-top: 55px;
      margin-bottom: 40px;
      position: relative;
    }
    .mock-measure-box {
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 12px;
      font-family: "Courier New", Courier, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #71717a;
      position: relative;
      user-select: none;
    }
    .mock-measure-badge {
      position: absolute;
      top: 4px;
      right: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 10px;
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
  <div class="header">
    <div class="title">🎸 Phase 3.2C: Inline Overlay Visual Density & Scale Tuning</div>
    <div class="subtitle">Product Principle: <strong>Inline Overlay = Glanceable Hint (Never overpowers Songsterr TAB)</strong></div>
  </div>

  <div class="comparison-grid">
    <!-- SMALL (DEFAULT) -->
    <div class="density-column" id="col-small">
      <div class="density-title">
        <span>Small Density</span>
        <span class="badge badge-small">Default (Glanceable)</span>
      </div>
      <div style="font-size: 11px; color: #71717a; margin-bottom: 8px;">
        • 45%~50% smaller<br>
        • Translucent, no heavy shadow<br>
        • Compressed 3~4 fret rows<br>
        • Micro finger dots (r=3.4)
      </div>

      <div class="mock-measure-row" id="row-small-1">
        <div class="mock-measure-box" id="box-s-1">
          <span class="mock-measure-badge">M1 (Pos 7)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="0" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <div class="mock-measure-row" id="row-small-3">
        <div class="mock-measure-box" id="box-s-3">
          <span class="mock-measure-badge">M3 (P8➔P10 Shift)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="2" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>
    </div>

    <!-- MEDIUM (BALANCED) -->
    <div class="density-column" id="col-medium">
      <div class="density-title">
        <span>Medium Density</span>
        <span class="badge badge-medium">Balanced</span>
      </div>
      <div style="font-size: 11px; color: #71717a; margin-bottom: 8px;">
        • ~25% smaller than original<br>
        • Balanced readability<br>
        • Medium finger dots (r=4.2)<br>
        • Subtle borders
      </div>

      <div class="mock-measure-row" id="row-medium-1">
        <div class="mock-measure-box" id="box-m-1">
          <span class="mock-measure-badge">M1 (Pos 7)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="0" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <div class="mock-measure-row" id="row-medium-3">
        <div class="mock-measure-box" id="box-m-3">
          <span class="mock-measure-badge">M3 (P8➔P10 Shift)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="2" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>
    </div>

    <!-- LARGE (COMFORTABLE) -->
    <div class="density-column" id="col-large">
      <div class="density-title">
        <span>Large Density</span>
        <span class="badge badge-large">Comfortable</span>
      </div>
      <div style="font-size: 11px; color: #71717a; margin-bottom: 8px;">
        • Detailed presentation<br>
        • Larger finger dots (r=5.0)<br>
        • High contrast<br>
        • Suitable for large monitors
      </div>

      <div class="mock-measure-row" id="row-large-1">
        <div class="mock-measure-box" id="box-l-1">
          <span class="mock-measure-badge">M1 (Pos 7)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="0" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|--------8-------8-------|</div>
          <div>G|--7--9----7--9----7-----|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>

      <div class="mock-measure-row" id="row-large-3">
        <div class="mock-measure-box" id="box-l-3">
          <span class="mock-measure-badge">M3 (P8➔P10 Shift)</span>
          <svg class="mock-measure-target-rect"><rect data-testid="tab-measure-target" data-measure-index="2" width="100%" height="100%" fill="none" /></svg>
          <div>e|------------------------|</div>
          <div>B|------------10------10--|</div>
          <div>G|--9--10--------10-------|</div>
          <div>D|------------------------|</div>
          <div>A|------------------------|</div>
          <div>E|------------------------|</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.__RAW_SONGSTERR_DATA__ = ${rawSongData};
  </script>
  <script src="../src/normalizer.js"></script>
  <script src="../src/fingering_engine.js"></script>
  <script src="../src/ui/shape_diagram.js"></script>
  <script src="../src/ui/measure_overlay.js"></script>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const raw = window.__RAW_SONGSTERR_DATA__;
      const normalized = TabNormalizer.normalizeSongsterrPart(raw, { title: '傍晚去太子灣嗎', artist: 'Schoolgirl byebye' });
      const result = FingeringEngine.analyzeTab(normalized);
      const m1Data = result.measures[0];
      const m3Data = result.measures[2];

      // Helper to mount overlay above a box
      function mount(boxId, mData, density, isHighlighted = false) {
        const box = document.getElementById(boxId);
        if (!box) return;
        const ov = new MeasureOverlay(mData, { density });
        if (isHighlighted) {
          ov.setHighlighted(true);
          ov.setActiveEvent(1);
        }
        document.body.appendChild(ov.domElement);
        const rect = box.getBoundingClientRect();
        ov.updatePosition(rect, { scrollX: window.scrollX, scrollY: window.scrollY });
      }

      function doMount() {
        // Small
        mount('box-s-1', m1Data, 'small', true); // Highlight M1 active in Small
        mount('box-s-3', m3Data, 'small', false);

        // Medium
        mount('box-m-1', m1Data, 'medium', false);
        mount('box-m-3', m3Data, 'medium', false);

        // Large
        mount('box-l-1', m1Data, 'large', false);
        mount('box-l-3', m3Data, 'large', false);
      }

      doMount();
    });
  </script>
</body>
</html>`;
}

const comparisonHTMLPath = path.join(__dirname, '..', 'tests', 'density_comparison.html');
fs.writeFileSync(comparisonHTMLPath, buildDensityComparisonHTML(), 'utf8');
console.log('✅ Generated comparison HTML at:', comparisonHTMLPath);

// Take screenshot using spawnSync to avoid shell escaping issues
const fileUrl = 'file:///' + comparisonHTMLPath.replace(/\\/g, '/');
const comparisonImgPath = path.join(outputDir, 'density_comparison_overview.png');

console.log('📸 Capturing density comparison screenshot via Edge Chromium...');
const res1 = spawnSync(edgePath, [
  '--headless=new',
  `--screenshot=${comparisonImgPath}`,
  '--window-size=1200,820',
  '--hide-scrollbars',
  fileUrl
], { encoding: 'utf8' });

if (fs.existsSync(comparisonImgPath)) {
  console.log('✅ Captured comparison image:', comparisonImgPath);
  const artifactTarget1 = path.join(artifactDir, 'density_comparison_overview.png');
  fs.copyFileSync(comparisonImgPath, artifactTarget1);
  console.log('✅ Copied to artifact directory:', artifactTarget1);
} else {
  console.error('Failed to capture comparison image. Stderr:', res1.stderr);
}

// Function to generate and capture full preview in a specific density
function captureSheetPreview(density) {
  const previewHTML = fs.readFileSync(path.join(__dirname, '..', 'tests', 'ui_preview.html'), 'utf8');
  // Inject explicit initial density setting
  const injectedHTML = previewHTML.replace(
    'overlayMgr = new OverlayManager({',
    `overlayMgr = new OverlayManager({ density: '${density}',`
  );
  const tempPath = path.join(__dirname, '..', 'tests', `temp_preview_${density}.html`);
  fs.writeFileSync(tempPath, injectedHTML, 'utf8');

  const tempUrl = 'file:///' + tempPath.replace(/\\/g, '/');
  const targetImgPath = path.join(outputDir, `density_${density}_preview.png`);

  console.log(`📸 Capturing full score in ${density} density...`);
  spawnSync(edgePath, [
    '--headless=new',
    `--screenshot=${targetImgPath}`,
    '--window-size=1280,920',
    '--hide-scrollbars',
    tempUrl
  ], { encoding: 'utf8' });

  if (fs.existsSync(targetImgPath)) {
    console.log(`✅ Captured ${density} preview:`, targetImgPath);
    const artifactTarget = path.join(artifactDir, `density_${density}_preview.png`);
    fs.copyFileSync(targetImgPath, artifactTarget);
    console.log(`✅ Copied to artifact directory:`, artifactTarget);
  }

  // Cleanup temp file
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}

captureSheetPreview('small');
captureSheetPreview('medium');
captureSheetPreview('large');

console.log('🎉 All 4 screenshots generated successfully!');
