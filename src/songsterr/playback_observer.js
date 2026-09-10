/**
 * playback_observer.js
 * 
 * Independent adapter to discover and monitor Songsterr Web Player's current playback position.
 * 
 * Responsibilities:
 * - Monitors playback state (playing, paused, stopped)
 * - Resolves current measureNumber and eventIndex (rhythm event)
 * - Emits normalized playback position events with explicit confidence level
 * - Logs console debug output: "▶ M<measureNumber> event <eventIndex>"
 * - Detects Seek, Pause, Resume, Speed change, and Track switch
 * - Strictly DECOUPLED: Does NOT depend on CoachPanel and does NOT manipulate CoachPanel UI
 * 
 * Terminology Distinction:
 * - measureNumber: 1-indexed musical measure (e.g. M1, M2, ...)
 * - eventIndex: 1-indexed rhythm/note event inside the measure (e.g. event 1, event 2, ...)
 *   (Note: in 4/4 time, an eighth-note measure has 7 or 8 rhythm events; eventIndex != quarter beat!)
 * - positionInMeasure: 0.0 - 1.0 (fractional progress through measure)
 * - currentTime: elapsed seconds in audio if available
 * - confidence: "exact" (measure + event resolved) | "measure-only"
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PlaybackObserver = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class PlaybackObserver {
    constructor(options = {}) {
      this.options = Object.assign({
        debugLog: true,        // Log "▶ M1 event 1" to console
        pollIntervalMs: 60,    // Sampling interval
        targetWindow: typeof window !== 'undefined' ? window : null
      }, options);

      this.listeners = [];
      this.pollTimer = null;
      this.isObserving = false;

      this.currentState = {
        state: 'stopped',         // 'playing' | 'paused' | 'stopped'
        measureNumber: 1,         // 1-indexed
        eventIndex: 1,            // 1-indexed rhythm event inside measure
        voiceIndex: 0,            // 0-indexed voice
        beatIndex: 0,             // 0-indexed beat within voice
        positionInMeasure: 0.0,   // 0.0 to 1.0
        currentTime: 0.0,
        confidence: 'exact',      // 'exact' | 'measure-only'
        source: null              // 'dom-playhead' | 'cursor-marker' | 'measure-only' | 'react-store'
      };

      this.lastLoggedMeasure = null;
      this.lastLoggedEvent = null;

      this.domMutationObserver = null;
    }

    /**
     * Subscribe to playback position change events
     * @param {function(PlaybackEvent): void} callback 
     */
    on(event, callback) {
      if (event === 'change' && typeof callback === 'function') {
        this.listeners.push(callback);
      }
      return this;
    }

    off(event, callback) {
      if (event === 'change') {
        this.listeners = this.listeners.filter(cb => cb !== callback);
      }
      return this;
    }

    emit(eventData) {
      this.listeners.forEach(cb => {
        try {
          cb(eventData);
        } catch (e) {
          console.error('[PlaybackObserver] Listener error:', e);
        }
      });
    }

    /**
     * Start monitoring playback
     */
    start() {
      if (this.isObserving) return this;
      this.isObserving = true;

      if (this.options.debugLog) {
        console.log('%c🔍 [PlaybackObserver] Playback monitoring started', 'color: #00d26a; font-weight: bold;');
      }

      // 1. Setup DOM Mutation Observer for #cursorMarker and #root dataset
      this.setupDomObservers();

      // 2. Setup periodic polling loop for playhead coordinates
      this.pollTimer = setInterval(() => {
        this.samplePlaybackPosition();
      }, this.options.pollIntervalMs);

      // Perform initial sample
      this.samplePlaybackPosition();
      return this;
    }

    /**
     * Stop monitoring
     */
    stop() {
      this.isObserving = false;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.domMutationObserver) {
        this.domMutationObserver.disconnect();
        this.domMutationObserver = null;
      }
      return this;
    }

    /**
     * Observe DOM changes:
     * - #root[data-playing] (playing state)
     * - #cursorMarker[data-cursor] (seek / click)
     */
    setupDomObservers() {
      if (typeof document === 'undefined') return;

      try {
        const rootEl = document.getElementById('root');
        if (rootEl) {
          this.domMutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(m => {
              if (m.type === 'attributes' && m.attributeName === 'data-playing') {
                const isPlaying = rootEl.dataset.playing === 'on';
                this.updateState({ state: isPlaying ? 'playing' : 'paused' });
              }
            });
          });

          this.domMutationObserver.observe(rootEl, {
            attributes: true,
            attributeFilter: ['data-playing', 'data-cursor-pulse']
          });
        }
      } catch (e) {
        // Safe degrade in non-browser environments
      }
    }

    /**
     * Sample playback position across available tiers
     */
    samplePlaybackPosition() {
      if (typeof document === 'undefined') return;

      let detectedState = this.detectPlaybackState();
      let posData = null;

      // Tier 1: Try React Fiber Store / Player Instance
      posData = this.probeReactStore();

      // Tier 2: Try DOM Playhead SVG & Targets
      if (!posData || posData.confidence !== 'exact') {
        const domPos = this.probeDomPlayhead();
        if (domPos) {
          posData = domPos;
        }
      }

      // Tier 3: Try Cursor Marker (active note clicked/seeked)
      if (!posData) {
        const markerPos = this.probeCursorMarker();
        if (markerPos) {
          posData = markerPos;
        }
      }

      if (posData) {
        this.updateState(Object.assign({ state: detectedState }, posData));
      } else if (detectedState !== this.currentState.state) {
        this.updateState({ state: detectedState });
      }
    }

    /**
     * Detect playback state: 'playing' | 'paused' | 'stopped'
     */
    detectPlaybackState() {
      if (typeof document === 'undefined') return 'stopped';

      // 1. Check #root[data-playing]
      const rootEl = document.getElementById('root');
      if (rootEl && rootEl.dataset) {
        if (rootEl.dataset.playing === 'on') return 'playing';
        if (rootEl.dataset.playing === 'off') return 'paused';
      }

      // 2. Check navigator.mediaSession
      if (typeof navigator !== 'undefined' && navigator.mediaSession) {
        if (navigator.mediaSession.playbackState === 'playing') return 'playing';
        if (navigator.mediaSession.playbackState === 'paused') return 'paused';
      }

      // 3. Check audio elements
      const audios = document.querySelectorAll('audio');
      for (let i = 0; i < audios.length; i++) {
        if (!audios[i].paused && audios[i].currentTime > 0) {
          return 'playing';
        }
      }

      return this.currentState.state === 'playing' ? 'paused' : this.currentState.state;
    }

    /**
     * Tier 1: Probe React Fiber / Store
     * Note: In Chrome Extension MV3 content scripts running in isolated world,
     * window.__store__ is inaccessible. This is kept as a fallback for main-world contexts.
     */
    probeReactStore() {
      try {
        const win = this.options.targetWindow || (typeof window !== 'undefined' ? window : null);
        if (!win) return null;
        const store = win.__store__;
        if (store && typeof store.get === 'function') {
          const state = store.get();
          const player = state.player;
          if (player?.instance && typeof player.instance.getCursor === 'function') {
            const cursorVal = player.instance.getCursor();
            if (typeof cursorVal === 'number' && !isNaN(cursorVal)) {
              const res = this.cursorToMeasureEvent(cursorVal, state);
              if (res) {
                res.source = 'react-store';
              }
              return res;
            }
          }
        }
      } catch (e) {
        // Ignore React probe errors
      }
      return null;
    }

    /**
     * Tier 2: Probe DOM Playhead SVG (<use href^="#cursor-playhead">) and match against beat targets
     * Includes multi-line staff protection (lineIndex filtering and 2D proximity)
     */
    probeDomPlayhead() {
      try {
        const playheads = document.querySelectorAll('use[href*="cursor-playhead"]');
        let activePlayhead = null;

        for (let i = 0; i < playheads.length; i++) {
          const ph = playheads[i];
          const style = ph.style || {};
          if (style.visibility !== 'hidden' && style.transform && style.transform.includes('translate3d')) {
            activePlayhead = ph;
            break;
          }
        }

        if (!activePlayhead) return null;

        // Extract transform X and Y: translate3d(Xpx, Ypx, 0)
        const match = /translate3d\(\s*(-?[\d.]+)px(?:,\s*(-?[\d.]+)px)?/i.exec(activePlayhead.style.transform);
        if (!match) return null;
        const cursorX = parseFloat(match[1]);
        const cursorY = match[2] ? parseFloat(match[2]) : 0;

        // Extract lineIndex from playhead href if present, e.g. #cursor-playhead-0-1 or cursor-playhead-2
        const href = activePlayhead.getAttribute('href') || activePlayhead.getAttribute('xlink:href') || '';
        const lineMatch = href.match(/cursor-playhead(?:-\d+)?-(\d+)/);
        const playheadLineIndex = lineMatch ? parseInt(lineMatch[1], 10) : null;

        // Find parent SVG
        const parentSvg = activePlayhead.closest('svg');
        if (!parentSvg) return null;

        // Search within same SVG for beat targets: rect[data-testid="tab-beat-target"]
        const beatTargets = parentSvg.querySelectorAll('rect[data-testid="tab-beat-target"]');
        let closestBeat = null;
        let minDiff = Infinity;

        for (let i = 0; i < beatTargets.length; i++) {
          const bt = beatTargets[i];

          // Multi-line staff protection: filter by data-line-index if present on target
          const targetLineAttr = bt.getAttribute('data-line-index');
          if (playheadLineIndex !== null && targetLineAttr !== null) {
            const targetLine = parseInt(targetLineAttr, 10);
            if (!isNaN(targetLine) && targetLine !== playheadLineIndex) {
              continue; // Skip beat targets on a different staff line
            }
          }

          const xAttr = parseFloat(bt.getAttribute('x') || '0');
          const yAttr = parseFloat(bt.getAttribute('y') || '0');
          const xDiff = Math.abs(xAttr - cursorX);

          // 2D distance penalty if Y coordinates differ significantly on same staff system
          const yDiff = (cursorY !== 0 && yAttr !== 0) ? Math.abs(yAttr - cursorY) : 0;
          const totalDiff = xDiff + (yDiff > 30 ? yDiff * 2 : 0);

          if (totalDiff < minDiff) {
            minDiff = totalDiff;
            closestBeat = bt;
          }
        }

        if (closestBeat) {
          const mIdx = parseInt(closestBeat.getAttribute('data-measure-index') || '0', 10);
          const bIdx = parseInt(closestBeat.getAttribute('data-beat-index') || '0', 10);
          const vIdx = parseInt(closestBeat.getAttribute('data-voice-index') || '0', 10);

          return {
            measureNumber: mIdx + 1,       // 1-indexed
            eventIndex: bIdx + 1,          // 1-indexed rhythm event in voice
            voiceIndex: vIdx,
            beatIndex: bIdx,
            positionInMeasure: 0.0,
            currentTime: 0.0,
            confidence: minDiff < 15 ? 'exact' : 'measure-only',
            source: 'dom-playhead'
          };
        }

        // Fallback to measure target: rect[data-testid="tab-measure-target"]
        const measureTargets = parentSvg.querySelectorAll('rect[data-testid="tab-measure-target"]');
        for (let i = 0; i < measureTargets.length; i++) {
          const mt = measureTargets[i];
          const x = parseFloat(mt.getAttribute('x') || '0');
          const w = parseFloat(mt.getAttribute('width') || '1');
          if (cursorX >= x && cursorX <= x + w) {
            const mIdx = parseInt(mt.getAttribute('data-measure-index') || '0', 10);
            return {
              measureNumber: mIdx + 1,
              eventIndex: 1,
              voiceIndex: 0,
              beatIndex: 0,
              positionInMeasure: Math.max(0, Math.min(1, (cursorX - x) / w)),
              currentTime: 0.0,
              confidence: 'measure-only',
              source: 'measure-only'
            };
          }
        }
      } catch (e) {
        // Ignore DOM parsing errors
      }
      return null;
    }

    /**
     * Tier 3: Probe cursorMarker path (#cursorMarker[data-cursor])
     */
    probeCursorMarker() {
      try {
        const marker = document.getElementById('cursorMarker');
        if (!marker) return null;

        const dataCursor = marker.getAttribute('data-cursor');
        if (!dataCursor) return null;

        // format: "partId,measure,voice,beat,string"
        const parts = dataCursor.split(',').map(s => parseInt(s.trim(), 10));
        if (parts.length >= 4 && !isNaN(parts[1]) && !isNaN(parts[3])) {
          return {
            measureNumber: parts[1] + 1, // measure is 0-indexed
            eventIndex: parts[3] + 1,    // beat is 0-indexed rhythm event
            voiceIndex: parts[2] || 0,
            beatIndex: parts[3],
            positionInMeasure: 0.0,
            currentTime: 0.0,
            confidence: 'exact',
            source: 'cursor-marker'
          };
        }
      } catch (e) {
        // Ignore
      }
      return null;
    }

    /**
     * Map raw player cursor value to measure and rhythm event using state metadata
     */
    cursorToMeasureEvent(cursorVal, state) {
      try {
        const part = state.part?.current;
        if (part && Array.isArray(part.measures)) {
          // Songsterr cursorVal is typically cumulative ticks or milliseconds
          // If measureLayouts exist:
          let accumulated = 0;
          for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
            const m = part.measures[mIdx];
            const mDuration = m.duration || 960; // Standard 4/4 ticks
            if (accumulated + mDuration > cursorVal) {
              const offsetInM = cursorVal - accumulated;
              const posFraction = Math.max(0, Math.min(1, offsetInM / mDuration));

              // Find rhythm event
              let eventIdx = 1;
              if (m.voices && m.voices[0]?.beats) {
                let beatAcc = 0;
                for (let bIdx = 0; bIdx < m.voices[0].beats.length; bIdx++) {
                  const b = m.voices[0].beats[bIdx];
                  const bDur = b.durationTicks || (mDuration / m.voices[0].beats.length);
                  if (beatAcc + bDur > offsetInM) {
                    eventIdx = bIdx + 1;
                    break;
                  }
                  beatAcc += bDur;
                }
              }

              return {
                measureNumber: mIdx + 1,
                eventIndex: eventIdx,
                positionInMeasure: posFraction,
                currentTime: cursorVal / 1000,
                confidence: 'exact'
              };
            }
            accumulated += mDuration;
          }
        }
      } catch (e) {
        // Ignore
      }
      return null;
    }

    /**
     * Update internal state and emit if changed
     */
    updateState(patch) {
      const prev = Object.assign({}, this.currentState);
      Object.assign(this.currentState, patch);

      const isChanged = prev.state !== this.currentState.state ||
                        prev.measureNumber !== this.currentState.measureNumber ||
                        prev.eventIndex !== this.currentState.eventIndex;

      if (isChanged) {
        this.emit(Object.assign({}, this.currentState));

        // Console Debug Logging: "▶ M1 event 1"
        if (this.options.debugLog && this.currentState.state === 'playing') {
          const mNum = this.currentState.measureNumber;
          const evIdx = this.currentState.eventIndex;

          if (mNum !== this.lastLoggedMeasure || evIdx !== this.lastLoggedEvent) {
            this.lastLoggedMeasure = mNum;
            this.lastLoggedEvent = evIdx;

            const srcTag = this.currentState.source ? ` [${this.currentState.source}]` : '';
            console.log(`▶ M${mNum} event ${evIdx}${srcTag}`);
          }
        }
      }
    }

    /**
     * Get snapshot of current playback state
     */
    getCurrentPosition() {
      return Object.assign({}, this.currentState);
    }
  }

  return PlaybackObserver;
});
