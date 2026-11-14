// Library screen with filter pills for genres and sort orders, and paginated grid of posters.
import {
  getUserViews,
  getLibraryItems,
  getAllGenres,
  getImageUrl,
} from '../../data/api.js';
import { getSession } from '../../data/session.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

export const SORT_ORDERS = [
  { label: 'Name (A-Z)', sortBy: 'SortName', sortOrder: 'Ascending' },
  { label: 'Release Date', sortBy: 'PremiereDate', sortOrder: 'Descending' },
  { label: 'Rating', sortBy: 'CommunityRating', sortOrder: 'Descending' },
  { label: 'Recently Added', sortBy: 'DateCreated', sortOrder: 'Descending' },
];

export class LibraryScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.libraries = [];
    this.activeLibraryId = null;
    this.activeGenre = null;
    this.activeSortIndex = 0;
    this.items = [];
    this.page = 0;
    this.limit = 40;
    this.totalRecordCount = 0;
    this.isLoading = false;
  }

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="library-screen">
        <div class="jellio-library-filter-bar" id="library-filter-bar" style="overflow-x: auto;"></div>
        <div class="jellio-screen-scroll" id="library-scroll-container">
          <div class="jellio-poster-grid" id="library-grid"></div>
          <div id="library-loading" style="text-align: center; padding: 24px; color: var(--jellio-text-secondary); display: none;">Loading more...</div>
        </div>
      </div>
    `;

    await this.initLibraries();
  }

  async initLibraries() {
    const session = getSession();
    if (!session || !session.userId) return;

    try {
      const views = await getUserViews(session.userId);
      this.libraries = views.Items || [];

      if (this.libraries.length > 0) {
        this.activeLibraryId = this.libraries[0].Id;
      }

      this.renderFilterBar();
      await this.loadItems(true);
      focusFirstIn(this.container);
    } catch (err) {
      console.warn('LibraryScreen: failed to load user views', err);
    }
  }

  renderFilterBar() {
    const filterBar = this.container.querySelector('#library-filter-bar');
    filterBar.innerHTML = '';

    // Library Views
    this.libraries.forEach((lib) => {
      const pill = document.createElement('button');
      pill.className = `jellio-filter-pill ${lib.Id === this.activeLibraryId ? 'jellio-focused' : ''}`;
      pill.setAttribute('data-focusable', 'true');
      pill.textContent = lib.Name;

      pill.onclick = async () => {
        this.activeLibraryId = lib.Id;
        this.activeGenre = null;
        this.renderFilterBar();
        await this.loadItems(true);
      };

      filterBar.appendChild(pill);
    });

    // Separator
    const sep = document.createElement('div');
    sep.style.width = '1px';
    sep.style.height = '24px';
    sep.style.background = 'var(--jellio-border)';
    sep.style.alignSelf = 'center';
    filterBar.appendChild(sep);

    // Sort order pill
    const sortPill = document.createElement('button');
    sortPill.className = 'jellio-filter-pill';
    sortPill.setAttribute('data-focusable', 'true');
    sortPill.textContent = `Sort: ${SORT_ORDERS[this.activeSortIndex].label}`;

    sortPill.onclick = async () => {
      this.activeSortIndex = (this.activeSortIndex + 1) % SORT_ORDERS.length;
      sortPill.textContent = `Sort: ${SORT_ORDERS[this.activeSortIndex].label}`;
      await this.loadItems(true);
    };

    filterBar.appendChild(sortPill);
  }

  async loadItems(reset = false) {
    if (this.isLoading) return;
    if (reset) {
      this.page = 0;
      this.items = [];
      const grid = this.container.querySelector('#library-grid');
      grid.innerHTML = '';
    }

    const session = getSession();
    if (!session || !session.userId || !this.activeLibraryId) return;

    this.isLoading = true;
    const loadingEl = this.container.querySelector('#library-loading');
    if (loadingEl) loadingEl.style.display = 'block';

    const currentSort = SORT_ORDERS[this.activeSortIndex];
    const startIndex = this.page * this.limit;

    try {
      const res = await getLibraryItems(session.userId, {
        parentId: this.activeLibraryId,
        sortBy: currentSort.sortBy,
        sortOrder: currentSort.sortOrder,
        startIndex,
        limit: this.limit,
      });

      const newItems = res.Items || [];
      this.totalRecordCount = res.TotalRecordCount || 0;
      this.items.push(...newItems);
      this.appendItemsToGrid(newItems);
      this.page += 1;
    } catch (err) {
      console.warn('LibraryScreen: failed to load library items', err);
    } finally {
      this.isLoading = false;
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  appendItemsToGrid(newItems) {
    const grid = this.container.querySelector('#library-grid');
    newItems.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.setAttribute('data-focusable', 'true');

      const imgTag = item.ImageTags?.Primary;
      const imgUrl = getImageUrl(item.Id, imgTag, 'Primary', 300);

      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${item.Name}" loading="lazy" />
        <div class="jellio-poster-card-overlay">
          <div class="jellio-poster-card-title">${item.Name}</div>
          <div class="jellio-poster-card-subtitle">${item.ProductionYear || ''}</div>
        </div>
      `;

      card.onclick = () => {
        if (this.options.onItemSelect) {
          this.options.onItemSelect(item);
        }
      };

      grid.appendChild(card);
    });
  }

  destroy() {
    this.items = [];
    this.libraries = [];
  }
}
