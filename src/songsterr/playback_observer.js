/**
 * playback_observer.js
 * 
 * Independent adapter to discover and monitor Songsterr Web Player's current playback position.
 * 
 * Responsibilities:
 * - Monitors playback state (playing, paused, stopped) via #root[data-playing]
 * - Resolves current measureNumber and positionInMeasure from active SVG playhead (<use href*="cursor-playhead">)
 * - Observes #cursorMarker[data-cursor] directly for immediate note/measure click synchronization
 * - Maintains freshness authority window (350ms) to prevent stale playhead bounce after user clicks
 * - Provides comprehensive runtime diagnostic mode: getDiagnostics() and logDiagnosticDump()
 * - Strictly DECOUPLED: Does NOT depend on CoachPanel and does NOT manipulate CoachPanel UI
 * 
 * Terminology Distinction:
 * - measureNumber: 1-indexed musical measure (e.g. M1, M2, ...)
 * - eventIndex: 1-indexed rhythm/note event inside the measure (e.g. event 1, event 2, ...)
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
      this.cursorMarkerObserver = null;
      this.markerRebindObserver = null;
      this.boundCursorMarkerEl = null;
      this.lastCursorMarkerTimestamp = 0;
      this.lastPlayheadTransforms = new Map();
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

      // 1. Setup DOM Mutation Observer for #root and #cursorMarker
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
      if (this.cursorMarkerObserver) {
        this.cursorMarkerObserver.disconnect();
        this.cursorMarkerObserver = null;
      }
      if (this.markerRebindObserver) {
        this.markerRebindObserver.disconnect();
        this.markerRebindObserver = null;
      }
      this.boundCursorMarkerEl = null;
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
        if (rootEl && typeof MutationObserver !== 'undefined') {
          this.domMutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(m => {
              if (m.type === 'attributes' && m.attributeName === 'data-playing') {
                const isPlaying = rootEl.getAttribute('data-playing') === 'on' || rootEl.dataset?.playing === 'on';
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

      // Setup targeted #cursorMarker tracking
      this.initCursorMarkerTracking();
    }

    /**
     * Bind MutationObserver directly to #cursorMarker without watching whole body attributes
     */
    /**
     * Bind MutationObserver directly to #cursorMarker without watching whole body attributes
     */
    initCursorMarkerTracking() {
      if (typeof document === 'undefined') return;

      const markerEl = document.getElementById('cursorMarker');
      if (markerEl) {
        this.bindCursorMarker(markerEl);
      }

      // Lightweight childList observer to detect if Songsterr replaces or inserts the #cursorMarker DOM element
      try {
        const container = document.body || document.documentElement || document.getElementById('root');
        if (container && typeof MutationObserver !== 'undefined') {
          this.markerRebindObserver = new MutationObserver(() => {
            const curMarker = document.getElementById('cursorMarker');
            if (curMarker && curMarker !== this.boundCursorMarkerEl) {
              this.bindCursorMarker(curMarker);
            }
          });
          this.markerRebindObserver.observe(container, {
            childList: true,
            subtree: true
          });
        }
      } catch (e) {
        // Safe degrade
      }
    }

    bindCursorMarker(markerEl) {
      if (!markerEl || markerEl === this.boundCursorMarkerEl) return;

      if (this.cursorMarkerObserver) {
        this.cursorMarkerObserver.disconnect();
        this.cursorMarkerObserver = null;
      }

      this.boundCursorMarkerEl = markerEl;

      if (typeof MutationObserver !== 'undefined') {
        this.cursorMarkerObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.attributeName === 'data-cursor') {
              this.handleCursorMarkerChange(markerEl);
              break;
            }
          }
        });

        this.cursorMarkerObserver.observe(markerEl, {
          attributes: true,
          attributeFilter: ['data-cursor']
        });
      }

      this.handleCursorMarkerChange(markerEl);
    }

    /**
     * Handle immediate data-cursor attribute change from #cursorMarker
     */
    handleCursorMarkerChange(markerEl) {
      if (!markerEl) return;
      const dataCursor = markerEl.getAttribute('data-cursor');
      if (!dataCursor) return;
      this.lastHandledDataCursor = dataCursor;

      // format: "partId,measure,voice,beat,string"
      const parts = dataCursor.split(',').map(s => parseInt(s.trim(), 10));
      if (parts.length >= 4 && !isNaN(parts[1]) && !isNaN(parts[3])) {
        this.lastCursorMarkerTimestamp = Date.now();
        this.updateState({
          measureNumber: parts[1] + 1, // 0-indexed measure -> 1-indexed
          eventIndex: parts[3] + 1,    // 0-indexed beat -> 1-indexed rhythm event
          voiceIndex: parts[2] || 0,
          beatIndex: parts[3],
          positionInMeasure: 0.0,
          confidence: 'exact',
          source: 'cursor-marker'
        });
      }
    }

    /**
     * Sample playback position across available tiers
     */
    samplePlaybackPosition() {
      if (typeof document === 'undefined') return;

      let detectedState = this.detectPlaybackState();

      // Check if #cursorMarker exists and needs binding or has updated
      const cm = document.getElementById('cursorMarker');
      if (cm) {
        if (cm !== this.boundCursorMarkerEl) {
          this.bindCursorMarker(cm);
        }
        const dataCursor = cm.getAttribute('data-cursor');
        if (dataCursor && dataCursor !== this.lastHandledDataCursor) {
          this.handleCursorMarkerChange(cm);
        }
      }

      // Check freshness authority window:
      // If a direct note/measure click occurred recently (< 350ms), hold authority to prevent polling bounce
      if (Date.now() - this.lastCursorMarkerTimestamp < 350) {
        if (detectedState !== this.currentState.state) {
          this.updateState({ state: detectedState });
        }
        return;
      }

      let posData = null;

      // Tier 1: Try React Fiber Store / Player Instance
      posData = this.probeReactStore();

      // Tier 2: Try DOM Playhead SVG & Measure markers
      if (!posData || posData.confidence !== 'exact') {
        const domPos = this.probeDomPlayhead();
        if (domPos) {
          posData = domPos;
        }
      }

      // Tier 3: Try Cursor Marker fallback
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
      if (rootEl) {
        const dp = rootEl.getAttribute('data-playing') || rootEl.dataset?.playing;
        if (dp === 'on') return 'playing';
        if (dp === 'off') return 'paused';
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
     * Tier 2: Probe DOM Playhead SVG (<use href*="cursor-playhead">)
     * Discovers active line playhead via candidate ranking (visibility, valid transform, motion delta).
     * Resolves measureNumber and positionInMeasure from active line SVG measure markers.
     */
    probeDomPlayhead() {
      try {
        const playheads = Array.from(document.querySelectorAll('use[href*="cursor-playhead"]'));
        if (playheads.length === 0) {
          return this.probeLegacyDomTargets();
        }

        let bestCandidate = null;
        let bestScore = -1;
        let bestCursorX = 0;

        for (let i = 0; i < playheads.length; i++) {
          const ph = playheads[i];
          const comp = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(ph) : (ph.style || {});

          // Inactive line playheads have visibility: 'hidden' or display: 'none'
          const isVisible = comp.visibility !== 'hidden' && comp.display !== 'none' && parseFloat(comp.opacity || '1') > 0;
          if (!isVisible) continue;

          // Extract transform X
          const style = ph.style || {};
          let cursorX = null;
          const transformStr = style.transform || comp.transform || '';

          const t3d = /translate3d\(\s*(-?[\d.]+)px/i.exec(transformStr);
          if (t3d) {
            cursorX = parseFloat(t3d[1]);
          } else {
            const mat = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?[\d.]+)/i.exec(transformStr);
            if (mat) {
              cursorX = parseFloat(mat[1]);
            }
          }

          if (cursorX === null || isNaN(cursorX)) continue;

          // Motion delta tracking
          const href = ph.getAttribute('href') || ph.getAttribute('xlink:href') || String(i);
          const lastX = this.lastPlayheadTransforms.get(href);
          const hasMotion = lastX !== undefined && Math.abs(cursorX - lastX) > 0.05;
          this.lastPlayheadTransforms.set(href, cursorX);

          // Candidate ranking score
          let score = 100 + (hasMotion ? 100 : 0) + (cursorX > 0 ? 20 : 0);

          if (score > bestScore) {
            bestScore = score;
            bestCandidate = ph;
            bestCursorX = cursorX;
          }
        }

        if (!bestCandidate) {
          return this.probeLegacyDomTargets(null, null, 0);
        }

        // Measure boundaries resolution in active line SVG
        const parentSvg = bestCandidate.closest ? bestCandidate.closest('svg') : null;
        const resolved = this.resolveMeasureFromSvg(parentSvg, bestCursorX, bestCandidate);
        if (resolved) {
          resolved.source = 'dom-playhead';
          return resolved;
        }

        return this.probeLegacyDomTargets(parentSvg, bestCandidate, bestCursorX);
      } catch (e) {
        return null;
      }
    }

    /**
     * Resolve measureNumber and fractional positionInMeasure from active line's SVG
     */
    resolveMeasureFromSvg(parentSvg, cursorX, activePlayhead) {
      if (!parentSvg) return null;

      // Extract measure marker text elements
      const markerTexts = [];
      const texts = parentSvg.querySelectorAll ? parentSvg.querySelectorAll('text') : [];
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        const str = t.textContent ? t.textContent.trim() : '';
        if (/^\d+$/.test(str)) {
          const num = parseInt(str, 10);
          if (num >= 1) {
            const y = parseFloat(t.getAttribute('y') || '0');
            const isMarker = y < 0 || 
                             (t.closest && t.closest('[data-tab-control="marker"]')) || 
                             (t.className?.baseVal || t.className || '').includes('number');
            if (isMarker) {
              const x = parseFloat(t.getAttribute('x') || '0');
              markerTexts.push({ num, x });
            }
          }
        }
      }

      markerTexts.sort((a, b) => a.x - b.x);

      // Extract bar line X coordinates from <path data-testid="tab-strings-path">
      const barLinesX = [];
      const stringsPath = parentSvg.querySelector ? parentSvg.querySelector('path[data-testid="tab-strings-path"]') : null;
      if (stringsPath) {
        const d = stringsPath.getAttribute('d') || '';
        const barRegex = /M(-?[\d.]+),0\.5v/g;
        let m;
        while ((m = barRegex.exec(d)) !== null) {
          barLinesX.push(parseFloat(m[1]));
        }
        barLinesX.sort((a, b) => a - b);
      }

      if (markerTexts.length > 0) {
        let resolvedMeasure = null;
        let positionInMeasure = 0.0;

        for (let i = 0; i < markerTexts.length; i++) {
          const curM = markerTexts[i];
          const nextM = markerTexts[i + 1];
          const startX = curM.x;
          let endX = nextM ? nextM.x : null;

          if (!endX) {
            if (barLinesX.length > 0 && barLinesX[barLinesX.length - 1] > startX) {
              endX = barLinesX[barLinesX.length - 1];
            } else {
              const svgRect = typeof parentSvg.getBoundingClientRect === 'function' ? parentSvg.getBoundingClientRect() : null;
              endX = svgRect?.width ? svgRect.width : (startX + 180);
            }
          }

          if (cursorX >= startX && (!nextM || cursorX < nextM.x)) {
            resolvedMeasure = curM.num;
            const span = Math.max(1, endX - startX);
            positionInMeasure = Math.max(0, Math.min(1, (cursorX - startX) / span));
            break;
          }
        }

        if (resolvedMeasure === null) {
          if (cursorX < markerTexts[0].x) {
            resolvedMeasure = markerTexts[0].num;
            positionInMeasure = 0.0;
          } else {
            resolvedMeasure = markerTexts[markerTexts.length - 1].num;
            positionInMeasure = 1.0;
          }
        }

        return {
          measureNumber: resolvedMeasure,
          eventIndex: 1,
          positionInMeasure: parseFloat(positionInMeasure.toFixed(3)),
          confidence: 'exact'
        };
      }

      // Secondary fallback: 2D bounding client rect comparison
      if (activePlayhead && typeof activePlayhead.getBoundingClientRect === 'function') {
        const phRect = activePlayhead.getBoundingClientRect();
        if (phRect && phRect.width > 0) {
          const allMarkers = document.querySelectorAll('g[data-tab-control="marker"] text, text.j6szJq_number');
          let closestM = null;
          for (let i = 0; i < allMarkers.length; i++) {
            const mText = allMarkers[i];
            const mRect = mText.getBoundingClientRect();
            if (mRect && mRect.x <= phRect.x + 10) {
              const num = parseInt(mText.textContent.trim(), 10);
              if (!isNaN(num)) closestM = num;
            }
          }
          if (closestM !== null) {
            return {
              measureNumber: closestM,
              eventIndex: 1,
              positionInMeasure: 0.0,
              confidence: 'measure-only'
            };
          }
        }
      }

      return null;
    }

    /**
     * Fallback for mock environments / legacy target rects
     */
    probeLegacyDomTargets(parentSvg, activePlayhead, cursorX) {
      try {
        const svg = parentSvg || (activePlayhead && activePlayhead.closest ? activePlayhead.closest('svg') : null);
        const beatTargets = (svg && svg.querySelectorAll ? svg.querySelectorAll('rect[data-testid="tab-beat-target"]') : null) ||
                            (typeof document !== 'undefined' ? document.querySelectorAll('rect[data-testid="tab-beat-target"]') : []);

        if (beatTargets && beatTargets.length > 0) {
          const href = (activePlayhead && (activePlayhead.getAttribute('href') || activePlayhead.getAttribute('xlink:href'))) || '';
          const lineMatch = href.match(/cursor-playhead(?:-\d+)?-(\d+)/);
          const playheadLineIndex = lineMatch ? parseInt(lineMatch[1], 10) : null;

          let cursorY = 0;
          if (activePlayhead && activePlayhead.style && activePlayhead.style.transform) {
            const matchY = /translate3d\([^,]+,\s*(-?[\d.]+)px/i.exec(activePlayhead.style.transform);
            if (matchY) cursorY = parseFloat(matchY[1]);
          }

          let closestBeat = null;
          let minDiff = Infinity;

          for (let i = 0; i < beatTargets.length; i++) {
            const bt = beatTargets[i];
            const targetLineAttr = bt.getAttribute('data-line-index');
            if (playheadLineIndex !== null && targetLineAttr !== null) {
              const targetLine = parseInt(targetLineAttr, 10);
              if (!isNaN(targetLine) && targetLine !== playheadLineIndex) {
                continue;
              }
            }

            const xAttr = parseFloat(bt.getAttribute('x') || '0');
            const yAttr = parseFloat(bt.getAttribute('y') || '0');
            const xDiff = Math.abs(xAttr - (cursorX || 0));
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
              measureNumber: mIdx + 1,
              eventIndex: bIdx + 1,
              voiceIndex: vIdx,
              beatIndex: bIdx,
              positionInMeasure: 0.0,
              currentTime: 0.0,
              confidence: minDiff < 15 ? 'exact' : 'measure-only',
              source: 'dom-playhead'
            };
          }
        }

        const measureTargets = (svg && svg.querySelectorAll ? svg.querySelectorAll('rect[data-testid="tab-measure-target"]') : null) ||
                               (typeof document !== 'undefined' ? document.querySelectorAll('rect[data-testid="tab-measure-target"]') : []);
        if (measureTargets && measureTargets.length > 0) {
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
        }
      } catch (e) {
        // Safe degrade
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
          let accumulated = 0;
          for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
            const m = part.measures[mIdx];
            const mDuration = m.duration || 960;
            if (accumulated + mDuration > cursorVal) {
              const offsetInM = cursorVal - accumulated;
              const posFraction = Math.max(0, Math.min(1, offsetInM / mDuration));

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
      if (!patch) return;
      if (patch.eventIndex !== undefined && patch.beatIndex === undefined) {
        patch.beatIndex = patch.eventIndex - 1;
      } else if (patch.beatIndex !== undefined && patch.eventIndex === undefined) {
        patch.eventIndex = patch.beatIndex + 1;
      }

      const prev = Object.assign({}, this.currentState);
      Object.assign(this.currentState, patch);

      const isChanged = prev.state !== this.currentState.state ||
                        prev.measureNumber !== this.currentState.measureNumber ||
                        prev.eventIndex !== this.currentState.eventIndex;

      if (isChanged) {
        this.emit(Object.assign({}, this.currentState));

        // Console Debug Logging: "▶ M1 event 1 [source]"
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

    /**
     * Comprehensive Runtime Diagnostics
     */
    getDiagnostics() {
      if (typeof document === 'undefined') return { error: 'no DOM' };

      const root = document.getElementById('root');
      const rootDataPlaying = root ? (root.getAttribute('data-playing') || root.dataset?.playing || null) : null;

      const playheadElements = Array.from(document.querySelectorAll('use[href*="cursor-playhead"]')).map((el, i) => {
        const comp = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : (el.style || {});
        const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : {};
        const parent = el.parentElement;
        const lineGroup = el.closest ? el.closest('g[data-line]') : null;
        return {
          index: i,
          tag: el.tagName,
          href: el.getAttribute('href') || el.getAttribute('xlink:href'),
          styleTransform: el.style ? el.style.transform : null,
          attrTransform: el.getAttribute('transform'),
          computedTransform: comp.transform || null,
          visibility: comp.visibility || null,
          display: comp.display || null,
          opacity: comp.opacity || null,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          parentTag: parent ? parent.tagName : null,
          parentLine: lineGroup ? lineGroup.getAttribute('data-line') : null,
          parentPartId: lineGroup ? lineGroup.getAttribute('data-part-id') : null
        };
      });

      const cm = document.getElementById('cursorMarker');
      const cmRect = cm && typeof cm.getBoundingClientRect === 'function' ? cm.getBoundingClientRect() : {};
      const cursorMarker = cm ? {
        exists: true,
        dataCursor: cm.getAttribute('data-cursor'),
        transform: cm.getAttribute('transform'),
        computedTransform: typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(cm).transform : null,
        rect: { x: cmRect.x, y: cmRect.y, w: cmRect.width, h: cmRect.height }
      } : { exists: false };

      const activePartEl = document.querySelector('[data-part-id]');
      const activeLineEls = document.querySelectorAll('g[data-line]');

      return {
        rootDataPlaying,
        currentState: Object.assign({}, this.currentState),
        playheadCandidatesCount: playheadElements.length,
        playheadCandidates: playheadElements,
        cursorMarker,
        activeTrack: {
          partId: activePartEl ? activePartEl.getAttribute('data-part-id') : null,
          lineElementsCount: activeLineEls.length
        }
      };
    }

    /**
     * Print formatted diagnostic dump to console
     */
    logDiagnosticDump() {
      const diag = this.getDiagnostics();
      console.group('%c🔍 [Playback Diagnostic]', 'color: #3b82f6; font-weight: bold;');
      console.log('root data-playing:', diag.rootDataPlaying);
      console.log(`cursor-playhead candidates (${diag.playheadCandidatesCount}):`);
      diag.playheadCandidates.forEach((c, idx) => {
        console.log(`  Candidate ${idx}: href=${c.href}, vis=${c.visibility}, trans=${c.styleTransform || c.computedTransform}, line=${c.parentLine}, part=${c.parentPartId}`);
      });
      console.log('cursorMarker:', diag.cursorMarker);
      console.log('active track:', diag.activeTrack);
      console.log('current state:', diag.currentState);
      console.groupEnd();
      return diag;
    }
  }

  return PlaybackObserver;
});
