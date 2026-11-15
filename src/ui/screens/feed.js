// Feed screen displaying friends' watched history, ratings, friend requests, and Find Friends modal.
import { getFeed, getCommunityUsers, getImageUrl, getUserImageUrl } from '../../data/api.js';
import { friendsRepository } from '../../data/friends.js';
import { focusFirstIn, focusElement, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { showAnnouncementToast } from '../overlays/toasts.js';

export class FeedScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.feedEntries = [];
    this.friendRequests = [];
    this.isDestroyed = false;
  }

  async render(container) {
    this.isDestroyed = false;
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="feed-screen">
        <div class="jellio-screen-scroll" id="feed-scroll-container">
          <div style="padding: 36px 52px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
              <h1 class="jellio-title-hero" style="font-size: 32px;">Activity Feed</h1>
              <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="feed-find-friends-btn">+ Find Friends</button>
            </div>

            <div id="feed-requests-section" style="display: none; margin-bottom: 32px;">
              <h2 style="font-size: 20px; font-weight: 700; color: var(--jellio-trending); margin-bottom: 12px;">Friend Requests</h2>
              <div id="feed-requests-list" style="display: flex; gap: 16px; flex-wrap: wrap;"></div>
            </div>

            <div id="feed-activities-container" style="display: flex; flex-direction: column; gap: 16px; max-width: 840px;">
              <div id="feed-loading-msg" style="color: var(--jellio-text-secondary);">Loading activity...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const findFriendsBtn = this.container.querySelector('#feed-find-friends-btn');
    if (findFriendsBtn) {
      findFriendsBtn.onclick = () => this.openFindFriendsModal(findFriendsBtn);
    }

    await this.loadFeed();
  }

  async openFindFriendsModal(triggerEl) {
    const users = await getCommunityUsers().catch(() => []);
    const overlayRoot = document.getElementById('jellio-overlay-root') || document.body;
    const scrim = document.createElement('div');
    scrim.className = 'jellio-card-dialog-scrim';
    scrim.setAttribute('data-focus-group', 'find-friends-modal');

    const modal = document.createElement('div');
    modal.className = 'jellio-card-dialog';
    modal.style.width = '540px';
    modal.style.maxHeight = '70vh';
    modal.style.overflowY = 'auto';
    modal.innerHTML = `<div class="jellio-card-dialog-header">Find Friends on Server</div>`;

    const close = () => {
      popFocusTrap(scrim);
      scrim.remove();
      if (triggerEl) focusElement(triggerEl);
    };

    if (users.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '16px';
      empty.style.color = '#B3B3B3';
      empty.textContent = 'No other public users found on this server.';
      modal.appendChild(empty);
    } else {
      users.forEach((u) => {
        const uid = u.UserId || u.Id;
        const uname = u.UserName || u.Name || 'User';
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '10px 16px';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${getUserImageUrl(uid, null, 80)}" alt="${uname}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: #333;" onerror="this.style.display='none'" />
            <span style="font-size: 16px; font-weight: 600; color: #FFFFFF;">${uname}</span>
          </div>
          <button class="jellio-btn" data-focusable="true">Send Request</button>
        `;
        const sendBtn = row.querySelector('button');
        sendBtn.onclick = async () => {
          try {
            await friendsRepository.sendRequest(uid);
            sendBtn.textContent = 'Sent';
            sendBtn.disabled = true;
            showAnnouncementToast(`Friend request sent to ${uname}`);
          } catch (_) {}
        };
        modal.appendChild(row);
      });
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'jellio-btn';
    closeBtn.setAttribute('data-focusable', 'true');
    closeBtn.textContent = 'Close';
    closeBtn.style.margin = '12px 16px 4px';
    closeBtn.style.justifyContent = 'center';
    closeBtn.onclick = close;
    modal.appendChild(closeBtn);

    scrim.appendChild(modal);
    overlayRoot.appendChild(scrim);
    pushFocusTrap(scrim, close);
    focusFirstIn(modal);
  }

  async loadFeed() {
    try {
      const [feedData, friendsState] = await Promise.all([
        getFeed().catch(() => []),
        friendsRepository.refresh().catch(() => ({ friends: [], incoming: [] })),
      ]);

      if (this.isDestroyed || !this.container) return;

      this.feedEntries = Array.isArray(feedData) ? feedData : (feedData && feedData.Entries) || [];
      this.friendRequests = (friendsState && friendsState.incoming) || [];

      this.renderFriendRequests();
      this.renderActivities();
      focusFirstIn(this.container);
    } catch (err) {
      console.warn('FeedScreen: failed to load feed', err);
    }
  }

  renderFriendRequests() {
    if (!this.container) return;
    const reqSection = this.container.querySelector('#feed-requests-section');
    const reqList = this.container.querySelector('#feed-requests-list');

    if (this.friendRequests.length === 0) {
      reqSection.style.display = 'none';
      return;
    }

    reqSection.style.display = 'block';
    reqList.innerHTML = '';

    this.friendRequests.forEach((req) => {
      const uid = req.UserId || req.userId;
      const uname = req.UserName || req.userName || 'Friend';
      const card = document.createElement('div');
      card.style.background = 'var(--jellio-bg-elevated)';
      card.style.border = '1px solid var(--jellio-border)';
      card.style.borderRadius = '14px';
      card.style.padding = '16px 20px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.gap = '16px';

      card.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; color: var(--jellio-text);">${uname}</div>
        <div style="display: flex; gap: 8px;">
          <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-accept="${uid}">Accept</button>
          <button class="jellio-btn" data-focusable="true" data-ignore="${uid}">Ignore</button>
        </div>
      `;

      card.querySelector(`[data-accept="${uid}"]`).onclick = async () => {
        try {
          await friendsRepository.acceptRequest(uid);
          card.remove();
        } catch (_) {}
      };

      card.querySelector(`[data-ignore="${uid}"]`).onclick = async () => {
        try {
          await friendsRepository.declineRequest(uid);
          card.remove();
        } catch (_) {}
      };

      reqList.appendChild(card);
    });
  }

  renderActivities() {
    if (!this.container) return;
    const container = this.container.querySelector('#feed-activities-container');
    container.innerHTML = '';

    if (this.feedEntries.length === 0) {
      container.innerHTML = '<div style="color: var(--jellio-text-secondary);">No recent friend activity yet. Add friends to see what they are watching!</div>';
      return;
    }

    this.feedEntries.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'jellio-feed-card';
      card.style.background = 'var(--jellio-bg-elevated)';
      card.style.border = '1px solid var(--jellio-border)';
      card.style.borderRadius = '16px';
      card.style.padding = '16px 20px';
      card.style.display = 'flex';
      card.style.gap = '16px';
      card.style.alignItems = 'center';
      card.setAttribute('data-focusable', 'true');

      const avatarUrl = getUserImageUrl(entry.UserId, null, 100);
      const posterUrl = entry.ItemId ? getImageUrl(entry.ItemId, entry.ItemImageTag, 'Primary', 150) : '';

      const actionText =
        entry.Type === 'Rating'
          ? `rated ${entry.Rating ? `${entry.Rating}/10` : 'a title'}`
          : 'watched';

      card.innerHTML = `
        <img src="${avatarUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #333;" alt="Avatar" onerror="this.style.display='none'" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 15px; color: var(--jellio-text);">
            <strong>${entry.UserName || 'Friend'}</strong> ${actionText}
          </div>
          <div style="font-size: 17px; font-weight: 700; color: var(--jellio-text);">${entry.ItemName || 'Title'}</div>
          <div style="font-size: 12px; color: var(--jellio-text-secondary);">${entry.Date || 'Recently'}</div>
        </div>
        ${posterUrl ? `<img src="${posterUrl}" style="width: 50px; height: 75px; border-radius: 8px; object-fit: cover;" alt="Poster" onerror="this.style.display='none'" />` : ''}
      `;

      card.onclick = () => {
        if (entry.ItemId && this.options.onItemSelect) {
          this.options.onItemSelect({ Id: entry.ItemId, Name: entry.ItemName });
        } else if (entry.UserId && this.options.onUserSelect) {
          this.options.onUserSelect(entry.UserId);
        }
      };

      container.appendChild(card);
    });
  }

  destroy() {
    this.isDestroyed = true;
    this.feedEntries = [];
    this.friendRequests = [];
  }
}
