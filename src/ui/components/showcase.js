// Top showcase header matching HomeItemShowcase.kt.
import { getShowcaseItems } from '../../data/api.js';
import { posterBackdropCandidates, posterLogoCandidates, episodeLabel } from './posterCard.js';

const TICKS_PER_MINUTE = 10000000 * 60;
const SHOWCASE_SETTLE_MS = 300;

export const TMDB_LOGO_SVG = `
<svg class="jellio-tmdb-badge" viewBox="0 0 190.24 81.52" style="width: 28px; height: 12px; vertical-align: middle; flex-shrink: 0;">
  <defs>
    <linearGradient id="tmdb-grad-showcase" y1="40.76" x2="190.24" y2="40.76" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#90cea1"/>
      <stop offset="0.56" stop-color="#3cbec9"/>
      <stop offset="1" stop-color="#00b3e5"/>
    </linearGradient>
  </defs>
  <path fill="url(#tmdb-grad-showcase)" d="M105.67,36.06h66.9A17.67,17.67,0,0,0,190.24,18.4h0A17.67,17.67,0,0,0,172.57.73h-66.9A17.67,17.67,0,0,0,88,18.4h0A17.67,17.67,0,0,0,105.67,36.06Zm-88,45h76.9A17.67,17.67,0,0,0,112.24,63.4h0A17.67,17.67,0,0,0,94.57,45.73H17.67A17.67,17.67,0,0,0,0,63.4H0A17.67,17.67,0,0,0,17.67,81.06ZM10.41,35.42h7.8V6.92h10.1V0H.31v6.9h10.1Zm28.1,0h7.8V8.25h.1l9,27.15h6l9.3-27.15h.1V35.4h7.8V0H66.76l-8.2,23.1h-.1L50.31,0H38.51ZM152.43,55.67a15.07,15.07,0,0,0-4.52-5.52,18.57,18.57,0,0,0-6.68-3.08,33.54,33.54,0,0,0-8.07-1h-11.7v35.4h12.75a24.58,24.58,0,0,0,7.55-1.15A19.34,19.34,0,0,0,148.11,77a16.27,16.27,0,0,0,4.37-5.5,16.91,16.91,0,0,0,1.63-7.58A18.5,18.5,0,0,0,152.43,55.67ZM145,68.6A8.8,8.8,0,0,1,142.36,72a10.7,10.7,0,0,1-4,1.82,21.57,21.57,0,0,1-5,.55h-4.05v-21h4.6a17,17,0,0,1,4.67.63,11.66,11.66,0,0,1,3.88,1.87A9.14,9.14,0,0,1,145,59a9.87,9.87,0,0,1,1,4.52A11.89,11.89,0,0,1,145,68.6Zm44.63-.13a8,8,0,0,0-1.58-2.62A8.38,8.38,0,0,0,185.63,64a10.31,10.31,0,0,0-3.17-1v-.1a9.22,9.22,0,0,0,4.42-2.82,7.43,7.43,0,0,0,1.68-5,8.42,8.42,0,0,0-1.15-4.65,8.09,8.09,0,0,0-3-2.72,12.56,12.56,0,0,0-4.18-1.3,32.84,32.84,0,0,0-4.62-.33h-13.2v35.4h14.5a22.41,22.41,0,0,0,4.72-.5,13.53,13.53,0,0,0,4.28-1.65,9.42,9.42,0,0,0,3.1-3,8.52,8.52,0,0,0,1.2-4.68A9.39,9.39,0,0,0,189.66,68.47ZM170.21,52.72h5.3a10,10,0,0,1,1.85.18,6.18,6.18,0,0,1,1.7.57,3.39,3.39,0,0,1,1.22,1.13,3.22,3.22,0,0,1,.48,1.82,3.63,3.63,0,0,1-.43,1.8,3.4,3.4,0,0,1-1.12,1.2,4.92,4.92,0,0,1-1.58.65,7.51,7.51,0,0,1-1.77.2h-5.65Zm11.72,20a3.9,3.9,0,0,1-1.22,1.3,4.64,4.64,0,0,1-1.68.7,8.18,8.18,0,0,1-1.82.2h-7v-8h5.9a15.35,15.35,0,0,1,2,.15,8.47,8.47,0,0,1,2.05.55,4,4,0,0,1,1.57,1.18,3.11,3.11,0,0,1,.63,2A3.71,3.71,0,0,1,181.93,72.72Z"/>
</svg>
`;

