// Library screen matching Jellio-TV LibraryScreen.kt & LibraryViewModel.kt.
// Top 48%: ShowcaseHost following the currently focused card.
// Bottom 52%: LibraryHeader with Sort & Genre dropdown modals, Featured row,
// All Movies/Series row, and Genre rows (or filtered grid when a specific genre/sort is chosen).
import {
  getUserViews,
  getLibraryItems,
  getAllGenres,
  discoverGenres,
  getGenreItemsPage,
  toggleFavorite,
  setPlayed,
  getImageUrl,
  getUserImageUrl,
} from '../../data/api.js';
import { getSession } from '../../data/session.js';
import { ShowcaseHost } from '../components/showcase.js';
import {
  CardAspectRatio,
  renderPosterCard,
  renderPosterRow,
} from '../components/posterCard.js';
import { focusFirstIn, focusElement, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';

export const SORT_ORDERS = [
  { label: 'Name (A-Z)', sortBy: 'SortName', sortOrder: 'Ascending' },
  { label: 'Release Date', sortBy: 'PremiereDate,SortName', sortOrder: 'Descending' },
  { label: 'TMDB Rating', sortBy: 'CommunityRating,SortName', sortOrder: 'Descending' },
  { label: 'Critics Rating', sortBy: 'CriticRating,SortName', sortOrder: 'Descending' },
  { label: 'Recently Added', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' },
  { label: 'Random', sortBy: 'Random', sortOrder: 'Ascending' },
];

export class LibraryScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.showcase = null;
    this.libraries = [];
    this.activeLibraryId = options.libraryId || null;
    this.activeLibraryName = options.libraryName || 'Library';
    this.collectionType = options.collectionType || null;
    this.genres = [];
    this.activeGenre = null;
    this.activeSortIndex = 0;
    this.items = [];
    this.featuredItems = [];
    this.genreRows = [];
    this.isDestroyed = false;
  }

  async render(container) {
    this.isDestroyed = false;
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen jellio-library-screen" data-focus-group="library-screen">
        <div id="library-showcase-mount" class="jellio-home-showcase-mount"></div>
        <div class="jellio-home-rows-viewport" id="library-rows-viewport">
          <div class="jellio-library-header" id="library-header" style="display: flex; align-items: center; gap: 16px; padding: 8px 52px 16px;">
            <h1 id="library-title" style="font-size: 24px; font-weight: 700; color: #FFFFFF; margin-right: 12px;">${this.activeLibraryName}</h1>
            <button class="jellio-filter-pill" data-focusable="true" id="library-sort-btn">Sort: ${SORT_ORDERS[this.activeSortIndex].label}</button>
            <button class="jellio-filter-pill" data-focusable="true" id="library-genre-btn">Genre: All Genres</button>
          </div>
          <div id="library-content-area">
            <div style="padding: 24px 52px; color: #B3B3B3;">Loading library...</div>
          </div>
        </div>
      </div>
    `;

    const showcaseMount = this.container.querySelector('#library-showcase-mount');
    this.showcase = new ShowcaseHost();
    this.showcase.mount(showcaseMount);

    this.bindHeaderEvents();
    await this.initLibrary();
  }

  bindHeaderEvents() {
    if (!this.container) return;
    const sortBtn = this.container.querySelector('#library-sort-btn');
    const genreBtn = this.container.querySelector('#library-genre-btn');

    if (sortBtn) {
      sortBtn.onclick = () => {
        this.openFilterModal({
          title: 'Sort By',
          options: SORT_ORDERS.map((s, idx) => ({ label: s.label, value: idx })),
          selectedValue: this.activeSortIndex,
          triggerEl: sortBtn,
          onSelect: async (val) => {
            this.activeSortIndex = val;
            sortBtn.textContent = `Sort: ${SORT_ORDERS[this.activeSortIndex].label}`;
            await this.loadLibraryContent();
          },
        });
      };
    }

    if (genreBtn) {
      genreBtn.onclick = () => {
        const opts = [
          { label: 'All Genres', value: null },
          ...this.genres.map((g) => ({ label: g, value: g })),
        ];
        this.openFilterModal({
          title: 'Filter by Genre',
          options: opts,
          selectedValue: this.activeGenre,
          triggerEl: genreBtn,
          onSelect: async (val) => {
            this.activeGenre = val;
            genreBtn.textContent = `Genre: ${val || 'All Genres'}`;
            await this.loadLibraryContent();
          },
        });
      };
    }
  }

  openFilterModal({ title, options, selectedValue, triggerEl, onSelect }) {
    const overlayRoot = document.getElementById('jellio-overlay-root') || document.body;
    const scrim = document.createElement('div');
    scrim.className = 'jellio-card-dialog-scrim';
    scrim.setAttribute('data-focus-group', 'library-filter-modal');

    const dialog = document.createElement('div');
    dialog.className = 'jellio-card-dialog';
    dialog.style.maxHeight = '70vh';
    dialog.style.overflowY = 'auto';
    dialog.innerHTML = `<div class="jellio-card-dialog-header">${title}</div>`;

    const close = () => {
      popFocusTrap(scrim);
      scrim.remove();
      if (triggerEl) focusElement(triggerEl);
    };

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'jellio-card-options-item';
      btn.setAttribute('data-focusable', 'true');
      const isSelected = opt.value === selectedValue;
      btn.innerHTML = `
        <span style="flex: 1;">${opt.label}</span>
        ${isSelected ? '<span style="font-weight: 700;">&#10003;</span>' : ''}
      `;
      btn.onclick = () => {
        close();
        onSelect(opt.value);
      };
      dialog.appendChild(btn);
    });

    scrim.appendChild(dialog);
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });

    overlayRoot.appendChild(scrim);
    pushFocusTrap(scrim, close);
    focusFirstIn(dialog);
  }

  async initLibrary() {
    const session = getSession();
    const userId = session ? session.userId : '';

    try {
      if (!this.activeLibraryId) {
        const views = await getUserViews(userId);
        const list = Array.isArray(views) ? views : (views && views.Items) || [];
        this.libraries = list;
        if (list.length > 0) {
          this.activeLibraryId = list[0].Id;
          this.activeLibraryName = list[0].Name || 'Library';
          this.collectionType = list[0].CollectionType || null;
          const titleEl = this.container?.querySelector('#library-title');
          if (titleEl) titleEl.textContent = this.activeLibraryName;
        }
      }

      const itemType = this.resolveItemType();
      this.genres = await getAllGenres(userId, this.activeLibraryId, itemType).catch(() => []);
      await this.loadLibraryContent();
    } catch (err) {
      console.warn('LibraryScreen: failed to initialize', err);
    }
  }

  resolveItemType() {
    const col = (this.collectionType || '').toLowerCase();
    if (col === 'movies') return 'Movie';
    if (col === 'tvshows') return 'Series';
    return 'Movie,Series';
  }

  handleCardFocus(item, cardEl) {
    if (this.showcase && item) {
      this.showcase.setHighlightedItem(item);
    }
    const viewport = this.container?.querySelector('#library-rows-viewport');
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

  async loadLibraryContent() {
    if (!this.container) return;
    const session = getSession();
    const userId = session ? session.userId : '';
    const contentArea = this.container.querySelector('#library-content-area');
    if (!contentArea) return;

    const currentSort = SORT_ORDERS[this.activeSortIndex];
    const itemType = this.resolveItemType();

    try {
      const mainRes = await getLibraryItems(userId, {
        parentId: this.activeLibraryId,
        includeItemTypes: itemType,
        genres: this.activeGenre || undefined,
        sortBy: currentSort.sortBy,
        sortOrder: currentSort.sortOrder,
        limit: 40,
      });

      if (this.isDestroyed) return;
      this.items = (mainRes && mainRes.Items) || [];

      if (this.items.length > 0 && this.showcase) {
        this.showcase.setFallbackItem(this.items[0]);
        this.showcase.setHighlightedItem(this.items[0]);
      }

      contentArea.innerHTML = '';

      // If filtering by a specific genre or custom sort, show a clean grid + row
      if (this.activeGenre || this.activeSortIndex !== 0) {
        const grid = document.createElement('div');
        grid.className = 'jellio-poster-grid';
        this.items.forEach((item) => {
          const imgTag = item?.ImageTags?.Primary || item?.PrimaryImageTag;
          const imgUrl = getImageUrl(item.Id, imgTag, 'Primary', 300);
          const card = renderPosterCard(item, {
            aspectRatio: CardAspectRatio.PORTRAIT,
            imageUrl: imgUrl,
            onSelect: (it) => {
              if (this.options.onItemSelect) this.options.onItemSelect(it);
            },
            onFocus: (it) => this.handleCardFocus(it, card),
          });
          card.addEventListener('focus', () => this.handleCardFocus(item, card));
          grid.appendChild(card);
        });
        contentArea.appendChild(grid);
        focusFirstIn(grid);
        return;
      }

      // Default view: Featured row + Main Library row + Top Genre rows
      const topGenres = (this.genres || []).slice(0, 6);
      const genreData = await Promise.all(
        topGenres.map(async (genre) => {
          const list = await getGenreItemsPage(userId, this.activeLibraryId, itemType, genre, 0, 20).catch(() => []);
          return { genre, items: list || [] };
        })
      );

      if (this.isDestroyed) return;

      const sections = [
        {
          key: 'all_items',
          title: `All ${this.activeLibraryName}`,
          items: this.items,
        },
        ...genreData
          .filter((g) => g.items.length > 0)
          .map((g) => ({
            key: `genre_${g.genre}`,
            title: g.genre,
            items: g.items,
          })),
      ];

      sections.forEach((sec) => {
        if (typeof renderPosterRow === 'function') {
          const rowEl = renderPosterRow(sec, {
            aspectRatio: CardAspectRatio.PORTRAIT,
            imageUrl: (item, type, maxWidth) => {
              const tag = item?.ImageTags?.[type] || item?.PrimaryImageTag || null;
              return getImageUrl(item?.Id, tag, type, maxWidth);
            },
            userImageUrl: (uid, tag) => getUserImageUrl(uid, tag, 100),
            onSelect: (item) => {
              if (this.options.onItemSelect) this.options.onItemSelect(item);
            },
            onFocus: (item, cardEl) => this.handleCardFocus(item, cardEl),
            onToggleWatchlist: async (item) => {
              const isFav = Boolean(item?.UserData?.IsFavorite);
              await toggleFavorite(item.Id, !isFav);
              if (item.UserData) item.UserData.IsFavorite = !isFav;
            },
            onToggleWatched: async (item) => {
              const isPlayed = Boolean(item?.UserData?.Played);
              await setPlayed(item.Id, !isPlayed);
              if (item.UserData) item.UserData.Played = !isPlayed;
            },
          });
          if (rowEl) contentArea.appendChild(rowEl);
        }
      });

      focusFirstIn(contentArea);
    } catch (err) {
      console.warn('LibraryScreen: failed to load library items', err);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.showcase) {
      this.showcase.destroy();
      this.showcase = null;
    }
    this.items = [];
    this.libraries = [];
  }
}
