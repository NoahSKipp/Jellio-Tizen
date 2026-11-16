// Search screen matching Jellio-TV SearchScreen.kt.
// Features TV D-pad keyboard + direct physical input, filter pills (All, Movies, Series, People),
// typo-tolerant fuzzy search, variant expansion, "Similar to" recommendations, and stream warmup.
import {
  searchItems,
  searchMovies,
  searchSeries,
  searchFuzzy,
  getSearchSuggestions,
  prefetchStreams,
  getImageUrl,
} from '../../data/api.js';
import { expandSearchQueryVariants, identityKeys } from '../../runtime/searchNormalizer.js';
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
    this.topHitTimer = null;
    this.lastResults = { movies: [], series: [], people: [] };
    this.suggestionRows = [];
    this.correctedQuery = null;
    this.isDestroyed = false;
  }

  render(container) {
    this.isDestroyed = false;
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="search-screen">
        <div class="jellio-screen-scroll" id="search-scroll-container">
          <div class="jellio-search-container">
            <input type="text" class="jellio-search-input-box" id="search-input-display" data-focusable="true" placeholder="Search movies, shows, cast & crew..." />
            <div class="jellio-onscreen-keyboard" id="search-keyboard"></div>
            <div id="search-filter-bar" style="display: flex; gap: 10px; margin-top: 8px;"></div>
          </div>

          <div id="search-correction-box" style="display: none;"></div>

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

            <div id="search-suggestions-container" style="display: none;"></div>
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
    if (this.topHitTimer) {
      clearTimeout(this.topHitTimer);
      this.topHitTimer = null;
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
    if (this.topHitTimer) {
      clearTimeout(this.topHitTimer);
      this.topHitTimer = null;
    }

    try {
      const variants = expandSearchQueryVariants(term);
      const primaryTerm = variants[0] || term;

      const [localRes, gelatoMovies, gelatoSeries, fuzzyRes] = await Promise.all([
        searchItems(primaryTerm, 40).catch(() => []),
        searchMovies(primaryTerm).catch(() => []),
        searchSeries(primaryTerm).catch(() => []),
        searchFuzzy(primaryTerm, 24).catch(() => ({ items: [], correctedQuery: null, confidence: 0 })),
      ]);

      if (this.isDestroyed) return;

      const items = Array.isArray(localRes) ? localRes : (localRes && localRes.Items) || [];
      let movies = [...items.filter((it) => it.Type === 'Movie'), ...(Array.isArray(gelatoMovies) ? gelatoMovies : [])];
      let series = [...items.filter((it) => it.Type === 'Series'), ...(Array.isArray(gelatoSeries) ? gelatoSeries : [])];
      let people = items.filter((it) => it.Type === 'Person');

      const fuzzyItems = Array.isArray(fuzzyRes?.items) ? fuzzyRes.items : [];
      for (const fi of fuzzyItems) {
        if (fi.Type === 'Movie' || fi.Type === 'movie') movies.push(fi);
        else if (fi.Type === 'Series' || fi.Type === 'series') series.push(fi);
      }

      this.correctedQuery = null;
      if (fuzzyRes?.correctedQuery && fuzzyRes.correctedQuery.toLowerCase() !== primaryTerm.toLowerCase()) {
        const totalPrimary = movies.length + series.length;
        if (totalPrimary === 0 || fuzzyRes.confidence >= 0.75) {
          this.correctedQuery = fuzzyRes.correctedQuery;
          // Auto re-query with correctedQuery if results were empty
          if (totalPrimary === 0) {
            const [corrMovies, corrSeries] = await Promise.all([
              searchMovies(this.correctedQuery).catch(() => []),
              searchSeries(this.correctedQuery).catch(() => []),
            ]);
            if (Array.isArray(corrMovies)) movies.push(...corrMovies);
            if (Array.isArray(corrSeries)) series.push(...corrSeries);
          }
        }
      }

      this.lastResults = { movies, series, people };

      // Deduplicate primary items before suggestion lookup
      const primaryIdentityKeys = new Set();
      for (const item of [...movies, ...series]) {
        for (const k of identityKeys(item)) {
          primaryIdentityKeys.add(k);
        }
      }

      // Fetch "Similar to" suggestions (always fetched whether results exist or not)
      const topHit = movies[0] || series[0] || null;
      let suggestions = [];
      try {
        const suggRes = await getSearchSuggestions(primaryTerm, {
          tmdbId: topHit?.ProviderIds?.Tmdb || topHit?.TmdbId || null,
          mediaType: topHit?.Type?.toLowerCase() || null,
          enableVirtual: true,
        });

        const rawRows = Array.isArray(suggRes?.Rows)
          ? suggRes.Rows
          : (Array.isArray(suggRes?.Suggestions) ? [{ Title: `Similar to ${topHit?.Name || primaryTerm}`, Items: suggRes.Suggestions }] : []);

        suggestions = rawRows.map((r) => {
          const filteredItems = (r.Items || []).filter((it) => {
            const keys = identityKeys(it);
            return !keys.some((k) => primaryIdentityKeys.has(k));
          });
          return {
            title: r.Title || `Similar to ${topHit?.Name || primaryTerm}`,
            items: filteredItems,
          };
        }).filter((r) => r.items.length > 0);
      } catch (_) {}

      this.suggestionRows = suggestions;
      this.displayResults(movies, series, people);

      // Probe #1 top hit on settle (400ms delay)
      if (topHit && topHit.Id) {
        this.topHitTimer = setTimeout(() => {
          prefetchStreams(topHit.Id);
        }, 400);
      }
    } catch (err) {
      console.warn('SearchScreen: search failed', err);
    }
  }

  displayResults(movies, series, people) {
    if (!this.container) return;
    const resultsContainer = this.container.querySelector('#search-results-container');
    const correctionBox = this.container.querySelector('#search-correction-box');
    const moviesSection = this.container.querySelector('#search-movies-section');
    const moviesTrack = this.container.querySelector('#search-movies-track');
    const seriesSection = this.container.querySelector('#search-series-section');
    const seriesTrack = this.container.querySelector('#search-series-track');
    const peopleSection = this.container.querySelector('#search-people-section');
    const peopleTrack = this.container.querySelector('#search-people-track');
    const suggestionsContainer = this.container.querySelector('#search-suggestions-container');

    resultsContainer.style.display = 'block';

    if (this.correctedQuery && correctionBox) {
      correctionBox.style.display = 'block';
      correctionBox.innerHTML = `
        <div class="jellio-search-correction-banner">
          Showing results for <span class="jellio-search-correction-query">"${this.escape(this.correctedQuery)}"</span>
        </div>
      `;
    } else if (correctionBox) {
      correctionBox.style.display = 'none';
      correctionBox.innerHTML = '';
    }

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

    // Render "Similar to" recommendation sections
    if (suggestionsContainer) {
      suggestionsContainer.innerHTML = '';
      if (this.suggestionRows && this.suggestionRows.length > 0) {
        suggestionsContainer.style.display = 'block';
        for (const sRow of this.suggestionRows) {
          const rowWrap = document.createElement('div');
          rowWrap.className = 'jellio-row-container jellio-search-suggestion-section';
          rowWrap.innerHTML = `
            <h2 class="jellio-row-title">${this.escape(sRow.title)}</h2>
            <div class="jellio-row-track"></div>
          `;
          const track = rowWrap.querySelector('.jellio-row-track');
          this.populateTrack(rowWrap, track, sRow.items, (it) => {
            if (this.options.onItemSelect) this.options.onItemSelect(it);
          });
          suggestionsContainer.appendChild(rowWrap);
        }
      } else {
        suggestionsContainer.style.display = 'none';
      }
    }
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

      // Warm focused search cards
      card.addEventListener('focus', () => {
        if (item.Id && item.Type !== 'Person') {
          prefetchStreams(item.Id);
        }
      });

      track.appendChild(card);
    });
  }

  clearResults() {
    if (!this.container) return;
    const resultsContainer = this.container.querySelector('#search-results-container');
    const correctionBox = this.container.querySelector('#search-correction-box');
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (correctionBox) {
      correctionBox.style.display = 'none';
      correctionBox.innerHTML = '';
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.topHitTimer) {
      clearTimeout(this.topHitTimer);
      this.topHitTimer = null;
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

