/**
 * shape_diagram.js
 * 
 * Generates compact Guitar Chord / Hand-Shape Diagrams in scalable vector graphics (SVG).
 * 
 * Features:
 * - Traditional compact chord chart style (6 strings, 4-5 frets)
 * - String 6 (Low E) on far left -> String 1 (High E) on far right
 * - Fret range dynamically determined by position (e.g. "7fr" label or Nut for Pos 1)
 * - Open strings marked with 'O' above nut; dead notes with 'X'; unused strings blank
 * - Fingers 1/2/3/4 displayed inside note dots
 * - Active beat notes prominently highlighted; other segment notes shown as preview shape
 * - Mini-barre detection and rounded capsule rendering (e.g. M4: 12 + 10 + 10)
 * - Segment splitting for measures with position shifts (no conflicting shapes)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShapeDiagram = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Map Songsterr 0-indexed string to chord diagram column:
   * String 0 = High E -> Col 5 (Rightmost)
   * String 1 = B      -> Col 4
   * String 2 = G      -> Col 3
   * String 3 = D      -> Col 2
   * String 4 = A      -> Col 1
   * String 5 = Low E  -> Col 0 (Leftmost)
   */
  function stringToCol(stringIndex) {
    return 5 - stringIndex;
  }

  /**
   * Split a measure into contiguous position segments if position shifts occur within the measure.
   * Prevents conflicting hand shapes from being drawn on a single diagram.
   */
  function splitMeasureIntoSegments(measure) {
    if (!measure || !Array.isArray(measure.beats) || measure.beats.length === 0) {
      return [{
        segmentIndex: 0,
        position: measure?.recommendedPosition || 1,
        beats: [],
        startBeat: 1,
        endBeat: 1
      }];
    }

    const segments = [];
    let currentSegment = null;

    measure.beats.forEach((beat) => {
      const pos = beat.recommendedPosition || measure.recommendedPosition || 1;

      if (!currentSegment || currentSegment.position !== pos) {
        if (currentSegment) {
          currentSegment.endBeat = currentSegment.beats[currentSegment.beats.length - 1].beatNumber;
          segments.push(currentSegment);
        }
        currentSegment = {
          segmentIndex: segments.length,
          position: pos,
          beats: [beat],
          startBeat: beat.beatNumber,
          endBeat: beat.beatNumber
        };
      } else {
        currentSegment.beats.push(beat);
      }
    });

    if (currentSegment) {
      currentSegment.endBeat = currentSegment.beats[currentSegment.beats.length - 1].beatNumber;
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Extract notes, open strings, and mini-barres for a given segment.
   */
  function aggregateSegmentShape(segment, activeBeatNumber = null) {
    const notesMap = new Map(); // key: `${stringIndex}_${fret}`
    const openStrings = new Map(); // key: stringIndex -> { active: boolean, beats: [] }
    const deadStrings = new Map(); // key: stringIndex -> { active: boolean }
    const fretSet = new Set();

    segment.beats.forEach((beat) => {
      const isActiveBeat = activeBeatNumber !== null && beat.beatNumber === activeBeatNumber;

      beat.notes.forEach((note) => {
        if (note.isRest || note.string < 0) return;

        if (note.isDead || note.isMuted) {
          deadStrings.set(note.string, { active: isActiveBeat });
          return;
        }

        if (note.fret === 0) {
          if (!openStrings.has(note.string)) {
            openStrings.set(note.string, { active: false, beats: [] });
          }
          const item = openStrings.get(note.string);
          item.beats.push(beat.beatNumber);
          if (isActiveBeat) item.active = true;
          return;
        }

        fretSet.add(note.fret);
        const key = `${note.string}_${note.fret}`;
        if (!notesMap.has(key)) {
          notesMap.set(key, {
            string: note.string,
            col: stringToCol(note.string),
            fret: note.fret,
            finger: note.recommendedFinger || 1,
            beats: [beat.beatNumber],
            activeOnBeats: isActiveBeat ? [beat.beatNumber] : []
          });
        } else {
          const entry = notesMap.get(key);
          entry.beats.push(beat.beatNumber);
          if (isActiveBeat) entry.activeOnBeats.push(beat.beatNumber);
        }
      });
    });

    // Calculate fret display range
    const pos = segment.position || 1;
    let minFret = pos;
    let maxFret = pos + 3;

    if (fretSet.size > 0) {
      const frets = Array.from(fretSet);
      const minNoteFret = Math.min(...frets);
      const maxNoteFret = Math.max(...frets);

      if (pos === 1 || minNoteFret <= 3) {
        minFret = 1;
        maxFret = Math.max(4, maxNoteFret);
      } else {
        minFret = Math.min(pos, minNoteFret);
        maxFret = Math.max(minFret + 3, maxNoteFret);
      }
    }

    const fretCount = Math.min(6, Math.max(4, maxFret - minFret + 1));

    // Detect mini-barres: Same finger pressing the same fret on >= 2 adjacent strings
    const fretFingerBuckets = new Map();
    notesMap.forEach((entry) => {
      const bucketKey = `${entry.fret}_${entry.finger}`;
      if (!fretFingerBuckets.has(bucketKey)) {
        fretFingerBuckets.set(bucketKey, []);
      }
      fretFingerBuckets.get(bucketKey).push(entry);
    });

    const barres = [];
    fretFingerBuckets.forEach((entries, key) => {
      if (entries.length >= 2) {
        const [fretStr, fingerStr] = key.split('_');
        const fret = parseInt(fretStr, 10);
        const finger = parseInt(fingerStr, 10);

        // Sort by column (left to right)
        entries.sort((a, b) => a.col - b.col);
        const minCol = entries[0].col;
        const maxCol = entries[entries.length - 1].col;

        // Check if contiguous or nearly contiguous
        const isBarreActive = entries.some(e => e.activeOnBeats.length > 0);

        barres.push({
          fret,
          finger,
          minCol,
          maxCol,
          active: isBarreActive,
          notes: entries
        });
      }
    });

    return {
      position: pos,
      minFret,
      fretCount,
      notes: Array.from(notesMap.values()),
      openStrings: Array.from(openStrings.entries()).map(([str, data]) => ({
        string: parseInt(str, 10),
        col: stringToCol(parseInt(str, 10)),
        active: data.active
      })),
      deadStrings: Array.from(deadStrings.entries()).map(([str, data]) => ({
        string: parseInt(str, 10),
        col: stringToCol(parseInt(str, 10)),
        active: data.active
      })),
      barres
    };
  }

  /**
   * Render SVG XML string for a given segment and active beat
   */
  function renderSVG(segment, activeBeatNumber = null, options = {}) {
    const shape = aggregateSegmentShape(segment, activeBeatNumber);

    const width = options.width || 210;
    const height = options.height || 230;
    const margin = { top: 38, left: 40, right: 26, bottom: 20 };

    const gridWidth = width - margin.left - margin.right;
    const gridHeight = height - margin.top - margin.bottom;

    const numStrings = 6;
    const numFrets = shape.fretCount;

    const stringSpacing = gridWidth / (numStrings - 1);
    const fretSpacing = gridHeight / numFrets;

    function getX(col) {
      return margin.left + col * stringSpacing;
    }

    function getY(fret) {
      const row = fret - shape.minFret;
      // Position circle between fret lines
      return margin.top + row * fretSpacing + fretSpacing * 0.5;
    }

    function getFretLineY(fretIndex) {
      return margin.top + fretIndex * fretSpacing;
    }

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="sfc-shape-svg" width="100%" height="100%">`;

    // Dark background for diagram
    svg += `<rect width="${width}" height="${height}" rx="8" fill="#18181b" />`;

    // Starting fret label or Nut
    const isNut = shape.minFret === 1;
    if (isNut) {
      // Draw thick nut at top
      svg += `<line x1="${getX(0)}" y1="${margin.top}" x2="${getX(5)}" y2="${margin.top}" stroke="#f4f4f5" stroke-width="5" stroke-linecap="round" />`;
    } else {
      // Draw normal fret line at top + fret label on left
      svg += `<text x="${margin.left - 8}" y="${margin.top + fretSpacing * 0.55}" fill="#00d26a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="bold" text-anchor="end">${shape.minFret}fr</text>`;
      svg += `<line x1="${getX(0)}" y1="${margin.top}" x2="${getX(5)}" y2="${margin.top}" stroke="#52525b" stroke-width="1.5" />`;
    }

    // Horizontal fret lines
    for (let f = 1; f <= numFrets; f++) {
      const y = getFretLineY(f);
      svg += `<line x1="${getX(0)}" y1="${y}" x2="${getX(5)}" y2="${y}" stroke="#3f3f46" stroke-width="1.2" />`;
    }

    // Vertical string lines
    for (let s = 0; s < numStrings; s++) {
      const x = getX(s);
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + gridHeight}" stroke="#71717a" stroke-width="${s === 0 || s === 1 ? 1.8 : 1.2}" />`;
    }

    // String name headers (6 = Low E on left, 1 = High E on right)
    const stringNames = ['E', 'A', 'D', 'G', 'B', 'e'];
    for (let col = 0; col < 6; col++) {
      const x = getX(col);
      svg += `<text x="${x}" y="${margin.top + gridHeight + 14}" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" text-anchor="middle">${stringNames[col]}</text>`;
    }

    // Render Mini-Barres (behind note circles)
    shape.barres.forEach((barre) => {
      if (barre.fret < shape.minFret || barre.fret >= shape.minFret + shape.fretCount) return;
      const x1 = getX(barre.minCol);
      const x2 = getX(barre.maxCol);
      const y = getY(barre.fret);
      const radius = 10;
      const fillColor = barre.active ? 'rgba(0, 210, 106, 0.45)' : 'rgba(82, 82, 91, 0.55)';
      const strokeColor = barre.active ? '#00d26a' : '#71717a';

      svg += `<rect x="${x1 - radius}" y="${y - radius}" width="${(x2 - x1) + radius * 2}" height="${radius * 2}" rx="${radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />`;
      // Mini-barre label
      if (barre.maxCol - barre.minCol >= 1) {
        svg += `<text x="${(x1 + x2) / 2}" y="${y - 12}" fill="${strokeColor}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="bold" text-anchor="middle">barre</text>`;
      }
    });

    // Render Open Strings ('O')
    shape.openStrings.forEach((item) => {
      const x = getX(item.col);
      const y = margin.top - 12;
      const color = item.active ? '#00d26a' : '#a1a1aa';
      const strokeWidth = item.active ? 2.5 : 1.5;
      svg += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
      if (item.active) {
        svg += `<circle cx="${x}" cy="${y}" r="2.5" fill="#00d26a" />`;
      }
    });

    // Render Dead Strings ('X')
    shape.deadStrings.forEach((item) => {
      const x = getX(item.col);
      const y = margin.top - 12;
      svg += `<text x="${x}" y="${y + 4}" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">×</text>`;
    });

    // Render Note Dots
    shape.notes.forEach((note) => {
      if (note.fret < shape.minFret || note.fret >= shape.minFret + shape.fretCount) return;
      const x = getX(note.col);
      const y = getY(note.fret);
      const isActive = note.activeOnBeats.length > 0;

      const circleRadius = 9;
      const circleFill = isActive ? '#00d26a' : '#3f3f46';
      const circleStroke = isActive ? '#a7f3d0' : '#71717a';
      const textFill = isActive ? '#09090b' : '#f4f4f5';

      if (isActive) {
        // Outer glowing pulse ring
        svg += `<circle cx="${x}" cy="${y}" r="${circleRadius + 4}" fill="rgba(0, 210, 106, 0.28)" />`;
      }

      svg += `<circle cx="${x}" cy="${y}" r="${circleRadius}" fill="${circleFill}" stroke="${circleStroke}" stroke-width="${isActive ? 2 : 1.2}" />`;
      svg += `<text x="${x}" y="${y + 3.5}" fill="${textFill}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="bold" text-anchor="middle">${note.finger}</text>`;
    });

    svg += `</svg>`;
    return svg;
  }

  return {
    stringToCol,
    splitMeasureIntoSegments,
    aggregateSegmentShape,
    renderSVG
  };
});
