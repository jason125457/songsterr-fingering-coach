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
 * - Presentations, chosen by OverlayManager from the free space above the staff:
 *   'map'  chord/hand diagram without the header row (the diagram's own "8fr" label and the
 *          per-segment "P7"/"P10" badges carry the position) - the default on Songsterr
 *   'card' diagram with a "P7 · 8–10" header, used when the free space is unknown
 *   'chip' one-line "P7 8–10" / "P7→P10" label, only where even the diagram cannot fit
 * - Emphasis 'change' marks a new hand position; 'continue' is a quiet line-start reminder
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
     * @param {Object} options Configuration options (tuning, dimensions, density, etc.)
     */
    constructor(measureData, options = {}) {
      if (!measureData) {
        throw new Error('[MeasureOverlay] measureData is required');
      }

      this.measureData = measureData;
      this.options = options;
      this.density = options.density || 'small';
      this.measureNumber = measureData.measureNumber || 1;
      this.segments = ShapeDiagram.splitMeasureIntoSegments(measureData);
      this.currentSegmentIndex = 0;
      this.activeEventIndex = null;
      this.isHighlighted = false;
      this.domElement = null;
      this.anchorRect = null;
      // Known anchor width lets the first render pick the right layout, avoiding a second render
      // on the first updatePosition() (which uses the same `width || 200` fallback)
      this.lastAnchorWidth = typeof options.anchorWidth === 'number' ? (options.anchorWidth || 200) : null;
      this.variant = MeasureOverlay.VARIANTS.includes(options.variant) ? options.variant : 'card';
      this.emphasis = options.emphasis === 'continue' ? 'continue' : 'change';
      this.theme = options.theme === 'dark' ? 'dark' : 'light';

      this.applyDensityMetrics();
      this.createElement();
    }

    /**
     * Configure dimensions and layout parameters based on density mode
     */
    applyDensityMetrics() {
      const isMulti = this.segments.length > 1;
      if (this.density === 'large') {
        this.svgWidth = this.options.svgWidth || 76;
        this.svgHeight = this.options.svgHeight || 56;
        this.overlayWidth = this.options.width || (isMulti ? 164 : 84);
        this.overlayHeight = this.options.height || 66;
        this.minPerSeg = 76;
      } else if (this.density === 'medium') {
        this.svgWidth = this.options.svgWidth || 62;
        this.svgHeight = this.options.svgHeight || 48;
        this.overlayWidth = this.options.width || (isMulti ? 136 : 68);
        this.overlayHeight = this.options.height || 56;
        this.minPerSeg = 62;
      } else {
        // 'small' default (Phase 3.4.3 non-occluding compact default)
        this.svgWidth = this.options.svgWidth || 52;
        this.svgHeight = this.options.svgHeight || 40;
        this.overlayWidth = this.options.width || (isMulti ? 116 : 58);
        this.overlayHeight = this.options.height || 46;
        this.minPerSeg = 52;
      }

      if (this.domElement) {
        this.domElement.className = this.composeClassName();
        this.domElement.style.width = 'auto';
      }
    }

    composeClassName() {
      return `sfc-measure-overlay sfc-density-${this.density} sfc-variant-${this.variant}` +
        (this.emphasis === 'continue' ? ' sfc-emphasis-continue' : '') +
        (this.isHighlighted ? ' sfc-overlay-active' : '');
    }

    /**
     * Switch presentation (card/chip), emphasis or theme; re-renders only on an actual change
     * @param {{variant?: 'card'|'chip', emphasis?: 'change'|'continue', theme?: 'light'|'dark'}} presentation
     */
    setPresentation({ variant = this.variant, emphasis = this.emphasis, theme = this.theme } = {}) {
      if (variant === this.variant && emphasis === this.emphasis && theme === this.theme) return;
      const themeOrVariantChanged = variant !== this.variant || theme !== this.theme;
      this.variant = variant;
      this.emphasis = emphasis;
      this.theme = theme;
      if (this.domElement) this.domElement.className = this.composeClassName();
      if (themeOrVariantChanged || variant === 'chip') this.render();
    }

    /**
     * Dynamically update overlay density mode
     * @param {'small'|'medium'|'large'} density 
     */
    setDensity(density) {
      if (this.density === density) return;
      if (this.domElement) {
        this.domElement.classList.remove(`sfc-density-${this.density}`);
        this.domElement.classList.add(`sfc-density-${density}`);
      }
      this.density = density;
      this.applyDensityMetrics();
      this.render();
      if (this.anchorRect) {
        this.updatePosition(this.anchorRect, this.lastScrollOffset || undefined);
      }
    }

    /**
     * Create the DOM structure for the overlay
     */
    createElement() {
      const el = document.createElement('div');
      el.className = this.composeClassName();
      el.setAttribute('data-measure-number', String(this.measureNumber));
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.width = 'auto';

      this.domElement = el;
      this.render();
      return el;
    }

    /**
     * Render diagrams for arbitrary N segments with adaptive sizing and narrow fallback
     * @param {number|null} availableWidth 
     * @returns {string} HTML string
     */
    renderDiagramsHTML(availableWidth) {
      const numSegments = this.segments.length;
      // Adaptive sizing constraint: maxWidth <= anchorWidth * 0.8
      const maxAllowedW = availableWidth ? Math.round(availableWidth * 0.8) : this.overlayWidth;

      // Tier 3: Extremely narrow measure fallback
      const isExtremelyNarrow = maxAllowedW < (numSegments > 1 ? 90 : 46);
      if (isExtremelyNarrow) {
        if (numSegments > 1) {
          const shiftSummary = this.segments.map(seg => {
            const sh = ShapeDiagram.aggregateSegmentShape(seg, null, { compact: true, density: this.density });
            const fingers = sh.usedFingers && sh.usedFingers.length > 0 ? sh.usedFingers.join('') : '0';
            return `P${seg.position} [${fingers}]`;
          }).join(' ➔ ');
          return `<div class="sfc-overlay-micro-summary" title="Micro Fingering Summary"><span class="sfc-micro-shift">${shiftSummary}</span></div>`;
        } else {
          const seg = this.segments[0];
          const sh = ShapeDiagram.aggregateSegmentShape(seg, null, { compact: true, density: this.density });
          const fingers = sh.usedFingers && sh.usedFingers.length > 0 ? sh.usedFingers.join('') : '0';
          return `<div class="sfc-overlay-micro-summary"><span class="sfc-micro-shift">P${seg.position} [${fingers}]</span></div>`;
        }
      }

      const classification = ShapeDiagram.classifyMeasure 
        ? ShapeDiagram.classifyMeasure(this.measureData) 
        : { type: 'shape' };

      const isSequence = classification.type === 'sequence';
      const isMapMulti = this.variant === 'map' && numSegments > 1;
      const baseRenderOptions = {
        compact: true,
        density: this.density,
        inlineTheme: this.theme,
        showFretLabel: true,
        width: this.svgWidth,
        height: isMapMulti ? Math.round(this.svgHeight * MeasureOverlay.MAP_MULTI_SCALE) : this.svgHeight,
        tuning: this.options.tuning,
        tuningNames: this.options.tuningNames
      };

      if (numSegments <= 1) {
        const seg = this.segments[0];
        const svg = isSequence
          ? ShapeDiagram.renderHandFrameSVG(seg, this.activeEventIndex, baseRenderOptions)
          : ShapeDiagram.renderSVG(seg, this.activeEventIndex, baseRenderOptions);
        return `<div class="sfc-overlay-diagram">${svg}</div>`;
      }

      // Generalized Multi-Segment (N >= 2)
      const minPerSeg = this.minPerSeg;
      const totalSideBySideW = numSegments * minPerSeg + (numSegments - 1) * 8;
      const canFitSideBySide = maxAllowedW >= totalSideBySideW;

      if (canFitSideBySide) {
        let html = `<div class="sfc-overlay-multi-segments">`;
        this.segments.forEach((seg, sIdx) => {
          if (sIdx > 0) {
            html += `<div class="sfc-segment-arrow">➔</div>`;
          }
          const isSegActive = this.currentSegmentIndex === sIdx && this.activeEventIndex !== null;
          const segActiveEv = isSegActive ? this.activeEventIndex : null;
          const svg = isSequence
            ? ShapeDiagram.renderHandFrameSVG(seg, segActiveEv, baseRenderOptions)
            : ShapeDiagram.renderSVG(seg, segActiveEv, baseRenderOptions);

          html += `<div class="sfc-overlay-segment${isSegActive ? ' sfc-segment-active' : ''}" data-segment-index="${sIdx}">`;
          html += `<span class="sfc-segment-badge">P${seg.position}</span>`;
          html += svg;
          html += `</div>`;
        });
        html += `</div>`;
        return html;
      } else if (this.variant === 'map') {
        // A vertical stack would be twice as tall as the free space above the staff
        return `<div class="sfc-overlay-map-fallback">${this.renderChipHTML(maxAllowedW)}</div>`;
      } else {
        // Space constrained horizontally: stack vertically in a column
        let html = `<div class="sfc-overlay-multi-stacked">`;
        const stackedOptions = Object.assign({}, baseRenderOptions, { height: Math.round(this.svgHeight * 0.88) });
        this.segments.forEach((seg, sIdx) => {
          if (sIdx > 0) {
            html += `<div class="sfc-segment-arrow-v">↓</div>`;
          }
          const isSegActive = this.currentSegmentIndex === sIdx && this.activeEventIndex !== null;
          const segActiveEv = isSegActive ? this.activeEventIndex : null;
          const svg = isSequence
            ? ShapeDiagram.renderHandFrameSVG(seg, segActiveEv, stackedOptions)
            : ShapeDiagram.renderSVG(seg, segActiveEv, stackedOptions);

          html += `<div class="sfc-overlay-segment${isSegActive ? ' sfc-segment-active' : ''}" data-segment-index="${sIdx}">`;
          html += `<span class="sfc-segment-badge">P${seg.position}</span>`;
          html += svg;
          html += `</div>`;
        });
        html += `</div>`;
        return html;
      }
    }

    /**
     * One-line label: hand position, then fret span, or the shift path for multi-position measures.
     * Narrow measures drop the span so the chip never spills into the next measure.
     */
    renderChipHTML(availableWidth) {
      const narrow = typeof availableWidth === 'number' && availableWidth < 72;
      const positions = MeasureOverlay.frettedPositions(this.measureData);
      if (positions.length > 1) {
        const shown = narrow ? positions.slice(0, 2) : positions;
        return `<span class="sfc-chip-pos sfc-chip-shift" title="Position shift">${shown.map(p => `P${p}`).join('→')}</span>`;
      }
      const classification = ShapeDiagram.classifyMeasure ? ShapeDiagram.classifyMeasure(this.measureData) : {};
      const span = classification.handSpan ? `${classification.handSpan.minFret}–${classification.handSpan.maxFret}` : '';
      const pos = `<span class="sfc-chip-pos">P${positions[0] || this.segments[0].position}</span>`;
      return narrow || !span ? pos : `${pos}<span class="sfc-chip-span">${span}</span>`;
    }

    /**
     * Render or refresh inner HTML of the overlay
     */
    render() {
      if (!this.domElement) return;

      if (this.variant === 'chip') {
        this.domElement.innerHTML = this.renderChipHTML(this.lastAnchorWidth ? this.lastAnchorWidth * 0.8 : null);
        return;
      }

      if (this.variant === 'map') {
        this.domElement.innerHTML = this.renderDiagramsHTML(this.lastAnchorWidth);
        return;
      }

      const currentSegment = this.segments[this.currentSegmentIndex] || this.segments[0];
      const hasShift = this.segments.length > 1;
      const classification = ShapeDiagram.classifyMeasure 
        ? ShapeDiagram.classifyMeasure(this.measureData) 
        : { type: 'shape' };

      // Header with position and hand span (omits redundant measure number)
      const spanText = classification.handSpan ? `${classification.handSpan.minFret}–${classification.handSpan.maxFret}` : '';
      let headerPosText = `P${currentSegment.position}`;
      if (spanText) {
        headerPosText += ` · ${spanText}`;
      }

      let headerHTML = `<div class="sfc-overlay-header">`;
      headerHTML += `<span class="sfc-overlay-pos-badge">${headerPosText}</span>`;
      
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
      this.lastScrollOffset = scrollOffset;

      const anchorW = anchorRect.width || 200;
      const scrollX = typeof scrollOffset.scrollX === 'number' ? scrollOffset.scrollX : (typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0);
      const scrollY = typeof scrollOffset.scrollY === 'number' ? scrollOffset.scrollY : (typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0);

      // Adaptive sizing constraint: maximum width <= anchorWidth * 0.8
      const maxAllowedW = Math.round(anchorW * 0.8);
      this.setStyleIfChanged('maxWidth', `${maxAllowedW}px`);

      // Re-render if anchor width changed significantly to adapt multi-segment layout
      if (this.lastAnchorWidth !== anchorW) {
        this.lastAnchorWidth = anchorW;
        this.render();
      }

      const overlayW = this.domElement.offsetWidth || this.overlayWidth;
      const overlayH = this.domElement.offsetHeight || this.overlayHeight;

      // Position strictly above notation lines (overlay.bottom <= notationTop - safeGap)
      const notationTop = (typeof anchorRect.notationTop === 'number') ? anchorRect.notationTop : (anchorRect.stringsTop || anchorRect.top);
      const safeGap = 4;

      let top = notationTop + scrollY - overlayH - safeGap;
      // Start after the measure number when known, else with slight padding inside the measure
      const startX = typeof anchorRect.contentLeft === 'number' ? anchorRect.contentLeft + 4 : anchorRect.left + 2;
      let left = startX + scrollX;

      // Adaptive boundary check: NEVER overlap neighboring measure to the right
      if (left + overlayW > anchorRect.right + scrollX) {
        left = Math.max(anchorRect.left + scrollX, anchorRect.right + scrollX - overlayW - 2);
      }

      // Hard non-occlusion guard: overlay bottom must never cross notationTop - safeGap
      if (top + overlayH > notationTop + scrollY - safeGap) {
        top = notationTop + scrollY - safeGap - overlayH;
      }

      // If at top edge of document
      if (top < 0) {
        top = 2;
      }

      this.setStyleIfChanged('top', `${Math.round(top)}px`);
      this.setStyleIfChanged('left', `${Math.round(left)}px`);
    }

    /**
     * Write an inline style only when it differs, avoiding style recalcs and mutation records
     * on the many reconciles that leave an overlay where it already is
     */
    setStyleIfChanged(prop, value) {
      if (this.domElement.style[prop] !== value) {
        this.domElement.style[prop] = value;
      }
    }

    /**
     * Set active playback event index
     * Automatically handles segment switching if position shift occurs in this measure
     * @param {number|null} eventIndex 
     */
    setActiveEvent(eventIndex) {
      // The manager re-applies the active event on every reconcile; skip redundant re-renders
      if (eventIndex === this.activeEventIndex && this.domElement && this.domElement.innerHTML) return;
      this.activeEventIndex = eventIndex;
      if (this.variant === 'chip') return;

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

  /**
   * Hand positions a measure actually frets in, in order, with repeats collapsed (e.g. [7, 10]).
   * Rest and open-string beats are skipped: they carry a position but do not move the hand.
   */
  MeasureOverlay.frettedPositions = (measure) => {
    const positions = [];
    (measure && Array.isArray(measure.beats) ? measure.beats : []).forEach((b) => {
      if (!Array.isArray(b.notes) || !b.notes.some(n => !n.isRest && n.fret > 0)) return;
      const pos = b.recommendedPosition || measure.recommendedPosition || 1;
      if (positions[positions.length - 1] !== pos) positions.push(pos);
    });
    return positions;
  };

  /** Position sequence of a measure, e.g. "7>10" */
  MeasureOverlay.positionSignature = (measure) => MeasureOverlay.frettedPositions(measure).join('>');

  /**
   * Chord/grip identity used by 'smart' mode: positions plus every fretted string/fret/finger.
   * Two measures with the same signature need the same hand shape, so the repeat can be skipped;
   * a new chord at the same position still counts as a change.
   */
  MeasureOverlay.gripSignature = (measure) => {
    const notes = new Set();
    (measure && Array.isArray(measure.beats) ? measure.beats : []).forEach((b) => {
      (Array.isArray(b.notes) ? b.notes : []).forEach((n) => {
        if (!n.isRest && n.fret > 0) notes.add(n.string + ':' + n.fret + ':' + (n.recommendedFinger ?? ''));
      });
    });
    return MeasureOverlay.positionSignature(measure) + '|' + Array.from(notes).sort().join(',');
  };

  MeasureOverlay.VARIANTS = ['card', 'map', 'chip'];
  // Diagram height factor for two-segment maps (keeps them as short as a single diagram)
  MeasureOverlay.MAP_MULTI_SCALE = 0.68;

  return MeasureOverlay;
});