export function formatDuration(ticks) {
  if (!ticks || typeof ticks !== 'number') return '';
  const totalMinutes = Math.round(ticks / TICKS_PER_MINUTE);
  if (totalMinutes <= 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function renderHomeItemShowcase(item, info = null) {
  const container = document.createElement('div');
  container.className = 'jellio-showcase';
  container.setAttribute('aria-hidden', 'true');

  if (!item) {
    return container;
  }

  const details = (info && info.item && info.item.Id === item.Id) ? info.item : item;
  const series = (info && info.series && info.item && info.item.Id === item.Id) ? info.series : null;
  const typeStr = (details.Type || '').toLowerCase();
  const isEpisode = typeStr === 'episode' || typeStr === 'season';

  // 1. Right side backdrop with fallback chain
  const backdropContainer = document.createElement('div');
  backdropContainer.className = 'jellio-showcase-backdrop-container';

  const backdropCandidates = posterBackdropCandidates(details, 1280, false, series);
  if (backdropCandidates.length > 0) {
    const backdropImg = document.createElement('img');
    backdropImg.className = 'jellio-showcase-backdrop';
    let candIdx = 0;
    backdropImg.src = backdropCandidates[0];
    backdropImg.onerror = () => {
      candIdx++;
      if (candIdx < backdropCandidates.length) {
        backdropImg.src = backdropCandidates[candIdx];
      } else {
        backdropImg.style.display = 'none';
      }
    };
    backdropContainer.appendChild(backdropImg);
  }
  container.appendChild(backdropContainer);

  // 2. Left content panel
  const content = document.createElement('div');
  content.className = 'jellio-showcase-content';

  // Logo / Title
  const logoBox = document.createElement('div');
  logoBox.className = 'jellio-showcase-logo-box';

  const titleText = isEpisode
    ? (details.SeriesName || (series && series.Name) || details.Name || '')
    : (details.Name || '');

  const logoCandidates = posterLogoCandidates(details, 600, series);
  if (logoCandidates.length > 0) {
    const logoImg = document.createElement('img');
    logoImg.className = 'jellio-showcase-logo';
    logoImg.alt = titleText;
    let logoIdx = 0;
    logoImg.src = logoCandidates[0];
    logoImg.onerror = () => {
      logoIdx++;
      if (logoIdx < logoCandidates.length) {
        logoImg.src = logoCandidates[logoIdx];
      } else {
        logoImg.remove();
        const fallbackTitle = document.createElement('h1');
        fallbackTitle.className = 'jellio-showcase-title';
        fallbackTitle.textContent = titleText;
        logoBox.appendChild(fallbackTitle);
      }
    };
    logoBox.appendChild(logoImg);
  } else {
    const fallbackTitle = document.createElement('h1');
    fallbackTitle.className = 'jellio-showcase-title';
    fallbackTitle.textContent = titleText;
    logoBox.appendChild(fallbackTitle);
  }
  content.appendChild(logoBox);

  // Metadata Line
  const metaParts = [];
  if (isEpisode) {
    const epTag = episodeLabel(details);
    if (epTag) metaParts.push(epTag);
    if (details.Name && epTag) metaParts.push(details.Name);
  } else {
    if (typeStr === 'movie') metaParts.push('Movie');
    else if (typeStr === 'series') metaParts.push('Shows');
    else if (typeStr === 'boxset') metaParts.push('Collection');
  }

  const genre = (details.Genres && details.Genres[0]) || (series && series.Genres && series.Genres[0]);
  if (genre) metaParts.push(genre);

  const durationStr = formatDuration(details.RunTimeTicks);
  if (durationStr) metaParts.push(durationStr);

  const year = details.ProductionYear || (details.PremiereDate ? details.PremiereDate.slice(0, 4) : null);
  if (year) {
    const ongoing = !isEpisode && (details.Status === 'Continuing' || (series && series.Status === 'Continuing'));
    metaParts.push(ongoing ? `${year}-` : String(year));
  }

  const rating = details.CommunityRating || (series && series.CommunityRating && isEpisode ? series.CommunityRating : null);

  const metaRow = document.createElement('div');
  metaRow.className = 'jellio-showcase-metadata';

  metaParts.forEach((part, idx) => {
    if (idx > 0) {
      const dot = document.createElement('span');
      dot.className = 'jellio-showcase-dot';
      dot.textContent = '•';
      metaRow.appendChild(dot);
    }
    const itemSpan = document.createElement('span');
    itemSpan.className = 'jellio-showcase-meta-item';
    itemSpan.textContent = part;
    metaRow.appendChild(itemSpan);
  });

  if (rating && rating > 0) {
    if (metaParts.length > 0) {
      const dot = document.createElement('span');
      dot.className = 'jellio-showcase-dot';
      dot.textContent = '•';
      metaRow.appendChild(dot);
    }
    const ratingBox = document.createElement('span');
    ratingBox.className = 'jellio-showcase-rating';
    ratingBox.innerHTML = `
      ${TMDB_LOGO_SVG}
      <span class="jellio-showcase-rating-val">${Number(rating).toFixed(1)}</span>
    `;
    metaRow.appendChild(ratingBox);
  }
  content.appendChild(metaRow);

  // Status Chip (Ongoing)
  const status = (series && series.Status) || details.Status;
  if (status && status.toLowerCase() === 'continuing') {
    const chip = document.createElement('div');
    chip.className = 'jellio-showcase-chip';
    chip.textContent = 'ONGOING';
    content.appendChild(chip);
  }

  // Overview (3-line clamped)
  const overviewText = details.Overview || (series && series.Overview) || '';
  if (overviewText) {
    const overviewEl = document.createElement('p');
    overviewEl.className = 'jellio-showcase-overview';
    overviewEl.textContent = overviewText;
    content.appendChild(overviewEl);
  }

  container.appendChild(content);
  return container;
}

export class ShowcaseHost {
  constructor(options = {}) {
    this.fallbackItem = options.fallback || null;
    this.highlightedItem = null;
    this.activeItem = null;
    this.showcaseInfo = null;
    this.container = null;
    this.settleTimer = null;
    this.fetchToken = 0;
  }

  mount(parentEl) {
    if (!parentEl) return;
    this.container = document.createElement('div');
    this.container.className = 'jellio-showcase-host';
    this.container.setAttribute('aria-hidden', 'true');
    parentEl.appendChild(this.container);
    this.update();
  }

  setFallbackItem(item) {
    this.fallbackItem = item || null;
    if (!this.highlightedItem && !this.activeItem) {
      this.activeItem = this.fallbackItem;
      this.update();
    }
  }

  setHighlightedItem(item) {
    if (!item) return;
    if (this.highlightedItem && this.highlightedItem.Id === item.Id) return;
    this.highlightedItem = item;

    if (this.settleTimer) clearTimeout(this.settleTimer);

    if (!this.activeItem) {
      this.activeItem = item;
      this.loadInfo(item);
      this.update();
      return;
    }

    this.settleTimer = setTimeout(() => {
      this.activeItem = item;
      this.loadInfo(item);
      this.update();
    }, SHOWCASE_SETTLE_MS);
  }

  async loadInfo(item) {
    const currentToken = ++this.fetchToken;
    const isEpisode = (item.Type || '').toLowerCase() === 'episode' || (item.Type || '').toLowerCase() === 'season';
    const seriesId = isEpisode ? item.SeriesId : null;

    const ids = [];
    if (!item.Overview) ids.push(item.Id);
    if (seriesId) ids.push(seriesId);

    if (ids.length === 0) {
      this.showcaseInfo = { item, series: null };
      return;
    }

    try {
      const fetchedMap = await getShowcaseItems(ids);
      if (this.fetchToken !== currentToken) return;

      const enrichedItem = (fetchedMap && fetchedMap[item.Id]) || item;
      const enrichedSeries = seriesId && fetchedMap ? fetchedMap[seriesId] : null;

      this.showcaseInfo = {
        item: enrichedItem,
        series: enrichedSeries,
      };
      this.update();
    } catch (_) {
      // Keep existing details on failure
    }
  }

  update() {
    if (!this.container) return;
    const item = this.activeItem || this.fallbackItem;
    this.container.innerHTML = '';
    if (item) {
      const element = renderHomeItemShowcase(item, this.showcaseInfo);
      this.container.appendChild(element);
    }
  }

  destroy() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.container) this.container.remove();
  }
}
