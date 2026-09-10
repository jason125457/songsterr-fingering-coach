/**
 * measure_overlay.js
 * 
 * Individual inline fingering overlay component anchored above a Songsterr measure.
 * 
 * Features:
 * - Ultra-compact hand shape visualization using ShapeDiagram (compact mode)
 * - Multi-position segment switching (e.g. M3: Pos 8 -> Pos 10)
 * - Micro shift badge indicator (e.g. "Pos 8 ➔ Pos 10")
 * - Active playback highlight and active note dot pulse
 * - Zero occlusion design: sits above staff lines with pointer-events: none
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./shape_diagram'));
  } else {
    root.MeasureOverlay = factory(root.ShapeDiagram);
  }
})(typeof self !== 'undefined' ? self : this, function (ShapeDiagram) {
  'use strict';

  class MeasureOverlay {
    /**
     * @param {Object} measureData Normalized measure with fingering analysis
     * @param {Object} options Configuration options (tuning, dimensions, etc.)
     */
    constructor(measureData, options = {}) {
      if (!measureData) {
        throw new Error('[MeasureOverlay] measureData is required');
      }

      this.measureData = measureData;
      this.options = options;
      this.measureNumber = measureData.measureNumber || 1;
      this.segments = ShapeDiagram.splitMeasureIntoSegments(measureData);
      this.currentSegmentIndex = 0;
      this.activeEventIndex = null;
      this.isHighlighted = false;
      this.domElement = null;
      this.anchorRect = null;

      this.overlayWidth = options.width || 88;
      this.overlayHeight = options.height || 88;
      this.svgWidth = options.svgWidth || 80;
      this.svgHeight = options.svgHeight || 66;

      this.createElement();
    }

    /**
     * Create the DOM structure for the overlay
     */
    createElement() {
      const el = document.createElement('div');
      el.className = 'sfc-measure-overlay';
      el.setAttribute('data-measure-number', String(this.measureNumber));
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';

      this.domElement = el;
      this.render();
      return el;
    }

    /**
     * Render or refresh inner HTML of the overlay
     */
    render() {
      if (!this.domElement) return;

      const currentSegment = this.segments[this.currentSegmentIndex] || this.segments[0];
      const hasShift = this.segments.length > 1;

      // Header with measure number, active position, and shift transition chip if any
      let headerHTML = `<div class="sfc-overlay-header">`;
      headerHTML += `<span class="sfc-overlay-pos-badge">M${this.measureNumber} · P${currentSegment.position}</span>`;
      
      if (hasShift) {
        const segPositions = this.segments.map(s => `P${s.position}`).join('➔');
        headerHTML += `<span class="sfc-overlay-shift-chip" title="Position Shift">${segPositions}</span>`;
      }
      headerHTML += `</div>`;

      // Diagram container with compact SVG
      const svgHTML = ShapeDiagram.renderSVG(currentSegment, this.activeEventIndex, {
        compact: true,
        width: this.svgWidth,
        height: this.svgHeight,
        tuning: this.options.tuning,
        tuningNames: this.options.tuningNames
      });

      const bodyHTML = `<div class="sfc-overlay-diagram">${svgHTML}</div>`;

      this.domElement.innerHTML = `${headerHTML}${bodyHTML}`;

      if (this.isHighlighted) {
        this.domElement.classList.add('sfc-overlay-active');
      } else {
        this.domElement.classList.remove('sfc-overlay-active');
      }
    }

    /**
     * Update only the SVG part without rebuilding header
     */
    updateSVG() {
      if (!this.domElement) return;
      const diagramContainer = this.domElement.querySelector('.sfc-overlay-diagram');
      if (!diagramContainer) {
        this.render();
        return;
      }

      const currentSegment = this.segments[this.currentSegmentIndex] || this.segments[0];
      diagramContainer.innerHTML = ShapeDiagram.renderSVG(currentSegment, this.activeEventIndex, {
        compact: true,
        width: this.svgWidth,
        height: this.svgHeight,
        tuning: this.options.tuning,
        tuningNames: this.options.tuningNames
      });
    }

    /**
     * Update position relative to Songsterr measure anchor
     * @param {DOMRect|Object} anchorRect 
     * @param {Object} scrollOffset { scrollX, scrollY }
     */
    updatePosition(anchorRect, scrollOffset = { scrollX: 0, scrollY: 0 }) {
      if (!this.domElement || !anchorRect) return;
      this.anchorRect = anchorRect;

      const scrollX = typeof scrollOffset.scrollX === 'number' ? scrollOffset.scrollX : (typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0);
      const scrollY = typeof scrollOffset.scrollY === 'number' ? scrollOffset.scrollY : (typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0);

      const overlayW = this.domElement.offsetWidth || this.overlayWidth;
      const overlayH = this.domElement.offsetHeight || this.overlayHeight;

      // Position above the measure target
      let top = anchorRect.top + scrollY - overlayH - 6;
      let left = anchorRect.left + scrollX + 4; // slight left padding inside the measure

      // If top space is constrained (e.g. very top of page), adjust
      if (top < 0) {
        top = Math.max(0, anchorRect.bottom + scrollY + 4);
      }

      this.domElement.style.top = `${Math.round(top)}px`;
      this.domElement.style.left = `${Math.round(left)}px`;
    }

    /**
     * Set active playback event index
     * Automatically handles segment switching if position shift occurs in this measure
     * @param {number|null} eventIndex 
     */
    setActiveEvent(eventIndex) {
      this.activeEventIndex = eventIndex;

      if (eventIndex !== null && this.segments.length > 1) {
        // Find matching segment for this event
        let targetSegIndex = -1;
        for (let i = 0; i < this.segments.length; i++) {
          const seg = this.segments[i];
          const hasEvent = seg.beats.some(b => (b.eventIndex || b.beatNumber) === eventIndex);
          if (hasEvent || (eventIndex >= seg.startEvent && eventIndex <= seg.endEvent)) {
            targetSegIndex = i;
            break;
          }
        }

        if (targetSegIndex !== -1 && targetSegIndex !== this.currentSegmentIndex) {
          this.currentSegmentIndex = targetSegIndex;
          this.render();
          return;
        }
      }

      this.updateSVG();
    }

    /**
     * Set active segment manually
     * @param {number} segmentIndex 
     */
    setActiveSegment(segmentIndex) {
      if (segmentIndex >= 0 && segmentIndex < this.segments.length) {
        this.currentSegmentIndex = segmentIndex;
        this.render();
      }
    }

    /**
     * Highlight active playing measure
     * @param {boolean} isHighlighted 
     */
    setHighlighted(isHighlighted) {
      this.isHighlighted = !!isHighlighted;
      if (this.domElement) {
        if (this.isHighlighted) {
          this.domElement.classList.add('sfc-overlay-active');
        } else {
          this.domElement.classList.remove('sfc-overlay-active');
        }
      }
    }

    /**
     * Mount element to parent container
     * @param {HTMLElement} parentContainer 
     */
    mount(parentContainer) {
      if (parentContainer && this.domElement && this.domElement.parentNode !== parentContainer) {
        parentContainer.appendChild(this.domElement);
      }
    }

    /**
     * Unmount element from DOM
     */
    unmount() {
      if (this.domElement && this.domElement.parentNode) {
        this.domElement.parentNode.removeChild(this.domElement);
      }
    }

    /**
     * Destroy overlay and cleanup
     */
    destroy() {
      this.unmount();
      this.domElement = null;
      this.measureData = null;
      this.segments = null;
      this.options = null;
    }
  }

  return MeasureOverlay;
});
