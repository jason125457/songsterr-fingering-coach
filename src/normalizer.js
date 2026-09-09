/**
 * normalizer.js
 * 
 * Transforms raw tab representations (Songsterr JSON, fixtures, or other formats)
 * into a strictly decoupled, unified "Normalized Tab Data" format.
 * 
 * Normalized Tab Data Schema:
 * {
 *   song: { title: string, artist: string, songId: number|string },
 *   track: { name: string, instrument: string, tuning: number[] },
 *   measures: [
 *     {
 *       measureNumber: number, // 1-indexed
 *       timeSignature: string, // e.g. "4/4"
 *       marker: string|null,
 *       beats: [
 *         {
 *           beatNumber: number, // 1-indexed
 *           timing: string,     // e.g. "1/4", "1/8"
 *           notes: [
 *             {
 *               string: number,   // 0-5 (0 = High E, 5 = Low E)
 *               fret: number,     // 0 = open, 1-24 = frets
 *               isRest: boolean,
 *               isTie?: boolean,
 *               isSlide?: boolean
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TabNormalizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40]; // Standard guitar: E4, B3, G3, D3, A2, E2

  /**
   * Normalize from raw Songsterr part JSON (as fetched from CloudFront CDN)
   */
  function normalizeSongsterrPart(rawPartData, meta = {}) {
    if (!rawPartData || !Array.isArray(rawPartData.measures)) {
      throw new Error('Invalid Songsterr part data: missing measures array');
    }

    const song = {
      title: meta.title || rawPartData.songTitle || 'Unknown Title',
      artist: meta.artist || rawPartData.artistName || 'Unknown Artist',
      songId: meta.songId || rawPartData.songId || 0
    };

    const track = {
      partId: meta.partId ?? rawPartData.partId ?? 0,
      name: meta.trackName || rawPartData.name || 'Guitar',
      instrument: meta.instrument || rawPartData.instrument || 'Guitar',
      tuning: rawPartData.tuning || meta.tuning || DEFAULT_TUNING
    };

    let currentSignature = '4/4';

    const measures = rawPartData.measures.map((measure, mIdx) => {
      const measureNumber = mIdx + 1;
      if (measure.signature && Array.isArray(measure.signature)) {
        currentSignature = `${measure.signature[0]}/${measure.signature[1]}`;
      }

      const beats = [];
      let beatCounter = 1;

      if (Array.isArray(measure.voices)) {
        // Collect all beats across voices (Voice 0 is primary melody/rhythm)
        measure.voices.forEach((voice) => {
          if (!Array.isArray(voice.beats)) return;

          voice.beats.forEach((b) => {
            const beatNumber = beatCounter++;
            const timing = b.duration 
              ? `${b.duration[0]}/${b.duration[1]}` 
              : (b.type ? `1/${b.type}` : '1/4');

            const rawNotes = Array.isArray(b.notes) ? b.notes : [];
            const notes = [];

            if (b.rest || rawNotes.length === 0 || rawNotes.every(n => n.rest)) {
              notes.push({
                string: -1,
                fret: -1,
                isRest: true
              });
            } else {
              rawNotes.forEach((n) => {
                if (n.rest) {
                  notes.push({
                    string: -1,
                    fret: -1,
                    isRest: true
                  });
                } else if (n.string !== undefined && n.fret !== undefined) {
                  const noteObj = {
                    string: n.string,
                    fret: n.fret,
                    isRest: false
                  };
                  if (n.tie) noteObj.isTie = true;
                  if (n.slide || n.slideType) noteObj.isSlide = true;
                  notes.push(noteObj);
                }
              });
            }

            // Keep simultaneous notes together under the same beat
            beats.push({
              beatNumber,
              timing,
              notes
            });
          });
        });
      }

      return {
        measureNumber,
        timeSignature: currentSignature,
        marker: measure.marker?.text || null,
        beats
      };
    });

    return {
      song,
      track,
      measures
    };
  }

  /**
   * Normalize from Phase 1 sample_output.json fixture format
   */
  function normalizeFromSampleFixture(fixtureItem) {
    if (!fixtureItem || !fixtureItem.first5Measures) {
      throw new Error('Invalid fixture item format');
    }

    const song = {
      title: fixtureItem.song?.title || 'Unknown Title',
      artist: fixtureItem.song?.artist || 'Unknown Artist',
      songId: fixtureItem.song?.songId || 0
    };

    const track = {
      partId: fixtureItem.track?.partId ?? 0,
      name: fixtureItem.track?.name || 'Guitar',
      instrument: fixtureItem.track?.instrument || 'Guitar',
      tuning: fixtureItem.track?.tuningMidi || fixtureItem.track?.tuning || DEFAULT_TUNING
    };

    const measures = fixtureItem.first5Measures.map((m) => {
      // Group notes by beatNumber
      const beatMap = new Map();

      m.notes.forEach((n) => {
        const beatNum = n.beatNumber || 1;
        if (!beatMap.has(beatNum)) {
          beatMap.set(beatNum, {
            beatNumber: beatNum,
            timing: n.timing || n.duration || '1/4',
            notes: []
          });
        }
        const beatObj = beatMap.get(beatNum);
        if (n.isRest) {
          beatObj.notes.push({ string: -1, fret: -1, isRest: true });
        } else {
          const noteObj = {
            string: n.stringIndex ?? n.string,
            fret: n.fret,
            isRest: false
          };
          if (n.isTie) noteObj.isTie = true;
          if (n.isSlide) noteObj.isSlide = true;
          beatObj.notes.push(noteObj);
        }
      });

      return {
        measureNumber: m.measureNumber,
        timeSignature: m.timeSignature || '4/4',
        marker: m.marker || null,
        beats: Array.from(beatMap.values())
      };
    });

    return {
      song,
      track,
      measures
    };
  }

  /**
   * Build synthetic normalized data for unit tests
   */
  function createSyntheticData(measureSpecs, tuning = DEFAULT_TUNING) {
    let measureCounter = 1;
    const measures = measureSpecs.map((spec) => {
      const measureNum = spec.measureNumber || measureCounter++;
      let beatCounter = 1;
      const beats = spec.beats.map((b) => {
        const beatNum = b.beatNumber || beatCounter++;
        const notes = b.notes.map((n) => ({
          string: n.string !== undefined ? n.string : 2, // default string 2 (G)
          fret: n.fret,
          isRest: n.fret === -1 || !!n.isRest,
          isTie: !!n.isTie,
          isSlide: !!n.isSlide
        }));
        return {
          beatNumber: beatNum,
          timing: b.timing || '1/4',
          notes
        };
      });

      return {
        measureNumber: measureNum,
        timeSignature: spec.timeSignature || '4/4',
        marker: spec.marker || null,
        beats
      };
    });

    return {
      song: { title: 'Synthetic Test', artist: 'Test Artist', songId: 999 },
      track: { name: 'Test Guitar', instrument: 'Electric Guitar', tuning },
      measures
    };
  }

  return {
    normalizeSongsterrPart,
    normalizeFromSampleFixture,
    createSyntheticData,
    DEFAULT_TUNING
  };
});
