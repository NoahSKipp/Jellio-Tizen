// Universal TV poster card renderer (Portrait 2:3 and Landscape 16:9).
import { openCardDialog } from './cardDialog.js';

export const CardAspectRatio = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

export function renderPosterCard(item, options = {}) {
  const {
    aspectRatio = CardAspectRatio.PORTRAIT,
    imageUrl = '',
    onSelect = () => {},
    onLongSelect = null,
    onToggleWatchlist = null,
    onToggleWatched = null,
    onRemoveFromRow = null,
    onAddToFriendWatchlist = null,
  } = options;

  const card = document.createElement('div');
  const orientationClass = aspectRatio === CardAspectRatio.LANDSCAPE
    ? 'jellio-card-landscape'
    : 'jellio-card-portrait';
  card.className = `jellio-poster-card ${orientationClass}`;
  card.setAttribute('data-focusable', 'true');
  card.setAttribute('data-item-id', item ? item.Id : '');

  const title = (item && (item.Name || item.SeriesName)) || 'Untitled';
  const subtitle = (item && item.SeriesName && item.Name !== item.SeriesName) ? item.Name : (item ? item.ProductionYear || '' : '');

  // Progress Bar calculation
  let progressHtml = '';
  if (item && item.UserData && item.UserData.PlaybackPositionTicks && item.RunTimeTicks) {
    const percent = Math.min(100, Math.max(0, (item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100));
    progressHtml = `<div class="jellio-progress-bar"><div class="jellio-progress-bar-fill" style="width: ${percent}%;"></div></div>`;
  }

  // Watched Badge checkmark
  let watchedHtml = '';
  if (item && item.UserData && item.UserData.Played) {
    watchedHtml = `
      <div class="jellio-watched-check-badge">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </div>
    `;
  }

  // Rating badge
  let ratingHtml = '';
  if (item && item.CommunityRating) {
    ratingHtml = `
      <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700; color: #ff9800;">
        ★ ${Number(item.CommunityRating).toFixed(1)}
      </div>
    `;
  }

  // AddedBy Stacked friend avatars badge
  let addedByHtml = '';
  if (item && Array.isArray(item.AddedBy) && item.AddedBy.length > 0) {
    const avatars = item.AddedBy.slice(0, 3).map((f) => {
      const initial = (f.UserName || 'U').charAt(0).toUpperCase();
      return `<div class="jellio-badge-stack-avatar" style="display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff;">${initial}</div>`;
    }).join('');
    addedByHtml = `<div class="jellio-badge-stack">${avatars}</div>`;
  }

  card.innerHTML = `
    ${imageUrl ? `<img class="jellio-poster-card-img" src="${imageUrl}" alt="${title}" loading="lazy">` : '<div class="jellio-poster-card-placeholder"></div>'}
    <div class="jellio-poster-card-overlay">
      <div class="jellio-poster-card-title">${title}</div>
      ${subtitle ? `<div class="jellio-poster-card-subtitle">${subtitle}</div>` : ''}
    </div>
    ${ratingHtml}
    ${watchedHtml}
    ${addedByHtml}
    ${progressHtml}
  `;

  // Select handling
  card.addEventListener('click', () => {
    onSelect(item);
  });

  // Long press handler / context menu trigger
  const triggerContextMenu = () => {
    if (typeof onLongSelect === 'function') {
      onLongSelect(item);
      return;
    }

    const isWatchlisted = Boolean(item && item.UserData && item.UserData.IsFavorite);
    const isPlayed = Boolean(item && item.UserData && item.UserData.Played);

    const actions = [];
    actions.push({
      label: 'Play / View Details',
      onClick: () => onSelect(item),
    });

    if (typeof onToggleWatchlist === 'function') {
      actions.push({
        label: isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist',
        onClick: () => onToggleWatchlist(item),
      });
    }

    if (typeof onToggleWatched === 'function') {
      actions.push({
        label: isPlayed ? 'Mark Unwatched' : 'Mark Watched',
        onClick: () => onToggleWatched(item),
      });
    }

    if (typeof onAddToFriendWatchlist === 'function') {
      actions.push({
        label: "Add to Friend's Watchlist",
        onClick: () => onAddToFriendWatchlist(item),
      });
    }

    if (typeof onRemoveFromRow === 'function') {
      actions.push({
        label: 'Remove from Row',
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

  // Store trigger helper on card element for remote LongPress engine integration
  card._triggerCardOptions = triggerContextMenu;

  return card;
}
