/**
 * score_geometry.js
 * 
 * Unified Geometry Adapter for Modern Songsterr DOM.
 * 
 * Responsibilities:
 * - Discovers active score lines, measures, and playheads using semantic / structural anchors:
 *   - `g[data-line][data-part-id]`
 *   - `use[href*="cursor-playhead"]`
 *   - `path[data-testid="tab-strings-path"]`
 *   - Measure marker text elements `<text y="-8">` or in `[data-tab-control="marker"]`
 * - Converts SVG internal coordinates to viewport / screen CSS pixels using getBoundingClientRect() & viewBox scale.
 * - Decouples PlaybackObserver and OverlayManager from Songsterr's internal DOM implementation.
 * - Strictly avoids hashed build classes (e.g. .w2moHa_multiTrackLinesWrap).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoreGeometry = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Safe document getter
   */
  function getDoc(doc) {
    if (doc) return doc;
    if (typeof document !== 'undefined') return document;
    return null;
  }

  /**
   * Find all visible score lines across the DOM.
   * Uses structural `g[data-line][data-part-id]` or SVG line elements.
   * 
   * @param {Document} [doc]
   * @returns {Array<Object>}
   */
  function getVisibleLines(doc) {
    const documentRef = getDoc(doc);
    if (!documentRef) return [];

    const lineGs = Array.from(documentRef.querySelectorAll('g[data-line][data-part-id]'));
    const lines = [];

    lineGs.forEach((g) => {
      const lineIndex = parseInt(g.getAttribute('data-line'), 10);
      const partId = parseInt(g.getAttribute('data-part-id'), 10);
      const svg = g.closest ? g.closest('svg') : (g.ownerSVGElement || null);
      if (!svg) return;

      const svgRect = typeof svg.getBoundingClientRect === 'function' 
        ? svg.getBoundingClientRect() 
        : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

      const isVisible = svgRect.width > 0 || svgRect.height > 0;
      const container = svg.parentElement || null;

      lines.push({
        lineIndex: isNaN(lineIndex) ? 0 : lineIndex,
        partId: isNaN(partId) ? 0 : partId,
        gElement: g,
        svgElement: svg,
        containerElement: container,
        rect: svgRect,
        isVisible
      });
    });

    // Fallback: If no g[data-line], find SVGs containing tab-strings-path
    if (lines.length === 0) {
      const tabSvgs = Array.from(documentRef.querySelectorAll('svg')).filter(s => 
        s.querySelector && s.querySelector('path[data-testid="tab-strings-path"]')
      );
      tabSvgs.forEach((svg, idx) => {
        const svgRect = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        lines.push({
          lineIndex: idx,
          partId: 0,
          gElement: null,
          svgElement: svg,
          containerElement: svg.parentElement,
          rect: svgRect,
          isVisible: svgRect.width > 0 || svgRect.height > 0
        });
      });
    }

    return lines;
  }

  /**
   * Find the currently active, visible playhead candidate.
   * 
   * @param {Document} [doc]
   * @returns {Object|null}
   */
  function getActivePlayheadGeometry(doc) {
    const documentRef = getDoc(doc);
    if (!documentRef) return null;

    const playheads = Array.from(documentRef.querySelectorAll('use[href*="cursor-playhead"]'));
    if (playheads.length === 0) return null;

    let bestCandidate = null;
    let bestScore = -1;
    let bestCursorX = 0;

    for (let i = 0; i < playheads.length; i++) {
      const ph = playheads[i];
      const win = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
      const comp = win && win.getComputedStyle ? win.getComputedStyle(ph) : (ph.style || {});

      const isVisible = comp.visibility !== 'hidden' && comp.display !== 'none' && parseFloat(comp.opacity || '1') > 0;
      if (!isVisible) continue;

      const style = ph.style || {};
      const transformStr = style.transform || comp.transform || '';
      let cursorX = null;

      const t3d = /translate3d\(\s*(-?[\d.]+)px/i.exec(transformStr);
      if (t3d) {
        cursorX = parseFloat(t3d[1]);
      } else {
        const mat = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?[\d.]+)/i.exec(transformStr);
        if (mat) cursorX = parseFloat(mat[1]);
      }

      if (cursorX === null || isNaN(cursorX)) continue;

      let score = 100 + (cursorX > 0 ? 20 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = ph;
        bestCursorX = cursorX;
      }
    }

    if (!bestCandidate) return null;

    const svg = bestCandidate.closest ? bestCandidate.closest('svg') : (bestCandidate.ownerSVGElement || null);
    const lineG = bestCandidate.closest ? bestCandidate.closest('g[data-line]') : null;
    const lineIndex = lineG ? parseInt(lineG.getAttribute('data-line'), 10) : 0;
    const partId = lineG ? parseInt(lineG.getAttribute('data-part-id'), 10) : 0;

    const svgRect = svg && typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : { left: 0, top: 0, width: 0 };
    const vb = svg?.viewBox?.baseVal;
    const scaleX = (vb && vb.width > 0) ? (svgRect.width / vb.width) : 1;
    const screenX = svgRect.left + bestCursorX * scaleX;

    return {
      playheadElement: bestCandidate,
      lineIndex,
      partId,
      svgElement: svg,
      cursorX: bestCursorX,
      screenX,
      isVisible: true
    };
  }

  /**
   * Extract all measure geometries across visible score lines in viewport coordinates.
   * 
   * @param {Document} [doc]
   * @returns {Array<Object>} Array of measure geometry objects
   */
  function getMeasureGeometries(doc) {
    const lines = getVisibleLines(doc);
    const geometries = [];

    lines.forEach((line) => {
      const svg = line.svgElement;
      if (!svg) return;

      const svgRect = typeof svg.getBoundingClientRect === 'function'
        ? svg.getBoundingClientRect()
        : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

      // 1. Extract measure marker text elements
      const texts = Array.from(svg.querySelectorAll ? svg.querySelectorAll('text') : []);
      const markerTexts = [];

      texts.forEach((t) => {
        const textContent = (t.textContent || '').trim();
        if (!/^\d+$/.test(textContent)) return;
        const num = parseInt(textContent, 10);
        if (isNaN(num) || num < 1) return;

        const y = parseFloat(t.getAttribute('y') || '0');
        const isMarker = y < 0 || 
                         (t.closest && t.closest('[data-tab-control="marker"]')) || 
                         (t.className?.baseVal || t.className || '').includes('number');

        if (isMarker) {
          const x = parseFloat(t.getAttribute('x') || '0');
          markerTexts.push({ num, x, element: t });
        }
      });

      markerTexts.sort((a, b) => a.x - b.x);

      // 2. Extract bar line X coordinates and strings bounds from <path data-testid="tab-strings-path">
      const stringsPath = svg.querySelector ? svg.querySelector('path[data-testid="tab-strings-path"]') : null;
      const stringsRect = (stringsPath && typeof stringsPath.getBoundingClientRect === 'function')
        ? stringsPath.getBoundingClientRect()
        : null;
      const stringsTop = stringsRect ? Math.round(stringsRect.top) : Math.round(svgRect.top);
      const stringsBottom = stringsRect ? Math.round(stringsRect.bottom) : Math.round(svgRect.bottom);

      const barLinesX = [];
      if (stringsPath) {
        const d = stringsPath.getAttribute('d') || '';
        const barRegex = /M(-?[\d.]+),0\.5v/g;
        let m;
        while ((m = barRegex.exec(d)) !== null) {
          barLinesX.push(parseFloat(m[1]));
        }
        barLinesX.sort((a, b) => a - b);
      }

      const vb = svg.viewBox?.baseVal;
      const scaleX = (vb && vb.width > 0) ? (svgRect.width / vb.width) : 1;

      // 3. Form measure boundaries
      markerTexts.forEach((curM, idx) => {
        const nextM = markerTexts[idx + 1];
        const startX = curM.x;
        let endX = nextM ? nextM.x : null;

        if (!endX) {
          if (barLinesX.length > 0 && barLinesX[barLinesX.length - 1] > startX) {
            endX = barLinesX[barLinesX.length - 1];
          } else {
            endX = (vb && vb.width > 0) ? vb.width : (startX + 180);
          }
        }

        const left = svgRect.left + startX * scaleX;
        const right = svgRect.left + endX * scaleX;
        const width = Math.max(1, right - left);

        geometries.push({
          measureNumber: curM.num,
          lineIndex: line.lineIndex,
          partId: line.partId,
          left: Math.round(left),
          right: Math.round(right),
          top: Math.round(svgRect.top),
          bottom: Math.round(svgRect.bottom),
          width: Math.round(width),
          height: Math.round(svgRect.height || (svgRect.bottom - svgRect.top)),
          stringsTop,
          stringsBottom,
          notationTop: stringsTop,
          notationBottom: stringsBottom,
          svgElement: svg,
          containerElement: line.containerElement,
          markerElement: curM.element
        });
      });
    });

    // Optional legacy target fallback for testing environments
    if (geometries.length === 0) {
      const documentRef = getDoc(doc);
      if (documentRef) {
        const legacyTargets = Array.from(documentRef.querySelectorAll('rect[data-testid="tab-measure-target"]'));
        legacyTargets.forEach((mt) => {
          const mIdx = parseInt(mt.getAttribute('data-measure-index') || '0', 10);
          const rect = typeof mt.getBoundingClientRect === 'function' ? mt.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
          geometries.push({
            measureNumber: mIdx + 1,
            lineIndex: 0,
            partId: 0,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            stringsTop: Math.round(rect.top),
            stringsBottom: Math.round(rect.bottom),
            notationTop: Math.round(rect.top),
            notationBottom: Math.round(rect.bottom),
            svgElement: mt.closest ? mt.closest('svg') : null,
            containerElement: mt.parentElement,
            markerElement: null
          });
        });
      }
    }

    return geometries;
  }

  /**
   * Get geometry for a specific measure number.
   * 
   * @param {number} measureNumber
   * @param {Document} [doc]
   * @returns {Object|null}
   */
  function getMeasureGeometry(measureNumber, doc) {
    const geometries = getMeasureGeometries(doc);
    return geometries.find(g => g.measureNumber === measureNumber) || null;
  }

  return {
    getVisibleLines,
    getActivePlayheadGeometry,
    getMeasureGeometries,
    getMeasureGeometry
  };
});
