/**
 * Songsterr Fingering Coach - Content Script
 * 
 * Pipeline:
 * Songsterr State & CDN Ingestion
 *   -> Full Normalized Track (TabNormalizer)
 *   -> Decoupled Left-Hand Fingering Engine (Viterbi DP)
 *   -> Session Result Cache (songId-revisionId-partId)
 *   -> Floating Fingering Coach UI Panel (CoachPanel + ShapeDiagram)
 */

(function () {
  'use strict';

  const CDN_HOSTS = ['dqsljvtekg760', 'd34shlm8p2ums2', 'd3cqchs6g3b5ew'];
  const CDN_STAGE_HOST = 'd3d3l6a6rcgkaf';
  const CDN_LEGACY_HOSTS = ['d3rrfvx08uyjp1', 'dodkcbujl0ebx', 'dj1usja78sinh'];

  // MIDI pitch to Note Name helper (64 = E4, 59 = B3, 55 = G3, 50 = D3, 45 = A2, 40 = E2)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function midiToNoteName(midi) {
    if (typeof midi !== 'number') return '?';
    const note = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;
  }

  let lastProcessedKey = '';
  let lastExtractedData = null;
  let lastFingeringResult = null;
  let currentCoachPanel = null;

  // Session cache to prevent redundant recalculation across track switches or re-renders
  const fingeringCache = new Map(); // key: `${songId}-${revisionId}-${partId}` -> FingeringResult

  /**
   * Build the CloudFront CDN URL using Songsterr's internal routing logic
   */
  function buildPartUrl(songId, revisionId, image, partId, attempt = 0) {
    if (image && image.endsWith('-stage')) {
      return `https://${CDN_STAGE_HOST}.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
    }
    if (image) {
      const host = CDN_HOSTS[attempt % CDN_HOSTS.length];
      return `https://${host}.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
    }
    const legacyHost = CDN_LEGACY_HOSTS[attempt % CDN_LEGACY_HOSTS.length];
    return `https://${legacyHost}.cloudfront.net/part/${revisionId}/${partId}`;
  }

  /**
   * Parse measure and beat note structure into clean JSON format (Phase 1 summary)
   */
  function parseMeasures(measures, tuning, maxMeasures = 5) {
    const result = [];
    const measuresToProcess = typeof maxMeasures === 'number' && maxMeasures > 0 
      ? measures.slice(0, maxMeasures) 
      : measures;

    measuresToProcess.forEach((measure, mIdx) => {
      const measureNumber = mIdx + 1;
      const timeSignature = measure.signature ? `${measure.signature[0]}/${measure.signature[1]}` : '4/4';
      const marker = measure.marker?.text || null;
      const notesList = [];

      if (measure.voices) {
        measure.voices.forEach((voice) => {
          if (!voice.beats) return;
          voice.beats.forEach((beat, bIdx) => {
            const beatNumber = bIdx + 1;
            const duration = beat.duration 
              ? `${beat.duration[0]}/${beat.duration[1]}` 
              : (beat.type ? `1/${beat.type}` : 'unknown');

            if (beat.notes && beat.notes.length > 0) {
              beat.notes.forEach((note) => {
                if (note.rest) {
                  notesList.push({
                    measureNumber,
                    beatNumber,
                    timing: duration,
                    isRest: true
                  });
                } else if (note.fret !== undefined && note.string !== undefined) {
                  const stringIndex = note.string; // 0-indexed
                  const stringNumber = note.string + 1; // 1-indexed (1 = High E, 6 = Low E)
                  const baseMidi = Array.isArray(tuning) && tuning[stringIndex] !== undefined 
                    ? tuning[stringIndex] 
                    : null;
                  const openStringName = baseMidi !== null ? midiToNoteName(baseMidi) : `Str ${stringNumber}`;
                  const notePitch = baseMidi !== null ? midiToNoteName(baseMidi + note.fret) : null;

                  notesList.push({
                    measureNumber,
                    beatNumber,
                    timing: duration,
                    stringIndex: stringIndex,
                    stringNumber: stringNumber,
                    openString: openStringName,
                    fret: note.fret,
                    pitch: notePitch,
                    isTie: !!note.tie,
                    isRest: false
                  });
                }
              });
            }
          });
        });
      }

      result.push({
        measureNumber,
        timeSignature,
        marker,
        notesCount: notesList.filter(n => !n.isRest).length,
        notes: notesList
      });
    });

    return result;
  }

  /**
   * Main extraction and fingering analysis flow
   */
  async function extractTabNotes(targetPartId = null) {
    const stateElement = document.getElementById('state');
    if (!stateElement) {
      console.warn('[Songsterr Fingering Coach] No <script id="state"> element found on this page.');
      return null;
    }

    let state;
    try {
      state = JSON.parse(stateElement.textContent);
    } catch (err) {
      console.error('[Songsterr Fingering Coach] Failed to parse page state JSON:', err);
      return null;
    }

    const meta = state.meta?.current || state.meta;
    if (!meta || !meta.songId) {
      console.warn('[Songsterr Fingering Coach] Meta or songId not found in state.');
      return null;
    }

    const songId = meta.songId;
    const revisionId = meta.revisionId || meta.latestRevisionId;
    const image = meta.image;
    const title = meta.title || 'Unknown Title';
    const artist = meta.artist || 'Unknown Artist';
    const tracks = meta.tracks || [];

    // Determine which track is currently selected
    let partId = targetPartId;
    if (partId === null || partId === undefined) {
      partId = state.routeContent?.params?.partId ?? 
               state.route?.params?.partId ?? 
               state.part?.partId ?? 
               state.meta?.partId ?? 
               meta.defaultTrack ?? 
               0;
    }

    // Find track details
    const trackIndex = tracks.findIndex(t => (t.partId ?? -1) === partId);
    const track = trackIndex !== -1 ? tracks[trackIndex] : (tracks[partId] || tracks[0]);
    const actualPartId = track?.partId ?? partId;

    const cacheKey = `${songId}-${revisionId}-${actualPartId}`;
    if (targetPartId === null && cacheKey === lastProcessedKey && lastFingeringResult) {
      return { extractedOutput: lastExtractedData, fingeringResult: lastFingeringResult };
    }

    const partUrl = buildPartUrl(songId, revisionId, image, actualPartId);

    console.log(
      `%c🎸 [Songsterr Fingering Coach] Ingesting tab: "${title}" by ${artist} (Track: ${track?.name || actualPartId})`,
      'color: #00d26a; font-weight: bold; font-size: 13px;'
    );
    console.log(`[Songsterr Fingering Coach] Fetching structured notes from: ${partUrl}`);

    let partData;
    try {
      const response = await fetch(partUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      partData = await response.json();
    } catch (fetchErr) {
      console.error('[Songsterr Fingering Coach] Failed to fetch part JSON from CDN:', fetchErr);
      return null;
    }

    if (!partData.measures || !Array.isArray(partData.measures)) {
      console.warn('[Songsterr Fingering Coach] No measures array in retrieved part JSON.');
      return null;
    }

    const tuning = partData.tuning || track?.tuning || [64, 59, 55, 50, 45, 40];
    const first5Measures = parseMeasures(partData.measures, tuning, 5);

    const extractedOutput = {
      song: {
        songId,
        revisionId,
        title,
        artist
      },
      track: {
        partId: actualPartId,
        name: track?.name || partData.name || 'Unknown Track',
        instrument: track?.instrument || partData.instrument || 'Guitar',
        tuningMidi: tuning,
        tuningNames: tuning.map(midiToNoteName),
        totalMeasures: partData.measures.length
      },
      first5Measures: first5Measures
    };

    lastProcessedKey = cacheKey;
    lastExtractedData = extractedOutput;

    // Output formatted JSON to Browser Console (Phase 1 sample preview)
    console.group(`%c🎸 [Songsterr Fingering Coach] Ingested Metadata: ${title} - ${artist} (${partData.measures.length} measures)`, 'color: #3b82f6; font-weight: bold;');
    console.log('Track Summary:', extractedOutput.track);
    console.groupEnd();

    // Check Fingering Cache
    let fingeringResult = null;
    if (fingeringCache.has(cacheKey)) {
      console.log(`%c⚡ [Songsterr Fingering Coach] Loaded fingering analysis from session cache (${cacheKey})`, 'color: #06b6d4;');
      fingeringResult = fingeringCache.get(cacheKey);
    } else if (typeof TabNormalizer !== 'undefined' && typeof FingeringEngine !== 'undefined') {
      try {
        const startTime = performance.now();

        // 1. Normalize full track data
        const normalizedTrack = TabNormalizer.normalizeSongsterrPart(partData, {
          title,
          artist,
          songId,
          partId: actualPartId,
          trackName: track?.name || partData.name,
          instrument: track?.instrument || partData.instrument,
          tuning
        });

        // 2. Run Left-Hand Fingering Engine across all measures
        fingeringResult = FingeringEngine.analyzeTab(normalizedTrack);

        const endTime = performance.now();
        const durationMs = (endTime - startTime).toFixed(2);

        // Store in session cache
        fingeringCache.set(cacheKey, fingeringResult);

        console.log(
          `%c⏱️ [Songsterr Fingering Coach] Full track fingering analysis for ${normalizedTrack.measures.length} measures completed in ${durationMs}ms (Non-blocking)`,
          'color: #10b981; font-weight: bold;'
        );

        // Print human-readable debug format
        if (typeof FingeringFormatter !== 'undefined') {
          console.group(`%c🖐️ [Songsterr Fingering Coach] Recommended Left-Hand Fingerings Summary: ${title}`, 'color: #10b981; font-weight: bold;');
          console.log(FingeringFormatter.formatConsoleDebug(fingeringResult));
          console.groupEnd();
        }
      } catch (fErr) {
        console.error('[Songsterr Fingering Coach] Fingering Engine error:', fErr);
      }
    }

    lastFingeringResult = fingeringResult;

    // Mount or update Floating Coach Panel UI
    if (fingeringResult && typeof CoachPanel !== 'undefined') {
      try {
        if (currentCoachPanel) {
          currentCoachPanel.destroy();
        }
        currentCoachPanel = new CoachPanel(fingeringResult, { initialMeasure: 1 });
        console.log('%c🎨 [Songsterr Fingering Coach] Coach Panel UI successfully mounted to page', 'color: #8b5cf6; font-weight: bold;');
      } catch (uiErr) {
        console.error('[Songsterr Fingering Coach] Failed to initialize Coach Panel UI:', uiErr);
      }
    }

    // Phase 3.1A: Initialize PlaybackObserver in debug mode (logging to console, no CoachPanel manipulation)
    if (typeof PlaybackObserver !== 'undefined' && !currentPlaybackObserver) {
      try {
        currentPlaybackObserver = new PlaybackObserver({ debugLog: true });
        currentPlaybackObserver.start();
      } catch (obsErr) {
        console.error('[Songsterr Fingering Coach] Failed to start PlaybackObserver:', obsErr);
      }
    }

    return { extractedOutput, fingeringResult, coachPanel: currentCoachPanel, playbackObserver: currentPlaybackObserver };
  }

  let currentPlaybackObserver = null;

  // Expose global debug object on window for developer testing
  window.__SONGSTERR_FINGERING_COACH__ = {
    extract: () => extractTabNotes(),
    extractTrack: (partId) => extractTabNotes(partId),
    getLastExtracted: () => lastExtractedData,
    getLastFingeringResult: () => lastFingeringResult,
    getCoachPanel: () => currentCoachPanel,
    getPlaybackObserver: () => currentPlaybackObserver,
    getPlaybackMapper: () => (typeof PlaybackMapper !== 'undefined' ? PlaybackMapper : null),
    getCache: () => fingeringCache,
    getRawState: () => {
      try {
        return JSON.parse(document.getElementById('state')?.textContent || '{}');
      } catch (e) {
        return null;
      }
    }
  };

  // Run on initial page load with a short delay to ensure DOM is fully ready
  function init() {
    if (location.pathname.includes('/a/wsa/')) {
      setTimeout(() => {
        extractTabNotes().catch(console.error);
      }, 500);
    }
  }

  // Observe URL / SPA navigation changes
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.pathname.includes('/a/wsa/')) {
        setTimeout(() => {
          extractTabNotes().catch(console.error);
        }, 800);
      }
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  window.addEventListener('popstate', () => {
    if (location.pathname.includes('/a/wsa/')) {
      setTimeout(() => {
        extractTabNotes().catch(console.error);
      }, 800);
    }
  });

  init();
})();
