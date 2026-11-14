// Full 10-foot TV playback orchestrator screen.
import { AvplayAdapter, PlayState } from '../../player/avplayAdapter.js';
import { PlayerControls } from './playerControls.js';
import { SkipOverlay } from './skipOverlay.js';
import { UpNextOverlay } from './upNextOverlay.js';
import { EpisodesPanel, StreamsPanel, SimpleListDrawer } from './sideDrawers.js';
import {
  getItem,
  getItemDetails,
  getEpisodes,
  getSeasons,
  getPlaybackInfo,
  buildStreamUrl,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  creditRealWatch,
  reportRealDuration,
  getIntroSkipperSegments,
  getCommunitySkipSegments,
  getMediaSegments,
  getRecommendationCandidates,
  TICKS_PER_MS,
  startSleepTimer,
  cancelSleepTimer,
} from '../../data/api.js';
import { mergeSkipSegments, chapterFallbackSegments } from '../../runtime/skipSegments.js';
import { loadFailoverSources, planFailover, failoverOutcome, describeFailover } from '../../runtime/failoverSources.js';
import { isBadStream } from '../../runtime/streamHealth.js';
import { selectStreamLanguage } from '../../runtime/streamLanguage.js';
import { syncPlayManager } from '../../data/syncplay.js';
import { showToast } from '../overlays/toasts.js';
import { extractMediaTechBadges } from '../screens/detail.js';
import { RemoteKey } from '../../input/remote.js';
import { focusFirstIn } from '../../input/spatialNav.js';
import { router, Route } from '../router.js';

export const PROGRESS_REPORT_INTERVAL_MS = 5000;
export const REAL_WATCH_THRESHOLD = 0.90;

export class PlayerScreen {
  constructor(options = {}) {
    this.options = options;
    this.itemId = options.itemId || null;
    this.mediaSourceId = options.mediaSourceId || null;
    this.startPositionTicks = options.startPositionTicks || 0;

    this.container = null;
    this.adapter = null;
    this.controls = null;
    this.skipOverlay = null;
    this.upNextOverlay = null;
    this.episodesPanel = null;
    this.streamsPanel = null;

    this.item = null;
    this.mediaSources = [];
    this.currentSource = null;
    this.seasons = [];
    this.episodes = [];
    this.nextEpisode = null;
    this.previousEpisode = null;
    this.skipSegments = null;

    this.progressTimer = null;
    this.lastReportedTicks = 0;
    this.realWatchCredited = false;
    this.realDurationReported = false;

    this.triedSourceIds = new Set();
    this.playbackSessionId = null;

    this.syncPlayUnsubscribe = null;
  }

  async render(container, itemId = this.itemId, mediaSourceId = this.mediaSourceId, startPositionTicks = this.startPositionTicks) {
    this.container = container;
    this.itemId = itemId;
    this.mediaSourceId = mediaSourceId;
    this.startPositionTicks = startPositionTicks || 0;

    container.innerHTML = `
      <div class="jellio-screen jellio-player-screen" id="jellio-player-screen-root" style="position: absolute; inset: 0; background: #000000; z-index: 10;">
        <div id="player-loading-spinner" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ffffff; font-size: 20px; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <div style="width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.2); border-top-color: var(--jellio-trending); border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span>Loading stream...</span>
        </div>
      </div>
    `;

    try {
      await this.loadMediaData();
      await this.initPlayback();
    } catch (err) {
      this.handlePlaybackFailure(err);
    }
  }

