// TopBar containing live clock (HomeClock) and QuickHubEntry pill matching HomeClock.kt and HomeScreen.kt.
import { DisplayPreferences } from '../../data/prefs.js';
import { isImmersive } from '../router.js';

export class TopBar {
  constructor(options = {}) {
    this.router = options.router;
    this.onOpenNotifications = options.onOpenNotifications || (() => {});
    this.onOpenQuickHub = options.onOpenQuickHub || options.onOpenNotifications || (() => {});
    this.container = null;
    this.clockEl = null;
    this.quickHubEl = null;
    this.clockTimer = null;
    this.pillTimeout = null;
    this.notificationCount = 0;
    this.nowPlayingState = {
      activeCount: 0,
      title: '',
      isPaused: false,
    };
  }

  render() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'jellio-topbar-fixture';

      // QuickHubEntry pill button
      this.quickHubEl = document.createElement('button');
      this.quickHubEl.className = 'jellio-quickhub-pill';
      this.quickHubEl.setAttribute('data-focusable', 'true');
      this.quickHubEl.innerHTML = this.renderQuickHubContent();
      this.quickHubEl.addEventListener('click', () => {
        this.onOpenQuickHub();
      });
      this.container.appendChild(this.quickHubEl);

      // HomeClock
      this.clockEl = document.createElement('div');
      this.clockEl.className = 'jellio-home-clock';
      this.clockEl.id = 'jellio-home-clock';
      this.container.appendChild(this.clockEl);

      this.startClock();
      this.updateClock();

      if (this.router) {
        this.router.subscribe((route) => {
          const immersive = isImmersive(route);
          if (immersive) {
            this.container.style.display = 'none';
          } else {
            this.container.style.display = 'flex';
          }
        });
      }
    }
    return this.container;
  }

  mount(parentEl) {
    if (!parentEl) return;
    parentEl.appendChild(this.render());
  }

  renderQuickHubContent() {
    if (this.nowPlayingState.activeCount > 0) {
      const stateText = this.nowPlayingState.isPaused ? 'Paused' : (this.nowPlayingState.title || 'Now Playing');
      const dotClass = this.nowPlayingState.isPaused ? 'jellio-nowplaying-dot paused' : 'jellio-nowplaying-dot pulsing';
      return `
        <span class="${dotClass}"></span>
        <span class="jellio-quickhub-pill-text">${stateText}</span>
      `;
    }

    const hasBadge = this.notificationCount > 0;
    const badgeHtml = hasBadge ? `<span class="jellio-quickhub-badge">${this.notificationCount}</span>` : '';
    return `
      <svg class="jellio-quickhub-icon" viewBox="0 0 24 24">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
      <span class="jellio-quickhub-pill-text">Quick Hub</span>
      ${badgeHtml}
    `;
  }

  setNowPlayingState(state = {}) {
    this.nowPlayingState = {
      activeCount: Number(state.activeCount) || 0,
      title: state.title || '',
      isPaused: Boolean(state.isPaused),
    };
    if (this.quickHubEl) {
      this.quickHubEl.innerHTML = this.renderQuickHubContent();
    }
  }

  startClock() {
    this.stopClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }

  stopClock() {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  updateClock() {
    if (!this.clockEl) return;
    const showClock = DisplayPreferences.getShowClock();
    if (!showClock) {
      this.clockEl.style.display = 'none';
      return;
    }
    this.clockEl.style.display = 'flex';

    const use24h = DisplayPreferences.getClockUse24h();
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    let period = null;

    if (!use24h) {
      period = hours < 12 ? 'AM' : 'PM';
      hours = hours % 12 || 12;
    }
    const formattedHours = use24h ? String(hours).padStart(2, '0') : String(hours);

    if (period) {
      this.clockEl.innerHTML = `
        <span class="jellio-clock-time">${formattedHours}:${minutes}</span>
        <span class="jellio-clock-period">${period}</span>
      `;
    } else {
      this.clockEl.innerHTML = `
        <span class="jellio-clock-time">${formattedHours}:${minutes}</span>
      `;
    }
  }

  showNotificationPill(count, durationMs = 4000) {
    this.notificationCount = Number(count) || 0;
    if (this.quickHubEl) {
      this.quickHubEl.innerHTML = this.renderQuickHubContent();
      this.quickHubEl.classList.add('jellio-pill-visible');
    }

    if (this.pillTimeout) clearTimeout(this.pillTimeout);
    if (durationMs > 0) {
      this.pillTimeout = setTimeout(() => {
        this.hideNotificationPill();
      }, durationMs);
    }
  }

  hideNotificationPill() {
    if (!this.quickHubEl) return;
    this.quickHubEl.classList.remove('jellio-pill-visible');
    if (this.pillTimeout) {
      clearTimeout(this.pillTimeout);
      this.pillTimeout = null;
    }
  }

  destroy() {
    this.stopClock();
    if (this.pillTimeout) clearTimeout(this.pillTimeout);
    if (this.container) this.container.remove();
  }
}
