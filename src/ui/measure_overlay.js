/**
 * measure_overlay.js
 * 
 * Individual inline fingering overlay component anchored above a Songsterr measure.
 * 
 * Features:
 * - Ultra-compact hand shape visualization using ShapeDiagram (compact mode)
 * - Generalized N-segment support (1, 2, or 3+ position segments)
 * - Static upfront multi-segment preview: guitarists see full measure shifts before playing
 * - Adaptive sizing against actual measure width (zero overlap with neighboring measures)
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
      this.lastAnchorWidth = null;

      this.overlayWidth = options.width || (this.segments.length > 1 ? 156 : 88);
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
     * Render diagrams for arbitrary N segments
     * @param {number|null} availableWidth 
     * @returns {string} HTML string
     */
    renderDiagramsHTML(availableWidth) {
      const numSegments = this.segments.length;
      if (numSegments <= 1) {
        const seg = this.segments[0];
        const svg = ShapeDiagram.renderSVG(seg, this.activeEventIndex, {
          compact: true,
          width: this.svgWidth,
          height: this.svgHeight,
          tuning: this.options.tuning,
          tuningNames: this.options.tuningNames
        });
        return `<div class="sfc-overlay-diagram">${svg}</div>`;
      }

      // Generalized Multi-Segment (N >= 2)
      const minPerSeg = 66;
      const totalSideBySideW = numSegments * minPerSeg + (numSegments - 1) * 14;
      const canFitSideBySide = !availableWidth || availableWidth >= totalSideBySideW;

      if (canFitSideBySide) {
        let html = `<div class="sfc-overlay-multi-segments">`;
        this.segments.forEach((seg, sIdx) => {
          if (sIdx > 0) {
            html += `<div class="sfc-segment-arrow">➔</div>`;
          }
          const isSegActive = this.currentSegmentIndex === sIdx && this.activeEventIndex !== null;
          const segActiveEv = isSegActive ? this.activeEventIndex : null;
          const svg = ShapeDiagram.renderSVG(seg, segActiveEv, {
            compact: true,
            width: 68,
            height: 56,
            tuning: this.options.tuning,
            tuningNames: this.options.tuningNames
          });
          html += `<div class="sfc-overlay-segment${isSegActive ? ' sfc-segment-active' : ''}" data-segment-index="${sIdx}">`;
          html += `<span class="sfc-segment-badge">P${seg.position}</span>`;
          html += svg;
          html += `</div>`;
        });
        html += `</div>`;
        return html;
      } else {
        // Constrained width fallback: render active segment with compact dimensions
        const activeSeg = this.segments[this.currentSegmentIndex] || this.segments[0];
        const svg = ShapeDiagram.renderSVG(activeSeg, this.activeEventIndex, {
          compact: true,
          width: Math.min(this.svgWidth, Math.max(60, availableWidth - 12)),
          height: this.svgHeight,
          tuning: this.options.tuning,
          tuningNames: this.options.tuningNames
        });
        return `<div class="sfc-overlay-diagram">${svg}</div>`;
      }
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

      // Diagram container with generalized N-segment rendering
      const bodyHTML = this.renderDiagramsHTML(this.lastAnchorWidth);

      this.domElement.innerHTML = `${headerHTML}${bodyHTML}`;

      if (this.isHighlighted) {
        this.domElement.classList.add('sfc-overlay-active');
      } else {
        this.domElement.classList.remove('sfc-overlay-active');
      }
    }

    /**
     * Update position relative to Songsterr measure anchor with adaptive sizing
     * @param {DOMRect|Object} anchorRect 
     * @param {Object} scrollOffset { scrollX, scrollY }
     */
    updatePosition(anchorRect, scrollOffset = { scrollX: 0, scrollY: 0 }) {
      if (!this.domElement || !anchorRect) return;
      this.anchorRect = anchorRect;

      const anchorW = anchorRect.width || 200;
      const scrollX = typeof scrollOffset.scrollX === 'number' ? scrollOffset.scrollX : (typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0);
      const scrollY = typeof scrollOffset.scrollY === 'number' ? scrollOffset.scrollY : (typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0);

      // Re-render if anchor width changed significantly to adapt multi-segment layout
      if (this.lastAnchorWidth !== anchorW) {
        this.lastAnchorWidth = anchorW;
        this.render();
      }

      const overlayW = this.domElement.offsetWidth || this.overlayWidth;
      const overlayH = this.domElement.offsetHeight || this.overlayHeight;

      // Position above the measure target
      let top = anchorRect.top + scrollY - overlayH - 6;
      let left = anchorRect.left + scrollX + 4; // slight left padding inside the measure

      // Adaptive boundary check: NEVER overlap neighboring measure to the right
      if (left + overlayW > anchorRect.right + scrollX) {
        left = Math.max(anchorRect.left + scrollX, anchorRect.right + scrollX - overlayW - 4);
      }

      // If top space is constrained (e.g. very top of page), adjust below staff
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

        if (targetSegIndex !== -1) {
          this.currentSegmentIndex = targetSegIndex;
        }
      }

      this.render();
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
