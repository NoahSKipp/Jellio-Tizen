// Right-side slide-over drawer with 4 tabs (Now Playing, Notifications, Group Watch, Friends).
import {
  QuickHubTab,
  visibleQuickHubTabs,
  resolveQuickHubTab,
  quickHubNeighbourTab,
  quickHubPillWeight,
} from '../../runtime/quickHubLogic.js';
import { pushFocusTrap, popFocusTrap, focusFirstIn } from '../../input/spatialNav.js';
import { t } from '../../runtime/i18n.js';

export class QuickHubDrawer {
  constructor(options = {}) {
    this.session = options.session || null;
    this.router = options.router || null;
    this.friendsAvailable = Boolean(options.friendsAvailable);
    this.activeTab = QuickHubTab.NOW_PLAYING;
    this.isOpen = false;
    this.container = null;
    this.contentEl = null;
    this.onClose = options.onClose || (() => {});
    this.onHandoff = options.onHandoff || (() => {});
    this.onResumeLocal = options.onResumeLocal || (() => {});
    this.onDismissLocal = options.onDismissLocal || (() => {});

    // State data
    this.sessions = [];
    this.localPaused = null;
    this.notifications = [];
    this.groups = [];
    this.friends = [];
    this.incomingRequests = [];
  }

  setFriendsAvailable(available) {
    this.friendsAvailable = Boolean(available);
    if (!this.friendsAvailable && this.activeTab === QuickHubTab.FRIENDS) {
      this.activeTab = QuickHubTab.NOW_PLAYING;
    }
    if (this.isOpen) this.render();
  }

  updateData({ sessions, localPaused, notifications, groups, friends, incomingRequests } = {}) {
    if (sessions !== undefined) this.sessions = sessions || [];
    if (localPaused !== undefined) this.localPaused = localPaused;
    if (notifications !== undefined) this.notifications = notifications || [];
    if (groups !== undefined) this.groups = groups || [];
    if (friends !== undefined) this.friends = friends || [];
    if (incomingRequests !== undefined) this.incomingRequests = incomingRequests || [];

    if (this.isOpen) {
      this.render();
    }
  }

  open(tab = null) {
    if (tab) {
      this.activeTab = resolveQuickHubTab(tab, this.friendsAvailable);
    }
    this.isOpen = true;
    this.render();

    const overlayRoot = document.getElementById('jellio-overlay-root');
    if (overlayRoot && this.container) {
      overlayRoot.appendChild(this.container);
      setTimeout(() => {
        this.container.classList.add('jellio-drawer-open');
        pushFocusTrap(this.container, () => this.close());
      }, 16);
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.container) {
      this.container.classList.remove('jellio-drawer-open');
      popFocusTrap(this.container);
      setTimeout(() => {
        if (this.container) this.container.remove();
      }, 220);
    }
    this.onClose();
  }