  async loadMediaData() {
    this.item = await getItemDetails(this.itemId);
    const playbackInfo = await getPlaybackInfo(this.itemId, this.startPositionTicks, this.mediaSourceId);
    this.playbackSessionId = playbackInfo?.PlaySessionId || null;
    this.mediaSources = playbackInfo?.MediaSources || [];

    if (this.mediaSourceId) {
      this.currentSource = this.mediaSources.find((s) => s.Id === this.mediaSourceId) || this.mediaSources[0];
    } else {
      this.currentSource = this.mediaSources[0];
    }

    if (!this.currentSource) {
      throw new Error('No playable media source found');
    }

    if (this.item.Type === 'Episode' && this.item.SeriesId) {
      try {
        const [seasons, eps] = await Promise.all([
          getSeasons(this.item.SeriesId),
          getEpisodes(this.item.SeriesId, this.item.SeasonId),
        ]);
        this.seasons = seasons;
        this.episodes = eps;

        const currentIndex = eps.findIndex((e) => e.Id === this.itemId);
        if (currentIndex !== -1) {
          this.previousEpisode = currentIndex > 0 ? eps[currentIndex - 1] : null;
          this.nextEpisode = currentIndex < eps.length - 1 ? eps[currentIndex + 1] : null;
        }
      } catch (_) {}
    }

    await this.resolveSkipSegments();
  }

  async resolveSkipSegments() {
    try {
      const [introData, commData, segData] = await Promise.all([
        getIntroSkipperSegments(this.itemId).catch(() => null),
        getCommunitySkipSegments(this.itemId).catch(() => null),
        getMediaSegments(this.itemId).catch(() => null),
      ]);

      let merged = null;
      if (introData) merged = mergeSkipSegments(merged, introData);
      if (commData) merged = mergeSkipSegments(merged, commData);
      if (segData) merged = mergeSkipSegments(merged, segData);

      if (!merged && this.item?.Chapters && this.item.Chapters.length > 0) {
        merged = chapterFallbackSegments(this.item.Chapters, this.item.RunTimeTicks, 10000000);
      }
      this.skipSegments = merged;
    } catch (_) {}
  }

  async initPlayback() {
    const screenRoot = this.container.querySelector('#jellio-player-screen-root');
    const spinner = this.container.querySelector('#player-loading-spinner');

    this.adapter = new AvplayAdapter();
    const isEpisode = this.item.Type === 'Episode';
    const seriesTitle = isEpisode ? this.item.SeriesName : '';
    const seasonEp = isEpisode ? `S${this.item.ParentIndexNumber || 1}E${this.item.IndexNumber || 1}` : '';
    const badges = extractMediaTechBadges(this.item);
    const qualityBadge = badges.length > 0 ? badges[0] : '';

    this.controls = new PlayerControls({
      title: this.item.Name || 'Playback',
      subtitle: isEpisode ? this.item.Name : (this.item.ProductionYear ? String(this.item.ProductionYear) : ''),
      seriesName: seriesTitle,
      seasonEpisode: seasonEp,
      qualityBadge,
      chapters: this.item.Chapters || [],
      isEpisode,
      hasPreviousEpisode: Boolean(this.previousEpisode),
      hasNextEpisode: Boolean(this.nextEpisode),
      inGroup: Boolean(syncPlayManager.group),
      onPlayPause: () => this.adapter.togglePlayPause(),
      onSeekDelta: (deltaSec) => this.adapter.stepSeek(deltaSec),
      onSeekTo: (targetMs) => this.adapter.seek(targetMs),
      onPreviousEpisode: () => this.playPreviousEpisode(),
      onNextEpisode: () => this.playNextEpisode(),
      onOpenAudioMenu: () => this.openAudioMenu(),
      onOpenSubtitleMenu: () => this.openSubtitleMenu(),
      onOpenStreamsMenu: () => this.openStreamsMenu(),
      onOpenEpisodesMenu: () => this.openEpisodesMenu(),
      onOpenSpeedMenu: () => this.openSpeedMenu(),
      onOpenSleepMenu: () => this.openSleepMenu(),
      onOpenChat: () => this.openGroupChat(),
    });

    const hudEl = this.controls.render();
    screenRoot.appendChild(hudEl);

    this.skipOverlay = new SkipOverlay({
      parentEl: screenRoot,
      onSkip: (targetSec) => {
        this.adapter.seek(targetSec * 1000);
      },
    });

    this.upNextOverlay = new UpNextOverlay({
      parentEl: screenRoot,
      nextEpisode: this.nextEpisode,
      onPlayNext: (nextEp) => {
        this.destroy();
        router.replace(Route.Player(nextEp.Id));
      },
      onReplay: () => {
        this.adapter.seek(0);
        this.adapter.play();
      },
      onBack: () => {
        this.destroy();
        router.pop();
      },
    });

    this.episodesPanel = new EpisodesPanel({
      parentEl: screenRoot,
      seasons: this.seasons,
      episodes: this.episodes,
      currentSeasonId: this.item.SeasonId,
      currentEpisodeId: this.itemId,
      onSelectEpisode: (epId) => {
        this.destroy();
        router.replace(Route.Player(epId));
      },
    });

    this.streamsPanel = new StreamsPanel({
      parentEl: screenRoot,
      sources: this.mediaSources,
      currentSourceId: this.currentSource.Id,
      onSelectSource: (src) => {
        this.switchStreamSource(src);
      },
    });

    this.bindAdapterEvents();

    const startMs = Math.round(this.startPositionTicks / TICKS_PER_MS);
    const directPlay = Boolean(this.currentSource.SupportsDirectPlay !== false && !this.currentSource.RequiresTranscoding);
    const streamUrl = buildStreamUrl(this.itemId, this.currentSource, {
      directPlay,
      startPositionTicks: this.startPositionTicks,
      playSessionId: this.playbackSessionId,
    });

    this.triedSourceIds.add(this.currentSource.Id);

    await this.adapter.loadStream(streamUrl, startMs);
    if (spinner) spinner.style.display = 'none';

    this.adapter.play();
    this.controls.show();
    this.startProgressReporting();
    this.listenToSyncPlay();
  }

