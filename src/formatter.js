/**
 * formatter.js
 * 
 * Formats FingeringEngine analysis results into:
 * 1. Clean human-readable console debug blocks (as specified in requirements)
 * 2. Visual table rows for console.table
 * 3. Structured machine-readable JSON
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FingeringFormatter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Format human-readable console debug output matching user's exact specification:
   * 
   * Measure 3
   * Position: 7
   * 
   * G7 → 1
   * G9 → 3
   * B8 → 2
   * G7 → 1
   * 
   * Position shift: false
   */
  function formatConsoleDebug(analysisResult) {
    if (!analysisResult || !Array.isArray(analysisResult.measures)) {
      return '';
    }

    const lines = [];
    lines.push(`=======================================================`);
    lines.push(`🎸 Fingering Coach Analysis: ${analysisResult.song.title} - ${analysisResult.song.artist}`);
    lines.push(`Track: ${analysisResult.track.name} (${analysisResult.track.instrument})`);
    lines.push(`=======================================================\n`);

    analysisResult.measures.forEach((measure) => {
      lines.push(`Measure ${measure.measureNumber}${measure.marker ? ` (${measure.marker})` : ''}`);
      lines.push(`Position: ${measure.recommendedPosition}\n`);

      const noteLines = [];
      measure.beats.forEach((b) => {
        const activeNotes = b.notes.filter(n => !n.isRest);
        if (activeNotes.length === 0) return;

        if (activeNotes.length === 1) {
          const n = activeNotes[0];
          const fingerStr = n.fret === 0 ? '0 (Open)' : `${n.recommendedFinger}`;
          noteLines.push(`${n.stringName}${n.fret} → ${fingerStr}`);
        } else {
          // Simultaneous notes in the same beat (chord / double stop)
          const notesStr = activeNotes.map(n => `${n.stringName}${n.fret}`).join(' + ');
          const fingersStr = activeNotes.map(n => n.fret === 0 ? '0' : `${n.recommendedFinger}`).join(' + ');
          noteLines.push(`${notesStr} → [${fingersStr}]`);
        }
      });

      if (noteLines.length > 0) {
        lines.push(noteLines.join('\n'));
      } else {
        lines.push(`(Rest / No fretted notes)`);
      }

      lines.push(`\nPosition shift: ${measure.isPositionShift}\n`);
      lines.push(`-------------------------------------------------------\n`);
    });

    return lines.join('\n');
  }

  /**
   * Format note rows for console.table
   */
  function formatTableRows(analysisResult) {
    if (!analysisResult || !Array.isArray(analysisResult.measures)) return [];

    const rows = [];
    analysisResult.measures.forEach((m) => {
      m.beats.forEach((b) => {
        b.notes.forEach((n) => {
          if (!n.isRest) {
            rows.push({
              'Measure': m.measureNumber,
              'Beat': b.beatNumber,
              'Timing': b.timing,
              'String': `${n.stringName} (Str ${n.string + 1})`,
              'Fret': n.fret,
              'Finger': n.fret === 0 ? '0 (Open)' : n.recommendedFinger,
              'Position': n.recommendedPosition,
              'Shift': n.isPositionShift ? '⚡ Shift' : '—',
              'Pitch': n.pitch || '-'
            });
          }
        });
      });
    });

    return rows;
  }

  /**
   * Format cost breakdown for a beat
   */
  function formatCostBreakdown(costBreakdown) {
    if (!costBreakdown) return 'No breakdown available';
    const lines = [];
    lines.push(`Position ${costBreakdown.position}`);
    lines.push(`movementCost: ${costBreakdown.movementCost ?? 0}`);
    lines.push(`stretchCost: ${costBreakdown.stretchCost ?? 0}`);
    lines.push(`phraseBoundaryBonus: ${costBreakdown.phraseBoundaryBonus ?? 0}`);
    lines.push(`repeatedPatternBonus: ${costBreakdown.repeatedPatternBonus ?? 0}`);
    lines.push(`shapeCost: ${costBreakdown.shapeCost ?? 0}`);
    lines.push(`openWindowBonus: ${costBreakdown.openWindowBonus ?? 0}`);
    lines.push(`total: ${costBreakdown.total ?? 0}`);
    return lines.join('\n');
  }

  return {
    formatConsoleDebug,
    formatTableRows,
    formatCostBreakdown
  };
});
