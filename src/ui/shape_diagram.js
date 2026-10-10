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
      const evNum = beat.eventIndex || beat.beatNumber || 1;

      if (!currentSegment || currentSegment.position !== pos) {
        if (currentSegment) {
          const lastB = currentSegment.beats[currentSegment.beats.length - 1];
          currentSegment.endBeat = lastB.beatNumber;
          currentSegment.endEvent = lastB.eventIndex || lastB.beatNumber;
          segments.push(currentSegment);
        }
        currentSegment = {
          segmentIndex: segments.length,
          position: pos,
          beats: [beat],
          startBeat: beat.beatNumber,
          endBeat: beat.beatNumber,
          startEvent: evNum,
          endEvent: evNum
        };
      } else {
        currentSegment.beats.push(beat);
      }
    });

    if (currentSegment) {
      const lastB = currentSegment.beats[currentSegment.beats.length - 1];
      currentSegment.endBeat = lastB.beatNumber;
      currentSegment.endEvent = lastB.eventIndex || lastB.beatNumber;
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Extract notes, open strings, and mini-barres for a given segment.
   */
  function aggregateSegmentShape(segment, activeEventIndex = null, options = {}) {
    const notesMap = new Map(); // key: `${stringIndex}_${fret}`
    const openStrings = new Map(); // key: stringIndex -> { active: boolean, beats: [] }
    const deadStrings = new Map(); // key: stringIndex -> { active: boolean }
    const fretSet = new Set();
    const isCompact = !!options.compact;
    const pos = segment?.position || segment?.recommendedPosition || 1;
    let minFret = pos;
    let maxFret = pos + (isCompact ? 2 : 3);

    const beats = segment?.beats || [];
    beats.forEach((beat) => {
      const bEv = beat.eventIndex || beat.beatNumber;
      const isActiveBeat = activeEventIndex !== null && (bEv === activeEventIndex || beat.beatNumber === activeEventIndex);

      if (options.singleEventOnly && !isActiveBeat) {
        return;
      }

      (beat.notes || []).forEach((note) => {
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
            finger: note.recommendedFinger ?? note.finger ?? 1,
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

    if (fretSet.size > 0) {
      const frets = Array.from(fretSet);
      const minNoteFret = Math.min(...frets);
      const maxNoteFret = Math.max(...frets);

      if (pos === 1 || minNoteFret <= 3) {
        minFret = 1;
        maxFret = isCompact ? Math.max(3, maxNoteFret) : Math.max(4, maxNoteFret);
      } else {
        minFret = Math.min(pos, minNoteFret);
        maxFret = isCompact ? Math.max(minFret + 2, maxNoteFret) : Math.max(minFret + 3, maxNoteFret);
      }
    }

    // In compact mode: compress to 3~4 fret rows; otherwise 4~6 fret rows
    const fretCount = isCompact
      ? Math.min(4, Math.max(3, maxFret - minFret + 1))
      : Math.min(6, Math.max(4, maxFret - minFret + 1));

    // True simultaneous mini-barre detection (C1):
    // Only fretted notes in the SAME canonical event sharing same fret + same finger on >= 2 adjacent strings
    const trueBarreKeys = new Set();
    beats.forEach((beat) => {
      const bEv = beat.eventIndex || beat.beatNumber;
      if (options.singleEventOnly && activeEventIndex !== null && bEv !== activeEventIndex) {
        return;
      }
      const fretted = (beat.notes || []).filter(n => !n.isRest && !n.isDead && !n.isMuted && n.fret > 0);
      const buckets = new Map();
      fretted.forEach((n) => {
        const finger = n.recommendedFinger ?? n.finger ?? 1;
        if (finger <= 0) return;
        const key = `${n.fret}_${finger}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(n);
      });

      buckets.forEach((notes, key) => {
        if (notes.length >= 2) {
          const strList = notes.map(n => n.string).sort((a, b) => a - b);
          let isAdjacent = false;
          for (let i = 0; i < strList.length - 1; i++) {
            if (strList[i + 1] - strList[i] === 1) {
              isAdjacent = true;
              break;
            }
          }
          if (isAdjacent) {
            trueBarreKeys.add(key);
          }
        }
      });
    });

    const allNotes = Array.from(notesMap.values());
    const barres = [];
    trueBarreKeys.forEach((key) => {
      const [fretStr, fingerStr] = key.split('_');
      const fret = parseInt(fretStr, 10);
      const finger = parseInt(fingerStr, 10);

      const entries = allNotes.filter(n => n.fret === fret && n.finger === finger);
      if (entries.length >= 2) {
        entries.sort((a, b) => a.col - b.col);
        const minCol = entries[0].col;
        const maxCol = entries[entries.length - 1].col;
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

    const usedFingers = Array.from(new Set(allNotes.map(n => n.finger).filter(f => f > 0))).sort((a, b) => a - b);

    return {
      position: pos,
      minFret,
      fretCount,
      notes: allNotes,
      usedFingers,
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
    const shape = aggregateSegmentShape(segment, activeBeatNumber, options);
    const isCompact = !!options.compact;
    const density = options.density || (isCompact ? 'small' : 'large');

    // Scale dimensions and parameters based on density
    let width, height, margin, circleRadius, fontSize, openRadius, barreRadius;
    const hasFretLabel = !options.omitFretLabel && shape.minFret > 1;
    if (isCompact) {
      if (density === 'large') {
        width = options.width || 76;
        height = options.height || 56;
        margin = { top: 9, left: hasFretLabel ? 15 : 7, right: 6, bottom: 4 };
        circleRadius = 4.6;
        fontSize = 6.8;
        openRadius = 3.0;
        barreRadius = 4.8;
      } else if (density === 'medium') {
        width = options.width || 62;
        height = options.height || 48;
        margin = { top: 8, left: hasFretLabel ? 13 : 6, right: 6, bottom: 4 };
        circleRadius = 3.8;
        fontSize = 5.6;
        openRadius = 2.6;
        barreRadius = 4.0;
      } else {
        // default: small (Phase 3.4.3 non-occluding compact default)
        width = options.width || 52;
        height = options.height || 40;
        margin = { top: 6, left: hasFretLabel ? 12 : 5, right: 5, bottom: 3 };
        circleRadius = 3.2;
        fontSize = 4.8;
        openRadius = 2.2;
        barreRadius = 3.4;
      }
    } else {
      // Full CoachPanel diagram
      width = options.width || 210;
      height = options.height || 230;
      margin = { top: 38, left: 40, right: 26, bottom: 20 };
      circleRadius = 9;
      fontSize = 10.5;
      openRadius = 6;
      barreRadius = 10;
    }

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

    const isLightTheme = options.inlineTheme === 'light' || options.theme === 'light';
    const bgFill = isLightTheme 
      ? (options.bgFill || (isCompact ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.96)')) 
      : (isCompact ? 'rgba(24, 24, 27, 0.45)' : '#18181b');
    const nutStroke = isLightTheme ? '#475569' : '#f4f4f5';
    const topFretStroke = isLightTheme ? '#94a3b8' : '#52525b';
    const fretStroke = isLightTheme ? '#e2e8f0' : '#3f3f46';
    const stringStroke = isLightTheme ? '#94a3b8' : '#71717a';
    const fretTextFill = isLightTheme ? '#475569' : '#00d26a';

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="sfc-shape-svg${isCompact ? ' sfc-shape-compact' : ''} sfc-density-${density}${isLightTheme ? ' sfc-theme-light' : ''}" width="${isCompact ? width : '100%'}" height="${isCompact ? height : '100%'}">`;

    // Background rect
    svg += `<rect width="${width}" height="${height}" rx="${isCompact ? 5 : 8}" fill="${bgFill}" />`;

    // Starting fret label or Nut
    const isNut = shape.minFret === 1;
    if (isNut) {
      // Draw thick nut at top
      svg += `<line x1="${getX(0)}" y1="${margin.top}" x2="${getX(5)}" y2="${margin.top}" stroke="${nutStroke}" stroke-width="${isCompact ? 3.0 : 5}" stroke-linecap="round" />`;
    } else {
      // Top fret line
      svg += `<line x1="${getX(0)}" y1="${margin.top}" x2="${getX(5)}" y2="${margin.top}" stroke="${topFretStroke}" stroke-width="${isCompact ? 1.0 : 1.5}" />`;
      // Fret label on left
      if (!options.omitFretLabel && (shape.minFret > 1 || !isCompact)) {
        const fretTextX = margin.left - (isCompact ? 3 : 8);
        const fretTextY = margin.top + fretSpacing * 0.55;
        const fSize = isCompact ? Math.max(6.5, fontSize * 0.92) : 12;
        svg += `<text x="${fretTextX}" y="${fretTextY}" fill="${fretTextFill}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${fSize}" font-weight="bold" text-anchor="end">${shape.minFret}fr</text>`;
      }
    }

    // Horizontal fret lines
    for (let f = 1; f <= numFrets; f++) {
      const y = getFretLineY(f);
      svg += `<line x1="${getX(0)}" y1="${y}" x2="${getX(5)}" y2="${y}" stroke="${fretStroke}" stroke-width="${isCompact ? 0.8 : 1.2}" />`;
    }

    // Vertical string lines
    for (let s = 0; s < numStrings; s++) {
      const x = getX(s);
      const strStrokeWidth = isCompact 
        ? (s === 0 || s === 1 ? 1.1 : 0.8) 
        : (s === 0 || s === 1 ? 1.8 : 1.2);
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + gridHeight}" stroke="${stringStroke}" stroke-width="${strStrokeWidth}" />`;
    }

    // Dynamic String name headers (omit in compact mode)
    if (!isCompact) {
      const NOTE_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const dynamicStringNames = [];
      for (let col = 0; col < 6; col++) {
        const stringIdx = 5 - col; // 0 = High E, 5 = Low E
        let name = '';
        if (Array.isArray(options.tuningNames) && options.tuningNames[stringIdx]) {
          name = options.tuningNames[stringIdx].replace(/[0-9]/g, '');
          if (stringIdx === 0) name = name.toLowerCase();
        } else if (Array.isArray(options.tuning) && typeof options.tuning[stringIdx] === 'number') {
          const letter = NOTE_LETTERS[options.tuning[stringIdx] % 12];
          name = stringIdx === 0 ? letter.toLowerCase() : letter;
        } else {
          const defaultNames = ['E', 'A', 'D', 'G', 'B', 'e'];
          name = defaultNames[col];
        }
        dynamicStringNames.push(name);
      }

      for (let col = 0; col < 6; col++) {
        const x = getX(col);
        svg += `<text x="${x}" y="${margin.top + gridHeight + 14}" fill="#71717a" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="600" text-anchor="middle">${dynamicStringNames[col]}</text>`;
      }
    }

    // Render Mini-Barres (behind note circles)
    shape.barres.forEach((barre) => {
      if (barre.fret < shape.minFret || barre.fret >= shape.minFret + shape.fretCount) return;
      const x1 = getX(barre.minCol);
      const x2 = getX(barre.maxCol);
      const y = getY(barre.fret);
      const radius = barreRadius;
      let fillColor, strokeColor;
      if (barre.active) {
        fillColor = 'rgba(0, 210, 106, 0.45)';
        strokeColor = '#00d26a';
      } else if (isLightTheme) {
        fillColor = 'rgba(30, 41, 59, 0.14)';
        strokeColor = '#475569';
      } else {
        fillColor = 'rgba(82, 82, 91, 0.55)';
        strokeColor = '#71717a';
      }

      svg += `<rect class="sfc-barre-capsule" x="${x1 - radius}" y="${y - radius}" width="${(x2 - x1) + radius * 2}" height="${radius * 2}" rx="${radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${isCompact ? 1.0 : 1.5}" />`;
      // Mini-barre label (omit in compact mode to preserve space)
      if (!isCompact && (barre.maxCol - barre.minCol >= 1)) {
        svg += `<text x="${(x1 + x2) / 2}" y="${y - 12}" fill="${strokeColor}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="bold" text-anchor="middle">barre</text>`;
      }
    });

    // Render Open Strings ('O')
    shape.openStrings.forEach((item) => {
      const x = getX(item.col);
      const y = margin.top - (isCompact ? (openRadius + 2) : 12);
      const color = item.active ? '#00d26a' : (isLightTheme ? '#475569' : '#a1a1aa');
      const oRad = openRadius;
      const strokeWidth = isCompact 
        ? (item.active ? 1.6 : 1.1)
        : (item.active ? 2.5 : 1.5);
      svg += `<circle cx="${x}" cy="${y}" r="${oRad}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
      if (item.active) {
        svg += `<circle cx="${x}" cy="${y}" r="${isCompact ? 1.4 : 2.5}" fill="#00d26a" />`;
      }
    });

    // Render Dead Strings ('X')
    shape.deadStrings.forEach((item) => {
      const x = getX(item.col);
      const y = margin.top - (isCompact ? (openRadius + 2) : 12);
      const deadFontSize = isCompact ? (fontSize + 1.2) : 12;
      svg += `<text x="${x}" y="${y + (isCompact ? 2.5 : 4)}" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${deadFontSize}" font-weight="bold" text-anchor="middle">×</text>`;
    });

    // Render Note Dots
    shape.notes.forEach((note) => {
      if (note.fret < shape.minFret || note.fret >= shape.minFret + shape.fretCount) return;
      const x = getX(note.col);
      const y = getY(note.fret);
      const isActive = note.activeOnBeats.length > 0;

      const cRadius = circleRadius;
      let circleFill, circleStroke, textFill, strokeDash;

      if (isActive) {
        // Outer glowing pulse ring
        svg += `<circle cx="${x}" cy="${y}" r="${cRadius + (isCompact ? 2.2 : 4)}" fill="rgba(0, 210, 106, 0.32)" />`;
        circleFill = '#00d26a';
        circleStroke = isLightTheme ? '#059669' : '#a7f3d0';
        textFill = '#09090b';
        strokeDash = '';
      } else if (isCompact && !isLightTheme) {
        // Inline diagrams on Songsterr's dark theme are read at a glance while playing:
        // solid light dot + dark finger number (mirror of the light theme's dark dots)
        circleFill = '#e4e4e7';
        circleStroke = '#f4f4f5';
        textFill = '#09090b';
        strokeDash = '';
      } else if (options.handFrameMode) {
        // Ghosted/hollow structural guide for sequence / melody notes
        circleFill = isLightTheme ? '#ffffff' : 'rgba(39, 39, 42, 0.65)';
        circleStroke = isLightTheme ? '#475569' : 'rgba(161, 161, 170, 0.65)';
        textFill = isLightTheme ? '#0f172a' : '#d4d4d8';
        strokeDash = isLightTheme ? '' : 'stroke-dasharray="2.5,1.5"';
      } else {
        // Solid simultaneous chord note
        circleFill = isLightTheme ? '#1e293b' : '#3f3f46';
        circleStroke = isLightTheme ? '#0f172a' : '#71717a';
        textFill = '#ffffff';
        strokeDash = '';
      }

      svg += `<circle cx="${x}" cy="${y}" r="${cRadius}" fill="${circleFill}" stroke="${circleStroke}" stroke-width="${isActive ? (isCompact ? 1.5 : 2) : (isCompact ? 1.1 : 1.2)}" ${strokeDash} />`;
      svg += `<text x="${x}" y="${y + (isCompact ? (cRadius * 0.42) : 3.5)}" fill="${textFill}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${fontSize}" font-weight="${isActive ? 'bold' : '700'}" text-anchor="middle">${note.finger}</text>`;
    });

    svg += `</svg>`;
    return svg;
  }

  /**
   * Render Hand-Frame Overview SVG for a sequence / melody measure
   * Shows the structural hand frame with ghosted note guides and active note highlight
   */
  function renderHandFrameSVG(segment, activeBeatNumber = null, options = {}) {
    return renderSVG(segment, activeBeatNumber, Object.assign({}, options, { handFrameMode: true, singleEventOnly: false }));
  }

  /**
   * Classify a measure into:
   * - 'sequence': predominantly single-note melodic events (riffs, scales)
   * - 'shape': single stable or highly similar simultaneous grip across events
   * - 'mixed': combination of melody and simultaneous chord events
   * - 'multi-shape': multiple materially different simultaneous grips within one measure
   */
  function classifyMeasure(measure) {
    if (!measure || !Array.isArray(measure.beats) || measure.beats.length === 0) {
      return { type: 'sequence', handSpan: null, fingerSequence: [], eventSteps: [], gripSignatures: [] };
    }

    const nonRestBeats = measure.beats.filter(b => 
      Array.isArray(b.notes) && b.notes.some(n => !n.isRest && n.fret >= 0)
    );

    if (nonRestBeats.length === 0) {
      return { type: 'sequence', handSpan: null, fingerSequence: [], eventSteps: [], gripSignatures: [] };
    }

    const frettedCounts = nonRestBeats.map(b => 
      b.notes.filter(n => !n.isRest && !n.isDead && n.fret > 0).length
    );

    const hasSimultaneous = frettedCounts.some(count => count >= 2);
    const allSimultaneous = frettedCounts.every(count => count >= 2);

    const frets = [];
    const fingerSequence = [];
    const eventSteps = [];

    nonRestBeats.forEach(b => {
      const activeNotes = b.notes.filter(n => !n.isRest && !n.isDead && n.fret >= 0);
      const evIdx = b.eventIndex || b.beatNumber;
      if (activeNotes.length > 0) {
        eventSteps.push({
          eventIndex: evIdx,
          timing: b.timing || '',
          notes: activeNotes.map(n => ({
            string: n.string,
            fret: n.fret,
            finger: n.recommendedFinger ?? n.finger ?? (n.fret === 0 ? 0 : 1),
            pitch: n.pitch || ''
          }))
        });
      }

      activeNotes.forEach(n => {
        if (n.fret > 0) frets.push(n.fret);
        const f = n.recommendedFinger ?? n.finger;
        if (f !== undefined && f !== null && f > 0) {
          fingerSequence.push(f);
        }
      });
    });

    const minFret = frets.length > 0 ? Math.min(...frets) : (measure.recommendedPosition || 1);
    const maxFret = frets.length > 0 ? Math.max(...frets) : minFret;
    const handSpan = { minFret, maxFret, text: `Hand ${minFret}–${maxFret}` };

    if (!hasSimultaneous) {
      return {
        type: 'sequence',
        handSpan,
        fingerSequence,
        eventSteps,
        gripSignatures: []
      };
    }

    const gripSignatures = new Set();
    nonRestBeats.forEach(b => {
      const fNotes = b.notes.filter(n => !n.isRest && !n.isDead && n.fret > 0);
      if (fNotes.length >= 2) {
        const sig = fNotes.map(n => `s${n.string}:f${n.fret}`).sort().join('|');
        gripSignatures.add(sig);
      }
    });

    if (allSimultaneous) {
      if (gripSignatures.size <= 1) {
        return { type: 'shape', handSpan, fingerSequence, eventSteps, gripSignatures: Array.from(gripSignatures) };
      } else {
        return { type: 'multi-shape', handSpan, fingerSequence, eventSteps, gripSignatures: Array.from(gripSignatures) };
      }
    }

    return {
      type: 'mixed',
      handSpan,
      fingerSequence,
      eventSteps,
      gripSignatures: Array.from(gripSignatures)
    };
  }

  return {
    stringToCol,
    splitMeasureIntoSegments,
    aggregateSegmentShape,
    renderSVG,
    renderHandFrameSVG,
    classifyMeasure
  };
});
