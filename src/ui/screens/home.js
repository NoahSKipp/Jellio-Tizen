// Home screen displaying Hero banner, Continue Watching, Next Up, Watchlist, recommendations, and edit mode.
import {
  getResumeItems,
  getNextUp,
  getWatchlistItems,
  getSeasonalItems,
  getHeroCandidates,
  toggleFavorite,
  setPlayed,
  getImageUrl,
} from '../../data/api.js';
import { HomeRowPreferences } from '../../data/prefs.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

export const DEFAULT_ROW_KEYS = [
  'continue_watching',
  'next_up',
  'watchlist',
  'recommendations',
  'trending',
];

export class HomeScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.isEditMode = false;
    this.heroItem = null;
    this.rowsData = new Map();
  }

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="home-screen">
        <div class="jellio-screen-scroll" id="home-scroll-container">
          <section class="jellio-hero-banner" id="home-hero-banner">
            <div class="jellio-hero-scrim"></div>
            <div class="jellio-hero-content">
              <h1 class="jellio-title-hero" id="hero-title">Loading...</h1>
              <div id="hero-meta-chips" style="display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--jellio-text-secondary);"></div>
              <p class="jellio-text-muted" id="hero-overview" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; max-height: 72px;"></p>
              <div class="jellio-hero-buttons">
                <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="hero-play-btn">Play</button>
                <button class="jellio-btn" data-focusable="true" id="hero-watchlist-btn">Watchlist</button>
                <button class="jellio-btn" data-focusable="true" id="home-edit-toggle-btn" style="margin-left: 16px;">Customize Home</button>
              </div>
            </div>
          </section>

          <div id="home-edit-controls-bar" class="jellio-home-edit-controls" style="display: none; padding: 12px 0;">
            <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="home-edit-done-btn">Done Editing</button>
            <button class="jellio-btn" data-focusable="true" id="home-edit-reset-btn">Reset Order</button>
          </div>

          <div id="home-rows-container"></div>
        </div>
      </div>
    `;

    this.bindHeroButtons();
    await this.loadData();
  }

  bindHeroButtons() {
    const playBtn = this.container.querySelector('#hero-play-btn');
    const watchlistBtn = this.container.querySelector('#hero-watchlist-btn');
    const editToggleBtn = this.container.querySelector('#home-edit-toggle-btn');
    const editDoneBtn = this.container.querySelector('#home-edit-done-btn');
    const editResetBtn = this.container.querySelector('#home-edit-reset-btn');

    playBtn.onclick = () => {
      if (this.heroItem && this.options.onPlay) {
        this.options.onPlay(this.heroItem);
      }
    };

    watchlistBtn.onclick = async () => {
      if (!this.heroItem) return;
      const isFav = this.heroItem.UserData ? this.heroItem.UserData.IsFavorite : false;
      try {
        await toggleFavorite(this.heroItem.Id, !isFav);
        if (this.heroItem.UserData) {
          this.heroItem.UserData.IsFavorite = !isFav;
        }
        watchlistBtn.textContent = !isFav ? 'In Watchlist' : 'Watchlist';
      } catch (_) {}
    };

    editToggleBtn.onclick = () => this.setEditMode(true);
    editDoneBtn.onclick = () => this.setEditMode(false);
    editResetBtn.onclick = () => {
      HomeRowPreferences.setRowOrder(DEFAULT_ROW_KEYS);
      HomeRowPreferences.setHiddenRows([]);
      this.setEditMode(false);
      this.loadData();
    };
  }

  setEditMode(active) {
    this.isEditMode = active;
    const controlsBar = this.container.querySelector('#home-edit-controls-bar');
    controlsBar.style.display = active ? 'flex' : 'none';
    this.renderRows();
    if (active) {
      focusFirstIn(controlsBar);
    } else {
      const editToggleBtn = this.container.querySelector('#home-edit-toggle-btn');
      focusElement(editToggleBtn);
    }
  }

  async loadData() {
    try {
      const [resumes, nextUps, watchlists, seasonals, heroes] = await Promise.all([
        getResumeItems(20).catch(() => []),
        getNextUp(20).catch(() => []),
        getWatchlistItems(20).catch(() => []),
        getSeasonalItems(20).catch(() => []),
        getHeroCandidates(6).catch(() => []),
      ]);

      const candidateHero = (heroes && heroes[0]) || (resumes && resumes[0]) || (nextUps && nextUps[0]);
      if (candidateHero) {
        this.setHeroItem(candidateHero);
      }

      this.rowsData.set('continue_watching', { title: 'Continue Watching', items: resumes, landscape: true });
      this.rowsData.set('next_up', { title: 'Next Up', items: nextUps, landscape: true });
      this.rowsData.set('watchlist', { title: 'Watchlist', items: watchlists, landscape: false });
      this.rowsData.set('recommendations', { title: 'Recommendations', items: seasonals, landscape: false });
      this.rowsData.set('trending', { title: 'Trending', items: seasonals.slice(0, 10), landscape: false });

      this.renderRows();
      focusFirstIn(this.container);
    } catch (err) {
      console.warn('HomeScreen: loadData error', err);
    }
  }

  setHeroItem(item) {
    this.heroItem = item;
    const banner = this.container.querySelector('#home-hero-banner');
    const titleEl = this.container.querySelector('#hero-title');
    const metaChipsEl = this.container.querySelector('#hero-meta-chips');
    const overviewEl = this.container.querySelector('#hero-overview');
    const watchlistBtn = this.container.querySelector('#hero-watchlist-btn');

    titleEl.textContent = item.Name || 'Featured Title';
    overviewEl.textContent = item.Overview || '';

    const year = item.ProductionYear || (item.PremiereDate ? item.PremiereDate.slice(0, 4) : '');
    const rating = item.OfficialRating || '';
    const runtime = item.RunTimeTicks ? `${Math.round(item.RunTimeTicks / 600000000)}m` : '';

    metaChipsEl.innerHTML = `
      ${year ? `<span class="jellio-tech-badge">${year}</span>` : ''}
      ${rating ? `<span class="jellio-tech-badge">${rating}</span>` : ''}
      ${runtime ? `<span class="jellio-tech-badge">${runtime}</span>` : ''}
    `;

    const isFav = item.UserData && item.UserData.IsFavorite;
    watchlistBtn.textContent = isFav ? 'In Watchlist' : 'Watchlist';

    const backdropTag = (item.BackdropImageTags && item.BackdropImageTags[0]) || item.ImageTags?.Primary;
    if (backdropTag) {
      let bgImg = banner.querySelector('.jellio-hero-backdrop');
      if (!bgImg) {
        bgImg = document.createElement('img');
        bgImg.className = 'jellio-hero-backdrop';
        banner.prepend(bgImg);
      }
      bgImg.src = getImageUrl(item.Id, backdropTag, 'Backdrop', 1920);
    }
  }

  renderRows() {
    const rowsContainer = this.container.querySelector('#home-rows-container');
    rowsContainer.innerHTML = '';

    const savedOrder = HomeRowPreferences.getRowOrder();
    const hiddenSet = new Set(HomeRowPreferences.getHiddenRows());

    const activeOrder = savedOrder.length > 0 ? savedOrder : DEFAULT_ROW_KEYS;

    activeOrder.forEach((rowKey, index) => {
      if (hiddenSet.has(rowKey) && !this.isEditMode) return;
      const row = this.rowsData.get(rowKey);
      if (!row || (!this.isEditMode && row.items.length === 0)) return;

      const rowSection = document.createElement('div');
      rowSection.className = 'jellio-row-container';
      rowSection.setAttribute('data-focus-group', `row-${rowKey}`);

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.paddingRight = '48px';

      const title = document.createElement('h2');
      title.className = 'jellio-row-title';
      title.textContent = row.title;
      header.appendChild(title);

      if (this.isEditMode) {
        const reorderTools = document.createElement('div');
        reorderTools.style.display = 'flex';
        reorderTools.style.gap = '8px';

        const upBtn = document.createElement('button');
        upBtn.className = 'jellio-btn';
        upBtn.setAttribute('data-focusable', 'true');
        upBtn.textContent = 'Up';
        upBtn.onclick = () => this.moveRow(rowKey, -1);

        const downBtn = document.createElement('button');
        downBtn.className = 'jellio-btn';
        downBtn.setAttribute('data-focusable', 'true');
        downBtn.textContent = 'Down';
        downBtn.onclick = () => this.moveRow(rowKey, 1);

        const hideBtn = document.createElement('button');
        hideBtn.className = 'jellio-btn';
        hideBtn.setAttribute('data-focusable', 'true');
        hideBtn.textContent = hiddenSet.has(rowKey) ? 'Show' : 'Hide';
        hideBtn.onclick = () => this.toggleRowHidden(rowKey);

        reorderTools.appendChild(upBtn);
        reorderTools.appendChild(downBtn);
        reorderTools.appendChild(hideBtn);
        header.appendChild(reorderTools);
      }

      rowSection.appendChild(header);

      const track = document.createElement('div');
      track.className = 'jellio-row-track';
      track.setAttribute('data-scroll-orientation', 'horizontal');

      row.items.forEach((item) => {
        const card = document.createElement('div');
        card.className = `jellio-poster-card ${row.landscape ? 'jellio-card-landscape' : 'jellio-card-portrait'}`;
        card.setAttribute('data-focusable', 'true');

        const imgTag = row.landscape ? (item.BackdropImageTags?.[0] || item.ImageTags?.Primary) : item.ImageTags?.Primary;
        const imgUrl = getImageUrl(item.Id, imgTag, row.landscape ? 'Backdrop' : 'Primary', row.landscape ? 400 : 300);

        let progressHtml = '';
        if (item.UserData && item.UserData.PlaybackPositionTicks && item.RunTimeTicks) {
          const pct = Math.min(100, Math.round((item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100));
          progressHtml = `<div class="jellio-progress-bar"><div class="jellio-progress-bar-fill" style="width: ${pct}%;"></div></div>`;
        }

        card.innerHTML = `
          <img class="jellio-poster-card-img" src="${imgUrl}" alt="${item.Name || ''}" loading="lazy" />
          <div class="jellio-poster-card-overlay">
            <div class="jellio-poster-card-title">${item.Name || ''}</div>
            <div class="jellio-poster-card-subtitle">${item.SeriesName || item.ProductionYear || ''}</div>
          </div>
          ${progressHtml}
        `;

        card.onclick = () => {
          if (this.options.onItemSelect) {
            this.options.onItemSelect(item);
          }
        };

        track.appendChild(card);
      });

      rowSection.appendChild(track);
      rowsContainer.appendChild(rowSection);
    });
  }

  moveRow(rowKey, delta) {
    const savedOrder = HomeRowPreferences.getRowOrder();
    const order = savedOrder.length > 0 ? [...savedOrder] : [...DEFAULT_ROW_KEYS];
    const currentIndex = order.indexOf(rowKey);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + delta;
    if (newIndex < 0 || newIndex >= order.length) return;

    order.splice(currentIndex, 1);
    order.splice(newIndex, 0, rowKey);

    HomeRowPreferences.setRowOrder(order);
    this.renderRows();
  }

  toggleRowHidden(rowKey) {
    const hidden = new Set(HomeRowPreferences.getHiddenRows());
    if (hidden.has(rowKey)) {
      hidden.delete(rowKey);
    } else {
      hidden.add(rowKey);
    }
    HomeRowPreferences.setHiddenRows(Array.from(hidden));
    this.renderRows();
  }

  destroy() {
    this.rowsData.clear();
  }
}
