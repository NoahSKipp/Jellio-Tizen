// Universal TV poster card and row renderer matching PosterCard.kt, PosterRow.kt, StudioHubRow.kt, ComingSoonRow.kt, and RowListModal.kt.
import { getImageUrl } from '../../data/api.js';
import { openCardDialog } from './cardDialog.js';
import { focusElement, focusFirstIn, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { t } from '../../runtime/i18n.js';

export const CardAspectRatio = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

const TICKS_PER_MINUTE = 10000000 * 60;
const EXPAND_DELAY_MS = 2500;
const ROW_PAGE_SIZE = 20;

export const TMDB_BADGE_SVG = `
<svg class="jellio-tmdb-badge" viewBox="0 0 190.24 81.52" style="width: 24px; height: 11px; vertical-align: middle; flex-shrink: 0;">
  <defs>
    <linearGradient id="tmdb-grad-card" y1="40.76" x2="190.24" y2="40.76" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#90cea1"/>
      <stop offset="0.56" stop-color="#3cbec9"/>
      <stop offset="1" stop-color="#00b3e5"/>
    </linearGradient>
  </defs>
  <path fill="url(#tmdb-grad-card)" d="M105.67,36.06h66.9A17.67,17.67,0,0,0,190.24,18.4h0A17.67,17.67,0,0,0,172.57.73h-66.9A17.67,17.67,0,0,0,88,18.4h0A17.67,17.67,0,0,0,105.67,36.06Zm-88,45h76.9A17.67,17.67,0,0,0,112.24,63.4h0A17.67,17.67,0,0,0,94.57,45.73H17.67A17.67,17.67,0,0,0,0,63.4H0A17.67,17.67,0,0,0,17.67,81.06ZM10.41,35.42h7.8V6.92h10.1V0H.31v6.9h10.1Zm28.1,0h7.8V8.25h.1l9,27.15h6l9.3-27.15h.1V35.4h7.8V0H66.76l-8.2,23.1h-.1L50.31,0H38.51ZM152.43,55.67a15.07,15.07,0,0,0-4.52-5.52,18.57,18.57,0,0,0-6.68-3.08,33.54,33.54,0,0,0-8.07-1h-11.7v35.4h12.75a24.58,24.58,0,0,0,7.55-1.15A19.34,19.34,0,0,0,148.11,77a16.27,16.27,0,0,0,4.37-5.5,16.91,16.91,0,0,0,1.63-7.58A18.5,18.5,0,0,0,152.43,55.67ZM145,68.6A8.8,8.8,0,0,1,142.36,72a10.7,10.7,0,0,1-4,1.82,21.57,21.57,0,0,1-5,.55h-4.05v-21h4.6a17,17,0,0,1,4.67.63,11.66,11.66,0,0,1,3.88,1.87A9.14,9.14,0,0,1,145,59a9.87,9.87,0,0,1,1,4.52A11.89,11.89,0,0,1,145,68.6Zm44.63-.13a8,8,0,0,0-1.58-2.62A8.38,8.38,0,0,0,185.63,64a10.31,10.31,0,0,0-3.17-1v-.1a9.22,9.22,0,0,0,4.42-2.82,7.43,7.43,0,0,0,1.68-5,8.42,8.42,0,0,0-1.15-4.65,8.09,8.09,0,0,0-3-2.72,12.56,12.56,0,0,0-4.18-1.3,32.84,32.84,0,0,0-4.62-.33h-13.2v35.4h14.5a22.41,22.41,0,0,0,4.72-.5,13.53,13.53,0,0,0,4.28-1.65,9.42,9.42,0,0,0,3.1-3,8.52,8.52,0,0,0,1.2-4.68A9.39,9.39,0,0,0,189.66,68.47ZM170.21,52.72h5.3a10,10,0,0,1,1.85.18,6.18,6.18,0,0,1,1.7.57,3.39,3.39,0,0,1,1.22,1.13,3.22,3.22,0,0,1,.48,1.82,3.63,3.63,0,0,1-.43,1.8,3.4,3.4,0,0,1-1.12,1.2,4.92,4.92,0,0,1-1.58.65,7.51,7.51,0,0,1-1.77.2h-5.65Zm11.72,20a3.9,3.9,0,0,1-1.22,1.3,4.64,4.64,0,0,1-1.68.7,8.18,8.18,0,0,1-1.82.2h-7v-8h5.9a15.35,15.35,0,0,1,2,.15,8.47,8.47,0,0,1,2.05.55,4,4,0,0,1,1.57,1.18,3.11,3.11,0,0,1,.63,2A3.71,3.71,0,0,1,181.93,72.72Z"/>
</svg>
`;

export function isEpisodeLike(item) {
  if (!item || !item.Type) return false;
  const t = item.Type.toLowerCase();
  return t === 'episode' || t === 'season';
}

export function episodeLabel(item) {
  if (!item) return '';
  const type = (item.Type || '').toLowerCase();
  if (type !== 'episode') return '';
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;
  if (season !== undefined && season !== null && episode !== undefined && episode !== null) {
    return `S${season} E${episode}`;
  }
  if (episode !== undefined && episode !== null) {
    return `E${episode}`;
  }
  if (season !== undefined && season !== null) {
    return `S${season}`;
  }
  return '';
}

export function remainingLabel(item) {
  if (!item) return '';
  const runTicks = item.RunTimeTicks;
  const posTicks = item.UserData ? item.UserData.PlaybackPositionTicks : null;
  if (!runTicks || !posTicks || runTicks <= 0 || posTicks <= 0 || posTicks >= runTicks) return '';
  const minutes = Math.round((runTicks - posTicks) / TICKS_PER_MINUTE);
  return minutes > 0 ? `${minutes}m left` : '';
}

export function posterImageCandidates(item, maxWidth = 400, seriesFirst = false) {
  if (!item) return [];
  const urls = [];
  const seen = new Set();
  const add = (id, tag, type) => {
    if (!id) return;
    const url = getImageUrl(id, tag || null, type, maxWidth);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  const isEp = isEpisodeLike(item);
  const seriesPrimaryTag = item.SeriesPrimaryImageTag || (item.ImageTags && item.ImageTags.SeriesPrimary);
  const primaryTag = (item.ImageTags && item.ImageTags.Primary) || item.PrimaryImageTag;

  if (seriesFirst && isEp) {
    if (seriesPrimaryTag) add(item.SeriesId, seriesPrimaryTag, 'Primary');
    add(item.SeriesId, null, 'Primary');
  }
  if (primaryTag) add(item.Id, primaryTag, 'Primary');
  add(item.Id, null, 'Primary');

  if (item.SeriesId) {
    if (seriesPrimaryTag) add(item.SeriesId, seriesPrimaryTag, 'Primary');
    add(item.SeriesId, null, 'Primary');
  }

  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    add(item.ParentThumbItemId, item.ParentThumbImageTag, 'Thumb');
  }

  const parentPrimaryId = item.ParentPrimaryImageItemId || item.ParentId;
  if (parentPrimaryId) {
    if (item.ParentPrimaryImageTag) add(parentPrimaryId, item.ParentPrimaryImageTag, 'Primary');
    add(parentPrimaryId, null, 'Primary');
  }

  if (item.AlbumId) {
    if (item.AlbumPrimaryImageTag) add(item.AlbumId, item.AlbumPrimaryImageTag, 'Primary');
    add(item.AlbumId, null, 'Primary');
  }

  const thumbTag = (item.ImageTags && item.ImageTags.Thumb) || item.ThumbImageTag;
  if (thumbTag) add(item.Id, thumbTag, 'Thumb');

  const backdropTag = (item.BackdropImageTags && item.BackdropImageTags[0]) || (item.ImageTags && item.ImageTags.Backdrop);
  if (backdropTag) add(item.Id, backdropTag, 'Backdrop');

  if (item.ParentBackdropItemId && item.ParentBackdropImageTags && item.ParentBackdropImageTags[0]) {
    add(item.ParentBackdropItemId, item.ParentBackdropImageTags[0], 'Backdrop');
  }

  add(item.Id, null, 'Thumb');
  add(item.Id, null, 'Backdrop');

  return urls;
}

export function posterBackdropCandidates(item, maxWidth = 800, episodeStill = false, series = null) {
  if (!item) return [];
  const urls = [];
  const seen = new Set();
  const add = (id, tag, type) => {
    if (!id) return;
    const url = getImageUrl(id, tag || null, type, maxWidth);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  const isEp = isEpisodeLike(item);
  const ownPrimary = (item.ImageTags && item.ImageTags.Primary) || item.PrimaryImageTag;
  if (episodeStill && isEp && ownPrimary) {
    add(item.Id, ownPrimary, 'Primary');
  }

  const ownBackdrop = (item.BackdropImageTags && item.BackdropImageTags[0]) || (item.ImageTags && item.ImageTags.Backdrop);
  if (!isEp && ownBackdrop) {
    add(item.Id, ownBackdrop, 'Backdrop');
  }

  if (series) {
    const seriesBackdrop = (series.BackdropImageTags && series.BackdropImageTags[0]) || (series.ImageTags && series.ImageTags.Backdrop);
    if (seriesBackdrop) add(series.Id, seriesBackdrop, 'Backdrop');
  }

  if (item.ParentBackdropItemId && item.ParentBackdropImageTags && item.ParentBackdropImageTags[0]) {
    add(item.ParentBackdropItemId, item.ParentBackdropImageTags[0], 'Backdrop');
  }

  if (item.SeriesId) {
    add(item.SeriesId, null, 'Backdrop');
  }

  if (isEp && ownBackdrop) {
    add(item.Id, ownBackdrop, 'Backdrop');
  }

  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    add(item.ParentThumbItemId, item.ParentThumbImageTag, 'Thumb');
  }

  const thumbTag = (item.ImageTags && item.ImageTags.Thumb) || item.ThumbImageTag;
  if (thumbTag) add(item.Id, thumbTag, 'Thumb');

  if (isEp && ownPrimary) {
    add(item.Id, ownPrimary, 'Primary');
  }

  add(item.Id, null, 'Backdrop');
  if (ownPrimary) add(item.Id, ownPrimary, 'Primary');

  return urls;
}

export function posterLogoCandidates(item, maxWidth = 400, series = null) {
  if (!item) return [];
  const urls = [];
  const seen = new Set();
  const add = (id, tag, type) => {
    if (!id) return;
    const url = getImageUrl(id, tag || null, type, maxWidth);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  const itemLogo = item.ImageTags && item.ImageTags.Logo;
  if (itemLogo) add(item.Id, itemLogo, 'Logo');

  if (series && series.ImageTags && series.ImageTags.Logo) {
    add(series.Id, series.ImageTags.Logo, 'Logo');
  }

  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    add(item.ParentLogoItemId, item.ParentLogoImageTag, 'Logo');
  }

  if (item.SeriesId) {
    add(item.SeriesId, null, 'Logo');
  }

  if (!isEpisodeLike(item)) {
    add(item.Id, null, 'Logo');
  }

  return urls;
}

export function renderPosterCard(item, options = {}) {
  const {
    aspectRatio = CardAspectRatio.PORTRAIT,
    imageUrl = '',
    canExpand = true,
    progress = false,
    badge = null,
    onSelect = () => {},
    onFocus = null,
    onOptionsClick = null,
    onLongSelect = null,
    onToggleWatchlist = null,
    onToggleWatched = null,
    onRemoveFromRow = null,
    onAddToFriendWatchlist = null,
    userImageUrl = null,
  } = options;

  const isLandscape = aspectRatio === CardAspectRatio.LANDSCAPE;
  const card = document.createElement('div');
  card.className = `jellio-poster-card ${isLandscape ? 'jellio-card-landscape' : 'jellio-card-portrait'}`;
  card.setAttribute('data-focusable', 'true');
  card.setAttribute('data-item-id', item ? item.Id : '');

  const title = (item && (item.Name || item.SeriesName)) || 'Untitled';
  const episode = item ? episodeLabel(item) : '';
  const remaining = progress && item ? remainingLabel(item) : '';

  // Progress Bar percentage calculation
  let percentage = null;
  if (item && item.UserData && !item.UserData.Played) {
    if (typeof item.UserData.PlayedPercentage === 'number' && item.UserData.PlayedPercentage > 0) {
      percentage = Math.min(100, item.UserData.PlayedPercentage);
    } else if (item.UserData.PlaybackPositionTicks && item.RunTimeTicks) {
      percentage = Math.min(100, Math.max(0, (item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100));
    }
  }

  // Fallback image chain
  const candidates = imageUrl ? [imageUrl] : posterImageCandidates(item, 400, progress);
  let candidateIdx = 0;

  const imgEl = document.createElement('img');
  imgEl.className = 'jellio-poster-card-img';
  imgEl.alt = title;
  imgEl.loading = 'lazy';

  const placeholderEl = document.createElement('div');
  placeholderEl.className = 'jellio-poster-card-placeholder';
  placeholderEl.innerHTML = `<span class="jellio-card-placeholder-title">${title}</span>`;
  placeholderEl.style.display = 'none';

  if (candidates.length > 0) {
    imgEl.src = candidates[0];
    imgEl.onerror = () => {
      candidateIdx++;
      if (candidateIdx < candidates.length) {
        imgEl.src = candidates[candidateIdx];
      } else {
        imgEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
      }
    };
  } else {
    imgEl.style.display = 'none';
    placeholderEl.style.display = 'flex';
  }

  card.appendChild(imgEl);
  card.appendChild(placeholderEl);

  // Unexpanded Overlays:
  // 1. Rating Chip (TMDB badge + 7.8 score)
  const rating = item ? item.CommunityRating : null;
  const watchers = item && Array.isArray(item.Watchers) ? item.Watchers : [];
  const addedBy = item && Array.isArray(item.AddedBy) ? item.AddedBy : [];
  const hasFriendsBadges = watchers.length > 0 || addedBy.length > 0;

  if (!progress) {
    const ratingChip = document.createElement('div');
    const alignClass = (hasFriendsBadges && !badge) ? 'jellio-rating-chip-start' : 'jellio-rating-chip-end';
    ratingChip.className = `jellio-card-rating-chip ${alignClass}`;
    const formattedRating = (rating && rating > 0) ? Number(rating).toFixed(1) : '-';
    ratingChip.innerHTML = `
      ${TMDB_BADGE_SVG}
      <span class="jellio-card-rating-val">${formattedRating}</span>
    `;
    card.appendChild(ratingChip);
  }

  // 2. AddedBy Stacked Avatars badge (top-right)
  if (addedBy.length > 0) {
    const addedByBox = document.createElement('div');
    addedByBox.className = 'jellio-card-addedby-badge';
    let avatarsHtml = '';
    const slice = addedBy.slice(0, 3);
    for (const f of slice) {
      const uId = f.UserId || f.Id;
      const avatarUrl = userImageUrl ? userImageUrl(uId, f.PrimaryImageTag) : (f.AvatarUrl || '');
      if (avatarUrl) {
        avatarsHtml += `<img class="jellio-badge-stack-avatar" src="${avatarUrl}" alt="${f.UserName || ''}">`;
      } else {
        const initial = (f.UserName || 'U').charAt(0).toUpperCase();
        avatarsHtml += `<div class="jellio-badge-stack-avatar initial">${initial}</div>`;
      }
    }
    addedByBox.innerHTML = `
      <svg class="jellio-badge-bookmark-icon" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
      <div class="jellio-badge-stack">${avatarsHtml}</div>
    `;
    card.appendChild(addedByBox);
  }

  // 3. Watchers Stacked Avatars badge
  if (watchers.length > 0) {
    const watchersBox = document.createElement('div');
    const topClass = addedBy.length > 0 ? 'jellio-card-watchers-offset' : '';
    watchersBox.className = `jellio-card-watchers-badge ${topClass}`;
    let avatarsHtml = '';
    const slice = watchers.slice(0, 3);
    for (const w of slice) {
      const uId = w.UserId || w.Id;
      const avatarUrl = userImageUrl ? userImageUrl(uId, w.PrimaryImageTag) : (w.AvatarUrl || '');
      if (avatarUrl) {
        avatarsHtml += `<img class="jellio-badge-stack-avatar" src="${avatarUrl}" alt="${w.UserName || ''}">`;
      } else {
        const initial = (w.UserName || 'U').charAt(0).toUpperCase();
        avatarsHtml += `<div class="jellio-badge-stack-avatar initial">${initial}</div>`;
      }
    }
    watchersBox.innerHTML = `<div class="jellio-badge-stack">${avatarsHtml}</div>`;
    card.appendChild(watchersBox);
  }

  // 4. Badge pill (e.g., release date for Coming Soon) at top-left
  if (badge) {
    const badgeEl = document.createElement('div');
    badgeEl.className = 'jellio-card-date-badge';
    badgeEl.textContent = badge;
    card.appendChild(badgeEl);
  }

  // 5. Episode chip (bottom-left when progress: true and episode exists)
  if (progress && episode) {
    const epChip = document.createElement('div');
    epChip.className = `jellio-card-episode-chip ${percentage !== null ? 'has-progress' : ''}`;
    epChip.textContent = episode;
    card.appendChild(epChip);
  }

  // 6. Watched checkmark badge (bottom-right)
  if (item && item.UserData && item.UserData.Played) {
    const playedCheck = document.createElement('div');
    playedCheck.className = 'jellio-watched-check-badge';
    playedCheck.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: currentColor;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    `;
    card.appendChild(playedCheck);
  }

  // 7. Bottom edge progress bar (4px)
  if (percentage !== null) {
    const progressEl = document.createElement('div');
    progressEl.className = 'jellio-progress-bar';
    progressEl.innerHTML = `<div class="jellio-progress-bar-fill" style="width: ${percentage}%;"></div>`;
    card.appendChild(progressEl);
  }

  // 8. Expanded Banner Container (16:9 banner expansion on 2500ms focus)
  let expandTimer = null;
  let expandedBackdropEl = null;
  let expandedBannerBox = null;

  function expandCard() {
    if (card.classList.contains('jellio-card-expanded')) return;
    card.classList.add('jellio-card-expanded');

    if (!expandedBannerBox) {
      expandedBannerBox = document.createElement('div');
      expandedBannerBox.className = 'jellio-card-expanded-overlay';

      const backdrops = posterBackdropCandidates(item, 800, progress);
      const logos = posterLogoCandidates(item, 300);

      expandedBackdropEl = document.createElement('img');
      expandedBackdropEl.className = 'jellio-card-expanded-backdrop';
      let bIdx = 0;
      if (backdrops.length > 0) {
        expandedBackdropEl.src = backdrops[0];
        expandedBackdropEl.onerror = () => {
          bIdx++;
          if (bIdx < backdrops.length) {
            expandedBackdropEl.src = backdrops[bIdx];
          } else {
            expandedBackdropEl.src = imgEl.src;
          }
        };
      } else {
        expandedBackdropEl.src = imgEl.src;
      }
      expandedBannerBox.appendChild(expandedBackdropEl);

      const scrim = document.createElement('div');
      scrim.className = 'jellio-card-expanded-scrim';
      expandedBannerBox.appendChild(scrim);

      if (remaining) {
        const remChip = document.createElement('div');
        remChip.className = 'jellio-card-remaining-chip';
        remChip.textContent = remaining;
        expandedBannerBox.appendChild(remChip);
      }

      const infoColumn = document.createElement('div');
      infoColumn.className = `jellio-card-expanded-info ${percentage !== null ? 'has-progress' : ''}`;

      if (logos.length > 0) {
        const logoImg = document.createElement('img');
        logoImg.className = 'jellio-card-expanded-logo';
        logoImg.alt = title;
        let lIdx = 0;
        logoImg.src = logos[0];
        logoImg.onerror = () => {
          lIdx++;
          if (lIdx < logos.length) {
            logoImg.src = logos[lIdx];
          } else {
            logoImg.remove();
            const fallbackTitle = document.createElement('div');
            fallbackTitle.className = 'jellio-card-expanded-title';
            fallbackTitle.textContent = title;
            infoColumn.prepend(fallbackTitle);
          }
        };
        infoColumn.appendChild(logoImg);
      } else {
        const fallbackTitle = document.createElement('div');
        fallbackTitle.className = 'jellio-card-expanded-title';
        fallbackTitle.textContent = title;
        infoColumn.appendChild(fallbackTitle);
      }

      if (progress && episode) {
        const epSub = document.createElement('div');
        epSub.className = 'jellio-card-expanded-subtitle';
        const epName = item && item.Name && item.Name !== item.SeriesName ? item.Name : '';
        epSub.textContent = epName ? `${episode} · ${epName}` : episode;
        infoColumn.appendChild(epSub);
      }

      expandedBannerBox.appendChild(infoColumn);
      card.appendChild(expandedBannerBox);
    } else {
      expandedBannerBox.style.display = 'block';
    }
  }

  function collapseCard() {
    if (expandTimer) {
      clearTimeout(expandTimer);
      expandTimer = null;
    }
    if (card.classList.contains('jellio-card-expanded')) {
      card.classList.remove('jellio-card-expanded');
      if (expandedBannerBox) {
        expandedBannerBox.style.display = 'none';
      }
    }
  }

  // Focus & Blur Event Listeners
  card.addEventListener('focus', () => {
    if (typeof onFocus === 'function' && item) {
      onFocus(item);
    }
    if (canExpand && !isLandscape) {
      expandTimer = setTimeout(() => {
        expandCard();
      }, EXPAND_DELAY_MS);
    }
  });

  card.addEventListener('blur', () => {
    collapseCard();
  });

  card.addEventListener('mouseenter', () => {
    if (typeof onFocus === 'function' && item) {
      onFocus(item);
    }
    if (canExpand && !isLandscape) {
      expandTimer = setTimeout(() => {
        expandCard();
      }, EXPAND_DELAY_MS);
    }
  });

  card.addEventListener('mouseleave', () => {
    if (document.activeElement !== card) {
      collapseCard();
    }
  });

  // Select click handler
  card.addEventListener('click', () => {
    onSelect(item);
  });

  // Context menu / long press options trigger
  const triggerContextMenu = () => {
    if (typeof onOptionsClick === 'function') {
      onOptionsClick(item);
      return;
    }
    if (typeof onLongSelect === 'function') {
      onLongSelect(item);
      return;
    }

    const isWatchlisted = Boolean(item && item.UserData && item.UserData.IsFavorite);
    const isPlayed = Boolean(item && item.UserData && item.UserData.Played);

    const actions = [];
    actions.push({
      label: t('menu_go_to_details', 'Go to Details'),
      onClick: () => onSelect(item),
    });

    if (item && item.SeriesId) {
      actions.push({
        label: t('menu_go_to_series', 'Go to Series'),
        onClick: () => onSelect({ Id: item.SeriesId, Type: 'Series' }),
      });
    }

    if (typeof onToggleWatchlist === 'function') {
      actions.push({
        label: isWatchlisted ? t('menu_remove_watchlist', 'Remove from Watchlist') : t('menu_add_watchlist', 'Add to Watchlist'),
        onClick: () => onToggleWatchlist(item),
      });
    }

    if (typeof onToggleWatched === 'function') {
      actions.push({
        label: isPlayed ? t('menu_mark_unwatched', 'Mark Unwatched') : t('menu_mark_watched', 'Mark Watched'),
        onClick: () => onToggleWatched(item),
      });
    }

    if (typeof onAddToFriendWatchlist === 'function') {
      actions.push({
        label: t('menu_add_friend_watchlist', "Add to Friend's Watchlist"),
        onClick: () => onAddToFriendWatchlist(item),
      });
    }

    if (typeof onRemoveFromRow === 'function') {
      actions.push({
        label: t('menu_remove_continue', 'Remove from Continue Watching'),
        danger: true,
        onClick: () => onRemoveFromRow(item),
      });
    }

    openCardDialog({
      title: title,
      actions,
    });
  };

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    triggerContextMenu();
  });

  card._triggerCardOptions = triggerContextMenu;

  return card;
}

// PosterRow component matching PosterRow.kt
export function renderPosterRow(section, options = {}) {
  const {
    onItemClick = null,
    onSelect = null,
    onItemFocus = null,
    onFocus = null,
    onItemOptions = null,
    onTitleClick = null,
    onToggleWatchlist = null,
    onToggleWatched = null,
    onRemoveFromRow = null,
    onAddToFriendWatchlist = null,
    progress = false,
    userImageUrl = null,
  } = options;

  const handleSelect = onItemClick || onSelect || (() => {});
  const handleFocus = onItemFocus || onFocus || null;

  const rowContainer = document.createElement('div');
  rowContainer.className = 'jellio-row-container';
  rowContainer.setAttribute('data-row-key', section.key || section.title);

  // Header with RowTitle
  const header = document.createElement('div');
  header.className = 'jellio-row-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'jellio-row-title';
  titleEl.textContent = section.title;

  header.appendChild(titleEl);
  rowContainer.appendChild(header);

  // Horizontal Track
  const track = document.createElement('div');
  track.className = 'jellio-row-track';
  track.setAttribute('data-scroll-orientation', 'horizontal');

  const items = section.items || [];
  let currentItems = items.slice();

  function appendCard(item) {
    const card = renderPosterCard(item, {
      aspectRatio: section.landscape ? CardAspectRatio.LANDSCAPE : CardAspectRatio.PORTRAIT,
      progress,
      userImageUrl,
      onSelect: handleSelect,
      onFocus: handleFocus ? (it) => handleFocus(it, card) : null,
      onOptionsClick: onItemOptions,
      onToggleWatchlist,
      onToggleWatched,
      onRemoveFromRow,
      onAddToFriendWatchlist,
    });
    track.appendChild(card);
  }

  currentItems.forEach((item) => appendCard(item));

  // "See All" Expand Button
  const hasMore = (section.fetchPage || (section.items && section.items.length > 20) || section.fetchAll);
  if (hasMore) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'jellio-row-expand-button';
    expandBtn.setAttribute('data-focusable', 'true');
    expandBtn.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 28px; height: 28px; fill: currentColor;"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
      <span>See All</span>
    `;
    expandBtn.addEventListener('click', () => {
      if (typeof onTitleClick === 'function') {
        onTitleClick();
      } else {
        openRowListModal(section, { ...options, onItemClick: handleSelect });
      }
    });
    track.appendChild(expandBtn);
  }

  // Infinite scroll listener for paged rows
  if (section.fetchPage) {
    let isLoading = false;
    let isExhausted = false;
    let nextStart = currentItems.length;

    track.addEventListener('focusin', async (e) => {
      const cards = Array.from(track.querySelectorAll('.jellio-poster-card'));
      const activeIdx = cards.indexOf(e.target);
      if (activeIdx >= cards.length - 4 && !isLoading && !isExhausted) {
        isLoading = true;
        try {
          const newItems = await section.fetchPage(nextStart, ROW_PAGE_SIZE);
          nextStart += ROW_PAGE_SIZE;
          if (!newItems || newItems.length === 0) {
            isExhausted = true;
          } else {
            const existingIds = new Set(currentItems.map((it) => it.Id));
            const fresh = newItems.filter((it) => !existingIds.has(it.Id));
            if (fresh.length === 0) {
              isExhausted = true;
            } else {
              currentItems = currentItems.concat(fresh);
              const expandBtn = track.querySelector('.jellio-row-expand-button');
              fresh.forEach((it) => {
                const card = renderPosterCard(it, {
                  aspectRatio: section.landscape ? CardAspectRatio.LANDSCAPE : CardAspectRatio.PORTRAIT,
                  progress,
                  userImageUrl,
                  onSelect: handleSelect,
                  onFocus: handleFocus ? (focusedIt) => handleFocus(focusedIt, card) : null,
                  onOptionsClick: onItemOptions,
                  onToggleWatchlist,
                  onToggleWatched,
                  onRemoveFromRow,
                  onAddToFriendWatchlist,
                });
                if (expandBtn) track.insertBefore(card, expandBtn);
                else track.appendChild(card);
              });
            }
          }
        } catch (_) {} finally {
          isLoading = false;
        }
      }
    });
  }

  rowContainer.appendChild(track);
  return rowContainer;
}

// StudioHubRow matching StudioHubRow.kt
export function renderStudioHubRow(services, options = {}) {
  const {
    logoUrl = (service) => getImageUrl(service, null, 'Logo', 300),
    onServiceClick = () => {},
  } = options;

  if (!services || services.length === 0) return null;

  const rowContainer = document.createElement('div');
  rowContainer.className = 'jellio-row-container jellio-studio-hub-row';

  const header = document.createElement('div');
  header.className = 'jellio-row-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'jellio-row-title';
  titleEl.textContent = t('tv_studio_hubs', 'Streaming Services');
  header.appendChild(titleEl);
  rowContainer.appendChild(header);

  const track = document.createElement('div');
  track.className = 'jellio-row-track';
  track.setAttribute('data-scroll-orientation', 'horizontal');

  services.forEach((service) => {
    const tile = document.createElement('div');
    tile.className = 'jellio-studio-hub-tile';
    tile.setAttribute('data-focusable', 'true');

    const logoSrc = logoUrl(service);
    tile.innerHTML = `
      <img class="jellio-studio-hub-logo" src="${logoSrc}" alt="${service}" />
      <span class="jellio-studio-hub-name" style="display: none;">${service}</span>
    `;

    const img = tile.querySelector('img');
    const nameEl = tile.querySelector('.jellio-studio-hub-name');
    img.onerror = () => {
      img.style.display = 'none';
      nameEl.style.display = 'block';
    };

    tile.addEventListener('click', () => {
      onServiceClick(service);
    });

    track.appendChild(tile);
  });

  rowContainer.appendChild(track);
  return rowContainer;
}

// ComingSoonRow matching ComingSoonRow.kt
export function renderComingSoonRow(entries, options = {}) {
  const {
    onItemClick = null,
    onSelect = null,
    onItemFocus = null,
    onFocus = null,
    onItemOptions = null,
    onRemoveFromComingSoon = null,
    itemsMap = {},
  } = options;

  const handleSelect = onItemClick || onSelect || (() => {});
  const handleFocus = onItemFocus || onFocus || null;

  if (!entries || entries.length === 0) return null;

  const rowContainer = document.createElement('div');
  rowContainer.className = 'jellio-row-container jellio-coming-soon-row';

  const header = document.createElement('div');
  header.className = 'jellio-row-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'jellio-row-title';
  titleEl.textContent = t('tv_coming_soon', 'Coming Soon');
  header.appendChild(titleEl);
  rowContainer.appendChild(header);

  const track = document.createElement('div');
  track.className = 'jellio-row-track';
  track.setAttribute('data-scroll-orientation', 'horizontal');

  entries.forEach((entry) => {
    const dateLabel = formatComingSoonDate(entry.Date);
    const cleanId = String(entry.ItemId || '').replace(/-/g, '').toLowerCase();
    const item = itemsMap[cleanId] || {
      Id: entry.ItemId || entry.Id,
      Name: entry.Name || entry.Title || 'Upcoming',
      Type: entry.Kind === 'episode' ? 'Episode' : 'Movie',
      ParentIndexNumber: entry.SeasonNumber,
      IndexNumber: entry.EpisodeNumber,
    };

    const card = renderPosterCard(item, {
      aspectRatio: CardAspectRatio.PORTRAIT,
      badge: dateLabel,
      onSelect: () => handleSelect(item),
      onFocus: handleFocus ? (it) => handleFocus(it, card) : null,
      onOptionsClick: onItemOptions ? () => onItemOptions(entry) : null,
      onRemoveFromRow: onRemoveFromComingSoon ? () => onRemoveFromComingSoon(entry) : null,
    });

    track.appendChild(card);
  });

  rowContainer.appendChild(track);
  return rowContainer;
}

function formatComingSoonDate(rawDate) {
  if (!rawDate) return '';
  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffDays = Math.round((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return t('calendar_today', 'Today');
  if (diffDays === 1) return t('calendar_tomorrow', 'Tomorrow');
  if (diffDays < 7) return `In ${diffDays} days`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// RowListModal matching RowListModal.kt
export function openRowListModal(section, options = {}) {
  const overlayRoot = document.getElementById('jellio-overlay-root');
  if (!overlayRoot) return null;

  const {
    onItemClick = () => {},
  } = options;

  let displayedItems = (section.items || []).slice();
  let isLoading = false;
  let isExhausted = !section.fetchPage;
  let nextStart = displayedItems.length;

  const modal = document.createElement('div');
  modal.className = 'jellio-row-list-modal';
  modal.setAttribute('data-focus-group', 'row-list-modal');

  modal.innerHTML = `
    <div class="jellio-row-list-header">
      <h1 class="jellio-row-list-title">${section.title}</h1>
      <span class="jellio-row-list-count" id="row-modal-count">${displayedItems.length} titles</span>
      <button class="jellio-row-list-close-btn" data-focusable="true" data-action="close">✕</button>
    </div>
    <div class="jellio-row-list-grid" id="row-modal-grid"></div>
  `;

  const grid = modal.querySelector('#row-modal-grid');
  const countEl = modal.querySelector('#row-modal-count');

  function renderGridCards(itemsToAppend) {
    itemsToAppend.forEach((item) => {
      const card = renderPosterCard(item, {
        aspectRatio: CardAspectRatio.PORTRAIT,
        canExpand: false,
        onSelect: (it) => {
          closeModal();
          onItemClick(it);
        },
      });
      grid.appendChild(card);
    });
    if (countEl) countEl.textContent = `${displayedItems.length} titles`;
  }

  renderGridCards(displayedItems);

  function closeModal() {
    popFocusTrap(modal);
    modal.remove();
  }

  modal.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-action="close"]');
    if (closeBtn) {
      closeModal();
    }
  });

  // Modal infinite scrolling
  if (section.fetchPage) {
    grid.addEventListener('focusin', async (e) => {
      const cards = Array.from(grid.querySelectorAll('.jellio-poster-card'));
      const activeIdx = cards.indexOf(e.target);
      if (activeIdx >= cards.length - 8 && !isLoading && !isExhausted) {
        isLoading = true;
        try {
          const newItems = await section.fetchPage(nextStart, ROW_PAGE_SIZE);
          nextStart += ROW_PAGE_SIZE;
          if (!newItems || newItems.length === 0) {
            isExhausted = true;
          } else {
            const existingIds = new Set(displayedItems.map((it) => it.Id));
            const fresh = newItems.filter((it) => !existingIds.has(it.Id));
            if (fresh.length === 0) {
              isExhausted = true;
            } else {
              displayedItems = displayedItems.concat(fresh);
              renderGridCards(fresh);
            }
          }
        } catch (_) {} finally {
          isLoading = false;
        }
      }
    });
  }

  overlayRoot.appendChild(modal);
  pushFocusTrap(modal, closeModal);

  focusFirstIn(modal);

  return { close: closeModal };
}
