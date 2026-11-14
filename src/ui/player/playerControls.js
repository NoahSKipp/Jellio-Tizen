// 10-foot on-screen TV transport HUD with auto-hide, scrubber, and pill actions.

export function formatTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padSec = seconds < 10 ? '0' + seconds : String(seconds);

  if (hours > 0) {
    const padMin = minutes < 10 ? '0' + minutes : String(minutes);
    return `${hours}:${padMin}:${padSec}`;
  }
  return `${minutes}:${padSec}`;
}

export class PlayerControls {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.isVisible = false;
    this.autoHideTimer = null;
    this.autoHideDelayMs = options.autoHideDelayMs || 3500;

    this.title = options.title || '';
    this.subtitle = options.subtitle || '';
    this.seriesName = options.seriesName || '';
    this.seasonEpisode = options.seasonEpisode || '';
    this.qualityBadge = options.qualityBadge || '';
    this.chapters = options.chapters || [];

    this.isPlaying = Boolean(options.isPlaying);
    this.currentTimeMs = options.currentTimeMs || 0;
    this.durationMs = options.durationMs || 0;
    this.bufferedPercent = options.bufferedPercent || 0;
    this.playbackSpeed = options.playbackSpeed || 1.0;

    this.hasPreviousEpisode = Boolean(options.hasPreviousEpisode);
    this.hasNextEpisode = Boolean(options.hasNextEpisode);
    this.isEpisode = Boolean(options.isEpisode);
    this.inGroup = Boolean(options.inGroup);

    this.onPlayPause = options.onPlayPause || null;
    this.onSeekDelta = options.onSeekDelta || null;
    this.onSeekTo = options.onSeekTo || null;
    this.onPreviousEpisode = options.onPreviousEpisode || null;
    this.onNextEpisode = options.onNextEpisode || null;
    this.onOpenAudioMenu = options.onOpenAudioMenu || null;
    this.onOpenSubtitleMenu = options.onOpenSubtitleMenu || null;
    this.onOpenStreamsMenu = options.onOpenStreamsMenu || null;
    this.onOpenEpisodesMenu = options.onOpenEpisodesMenu || null;
    this.onOpenSleepMenu = options.onOpenSleepMenu || null;
    this.onOpenSpeedMenu = options.onOpenSpeedMenu || null;
    this.onOpenChat = options.onOpenChat || null;
    this.onVisibilityChange = options.onVisibilityChange || null;

    this.scrubbingPositionMs = null;
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = 'jellio-player-overlay';
    overlay.id = 'jellio-player-hud';
    this.container = overlay;

