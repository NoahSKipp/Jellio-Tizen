// TopBar containing live clock (HomeClock) and NewNotificationsPill.
import { DisplayPreferences } from '../../data/prefs.js';
import { isImmersive } from '../router.js';

export class TopBar {
  constructor(options = {}) {
    this.router = options.router;
    this.onOpenNotifications = options.onOpenNotifications || (() => {});
    this.container = null;
    this.clockEl = null;
    this.pillEl = null;
    this.clockTimer = null;
    this.pillTimeout = null;
    this.notificationCount = 0;
  }

  mount(parentEl) {
    if (!parentEl) return;
    this.container = document.createElement('div');
    this.container.className = 'jellio-topbar-container';

    this.clockEl = document.createElement('div');
    this.clockEl.className = 'jellio-home-clock';
    this.clockEl.id = 'jellio-home-clock';
    this.container.appendChild(this.clockEl);

    this.pillEl = document.createElement('div');
    this.pillEl.className = 'jellio-notification-pill';
    this.pillEl.style.display = 'none';
    this.pillEl.setAttribute('data-focusable', 'true');
    this.pillEl.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
      <span class="jellio-notification-pill-text">Notifications</span>
      <span class="jellio-notification-pill-badge" id="topbar-pill-count">0</span>
    `;
    this.pillEl.addEventListener('click', () => {
      this.onOpenNotifications();
    });
    this.container.appendChild(this.pillEl);

    parentEl.appendChild(this.container);

    this.startClock();
    this.updateClock();

    if (this.router) {
      this.router.subscribe((route) => {
        const immersive = isImmersive(route);
        if (immersive) {
          this.container.style.display = 'none';
        } else {
          this.container.style.display = 'block';
        }
      });
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

    if (!use24h) {
      hours = hours % 12 || 12;
    }
    const formattedHours = String(hours).padStart(2, '0');
    this.clockEl.textContent = `${formattedHours}:${minutes}`;
  }

  showNotificationPill(count, durationMs = 4000) {
    if (!this.pillEl) return;
    this.notificationCount = Number(count) || 0;
    if (this.notificationCount <= 0) {
      this.hideNotificationPill();
      return;
    }

    const badge = this.pillEl.querySelector('#topbar-pill-count');
    if (badge) badge.textContent = String(this.notificationCount);

    this.pillEl.style.display = 'flex';
    this.pillEl.classList.add('jellio-pill-visible');

    if (this.pillTimeout) clearTimeout(this.pillTimeout);
    if (durationMs > 0) {
      this.pillTimeout = setTimeout(() => {
        this.hideNotificationPill();
      }, durationMs);
    }
  }

  hideNotificationPill() {
    if (!this.pillEl) return;
    this.pillEl.style.display = 'none';
    this.pillEl.classList.remove('jellio-pill-visible');
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