  bindAdapterEvents() {
    this.adapter.on('timeupdate', (currentMs, durationMs) => {
      this.controls.updateProgress(currentMs, durationMs);
      const currentSec = currentMs / 1000;
      const durationSec = durationMs / 1000;

      if (this.skipOverlay) {
        this.skipOverlay.updatePlaybackTime(currentSec, this.skipSegments);
      }
      if (this.upNextOverlay) {
        this.upNextOverlay.updatePlaybackTime(currentSec, durationSec, this.skipSegments);
      }

      if (durationSec > 0 && !this.realWatchCredited) {
        if (currentSec / durationSec >= REAL_WATCH_THRESHOLD) {
          this.realWatchCredited = true;
          creditRealWatch(this.itemId);
        }
      }

      if (durationSec > 0 && !this.realDurationReported) {
        this.realDurationReported = true;
        reportRealDuration(this.itemId, durationMs * TICKS_PER_MS);
      }
    });

    this.adapter.on('play', () => {
      this.controls.setPlaying(true);
    });

    this.adapter.on('pause', () => {
      this.controls.setPlaying(false);
      this.controls.show();
    });

    this.adapter.on('ended', () => {
      this.controls.setPlaying(false);
      this.stopProgressReporting();
      reportPlaybackStopped(this.itemId, this.currentSource?.Id, this.adapter.getCurrentTime() * TICKS_PER_MS);
      if (this.upNextOverlay) {
        this.upNextOverlay.showEndScreen(this.item.Name, this.controls.formatSubtitle());
      }
    });

    this.adapter.on('error', (err) => {
      this.handlePlaybackFailure(err);
    });
  }

  startProgressReporting() {
    this.stopProgressReporting();
    reportPlaybackStart(this.itemId, this.currentSource?.Id, this.startPositionTicks);

    this.progressTimer = setInterval(() => {
      if (!this.adapter) return;
      const currentMs = this.adapter.getCurrentTime();
      const isPaused = this.adapter.state === PlayState.PAUSED;
      const ticks = currentMs * TICKS_PER_MS;
      this.lastReportedTicks = ticks;
      reportPlaybackProgress(this.itemId, this.currentSource?.Id, ticks, isPaused);
    }, PROGRESS_REPORT_INTERVAL_MS);
  }

  stopProgressReporting() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  listenToSyncPlay() {
    if (!syncPlayManager.group) return;

    this.syncPlayUnsubscribe = syncPlayManager.subscribeCommands((cmd) => {
      if (!cmd || !this.adapter) return;
      if (cmd.command === 'Pause') {
        this.adapter.pause();
      } else if (cmd.command === 'Unpause') {
        this.adapter.play();
      } else if (cmd.command === 'Seek' && cmd.positionTicks != null) {
        const ms = Math.round(cmd.positionTicks / TICKS_PER_MS);
        this.adapter.seek(ms);
      }
    });
  }

