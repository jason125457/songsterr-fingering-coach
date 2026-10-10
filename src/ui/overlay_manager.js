/**
 * overlay_manager.js
 * 
 * Manages the inline measure fingering overlay layer on Songsterr.
 * 
 * Product Principle:
 * Every visible Songsterr measure gets its precomputed Fingering Shape.
 * Playback only highlights the current measure/event; it never controls shape visibility.
 * 
 * Features:
 * - True 2D Viewport-driven virtualization (X and Y bounds + overscan)
 * - Strict measure-anchor query: targets only `rect[data-testid="tab-measure-target"]`
 * - Instant initial mounting: every visible measure displays its shape immediately on page load without pressing Play
 * - Complete decoupling of scroll & playback: users can freely scroll without viewport hijacking
 * - Adaptive multi-measure scaling and positioning across window resize, responsive scale, and zoom
 * - Live playback synchronization via PlaybackSyncController (highlighting only)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./measure_overlay'));
  } else {
    root.OverlayManager = factory(root.MeasureOverlay);
  }
})(typeof self !== 'undefined' ? self : this, function (MeasureOverlay) {
  'use strict';

  class OverlayManager {
    /**
     * @param {Object} options Configuration options
     */
    constructor(options = {}) {
      this.options = options;
      this.density = options.density || 'small';
      // 'all': a diagram on every measure | 'smart': only where the chord shape changes (exact
      // repeats of the previous measure are skipped) plus a reminder at each line start | 'off'
      this.displayMode = OverlayManager.DISPLAY_MODES.includes(options.displayMode) ? options.displayMode : 'all';
      this.measureCues = new Map(); // measureNumber -> { hasFretted, changed }
      this.paintedCache = new WeakMap(); // score line svg -> painted element extents (svg-relative)
      this.theme = 'light';
      this.activePlaybackMeasure = options.initialMeasure || null;
      this.activePlaybackEventIndex = null;

      this.fingeringResult = null;
      this.measuresDataMap = new Map(); // measureNumber -> measureData
      this.totalMeasures = 0;
      this.tuning = null;
      this.tuningNames = null;

      this.anchorMap = new Map(); // measureNumber -> DOM element
      this.activeOverlays = new Map(); // measureNumber -> MeasureOverlay
      this.container = null;

      // 2D Overscan margins (in pixels) to preload incoming measures during scroll
      this.overscanX = options.overscanX !== undefined ? options.overscanX : 120;
      this.overscanY = options.overscanY !== undefined ? options.overscanY : 350;

      this.rafId = null;
      this.isDestroyed = false;

      // Anchor scans walk every score SVG; while a MutationObserver is watching the DOM we
      // only rescan after a relevant mutation or resize, and scrolls reuse the cached anchors.
      this.anchorsDirty = true;

      // Event handler bindings
      this.boundOnScroll = this.handleScroll.bind(this);
      this.boundOnResize = this.handleResize.bind(this);

      this.resizeObserver = null;
      this.mutationObserver = null;

      if (options.fingeringResult) {
        this.setFingeringResult(options.fingeringResult);
      }

      this.setupObservers();
    }

    /**
     * Set or update fingering result data
     * Immediately renders shapes for all currently visible measures without requiring playback
     * @param {Object} fingeringResult 
     */
    setFingeringResult(fingeringResult) {
      if (!fingeringResult) return;
      this.fingeringResult = fingeringResult;
      this.measuresDataMap.clear();

      const measures = fingeringResult.measures || [];
      this.totalMeasures = measures.length;
      measures.forEach(m => {
        const mNum = m.measureNumber || (m.measureIndex !== undefined ? m.measureIndex + 1 : 1);
        this.measuresDataMap.set(mNum, m);
      });

      this.tuning = fingeringResult.tuning || null;
      this.tuningNames = fingeringResult.tuningNames || null;
      this.computeMeasureCues(measures);

      // Clear existing overlays, ensure root container, scan anchors, and reconcile visible measures
      this.clearOverlays();
      this.ensureContainer();
      this.scanAnchors();
      this.reconcileOverlays();
    }

    /**
     * Per-measure cue data for 'smart' mode. A measure "changes" when its chord/grip differs from
     * the previous measure that frets anything (rests and open-string-only measures neither show
     * a cue nor break a run of the same grip).
     */
    computeMeasureCues(measures) {
      this.measureCues.clear();
      let previousGrip = null;
      measures.forEach((m) => {
        const mNum = m.measureNumber || (m.measureIndex !== undefined ? m.measureIndex + 1 : 1);
        const hasFretted = Array.isArray(m.beats) && m.beats.some(b => Array.isArray(b.notes) && b.notes.some(n => !n.isRest && n.fret > 0));
        if (!hasFretted) {
          this.measureCues.set(mNum, { hasFretted: false, changed: false });
          return;
        }
        const grip = MeasureOverlay.gripSignature(m);
        this.measureCues.set(mNum, { hasFretted: true, changed: grip !== previousGrip });
        previousGrip = grip;
      });
    }

    /**
     * Switch between 'smart', 'all' and 'off'
     * @param {'smart'|'all'|'off'} mode
     */
    setDisplayMode(mode) {
      if (!OverlayManager.DISPLAY_MODES.includes(mode) || mode === this.displayMode) return;
      this.displayMode = mode;
      this.reconcileOverlays();
    }

    /**
     * Decide whether and how a measure's cue is shown.
     * @returns {null | {emphasis: 'change'|'continue'}}
     */
    cueFor(mNum, lineStarts) {
      if (this.displayMode === 'off') return null;
      // 'all' keeps the original every-visible-measure contract (Phase 3.2B acceptance tests)
      if (this.displayMode === 'all') return { emphasis: 'change' };
      const cue = this.measureCues.get(mNum);
      if (!cue || !cue.hasFretted) return null;
      if (cue.changed) return { emphasis: 'change' };
      return lineStarts.has(mNum) ? { emphasis: 'continue' } : null;
    }

    /**
     * First fretted measure of every score line, so 'smart' mode can remind the player which
     * position they are still in after a line break
     */
    getLineStartMeasures() {
      const firstByLine = new Map();
      this.anchorMap.forEach((anchor, mNum) => {
        const line = anchor && anchor.geometry ? anchor.geometry.lineIndex : undefined;
        if (line === undefined || !this.measureCues.get(mNum)?.hasFretted) return;
        if (!firstByLine.has(line) || mNum < firstByLine.get(line)) firstByLine.set(line, mNum);
      });
      return new Set(firstByLine.values());
    }

    /**
     * Pick the presentation that fits between the previous score line's drawing (its stems and
     * beams, measured per measure as rect.freeTop) and this line's staff. Songsterr's compact
     * layout leaves ~51-83px there: enough for the header-less chord diagram ('map', ~47px) but
     * not for the diagram plus header ('card', ~59px). The one-line chip is only the last resort.
     */
    variantFor(rect, mNum) {
      if (!rect || typeof rect.notationTop !== 'number' || typeof rect.top !== 'number') return 'card';
      const hasFreeTop = typeof rect.freeTop === 'number';
      if (!hasFreeTop && rect.notationTop - rect.top <= 0) return 'card'; // legacy targets: no geometry to measure
      const available = hasFreeTop ? rect.notationTop - rect.freeTop - 4 : Infinity;
      const isShift = MeasureOverlay.frettedPositions(this.measuresDataMap.get(mNum)).length > 1;
      const needed = OverlayManager.MAP_HEIGHT[this.density] + (isShift ? OverlayManager.MAP_SHIFT_EXTRA : 0);
      return available >= needed ? 'map' : 'chip';
    }

    /**
     * Extents of everything drawn in a score line SVG, relative to the SVG, cached until the line
     * is resized or re-rendered. Invisible hit-target rects and the playhead are ignored.
     */
    paintedExtents(svg) {
      const base = svg.getBoundingClientRect();
      const key = Math.round(base.width) + 'x' + Math.round(base.height) + ':' + svg.getElementsByTagName('*').length;
      const cached = this.paintedCache.get(svg);
      if (cached && cached.key === key) return cached.extents;

      const extents = [];
      svg.querySelectorAll('path, line, polyline, polygon, text, use, circle, ellipse, rect').forEach((el) => {
        const testId = el.getAttribute('data-testid') || '';
        if (testId.indexOf('target') !== -1 || (el.closest && el.closest('[data-testid*="target"]'))) return;
        if ((el.getAttribute('href') || el.getAttribute('xlink:href') || '').indexOf('cursor') !== -1) return;
        const fill = el.getAttribute('fill');
        if (el.tagName.toLowerCase() === 'rect' && (fill === 'none' || fill === 'transparent') && !el.getAttribute('stroke')) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        extents.push({ left: r.left - base.left, right: r.right - base.left, bottom: r.bottom - base.top });
      });
      this.paintedCache.set(svg, { key, extents });
      return extents;
    }

    /**
     * For every measure, the lowest pixel the score line directly above draws within that
     * measure's horizontal span (viewport y at scan time). Measures on the first line, or below
     * a gap, get no limit.
     */
    computeFreeTops(geoms) {
      const freeTops = new Map();
      const lineSvgs = [];
      geoms.forEach((g) => { if (g.svgElement && lineSvgs.indexOf(g.svgElement) === -1) lineSvgs.push(g.svgElement); });
      const rects = new Map(lineSvgs.map(svg => [svg, svg.getBoundingClientRect()]));
      lineSvgs.sort((a, b) => rects.get(a).top - rects.get(b).top);

      geoms.forEach((g) => {
        const svg = g.svgElement;
        const idx = lineSvgs.indexOf(svg);
        if (idx <= 0) return;
        const prevSvg = lineSvgs[idx - 1];
        const prevRect = rects.get(prevSvg);
        // Only a line that actually sits right above can collide (not a far-away or side-by-side one)
        if (prevRect.bottom < rects.get(svg).top - 40 || prevRect.bottom > g.stringsTop) return;
        let lowest = -Infinity;
        this.paintedExtents(prevSvg).forEach((e) => {
          if (e.right + prevRect.left > g.left && e.left + prevRect.left < g.right) {
            lowest = Math.max(lowest, e.bottom + prevRect.top);
          }
        });
        if (lowest > -Infinity) freeTops.set(g.measureNumber, lowest);
      });
      return freeTops;
    }

    /**
     * Follow Songsterr's light/dark theme by sampling the first opaque background behind the score
     */
    syncTheme(scoreElement) {
      if (!scoreElement || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
      let theme = 'light';
      for (let el = scoreElement; el; el = el.parentElement) {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(window.getComputedStyle(el).backgroundColor || '');
        if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
          const luminance = (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
          theme = luminance < 0.45 ? 'dark' : 'light';
          break;
        }
      }
      this.theme = theme;
      if (this.container && this.container.classList) {
        this.container.classList.toggle('sfc-theme-dark', theme === 'dark');
        this.container.classList.toggle('sfc-theme-light', theme === 'light');
      }
    }

    /**
     * Ensure the root overlay container exists in DOM
     */
    ensureContainer() {
      if (typeof document === 'undefined') return null;
      // isConnected: an SPA navigation can detach the score host together with our container
      if (!this.container || !this.container.parentNode || this.container.isConnected === false) {
        let existing = document.querySelector('.sfc-overlay-container');
        if (!existing) {
          existing = document.createElement('div');
          existing.className = 'sfc-overlay-container';
          existing.style.position = 'absolute';
          existing.style.top = '0';
          existing.style.left = '0';
          existing.style.width = '100%';
          existing.style.height = '100%';
          existing.style.pointerEvents = 'none';
          // Provisional; syncContainerStacking() places it just above the score once anchors are found
          existing.style.zIndex = '1';
          if (document.body) {
            document.body.appendChild(existing);
          }
        }
        this.container = existing;
      }
      return this.container;
    }

    /**
     * Stack the overlay layer directly above the score, not above everything.
     * On Songsterr the score wrapper (z 45) and the playback controls (fixed, z 73) share one
     * stacking context, section#apptab (z 56). From document.body no z-index can sit between
     * them, so the container moves into the score's outermost stacking context and takes the
     * score's z + 1 there: above the tab, below Songsterr's own controls and popups.
     * @param {Element|null} scoreElement Any element inside the rendered score
     */
    syncContainerStacking(scoreElement) {
      if (!this.container || !scoreElement || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;

      const zAncestors = []; // innermost -> outermost z-indexed ancestors of the score
      for (let el = scoreElement.parentElement; el && el !== document.body; el = el.parentElement) {
        const z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (!isNaN(z)) zAncestors.push({ el, z });
      }

      let host = document.body;
      let z = 1;
      if (zAncestors.length >= 2) {
        host = zAncestors[zAncestors.length - 1].el;
        z = zAncestors[zAncestors.length - 2].z + 1;
      } else if (zAncestors.length === 1) {
        z = zAncestors[0].z + 1;
      }

      if (host && this.container.parentNode !== host) {
        host.appendChild(this.container);
      }
      const target = String(z);
      if (this.container.style.zIndex !== target) {
        this.container.style.zIndex = target;
      }
    }

    /**
     * Offset that converts viewport rects into the container's coordinate space.
     * In document.body that is the window scroll; inside a score host it is the
     * container's own viewport origin.
     */
    getContainerOffset() {
      const inBody = !this.container || typeof document === 'undefined' || this.container.parentNode === document.body;
      if (inBody || typeof this.container.getBoundingClientRect !== 'function') {
        return {
          scrollX: typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0,
          scrollY: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0
        };
      }
      const origin = this.container.getBoundingClientRect();
      return { scrollX: -origin.left, scrollY: -origin.top };
    }

    /**
     * Number of currently mounted overlays in 2D viewport
     */
    get mountedCount() {
      return this.activeOverlays.size;
    }

    /**
     * Active measure index (0-indexed) or null
     */
    get activeMeasureIndex() {
      return this.activePlaybackMeasure !== null ? (this.activePlaybackMeasure - 1) : null;
    }

    /**
     * Strict Scan for Songsterr measure anchors
     * Targets ONLY validated `rect[data-testid="tab-measure-target"]` with measure index or number
     */
    scanAnchors() {
      this.anchorMap.clear();
      this.anchorsDirty = false;
      if (typeof document === 'undefined') return;

      // 1. Modern Songsterr DOM: Discover anchors via ScoreGeometry adapter
      const scoreGeom = (typeof ScoreGeometry !== 'undefined' ? ScoreGeometry : (typeof require === 'function' ? (() => { try { return require('../songsterr/score_geometry'); } catch (e) { return null; } })() : null));

      if (scoreGeom && typeof scoreGeom.getMeasureGeometries === 'function') {
        const geoms = scoreGeom.getMeasureGeometries(document);
        if (geoms && geoms.length > 0) {
          // Geometry is captured in viewport pixels at scan time. Remember each SVG's rect at
          // that moment so a cached anchor can follow its SVG when the page scrolls.
          const scanSvgRects = new Map();
          const svgRectOf = (svg) => {
            if (!svg || typeof svg.getBoundingClientRect !== 'function') return null;
            if (!scanSvgRects.has(svg)) scanSvgRects.set(svg, svg.getBoundingClientRect());
            return scanSvgRects.get(svg);
          };

          this.syncContainerStacking(geoms[0].svgElement || geoms[0].markerElement || null);
          this.syncTheme(geoms[0].svgElement || null);
          const freeTops = this.computeFreeTops(geoms);

          geoms.forEach((g) => {
            const svg = g.svgElement || null;
            const baseRect = svgRectOf(svg);
            // Songsterr prints the measure number at the measure's top-left, at the same height as
            // our cue; remember where it ends so the cue can start after it instead of covering it
            const markerRect = g.markerElement && typeof g.markerElement.getBoundingClientRect === 'function'
              ? g.markerElement.getBoundingClientRect()
              : null;
            const markerRight = markerRect && markerRect.width > 0 ? markerRect.right : null;
            this.anchorMap.set(g.measureNumber, {
              isGeometry: true,
              geometry: g,
              measureNumber: g.measureNumber,
              getBoundingClientRect: () => {
                let dx = 0;
                let dy = 0;
                if (baseRect && svg.isConnected !== false) {
                  const cur = svg.getBoundingClientRect();
                  dx = cur.left - baseRect.left;
                  dy = cur.top - baseRect.top;
                  // A rescaled SVG cannot be corrected by translation alone
                  if (Math.abs(cur.width - baseRect.width) > 0.5 || Math.abs(cur.height - baseRect.height) > 0.5) {
                    this.anchorsDirty = true;
                    if (typeof requestAnimationFrame === 'function') this.scheduleReconciliation();
                  }
                }
                return {
                  left: g.left + dx,
                  right: g.right + dx,
                  top: g.top + dy,
                  bottom: g.bottom + dy,
                  width: g.width,
                  height: g.height,
                  stringsTop: g.stringsTop + dy,
                  stringsBottom: g.stringsBottom + dy,
                  notationTop: g.notationTop + dy,
                  notationBottom: g.notationBottom + dy,
                  contentLeft: markerRight !== null ? markerRight + dx : undefined,
                  freeTop: freeTops.has(g.measureNumber) ? freeTops.get(g.measureNumber) + dy : undefined,
                  lineIndex: g.lineIndex
                };
              }
            });
          });
          return;
        }
      }

      // 2. Fallback for mock environments / legacy target rects
      const targets = document.querySelectorAll(
        'rect[data-testid="tab-measure-target"][data-measure-index], rect[data-testid="tab-measure-target"][data-measure-number]'
      );

      if (targets.length > 0) this.syncContainerStacking(targets[0]);

      targets.forEach((el) => {
        let mNum = null;
        if (el.hasAttribute('data-measure-number')) {
          mNum = parseInt(el.getAttribute('data-measure-number'), 10);
        } else if (el.hasAttribute('data-measure-index')) {
          mNum = parseInt(el.getAttribute('data-measure-index'), 10) + 1; // 0-indexed to 1-indexed
        }
        if (mNum && !isNaN(mNum) && mNum > 0) {
          this.anchorMap.set(mNum, el);
        }
      });
    }

    /**
     * True 2D Viewport Visibility Check
     * Evaluates both horizontal (X) and vertical (Y) bounding box intersection with overscan
     * @param {DOMRect|Object} rect Anchor client bounding rect
     * @param {number} viewportW 
     * @param {number} viewportH 
     * @returns {boolean}
     */
    isRectIn2DViewport(rect, viewportW, viewportH) {
      if (!rect) return false;

      const inY = (rect.bottom >= -this.overscanY) && (rect.top <= viewportH + this.overscanY);
      const inX = (rect.right >= -this.overscanX) && (rect.left <= viewportW + this.overscanX);

      return inY && inX;
    }

    /**
     * Get all measure numbers currently visible in the 2D viewport
     * @returns {Set<number>}
     */
    getVisibleMeasureNumbers() {
      const visible = new Set();
      if (typeof window === 'undefined') return visible;

      const viewportW = window.innerWidth || 1200;
      const viewportH = window.innerHeight || 800;

      this.anchorMap.forEach((anchorEl, mNum) => {
        if (typeof anchorEl.getBoundingClientRect === 'function') {
          const rect = anchorEl.getBoundingClientRect();
          if (this.isRectIn2DViewport(rect, viewportW, viewportH)) {
            visible.add(mNum);
          }
        }
      });

      return visible;
    }

    /**
     * Viewport-driven reconciliation engine
     * Instantiates overlays for all newly visible measures and unmounts out-of-viewport measures
     */
    reconcileOverlays() {
      if (this.isDestroyed || this.totalMeasures <= 0) return;

      // Without a MutationObserver we cannot tell when the score DOM changed, so always rescan
      if (this.anchorsDirty || !this.mutationObserver) {
        this.scanAnchors();
      }
      const visibleMeasures = this.getVisibleMeasureNumbers();
      const container = this.ensureContainer();

      const scrollOffset = this.getContainerOffset();
      const lineStarts = this.displayMode === 'smart' ? this.getLineStartMeasures() : new Set();
      const cues = new Map();
      visibleMeasures.forEach((mNum) => {
        const cue = this.cueFor(mNum, lineStarts);
        if (cue) cues.set(mNum, cue);
      });

      // 1. Unmount overlays that left the 2D viewport + overscan, or whose cue is no longer shown
      for (const [mNum, overlay] of this.activeOverlays.entries()) {
        if (!cues.has(mNum)) {
          overlay.destroy();
          this.activeOverlays.delete(mNum);
        }
      }

      const anchorRects = new Map();
      const rectOf = (mNum) => {
        if (!anchorRects.has(mNum)) {
          const anchor = this.anchorMap.get(mNum);
          anchorRects.set(mNum, anchor && typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : null);
        }
        return anchorRects.get(mNum);
      };

      // 2. Instantiate and mount overlays entering the 2D viewport
      cues.forEach((cue, mNum) => {
        if (!this.activeOverlays.has(mNum)) {
          const mData = this.measuresDataMap.get(mNum);
          if (mData) {
            const anchorRect = rectOf(mNum);
            const overlay = new MeasureOverlay(mData, {
              tuning: this.tuning,
              tuningNames: this.tuningNames,
              density: this.density,
              anchorWidth: anchorRect ? anchorRect.width : undefined,
              variant: this.variantFor(anchorRect, mNum),
              emphasis: cue.emphasis,
              theme: this.theme
            });
            overlay.mount(container);
            this.activeOverlays.set(mNum, overlay);
          }
        }
      });

      // 3. Update presentation, positions and playback highlight for all mounted overlays
      this.activeOverlays.forEach((overlay, mNum) => {
        const rect = rectOf(mNum);
        if (rect) {
          overlay.setPresentation({ variant: this.variantFor(rect, mNum), emphasis: cues.get(mNum).emphasis, theme: this.theme });
          overlay.updatePosition(rect, scrollOffset);
        }

        // Playback highlight: active if mNum matches activePlaybackMeasure
        const isPlaybackActive = (mNum === this.activePlaybackMeasure);
        overlay.setHighlighted(isPlaybackActive);
        if (isPlaybackActive && this.activePlaybackEventIndex !== null) {
          overlay.setActiveEvent(this.activePlaybackEventIndex);
        }
      });
    }

    /**
     * Schedule reconciliation using requestAnimationFrame (debounced for 60 FPS)
     */
    scheduleReconciliation() {
      if (this.rafId || this.isDestroyed) return;
      if (typeof requestAnimationFrame === 'function') {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.reconcileOverlays();
        });
      } else {
        this.reconcileOverlays();
      }
    }

    /**
     * Live Playback Synchronization entry point
     * Called by PlaybackSyncController
     * NOTE: Playback only highlights the active measure/event; it NEVER dictates overlay lifecycle or forces scroll.
     * @param {Object} canonicalResult { measureNumber, eventIndex, ... }
     * @param {Object} playbackEvent Raw observer event
     */
    syncPlayback(canonicalResult, playbackEvent = null) {
      if (!canonicalResult || !canonicalResult.measureNumber) return;

      const prevMeasure = this.activePlaybackMeasure;
      const targetMeasure = canonicalResult.measureNumber;
      const targetEventIndex = canonicalResult.eventIndex !== undefined ? canonicalResult.eventIndex : null;

      this.activePlaybackMeasure = targetMeasure;
      this.activePlaybackEventIndex = targetEventIndex;

      // If previous active overlay is currently in viewport, remove its highlight
      if (prevMeasure && prevMeasure !== targetMeasure && this.activeOverlays.has(prevMeasure)) {
        const prevOverlay = this.activeOverlays.get(prevMeasure);
        prevOverlay.setHighlighted(false);
      }

      // If target measure overlay is currently in viewport, highlight it and set active event
      if (this.activeOverlays.has(targetMeasure)) {
        const targetOverlay = this.activeOverlays.get(targetMeasure);
        targetOverlay.setHighlighted(true);
        targetOverlay.setActiveEvent(targetEventIndex);
      }
      // If target measure is currently outside viewport (e.g. user scrolled away),
      // we do NOT pull the viewport back. It will automatically be highlighted if user scrolls back to it.
    }

    /**
     * Reposition all currently active overlays
     */
    repositionAll() {
      this.reconcileOverlays();
    }

    /**
     * Switch density mode for all mounted and future overlays
     * @param {'small'|'medium'|'large'} density 
     */
    setDensity(density) {
      if (!density || this.density === density) return;
      this.density = density;
      this.options.density = density;
      this.activeOverlays.forEach(overlay => {
        if (overlay && typeof overlay.setDensity === 'function') {
          overlay.setDensity(density);
        }
      });
      this.repositionAll();
    }

    /**
     * Setup DOM observers and scroll/resize listeners
     */
    setupObservers() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;

      // Capture phase also catches scrolls of inner score containers, which do not bubble
      window.addEventListener('scroll', this.boundOnScroll, { passive: true, capture: true });
      window.addEventListener('resize', this.boundOnResize, { passive: true });

      if (typeof ResizeObserver !== 'undefined' && document.body) {
        this.resizeObserver = new ResizeObserver(() => {
          this.anchorsDirty = true;
          this.scheduleReconciliation();
        });
        this.resizeObserver.observe(document.body);
      }

      if (typeof MutationObserver !== 'undefined' && document.body) {
        this.mutationObserver = new MutationObserver((records) => {
          this.handleMutations(records);
        });
        this.mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['data-measure-index', 'data-measure-number', 'style', 'x', 'y', 'd', 'transform', 'viewBox', 'width', 'height']
        });
      }
    }

    /**
     * Whether a node belongs to this extension's own UI. Our overlays re-render inside
     * document.body, so reacting to them would make every reconcile schedule the next one.
     */
    isOwnUiNode(node) {
      const el = node && node.nodeType === 1 ? node : node?.parentElement;
      return !!(el && el.closest && el.closest('.sfc-overlay-container, #sfc-coach-panel, #sfc-coach-fab'));
    }

    /**
     * Songsterr's playhead and cursor marker move every animation frame during playback
     * without changing score layout
     */
    isPlaybackCursorNode(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.id === 'cursorMarker') return true;
      const href = node.tagName && node.tagName.toLowerCase() === 'use'
        ? (node.getAttribute('href') || node.getAttribute('xlink:href') || '')
        : '';
      return href.indexOf('cursor-playhead') !== -1;
    }

    static containsSvg(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.closest && node.closest('svg')) return true;
      return !!(node.querySelector && node.querySelector('svg'));
    }

    /**
     * Classify DOM mutations: score SVG content changes invalidate cached anchors,
     * other layout-affecting changes only need a reposition, and our own UI is ignored.
     */
    handleMutations(records) {
      let needsReconcile = false;
      for (const r of records) {
        if (this.isOwnUiNode(r.target) || this.isPlaybackCursorNode(r.target)) continue;
        needsReconcile = true;

        if (r.type === 'childList') {
          const isOwn = (n) => n.nodeType === 1 && n.classList && n.classList.contains('sfc-overlay-container');
          if (OverlayManager.containsSvg(r.target) ||
              Array.from(r.addedNodes).some(n => !isOwn(n) && OverlayManager.containsSvg(n)) ||
              Array.from(r.removedNodes).some(n => !isOwn(n) && n.nodeType === 1 && (n.tagName.toLowerCase() === 'svg' || (n.querySelector && n.querySelector('svg'))))) {
            this.anchorsDirty = true;
          }
        } else {
          const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          if (el && el.closest && el.closest('svg')) {
            this.anchorsDirty = true;
          }
        }
      }
      if (needsReconcile) this.scheduleReconciliation();
    }

    handleScroll() {
      this.scheduleReconciliation();
    }

    handleResize() {
      this.anchorsDirty = true;
      this.scheduleReconciliation();
    }

    /**
     * Clear all mounted overlays
     */
    clearOverlays() {
      this.activeOverlays.forEach(overlay => overlay.destroy());
      this.activeOverlays.clear();
    }

    /**
     * Complete clear of overlays and active song data
     */
    clearAll() {
      this.clearOverlays();
      this.fingeringResult = null;
      this.measuresDataMap.clear();
      this.anchorMap.clear();
      this.anchorsDirty = true;
      this.activePlaybackMeasure = null;
    }

    /**
     * Get currently active overlays in DOM
     */
    getActiveOverlays() {
      return this.activeOverlays;
    }

    /**
     * Cleanup and destroy manager
     */
    destroy() {
      this.isDestroyed = true;
      if (this.rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', this.boundOnScroll, { capture: true });
        window.removeEventListener('resize', this.boundOnResize);
      }

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }

      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }

      this.clearOverlays();

      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
      this.anchorMap.clear();
      this.measuresDataMap.clear();
    }
  }

  OverlayManager.DISPLAY_MODES = ['smart', 'all', 'off'];
  // Rendered height of the header-less chord diagram per density (diagram + padding + border).
  // Shift measures shrink their two diagrams (MeasureOverlay.MAP_MULTI_SCALE) to the same height;
  // MAP_SHIFT_EXTRA stays as a knob in case a density needs more room for the P-badges.
  OverlayManager.MAP_HEIGHT = { small: 47, medium: 55, large: 63 };
  OverlayManager.MAP_SHIFT_EXTRA = 0;

  return OverlayManager;
});
