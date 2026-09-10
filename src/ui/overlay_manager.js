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

      // Clear existing overlays, ensure root container, scan anchors, and reconcile visible measures
      this.clearOverlays();
      this.ensureContainer();
      this.scanAnchors();
      this.reconcileOverlays();
    }

    /**
     * Ensure the root overlay container exists in DOM
     */
    ensureContainer() {
      if (typeof document === 'undefined') return null;
      if (!this.container || !this.container.parentNode) {
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
          existing.style.zIndex = '99998';
          if (document.body) {
            document.body.appendChild(existing);
          }
        }
        this.container = existing;
      }
      return this.container;
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
      if (typeof document === 'undefined') return;

      const targets = document.querySelectorAll(
        'rect[data-testid="tab-measure-target"][data-measure-index], rect[data-testid="tab-measure-target"][data-measure-number]'
      );

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

      this.scanAnchors();
      const visibleMeasures = this.getVisibleMeasureNumbers();
      const container = this.ensureContainer();

      const scrollOffset = {
        scrollX: typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0,
        scrollY: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0
      };

      // 1. Unmount overlays that moved outside 2D viewport + overscan
      for (const [mNum, overlay] of this.activeOverlays.entries()) {
        if (!visibleMeasures.has(mNum)) {
          overlay.destroy();
          this.activeOverlays.delete(mNum);
        }
      }

      // 2. Instantiate and mount overlays entering the 2D viewport
      visibleMeasures.forEach((mNum) => {
        if (!this.activeOverlays.has(mNum)) {
          const mData = this.measuresDataMap.get(mNum);
          if (mData) {
            const overlay = new MeasureOverlay(mData, {
              tuning: this.tuning,
              tuningNames: this.tuningNames,
              density: this.density
            });
            overlay.mount(container);
            this.activeOverlays.set(mNum, overlay);
          }
        }
      });

      // 3. Update positions and playback highlight for all mounted overlays
      this.activeOverlays.forEach((overlay, mNum) => {
        const anchor = this.anchorMap.get(mNum);
        if (anchor && typeof anchor.getBoundingClientRect === 'function') {
          const rect = anchor.getBoundingClientRect();
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

      window.addEventListener('scroll', this.boundOnScroll, { passive: true });
      window.addEventListener('resize', this.boundOnResize, { passive: true });

      if (typeof ResizeObserver !== 'undefined' && document.body) {
        this.resizeObserver = new ResizeObserver(() => {
          this.scheduleReconciliation();
        });
        this.resizeObserver.observe(document.body);
      }

      if (typeof MutationObserver !== 'undefined' && document.body) {
        this.mutationObserver = new MutationObserver(() => {
          this.scheduleReconciliation();
        });
        this.mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-measure-index', 'data-measure-number', 'style']
        });
      }
    }

    handleScroll() {
      this.scheduleReconciliation();
    }

    handleResize() {
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
        window.removeEventListener('scroll', this.boundOnScroll);
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

  return OverlayManager;
});