  async handlePlaybackFailure(err) {
    this.stopProgressReporting();
    showToast('Playback failed, looking for failover stream...');

    const deps = {
      now: Date.now,
      lastList: () => ({ sources: this.mediaSources, at: Date.now() }),
      fetchSources: async () => this.mediaSources,
      isBad: (source) => (isBadStream(this.itemId, source) ? 'hard' : null),
      byLanguage: (list) => selectStreamLanguage(list, 'eng'),
    };

    const loaded = await loadFailoverSources(deps);
    const plan = planFailover(loaded.sources, Array.from(this.triedSourceIds), deps);
    const outcome = failoverOutcome(loaded, plan);

    if (outcome.action === 'navigate' && outcome.sourceId) {
      const nextSrc = this.mediaSources.find((s) => s.Id === outcome.sourceId);
      if (nextSrc) {
        showToast(`Failing over to ${nextSrc.Name || 'next stream'}`);
        this.switchStreamSource(nextSrc);
        return;
      }
    }

    this.showErrorPanel(err ? err.message : 'No playable stream left');
  }

  switchStreamSource(newSource) {
    this.currentSource = newSource;
    this.mediaSourceId = newSource.Id;
    this.triedSourceIds.add(newSource.Id);

    const currentMs = this.adapter ? this.adapter.getCurrentTime() : 0;
    const directPlay = Boolean(newSource.SupportsDirectPlay !== false && !newSource.RequiresTranscoding);
    const streamUrl = buildStreamUrl(this.itemId, newSource, {
      directPlay,
      startPositionTicks: currentMs * TICKS_PER_MS,
      playSessionId: this.playbackSessionId,
    });

    if (this.adapter) {
      this.adapter.loadStream(streamUrl, currentMs).then(() => {
        this.adapter.play();
        this.startProgressReporting();
      });
    }
  }

  showErrorPanel(message) {
    if (!this.container) return;
    const panel = document.createElement('div');
    panel.className = 'jellio-player-error-panel';
    panel.innerHTML = `
      <h2 style="font-size: 26px; font-weight: 700; color: var(--jellio-text);">Playback Error</h2>
      <p style="font-size: 16px; color: var(--jellio-text-secondary); max-width: 480px;">${message}</p>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="player-err-back">Exit Player</button>
        <button class="jellio-btn" data-focusable="true" id="player-err-retry">Retry</button>
      </div>
    `;

    this.container.appendChild(panel);

    panel.querySelector('#player-err-back').addEventListener('click', () => {
      this.destroy();
      router.pop();
    });

    panel.querySelector('#player-err-retry').addEventListener('click', () => {
      panel.remove();
      this.render(this.container);
    });

    focusFirstIn(panel);
  }

  playPreviousEpisode() {
    if (this.previousEpisode) {
      this.destroy();
      router.replace(Route.Player(this.previousEpisode.Id));
    }
  }

  playNextEpisode() {
    if (this.nextEpisode) {
      this.destroy();
      router.replace(Route.Player(this.nextEpisode.Id));
    }
  }

  openAudioMenu() {
    if (!this.adapter) return;
    const tracks = this.adapter.getAudioTracks();
    const items = tracks.map((tr) => ({
      id: tr.index,
      label: tr.label || `${tr.language.toUpperCase()} (${tr.codec || tr.channels + 'ch'})`,
    }));
    const drawer = new SimpleListDrawer({
      title: 'Audio Tracks',
      items,
      selectedId: this.adapter.selectedAudioIndex,
      onSelect: (trackIndex) => {
        this.adapter.selectAudioTrack(trackIndex);
      },
    });
    drawer.open(this.container.querySelector('#jellio-player-screen-root'));
  }

