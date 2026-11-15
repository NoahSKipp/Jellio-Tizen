// Home screen matching Jellio-TV HomeScreen.kt & HomeViewModel.kt.
// Top 48%: ShowcaseHost (backdrop, ClearLogo/title, metadata row, 3-line overview of focused card).
// Top-Right: TopBar (QuickHub pill + HomeClock).
// Bottom 52%: Vertically scrolling rows (Continue Watching, Next Up, Watchlist, Studio Hubs,
// Coming Soon, Community Watching, Trending, Popular, Top Rated, Seasonal, and Genre rows)
// plus inline Home Edit Mode for reordering and hiding rows.
import {
  getResumeItems,
  getNextUp,
  getWatchlistItems,
  getHeroCandidates,
  getSeasonalItems,
  getCalendarEntries,
  getCommunityWatching,
  getLibraryItems,
  discoverGenres,
  getGenreItems,
  toggleFavorite,
  setPlayed,
  clearResumePosition,
  hideSeriesFromNextUp,
  hideFromComingSoon,
  getImageUrl,
  getUserImageUrl,
  getServiceLogoUrl,
} from '../../data/api.js';
import { getSession } from '../../data/session.js';
import { HomeRowPreferences } from '../../data/prefs.js';
import { ShowcaseHost } from '../components/showcase.js';
import {
  CardAspectRatio,
  renderPosterCard,
  renderPosterRow,
  renderStudioHubRow,
  renderComingSoonRow,
} from '../components/posterCard.js';
import { TopBar } from '../nav/topBar.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';
import { showAnnouncementToast } from '../overlays/toasts.js';

export const STREAMING_SERVICES = [
  'Netflix',
  'Disney+',
  'Prime Video',
  'Apple TV+',
  'Max',
  'Hulu',
  'Paramount+',
  'Peacock',
  'Crunchyroll',
  'Discovery+',
];

export const DEFAULT_HOME_ROW_SPECS = [
  { id: 'continue_watching', title: 'Continue Watching', aspectRatio: CardAspectRatio.PORTRAIT, progress: true },
  { id: 'next_up', title: 'Next Up', aspectRatio: CardAspectRatio.PORTRAIT, progress: true },
  { id: 'watchlist', title: 'Watchlist', aspectRatio: CardAspectRatio.PORTRAIT },
  { id: 'studio_hubs', title: 'Streaming Services', isStudioHub: true },
  { id: 'coming_soon', title: 'Coming Soon', isComingSoon: true },
  { id: 'community', title: 'What Others Are Watching', aspectRatio: CardAspectRatio.PORTRAIT },
  { id: 'trending_movies', title: 'Trending Movies', aspectRatio: CardAspectRatio.PORTRAIT },
  { id: 'trending_series', title: 'Trending Shows', aspectRatio: CardAspectRatio.PORTRAIT },
  { id: 'top_rated', title: 'Top Rated', aspectRatio: CardAspectRatio.PORTRAIT },
  { id: 'seasonal', title: 'Seasonal Picks', aspectRatio: CardAspectRatio.PORTRAIT },
];

export const DEFAULT_ROW_KEYS = DEFAULT_HOME_ROW_SPECS.map((r) => r.id);

