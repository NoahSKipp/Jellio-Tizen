// Feed screen displaying friends' watched history, ratings, and friend requests.
import { getFeed, getImageUrl, getUserImageUrl } from '../../data/api.js';
import { friendsRepository } from '../../data/friends.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

export class FeedScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.feedEntries = [];
    this.friendRequests = [];
  }

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="feed-screen">
        <div class="jellio-screen-scroll" id="feed-scroll-container">
          <div style="padding: 36px 48px;">
            <h1 class="jellio-title-hero" style="font-size: 32px; margin-bottom: 24px;">Activity Feed</h1>

            <div id="feed-requests-section" style="display: none; margin-bottom: 32px;">
              <h2 style="font-size: 20px; font-weight: 700; color: var(--jellio-trending); margin-bottom: 12px;">Friend Requests</h2>
              <div id="feed-requests-list" style="display: flex; gap: 16px; flex-wrap: wrap;"></div>
            </div>

            <div id="feed-activities-container" style="display: flex; flex-direction: column; gap: 16px; max-width: 800px;">
              <div id="feed-loading-msg" style="color: var(--jellio-text-secondary);">Loading activity...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadFeed();
  }

  async loadFeed() {
    try {
      const [feedData, friendsList] = await Promise.all([
        getFeed().catch(() => ({ Entries: [] })),
        friendsRepository.list().catch(() => []),
      ]);

      this.feedEntries = feedData.Entries || [];
      this.friendRequests = friendsList.filter((f) => f.Status === 'Pending' || f.isIncoming);

      this.renderFriendRequests();
      this.renderActivities();
      focusFirstIn(this.container);
    } catch (err) {
      console.warn('FeedScreen: failed to load feed', err);
    }
  }

  renderFriendRequests() {
    const reqSection = this.container.querySelector('#feed-requests-section');
    const reqList = this.container.querySelector('#feed-requests-list');

    if (this.friendRequests.length === 0) {
      reqSection.style.display = 'none';
      return;
    }

    reqSection.style.display = 'block';
    reqList.innerHTML = '';

    this.friendRequests.forEach((req) => {
      const card = document.createElement('div');
      card.style.background = 'var(--jellio-bg-elevated)';
      card.style.border = '1px solid var(--jellio-border)';
      card.style.borderRadius = '14px';
      card.style.padding = '16px 20px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.gap = '16px';

      card.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; color: var(--jellio-text);">${req.UserName || 'Friend'}</div>
        <div style="display: flex; gap: 8px;">
          <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="accept-req-${req.UserId}">Accept</button>
          <button class="jellio-btn" data-focusable="true" id="ignore-req-${req.UserId}">Ignore</button>
        </div>
      `;

      const acceptBtn = card.querySelector(`#accept-req-${req.UserId}`);
      const ignoreBtn = card.querySelector(`#ignore-req-${req.UserId}`);

      acceptBtn.onclick = async () => {
        try {
          await friendsRepository.acceptRequest(req.UserId);
          card.remove();
        } catch (_) {}
      };

      ignoreBtn.onclick = async () => {
        try {
          await friendsRepository.ignoreRequest(req.UserId);
          card.remove();
        } catch (_) {}
      };

      reqList.appendChild(card);
    });
  }

  renderActivities() {
    const container = this.container.querySelector('#feed-activities-container');
    container.innerHTML = '';

    if (this.feedEntries.length === 0) {
      container.innerHTML = '<div style="color: var(--jellio-text-secondary);">No recent friend activity.</div>';
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
      const posterUrl = getImageUrl(entry.ItemId, entry.ItemImageTag, 'Primary', 150);

      const actionText = entry.Type === 'Rating'
        ? `rated ${entry.Rating ? `${entry.Rating}/10` : 'a title'}`
        : 'watched';

      card.innerHTML = `
        <img src="${avatarUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #333;" alt="Avatar" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 15px; color: var(--jellio-text);">
            <strong>${entry.UserName || 'Friend'}</strong> ${actionText}
          </div>
          <div style="font-size: 17px; font-weight: 700; color: var(--jellio-text);">${entry.ItemName || 'Title'}</div>
          <div style="font-size: 12px; color: var(--jellio-text-secondary);">${entry.Date || 'Recently'}</div>
        </div>
        ${posterUrl ? `<img src="${posterUrl}" style="width: 50px; height: 75px; border-radius: 8px; object-fit: cover;" alt="Poster" />` : ''}
      `;

      card.onclick = () => {
        if (entry.ItemId && this.options.onItemSelect) {
          this.options.onItemSelect({ Id: entry.ItemId, Name: entry.ItemName });
        }
      };

      container.appendChild(card);
    });
  }

  destroy() {
    this.feedEntries = [];
    this.friendRequests = [];
  }
}
