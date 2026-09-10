/**
 * playback_mapper.js
 * 
 * Standalone adapter to map Songsterr Playback Events to Canonical Normalized Events.
 * 
 * Responsibilities:
 * - Maps (measureNumber, voiceIndex, beatIndex) from Songsterr DOM/player to the exact Canonical Event
 * - Supports fractional time-offset fallback mapping for continuous playhead tracking
 * - Strictly DECOUPLED: Does NOT depend on CoachPanel or UI DOM
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PlaybackMapper = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Map a Songsterr playback event to the corresponding canonical event in normalized track data.
   * 
   * @param {Object} playbackEvent
   * @param {number} [playbackEvent.measureNumber] 1-indexed measure
   * @param {number} [playbackEvent.measureIndex] 0-indexed measure
   * @param {number} [playbackEvent.voiceIndex] 0-indexed voice in Songsterr JSON
   * @param {number} [playbackEvent.beatIndex] 0-indexed beat within voice
   * @param {number} [playbackEvent.positionInMeasure] 0.0 - 1.0 progress
   * @param {string} [playbackEvent.confidence] 'exact' | 'measure-only'
   * @param {Object} normalizedTrack The normalized track object with measures array
   * @returns {Object|null}
   */
  function mapPlaybackEventToCanonical(playbackEvent, normalizedTrack) {
    if (!playbackEvent || !normalizedTrack || !Array.isArray(normalizedTrack.measures)) {
      return null;
    }

    const mNum = playbackEvent.measureNumber || 
                 (typeof playbackEvent.measureIndex === 'number' ? playbackEvent.measureIndex + 1 : null);

    if (!mNum || mNum < 1 || mNum > normalizedTrack.measures.length) {
      return null;
    }

    const measure = normalizedTrack.measures[mNum - 1];
    if (!measure || !Array.isArray(measure.beats) || measure.beats.length === 0) {
      return null;
    }

    // Strategy 1: Source Identity Match (exact voiceIndex + beatIndex)
    const vIdx = typeof playbackEvent.voiceIndex === 'number' ? playbackEvent.voiceIndex : 0;
    const bIdx = typeof playbackEvent.beatIndex === 'number'
      ? playbackEvent.beatIndex
      : (typeof playbackEvent.eventIndex === 'number' ? playbackEvent.eventIndex - 1 : null);

    if (bIdx !== null) {
      const match = measure.beats.find(b => 
        Array.isArray(b.sources) && 
        b.sources.some(s => s.voiceIndex === vIdx && s.beatIndex === bIdx)
      );

      if (match) {
        return {
          measureNumber: mNum,
          eventIndex: match.eventIndex || match.beatNumber,
          canonicalEvent: match,
          confidence: 'exact',
          mappingStrategy: 'source-identity'
        };
      }
    }

    // Strategy 2: Temporal Position in Measure Match (timeOffset)
    if (typeof playbackEvent.positionInMeasure === 'number') {
      const targetPos = Math.max(0, Math.min(1, playbackEvent.positionInMeasure));

      // Calculate measure total duration in whole notes from timeSignature (e.g. 3/4 = 0.75, 4/4 = 1.0)
      let measureDuration = 1.0;
      if (measure.timeSignature && typeof measure.timeSignature === 'string') {
        const parts = measure.timeSignature.split('/').map(s => parseInt(s.trim(), 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] > 0) {
          measureDuration = parts[0] / parts[1];
        }
      }

      let bestEvent = measure.beats[0];
      for (let i = 0; i < measure.beats.length; i++) {
        const b = measure.beats[i];
        const progress = (b.timeOffset?.value ?? ((i) / measure.beats.length)) / measureDuration;
        if (progress <= targetPos) {
          bestEvent = b;
        } else {
          break;
        }
      }

      return {
        measureNumber: mNum,
        eventIndex: bestEvent.eventIndex || bestEvent.beatNumber,
        canonicalEvent: bestEvent,
        confidence: playbackEvent.confidence === 'measure-only' ? 'measure-only' : 'approximate',
        mappingStrategy: 'time-offset'
      };
    }

    // Strategy 3: Fallback to First Event of Measure
    return {
      measureNumber: mNum,
      eventIndex: 1,
      canonicalEvent: measure.beats[0],
      confidence: 'measure-only',
      mappingStrategy: 'measure-fallback'
    };
  }

  return {
    mapPlaybackEventToCanonical
  };
});
