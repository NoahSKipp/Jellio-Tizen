// Collapsible left navigation rail (88px to 260px).
import { Route, RouteName, routesEqual } from '../router.js';
import { getSession } from '../../data/session.js';
import { focusElement } from '../../input/spatialNav.js';
import { t } from '../../runtime/i18n.js';

const ANIME_REGEX = /anime/i;

export const ICONS = {
  profile: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>`,
  home: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  search: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
  movies: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`,
  tvshows: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`,
  anime: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  library: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>`,
  feed: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 3s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  livetv: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`,
  settings: `<svg class="jellio-sidebar-item-icon" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
};

export class SidebarNav {
  constructor(options = {}) {
    this.router = options.router;
    this.onOpenAccountSwitcher = options.onOpenAccountSwitcher || (() => {});
    this.libraries = [];
    this.incomingFriendRequestsCount = 0;
    this.userAvatarUrl = null;
    this.container = null;
    this.itemsContainer = null;
    this.isExpanded = false;
    this.enabled = true;
  }

  setLibraries(libraries) {
    this.libraries = Array.isArray(libraries) ? libraries : [];
    this.render();
  }

  setIncomingFriendRequests(count) {
    this.incomingFriendRequestsCount = Number(count) || 0;
    this.updateBadges();
  }

  setUserAvatar(url) {
    this.userAvatarUrl = url || null;
    this.updateAvatar();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.container) {
      if (!this.enabled) {
        this.container.classList.add('jellio-disabled');
      } else {
        this.container.classList.remove('jellio-disabled');
      }
    }
  }

  render() {
    if (!this.container) {
      this.container = document.createElement('nav');
      this.container.className = 'jellio-sidebar';
      this.container.setAttribute('data-focus-group', 'sidebar');
      this.attachEvents();
    }

    const session = getSession();
    const currentRoute = this.router ? this.router.getCurrentRoute() : Route.Home();

    const navItems = this.buildNavItems();

    let itemsHtml = '';
    for (const item of navItems) {
      const isSelected = routesEqual(item.route, currentRoute);
      const activeClass = isSelected ? ' jellio-active' : '';

      if (item.route.name === RouteName.PROFILE) {
        const badgeVisible = this.incomingFriendRequestsCount > 0;
        const avatarImg = this.userAvatarUrl
          ? `<img class="jellio-sidebar-avatar" src="${this.userAvatarUrl}" alt="Avatar">`
          : `<div class="jellio-sidebar-avatar">${ICONS.profile}</div>`;

        itemsHtml += `
          <button class="jellio-sidebar-item${activeClass}" data-focusable="true" data-action="profile">
            ${avatarImg}
            ${badgeVisible ? '<div class="jellio-notification-dot"></div>' : ''}
            <span class="jellio-sidebar-item-label">${session ? session.userName : t('nav_profile', 'Profile')}</span>
          </button>
        `;
      } else {
        itemsHtml += `
          <button class="jellio-sidebar-item${activeClass}" data-focusable="true" data-route-id="${item.id}">
            ${item.iconSvg}
            <span class="jellio-sidebar-item-label">${item.label}</span>
          </button>
        `;
      }
    }

    this.container.innerHTML = `
      <div class="jellio-sidebar-top">
        <div class="jellio-sidebar-logo">
          <svg class="jellio-sidebar-logo-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
          <span class="jellio-sidebar-logo-text">JELLIO</span>
        </div>
        <div class="jellio-sidebar-nav-items">
          ${itemsHtml}
        </div>
      </div>
      <div class="jellio-sidebar-bottom">
        <button class="jellio-sidebar-item" data-focusable="true" data-action="settings">
          ${ICONS.settings}
          <span class="jellio-sidebar-item-label">${t('nav_settings', 'Settings')}</span>
        </button>
      </div>
    `;

    return this.container;
  }

  buildNavItems() {
    const items = [];

    // Profile item
    items.push({
      id: 'profile',
      route: Route.Profile(),
      label: t('nav_profile', 'Profile'),
      iconSvg: ICONS.profile,
    });

    // Home
    items.push({
      id: 'home',
      route: Route.Home(),
      label: t('nav_home', 'Home'),
      iconSvg: ICONS.home,
    });

    // Search
    items.push({
      id: 'search',
      route: Route.Search(),
      label: t('nav_search', 'Search'),
      iconSvg: ICONS.search,
    });

    // Dynamic library tabs
    for (const lib of this.libraries) {
      if (!lib || !lib.Id) continue;
      const colType = (lib.CollectionType || '').toLowerCase();
      if (colType === 'livetv') {
        items.push({
          id: 'livetv',
          route: Route.LiveTv(),
          label: lib.Name || t('nav_live_tv', 'Live TV'),
          iconSvg: ICONS.livetv,
        });
      } else {
        let icon = ICONS.library;
        if (ANIME_REGEX.test(lib.Name || '')) {
          icon = ICONS.anime;
        } else if (colType === 'movies') {
          icon = ICONS.movies;
        } else if (colType === 'tvshows') {
          icon = ICONS.tvshows;
        }

        items.push({
          id: `lib_${lib.Id}`,
          route: Route.LibraryTab(lib.Id, lib.Name, lib.CollectionType),
          label: lib.Name || t('nav_library', 'Library'),
          iconSvg: icon,
        });
      }
    }

    // Feed
    items.push({
      id: 'feed',
      route: Route.Feed(),
      label: t('nav_feed', 'Feed'),
      iconSvg: ICONS.feed,
    });

    return items;
  }

  attachEvents() {
    this.container.addEventListener('focusin', () => {
      this.isExpanded = true;
      this.container.classList.add('jellio-sidebar-expanded');
    });

    this.container.addEventListener('focusout', (e) => {
      if (!this.container.contains(e.relatedTarget)) {
        this.isExpanded = false;
        this.container.classList.remove('jellio-sidebar-expanded');
      }
    });

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      if (action === 'profile') {
        this.onOpenAccountSwitcher();
        return;
      }
      if (action === 'settings') {
        this.router.switchTab(Route.Settings());
        return;
      }

      const routeId = btn.getAttribute('data-route-id');
      const items = this.buildNavItems();
      const match = items.find((it) => it.id === routeId);
      if (match && this.router) {
        this.router.switchTab(match.route);
      }
    });
  }

  updateBadges() {
    if (!this.container) return;
    const profileBtn = this.container.querySelector('[data-action="profile"]');
    if (!profileBtn) return;

    let dot = profileBtn.querySelector('.jellio-notification-dot');
    if (this.incomingFriendRequestsCount > 0) {
      if (!dot) {
        dot = document.createElement('div');
        dot.className = 'jellio-notification-dot';
        profileBtn.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  }

  updateAvatar() {
    if (!this.container) return;
    const profileBtn = this.container.querySelector('[data-action="profile"]');
    if (!profileBtn) return;

    const existingAvatar = profileBtn.querySelector('.jellio-sidebar-avatar');
    if (existingAvatar) {
      if (this.userAvatarUrl) {
        existingAvatar.outerHTML = `<img class="jellio-sidebar-avatar" src="${this.userAvatarUrl}" alt="Avatar">`;
      } else {
        existingAvatar.outerHTML = `<div class="jellio-sidebar-avatar">${ICONS.profile}</div>`;
      }
    }
  }

  focusSelected() {
    if (!this.container) return;
    const selectedBtn = this.container.querySelector('.jellio-sidebar-item.jellio-active');
    if (selectedBtn) {
      focusElement(selectedBtn);
    } else {
      const first = this.container.querySelector('[data-focusable="true"]');
      if (first) focusElement(first);
    }
  }
}
