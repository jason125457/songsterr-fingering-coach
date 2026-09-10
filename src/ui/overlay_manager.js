/**
 * overlay_manager.js
 * 
 * Manages the inline measure fingering overlay layer on Songsterr.
 * 
 * Features:
 * - Discovers Songsterr measure anchors via `rect[data-testid="tab-measure-target"][data-measure-index]`
 * - Viewport virtualization sliding window: renders only 4-6 overlays in DOM around active measure
 * - Zero DOM bloat: supports 150+ measure tracks without memory overhead or FPS drops
 * - Position stability across window resize, responsive scale, and vertical scroll (RAF debounced)
 * - Live playback synchronization via PlaybackSyncController
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
      this.maxOverlays = options.maxOverlays || 5; // Constrained to 4-6 overlays
      this.activeMeasureNumber = options.initialMeasure || 1;
      this.activeEventIndex = null;

      this.fingeringResult = null;
      this.measuresDataMap = new Map(); // measureNumber -> measureData
      this.totalMeasures = 0;
      this.tuning = null;
      this.tuningNames = null;

      this.anchorMap = new Map(); // measureNumber -> DOM element
      this.activeOverlays = new Map(); // measureNumber -> MeasureOverlay
      this.container = null;

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

      // Clear existing overlays and rebuild window
      this.clearOverlays();
      this.ensureContainer();
      this.scanAnchors();
      this.updateVirtualWindow(this.activeMeasureNumber);
    }

    /**
     * Ensure the root container exists in DOM
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
     * Scan DOM for Songsterr measure anchors
     * Targets `rect[data-testid="tab-measure-target"][data-measure-index]`
     */
    scanAnchors() {
      this.anchorMap.clear();
      if (typeof document === 'undefined') return;

      const targets = document.querySelectorAll('rect[data-testid="tab-measure-target"], [data-measure-index], [data-measure-number]');
      targets.forEach((el) => {
        let mNum = null;
        if (el.hasAttribute('data-measure-number')) {
          mNum = parseInt(el.getAttribute('data-measure-number'), 10);
        } else if (el.hasAttribute('data-measure-index')) {
          mNum = parseInt(el.getAttribute('data-measure-index'), 10) + 1; // 0-indexed to 1-indexed
        }
        if (mNum && !isNaN(mNum)) {
          this.anchorMap.set(mNum, el);
        }
      });
    }

    /**
     * Calculate virtual window of 4-6 measures centered around active measure
     * @param {number} activeMeasureNumber 
     * @param {number} totalMeasures 
     * @returns {number[]} Array of measure numbers
     */
    calculateWindow(activeMeasureNumber, totalMeasures) {
      if (!totalMeasures || totalMeasures <= 0) return [activeMeasureNumber];

      const size = Math.min(this.maxOverlays, totalMeasures);
      // Window strategy: [active - 1, active, active + 1, active + 2, ...]
      let start = Math.max(1, activeMeasureNumber - 1);
      let end = Math.min(totalMeasures, start + size - 1);

      // If reaching the end of song, shift start backwards to keep window filled
      if (end - start + 1 < size) {
        start = Math.max(1, end - size + 1);
      }

      const windowMeasures = [];
      for (let m = start; m <= end; m++) {
        windowMeasures.push(m);
      }
      return windowMeasures;
    }

    /**
     * Update the virtualized overlays in DOM based on active measure
     * @param {number} activeMeasureNumber 
     */
    updateVirtualWindow(activeMeasureNumber) {
      this.activeMeasureNumber = activeMeasureNumber;
      if (this.totalMeasures <= 0) return;

      const windowMeasures = this.calculateWindow(activeMeasureNumber, this.totalMeasures);
      const targetSet = new Set(windowMeasures);
      const container = this.ensureContainer();

      // 1. Unmount overlays that left the window
      for (const [mNum, overlay] of this.activeOverlays.entries()) {
        if (!targetSet.has(mNum)) {
          overlay.destroy();
          this.activeOverlays.delete(mNum);
        }
      }

      // 2. Instantiate and mount overlays entering the window
      windowMeasures.forEach((mNum) => {
        if (!this.activeOverlays.has(mNum)) {
          const mData = this.measuresDataMap.get(mNum);
          if (mData) {
            const overlay = new MeasureOverlay(mData, {
              tuning: this.tuning,
              tuningNames: this.tuningNames
            });
            overlay.mount(container);
            this.activeOverlays.set(mNum, overlay);
          }
        }
      });

      // 3. Update highlight states
      this.activeOverlays.forEach((overlay, mNum) => {
        overlay.setHighlighted(mNum === activeMeasureNumber);
      });

      // 4. Reposition all active overlays
      this.repositionAll();
    }

    /**
     * Reposition all active overlays to align with Songsterr anchors
     */
    repositionAll() {
      if (this.isDestroyed) return;
      this.scanAnchors();

      const scrollOffset = {
        scrollX: typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0,
        scrollY: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0
      };

      this.activeOverlays.forEach((overlay, mNum) => {
        const anchor = this.anchorMap.get(mNum);
        if (anchor && typeof anchor.getBoundingClientRect === 'function') {
          const rect = anchor.getBoundingClientRect();
          overlay.updatePosition(rect, scrollOffset);
        }
      });
    }

    /**
     * Throttle repositioning using requestAnimationFrame
     */
    scheduleReposition() {
      if (this.rafId || this.isDestroyed) return;
      if (typeof requestAnimationFrame === 'function') {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.repositionAll();
        });
      } else {
        this.repositionAll();
      }
    }

    /**
     * Live Playback Synchronization entry point
     * Called by PlaybackSyncController
     * @param {Object} canonicalResult { measureNumber, eventIndex, ... }
     * @param {Object} playbackEvent Raw observer event
     */
    syncPlayback(canonicalResult, playbackEvent = null) {
      if (!canonicalResult || !canonicalResult.measureNumber) return;

      const targetMeasure = canonicalResult.measureNumber;
      const targetEventIndex = canonicalResult.eventIndex !== undefined ? canonicalResult.eventIndex : null;

      // If active measure changed or outside current activeOverlays
      if (targetMeasure !== this.activeMeasureNumber || !this.activeOverlays.has(targetMeasure)) {
        this.updateVirtualWindow(targetMeasure);
      }

      this.activeEventIndex = targetEventIndex;

      // Update active event on the current active overlay
      const currentOverlay = this.activeOverlays.get(targetMeasure);
      if (currentOverlay) {
        currentOverlay.setActiveEvent(targetEventIndex);
      }
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
          this.scheduleReposition();
        });
        this.resizeObserver.observe(document.body);
      }

      if (typeof MutationObserver !== 'undefined' && document.body) {
        this.mutationObserver = new MutationObserver(() => {
          this.scheduleReposition();
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
      this.scheduleReposition();
    }

    handleResize() {
      this.scheduleReposition();
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
