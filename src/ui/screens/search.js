// Search screen matching Jellio-TV SearchScreen.kt.
// Features TV D-pad keyboard + direct physical input, filter pills (All, Movies, Series, People),
// and instant grouped search results using renderPosterCard.
import { searchItems, searchMovies, searchSeries, getImageUrl } from '../../data/api.js';
import { CardAspectRatio, renderPosterCard } from '../components/posterCard.js';
import { focusFirstIn } from '../../input/spatialNav.js';

const KEYBOARD_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3'],
  ['G', 'H', 'I', 'J', 'K', 'L', '4', '5', '6'],
  ['M', 'N', 'O', 'P', 'Q', 'R', '7', '8', '9'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0'],
  ['SPACE', 'BACKSPACE', 'CLEAR'],
];

export class SearchScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.query = '';
    this.activeFilter = 'All';
    this.debounceTimer = null;
    this.lastResults = { movies: [], series: [], people: [] };
  }

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="search-screen">
        <div class="jellio-screen-scroll" id="search-scroll-container">
          <div class="jellio-search-container">
            <input type="text" class="jellio-search-input-box" id="search-input-display" data-focusable="true" placeholder="Search movies, shows, cast & crew..." />
            <div class="jellio-onscreen-keyboard" id="search-keyboard"></div>
            <div id="search-filter-bar" style="display: flex; gap: 10px; margin-top: 8px;"></div>
          </div>

          <div id="search-results-container" style="display: none; padding-bottom: 48px;">
            <div id="search-movies-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">Movies</h2>
              <div class="jellio-row-track" id="search-movies-track"></div>
            </div>

            <div id="search-series-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">Shows</h2>
              <div class="jellio-row-track" id="search-series-track"></div>
            </div>

            <div id="search-people-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">Cast & Crew</h2>
              <div class="jellio-row-track" id="search-people-track"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const inputEl = this.container.querySelector('#search-input-display');
    inputEl.addEventListener('input', (e) => {
      this.query = e.target.value;
      this.triggerSearch();
    });

    this.renderKeyboard();
    this.renderFilterPills();
    focusFirstIn(this.container);
  }

  renderFilterPills() {
    if (!this.container) return;
    const bar = this.container.querySelector('#search-filter-bar');
    if (!bar) return;
    bar.innerHTML = '';

    ['All', 'Movies', 'Shows', 'Cast & Crew'].forEach((filter) => {
      const btn = document.createElement('button');
      btn.className = `jellio-filter-pill ${filter === this.activeFilter ? 'jellio-btn-primary' : ''}`;
      btn.setAttribute('data-focusable', 'true');
      btn.textContent = filter;
      btn.onclick = () => {
        this.activeFilter = filter;
        this.renderFilterPills();
        this.displayResults(this.lastResults.movies, this.lastResults.series, this.lastResults.people);
      };
      bar.appendChild(btn);
    });
  }

  renderKeyboard() {
    const keyboardEl = this.container.querySelector('#search-keyboard');
    keyboardEl.innerHTML = '';

    KEYBOARD_ROWS.forEach((rowKeys) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'jellio-keyboard-row';

      rowKeys.forEach((key) => {
        const keyBtn = document.createElement('button');
        keyBtn.className = 'jellio-key-btn';
        keyBtn.setAttribute('data-focusable', 'true');
        keyBtn.textContent = key;

        if (key === 'SPACE') keyBtn.style.width = '120px';
        else if (key === 'BACKSPACE') keyBtn.style.width = '120px';
        else if (key === 'CLEAR') keyBtn.style.width = '90px';

        keyBtn.onclick = () => this.handleKeyPress(key);
        rowEl.appendChild(keyBtn);
      });

      keyboardEl.appendChild(rowEl);
    });
  }

  handleKeyPress(key) {
    const inputEl = this.container.querySelector('#search-input-display');
    if (key === 'SPACE') {
      this.query += ' ';
    } else if (key === 'BACKSPACE') {
      this.query = this.query.slice(0, -1);
    } else if (key === 'CLEAR') {
      this.query = '';
    } else {
      this.query += key.toLowerCase();
    }

    inputEl.value = this.query;
    this.triggerSearch();
  }

  triggerSearch() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const trimmed = this.query.trim();
    if (!trimmed) {
      this.clearResults();
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.executeSearch(trimmed);
    }, 300);
  }

  async executeSearch(term) {
    try {
      const [localRes, gelatoMovies, gelatoSeries] = await Promise.all([
        searchItems(term, 40).catch(() => []),
        searchMovies(term).catch(() => []),
        searchSeries(term).catch(() => []),
      ]);

      const items = Array.isArray(localRes) ? localRes : (localRes && localRes.Items) || [];
      const movies = [...items.filter((it) => it.Type === 'Movie'), ...(Array.isArray(gelatoMovies) ? gelatoMovies : [])];
      const series = [...items.filter((it) => it.Type === 'Series'), ...(Array.isArray(gelatoSeries) ? gelatoSeries : [])];
      const people = items.filter((it) => it.Type === 'Person');

      this.lastResults = { movies, series, people };
      this.displayResults(movies, series, people);
    } catch (err) {
      console.warn('SearchScreen: search failed', err);
    }
  }

  displayResults(movies, series, people) {
    if (!this.container) return;
    const resultsContainer = this.container.querySelector('#search-results-container');
    const moviesSection = this.container.querySelector('#search-movies-section');
    const moviesTrack = this.container.querySelector('#search-movies-track');
    const seriesSection = this.container.querySelector('#search-series-section');
    const seriesTrack = this.container.querySelector('#search-series-track');
    const peopleSection = this.container.querySelector('#search-people-section');
    const peopleTrack = this.container.querySelector('#search-people-track');

    resultsContainer.style.display = 'block';

    const showMovies = this.activeFilter === 'All' || this.activeFilter === 'Movies';
    const showSeries = this.activeFilter === 'All' || this.activeFilter === 'Shows';
    const showPeople = this.activeFilter === 'All' || this.activeFilter === 'Cast & Crew';

    this.populateTrack(moviesSection, moviesTrack, showMovies ? movies : [], (it) => {
      if (this.options.onItemSelect) this.options.onItemSelect(it);
    });

    this.populateTrack(seriesSection, seriesTrack, showSeries ? series : [], (it) => {
      if (this.options.onItemSelect) this.options.onItemSelect(it);
    });

    this.populateTrack(peopleSection, peopleTrack, showPeople ? people : [], (it) => {
      if (this.options.onPersonSelect) this.options.onPersonSelect(it.Id);
    });
  }

  populateTrack(section, track, items, onClick) {
    if (!items || items.length === 0) {
      section.style.display = 'none';
      track.innerHTML = '';
      return;
    }

    section.style.display = 'flex';
    track.innerHTML = '';

    const seen = new Set();
    items.forEach((item) => {
      if (!item || !item.Id || seen.has(item.Id)) return;
      seen.add(item.Id);

      const imgTag = item.ImageTags?.Primary || item.PrimaryImageTag;
      const imgUrl = getImageUrl(item.Id, imgTag, 'Primary', 300);
      const card = renderPosterCard(item, {
        aspectRatio: CardAspectRatio.PORTRAIT,
        imageUrl: imgUrl,
        canExpand: false,
        onSelect: () => onClick(item),
      });
      track.appendChild(card);
    });
  }

  clearResults() {
    if (!this.container) return;
    const resultsContainer = this.container.querySelector('#search-results-container');
    if (resultsContainer) resultsContainer.style.display = 'none';
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
