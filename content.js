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

  let currentActiveSongId = null;
  let currentActivePartId = null;
  let isExtracting = false;
  let lastProcessedKey = '';
  let lastExtractedData = null;
  let lastFingeringResult = null;
  let currentCoachPanel = null;
  let currentOverlayManager = null;
  let currentPlaybackObserver = null;
  let currentSyncController = null;
  let currentNormalizedTrack = null;

  // Session cache to prevent redundant recalculation across track switches or re-renders
  const fingeringCache = new Map(); // key: `${songId}-${revisionId}-${partId}` -> FingeringResult
  const normalizedCache = new Map(); // key: `${songId}-${revisionId}-${partId}` -> NormalizedTrack

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
   * Extract songId and optional partId directly from current window URL
   */
  function extractSongIdentityFromUrl() {
    if (typeof window === 'undefined' || !window.location) return null;
    const match = window.location.pathname.match(/-s(\d+)(?:t(\d+))?/);
    if (match) {
      return {
        songId: Number(match[1]),
        urlPartId: match[2] !== undefined ? Number(match[2]) : null
      };
    }
    return null;
  }

  /**
   * Resolve verified metadata for target songId
   * Detects and rejects stale SSR state during client-side SPA navigation
   */
  async function resolveSongMetadata(targetSongId) {
    const stateElement = document.getElementById('state');
    let ssrState = null;
    if (stateElement) {
      try {
        ssrState = JSON.parse(stateElement.textContent);
      } catch (e) {}
    }

    const ssrMeta = ssrState?.meta?.current || ssrState?.meta;
    const ssrSongId = ssrMeta?.songId !== undefined ? Number(ssrMeta.songId) : null;

    // 1. Check if SSR state is fresh and matches current targetSongId
    if (ssrMeta && ssrSongId === targetSongId) {
      return { meta: ssrMeta, isStaleSsr: false };
    }

    // 2. SSR state is stale or missing! Fetch verified metadata from Songsterr's API
    console.log(
      `%c🔄 [Songsterr Fingering Coach] Stale SSR state detected (SSR songId: ${ssrSongId} vs URL songId: ${targetSongId}). Requesting verified metadata from Songsterr API...`,
      'color: #f59e0b; font-weight: bold;'
    );

    const apiUrl = `https://www.songsterr.com/api/meta/${targetSongId}?allowOwnUnpublished=true`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch verified song metadata: HTTP ${res.status} ${res.statusText}`);
    }
    const apiMeta = await res.json();
    return { meta: apiMeta, isStaleSsr: true };
  }

  /**
   * Reliably resolve a track object for a target partId
   * Never synthesizes partId from arbitrary index, never uses blind tracks[0] fallback
   */
  function resolveTrackForPartId(tracks, targetPartId, partData = null) {
    if (!Array.isArray(tracks)) return null;
    const normPartId = Number(targetPartId);
    if (isNaN(normPartId)) return null;

    // 1. Direct match if track explicitly declares partId
    const exactByPartId = tracks.find(t => t.partId !== undefined && Number(t.partId) === normPartId);
    if (exactByPartId) return exactByPartId;

    // 2. Direct match by originalPartId
    const exactByOrig = tracks.find(t => t.originalPartId !== undefined && Number(t.originalPartId) === normPartId);
    if (exactByOrig) return exactByOrig;

    // 3. Match against verified partData from CDN if available
    if (partData) {
      if (partData.hash) {
        const matchByHash = tracks.find(t => t.hash && t.hash === partData.hash);
        if (matchByHash) return matchByHash;
      }
      if (partData.name && partData.instrument) {
        const matchByName = tracks.find(t => t.name === partData.name && t.instrument === partData.instrument);
        if (matchByName) return matchByName;
      }
      // Verified array index match if verified partData matches track properties
      if (normPartId >= 0 && normPartId < tracks.length) {
        const cand = tracks[normPartId];
        if (cand && (cand.name === partData.name || cand.instrument === partData.instrument)) {
          return cand;
        }
      }
    }

    // 4. Safe fallback for verified Songsterr track index if within bounds
    if (normPartId >= 0 && normPartId < tracks.length) {
      return tracks[normPartId];
    }

    return null;
  }

  /**
   * First-version Gate: Check if track is a supported 6-string guitar-like track
   */
  function isSupportedGuitarTrack(track, partData = null) {
    if (!track && !partData) {
      return { supported: false, reason: '無法解析音軌資訊 (Track metadata unresolved)' };
    }

    const inst = (track?.instrument || partData?.instrument || '').toLowerCase();
    const instId = track?.instrumentId ?? partData?.instrumentId;
    const isVocal = !!(track?.isVocalTrack || partData?.isVocalTrack);
    const isDrums = !!(track?.isDrums || inst.includes('drum') || instId === 1024);
    const isBass = !!(track?.isBassGuitar || inst.includes('bass') || (typeof instId === 'number' && instId >= 32 && instId <= 39));
    const isKeyboard = inst.includes('piano') || inst.includes('keyboard') || inst.includes('organ') || inst.includes('synth');

    if (isVocal) {
      return { supported: false, reason: '人聲音軌 (Vocals) — 指法教練僅支援 6 弦吉他音軌' };
    }
    if (isDrums) {
      return { supported: false, reason: '鼓組音軌 (Drums) — 指法教練僅支援 6 弦吉他音軌' };
    }
    if (isBass) {
      return { supported: false, reason: '貝斯音軌 (Bass) — 首版僅支援標準 6 弦吉他' };
    }
    if (isKeyboard) {
      return { supported: false, reason: '鍵盤樂器音軌 (Keyboard) — 首版僅支援 6 弦吉他' };
    }

    // Strict Tuning Length: MUST be 6 strings
    const tuning = partData?.tuning || track?.tuning;
    if (!Array.isArray(tuning) || tuning.length !== 6) {
      const count = Array.isArray(tuning) ? `${tuning.length} 弦` : '未知弦數';
      return { supported: false, reason: `非 6 弦調音 (${count}) — 首版僅支援 6 弦吉他音軌` };
    }

    // Instrument Classification: Must be guitar-like
    const isGuitarName = inst.includes('guitar');
    const isGuitarId = typeof instId === 'number' && instId >= 24 && instId <= 31;
    const isGuitarFlag = track?.isGuitar === true;

    if (!isGuitarName && !isGuitarId && !isGuitarFlag) {
      return { supported: false, reason: `非吉他樂器 (${track?.instrument || 'Unknown'}) — 僅支援 6 弦吉他` };
    }

    return { supported: true, trackName: track?.name || partData?.name || 'Guitar' };
  }

  /**
   * Atomic SPA Reset
   * Cleans up all active runtime and UI state from previous song before loading new song
   */
  function atomicResetRuntime(newSongId) {
    console.log(`%c🛑 [Songsterr Fingering Coach] Atomic SPA Reset triggered for transition -> Song ${newSongId}`, 'color: #ef4444; font-weight: bold;');

    // 1. Stop active playback sync
    if (currentSyncController) {
      currentSyncController.reset();
    }

    // 2. Clear all visible inline overlays immediately from DOM
    if (currentOverlayManager) {
      currentOverlayManager.clearAll();
    }

    // 3. Reset playback observer cached state
    if (currentPlaybackObserver) {
      currentPlaybackObserver.reset();
    }

    // 4. Put CoachPanel into loading state so Song A data is never displayed on Song B DOM
    if (currentCoachPanel) {
      currentCoachPanel.showLoading(`Loading song ${newSongId}...`);
    }

    // 5. Clear active runtime references (preserving fingeringCache & normalizedCache)
    lastProcessedKey = '';
    currentActivePartId = null;
    currentActiveSongId = newSongId;
    currentNormalizedTrack = null;
    lastFingeringResult = null;
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
  /**
   * Detect current active partId directly from live Songsterr DOM / markers / URL
   */
  function detectCurrentPartId(meta = null) {
    // 1. Check active cursor marker (#cursorMarker[data-cursor]) -> format "partId,measure,voice,beat,string"
    const cursorMarker = document.getElementById('cursorMarker');
    if (cursorMarker) {
      const dc = cursorMarker.getAttribute('data-cursor');
      if (dc) {
        const parts = dc.split(',').map(s => parseInt(s.trim(), 10));
        if (!isNaN(parts[0])) return Number(parts[0]);
      }
    }

    // 2. Check DOM elements with data-part-id in SVG score
    const partEl = document.querySelector('[data-part-id]');
    if (partEl) {
      const p = parseInt(partEl.getAttribute('data-part-id'), 10);
      if (!isNaN(p)) return Number(p);
    }

    // 3. Check URL parameters (?part=1 or ?track=1 or /t1)
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('part')) {
        const p = parseInt(urlParams.get('part'), 10);
        if (!isNaN(p)) return Number(p);
      }
      if (urlParams.has('track')) {
        const t = parseInt(urlParams.get('track'), 10);
        if (!isNaN(t)) return Number(t);
      }
      const pathMatch = window.location.pathname.match(/t(\d+)$/);
      if (pathMatch) {
        return Number(pathMatch[1]);
      }
    }

    // 4. Fallback to preferred guitar track in verified meta
    if (meta) {
      if (meta.popularTrackGuitar !== undefined && meta.popularTrackGuitar !== null) {
        return Number(meta.popularTrackGuitar);
      }
      if (meta.defaultTrack !== undefined && meta.defaultTrack !== null) {
        return Number(meta.defaultTrack);
      }
    }

    return null;
  }

  /**
   * Main extraction and fingering analysis flow (Phase 3.3)
   */
  async function extractTabNotes(explicitPartId = null) {
    if (isExtracting) return null;
    isExtracting = true;

    try {
      // 1. Parse current song identity from URL
      const songIdentity = extractSongIdentityFromUrl();
      if (!songIdentity || !songIdentity.songId) {
        console.warn('[Songsterr Fingering Coach] No songId found in URL pathname.');
        return null;
      }

      const urlSongId = songIdentity.songId;

      // 2. If song switched via SPA, perform atomic reset immediately
      if (currentActiveSongId !== null && currentActiveSongId !== urlSongId) {
        atomicResetRuntime(urlSongId);
      } else {
        currentActiveSongId = urlSongId;
      }

      // 3. Resolve verified metadata (detects and rejects stale SSR state)
      const { meta, isStaleSsr } = await resolveSongMetadata(urlSongId);
      if (!meta || !meta.songId) {
        console.warn('[Songsterr Fingering Coach] Metadata could not be resolved for song:', urlSongId);
        return null;
      }

      const songId = Number(meta.songId);
      const revisionId = Number(meta.revisionId || meta.latestRevisionId);
      const image = meta.image;
      const title = meta.title || 'Unknown Title';
      const artist = meta.artist || 'Unknown Artist';
      const tracks = meta.tracks || [];

      // 4. Resolve target partId (Normalized to Number)
      let targetPartId = explicitPartId !== null ? Number(explicitPartId) : songIdentity.urlPartId;
      if (targetPartId === null || isNaN(targetPartId)) {
        const detected = detectCurrentPartId(meta);
        targetPartId = detected !== null ? Number(detected) : Number(meta.popularTrackGuitar ?? meta.defaultTrack ?? 0);
      }

      // 5. Pre-check track classification from metadata if available
      const prelimTrack = resolveTrackForPartId(tracks, targetPartId, null);
      if (prelimTrack) {
        const prelimCheck = isSupportedGuitarTrack(prelimTrack);
        if (!prelimCheck.supported) {
          console.warn(`%c⚠️ [Songsterr Fingering Coach] Unsupported track selected: ${prelimCheck.reason}`, 'color: #f59e0b; font-weight: bold;');
          if (currentSyncController) currentSyncController.stop();
          if (currentOverlayManager) currentOverlayManager.clearAll();
          if (currentCoachPanel) currentCoachPanel.showUnsupported(prelimTrack, prelimCheck.reason);
          currentActivePartId = targetPartId;
          return { unsupported: true, reason: prelimCheck.reason };
        }
      }

      // 6. Fast-path: Check memory session cache
      const cacheKey = `${songId}-${revisionId}-${targetPartId}`;
      if (fingeringCache.has(cacheKey) && normalizedCache.has(cacheKey)) {
        const cachedResult = fingeringCache.get(cacheKey);
        const cachedNormalized = normalizedCache.get(cacheKey);
        lastProcessedKey = cacheKey;
        lastFingeringResult = cachedResult;
        currentNormalizedTrack = cachedNormalized;
        currentActivePartId = targetPartId;

        console.log(`%c⚡ [Songsterr Fingering Coach] Serving track "${prelimTrack?.name || targetPartId}" from memory cache (${cacheKey})`, 'color: #10b981; font-weight: bold;');

        if (currentCoachPanel) {
          currentCoachPanel.updateData(cachedResult);
        }
        if (currentOverlayManager) {
          currentOverlayManager.setFingeringResult(cachedResult);
        }
        if (currentSyncController) {
          currentSyncController.coachPanel = currentCoachPanel;
          currentSyncController.overlayManager = currentOverlayManager;
          currentSyncController.setTrack(cachedNormalized, cachedResult);
          currentSyncController.start();
        }
        return { fingeringResult: cachedResult };
      }

      // 7. Fetch verified part JSON from CloudFront CDN
      const partUrl = buildPartUrl(songId, revisionId, image, targetPartId);
      console.log(
        `%c🎸 [Songsterr Fingering Coach] Ingesting tab: "${title}" by ${artist} (Part: ${targetPartId})`,
        'color: #00d26a; font-weight: bold; font-size: 13px;'
      );

      let partData;
      try {
        const response = await fetch(partUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        partData = await response.json();
      } catch (fetchErr) {
        console.error('[Songsterr Fingering Coach] Failed to fetch part JSON from CDN:', fetchErr);
        if (currentCoachPanel) {
          currentCoachPanel.showUnsupported(prelimTrack, `無法載入音軌資料 (${fetchErr.message})`);
        }
        return null;
      }

      if (!partData.measures || !Array.isArray(partData.measures)) {
        console.warn('[Songsterr Fingering Coach] No measures array in retrieved part JSON.');
        return null;
      }

      // 8. Resolve exact track and perform strict 6-string guitar check
      const track = resolveTrackForPartId(tracks, targetPartId, partData);
      const supportedCheck = isSupportedGuitarTrack(track, partData);
      if (!supportedCheck.supported) {
        console.warn(`%c⚠️ [Songsterr Fingering Coach] Unsupported track selected: ${supportedCheck.reason}`, 'color: #f59e0b; font-weight: bold;');
        if (currentSyncController) currentSyncController.stop();
        if (currentOverlayManager) currentOverlayManager.clearAll();
        if (currentCoachPanel) currentCoachPanel.showUnsupported(track, supportedCheck.reason);
        currentActivePartId = targetPartId;
        return { unsupported: true, reason: supportedCheck.reason };
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
          partId: targetPartId,
          name: track?.name || partData.name || 'Guitar',
          instrument: track?.instrument || partData.instrument || 'Guitar',
          tuningMidi: tuning,
          tuningNames: tuning.map(midiToNoteName),
          totalMeasures: partData.measures.length
        },
        first5Measures
      };

      lastExtractedData = extractedOutput;

      // 9. Normalize and analyze tab
      let normalizedTrack = null;
      let fingeringResult = null;

      if (typeof TabNormalizer !== 'undefined' && typeof FingeringEngine !== 'undefined') {
        const startTime = performance.now();

        // Strict normalization (guards against fractional strings, invalid frets, non-6 strings)
        normalizedTrack = TabNormalizer.normalizeSongsterrPart(partData, {
          title,
          artist,
          songId,
          partId: targetPartId,
          trackName: track?.name || partData.name,
          instrument: track?.instrument || partData.instrument,
          tuning
        });

        // Run Left-Hand Fingering Engine
        fingeringResult = FingeringEngine.analyzeTab(normalizedTrack);

        const durationMs = (performance.now() - startTime).toFixed(2);
        console.log(
          `%c⏱️ [Songsterr Fingering Coach] Full track fingering analysis for ${normalizedTrack.measures.length} measures completed in ${durationMs}ms`,
          'color: #10b981; font-weight: bold;'
        );

        // Store in session cache
        fingeringCache.set(cacheKey, fingeringResult);
        normalizedCache.set(cacheKey, normalizedTrack);
      }

      lastProcessedKey = cacheKey;
      lastFingeringResult = fingeringResult;
      currentNormalizedTrack = normalizedTrack;
      currentActivePartId = targetPartId;

      // 10. Mount or update Floating Coach Panel UI
      if (fingeringResult && typeof CoachPanel !== 'undefined') {
        try {
          if (!currentCoachPanel) {
            currentCoachPanel = new CoachPanel(fingeringResult, { initialMeasure: 1 });
            console.log('%c🎨 [Songsterr Fingering Coach] Coach Panel UI successfully mounted to page', 'color: #8b5cf6; font-weight: bold;');
          } else {
            currentCoachPanel.updateData(fingeringResult);
          }
        } catch (uiErr) {
          console.error('[Songsterr Fingering Coach] Failed to initialize Coach Panel UI:', uiErr);
        }
      }

      // 11. Initialize or update Inline Overlay Manager
      if (fingeringResult && typeof OverlayManager !== 'undefined') {
        try {
          if (!currentOverlayManager) {
            currentOverlayManager = new OverlayManager({
              fingeringResult,
              initialMeasure: 1,
              density: 'small'
            });
            console.log('%c📐 [Songsterr Fingering Coach] Inline Overlay Manager initialized (Density: Small)', 'color: #3b82f6; font-weight: bold;');
          } else {
            currentOverlayManager.setFingeringResult(fingeringResult);
          }
        } catch (overlayErr) {
          console.error('[Songsterr Fingering Coach] Failed to initialize OverlayManager:', overlayErr);
        }
      }

      // 12. Initialize or start PlaybackObserver
      if (typeof PlaybackObserver !== 'undefined' && !currentPlaybackObserver) {
        try {
          currentPlaybackObserver = new PlaybackObserver({ debugLog: false });
          currentPlaybackObserver.start();
        } catch (obsErr) {
          console.error('[Songsterr Fingering Coach] Failed to start PlaybackObserver:', obsErr);
        }
      }

      // 13. Initialize or update PlaybackSyncController
      if (typeof PlaybackSyncController !== 'undefined' && normalizedTrack && currentCoachPanel) {
        try {
          if (!currentSyncController) {
            currentSyncController = new PlaybackSyncController({
              observer: currentPlaybackObserver,
              mapper: typeof PlaybackMapper !== 'undefined' ? PlaybackMapper : null,
              coachPanel: currentCoachPanel,
              overlayManager: currentOverlayManager,
              normalizedTrack: normalizedTrack,
              autoStart: true
            });
            console.log('%c⚡ [Songsterr Fingering Coach] Live Playback Sync Controller activated', 'color: #10b981; font-weight: bold;');
          } else {
            currentSyncController.coachPanel = currentCoachPanel;
            currentSyncController.overlayManager = currentOverlayManager;
            currentSyncController.setTrack(normalizedTrack, fingeringResult);
            currentSyncController.start();
          }
        } catch (ctlErr) {
          console.error('[Songsterr Fingering Coach] Failed to initialize PlaybackSyncController:', ctlErr);
        }
      }

      return {
        extractedOutput,
        fingeringResult,
        coachPanel: currentCoachPanel,
        overlayManager: currentOverlayManager,
        playbackObserver: currentPlaybackObserver,
        syncController: currentSyncController
      };
    } finally {
      isExtracting = false;
    }
  }

  // Developer inspection object on window
  window.__SONGSTERR_FINGERING_COACH__ = {
    extract: () => extractTabNotes(),
    extractTrack: (partId) => extractTabNotes(partId),
    getLastExtracted: () => lastExtractedData,
    getLastFingeringResult: () => lastFingeringResult,
    getCoachPanel: () => currentCoachPanel,
    getOverlayManager: () => currentOverlayManager,
    getPlaybackObserver: () => currentPlaybackObserver,
    getPlaybackMapper: () => (typeof PlaybackMapper !== 'undefined' ? PlaybackMapper : null),
    getSyncController: () => currentSyncController,
    getActiveSongId: () => currentActiveSongId,
    getActivePartId: () => currentActivePartId,
    getCache: () => fingeringCache,
    getScoreGeometry: () => (typeof ScoreGeometry !== 'undefined' ? ScoreGeometry : null),
    ScoreGeometry: typeof ScoreGeometry !== 'undefined' ? ScoreGeometry : null,
    resolveTrackForPartId,
    isSupportedGuitarTrack,
    extractSongIdentityFromUrl
  };

  /**
   * Monitor track change in DOM (e.g. user clicks track dropdown / mixer / tab selector)
   */
  async function checkTrackChange(explicitPartId = null) {
    if (isExtracting) return;

    // Check if song identity changed in URL
    const songIdInfo = extractSongIdentityFromUrl();
    if (songIdInfo && songIdInfo.songId && currentActiveSongId !== null && songIdInfo.songId !== currentActiveSongId) {
      console.log(`%c🔄 [Songsterr Fingering Coach] SPA song navigation detected: Song ${currentActiveSongId} -> Song ${songIdInfo.songId}`, 'color: #06b6d4; font-weight: bold;');
      extractTabNotes().catch(console.error);
      return;
    }

    const detectedPartId = explicitPartId !== null ? Number(explicitPartId) : detectCurrentPartId();
    if (detectedPartId === null || isNaN(detectedPartId)) return;

    if (currentActivePartId === null || detectedPartId !== currentActivePartId) {
      console.log(
        `%c🔄 [Songsterr Fingering Coach] Active track change detected in DOM: Part ${currentActivePartId} -> Part ${detectedPartId}`,
        'color: #f59e0b; font-weight: bold; font-size: 12px;'
      );
      extractTabNotes(detectedPartId).catch(console.error);
    }
  }

  // Run on initial page load
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
        }, 300);
      }
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  window.addEventListener('popstate', () => {
    if (location.pathname.includes('/a/wsa/')) {
      setTimeout(() => {
        extractTabNotes().catch(console.error);
      }, 300);
    }
  });

  // Track switch polling and event listeners
  setInterval(checkTrackChange, 400);

  document.addEventListener('click', () => {
    setTimeout(checkTrackChange, 150);
    setTimeout(checkTrackChange, 500);
  }, { passive: true });

  init();
})();
