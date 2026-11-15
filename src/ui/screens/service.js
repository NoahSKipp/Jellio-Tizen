// Streaming Service hub screen matching Jellio-TV ServiceScreen.kt.
// Features brand color radial wash, ShowcaseHost in top 48%, service header with logo & genre chips,
// and Popular Movies / Top Rated Movies / Popular Series / Top Rated Series rows in bottom 52%.
import {
  getLibraryItems,
  getServiceCatalogRow,
  getServiceLogoUrl,
  toggleFavorite,
  setPlayed,
  getImageUrl,
  getUserImageUrl,
} from '../../data/api.js';
import { getSession } from '../../data/session.js';
import { ShowcaseHost } from '../components/showcase.js';
import { CardAspectRatio, renderPosterRow } from '../components/posterCard.js';
import { focusFirstIn } from '../../input/spatialNav.js';

export const SERVICE_BRAND_COLORS = Object.freeze({
  Netflix: '#E50914',
  'Disney+': '#0063E5',
  'Prime Video': '#00A8E1',
  'Apple TV+': '#A2AAAD',
  Max: '#002BE7',
  Hulu: '#1CE783',
  'Paramount+': '#0064FF',
  Peacock: '#F5C518',
  Crunchyroll: '#F47521',
  'Discovery+': '#2175D9',
});

export const SERVICE_GENRES = [
  'All',
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Sci-Fi',
  'Thriller',
];

export class ServiceScreen {
  constructor(options = {}) {
    this.options = options;
    this.serviceName = options.serviceName || 'Netflix';
    this.container = null;
    this.showcase = null;
    this.activeGenre = 'All';
    this.isDestroyed = false;
  }

  async render(container, serviceName = this.serviceName) {
    this.isDestroyed = false;
    this.container = container;
    this.serviceName = serviceName || 'Netflix';
    const brandColor = SERVICE_BRAND_COLORS[this.serviceName] || '#E50914';
    const logoUrl = getServiceLogoUrl(this.serviceName);

    this.container.innerHTML = `
      <div class="jellio-screen jellio-service-screen" data-focus-group="service-screen" style="background: radial-gradient(circle at 18% 12%, ${brandColor}33 0%, rgba(13, 13, 13, 0) 55%), var(--jellio-bg);">
        <div id="service-showcase-mount" class="jellio-home-showcase-mount"></div>
        <div class="jellio-home-rows-viewport" id="service-rows-viewport">
          <div style="display: flex; align-items: center; gap: 20px; padding: 8px 52px 14px; overflow-x: auto;">
            <div style="display: flex; align-items: center; gap: 12px; margin-right: 12px; flex-shrink: 0;">
              <img src="${logoUrl}" alt="${this.serviceName}" style="height: 32px; max-width: 140px; object-fit: contain; filter: brightness(0) invert(1);" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />
              <span style="display: none; font-size: 24px; font-weight: 800; color: #FFFFFF;">${this.serviceName}</span>
            </div>
            <div id="service-genre-bar" style="display: flex; gap: 10px; align-items: center;"></div>
          </div>
          <div id="service-rows-container">
            <div style="padding: 24px 52px; color: #B3B3B3;">Loading ${this.serviceName} catalog...</div>
          </div>
        </div>
      </div>
    `;

    const showcaseMount = this.container.querySelector('#service-showcase-mount');
    this.showcase = new ShowcaseHost();
    this.showcase.mount(showcaseMount);

    this.renderGenreChips();
    await this.loadServiceRows();
  }

  renderGenreChips() {
    if (!this.container) return;
    const bar = this.container.querySelector('#service-genre-bar');
    if (!bar) return;
    bar.innerHTML = '';

    SERVICE_GENRES.forEach((genre) => {
      const pill = document.createElement('button');
      pill.className = `jellio-filter-pill ${genre === this.activeGenre ? 'jellio-btn-primary' : ''}`;
      pill.setAttribute('data-focusable', 'true');
      pill.textContent = genre;
      pill.onclick = async () => {
        this.activeGenre = genre;
        this.renderGenreChips();
        await this.loadServiceRows();
      };
      bar.appendChild(pill);
    });
  }

  handleCardFocus(item, cardEl) {
    if (this.showcase && item) {
      this.showcase.setHighlightedItem(item);
    }
    const viewport = this.container?.querySelector('#service-rows-viewport');
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

  async loadServiceRows() {
    if (!this.container) return;
    const session = getSession();
    const userId = session ? session.userId : '';
    const rowsContainer = this.container.querySelector('#service-rows-container');
    if (!rowsContainer) return;

    const genreFilter = this.activeGenre === 'All' ? undefined : this.activeGenre;

    try {
      const [popMovies, topMovies, popSeries, topSeries] = await Promise.all([
        getServiceCatalogRow(this.serviceName, 'Movie', 'Popular', 20, genreFilter).catch(() => []),
        getServiceCatalogRow(this.serviceName, 'Movie', 'TopRated', 20, genreFilter).catch(() => []),
        getServiceCatalogRow(this.serviceName, 'Series', 'Popular', 20, genreFilter).catch(() => []),
        getServiceCatalogRow(this.serviceName, 'Series', 'TopRated', 20, genreFilter).catch(() => []),
      ]);

      if (this.isDestroyed) return;

      const sections = [
        { key: 'pop_movies', title: `Popular Movies on ${this.serviceName}`, items: popMovies || [] },
        { key: 'top_movies', title: `Top Rated Movies on ${this.serviceName}`, items: topMovies || [] },
        { key: 'pop_series', title: `Popular Shows on ${this.serviceName}`, items: popSeries || [] },
        { key: 'top_series', title: `Top Rated Shows on ${this.serviceName}`, items: topSeries || [] },
      ].filter((s) => s.items.length > 0);

      rowsContainer.innerHTML = '';

      if (sections.length === 0) {
        // Fallback to general library items if service catalog isn't populated
        const fallbackRes = await getLibraryItems(userId, {
          includeItemTypes: 'Movie,Series',
          genres: genreFilter,
          sortBy: 'CommunityRating',
          sortOrder: 'Descending',
          limit: 20,
        }).catch(() => ({ Items: [] }));

        if (fallbackRes.Items && fallbackRes.Items.length > 0) {
          sections.push({
            key: 'featured_service',
            title: `${this.serviceName} Picks`,
            items: fallbackRes.Items,
          });
        }
      }

      const firstItem = sections[0]?.items?.[0] || null;
      if (firstItem && this.showcase) {
        this.showcase.setFallbackItem(firstItem);
        this.showcase.setHighlightedItem(firstItem);
      }

      sections.forEach((sec) => {
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
        if (rowEl) rowsContainer.appendChild(rowEl);
      });

      focusFirstIn(rowsContainer);
    } catch (err) {
      console.warn('ServiceScreen: failed loading catalog rows', err);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.showcase) {
      this.showcase.destroy();
      this.showcase = null;
    }
  }
}
