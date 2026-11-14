// Search screen with on-screen TV D-pad keyboard and grouped instant search results.
import { searchItems, getImageUrl } from '../../data/api.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

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
    this.debounceTimer = null;
  }

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="search-screen">
        <div class="jellio-screen-scroll" id="search-scroll-container">
          <div class="jellio-search-container">
            <input type="text" class="jellio-search-input-box" id="search-input-display" placeholder="Search movies, series, people..." readonly />
            <div class="jellio-onscreen-keyboard" id="search-keyboard"></div>
          </div>

          <div id="search-results-container" style="display: none; padding-bottom: 48px;">
            <div id="search-movies-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">Movies</h2>
              <div class="jellio-row-track" id="search-movies-track"></div>
            </div>

            <div id="search-series-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">Series</h2>
              <div class="jellio-row-track" id="search-series-track"></div>
            </div>

            <div id="search-people-section" class="jellio-row-container" style="display: none;">
              <h2 class="jellio-row-title">People</h2>
              <div class="jellio-row-track" id="search-people-track"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderKeyboard();
    focusFirstIn(this.container);
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
      this.query += key;
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
      const res = await searchItems(term, 40);
      const items = res.Items || [];

      const movies = items.filter((it) => it.Type === 'Movie');
      const series = items.filter((it) => it.Type === 'Series');
      const people = items.filter((it) => it.Type === 'Person');

      this.displayResults(movies, series, people);
    } catch (err) {
      console.warn('SearchScreen: search failed', err);
    }
  }

  displayResults(movies, series, people) {
    const resultsContainer = this.container.querySelector('#search-results-container');
    const moviesSection = this.container.querySelector('#search-movies-section');
    const moviesTrack = this.container.querySelector('#search-movies-track');
    const seriesSection = this.container.querySelector('#search-series-section');
    const seriesTrack = this.container.querySelector('#search-series-track');
    const peopleSection = this.container.querySelector('#search-people-section');
    const peopleTrack = this.container.querySelector('#search-people-track');

    resultsContainer.style.display = 'block';

    this.populateTrack(moviesSection, moviesTrack, movies, (it) => {
      if (this.options.onItemSelect) this.options.onItemSelect(it);
    });

    this.populateTrack(seriesSection, seriesTrack, series, (it) => {
      if (this.options.onItemSelect) this.options.onItemSelect(it);
    });

    this.populateTrack(peopleSection, peopleTrack, people, (it) => {
      if (this.options.onPersonSelect) this.options.onPersonSelect(it.Id);
    });
  }

  populateTrack(section, track, items, onClick) {
    if (items.length === 0) {
      section.style.display = 'none';
      track.innerHTML = '';
      return;
    }

    section.style.display = 'flex';
    track.innerHTML = '';

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.setAttribute('data-focusable', 'true');

      const imgTag = item.ImageTags?.Primary;
      const imgUrl = getImageUrl(item.Id, imgTag, 'Primary', 300);

      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${item.Name}" loading="lazy" />
        <div class="jellio-poster-card-overlay">
          <div class="jellio-poster-card-title">${item.Name}</div>
          <div class="jellio-poster-card-subtitle">${item.ProductionYear || item.Type || ''}</div>
        </div>
      `;

      card.onclick = () => onClick(item);
      track.appendChild(card);
    });
  }

  clearResults() {
    const resultsContainer = this.container.querySelector('#search-results-container');
    if (resultsContainer) resultsContainer.style.display = 'none';
  }

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
