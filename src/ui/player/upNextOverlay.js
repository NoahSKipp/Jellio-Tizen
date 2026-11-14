// Up Next prompt card and End Screen modal with auto-play countdown.
import { shouldShowUpNextNow } from '../../runtime/skipSegments.js';
import { focusFirstIn } from '../../input/spatialNav.js';

export const DEFAULT_UP_NEXT_COUNTDOWN_SECONDS = 15;
export const NEAR_END_THRESHOLD_SECONDS = 30;

export class UpNextOverlay {
  constructor(options = {}) {
    this.options = options;
    this.parentEl = options.parentEl || null;
    this.nextEpisode = options.nextEpisode || null;
    this.recommendations = options.recommendations || [];
    this.countdown = options.countdownSeconds || DEFAULT_UP_NEXT_COUNTDOWN_SECONDS;

    this.onPlayNext = options.onPlayNext || null;
    this.onDismiss = options.onDismiss || null;
    this.onReplay = options.onReplay || null;
    this.onBack = options.onBack || null;

    this.cardContainer = null;
    this.endScreenContainer = null;
    this.countdownTimer = null;
    this.isDismissed = false;
    this.isEndScreenActive = false;
  }

  mount(parentEl) {
    this.parentEl = parentEl;
  }

  setNextEpisode(nextEpisode) {
    this.nextEpisode = nextEpisode;
  }

  setRecommendations(recs) {
    this.recommendations = recs || [];
  }

