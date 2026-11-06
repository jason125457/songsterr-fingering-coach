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
    module.exports = factory(require('./shape_diagram'), require('../chord_tools'));
  } else {
    root.CoachPanel = factory(root.ShapeDiagram, root.ChordTools);
  }
})(typeof self !== 'undefined' ? self : this, function (ShapeDiagram, ChordTools) {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function midiToPitch(midi) {
    if (typeof midi !== 'number' || isNaN(midi)) return '';
    const note = NOTE_NAMES[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${note}${oct}`;
  }

  /**
   * Song titles, track names and instruments come from user-submitted Songsterr metadata,
   * so they must be escaped before being interpolated into innerHTML
   */
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function timeSignatureParts(measure) {
    const parts = String(measure?.timeSignature || '4/4').split('/').map(Number);
    return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts : [4, 4];
  }

  const OVERLAY_MODES = [
    { id: 'smart', label: '精簡', title: '和弦指型改變時才顯示；與上一小節相同的不重複顯示，每行開頭會再提示一次' },
    { id: 'all', label: '全部', title: '每個小節都顯示和弦指型' },
    { id: 'off', label: '關閉', title: '不在譜上標示' }
  ];

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

      // UI Mode: 'compact' (default) or 'expanded'
      let savedMode = 'compact';
      let savedSnap = 'right';
      try {
        if (typeof localStorage !== 'undefined') {
          savedMode = localStorage.getItem('sfc_coach_ui_mode') || 'compact';
          savedSnap = localStorage.getItem('sfc_coach_snap') || 'right';
        }
      } catch (e) {}
      this.uiMode = options.uiMode || savedMode;
      this.currentSnap = options.snap || savedSnap;

      // Song & Track Identity
      this.currentSongId = options.songId || fingeringResult?.song?.songId || null;
      this.isUnsupported = false;
      this.isLoading = false;
      this.unsupportedTrack = null;
      this.unsupportedReason = null;

      // Playback Sync & Mode states
      this.mode = options.initialMode || 'follow'; // 'follow' | 'manual'
      this.lastPlaybackConfidence = 'exact';
      this.lastPlaybackState = 'stopped';
      this.lastPlaybackSource = options.initialSource || 'init';

      this.resumeFollowCallback = null;
      this.userActionCallback = null;

      // How the inline score cues are shown ('smart' | 'all' | 'off'); owned by OverlayManager,
      // the panel only offers the switch and reports changes
      this.overlayMode = OVERLAY_MODES.some(m => m.id === options.overlayMode) ? options.overlayMode : 'smart';

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
      this.panelEl.className = `sfc-panel sfc-${this.uiMode}`;

      // Position according to saved snap
      if (this.currentSnap === 'left') {
        this.panelEl.style.left = '16px';
        this.panelEl.style.right = 'auto';
      } else {
        this.panelEl.style.left = 'auto';
        this.panelEl.style.right = '16px';
      }

      // Header
      const header = document.createElement('div');
      header.className = 'sfc-header';
      header.innerHTML = `
        <div class="sfc-title-group">
          <span class="sfc-logo-icon">🎸</span>
          <div class="sfc-title-text">
            <span class="sfc-app-name">Coach</span>
            <span class="sfc-track-name" id="sfc-track-info">${escapeHtml(this.data.song?.title || 'Song')} (${escapeHtml(this.data.track?.name || 'Guitar')})</span>
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
      if (this.isUnsupported) {
        return `
          <span class="sfc-mode-unsupported" title="Current track is unsupported">⚠️ Unsupported</span>
          <button class="sfc-btn-icon" id="sfc-btn-minimize" title="Minimize Panel">─</button>
        `;
      }

      const modeHtml = this.mode === 'follow'
        ? `<span class="sfc-mode-indicator sfc-mode-follow" id="sfc-mode-badge" title="Auto-following live playback">▶ Following</span>`
        : `<button class="sfc-btn-resume" id="sfc-btn-resume-follow" title="Resume following live playback">▶ Resume Follow</button>`;

      const expandIcon = this.uiMode === 'expanded' ? '↙' : '↗';
      const expandTitle = this.uiMode === 'expanded' ? 'Compact Mode' : 'Expand Mode';

      return `
        ${modeHtml}
        <button class="sfc-btn-icon" id="sfc-btn-snap-left" title="Snap Left">◀</button>
        <button class="sfc-btn-icon" id="sfc-btn-snap-right" title="Snap Right">▶</button>
        <button class="sfc-btn-icon" id="sfc-btn-toggle-expand" title="${expandTitle}">${expandIcon}</button>
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

    showLoading(message = 'Loading song...') {
      this.isLoading = true;
      this.isUnsupported = false;
      const body = this.panelEl?.querySelector('#sfc-panel-body');
      if (body) {
        body.innerHTML = `
          <div class="sfc-loading-card">
            <div class="sfc-loading-icon">⏳</div>
            <div class="sfc-loading-title">${escapeHtml(message)}</div>
          </div>
        `;
      }
    }

    showUnsupported(track, reason = '音軌暫不受支援') {
      this.isUnsupported = true;
      this.isLoading = false;
      this.unsupportedTrack = track;
      this.unsupportedReason = reason;

      const trackTitleEl = this.panelEl?.querySelector('#sfc-track-info') || document.getElementById('sfc-track-info');
      if (trackTitleEl) {
        trackTitleEl.textContent = `${this.data?.song?.title || 'Song'} (${track?.name || track?.instrument || 'Unsupported'})`;
      }

      this.updateHeaderActions();

      const body = this.panelEl?.querySelector('#sfc-panel-body');
      if (body) {
        body.innerHTML = `
          <div class="sfc-unsupported-card">
            <div class="sfc-unsupported-icon">⚠️</div>
            <div class="sfc-unsupported-title">音軌暫不支援 (Unsupported Track)</div>
            <p class="sfc-unsupported-desc">${escapeHtml(reason)}</p>
            <p class="sfc-unsupported-hint">左手指法教練第一版僅支援標準 6 弦吉他音軌。請切換至吉他軌以查看指法指引。</p>
          </div>
        `;
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

      const snapLeftBtn = this.panelEl?.querySelector('#sfc-btn-snap-left');
      snapLeftBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapLeft();
      });

      const snapRightBtn = this.panelEl?.querySelector('#sfc-btn-snap-right');
      snapRightBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.snapRight();
      });

      const toggleExpandBtn = this.panelEl?.querySelector('#sfc-btn-toggle-expand');
      toggleExpandBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand();
      });
    }

    snapLeft() {
      if (!this.panelEl) return;
      this.currentSnap = 'left';
      this.panelEl.style.left = '16px';
      this.panelEl.style.right = 'auto';
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('sfc_coach_snap', 'left');
      } catch (e) {}
    }

    snapRight() {
      if (!this.panelEl) return;
      this.currentSnap = 'right';
      this.panelEl.style.left = 'auto';
      this.panelEl.style.right = '16px';
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('sfc_coach_snap', 'right');
      } catch (e) {}
    }

    toggleExpand() {
      this.uiMode = this.uiMode === 'expanded' ? 'compact' : 'expanded';
      if (this.panelEl) {
        this.panelEl.classList.remove('sfc-compact', 'sfc-expanded');
        this.panelEl.classList.add(`sfc-${this.uiMode}`);
      }
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('sfc_coach_ui_mode', this.uiMode);
      } catch (e) {}
      this.updateHeaderActions();
      this.updateView();
    }

    /**
     * Hide the panel and its FAB entirely on pages without a score (artist, search, home).
     * Separate from minimize so the user's minimized state survives navigation.
     */
    setPageVisible(visible) {
      const display = visible ? '' : 'none';
      if (this.panelEl) this.panelEl.style.display = display;
      if (this.fabEl) this.fabEl.style.display = display;
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

    /**
     * Change the inline cue mode from the panel's switch
     * @param {'smart'|'all'|'off'} mode
     */
    setOverlayMode(mode) {
      if (!OVERLAY_MODES.some(m => m.id === mode) || mode === this.overlayMode) return;
      this.overlayMode = mode;
      if (typeof this.options.onOverlayModeChange === 'function') {
        this.options.onOverlayModeChange(mode);
      }
      this.updateView();
    }

    /**
     * "Next" card: the next hand shape to prepare, its chord name and how many beats away it is.
     * Turns amber with a "準備換" prompt (text, not colour alone) within two beats.
     */
    renderNextShapeHtml(tuningNames, trackTuning) {
      if (!ChordTools) return '';
      const next = ChordTools.findNextShapeChange(this.measures, this.currentMeasureIndex, this.currentEventIndex);
      if (!next) {
        return `<div class="sfc-next-card sfc-next-none"><span class="sfc-card-tag sfc-tag-next">接下來</span><span class="sfc-next-where">後面沒有新的指型</span></div>`;
      }

      let beatsAway = next.beatsAway;
      const isLive = this.mode === 'follow' && this.lastPlaybackState === 'playing' && typeof this.lastPositionInMeasure === 'number';
      if (isLive) {
        const measure = this.measures[this.currentMeasureIndex];
        const [beatsPerMeasure, beatValue] = timeSignatureParts(measure);
        const currentBeat = measure.beats.find(b => (b.eventIndex || b.beatNumber) === this.currentEventIndex);
        const eventStartBeats = (currentBeat?.timeOffset?.value || 0) * beatValue;
        const elapsedSinceEvent = this.lastPositionInMeasure * beatsPerMeasure - eventStartBeats;
        beatsAway = Math.max(0, beatsAway - Math.max(0, elapsedSinceEvent));
      }
      // While playing, count whole beats left (like counting in); otherwise show the exact gap
      const shown = isLive ? Math.max(1, Math.ceil(beatsAway - 0.1)) : Math.round(beatsAway * 2) / 2;
      const soon = beatsAway <= 2;
      const countdown = beatsAway < 0.25 ? '現在' : `再 ${shown % 1 ? shown.toFixed(1) : shown} 拍`;
      const where = next.measuresAway === 0 ? '本小節' : `第 ${next.measureNumber} 小節`;
      const position = next.beat.recommendedPosition || next.measure.recommendedPosition || 1;
      const segment = {
        segmentIndex: 0,
        position,
        beats: [next.beat],
        startEvent: next.eventIndex,
        endEvent: next.eventIndex,
        startBeat: next.beat.beatNumber,
        endBeat: next.beat.beatNumber
      };
      // Compact renderer: the full-size panel style is laid out for ~190px and collapses at 84px
      const svg = ShapeDiagram.renderSVG(segment, null, { compact: true, density: 'large', showFretLabel: true, width: 84, height: 72, tuningNames, tuning: trackTuning, singleEventOnly: false });

      return `
        <div class="sfc-next-card${soon ? ' sfc-next-soon' : ''}">
          <div class="sfc-next-head">
            <span class="sfc-card-tag sfc-tag-next">接下來</span>
            <span class="sfc-next-countdown">${soon ? '準備換 · ' : ''}${countdown}</span>
          </div>
          <div class="sfc-next-body">
            <div class="sfc-next-diagram">${svg}</div>
            <div class="sfc-next-info">
              <div class="sfc-next-chord">${next.chordName || 'P' + position}</div>
              <div class="sfc-next-where">${where} · P${position}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderOverlayModeHtml() {
      const buttons = OVERLAY_MODES.map(m => {
        const active = m.id === this.overlayMode;
        return `<button type="button" class="sfc-seg-btn${active ? ' sfc-active' : ''}" data-overlay-mode="${m.id}" aria-pressed="${active}" title="${m.title}">${m.label}</button>`;
      }).join('');
      return `
        <div class="sfc-overlay-mode" role="group" aria-label="譜上指型提示">
          <span class="sfc-overlay-mode-label">譜上指型</span>
          <div class="sfc-segmented">${buttons}</div>
        </div>
      `;
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
      this.isLoading = false;
      this.isUnsupported = false;

      const newSongId = newFingeringResult.song?.songId;
      if (newSongId !== undefined && newSongId !== this.currentSongId) {
        this.currentSongId = newSongId;
        this.currentMeasureIndex = 0;
      }

      this.data = newFingeringResult;
      this.measures = newFingeringResult.measures;
      this.totalMeasures = this.measures.length;
      this.currentMeasureIndex = Math.min(this.currentMeasureIndex, Math.max(0, this.totalMeasures - 1));
      this.currentEventIndex = 1;
      this.currentBeatNumber = 1;
      this.activeSegmentIndex = 0;
      this.updateHeaderTrackInfo();
      this.updateHeaderActions();
      this.updateView();
    }

    setFingeringResult(newFingeringResult) {
      this.updateData(newFingeringResult);
    }

    updateHeaderTrackInfo() {
      const trackTitleEl = this.panelEl?.querySelector('#sfc-track-info') || document.getElementById('sfc-track-info');
      if (trackTitleEl && this.data) {
        trackTitleEl.textContent = `${this.data.song?.title || 'Song'} (${this.data.track?.name || 'Guitar'})`;
      }
    }

    /**
     * Manual Navigation Methods
     */
    goToMeasure(measureIndex, isManual = true) {
      this.lastPositionInMeasure = null;
      this.lastBeatTick = null;
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
      this.lastPositionInMeasure = null;
      this.lastBeatTick = null;
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
      this.lastPositionInMeasure = null;
      this.lastBeatTick = null;
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
      if (this.isUnsupported || this.isLoading) return;
      if (this.mode === 'manual') {
        return; // User is in manual browsing mode; do NOT steal UI
      }

      const targetMNum = canonicalResult?.measureNumber || playbackEvent?.measureNumber;
      if (!targetMNum || targetMNum < 1 || targetMNum > this.totalMeasures) return;

      const targetMIdx = targetMNum - 1;
      const targetEvIdx = canonicalResult?.eventIndex || playbackEvent?.eventIndex || 1;
      const confidence = canonicalResult?.confidence || playbackEvent?.confidence || 'exact';
      const playState = playbackEvent?.state || 'playing';
      const source = canonicalResult?.source || playbackEvent?.source || this.lastPlaybackSource || 'sync';

      // Playhead position inside the measure (0..1). A chord held for a whole bar produces no new
      // events, so the "next shape" countdown is driven by the beat the playhead is on instead.
      const positionInMeasure = typeof playbackEvent?.positionInMeasure === 'number' && playState === 'playing'
        ? playbackEvent.positionInMeasure
        : null;
      const beatTick = positionInMeasure !== null
        ? Math.floor(positionInMeasure * timeSignatureParts(this.measures[targetMIdx])[0])
        : null;

      // Performance dirty-checking: skip identical renders to prevent flicker
      if (targetMIdx === this.currentMeasureIndex && 
          targetEvIdx === this.currentEventIndex && 
          confidence === this.lastPlaybackConfidence &&
          playState === this.lastPlaybackState &&
          source === this.lastPlaybackSource &&
          beatTick === this.lastBeatTick) {
        return;
      }

      this.lastPositionInMeasure = positionInMeasure;
      this.lastBeatTick = beatTick;
      this.lastPlaybackConfidence = confidence;
      this.lastPlaybackState = playState;
      this.lastPlaybackSource = source;

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
      const segmentChord = ChordTools ? ChordTools.dominantChordName(activeSegment.beats) : null;
      const overviewChordHtml = segmentChord ? `<span class="sfc-chord-badge" title="和弦名稱">${segmentChord}</span>` : '';
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

      // 2. Measure presentation classification and badges
      const classification = ShapeDiagram.classifyMeasure ? ShapeDiagram.classifyMeasure(measure) : { type: 'sequence' };
      const handSpanText = classification?.handSpan ? classification.handSpan.text : null;
      const spanBadgeHtml = handSpanText
        ? `<span class="sfc-badge sfc-badge-span" title="Hand Fret Span">📐 ${handSpanText}</span>`
        : '';

      const classType = classification?.type || 'sequence';
      const classLabels = {
        sequence: '🎼 Sequence',
        shape: '🎸 Shape',
        mixed: '🔀 Mixed',
        'multi-shape': '⚡ Multi-Shape'
      };
      const classBadgeClass = {
        sequence: 'sfc-badge-seq',
        shape: 'sfc-badge-shape',
        mixed: 'sfc-badge-mixed',
        'multi-shape': 'sfc-badge-multishape'
      };
      const classBadgeHtml = `<span class="sfc-badge ${classBadgeClass[classType] || 'sfc-badge-seq'}" title="Measure Classification">${classLabels[classType] || classType}</span>`;

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

      const sourceBadgeHtml = `
        <span class="sfc-badge sfc-badge-sync-source" title="Runtime Sync Source and Playback State">
          ${this.lastPlaybackState === 'playing' ? '▶' : '⏸'} M${mNum} Ev${this.currentEventIndex} · ${this.lastPlaybackSource || 'init'} · ${this.lastPlaybackConfidence}
        </span>
      `;

      const statusHtml = `
        <div class="sfc-status-badges">
          <span class="sfc-badge sfc-badge-pos">🖐️ ${posLabel}</span>
          ${spanBadgeHtml}
          ${classBadgeHtml}
          ${shiftBadgeHtml}
          ${sigBadgeHtml}
          ${confidenceBadgeHtml}
          ${sourceBadgeHtml}
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

      // Tuning names
      const trackTuning = this.data.track?.tuningMidi || this.data.track?.tuning;
      const tuningNames = Array.isArray(this.data.track?.tuningNames) && this.data.track.tuningNames.length === 6
        ? this.data.track.tuningNames
        : (Array.isArray(trackTuning) && trackTuning.length === 6
            ? trackTuning.map(midiToPitch)
            : ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);

      const highlightedEvent = isMeasureOnly ? null : this.currentEventIndex;

      const isCompactMode = this.uiMode === 'compact';
      const ovWidth = isCompactMode ? 190 : 260;
      const ovSeqHeight = isCompactMode ? 135 : 190;
      const ovChordHeight = isCompactMode ? 145 : 210;
      const ovMixedHeight = isCompactMode ? 135 : 195;

      // Helper to render Step Strip (Finger Flow)
      const renderStepStrip = (beats, isMixed = false) => {
        let stripBeats = beats;
        if (isCompactMode) {
          const cur = this.currentEventIndex;
          stripBeats = beats.filter(b => {
            const ev = b.eventIndex || b.beatNumber;
            return ev >= cur - 1 && ev <= cur + 2;
          });
          if (stripBeats.length === 0) {
            stripBeats = beats.slice(0, 4);
          }
        }

        let stepStripHtml = `<div class="sfc-step-strip ${isCompactMode ? 'sfc-step-strip-compact' : ''}">`;
        stripBeats.forEach((b) => {
          const bEv = b.eventIndex || b.beatNumber;
          const isStepActive = !isMeasureOnly && bEv === this.currentEventIndex;
          const activeNotes = (b.notes || []).filter(n => !n.isRest && n.fret >= 0);
          const isRest = activeNotes.length === 0;
          const isChord = isMixed && activeNotes.length >= 2;

          let stepDesc = '';
          let fingerText = '—';
          if (isRest) {
            stepDesc = 'Rest';
            fingerText = '—';
          } else if (isChord) {
            stepDesc = 'Chord';
            fingerText = '和弦';
          } else {
            const firstNote = activeNotes[0];
            stepDesc = `S${firstNote.string + 1}·F${firstNote.fret}`;
            fingerText = `${firstNote.recommendedFinger ?? firstNote.finger ?? (firstNote.fret === 0 ? '0' : '1')}`;
          }

          stepStripHtml += `
            <div class="sfc-step-item ${isStepActive ? 'sfc-step-active' : ''} ${isRest ? 'sfc-step-rest' : ''}" data-event="${bEv}" title="Event ${bEv}: ${stepDesc}">
              <div class="sfc-step-ev">Ev ${bEv}</div>
              <div class="sfc-step-finger ${fingerText === '0' ? 'sfc-finger-0' : ''}">${isChord ? fingerText : '指 ' + fingerText}</div>
              <div class="sfc-step-desc">${stepDesc}</div>
            </div>
          `;
        });
        stepStripHtml += '</div>';
        return stepStripHtml;
      };

      // 4. BLOCK 1: Overview Card (主卡 - Learning Aid / Structural Overview)
      let overviewCardHtml = '';
      if (classType === 'sequence') {
        // Sequence measure: Hand Frame Fretboard SVG + Step Strip / Finger Flow
        const handFrameSvg = ShapeDiagram.renderHandFrameSVG
          ? ShapeDiagram.renderHandFrameSVG(activeSegment, highlightedEvent, {
              width: ovWidth,
              height: ovSeqHeight,
              tuningNames,
              tuning: trackTuning
            })
          : ShapeDiagram.renderSVG(activeSegment, highlightedEvent, {
              width: ovWidth,
              height: ovSeqHeight,
              tuningNames,
              tuning: trackTuning,
              handFrameMode: true
            });

        const stepStripHtml = renderStepStrip(measure.beats, false);

        overviewCardHtml = `
          <div class="sfc-overview-card">
            <div class="sfc-card-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag">OVERVIEW</span>${overviewChordHtml}
                <span class="sfc-card-title">Measure ${mNum} Hand Frame</span>
              </div>
              <span class="sfc-card-sub">${posLabel}${handSpanText ? ' · ' + handSpanText : ''}</span>
            </div>
            <div class="sfc-diagram-box">
              ${handFrameSvg}
            </div>
            <div class="sfc-step-strip-wrapper">
              <div class="sfc-step-strip-header">
                <span class="sfc-step-strip-title">Finger Flow</span>
                <span class="sfc-step-strip-hint">點擊步驟跳轉</span>
              </div>
              ${stepStripHtml}
            </div>
          </div>
        `;
      } else if (classType === 'shape') {
        // Chord shape: Full grip diagram
        const chordSvg = ShapeDiagram.renderSVG(activeSegment, highlightedEvent, {
          width: ovWidth,
          height: ovChordHeight,
          tuningNames,
          tuning: trackTuning,
          singleEventOnly: false
        });

        overviewCardHtml = `
          <div class="sfc-overview-card">
            <div class="sfc-card-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag">OVERVIEW</span>${overviewChordHtml}
                <span class="sfc-card-title">Measure ${mNum} Chord Grip</span>
              </div>
              <span class="sfc-card-sub">${posLabel}</span>
            </div>
            <div class="sfc-diagram-box">
              ${chordSvg}
            </div>
          </div>
        `;
      } else {
        // Mixed or Multi-shape: Primary shape + sequence cues
        const chordSvg = ShapeDiagram.renderSVG(activeSegment, highlightedEvent, {
          width: ovWidth,
          height: ovMixedHeight,
          tuningNames,
          tuning: trackTuning,
          singleEventOnly: false
        });

        const stepStripHtml = renderStepStrip(measure.beats, true);

        overviewCardHtml = `
          <div class="sfc-overview-card">
            <div class="sfc-card-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag">OVERVIEW</span>${overviewChordHtml}
                <span class="sfc-card-title">Measure ${mNum} (${classLabels[classType] || 'Mixed'})</span>
              </div>
              <span class="sfc-card-sub">${posLabel}</span>
            </div>
            <div class="sfc-diagram-box">
              ${chordSvg}
            </div>
            <div class="sfc-step-strip-wrapper">
              ${stepStripHtml}
            </div>
          </div>
        `;
      }

      // 5. Canonical Event Selector Pills
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

      // 6. BLOCK 2: Now Playing Card (次卡 - Real-Time Event Monitor)
      const isCurrentEventRest = currentEvent && (currentEvent.notes.length === 0 || currentEvent.notes.every(n => n.isRest || n.fret < 0));
      let nowPlayingCardHtml = '';

      if (isMeasureOnly) {
        nowPlayingCardHtml = `
          <div class="sfc-now-playing-card">
            <div class="sfc-card-header sfc-now-playing-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag sfc-tag-now-playing">PLAYBACK</span>
                <span class="sfc-card-title">Measure ${mNum} Synced</span>
              </div>
              <span class="sfc-card-sub">${posLabel}</span>
            </div>
            <div style="color: #a1a1aa; font-size: 11.5px; padding: 8px 12px;">Playing in Measure ${mNum} (Measure-synced follow)</div>
          </div>
        `;
      } else if (isCurrentEventRest) {
        const upcomingEvent = measure.beats.slice(this.currentEventIndex).find(b => b.notes && b.notes.some(n => !n.isRest && n.fret >= 0));
        const upcomingNote = upcomingEvent?.notes?.find(n => !n.isRest && n.fret >= 0);
        const upcomingPos = upcomingEvent ? (upcomingEvent.recommendedPosition || measure.recommendedPosition) : measure.recommendedPosition;
        const upcomingCue = upcomingNote
          ? `即將進入 Pos ${upcomingPos} (弦 ${upcomingNote.string + 1} 第 ${upcomingNote.fret} 品)`
          : (upcomingPos ? `即將進入 Pos ${upcomingPos}` : '準備下個小節');

        nowPlayingCardHtml = `
          <div class="sfc-now-playing-card">
            <div class="sfc-card-header sfc-now-playing-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag sfc-tag-now-playing">NOW PLAYING</span>
                <span class="sfc-card-title">Ev ${this.currentEventIndex} (${currentEvent?.timing || 'Rest'})</span>
              </div>
              <span class="sfc-card-sub">${posLabel}</span>
            </div>
            <div class="sfc-now-playing-rest-box">
              <div class="sfc-rest-icon">⏸</div>
              <div class="sfc-rest-info">
                <div class="sfc-rest-title">休止 / 左手放鬆 (Rest / Hand Free)</div>
                <div class="sfc-rest-upcoming">✦ ${upcomingCue}</div>
              </div>
            </div>
          </div>
        `;
      } else if (currentEvent) {
        const activeNotes = currentEvent.notes.filter(n => !n.isRest && n.string >= 0);
        const hasMultipleVoices = currentEvent.notes.some(n => n.source && n.source.voiceIndex > 0) || 
                                  (Array.isArray(currentEvent.sources) && currentEvent.sources.length > 1);

        // Next note preview
        const nextEvent = measure.beats.slice(this.currentEventIndex).find(b => b.notes && b.notes.some(n => !n.isRest && n.fret >= 0));
        const nextNote = nextEvent?.notes?.find(n => !n.isRest && n.fret >= 0);
        let nextPreviewHtml = '';
        if (nextNote) {
          const nextF = nextNote.recommendedFinger ?? nextNote.finger ?? (nextNote.fret === 0 ? 0 : 1);
          nextPreviewHtml = `
            <div class="sfc-next-note-chip" title="Next Note Preview">
              <span class="sfc-next-label">Next ➔</span>
              <span class="sfc-next-detail">Ev ${nextEvent.eventIndex || nextEvent.beatNumber}: 弦 ${nextNote.string + 1} 第 ${nextNote.fret} 品 (指 ${nextF})</span>
            </div>
          `;
        }

        let notesListHtml = '<div class="sfc-notes-list">';
        activeNotes.forEach((n) => {
          const guitarStringNumber = n.string + 1;
          const strOpenName = tuningNames[n.string] || `Str ${guitarStringNumber}`;
          const fingerName = FINGER_NAMES[n.recommendedFinger] || `Finger ${n.recommendedFinger}`;
          const pitchStr = n.pitch ? ` (${n.pitch})` : '';
          const voiceTag = hasMultipleVoices && n.source
            ? `<span class="sfc-voice-tag" title="Voice ${n.source.voiceIndex}">V${n.source.voiceIndex}</span>`
            : '';

          notesListHtml += `
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
        notesListHtml += '</div>';

        nowPlayingCardHtml = `
          <div class="sfc-now-playing-card">
            <div class="sfc-card-header sfc-now-playing-header">
              <div class="sfc-card-title-group">
                <span class="sfc-card-tag sfc-tag-now-playing">NOW PLAYING</span>
                ${currentEvent.chordName ? `<span class="sfc-chord-badge" title="和弦名稱">${currentEvent.chordName}</span>` : ''}
                <span class="sfc-card-title">Ev ${this.currentEventIndex} Details (${currentEvent.timing || '1/4'})</span>
              </div>
              <span class="sfc-card-sub">${currentEvent.recommendedPosition ? 'Pos ' + currentEvent.recommendedPosition : posLabel}</span>
            </div>
            ${notesListHtml}
            ${nextPreviewHtml}
          </div>
        `;
      }

      // Assemble into body
      body.innerHTML = navHtml + statusHtml + segmentsHtml + overviewCardHtml + this.renderNextShapeHtml(tuningNames, trackTuning) + (isCompactMode ? '' : eventsHtml) + nowPlayingCardHtml + this.renderOverlayModeHtml();

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

      body.querySelectorAll('.sfc-seg-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          this.setOverlayMode(e.currentTarget.getAttribute('data-overlay-mode'));
        });
      });

      body.querySelectorAll('.sfc-step-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const evIdx = parseInt(e.currentTarget.getAttribute('data-event'), 10);
          if (!isNaN(evIdx)) {
            this.selectEvent(evIdx, true);
          }
        });
      });

      // Keep the active step visible by scrolling only the strip horizontally.
      // scrollIntoView would also scroll the panel body and the Songsterr page on every event.
      const activeStep = body.querySelector('.sfc-step-item.sfc-step-active');
      const strip = activeStep?.parentElement;
      if (activeStep && strip && strip.clientWidth > 0) {
        const stepLeft = activeStep.offsetLeft - strip.offsetLeft;
        const stepRight = stepLeft + activeStep.offsetWidth;
        if (stepLeft < strip.scrollLeft || stepRight > strip.scrollLeft + strip.clientWidth) {
          // Instant: the strip is rebuilt on every render, so a smooth scroll would restart from 0 each time
          strip.scrollLeft = Math.max(0, stepLeft - 8);
        }
      }

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
