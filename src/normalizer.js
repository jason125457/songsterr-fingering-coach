/**
 * normalizer.js
 * 
 * Transforms raw tab representations (Songsterr JSON, fixtures, or other formats)
 * into a strictly decoupled, unified "Normalized Tab Data" format.
 * 
 * Canonical Multi-Voice Timeline Features:
 * - Rational fraction arithmetic ({ num, den }) to prevent floating-point drift.
 * - Independent cumulative time offset tracking per voice.
 * - Same-time simultaneous notes across multiple voices are aggregated into a single Canonical Event.
 * - Preserves source origin: event.sources = [{ voiceIndex, beatIndex, duration, isRest }] and note.source = { voiceIndex, beatIndex }.
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
 *       beats: [ // Canonical Events ordered chronologically
 *         {
 *           eventIndex: number, // 1-indexed rhythm event order
 *           beatNumber: number, // alias for eventIndex (backward compatibility)
 *           timing: string,     // e.g. "1/4", "1/8", "1/12"
 *           timeOffset: { num: number, den: number, text: string, value: number },
 *           sources: [ { voiceIndex: number, beatIndex: number, duration: object, isRest: boolean } ],
 *           notes: [
 *             {
 *               string: number,   // 0-5 (0 = High E, 5 = Low E)
 *               fret: number,     // 0 = open, 1-24 = frets
 *               isRest: boolean,
 *               isTie?: boolean,
 *               isSlide?: boolean,
 *               source: { voiceIndex: number, beatIndex: number }
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
   * Greatest Common Divisor for exact rational fraction arithmetic
   */
  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  }

  /**
   * Simplify fraction to irreducible form
   */
  function simplifyFraction(f) {
    if (!f || f.num === 0) return { num: 0, den: 1, text: '0/1', value: 0 };
    const g = gcd(f.num, f.den);
    const num = f.num / g;
    const den = f.den / g;
    return { num, den, text: `${num}/${den}`, value: num / den };
  }

  /**
   * Add two rational fractions: a/b + c/d
   */
  function addFractions(f1, f2) {
    return simplifyFraction({
      num: f1.num * f2.den + f2.num * f1.den,
      den: f1.den * f2.den
    });
  }

  /**
   * Parse beat duration into rational fraction
   */
  function parseDurationFraction(beat) {
    if (Array.isArray(beat.duration) && beat.duration.length >= 2) {
      return simplifyFraction({ num: beat.duration[0], den: beat.duration[1] });
    }
    if (typeof beat.type === 'number' && beat.type > 0) {
      return simplifyFraction({ num: 1, den: beat.type });
    }
    return { num: 1, den: 4, text: '1/4', value: 0.25 };
  }

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

      // Group beats across all voices by rational timeOffset
      const timeOffsetBuckets = new Map(); // key: rational value key (e.g. "0/1", "1/12")

      if (Array.isArray(measure.voices)) {
        measure.voices.forEach((voice, vIdx) => {
          if (!Array.isArray(voice.beats)) return;

          let voiceOffset = { num: 0, den: 1, text: '0/1', value: 0 };

          voice.beats.forEach((b, bIdx) => {
            const duration = parseDurationFraction(b);
            const offsetKey = `${voiceOffset.num}/${voiceOffset.den}`;

            if (!timeOffsetBuckets.has(offsetKey)) {
              timeOffsetBuckets.set(offsetKey, {
                timeOffset: Object.assign({}, voiceOffset),
                sources: [],
                notes: []
              });
            }

            const bucket = timeOffsetBuckets.get(offsetKey);
            const rawNotes = Array.isArray(b.notes) ? b.notes : [];
            const isRest = b.rest || rawNotes.length === 0 || rawNotes.every(n => n.rest);

            bucket.sources.push({
              voiceIndex: vIdx,
              beatIndex: bIdx,
              duration,
              isRest
            });

            if (isRest) {
              bucket.notes.push({
                string: -1,
                fret: -1,
                isRest: true,
                source: { voiceIndex: vIdx, beatIndex: bIdx }
              });
            } else {
              rawNotes.forEach((n) => {
                if (n.rest) {
                  bucket.notes.push({
                    string: -1,
                    fret: -1,
                    isRest: true,
                    source: { voiceIndex: vIdx, beatIndex: bIdx }
                  });
                } else if (n.string !== undefined && n.fret !== undefined) {
                  const noteObj = {
                    string: n.string,
                    fret: n.fret,
                    isRest: false,
                    source: { voiceIndex: vIdx, beatIndex: bIdx }
                  };
                  if (n.tie) noteObj.isTie = true;
                  if (n.slide || n.slideType) noteObj.isSlide = true;
                  bucket.notes.push(noteObj);
                }
              });
            }

            // Accumulate voice time offset with rational fraction addition
            voiceOffset = addFractions(voiceOffset, duration);
          });
        });
      }

      // Sort buckets chronologically by exact rational timeOffset value
      const sortedBuckets = Array.from(timeOffsetBuckets.values()).sort((a, b) => a.timeOffset.value - b.timeOffset.value);

      // Build canonical events
      const beats = sortedBuckets.map((bucket, idx) => {
        const eventIndex = idx + 1;

        // If there are real non-rest notes, filter out redundant rest notes from other voices at this same instant
        let notes = bucket.notes;
        const realNotes = notes.filter(n => !n.isRest && n.string >= 0);
        if (realNotes.length > 0) {
          notes = realNotes;
        } else if (notes.length === 0) {
          notes = [{ string: -1, fret: -1, isRest: true, source: { voiceIndex: 0, beatIndex: 0 } }];
        } else {
          // Keep only one rest note if all voices rested at this moment
          notes = [notes[0]];
        }

        // Determine timing display string (prefer primary non-rest voice or shortest duration)
        const primarySource = bucket.sources.find(s => !s.isRest) || bucket.sources[0];
        const timing = primarySource ? primarySource.duration.text : '1/4';

        return {
          eventIndex,
          beatNumber: eventIndex, // Alias for backward compatibility with FingeringEngine
          timing,
          timeOffset: bucket.timeOffset,
          sources: bucket.sources,
          notes
        };
      });

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
            eventIndex: beatNum,
            beatNumber: beatNum,
            timing: n.timing || n.duration || '1/4',
            timeOffset: { num: beatNum - 1, den: 4, text: `${beatNum - 1}/4`, value: (beatNum - 1) / 4 },
            sources: [{ voiceIndex: 0, beatIndex: beatNum - 1, isRest: !!n.isRest }],
            notes: []
          });
        }
        const beatObj = beatMap.get(beatNum);
        if (n.isRest) {
          beatObj.notes.push({ string: -1, fret: -1, isRest: true, source: { voiceIndex: 0, beatIndex: beatNum - 1 } });
        } else {
          const noteObj = {
            string: n.stringIndex ?? n.string,
            fret: n.fret,
            isRest: false,
            source: { voiceIndex: 0, beatIndex: beatNum - 1 }
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
          isSlide: !!n.isSlide,
          source: { voiceIndex: 0, beatIndex: beatNum - 1 }
        }));
        return {
          eventIndex: beatNum,
          beatNumber: beatNum,
          timing: b.timing || '1/4',
          timeOffset: { num: beatNum - 1, den: 4, text: `${beatNum - 1}/4`, value: (beatNum - 1) / 4 },
          sources: [{ voiceIndex: 0, beatIndex: beatNum - 1, isRest: notes.every(n => n.isRest) }],
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
    gcd,
    simplifyFraction,
    addFractions,
    DEFAULT_TUNING
  };
});
