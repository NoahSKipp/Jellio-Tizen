// User Profile screen matching Jellio-TV ProfileScreen.kt.
// Displays user banner with gradient fade, circular avatar with preset picker,
// editable bio, Friends row, 4 stat cards, rarity-colored Achievements/Badges grid,
// and recent watch activity.
import {
  getProfile,
  getAchievements,
  setProfileBio,
  getAvatarPresets,
  setUserAvatarFromPreset,
  getBannerUrl,
  getUserImageUrl,
  getAvatarPresetUrl,
  getImageUrl,
} from '../../data/api.js';
import { getSession } from '../../data/session.js';
import { friendsRepository } from '../../data/friends.js';
import { openOnScreenKeyboard } from '../components/onScreenKeyboard.js';
import { focusFirstIn, focusElement, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { showAnnouncementToast } from '../overlays/toasts.js';

export const RARITY_COLORS = Object.freeze({
  common: '#8A90A0',
  rare: '#5B9DF0',
  epic: '#B57BF2',
  legendary: '#FF9800',
});

export class ProfileScreen {
  constructor(options = {}) {
    this.options = options;
    this.userId = options.userId || null;
    this.container = null;
    this.profile = null;
    this.achievements = [];
    this.friends = [];
    this.isDestroyed = false;
  }

  async render(container, userId = this.userId) {
    this.isDestroyed = false;
    this.container = container;
    const session = getSession();
    this.userId = userId || (session ? session.userId : '');
    const isOwner = Boolean(session && session.userId === this.userId);

    this.container.innerHTML = `
      <div class="jellio-screen jellio-profile-screen" data-focus-group="profile-screen">
        <div class="jellio-screen-scroll" id="profile-scroll-container">
          <!-- Banner & Avatar Header -->
          <div style="position: relative; width: 100%; min-height: 300px; display: flex; flex-direction: column; justify-content: flex-end; padding: 36px 52px 24px;">
            <img id="profile-banner-img" src="${getBannerUrl(this.userId)}" alt="Banner" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45;" onerror="this.style.display='none'" />
            <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(13,13,13,0.15) 0%, rgba(13,13,13,0.92) 82%, var(--jellio-bg) 100%);"></div>

            <div style="position: relative; z-index: 2; display: flex; align-items: flex-end; gap: 28px;">
              <div style="position: relative; width: 104px; height: 104px; border-radius: 50%; overflow: hidden; border: 3px solid #FFFFFF; background: #222222; flex-shrink: 0;">
                <img id="profile-avatar-img" src="${getUserImageUrl(this.userId, null, 240)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />
              </div>

              <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <h1 id="profile-username" style="font-size: 36px; font-weight: 800; color: #FFFFFF;">${session && isOwner ? session.userName : 'Profile'}</h1>
                <p id="profile-bio-text" style="font-size: 15px; color: #B3B3B3; max-width: 680px;">Loading profile...</p>
                ${
                  isOwner
                    ? `<div style="display: flex; gap: 12px; margin-top: 8px;">
                        <button class="jellio-btn" data-focusable="true" id="profile-edit-bio-btn">Edit Bio</button>
                        <button class="jellio-btn" data-focusable="true" id="profile-change-avatar-btn">Change Avatar</button>
                      </div>`
                    : ''
                }
              </div>
            </div>
          </div>

          <!-- 4 Stat Cards -->
          <div id="profile-stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; padding: 12px 52px 28px;">
            <div style="background: #1A1A1A; border: 1px solid #333333; border-radius: 16px; padding: 20px;">
              <div style="font-size: 13px; color: #B3B3B3; text-transform: uppercase; font-weight: 600;">Movies Watched</div>
              <div id="stat-movies" style="font-size: 30px; font-weight: 800; color: #FFFFFF; margin-top: 6px;">0</div>
            </div>
            <div style="background: #1A1A1A; border: 1px solid #333333; border-radius: 16px; padding: 20px;">
              <div style="font-size: 13px; color: #B3B3B3; text-transform: uppercase; font-weight: 600;">Episodes Watched</div>
              <div id="stat-episodes" style="font-size: 30px; font-weight: 800; color: #FFFFFF; margin-top: 6px;">0</div>
            </div>
            <div style="background: #1A1A1A; border: 1px solid #333333; border-radius: 16px; padding: 20px;">
              <div style="font-size: 13px; color: #B3B3B3; text-transform: uppercase; font-weight: 600;">Hours Watched</div>
              <div id="stat-hours" style="font-size: 30px; font-weight: 800; color: #FFFFFF; margin-top: 6px;">0</div>
            </div>
            <div style="background: #1A1A1A; border: 1px solid #333333; border-radius: 16px; padding: 20px;">
              <div style="font-size: 13px; color: #B3B3B3; text-transform: uppercase; font-weight: 600;">Badges Unlocked</div>
              <div id="stat-badges" style="font-size: 30px; font-weight: 800; color: var(--jellio-rarity-legendary); margin-top: 6px;">0</div>
            </div>
          </div>

          <!-- Friends Row -->
          <div id="profile-friends-section" style="padding: 0 52px 28px; display: none;">
            <h2 style="font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 14px;">Friends</h2>
            <div id="profile-friends-track" style="display: flex; gap: 16px; overflow-x: auto; padding: 6px 0;"></div>
          </div>

          <!-- Badges / Achievements Grid -->
          <div style="padding: 0 52px 32px;">
            <h2 style="font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 14px;">Achievements & Badges</h2>
            <div id="profile-badges-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;"></div>
          </div>

          <!-- Recent Activity -->
          <div id="profile-recent-section" style="padding: 0 52px 48px; display: none;">
            <h2 style="font-size: 20px; font-weight: 700; color: #FFFFFF; margin-bottom: 14px;">Recent Activity</h2>
            <div id="profile-recent-track" class="jellio-row-track" style="padding-left: 0;"></div>
          </div>
        </div>
      </div>
    `;

    if (isOwner) {
      this.bindOwnerActions();
    }

    await this.loadProfileData(isOwner);
  }

  bindOwnerActions() {
    if (!this.container) return;
    const editBioBtn = this.container.querySelector('#profile-edit-bio-btn');
    const avatarBtn = this.container.querySelector('#profile-change-avatar-btn');

    if (editBioBtn) {
      editBioBtn.onclick = () => {
        const currentBio = (this.profile && (this.profile.Bio || this.profile.bio)) || '';
        openOnScreenKeyboard({
          title: 'Edit Profile Bio',
          initialValue: currentBio,
          placeholder: 'Tell your friends what you love watching...',
          onSubmit: async (nextBio) => {
            try {
              await setProfileBio(nextBio);
              if (this.profile) this.profile.Bio = nextBio;
              const bioEl = this.container?.querySelector('#profile-bio-text');
              if (bioEl) bioEl.textContent = nextBio || 'No bio set.';
              showAnnouncementToast('Profile bio updated');
            } catch (_) {}
          },
          onConfirm: async (nextBio) => {
            try {
              await setProfileBio(nextBio);
              if (this.profile) this.profile.Bio = nextBio;
              const bioEl = this.container?.querySelector('#profile-bio-text');
              if (bioEl) bioEl.textContent = nextBio || 'No bio set.';
              showAnnouncementToast('Profile bio updated');
            } catch (_) {}
          },
        });
      };
    }

    if (avatarBtn) {
      avatarBtn.onclick = () => this.openAvatarPresetModal(avatarBtn);
    }
  }

  async openAvatarPresetModal(triggerEl) {
    const presets = await getAvatarPresets().catch(() => []);
    const overlayRoot = document.getElementById('jellio-overlay-root') || document.body;
    const scrim = document.createElement('div');
    scrim.className = 'jellio-card-dialog-scrim';
    scrim.setAttribute('data-focus-group', 'avatar-preset-modal');

    const modal = document.createElement('div');
    modal.className = 'jellio-card-dialog';
    modal.style.width = '640px';
    modal.style.maxWidth = '640px';
    modal.style.maxHeight = '75vh';
    modal.style.overflowY = 'auto';
    modal.style.padding = '24px';
    modal.innerHTML = `<div class="jellio-card-dialog-header">Choose Avatar</div>`;

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
    grid.style.gap = '16px';
    grid.style.padding = '12px 0';

    const close = () => {
      popFocusTrap(scrim);
      scrim.remove();
      if (triggerEl) focusElement(triggerEl);
    };

    if (presets.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; color: #B3B3B3;">No avatar presets found on server.</div>`;
    } else {
      presets.forEach((preset) => {
        const presetId = preset.Id || preset.id || preset;
        const btn = document.createElement('button');
        btn.className = 'jellio-btn';
        btn.setAttribute('data-focusable', 'true');
        btn.style.width = '88px';
        btn.style.height = '88px';
        btn.style.borderRadius = '50%';
        btn.style.padding = '0';
        btn.style.overflow = 'hidden';
        btn.innerHTML = `<img src="${getAvatarPresetUrl(presetId)}" alt="${presetId}" style="width: 100%; height: 100%; object-fit: cover;" />`;
        btn.onclick = async () => {
          try {
            await setUserAvatarFromPreset(this.userId, presetId);
            const avatarImg = this.container?.querySelector('#profile-avatar-img');
            if (avatarImg) avatarImg.src = getUserImageUrl(this.userId, null, 240) + '&t=' + Date.now();
            showAnnouncementToast('Avatar updated');
          } catch (_) {}
          close();
        };
        grid.appendChild(btn);
      });
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'jellio-btn';
    cancelBtn.setAttribute('data-focusable', 'true');
    cancelBtn.textContent = 'Close';
    cancelBtn.style.marginTop = '12px';
    cancelBtn.style.justifyContent = 'center';
    cancelBtn.onclick = close;

    modal.appendChild(grid);
    modal.appendChild(cancelBtn);
    scrim.appendChild(modal);
    overlayRoot.appendChild(scrim);

    pushFocusTrap(scrim, close);
    focusFirstIn(modal);
  }

  async loadProfileData(isOwner) {
    try {
      const [profileData, achData, friendsList] = await Promise.all([
        getProfile(this.userId).catch(() => ({})),
        getAchievements(this.userId).catch(() => ({ Achievements: [] })),
        friendsRepository.list().catch(() => []),
      ]);

      if (this.isDestroyed || !this.container) return;

      this.profile = profileData || {};
      this.achievements = Array.isArray(achData)
        ? achData
        : (achData && (achData.Achievements || achData.achievements)) || [];
      this.friends = Array.isArray(friendsList) ? friendsList : [];

      const nameEl = this.container.querySelector('#profile-username');
      const bioEl = this.container.querySelector('#profile-bio-text');
      if (nameEl && (this.profile.UserName || this.profile.userName)) {
        nameEl.textContent = this.profile.UserName || this.profile.userName;
      }
      if (bioEl) {
        bioEl.textContent = this.profile.Bio || this.profile.bio || 'No bio set yet.';
      }

      const stats = this.profile.Stats || this.profile.stats || {};
      const unlockedCount = this.achievements.filter((a) => a.Unlocked || a.unlocked).length;

      const setStat = (sel, val) => {
        const el = this.container?.querySelector(sel);
        if (el) el.textContent = String(val);
      };

      setStat('#stat-movies', stats.MoviesWatched ?? this.profile.MoviesWatched ?? 0);
      setStat('#stat-episodes', stats.EpisodesWatched ?? this.profile.EpisodesWatched ?? 0);
      setStat('#stat-hours', Math.round(stats.HoursWatched ?? this.profile.HoursWatched ?? 0));
      setStat('#stat-badges', unlockedCount);

      this.renderFriends();
      this.renderBadges(isOwner);
      this.renderRecentActivity();

      focusFirstIn(this.container);
    } catch (err) {
      console.warn('ProfileScreen: failed loading profile', err);
    }
  }

  renderFriends() {
    if (!this.container || this.friends.length === 0) return;
    const sec = this.container.querySelector('#profile-friends-section');
    const track = this.container.querySelector('#profile-friends-track');
    if (!sec || !track) return;

    sec.style.display = 'block';
    track.innerHTML = '';

    this.friends.forEach((f) => {
      const uid = f.UserId || f.userId;
      const uname = f.UserName || f.userName || 'Friend';
      const btn = document.createElement('button');
      btn.className = 'jellio-btn';
      btn.setAttribute('data-focusable', 'true');
      btn.style.flexDirection = 'column';
      btn.style.padding = '12px 16px';
      btn.style.borderRadius = '14px';
      btn.style.background = '#1A1A1A';
      btn.innerHTML = `
        <img src="${getUserImageUrl(uid, null, 120)}" alt="${uname}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: #333;" onerror="this.style.display='none'" />
        <span style="font-size: 14px; font-weight: 600; color: #FFFFFF; margin-top: 6px;">${uname}</span>
      `;
      btn.onclick = () => {
        if (this.options.onFriendSelect) this.options.onFriendSelect(uid);
      };
      track.appendChild(btn);
    });
  }

  renderBadges(isOwner) {
    if (!this.container) return;
    const grid = this.container.querySelector('#profile-badges-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const visibleBadges = isOwner
      ? this.achievements
      : this.achievements.filter((a) => a.Unlocked || a.unlocked);

    if (visibleBadges.length === 0) {
      grid.innerHTML = `<div style="color: #B3B3B3; font-size: 15px;">No badges unlocked yet. Keep watching to earn achievements!</div>`;
      return;
    }

    visibleBadges.forEach((ach) => {
      const unlocked = Boolean(ach.Unlocked || ach.unlocked);
      const rarity = ((ach.Rarity || ach.rarity || 'common') + '').toLowerCase();
      const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.common;
      const title = ach.Title || ach.title || ach.Name || 'Achievement';
      const desc = unlocked ? (ach.Description || ach.description || '') : 'Locked achievement';

      const card = document.createElement('div');
      card.setAttribute('data-focusable', 'true');
      card.style.background = '#1A1A1A';
      card.style.border = `1.5px solid ${unlocked ? rarityColor : '#333333'}`;
      card.style.borderRadius = '14px';
      card.style.padding = '16px';
      card.style.opacity = unlocked ? '1' : '0.5';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '6px';

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 16px; font-weight: 700; color: #FFFFFF;">${title}</span>
          <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${rarityColor};">${rarity}</span>
        </div>
        <div style="font-size: 13px; color: #B3B3B3; line-height: 1.4;">${desc}</div>
      `;

      grid.appendChild(card);
    });
  }

  renderRecentActivity() {
    if (!this.container) return;
    const recent = (this.profile && (this.profile.RecentItems || this.profile.recentItems)) || [];
    if (!Array.isArray(recent) || recent.length === 0) return;

    const sec = this.container.querySelector('#profile-recent-section');
    const track = this.container.querySelector('#profile-recent-track');
    if (!sec || !track) return;

    sec.style.display = 'block';
    track.innerHTML = '';

    recent.slice(0, 15).forEach((item) => {
      const itemId = item.Id || item.ItemId;
      const name = item.Name || item.ItemName || 'Watched Title';
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.setAttribute('data-focusable', 'true');
      const imgUrl = getImageUrl(itemId, item.PrimaryImageTag, 'Primary', 300);
      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${name}" loading="lazy" />
      `;
      card.onclick = () => {
        if (this.options.onItemSelect) this.options.onItemSelect({ Id: itemId, Name: name });
      };
      track.appendChild(card);
    });
  }

  destroy() {
    this.isDestroyed = true;
    this.profile = null;
    this.achievements = [];
    this.friends = [];
  }
}