    overlay.innerHTML = `
      <div class="jellio-player-header">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h1 class="jellio-player-title" id="hud-title">${this.escape(this.title)}</h1>
          ${this.qualityBadge ? `<span class="jellio-badge" id="hud-quality-badge">${this.escape(this.qualityBadge)}</span>` : ''}
        </div>
        <div class="jellio-player-subtitle" id="hud-subtitle">${this.escape(this.formatSubtitle())}</div>
      </div>

      <div class="jellio-player-center-controls">
        <button class="jellio-transport-btn" data-focusable="true" id="hud-btn-prev" title="Previous Episode" style="${this.isEpisode && this.hasPreviousEpisode ? '' : 'display:none;'}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="jellio-transport-btn" data-focusable="true" id="hud-btn-rewind10" title="Back 10s">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="jellio-transport-btn jellio-transport-btn-play" data-focusable="true" id="hud-btn-playpause" title="Play/Pause">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" id="hud-playpause-icon">
            ${this.isPlaying
              ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
              : '<path d="M8 5v14l11-7z"/>'}
          </svg>
        </button>
        <button class="jellio-transport-btn" data-focusable="true" id="hud-btn-forward30" title="Forward 30s">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
        <button class="jellio-transport-btn" data-focusable="true" id="hud-btn-next" title="Next Episode" style="${this.isEpisode && this.hasNextEpisode ? '' : 'display:none;'}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>

      <div class="jellio-player-bottom">
        <div id="hud-chapter-title" style="font-size: 14px; font-weight: 600; color: var(--jellio-text-secondary); min-height: 18px;"></div>
        <div class="jellio-player-scrubber-track" id="hud-scrubber-track" data-focusable="true">
          <div class="jellio-player-scrubber-buffer" id="hud-scrubber-buffer" style="width: ${this.bufferedPercent}%;"></div>
          <div class="jellio-player-scrubber-progress" id="hud-scrubber-progress" style="width: 0%;"></div>
          <div class="jellio-player-scrubber-thumb" id="hud-scrubber-thumb" style="left: 0%;"></div>
        </div>

        <div class="jellio-player-time-row">
          <span id="hud-time-current">${formatTime(this.currentTimeMs)}</span>
          <span id="hud-time-duration">${formatTime(this.durationMs)}</span>
        </div>

        <div class="jellio-player-pills-row">
          <button class="jellio-player-pill" data-focusable="true" id="hud-pill-audio">Audio</button>
          <button class="jellio-player-pill" data-focusable="true" id="hud-pill-subtitles">Subtitles</button>
          <button class="jellio-player-pill" data-focusable="true" id="hud-pill-streams">Streams</button>
          ${this.isEpisode ? '<button class="jellio-player-pill" data-focusable="true" id="hud-pill-episodes">Episodes</button>' : ''}
          <button class="jellio-player-pill" data-focusable="true" id="hud-pill-speed">${this.playbackSpeed === 1.0 ? '1x' : this.playbackSpeed + 'x'}</button>
          <button class="jellio-player-pill" data-focusable="true" id="hud-pill-sleep">Sleep</button>
          ${this.inGroup ? '<button class="jellio-player-pill" data-focusable="true" id="hud-pill-chat">Group Chat</button>' : ''}
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateProgress(this.currentTimeMs, this.durationMs);
    return overlay;
  }

  formatSubtitle() {
    const parts = [];
    if (this.seriesName) parts.push(this.seriesName);
    if (this.seasonEpisode) parts.push(this.seasonEpisode);
    if (this.subtitle && this.subtitle !== this.title) parts.push(this.subtitle);
    return parts.join(' - ');
  }

  bindEvents() {
    if (!this.container) return;

    const btnPlayPause = this.container.querySelector('#hud-btn-playpause');
    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        this.resetAutoHide();
        if (typeof this.onPlayPause === 'function') this.onPlayPause();
      });
    }

    const btnRewind10 = this.container.querySelector('#hud-btn-rewind10');
    if (btnRewind10) {
      btnRewind10.addEventListener('click', () => {
        this.resetAutoHide();
        if (typeof this.onSeekDelta === 'function') this.onSeekDelta(-10);
      });
    }

    const btnForward30 = this.container.querySelector('#hud-btn-forward30');
    if (btnForward30) {
      btnForward30.addEventListener('click', () => {
        this.resetAutoHide();
        if (typeof this.onSeekDelta === 'function') this.onSeekDelta(30);
      });
    }

    const btnPrev = this.container.querySelector('#hud-btn-prev');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.resetAutoHide();
        if (typeof this.onPreviousEpisode === 'function') this.onPreviousEpisode();
      });
    }

    const btnNext = this.container.querySelector('#hud-btn-next');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.resetAutoHide();
        if (typeof this.onNextEpisode === 'function') this.onNextEpisode();
      });
    }

    const scrubber = this.container.querySelector('#hud-scrubber-track');
    if (scrubber) {
      scrubber.addEventListener('click', (e) => {
        this.resetAutoHide();
        const rect = scrubber.getBoundingClientRect();
        const posPercent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetMs = Math.round(posPercent * this.durationMs);
        if (typeof this.onSeekTo === 'function') this.onSeekTo(targetMs);
      });
    }

    const pillAudio = this.container.querySelector('#hud-pill-audio');
    if (pillAudio) {
      pillAudio.addEventListener('click', () => {
        if (typeof this.onOpenAudioMenu === 'function') this.onOpenAudioMenu();
      });
    }

    const pillSubtitles = this.container.querySelector('#hud-pill-subtitles');
    if (pillSubtitles) {
      pillSubtitles.addEventListener('click', () => {
        if (typeof this.onOpenSubtitleMenu === 'function') this.onOpenSubtitleMenu();
      });
    }

    const pillStreams = this.container.querySelector('#hud-pill-streams');
    if (pillStreams) {
      pillStreams.addEventListener('click', () => {
        if (typeof this.onOpenStreamsMenu === 'function') this.onOpenStreamsMenu();
      });
    }

    const pillEpisodes = this.container.querySelector('#hud-pill-episodes');
    if (pillEpisodes) {
      pillEpisodes.addEventListener('click', () => {
        if (typeof this.onOpenEpisodesMenu === 'function') this.onOpenEpisodesMenu();
      });
    }

    const pillSpeed = this.container.querySelector('#hud-pill-speed');
    if (pillSpeed) {
      pillSpeed.addEventListener('click', () => {
        if (typeof this.onOpenSpeedMenu === 'function') this.onOpenSpeedMenu();
      });
    }

    const pillSleep = this.container.querySelector('#hud-pill-sleep');
    if (pillSleep) {
      pillSleep.addEventListener('click', () => {
        if (typeof this.onOpenSleepMenu === 'function') this.onOpenSleepMenu();
      });
    }

    const pillChat = this.container.querySelector('#hud-pill-chat');
    if (pillChat) {
      pillChat.addEventListener('click', () => {
        if (typeof this.onOpenChat === 'function') this.onOpenChat();
      });
    }
  }

  show() {
    if (!this.container) return;
    this.isVisible = true;
    if (this.container.classList && typeof this.container.classList.add === 'function') {
      this.container.classList.add('jellio-player-ui-visible');
    }
    this.resetAutoHide();
    if (typeof this.onVisibilityChange === 'function') {
      this.onVisibilityChange(true);
    }
  }

  hide() {
    if (!this.container) return;
    this.clearAutoHide();
    this.isVisible = false;
    if (this.container.classList && typeof this.container.classList.remove === 'function') {
      this.container.classList.remove('jellio-player-ui-visible');
    }
    if (typeof this.onVisibilityChange === 'function') {
      this.onVisibilityChange(false);
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  resetAutoHide() {
    this.clearAutoHide();
    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, this.autoHideDelayMs);
  }

  clearAutoHide() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
    const icon = this.container ? this.container.querySelector('#hud-playpause-icon') : null;
    if (icon) {
      icon.innerHTML = isPlaying
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
    }
  }

  setSpeedLabel(speed) {
    this.playbackSpeed = speed;
    const pill = this.container ? this.container.querySelector('#hud-pill-speed') : null;
    if (pill) {
      pill.textContent = speed === 1.0 ? '1x' : speed + 'x';
    }
  }

  updateProgress(currentTimeMs, durationMs, bufferedPercent = null) {
    this.currentTimeMs = currentTimeMs;
    this.durationMs = durationMs;
    if (bufferedPercent !== null) this.bufferedPercent = bufferedPercent;

    if (!this.container) return;

    const timeCurrent = this.container.querySelector('#hud-time-current');
    if (timeCurrent) timeCurrent.textContent = formatTime(currentTimeMs);

    const timeDuration = this.container.querySelector('#hud-time-duration');
    if (timeDuration) timeDuration.textContent = formatTime(durationMs);

    const percent = durationMs > 0 ? Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100)) : 0;
    const progressBar = this.container.querySelector('#hud-scrubber-progress');
    if (progressBar) progressBar.style.width = `${percent}%`;

    const thumb = this.container.querySelector('#hud-scrubber-thumb');
    if (thumb) thumb.style.left = `${percent}%`;

    if (bufferedPercent !== null) {
      const bufferBar = this.container.querySelector('#hud-scrubber-buffer');
      if (bufferBar) bufferBar.style.width = `${bufferedPercent}%`;
    }

    this.updateChapter(currentTimeMs);
  }

  updateChapter(currentTimeMs) {
    if (!this.chapters || this.chapters.length === 0 || !this.container) return;
    const currentTicks = currentTimeMs * 10000;
    let currentChapter = null;
    for (const ch of this.chapters) {
      if ((ch.StartPositionTicks || 0) <= currentTicks) {
        currentChapter = ch;
      } else {
        break;
      }
    }
    const label = this.container.querySelector('#hud-chapter-title');
    if (label) {
      label.textContent = currentChapter && currentChapter.Name ? currentChapter.Name : '';
    }
  }

  destroy() {
    this.clearAutoHide();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