  showUpNextCard() {
    if (!this.nextEpisode || !this.parentEl || this.isDismissed || this.cardContainer) return;

    const card = document.createElement('div');
    card.className = 'jellio-upnext-card';
    card.id = 'jellio-upnext-card';
    this.cardContainer = card;

    const thumbUrl = this.nextEpisode.ImageTags?.Primary
      ? `/Items/${this.nextEpisode.Id}/Images/Primary?maxWidth=300`
      : '';

    card.innerHTML = `
      <div style="display: flex; gap: 16px; align-items: center;">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" style="width: 120px; height: 68px; object-fit: cover; border-radius: 8px;" />` : ''}
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 600; color: var(--jellio-text-secondary); text-transform: uppercase;">Next Episode</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--jellio-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
            ${this.escape(this.nextEpisode.Name || 'Next Episode')}
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="upnext-play-btn">
              Play Now (${this.countdown})
            </button>
            <button class="jellio-btn" data-focusable="true" id="upnext-dismiss-btn">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    `;

    this.parentEl.appendChild(card);

    const playBtn = card.querySelector('#upnext-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.triggerPlayNext());
    }

    const dismissBtn = card.querySelector('#upnext-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => this.dismissCard());
    }

    this.startCountdown();
    focusFirstIn(card);
  }

  startCountdown() {
    this.clearCountdown();
    this.countdownTimer = setInterval(() => {
      this.countdown -= 1;
      this.updateCountdownLabel();
      if (this.countdown <= 0) {
        this.clearCountdown();
        this.triggerPlayNext();
      }
    }, 1000);
  }

  updateCountdownLabel() {
    if (this.cardContainer) {
      const btn = this.cardContainer.querySelector('#upnext-play-btn');
      if (btn) btn.textContent = `Play Now (${this.countdown})`;
    }
    if (this.endScreenContainer) {
      const btn = this.endScreenContainer.querySelector('#endscreen-playnext-btn');
      if (btn && this.countdown > 0) {
        btn.textContent = `Play Next Episode (${this.countdown})`;
      }
    }
  }

  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  dismissCard() {
    this.isDismissed = true;
    this.clearCountdown();
    if (this.cardContainer && this.cardContainer.parentNode) {
      this.cardContainer.parentNode.removeChild(this.cardContainer);
    }
    this.cardContainer = null;
    if (typeof this.onDismiss === 'function') {
      this.onDismiss();
    }
  }

  triggerPlayNext() {
    this.clearCountdown();
    this.dismissCard();
    if (this.endScreenContainer && this.endScreenContainer.parentNode) {
      this.endScreenContainer.parentNode.removeChild(this.endScreenContainer);
      this.endScreenContainer = null;
    }
    if (typeof this.onPlayNext === 'function' && this.nextEpisode) {
      this.onPlayNext(this.nextEpisode);
    }
  }

  showEndScreen(currentTitle = '', currentSubtitle = '') {
    if (!this.parentEl || this.isEndScreenActive) return;
    this.dismissCard();
    this.isEndScreenActive = true;

    const modal = document.createElement('div');
    modal.className = 'jellio-player-overlay jellio-player-ui-visible jellio-endscreen-modal';
    modal.id = 'jellio-endscreen-modal';
    modal.style.background = 'rgba(0, 0, 0, 0.92)';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    this.endScreenContainer = modal;

    const hasNext = Boolean(this.nextEpisode);

    modal.innerHTML = `
      <div style="max-width: 820px; width: 100%; padding: 48px; background: var(--jellio-bg-elevated); border-radius: 20px; border: 1px solid var(--jellio-border);">
        ${hasNext ? `
          <div style="font-size: 14px; font-weight: 700; color: var(--jellio-secondary); letter-spacing: 1.5px; text-transform: uppercase;">UP NEXT</div>
          <h2 style="font-size: 32px; font-weight: 800; color: var(--jellio-text); margin-top: 8px;">${this.escape(this.nextEpisode.SeriesName || currentTitle)}</h2>
          <div style="display: flex; gap: 24px; margin-top: 24px; align-items: flex-start;">
            <div style="flex: 1;">
              <h3 style="font-size: 22px; font-weight: 700; color: var(--jellio-text);">${this.escape(this.nextEpisode.Name || '')}</h3>
              <p style="font-size: 15px; color: var(--jellio-text-secondary); line-height: 1.5; margin-top: 10px; max-height: 90px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;">
                ${this.escape(this.nextEpisode.Overview || '')}
              </p>
            </div>
          </div>
          <div style="display: flex; gap: 14px; margin-top: 32px;">
            <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="endscreen-playnext-btn">
              Play Next Episode ${this.countdown > 0 ? `(${this.countdown})` : ''}
            </button>
            <button class="jellio-btn" data-focusable="true" id="endscreen-replay-btn">Replay</button>
            <button class="jellio-btn" data-focusable="true" id="endscreen-back-btn">Back to Show</button>
          </div>
        ` : `
          <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); font-size: 12px; font-weight: 700; color: var(--jellio-secondary);">
            FINISHED
          </div>
          <h2 style="font-size: 36px; font-weight: 800; color: var(--jellio-text); margin-top: 14px;">${this.escape(currentTitle)}</h2>
          ${currentSubtitle ? `<div style="font-size: 18px; color: var(--jellio-text-secondary); margin-top: 4px;">${this.escape(currentSubtitle)}</div>` : ''}
          ${this.recommendations.length > 0 ? `
            <div style="margin-top: 24px;">
              <div style="font-size: 14px; font-weight: 700; color: var(--jellio-text-secondary); margin-bottom: 12px;">Related Recommendations</div>
              <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;" id="endscreen-recs-row">
                ${this.recommendations.slice(0, 4).map((rec) => `
                  <div class="jellio-endscreen-rec-card" data-focusable="true" data-rec-id="${rec.Id}" style="flex: 0 0 140px; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.06); cursor: pointer;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--jellio-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escape(rec.Name)}</div>
                    <div style="font-size: 11px; color: var(--jellio-text-secondary); margin-top: 4px;">${rec.ProductionYear || ''}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div style="display: flex; gap: 14px; margin-top: 32px;">
            <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="endscreen-replay-btn">Replay</button>
            <button class="jellio-btn" data-focusable="true" id="endscreen-back-btn">Back</button>
          </div>
        `}
      </div>
    `;

    this.parentEl.appendChild(modal);

    const playNextBtn = modal.querySelector('#endscreen-playnext-btn');
    if (playNextBtn) {
      playNextBtn.addEventListener('click', () => this.triggerPlayNext());
    }

    const replayBtn = modal.querySelector('#endscreen-replay-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        this.destroyEndScreen();
        if (typeof this.onReplay === 'function') this.onReplay();
      });
    }

    const backBtn = modal.querySelector('#endscreen-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.destroyEndScreen();
        if (typeof this.onBack === 'function') this.onBack();
      });
    }

    const recCards = modal.querySelectorAll('.jellio-endscreen-rec-card');
    recCards.forEach((rc) => {
      rc.addEventListener('click', () => {
        const recId = rc.getAttribute('data-rec-id');
        this.destroyEndScreen();
        if (typeof this.options.onSelectRecommendation === 'function') {
          this.options.onSelectRecommendation(recId);
        }
      });
    });

    if (hasNext) {
      this.startCountdown();
    }
    focusFirstIn(modal);
  }

  destroyEndScreen() {
    this.clearCountdown();
    this.isEndScreenActive = false;
    if (this.endScreenContainer && this.endScreenContainer.parentNode) {
      this.endScreenContainer.parentNode.removeChild(this.endScreenContainer);
    }
    this.endScreenContainer = null;
  }

  updatePlaybackTime(currentTimeSeconds, durationSeconds, segments) {
    if (this.isDismissed || this.cardContainer || this.isEndScreenActive || !this.nextEpisode) {
      return;
    }

    const showByCredits = shouldShowUpNextNow(segments, currentTimeSeconds, durationSeconds);
    const showByNearEnd = durationSeconds > NEAR_END_THRESHOLD_SECONDS * 2 &&
      currentTimeSeconds >= durationSeconds - NEAR_END_THRESHOLD_SECONDS &&
      currentTimeSeconds < durationSeconds;

    if (showByCredits || showByNearEnd) {
      this.showUpNextCard();
    }
  }

  destroy() {
    this.clearCountdown();
    this.dismissCard();
    this.destroyEndScreen();
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
