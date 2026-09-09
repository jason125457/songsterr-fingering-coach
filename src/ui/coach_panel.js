/**
 * coach_panel.js
 * 
 * Floating UI component for Songsterr Fingering Coach.
 * 
 * Responsibilities:
 * - Mounts a sleek, draggable floating widget into Songsterr pages
 * - Provides manual Previous / Next Measure and Beat navigation
 * - Displays recommended position and position shift warnings
 * - Renders compact chord / hand-shape SVG diagrams via ShapeDiagram
 * - Shows current beat's detailed note, string, fret, pitch, and recommended fingers
 * - Strictly READ-ONLY: Consumes FingeringResult, never recalculates fingering
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./shape_diagram'));
  } else {
    root.CoachPanel = factory(root.ShapeDiagram);
  }
})(typeof self !== 'undefined' ? self : this, function (ShapeDiagram) {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function midiToPitch(midi) {
    if (typeof midi !== 'number' || isNaN(midi)) return '';
    const note = NOTE_NAMES[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${note}${oct}`;
  }

  const FINGER_NAMES = {
    0: 'Open (0)',
    1: 'Index (1)',
    2: 'Middle (2)',
    3: 'Ring (3)',
    4: 'Pinky (4)'
  };

  class CoachPanel {
    constructor(fingeringResult, options = {}) {
      if (!fingeringResult || !Array.isArray(fingeringResult.measures)) {
        throw new Error('CoachPanel requires a valid FingeringResult object with measures array');
      }

      this.data = fingeringResult;
      this.options = options;
      this.measures = fingeringResult.measures;
      this.totalMeasures = this.measures.length;

      this.currentMeasureIndex = options.initialMeasure ? Math.max(0, Math.min(this.totalMeasures - 1, options.initialMeasure - 1)) : 0;
      this.currentBeatNumber = 1;
      this.activeSegmentIndex = 0;
      this.isMinimized = false;

      this.panelEl = null;
      this.fabEl = null;
      this.dragOffset = { x: 0, y: 0 };
      this.isDragging = false;

      this.initDOM();
      this.updateView();
    }

    /**
     * Build and mount the panel elements into the DOM
     */
    initDOM() {
      // Remove any existing instance
      const oldPanel = document.getElementById('sfc-coach-panel');
      if (oldPanel) oldPanel.remove();
      const oldFab = document.getElementById('sfc-coach-fab');
      if (oldFab) oldFab.remove();

      // Main floating panel container
      this.panelEl = document.createElement('div');
      this.panelEl.id = 'sfc-coach-panel';
      this.panelEl.className = 'sfc-panel';

      // Header
      const header = document.createElement('div');
      header.className = 'sfc-header';
      header.innerHTML = `
        <div class="sfc-title-group">
          <span class="sfc-logo-icon">🎸</span>
          <div class="sfc-title-text">
            <span class="sfc-app-name">Fingering Coach</span>
            <span class="sfc-track-name" id="sfc-track-info">${this.data.song?.title || 'Song'} (${this.data.track?.name || 'Guitar'})</span>
          </div>
        </div>
        <div class="sfc-header-actions">
          <button class="sfc-btn-icon" id="sfc-btn-minimize" title="Minimize Panel">─</button>
        </div>
      `;

      // Body container
      const body = document.createElement('div');
      body.className = 'sfc-body';
      body.id = 'sfc-panel-body';

      this.panelEl.appendChild(header);
      this.panelEl.appendChild(body);

      // Minimized FAB button
      this.fabEl = document.createElement('button');
      this.fabEl.id = 'sfc-coach-fab';
      this.fabEl.className = 'sfc-fab sfc-hidden';
      this.fabEl.innerHTML = `<span>🎸</span> <span id="sfc-fab-text">Coach</span>`;

      // Append to document body
      document.body.appendChild(this.panelEl);
      document.body.appendChild(this.fabEl);

      // Event listeners
      this.setupEventListeners(header);
    }

    setupEventListeners(header) {
      // Header minimize button
      const minBtn = this.panelEl.querySelector('#sfc-btn-minimize');
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMinimize(true);
      });

      // FAB click to restore
      this.fabEl.addEventListener('click', () => {
        this.toggleMinimize(false);
      });

      // Dragging logic
      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        this.isDragging = true;
        const rect = this.panelEl.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        let x = e.clientX - this.dragOffset.x;
        let y = e.clientY - this.dragOffset.y;

        // Keep within viewport bounds
        x = Math.max(10, Math.min(window.innerWidth - this.panelEl.offsetWidth - 10, x));
        y = Math.max(10, Math.min(window.innerHeight - this.panelEl.offsetHeight - 10, y));

        this.panelEl.style.left = `${x}px`;
        this.panelEl.style.top = `${y}px`;
        this.panelEl.style.right = 'auto';
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });
    }

    toggleMinimize(minimized) {
      this.isMinimized = minimized;
      if (this.isMinimized) {
        this.panelEl.classList.add('sfc-hidden');
        this.fabEl.classList.remove('sfc-hidden');
        const mNum = this.currentMeasureIndex + 1;
        document.getElementById('sfc-fab-text').textContent = `M${mNum} B${this.currentBeatNumber}`;
      } else {
        this.panelEl.classList.remove('sfc-hidden');
        this.fabEl.classList.add('sfc-hidden');
      }
    }

    goToMeasure(measureIndex) {
      if (measureIndex < 0 || measureIndex >= this.totalMeasures) return;
      this.currentMeasureIndex = measureIndex;
      this.currentBeatNumber = 1;
      this.activeSegmentIndex = 0;
      this.updateView();
    }

    prevMeasure() {
      this.goToMeasure(this.currentMeasureIndex - 1);
    }

    nextMeasure() {
      this.goToMeasure(this.currentMeasureIndex + 1);
    }

    selectBeat(beatNumber) {
      this.currentBeatNumber = beatNumber;
      // Auto-switch segment if beat belongs to a different segment
      const measure = this.measures[this.currentMeasureIndex];
      const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
      const targetSegIdx = segments.findIndex(s => s.beats.some(b => b.beatNumber === beatNumber));
      if (targetSegIdx !== -1) {
        this.activeSegmentIndex = targetSegIdx;
      }
      this.updateView();
    }

    selectSegment(segmentIndex) {
      this.activeSegmentIndex = segmentIndex;
      const measure = this.measures[this.currentMeasureIndex];
      const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
      if (segments[segmentIndex] && segments[segmentIndex].beats.length > 0) {
        this.currentBeatNumber = segments[segmentIndex].beats[0].beatNumber;
      }
      this.updateView();
    }

    /**
     * Update the entire view according to current state
     */
    updateView() {
      const measure = this.measures[this.currentMeasureIndex];
      if (!measure) return;

      const body = document.getElementById('sfc-panel-body');
      if (!body) return;

      const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
      if (this.activeSegmentIndex >= segments.length) {
        this.activeSegmentIndex = 0;
      }
      const activeSegment = segments[this.activeSegmentIndex] || segments[0];

      // Find current beat data
      const currentBeat = measure.beats.find(b => b.beatNumber === this.currentBeatNumber) || measure.beats[0];
      const hasShiftInMeasure = measure.isPositionShift || segments.length > 1;
      const isShiftOnCurrentBeat = currentBeat?.isPositionShift;

      // 1. Navigation bar HTML
      const mNum = measure.measureNumber || (this.currentMeasureIndex + 1);
      const isFirstM = this.currentMeasureIndex === 0;
      const isLastM = this.currentMeasureIndex === this.totalMeasures - 1;

      let navHtml = `
        <div class="sfc-measure-nav">
          <button class="sfc-nav-btn" id="sfc-btn-prev" ${isFirstM ? 'disabled' : ''}>◀ Prev</button>
          <div class="sfc-measure-indicator">
            <span>Measure ${mNum}</span>
            <span class="sfc-measure-total">/ ${this.totalMeasures}</span>
          </div>
          <button class="sfc-nav-btn" id="sfc-btn-next" ${isLastM ? 'disabled' : ''}>Next ▶</button>
        </div>
      `;

      // 2. Status badges HTML
      const posLabel = activeSegment.position ? `Pos ${activeSegment.position}` : `Pos ${measure.recommendedPosition || '?'}`;
      const shiftBadgeHtml = hasShiftInMeasure
        ? `<span class="sfc-badge sfc-badge-shift">⚡ Shift${isShiftOnCurrentBeat ? ' (Beat ' + this.currentBeatNumber + ')' : ''}</span>`
        : `<span class="sfc-badge sfc-badge-stable">✓ Stable Pos</span>`;

      const sigBadgeHtml = measure.timeSignature
        ? `<span class="sfc-badge sfc-badge-sig">${measure.timeSignature}</span>`
        : '';

      const statusHtml = `
        <div class="sfc-status-badges">
          <span class="sfc-badge sfc-badge-pos">🖐️ ${posLabel}</span>
          ${shiftBadgeHtml}
          ${sigBadgeHtml}
        </div>
      `;

      // 3. Segment tabs (if measure has multiple position segments)
      let segmentsHtml = '';
      if (segments.length > 1) {
        segmentsHtml = `<div class="sfc-segments-row">`;
        segments.forEach((seg, sIdx) => {
          const isActive = sIdx === this.activeSegmentIndex;
          segmentsHtml += `
            <button class="sfc-segment-tab ${isActive ? 'sfc-active' : ''}" data-segment="${sIdx}">
              Pos ${seg.position} (B${seg.startBeat}-${seg.endBeat})
            </button>
          `;
        });
        segmentsHtml += `</div>`;
      }

      // 4. Beat Pills
      let beatsHtml = `<div class="sfc-beats-row">`;
      measure.beats.forEach((b) => {
        const isActive = b.beatNumber === this.currentBeatNumber;
        const hasShift = b.isPositionShift;
        const isRest = b.notes.length === 0 || b.notes.every(n => n.isRest);
        beatsHtml += `
          <button class="sfc-beat-pill ${isActive ? 'sfc-active' : ''} ${hasShift ? 'sfc-has-shift' : ''}" data-beat="${b.beatNumber}">
            <span>B${b.beatNumber}</span>
            <span style="font-size: 8.5px; opacity: 0.7;">${isRest ? 'Rest' : (b.timing || '')}</span>
          </button>
        `;
      });
      beatsHtml += `</div>`;

      // Derive tuning names dynamically from track MIDI tuning (never hardcode)
      const trackTuning = this.data.track?.tuningMidi || this.data.track?.tuning;
      const tuningNames = Array.isArray(this.data.track?.tuningNames) && this.data.track.tuningNames.length === 6
        ? this.data.track.tuningNames
        : (Array.isArray(trackTuning) && trackTuning.length === 6
            ? trackTuning.map(midiToPitch)
            : ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);

      // 5. SVG Hand-Shape Diagram (passing dynamic tuning)
      const svgDiagram = ShapeDiagram.renderSVG(activeSegment, this.currentBeatNumber, {
        width: 260,
        height: 210,
        tuningNames,
        tuning: trackTuning
      });
      const diagramHtml = `
        <div class="sfc-diagram-box">
          ${svgDiagram}
        </div>
      `;

      // 6. Current Beat Details Card
      let beatDetailsHtml = '';
      if (currentBeat) {
        const activeNotes = currentBeat.notes.filter(n => !n.isRest && n.string >= 0);

        beatDetailsHtml = `
          <div class="sfc-beat-card">
            <div class="sfc-beat-card-header">
              <span>Beat ${currentBeat.beatNumber} Details (${currentBeat.timing || '1/4'})</span>
              <span>${currentBeat.recommendedPosition ? 'Pos ' + currentBeat.recommendedPosition : ''}</span>
            </div>
            <div class="sfc-notes-list">
        `;

        if (activeNotes.length === 0) {
          beatDetailsHtml += `<div style="color: #71717a; font-size: 11.5px; padding: 2px 0;">(Rest / No fretted notes)</div>`;
        } else {
          activeNotes.forEach((n) => {
            // Guitar standard: String 1 = High E (normalized string 0), String 6 = Low E (normalized string 5)
            const guitarStringNumber = n.string + 1;
            const strOpenName = tuningNames[n.string] || `Str ${guitarStringNumber}`;
            const fingerName = FINGER_NAMES[n.recommendedFinger] || `Finger ${n.recommendedFinger}`;
            const pitchStr = n.pitch ? ` (${n.pitch})` : '';

            beatDetailsHtml += `
              <div class="sfc-note-item">
                <div class="sfc-note-left">
                  <span class="sfc-note-str">String ${guitarStringNumber} [${strOpenName}]</span>
                  <span class="sfc-note-fret">Fret ${n.fret}${pitchStr}</span>
                </div>
                <div class="sfc-note-right">
                  <span class="sfc-note-finger ${n.recommendedFinger === 0 ? 'sfc-finger-0' : ''}" title="${fingerName}">
                    ${n.recommendedFinger === 0 ? 'O' : n.recommendedFinger}
                  </span>
                </div>
              </div>
            `;
          });
        }

        beatDetailsHtml += `</div></div>`;
      }

      // Assemble into body
      body.innerHTML = navHtml + statusHtml + segmentsHtml + beatsHtml + diagramHtml + beatDetailsHtml;

      // Attach DOM handlers
      body.querySelector('#sfc-btn-prev')?.addEventListener('click', () => this.prevMeasure());
      body.querySelector('#sfc-btn-next')?.addEventListener('click', () => this.nextMeasure());

      body.querySelectorAll('.sfc-segment-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          const segIdx = parseInt(e.currentTarget.getAttribute('data-segment'), 10);
          this.selectSegment(segIdx);
        });
      });

      body.querySelectorAll('.sfc-beat-pill').forEach((pill) => {
        pill.addEventListener('click', (e) => {
          const bNum = parseInt(e.currentTarget.getAttribute('data-beat'), 10);
          this.selectBeat(bNum);
        });
      });

      // Update FAB text if minimized
      if (this.isMinimized) {
        document.getElementById('sfc-fab-text').textContent = `M${mNum} B${this.currentBeatNumber}`;
      }
    }

    /**
     * Remove panel from DOM
     */
    destroy() {
      if (this.panelEl) this.panelEl.remove();
      if (this.fabEl) this.fabEl.remove();
    }
  }

  return CoachPanel;
});
