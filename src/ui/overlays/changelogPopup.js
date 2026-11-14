// Changelog popup matching ChangelogPopup.kt.
import { CURRENT_CHANGELOG, LATEST_BIG_CHANGELOG, CHANGELOG_RELEASES } from '../changelog/changelog.js';
import { ChangelogPrefs } from '../../data/prefs.js';
import { pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { t } from '../../runtime/i18n.js';

export class ChangelogPopup {
  constructor(options = {}) {
    this.release = options.release || LATEST_BIG_CHANGELOG;
    this.onDismiss = options.onDismiss || (() => {});
    this.container = null;
  }

  show() {
    this.container = document.createElement('div');
    this.container.className = 'jellio-card-dialog-scrim';
    this.container.setAttribute('data-focus-group', 'changelog-popup');

    let highlightsHtml = '';
    for (const h of this.release.highlights || []) {
      highlightsHtml += `
        <div class="jellio-changelog-highlight-card" data-focusable="true">
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: var(--jellio-text);">${h.title}</div>
          <div style="font-size: 13px; color: var(--jellio-text-secondary); line-height: 1.4;">${h.description}</div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="jellio-changelog-modal">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(181, 123, 242, 0.2); display: flex; align-items: center; justify-content: center; color: var(--jellio-rarity-epic); font-size: 20px;">
            ★
          </div>
          <div>
            <h2 style="font-size: 22px; font-weight: 700;">${this.release.title}</h2>
            <p style="font-size: 13px; color: var(--jellio-text-secondary);">${this.release.subtitle}</p>
          </div>
        </div>

        <div class="jellio-changelog-highlights" style="max-height: 340px; overflow-y: auto;">
          ${highlightsHtml}
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
          <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-action="continue" style="padding: 10px 28px; font-size: 15px; font-weight: 700; background: var(--jellio-rarity-epic); border: none; border-radius: 10px; color: #fff;">
            ${t('changelog_continue', 'Continue')}
          </button>
        </div>
      </div>
    `;

    this.attachEvents();

    const overlayRoot = document.getElementById('jellio-overlay-root');
    if (overlayRoot) {
      overlayRoot.appendChild(this.container);
      pushFocusTrap(this.container, () => this.dismiss());
    }
  }

  attachEvents() {
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="continue"]');
      if (btn) {
        ChangelogPrefs.markChangelogSeen(this.release.version);
        this.dismiss();
      }
    });
  }

  dismiss() {
    if (this.container) {
      popFocusTrap(this.container);
      this.container.remove();
      this.container = null;
      this.onDismiss();
    }
  }
}