  openSubtitleMenu() {
    if (!this.adapter) return;
    const tracks = this.adapter.getSubtitleTracks();
    const items = [
      { id: -1, label: 'Off' },
      ...tracks.map((tr) => ({
        id: tr.index,
        label: tr.label || `${tr.language.toUpperCase()} Subtitle`,
      })),
    ];
    const drawer = new SimpleListDrawer({
      title: 'Subtitles',
      items,
      selectedId: this.adapter.selectedSubtitleIndex,
      onSelect: (trackIndex) => {
        this.adapter.selectSubtitleTrack(trackIndex);
      },
    });
    drawer.open(this.container.querySelector('#jellio-player-screen-root'));
  }

  openStreamsMenu() {
    if (this.streamsPanel) {
      this.streamsPanel.open();
    }
  }

  openEpisodesMenu() {
    if (this.episodesPanel) {
      this.episodesPanel.open();
    }
  }

  openSpeedMenu() {
    const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const items = speeds.map((sp) => ({
      id: sp,
      label: sp === 1.0 ? 'Normal (1x)' : `${sp}x`,
    }));
    const drawer = new SimpleListDrawer({
      title: 'Playback Speed',
      items,
      selectedId: this.adapter.playbackSpeed,
      onSelect: (speed) => {
        this.adapter.setSpeed(speed);
        this.controls.setSpeedLabel(speed);
      },
    });
    drawer.open(this.container.querySelector('#jellio-player-screen-root'));
  }

  openSleepMenu() {
    const sleepOptions = [
      { id: 0, label: 'Off' },
      { id: 15, label: '15 Minutes' },
      { id: 30, label: '30 Minutes' },
      { id: 45, label: '45 Minutes' },
      { id: 60, label: '60 Minutes' },
      { id: 90, label: '90 Minutes' },
    ];
    const drawer = new SimpleListDrawer({
      title: 'Sleep Timer',
      items: sleepOptions,
      onSelect: (minutes) => {
        if (minutes === 0) {
          cancelSleepTimer();
          showToast('Sleep timer canceled');
        } else {
          startSleepTimer(minutes);
          showToast(`Sleep timer set for ${minutes} minutes`);
        }
      },
    });
    drawer.open(this.container.querySelector('#jellio-player-screen-root'));
  }

  openGroupChat() {
    showToast('Group Watch chat is active');
  }

  handleRemoteKey(normalizedKey) {
    if (this.skipOverlay && this.skipOverlay.handleKey(normalizedKey)) {
      return true;
    }

    if (normalizedKey === RemoteKey.BACK) {
      if (this.controls && this.controls.isVisible) {
        this.controls.hide();
        return true;
      }
      this.destroy();
      router.pop();
      return true;
    }

    if (normalizedKey === RemoteKey.PLAY_PAUSE || normalizedKey === RemoteKey.PLAY || normalizedKey === RemoteKey.PAUSE) {
      if (this.adapter) this.adapter.togglePlayPause();
      return true;
    }

    if (normalizedKey === RemoteKey.FAST_FORWARD) {
      if (this.adapter) this.adapter.stepSeek(30);
      return true;
    }

    if (normalizedKey === RemoteKey.REWIND) {
      if (this.adapter) this.adapter.stepSeek(-10);
      return true;
    }

    if (this.controls) {
      this.controls.show();
    }
    return false;
  }

  destroy() {
    this.stopProgressReporting();
    if (this.syncPlayUnsubscribe) {
      this.syncPlayUnsubscribe();
      this.syncPlayUnsubscribe = null;
    }
    if (this.adapter) {
      reportPlaybackStopped(this.itemId, this.currentSource?.Id, this.adapter.getCurrentTime() * TICKS_PER_MS);
      this.adapter.destroy();
      this.adapter = null;
    }
    if (this.controls) {
      this.controls.destroy();
      this.controls = null;
    }
    if (this.skipOverlay) {
      this.skipOverlay.destroy();
      this.skipOverlay = null;
    }
    if (this.upNextOverlay) {
      this.upNextOverlay.destroy();
      this.upNextOverlay = null;
    }
    if (this.episodesPanel) {
      this.episodesPanel.destroy();
      this.episodesPanel = null;
    }
    if (this.streamsPanel) {
      this.streamsPanel.destroy();
      this.streamsPanel = null;
    }
  }
}
