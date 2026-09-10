/**
 * coach_panel.js
 * 
 * Floating UI component for Songsterr Fingering Coach.
 * 
 * Responsibilities:
 * - Mounts a sleek, draggable floating widget into Songsterr pages
 * - Supports dual modes: 'follow' (Follow Playback) and 'manual' (Manual Navigation)
 * - Synchronizes with live Songsterr playback via PlaybackSyncController
 * - Automatically switches to 'manual' on user interaction and provides 'Resume Follow'
 * - Displays recommended position and position shift warnings
 * - Renders compact chord / hand-shape SVG diagrams via ShapeDiagram
 * - Shows current canonical event's detailed notes, strings, frets, pitches, and recommended fingers
 * - Multi-voice polyphonic note visualization with voice tags
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
      this.currentEventIndex = options.initialEvent || options.initialBeat || 1;
      this.currentBeatNumber = this.currentEventIndex; // Alias for backward compatibility
      this.activeSegmentIndex = 0;
      this.isMinimized = false;

      // Playback Sync & Mode states
      this.mode = options.initialMode || 'follow'; // 'follow' | 'manual'
      this.lastPlaybackConfidence = 'exact';
      this.lastPlaybackState = 'stopped';

      this.resumeFollowCallback = null;
      this.userActionCallback = null;

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
      if (typeof document === 'undefined') return;

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
        <div class="sfc-header-actions" id="sfc-header-actions">
          ${this.renderHeaderActionsHtml()}
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

    renderHeaderActionsHtml() {
      const modeHtml = this.mode === 'follow'
        ? `<span class="sfc-mode-indicator sfc-mode-follow" id="sfc-mode-badge" title="Auto-following live playback">▶ Following</span>`
        : `<button class="sfc-btn-resume" id="sfc-btn-resume-follow" title="Resume following live playback">▶ Resume Follow</button>`;

      return `
        ${modeHtml}
        <button class="sfc-btn-icon" id="sfc-btn-minimize" title="Minimize Panel">─</button>
      `;
    }

    updateHeaderActions() {
      const actionsEl = this.panelEl?.querySelector('#sfc-header-actions');
      if (actionsEl) {
        actionsEl.innerHTML = this.renderHeaderActionsHtml();
        this.attachHeaderActionListeners();
      }
    }

    updateHeaderTrackInfo() {
      const trackInfoEl = this.panelEl?.querySelector('#sfc-track-info');
      if (trackInfoEl) {
        trackInfoEl.textContent = `${this.data.song?.title || 'Song'} (${this.data.track?.name || 'Guitar'})`;
      }
    }

    setupEventListeners(header) {
      this.attachHeaderActionListeners();

      // FAB click to restore
      this.fabEl?.addEventListener('click', () => {
        this.toggleMinimize(false);
      });

      // Dragging logic
      header?.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        this.isDragging = true;
        const rect = this.panelEl.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('mousemove', (e) => {
          if (!this.isDragging) return;
          let x = e.clientX - this.dragOffset.x;
          let y = e.clientY - this.dragOffset.y;

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
    }

    attachHeaderActionListeners() {
      const minBtn = this.panelEl?.querySelector('#sfc-btn-minimize');
      minBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMinimize(true);
      });

      const resumeBtn = this.panelEl?.querySelector('#sfc-btn-resume-follow');
      resumeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMode('follow');
        if (typeof this.resumeFollowCallback === 'function') {
          this.resumeFollowCallback();
        }
      });
    }

    toggleMinimize(minimized) {
      this.isMinimized = minimized;
      if (this.isMinimized) {
        this.panelEl?.classList.add('sfc-hidden');
        this.fabEl?.classList.remove('sfc-hidden');
        const mNum = this.currentMeasureIndex + 1;
        const fabText = document.getElementById('sfc-fab-text');
        if (fabText) {
          fabText.textContent = `M${mNum} Ev${this.currentEventIndex}`;
        }
      } else {
        this.panelEl?.classList.remove('sfc-hidden');
        this.fabEl?.classList.add('sfc-hidden');
      }
    }

    /**
     * Mode Management
     */
    getMode() {
      return this.mode;
    }

    setMode(mode) {
      if (mode !== 'follow' && mode !== 'manual') return;
      if (this.mode === mode) return;
      this.mode = mode;
      this.updateHeaderActions();
      if (typeof this.options.onModeChange === 'function') {
        this.options.onModeChange(this.mode);
      }
    }

    onResumeFollow(callback) {
      if (typeof callback === 'function') {
        this.resumeFollowCallback = callback;
      }
    }

    onUserAction(callback) {
      if (typeof callback === 'function') {
        this.userActionCallback = callback;
      }
    }

    handleManualInteraction() {
      if (this.mode === 'follow') {
        this.mode = 'manual';
        this.updateHeaderActions();
      }
      if (typeof this.userActionCallback === 'function') {
        this.userActionCallback();
      }
    }

    /**
     * Update track data when song or track switches
     */
    updateData(newFingeringResult) {
      if (!newFingeringResult || !Array.isArray(newFingeringResult.measures)) return;
      this.data = newFingeringResult;
      this.measures = newFingeringResult.measures;
      this.totalMeasures = this.measures.length;
      this.currentMeasureIndex = Math.min(this.currentMeasureIndex, this.totalMeasures - 1);
      this.currentEventIndex = 1;
      this.currentBeatNumber = 1;
      this.activeSegmentIndex = 0;
      this.updateHeaderTrackInfo();
      this.updateView();
    }

    /**
     * Manual Navigation Methods
     */
    goToMeasure(measureIndex, isManual = true) {
      if (measureIndex < 0 || measureIndex >= this.totalMeasures) return;
      if (isManual) this.handleManualInteraction();
      this.currentMeasureIndex = measureIndex;
      this.currentEventIndex = 1;
      this.currentBeatNumber = 1;
      this.activeSegmentIndex = 0;
      this.lastPlaybackConfidence = 'exact';
      this.updateView();
    }

    prevMeasure() {
      this.goToMeasure(this.currentMeasureIndex - 1, true);
    }

    nextMeasure() {
      this.goToMeasure(this.currentMeasureIndex + 1, true);
    }

    selectEvent(eventIndex, isManual = true) {
      if (isManual) this.handleManualInteraction();
      this.currentEventIndex = eventIndex;
      this.currentBeatNumber = eventIndex;
      this.lastPlaybackConfidence = 'exact';

      // Auto-switch segment if event belongs to a different segment
      const measure = this.measures[this.currentMeasureIndex];
      if (measure) {
        const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
        const targetSegIdx = segments.findIndex(s => 
          s.beats.some(b => (b.eventIndex || b.beatNumber) === eventIndex)
        );
        if (targetSegIdx !== -1) {
          this.activeSegmentIndex = targetSegIdx;
        }
      }
      this.updateView();
    }

    selectBeat(beatNumber) {
      this.selectEvent(beatNumber, true);
    }

    selectSegment(segmentIndex, isManual = true) {
      if (isManual) this.handleManualInteraction();
      this.activeSegmentIndex = segmentIndex;
      const measure = this.measures[this.currentMeasureIndex];
      if (measure) {
        const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
        if (segments[segmentIndex] && segments[segmentIndex].beats.length > 0) {
          const firstB = segments[segmentIndex].beats[0];
          this.currentEventIndex = firstB.eventIndex || firstB.beatNumber;
          this.currentBeatNumber = this.currentEventIndex;
        }
      }
      this.lastPlaybackConfidence = 'exact';
      this.updateView();
    }

    /**
     * Synchronize CoachPanel to incoming playback position
     * @param {Object} canonicalResult Result from PlaybackMapper
     * @param {Object} playbackEvent Raw event from PlaybackObserver
     */
    syncPlayback(canonicalResult, playbackEvent) {
      if (this.mode === 'manual') {
        return; // User is in manual browsing mode; do NOT steal UI
      }

      const targetMNum = canonicalResult?.measureNumber || playbackEvent?.measureNumber;
      if (!targetMNum || targetMNum < 1 || targetMNum > this.totalMeasures) return;

      const targetMIdx = targetMNum - 1;
      const targetEvIdx = canonicalResult?.eventIndex || playbackEvent?.eventIndex || 1;
      const confidence = canonicalResult?.confidence || playbackEvent?.confidence || 'exact';
      const playState = playbackEvent?.state || 'playing';

      // Performance dirty-checking: skip identical renders to prevent flicker
      if (targetMIdx === this.currentMeasureIndex && 
          targetEvIdx === this.currentEventIndex && 
          confidence === this.lastPlaybackConfidence &&
          playState === this.lastPlaybackState) {
        return;
      }

      this.lastPlaybackConfidence = confidence;
      this.lastPlaybackState = playState;

      // Update measure index and active event
      this.currentMeasureIndex = targetMIdx;
      this.currentEventIndex = targetEvIdx;
      this.currentBeatNumber = targetEvIdx;

      // Auto-switch segment if event belongs to a different segment
      const measure = this.measures[this.currentMeasureIndex];
      if (measure) {
        const segments = ShapeDiagram.splitMeasureIntoSegments(measure);
        const targetSegIdx = segments.findIndex(s => 
          s.beats.some(b => (b.eventIndex || b.beatNumber) === targetEvIdx)
        );
        if (targetSegIdx !== -1) {
          this.activeSegmentIndex = targetSegIdx;
        }
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

      // Find current canonical event
      const currentEvent = measure.beats.find(b => (b.eventIndex || b.beatNumber) === this.currentEventIndex) || measure.beats[0];
      const hasShiftInMeasure = measure.isPositionShift || segments.length > 1;
      const isShiftOnCurrentEvent = currentEvent?.isPositionShift;
      const isMeasureOnly = this.lastPlaybackConfidence === 'measure-only';

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
        ? `<span class="sfc-badge sfc-badge-shift">⚡ Shift${isShiftOnCurrentEvent ? ' (Ev ' + this.currentEventIndex + ')' : ''}</span>`
        : `<span class="sfc-badge sfc-badge-stable">✓ Stable Pos</span>`;

      const sigBadgeHtml = measure.timeSignature
        ? `<span class="sfc-badge sfc-badge-sig">${measure.timeSignature}</span>`
        : '';

      const confidenceBadgeHtml = isMeasureOnly
        ? `<span class="sfc-badge sfc-badge-measure-only" title="Playback cursor matched measure boundary">Measure synced</span>`
        : '';

      const statusHtml = `
        <div class="sfc-status-badges">
          <span class="sfc-badge sfc-badge-pos">🖐️ ${posLabel}</span>
          ${shiftBadgeHtml}
          ${sigBadgeHtml}
          ${confidenceBadgeHtml}
        </div>
      `;

      // 3. Segment tabs (if measure has multiple position segments)
      let segmentsHtml = '';
      if (segments.length > 1) {
        segmentsHtml = `<div class="sfc-segments-row">`;
        segments.forEach((seg, sIdx) => {
          const isActive = sIdx === this.activeSegmentIndex;
          const startEv = seg.startEvent || seg.startBeat || 1;
          const endEv = seg.endEvent || seg.endBeat || 1;
          segmentsHtml += `
            <button class="sfc-segment-tab ${isActive ? 'sfc-active' : ''}" data-segment="${sIdx}">
              Pos ${seg.position} (Ev ${startEv}-${endEv})
            </button>
          `;
        });
        segmentsHtml += `</div>`;
      }

      // 4. Canonical Event Pills
      let eventsHtml = `<div class="sfc-beats-row">`;
      measure.beats.forEach((b) => {
        const evIdx = b.eventIndex || b.beatNumber;
        const isActive = !isMeasureOnly && evIdx === this.currentEventIndex;
        const hasShift = b.isPositionShift;
        const isRest = b.notes.length === 0 || b.notes.every(n => n.isRest);
        eventsHtml += `
          <button class="sfc-beat-pill ${isActive ? 'sfc-active' : ''} ${hasShift ? 'sfc-has-shift' : ''}" data-event="${evIdx}">
            <span>Ev ${evIdx}</span>
            <span style="font-size: 8.5px; opacity: 0.7;">${isRest ? 'Rest' : (b.timing || '')}</span>
          </button>
        `;
      });
      eventsHtml += `</div>`;

      // Derive tuning names dynamically from track MIDI tuning
      const trackTuning = this.data.track?.tuningMidi || this.data.track?.tuning;
      const tuningNames = Array.isArray(this.data.track?.tuningNames) && this.data.track.tuningNames.length === 6
        ? this.data.track.tuningNames
        : (Array.isArray(trackTuning) && trackTuning.length === 6
            ? trackTuning.map(midiToPitch)
            : ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);

      // 5. SVG Hand-Shape Diagram (when measure-only, pass null to avoid falsely highlighting arbitrary event)
      const highlightedEvent = isMeasureOnly ? null : this.currentEventIndex;
      const svgDiagram = ShapeDiagram.renderSVG(activeSegment, highlightedEvent, {
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

      // 6. Current Canonical Event Details Card (supporting Multi-Voice)
      let eventDetailsHtml = '';
      if (currentEvent) {
        const activeNotes = currentEvent.notes.filter(n => !n.isRest && n.string >= 0);
        const hasMultipleVoices = currentEvent.notes.some(n => n.source && n.source.voiceIndex > 0) || 
                                  (Array.isArray(currentEvent.sources) && currentEvent.sources.length > 1);

        const cardHeaderTitle = isMeasureOnly
          ? `Measure ${mNum} Overview`
          : `Event ${this.currentEventIndex} Details (${currentEvent.timing || '1/4'})`;

        eventDetailsHtml = `
          <div class="sfc-beat-card">
            <div class="sfc-beat-card-header">
              <span>${cardHeaderTitle}</span>
              <span>${currentEvent.recommendedPosition ? 'Pos ' + currentEvent.recommendedPosition : ''}</span>
            </div>
            <div class="sfc-notes-list">
        `;

        if (isMeasureOnly) {
          eventDetailsHtml += `<div style="color: #a1a1aa; font-size: 11.5px; padding: 4px 0;">Playing in Measure ${mNum} (Measure-synced)</div>`;
        } else if (activeNotes.length === 0) {
          eventDetailsHtml += `<div style="color: #71717a; font-size: 11.5px; padding: 2px 0;">(Rest / No fretted notes)</div>`;
        } else {
          activeNotes.forEach((n) => {
            const guitarStringNumber = n.string + 1;
            const strOpenName = tuningNames[n.string] || `Str ${guitarStringNumber}`;
            const fingerName = FINGER_NAMES[n.recommendedFinger] || `Finger ${n.recommendedFinger}`;
            const pitchStr = n.pitch ? ` (${n.pitch})` : '';
            const voiceTag = hasMultipleVoices && n.source
              ? `<span class="sfc-voice-tag" title="Voice ${n.source.voiceIndex}">V${n.source.voiceIndex}</span>`
              : '';

            eventDetailsHtml += `
              <div class="sfc-note-item">
                <div class="sfc-note-left">
                  <span class="sfc-note-str">String ${guitarStringNumber} [${strOpenName}]</span>
                  <span class="sfc-note-fret">Fret ${n.fret}${pitchStr}</span>
                  ${voiceTag}
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

        eventDetailsHtml += `</div></div>`;
      }

      // Assemble into body
      body.innerHTML = navHtml + statusHtml + segmentsHtml + eventsHtml + diagramHtml + eventDetailsHtml;

      // Attach DOM handlers
      body.querySelector('#sfc-btn-prev')?.addEventListener('click', () => this.prevMeasure());
      body.querySelector('#sfc-btn-next')?.addEventListener('click', () => this.nextMeasure());

      body.querySelectorAll('.sfc-segment-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          const segIdx = parseInt(e.currentTarget.getAttribute('data-segment'), 10);
          this.selectSegment(segIdx, true);
        });
      });

      body.querySelectorAll('.sfc-beat-pill').forEach((pill) => {
        pill.addEventListener('click', (e) => {
          const evIdx = parseInt(e.currentTarget.getAttribute('data-event'), 10);
          this.selectEvent(evIdx, true);
        });
      });

      // Update FAB text if minimized
      if (this.isMinimized) {
        const fabText = document.getElementById('sfc-fab-text');
        if (fabText) {
          fabText.textContent = `M${mNum} Ev${this.currentEventIndex}`;
        }
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