  render() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'jellio-quickhub-drawer';
      this.container.setAttribute('data-focus-group', 'quickhub');
      this.attachEvents();
    }

    const tabs = visibleQuickHubTabs(this.friendsAvailable);
    const nowPlayingCount = this.sessions.length + (this.localPaused ? 1 : 0);
    const notifCount = this.notifications.filter((n) => !n.Read).length;

    let tabsHtml = '';
    for (const tab of tabs) {
      const isSelected = tab === this.activeTab;
      const selectedClass = isSelected ? ' jellio-tab-selected' : '';
      const weight = quickHubPillWeight(isSelected);

      let badgeHtml = '';
      if (tab === QuickHubTab.NOW_PLAYING && nowPlayingCount > 0) {
        badgeHtml = ` (${nowPlayingCount})`;
      } else if (tab === QuickHubTab.NOTIFICATIONS && notifCount > 0) {
        badgeHtml = ` (${notifCount})`;
      } else if (tab === QuickHubTab.FRIENDS && this.incomingRequests.length > 0) {
        badgeHtml = ` (${this.incomingRequests.length})`;
      }

      let label = tab;
      if (tab === QuickHubTab.NOW_PLAYING) label = t('quick_hub_tab_now_playing', 'Now Playing');
      else if (tab === QuickHubTab.NOTIFICATIONS) label = t('quick_hub_tab_notifications', 'Notifications');
      else if (tab === QuickHubTab.GROUP_WATCH) label = t('nav_group_watch', 'Group Watch');
      else if (tab === QuickHubTab.FRIENDS) label = t('quick_hub_tab_friends', 'Friends');

      tabsHtml += `
        <button class="jellio-quickhub-tab${selectedClass}" data-focusable="true" data-tab="${tab}" style="flex: ${weight};">
          ${label}${badgeHtml}
        </button>
      `;
    }

    this.container.innerHTML = `
      <div class="jellio-quickhub-header" style="padding: 24px 24px 12px; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 20px; font-weight: 700;">${t('quick_hub_title', 'Quick Hub')}</h2>
        <button class="jellio-btn-close" data-focusable="true" data-action="close" style="background: rgba(255,255,255,0.1); border: none; border-radius: 50%; width: 36px; height: 36px; color: #fff; cursor: pointer;">✕</button>
      </div>
      <div class="jellio-quickhub-tabs">
        ${tabsHtml}
      </div>
      <div class="jellio-quickhub-content" id="quickhub-tab-body">
        ${this.renderTabBody()}
      </div>
    `;

    return this.container;
  }

  renderTabBody() {
    switch (this.activeTab) {
      case QuickHubTab.NOW_PLAYING:
        return this.renderNowPlayingTab();
      case QuickHubTab.NOTIFICATIONS:
        return this.renderNotificationsTab();
      case QuickHubTab.GROUP_WATCH:
        return this.renderGroupWatchTab();
      case QuickHubTab.FRIENDS:
        return this.renderFriendsTab();
      default:
        return '';
    }
  }

  renderNowPlayingTab() {
    let html = '';

    if (this.localPaused) {
      html += `
        <div class="jellio-quickhub-card" style="background: rgba(255,255,255,0.06); padding: 14px; border-radius: 12px; margin-bottom: 12px;">
          <div style="font-size: 13px; color: #ff9800; font-weight: 600; margin-bottom: 4px;">LOCAL PAUSED</div>
          <div style="font-weight: 700; margin-bottom: 8px;">${this.localPaused.title || 'Untitled'}</div>
          <div style="display: flex; gap: 8px;">
            <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-action="resume-local" style="padding: 6px 14px; font-size: 13px;">Resume</button>
            <button class="jellio-btn" data-focusable="true" data-action="dismiss-local" style="padding: 6px 14px; font-size: 13px;">Dismiss</button>
          </div>
        </div>
      `;
    }

    if (this.sessions.length === 0 && !this.localPaused) {
      return `<div style="color: var(--jellio-text-secondary); text-align: center; margin-top: 40px;">${t('now_playing_empty', 'Nothing playing right now')}</div>`;
    }

    for (const sess of this.sessions) {
      const title = sess.NowPlayingItem ? sess.NowPlayingItem.Name : 'Media';
      const user = sess.UserName || 'User';
      const device = sess.DeviceName || 'Device';

      html += `
        <div class="jellio-quickhub-card" data-focusable="true" data-action="handoff" data-session-id="${sess.Id}" style="background: rgba(255,255,255,0.06); padding: 14px; border-radius: 12px; margin-bottom: 12px; cursor: pointer;">
          <div style="font-weight: 700; font-size: 16px;">${title}</div>
          <div style="font-size: 13px; color: var(--jellio-text-secondary); margin-top: 4px;">${user} on ${device}</div>
          <div style="font-size: 12px; color: var(--jellio-trending); margin-top: 6px;">Click to switch playback to this TV</div>
        </div>
      `;
    }

    return html;
  }

  renderNotificationsTab() {
    if (this.notifications.length === 0) {
      return `<div style="color: var(--jellio-text-secondary); text-align: center; margin-top: 40px;">${t('notifications_nothing_new', 'No new notifications')}</div>`;
    }

    let html = '';
    for (const n of this.notifications) {
      html += `
        <div class="jellio-quickhub-card" data-focusable="true" data-action="notif-click" data-notif-id="${n.Id}" data-item-id="${n.ItemId || ''}" style="background: rgba(255,255,255,0.06); padding: 14px; border-radius: 12px; margin-bottom: 12px; cursor: pointer;">
          <div style="font-weight: 700; font-size: 15px;">${n.Name || 'Notification'}</div>
          <div style="font-size: 13px; color: var(--jellio-text-secondary); margin-top: 4px;">${n.Description || ''}</div>
        </div>
      `;
    }
    return html;
  }

  renderGroupWatchTab() {
    let html = `
      <div style="display: flex; gap: 10px; margin-bottom: 16px;">
        <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-action="gw-create" style="flex: 1; padding: 10px;">Create Group</button>
        <button class="jellio-btn" data-focusable="true" data-action="gw-join" style="flex: 1; padding: 10px;">Join with Code</button>
      </div>
    `;

    if (this.groups.length === 0) {
      html += `<div style="color: var(--jellio-text-secondary); text-align: center; margin-top: 20px;">No active watch parties</div>`;
    } else {
      for (const g of this.groups) {
        html += `
          <div class="jellio-quickhub-card" data-focusable="true" data-action="gw-select" data-group-id="${g.GroupId}" style="background: rgba(255,255,255,0.06); padding: 14px; border-radius: 12px; margin-bottom: 10px; cursor: pointer;">
            <div style="font-weight: 700;">${g.GroupName || 'Group'}</div>
            <div style="font-size: 12px; color: var(--jellio-text-secondary);">${(g.Participants || []).length} participants</div>
          </div>
        `;
      }
    }
    return html;
  }

  renderFriendsTab() {
    let html = `
      <div style="margin-bottom: 16px;">
        <button class="jellio-btn" data-focusable="true" data-action="friend-add" style="width: 100%; padding: 10px;">+ Add Friend</button>
      </div>
    `;

    if (this.incomingRequests.length > 0) {
      html += `<div style="font-weight: 700; font-size: 14px; margin-bottom: 8px; color: var(--jellio-text-secondary);">INCOMING REQUESTS</div>`;
      for (const req of this.incomingRequests) {
        html += `
          <div class="jellio-quickhub-card" style="background: rgba(255,255,255,0.06); padding: 12px; border-radius: 12px; margin-bottom: 10px;">
            <div style="font-weight: 600; margin-bottom: 6px;">${req.UserName}</div>
            <div style="display: flex; gap: 8px;">
              <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-action="friend-accept" data-user-id="${req.UserId}" style="padding: 6px 12px; font-size: 13px;">Accept</button>
              <button class="jellio-btn" data-focusable="true" data-action="friend-decline" data-user-id="${req.UserId}" style="padding: 6px 12px; font-size: 13px;">Decline</button>
            </div>
          </div>
        `;
      }
    }

    html += `<div style="font-weight: 700; font-size: 14px; margin-top: 14px; margin-bottom: 8px; color: var(--jellio-text-secondary);">FRIENDS</div>`;
    if (this.friends.length === 0) {
      html += `<div style="color: var(--jellio-text-secondary); font-size: 13px;">No friends added yet</div>`;
    } else {
      for (const f of this.friends) {
        html += `
          <div class="jellio-quickhub-card" data-focusable="true" data-action="friend-view" data-user-id="${f.UserId}" style="background: rgba(255,255,255,0.06); padding: 12px; border-radius: 12px; margin-bottom: 8px; cursor: pointer;">
            <div style="font-weight: 600;">${f.UserName}</div>
            <div style="font-size: 12px; color: var(--jellio-text-secondary);">${f.Status || 'Offline'}</div>
          </div>
        `;
      }
    }

    return html;
  }

  attachEvents() {
    this.container.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        const tab = tabBtn.getAttribute('data-tab');
        this.activeTab = tab;
        this.render();
        focusFirstIn(this.container.querySelector('#quickhub-tab-body'));
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-action');
      if (action === 'close') {
        this.close();
      } else if (action === 'resume-local') {
        this.onResumeLocal();
        this.close();
      } else if (action === 'dismiss-local') {
        this.onDismissLocal();
        this.render();
      } else if (action === 'handoff') {
        const sessId = actionBtn.getAttribute('data-session-id');
        const sess = this.sessions.find((s) => s.Id === sessId);
        if (sess) {
          this.onHandoff(sess);
          this.close();
        }
      }
    });

    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const activeTabPill = document.activeElement ? document.activeElement.closest('[data-tab]') : null;
        if (activeTabPill) {
          const step = e.key === 'ArrowRight' ? 1 : -1;
          const visible = visibleQuickHubTabs(this.friendsAvailable);
          const nextTab = quickHubNeighbourTab(visible, this.activeTab, step);
          if (nextTab) {
            e.preventDefault();
            this.activeTab = nextTab;
            this.render();
            const targetPill = this.container.querySelector(`[data-tab="${nextTab}"]`);
            if (targetPill) targetPill.focus();
          }
        }
      }
    });
  }
}
