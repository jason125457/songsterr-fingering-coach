/**
 * playback_sync_controller.js
 * 
 * Orchestrator / Wiring controller for Phase 3.1B Live Playback Synchronization.
 * 
 * Responsibilities:
 * - Decouples PlaybackObserver, PlaybackMapper, and CoachPanel:
 *   - PlaybackObserver detects Songsterr player state
 *   - PlaybackMapper resolves raw player coords to Canonical Events
 *   - CoachPanel presents fingerings and follows playback
 * - Manages 'follow' vs 'manual' mode coordination
 * - Responds to Seek, Pause, Resume, Speed Change, and Track Switch
 * - Provides performance tracking and prevents UI flood
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PlaybackSyncController = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class PlaybackSyncController {
    constructor(options = {}) {
      this.observer = options.observer || null;
      this.mapper = options.mapper || null;
      this.coachPanel = options.coachPanel || null;
      this.normalizedTrack = options.normalizedTrack || null;

      this.isActive = false;
      this.stats = {
        totalEventsReceived: 0,
        syncedUpdates: 0,
        skippedManualCount: 0,
        lastSyncTimestamp: 0
      };

      this.boundOnPlaybackChange = this.handlePlaybackChange.bind(this);
      this.boundOnResumeFollow = this.handleResumeFollow.bind(this);
      this.boundOnUserAction = this.handleUserAction.bind(this);

      if (options.autoStart) {
        this.start();
      }
    }

    /**
     * Start observing playback and wiring events to CoachPanel
     */
    start() {
      if (this.isActive) return this;
      this.isActive = true;

      if (this.observer) {
        this.observer.on('change', this.boundOnPlaybackChange);
      }

      if (this.coachPanel) {
        this.coachPanel.onResumeFollow(this.boundOnResumeFollow);
        this.coachPanel.onUserAction(this.boundOnUserAction);
      }

      // Initial sync with current observer position if available
      this.syncCurrentPosition();
      return this;
    }

    /**
     * Stop observing
     */
    stop() {
      this.isActive = false;
      if (this.observer) {
        this.observer.off('change', this.boundOnPlaybackChange);
      }
      return this;
    }

    /**
     * Switch or update the active track data
     * @param {Object} normalizedTrack 
     * @param {Object} fingeringResult 
     */
    setTrack(normalizedTrack, fingeringResult) {
      this.normalizedTrack = normalizedTrack;
      if (this.coachPanel && fingeringResult) {
        this.coachPanel.updateData(fingeringResult);
      }
      this.syncCurrentPosition();
    }

    /**
     * Handle incoming PlaybackEvent from PlaybackObserver
     * @param {Object} playbackEvent 
     */
    handlePlaybackChange(playbackEvent) {
      this.stats.totalEventsReceived++;

      if (!this.isActive || !this.coachPanel || !this.mapper || !this.normalizedTrack) {
        return;
      }

      // If user is manually inspecting notes, do NOT force-advance the panel
      if (this.coachPanel.getMode() === 'manual') {
        this.stats.skippedManualCount++;
        return;
      }

      // Map playback event to Canonical Event in normalized track
      const canonicalResult = this.mapper.mapPlaybackEventToCanonical(playbackEvent, this.normalizedTrack);
      if (!canonicalResult) {
        return;
      }

      // Dispatch to CoachPanel
      this.coachPanel.syncPlayback(canonicalResult, playbackEvent);

      this.stats.syncedUpdates++;
      this.stats.lastSyncTimestamp = Date.now();
    }

    /**
     * Invoked when user clicks "Resume Follow" in CoachPanel
     */
    handleResumeFollow() {
      // User requested to resume following live playback
      this.syncCurrentPosition();
    }

    /**
     * Invoked when user manually navigates in CoachPanel
     */
    handleUserAction() {
      // Panel switched to manual; controller continues passive observation
    }

    /**
     * Manually sync CoachPanel with the observer's current snapshot
     */
    syncCurrentPosition() {
      if (!this.observer || !this.coachPanel || !this.mapper || !this.normalizedTrack) {
        return;
      }

      const currentPos = typeof this.observer.getCurrentPosition === 'function' 
        ? this.observer.getCurrentPosition() 
        : null;

      if (!currentPos) return;

      const canonicalResult = this.mapper.mapPlaybackEventToCanonical(currentPos, this.normalizedTrack);
      if (canonicalResult) {
        this.coachPanel.syncPlayback(canonicalResult, currentPos);
        this.stats.syncedUpdates++;
        this.stats.lastSyncTimestamp = Date.now();
      }
    }

    /**
     * Get performance and sync statistics
     */
    getStats() {
      return Object.assign({}, this.stats);
    }

    /**
     * Cleanup and destroy
     */
    destroy() {
      this.stop();
      this.observer = null;
      this.mapper = null;
      this.coachPanel = null;
      this.normalizedTrack = null;
    }
  }

  return PlaybackSyncController;
});
