// Account switcher modal overlay matching AccountSwitcherOverlay.kt.
import { getSavedAccounts, switchAccount, removeAccount, getSession } from '../../data/session.js';
import { pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { Route } from '../router.js';
import { t } from '../../runtime/i18n.js';

export class AccountSwitcherOverlay {
  constructor(options = {}) {
    this.router = options.router || null;
    this.onSignOut = options.onSignOut || (() => {});
    this.container = null;
  }

  show() {
    this.container = document.createElement('div');
    this.container.className = 'jellio-account-switcher-overlay';
    this.container.setAttribute('data-focus-group', 'account-switcher');

    const session = getSession();
    const savedAccounts = getSavedAccounts();

    let accountsHtml = '';
    for (const acc of savedAccounts) {
      const isCurrent = session && session.userId === acc.userId;
      accountsHtml += `
        <div class="jellio-account-tile" data-focusable="true" data-action="switch" data-user-id="${acc.userId}" data-server="${acc.serverAddress}" style="display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.05);">
          <div style="width: 72px; height: 72px; border-radius: 50%; background: #222; border: 2px solid ${isCurrent ? '#fff' : '#444'}; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">
            ${(acc.userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div style="font-size: 14px; font-weight: 600; text-align: center; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.userName}</div>
          ${isCurrent ? '<div style="font-size: 11px; color: var(--jellio-trending);">Active</div>' : ''}
        </div>
      `;
    }

    // Add account tile
    accountsHtml += `
      <div class="jellio-account-tile" data-focusable="true" data-action="add-account" style="display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.05);">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px dashed #666; display: flex; align-items: center; justify-content: center; font-size: 28px;">
          +
        </div>
        <div style="font-size: 14px; font-weight: 600; text-align: center;">Add User</div>
      </div>
    `;

    this.container.innerHTML = `
      <div class="jellio-account-switcher-card">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #222; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700;">
            ${(session ? session.userName : 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style="font-size: 22px; font-weight: 700;">${session ? session.userName : 'Guest'}</h2>
            <div style="display: flex; gap: 10px; margin-top: 8px;">
              <button class="jellio-btn" data-focusable="true" data-action="view-profile" style="padding: 6px 14px; font-size: 13px;">${t('settings_view_profile', 'View Profile')}</button>
              <button class="jellio-btn" data-focusable="true" data-action="open-settings" style="padding: 6px 14px; font-size: 13px;">${t('nav_settings', 'Settings')}</button>
              <button class="jellio-btn jellio-btn-danger" data-focusable="true" data-action="sign-out" style="padding: 6px 14px; font-size: 13px; color: var(--jellio-danger);">${t('nav_log_out', 'Sign Out')}</button>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <div style="font-size: 15px; color: var(--jellio-text-secondary); margin-bottom: 12px; font-weight: 600;">${t('nav_switch_account', 'Switch Account')}</div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            ${accountsHtml}
          </div>
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
      if (e.target === this.container) {
        this.dismiss();
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-action');
      if (action === 'view-profile') {
        this.dismiss();
        if (this.router) this.router.push(Route.Profile());
      } else if (action === 'open-settings') {
        this.dismiss();
        if (this.router) this.router.switchTab(Route.Settings());
      } else if (action === 'sign-out') {
        this.dismiss();
        this.onSignOut();
      } else if (action === 'add-account') {
        this.dismiss();
        this.onSignOut();
      } else if (action === 'switch') {
        const userId = actionBtn.getAttribute('data-user-id');
        const server = actionBtn.getAttribute('data-server');
        if (userId && server) {
          switchAccount(userId, server);
          this.dismiss();
          window.location.reload();
        }
      }
    });
  }

  dismiss() {
    if (this.container) {
      popFocusTrap(this.container);
      this.container.remove();
      this.container = null;
    }
  }
}