export class HomeScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.showcase = null;
    this.topBar = null;
    this.rowsData = new Map();
    this.dynamicGenreSpecs = [];
    this.isEditMode = Boolean(options.editMode);
    this.watchlistPollTimer = null;
    this.isDestroyed = false;
  }

  async render(container) {
    this.isDestroyed = false;
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen jellio-home-screen" data-focus-group="home-screen">
        <div id="home-showcase-mount" class="jellio-home-showcase-mount"></div>
        <div id="home-topbar-mount"></div>
        <div class="jellio-home-rows-viewport" id="home-rows-viewport">
          <div id="home-edit-banner" style="display: none; align-items: center; justify-content: space-between; margin: 0 52px 18px; padding: 14px 22px; background: rgba(26, 26, 26, 0.92); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px;">
            <div>
              <div style="font-size: 18px; font-weight: 700; color: #FFFFFF;">Customize Home Rows</div>
              <div style="font-size: 13px; color: #B3B3B3;">Move rows up or down, toggle visibility, or reset to default order.</div>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="jellio-btn" data-focusable="true" id="home-edit-reset-btn">Reset Default</button>
              <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="home-edit-done-btn">Done</button>
            </div>
          </div>
          <div id="home-rows-container" class="jellio-home-rows-list">
            <div id="home-loading-state" style="padding: 36px 52px; color: #B3B3B3; font-size: 16px;">Loading your home rows...</div>
          </div>
        </div>
      </div>
    `;

    // Mount ShowcaseHost in top 48%
    const showcaseMount = this.container.querySelector('#home-showcase-mount');
    this.showcase = new ShowcaseHost();
    this.showcase.mount(showcaseMount);

    // Mount TopBar (QuickHub pill + HomeClock) in top-right
    const topBarMount = this.container.querySelector('#home-topbar-mount');
    this.topBar = new TopBar({
      onOpenQuickHub: () => {
        if (this.options.onOpenQuickHub) this.options.onOpenQuickHub();
      },
    });
    topBarMount.appendChild(this.topBar.render());

    this.bindEditBannerEvents();
    await this.loadAllData();
    this.startWatchlistPolling();
  }

  bindEditBannerEvents() {
    if (!this.container) return;
    const resetBtn = this.container.querySelector('#home-edit-reset-btn');
    const doneBtn = this.container.querySelector('#home-edit-done-btn');

    if (resetBtn) {
      resetBtn.onclick = () => {
        if (typeof HomeRowPreferences.reset === 'function') {
          HomeRowPreferences.reset();
        } else {
          HomeRowPreferences.setRowOrder([]);
          HomeRowPreferences.setHiddenRows([]);
        }
        this.renderRows();
        showAnnouncementToast('Home rows reset to default');
      };
    }

    if (doneBtn) {
      doneBtn.onclick = () => {
        this.isEditMode = false;
        this.renderRows();
      };
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this.renderRows();
  }

  getAllSpecs() {
    return [...DEFAULT_HOME_ROW_SPECS, ...this.dynamicGenreSpecs];
  }

  getOrderedRowSpecs() {
    const allSpecs = this.getAllSpecs();
    const savedOrder = HomeRowPreferences.getRowOrder() || [];
    const hiddenSet = new Set(HomeRowPreferences.getHiddenRows() || []);

    const specMap = new Map(allSpecs.map((r) => [r.id, r]));
    const ordered = [];

    for (const id of savedOrder) {
      if (specMap.has(id)) {
        ordered.push(specMap.get(id));
        specMap.delete(id);
      }
    }
    for (const remaining of specMap.values()) {
      ordered.push(remaining);
    }

    if (this.isEditMode) {
      return ordered.map((r) => ({ ...r, hidden: hiddenSet.has(r.id) }));
    }
    return ordered.filter((r) => !hiddenSet.has(r.id));
  }

  async loadAllData() {
    const session = getSession();
    const userId = session ? session.userId : '';

    try {
      const [
        resume,
        nextUp,
        watchlist,
        calendar,
        community,
        trendingMoviesRes,
        trendingSeriesRes,
        topRatedRes,
        seasonal,
        genres,
      ] = await Promise.all([
        getResumeItems(20).catch(() => []),
        getNextUp(20).catch(() => []),
        getWatchlistItems(40).catch(() => []),
        getCalendarEntries().catch(() => []),
        getCommunityWatching().catch(() => []),
        getLibraryItems(userId, {
          includeItemTypes: 'Movie',
          sortBy: 'DateCreated,CommunityRating',
          sortOrder: 'Descending',
          limit: 20,
        }).catch(() => ({ Items: [] })),
        getLibraryItems(userId, {
          includeItemTypes: 'Series',
          sortBy: 'DateCreated,CommunityRating',
          sortOrder: 'Descending',
          limit: 20,
        }).catch(() => ({ Items: [] })),
        getLibraryItems(userId, {
          includeItemTypes: 'Movie,Series',
          sortBy: 'CommunityRating',
          sortOrder: 'Descending',
          limit: 20,
        }).catch(() => ({ Items: [] })),
        getSeasonalItems(20).catch(() => []),
        discoverGenres(userId, null, 'Movie,Series', 4).catch(() => []),
      ]);

      if (this.isDestroyed) return;

      this.rowsData.set('continue_watching', resume || []);
      this.rowsData.set('next_up', nextUp || []);
      this.rowsData.set('watchlist', watchlist || []);
      this.rowsData.set('studio_hubs', STREAMING_SERVICES);
      this.rowsData.set('coming_soon', calendar || []);
      this.rowsData.set('community', community || []);
      this.rowsData.set('trending_movies', (trendingMoviesRes && trendingMoviesRes.Items) || []);
      this.rowsData.set('trending_series', (trendingSeriesRes && trendingSeriesRes.Items) || []);
      this.rowsData.set('top_rated', (topRatedRes && topRatedRes.Items) || []);
      this.rowsData.set('seasonal', seasonal || []);

      // Load top 4 genre rows
      this.dynamicGenreSpecs = [];
      if (Array.isArray(genres) && genres.length > 0) {
        const genreResults = await Promise.all(
          genres.slice(0, 4).map(async (genre) => {
            const items = await getGenreItems(userId, null, null, genre, 20).catch(() => []);
            return { genre, items: items || [] };
          })
        );
        for (const { genre, items } of genreResults) {
          if (items.length > 0) {
            const id = `genre_${genre.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
            this.dynamicGenreSpecs.push({
              id,
              title: genre,
              aspectRatio: CardAspectRatio.PORTRAIT,
            });
            this.rowsData.set(id, items);
          }
        }
      }

      // Set initial fallback item for ShowcaseHost
      const firstHeroItem =
        (resume && resume[0]) ||
        (nextUp && nextUp[0]) ||
        (watchlist && watchlist[0]) ||
        (trendingMoviesRes?.Items && trendingMoviesRes.Items[0]) ||
        (trendingSeriesRes?.Items && trendingSeriesRes.Items[0]) ||
        (topRatedRes?.Items && topRatedRes.Items[0]) ||
        null;

      if (firstHeroItem && this.showcase) {
        this.showcase.setFallbackItem(firstHeroItem);
        this.showcase.setHighlightedItem(firstHeroItem);
      }

      this.renderRows();

      // Focus the first card in the first row
      const rowsContainer = this.container?.querySelector('#home-rows-container');
      if (rowsContainer) {
        focusFirstIn(rowsContainer);
      }
    } catch (err) {
      console.warn('HomeScreen: failed loading data', err);
    }
  }

  startWatchlistPolling() {
    this.stopWatchlistPolling();
    this.watchlistPollTimer = setInterval(async () => {
      if (this.isDestroyed || !this.container) return;
      try {
        const freshWatchlist = await getWatchlistItems(40);
        if (this.isDestroyed) return;
        const prev = this.rowsData.get('watchlist') || [];
        const prevIds = prev.map((i) => i.Id).join(',');
        const nextIds = (freshWatchlist || []).map((i) => i.Id).join(',');
        if (prevIds !== nextIds) {
          this.rowsData.set('watchlist', freshWatchlist || []);
          this.renderRows(true);
        }
      } catch (_) {}
    }, 20000);
  }

  stopWatchlistPolling() {
    if (this.watchlistPollTimer) {
      clearInterval(this.watchlistPollTimer);
      this.watchlistPollTimer = null;
    }
  }

  handleCardFocus(item, cardEl) {
    if (this.showcase && item) {
      this.showcase.setHighlightedItem(item);
    }
    // Keep focused row aligned near the top of the bottom 52% rows viewport
    const viewport = this.container?.querySelector('#home-rows-viewport');
    const rowEl = cardEl?.closest('.jellio-row-container');
    if (viewport && rowEl) {
      const targetTop = Math.max(0, rowEl.offsetTop - 12);
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        viewport.scrollTop = targetTop;
      }
    }
  }

  renderRows(preserveFocus = false) {
    if (!this.container) return;
    const rowsContainer = this.container.querySelector('#home-rows-container');
    const editBanner = this.container.querySelector('#home-edit-banner');
    if (!rowsContainer) return;

    const prevFocusedId = preserveFocus
      ? document.activeElement?.getAttribute('data-item-id')
      : null;

    if (editBanner) {
      editBanner.style.display = this.isEditMode ? 'flex' : 'none';
    }

    rowsContainer.innerHTML = '';
    const specs = this.getOrderedRowSpecs();

    specs.forEach((spec, idx) => {
      const data = this.rowsData.get(spec.id) || [];
      if (!this.isEditMode && data.length === 0) return;

      if (this.isEditMode) {
        const editRowWrap = document.createElement('div');
        editRowWrap.className = 'jellio-row-container';
        editRowWrap.style.padding = '12px 52px';
        editRowWrap.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #1A1A1A; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 20px;">
            <span style="font-size: 18px; font-weight: 600; color: ${spec.hidden ? '#808080' : '#FFFFFF'};">
              ${spec.title} ${spec.hidden ? '(Hidden)' : ''}
            </span>
            <div style="display: flex; gap: 10px;">
              <button class="jellio-btn" data-focusable="true" data-edit-move="up" data-row-idx="${idx}">Move Up</button>
              <button class="jellio-btn" data-focusable="true" data-edit-move="down" data-row-idx="${idx}">Move Down</button>
              <button class="jellio-btn ${spec.hidden ? '' : 'jellio-btn-primary'}" data-focusable="true" data-edit-toggle="${spec.id}">
                ${spec.hidden ? 'Show Row' : 'Hide Row'}
              </button>
            </div>
          </div>
        `;

        editRowWrap.querySelector('[data-edit-move="up"]').onclick = () => this.moveRow(idx, -1);
        editRowWrap.querySelector('[data-edit-move="down"]').onclick = () => this.moveRow(idx, 1);
        editRowWrap.querySelector(`[data-edit-toggle="${spec.id}"]`).onclick = () => this.toggleRowVisibility(spec.id);
        rowsContainer.appendChild(editRowWrap);
        return;
      }

      if (spec.isStudioHub) {
        if (typeof renderStudioHubRow === 'function') {
          const hubRow = renderStudioHubRow(data, {
            title: spec.title,
            logoUrl: (serviceName) => getServiceLogoUrl(serviceName),
            onServiceClick: (serviceName) => {
              if (this.options.onServiceSelect) {
                this.options.onServiceSelect(serviceName);
              }
            },
          });
          rowsContainer.appendChild(hubRow);
        }
        return;
      }

      if (spec.isComingSoon && typeof renderComingSoonRow === 'function') {
        const comingSoonRow = renderComingSoonRow(data, {
          title: spec.title,
          onSelect: (item) => {
            if (this.options.onItemSelect) this.options.onItemSelect(item);
          },
          onFocus: (item, cardEl) => this.handleCardFocus(item, cardEl),
          onRemoveFromComingSoon: async (item) => {
            await hideFromComingSoon(item.Id || item.ItemId);
            const filtered = data.filter((i) => (i.Id || i.ItemId) !== (item.Id || item.ItemId));
            this.rowsData.set('coming_soon', filtered);
            this.renderRows(true);
          },
        });
        if (comingSoonRow) rowsContainer.appendChild(comingSoonRow);
        return;
      }

      if (typeof renderPosterRow === 'function') {
        const rowEl = renderPosterRow(
          { key: spec.id, title: spec.title, items: data },
          {
            progress: Boolean(spec.progress),
            aspectRatio: spec.aspectRatio || CardAspectRatio.PORTRAIT,
            imageUrl: (item, type, maxWidth) => {
              const tag = item?.ImageTags?.[type] || item?.PrimaryImageTag || item?.BackdropImageTags?.[0] || null;
              return getImageUrl(item?.Id, tag, type, maxWidth);
            },
            userImageUrl: (uid, tag) => getUserImageUrl(uid, tag, 100),
            onSelect: (item) => {
              if (spec.id === 'continue_watching' && this.options.onPlayItem) {
                this.options.onPlayItem(item);
              } else if (this.options.onItemSelect) {
                this.options.onItemSelect(item);
              }
            },
            onFocus: (item, cardEl) => this.handleCardFocus(item, cardEl),
            onToggleWatchlist: async (item) => {
              const isFav = Boolean(item?.UserData?.IsFavorite);
              await toggleFavorite(item.Id, !isFav);
              if (item.UserData) item.UserData.IsFavorite = !isFav;
              const fresh = await getWatchlistItems(40).catch(() => []);
              this.rowsData.set('watchlist', fresh);
              this.renderRows(true);
            },
            onToggleWatched: async (item) => {
              const isPlayed = Boolean(item?.UserData?.Played);
              await setPlayed(item.Id, !isPlayed);
              if (item.UserData) item.UserData.Played = !isPlayed;
              this.renderRows(true);
            },
            onRemoveFromRow:
              spec.id === 'continue_watching'
                ? async (item) => {
                    await clearResumePosition(item.Id);
                    this.rowsData.set(
                      'continue_watching',
                      data.filter((i) => i.Id !== item.Id)
                    );
                    this.renderRows(true);
                  }
                : spec.id === 'next_up'
                  ? async (item) => {
                      if (item.SeriesId) {
                        await hideSeriesFromNextUp(item.SeriesId);
                      } else {
                        await setPlayed(item.Id, true);
                      }
                      this.rowsData.set(
                        'next_up',
                        data.filter((i) => i.Id !== item.Id)
                      );
                      this.renderRows(true);
                    }
                  : null,
          }
        );
        if (rowEl) rowsContainer.appendChild(rowEl);
      } else {
        // Fallback row builder if renderPosterRow isn't loaded yet
        const sectionEl = document.createElement('section');
        sectionEl.className = 'jellio-row-container';
        sectionEl.innerHTML = `<h2 class="jellio-row-title">${spec.title}</h2>`;
        const trackEl = document.createElement('div');
        trackEl.className = 'jellio-row-track';
        data.forEach((item) => {
          const imgTag = item?.ImageTags?.Primary || item?.PrimaryImageTag;
          const imgUrl = getImageUrl(item?.Id, imgTag, 'Primary', 300);
          const cardEl = renderPosterCard(item, {
            aspectRatio: CardAspectRatio.PORTRAIT,
            imageUrl: imgUrl,
            onSelect: (selected) => {
              if (this.options.onItemSelect) this.options.onItemSelect(selected);
            },
          });
          cardEl.addEventListener('focus', () => this.handleCardFocus(item, cardEl));
          trackEl.appendChild(cardEl);
        });
        sectionEl.appendChild(trackEl);
        rowsContainer.appendChild(sectionEl);
      }
    });

    if (prevFocusedId) {
      const target = rowsContainer.querySelector(`[data-item-id="${prevFocusedId}"]`);
      if (target) focusElement(target);
    }
  }

  moveRow(index, delta) {
    const specs = this.getOrderedRowSpecs();
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= specs.length) return;

    const ids = specs.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);

    HomeRowPreferences.setRowOrder(ids);
    this.renderRows();
  }

  toggleRowVisibility(rowId) {
    const hidden = new Set(HomeRowPreferences.getHiddenRows() || []);
    if (hidden.has(rowId)) {
      hidden.delete(rowId);
    } else {
      hidden.add(rowId);
    }
    HomeRowPreferences.setHiddenRows(Array.from(hidden));
    this.renderRows();
  }

  destroy() {
    this.isDestroyed = true;
    this.stopWatchlistPolling();
    if (this.showcase) {
      this.showcase.destroy();
      this.showcase = null;
    }
    if (this.topBar && typeof this.topBar.destroy === 'function') {
      this.topBar.destroy();
      this.topBar = null;
    }
    this.rowsData.clear();
  }
}
