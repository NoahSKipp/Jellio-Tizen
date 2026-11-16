// Detail screen matching Jellio-TV DetailScreen.kt.
// Full-bleed backdrop, ClearLogo or bold title, metadata row, MediaTechBadges,
// Play / Resume / Start from Beginning / Choose Stream / Trailer / Watchlist / Watched / Like / Dislike,
// Cast & Crew row, Seasons & Episodes with long-press context menu, and More Like This.
import {
  getItem,
  getItemDetails,
  getSeasons,
  getEpisodes,
  getSeriesNextUp,
  getMediaSources,
  prefetchStreams,
  warmSecondSource,
  toggleFavorite,
  setPlayed,
  setItemRating,
  clearResumePosition,
  getImageUrl,
  getRecommendationCandidates,
  TICKS_PER_SECOND,
} from '../../data/api.js';
import { CardAspectRatio, renderPosterCard, posterLogoCandidates } from '../components/posterCard.js';
import { openCardDialog } from '../components/cardDialog.js';
import { TMDB_LOGO_SVG, formatDuration } from '../components/showcase.js';
import { focusFirstIn } from '../../input/spatialNav.js';
import { showAnnouncementToast } from '../overlays/toasts.js';

export function extractMediaTechBadges(item) {
  if (!item) return [];
  const streams = item.MediaStreams || item.MediaSources?.[0]?.MediaStreams || [];
  if (streams.length === 0) return [];

  const videoStream = streams.find((s) => s.Type && s.Type.toLowerCase() === 'video');
  const audioStream =
    streams.find((s) => s.Type && s.Type.toLowerCase() === 'audio' && s.IsDefault) ||
    streams.find((s) => s.Type && s.Type.toLowerCase() === 'audio');

  const badges = [];

  if (videoStream) {
    const width = videoStream.Width || 0;
    const height = videoStream.Height || 0;
    if (width >= 3600 || height >= 2000) {
      badges.push('4K UHD');
    } else if (width >= 1800 || height >= 900) {
      badges.push('1080p');
    } else if (width >= 1200 || height >= 700) {
      badges.push('720p');
    }

    const range = (videoStream.VideoRange || '').toUpperCase();
    const rangeType = (videoStream.VideoRangeType || '').toUpperCase();
    const dispTitle = (videoStream.DisplayTitle || '').toUpperCase();

    if (rangeType.includes('DOVI') || range.includes('DOVI') || dispTitle.includes('VISION')) {
      badges.push('Dolby Vision');
    } else if (rangeType.includes('HDR10+') || range.includes('HDR10+') || dispTitle.includes('HDR10+')) {
      badges.push('HDR10+');
    } else if (range.includes('HDR') || rangeType.includes('HDR') || dispTitle.includes('HDR')) {
      badges.push('HDR10');
    }

    const codec = (videoStream.Codec || '').toUpperCase();
    if (codec === 'HEVC' || codec === 'H265') {
      badges.push('HEVC');
    } else if (codec === 'AV1') {
      badges.push('AV1');
    }
  }

  if (audioStream) {
    const title = ((audioStream.Title || '') + ' ' + (audioStream.DisplayTitle || '')).toUpperCase();
    const codec = (audioStream.Codec || '').toUpperCase();
    const channels = audioStream.Channels || 0;

    if (title.includes('ATMOS')) {
      badges.push('Dolby Atmos');
    } else if (title.includes('DTS:X') || title.includes('DTS-X')) {
      badges.push('DTS:X');
    } else if (title.includes('TRUEHD') || codec === 'TRUEHD') {
      badges.push('TrueHD');
    } else if (title.includes('DTS-HD') || (codec.includes('DTS') && title.includes('HD'))) {
      badges.push('DTS-HD');
    } else if (channels >= 8) {
      badges.push('7.1');
    } else if (channels >= 6) {
      badges.push('5.1');
    } else if (channels === 2) {
      badges.push('Stereo');
    }
  }

  return badges;
}

export class DetailScreen {
  constructor(options = {}) {
    this.options = options;
    this.itemId = options.itemId || null;
    this.container = null;
    this.item = null;
    this.seasons = [];
    this.episodes = [];
    this.activeSeasonId = null;
    this.nextUpEpisode = null;
    this.isDestroyed = false;
  }

  async render(container, itemId = this.itemId) {
    this.isDestroyed = false;
    this.container = container;
    this.itemId = itemId;
    this.container.innerHTML = `
      <div class="jellio-screen jellio-detail-screen" data-focus-group="detail-screen">
        <div class="jellio-screen-scroll" id="detail-scroll-container">
          <section class="jellio-hero-banner" id="detail-hero-banner">
            <div class="jellio-hero-scrim"></div>
            <div class="jellio-hero-content">
              <div id="detail-logo-box" style="min-height: 54px; display: flex; align-items: flex-end;">
                <h1 class="jellio-title-hero" id="detail-title">Loading...</h1>
              </div>
              <div id="detail-meta-row" style="display: flex; align-items: center; gap: 10px; color: #B3B3B3; font-size: 15px; font-weight: 500;"></div>
              <div id="detail-tech-badges" class="jellio-media-tech-badges-row"></div>
              <p class="jellio-text-muted" id="detail-overview" style="display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; max-height: 96px; color: rgba(255,255,255,0.88); font-size: 15px; line-height: 22px;"></p>
              <div class="jellio-hero-buttons" id="detail-actions-row">
                <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="detail-play-btn">Play</button>
                <button class="jellio-btn" data-focusable="true" id="detail-start-over-btn" style="display: none;">Start Over</button>
                <button class="jellio-btn" data-focusable="true" id="detail-choose-stream-btn">Choose Stream</button>
                <button class="jellio-btn" data-focusable="true" id="detail-trailer-btn" style="display: none;">Trailer</button>
                <button class="jellio-btn" data-focusable="true" id="detail-watchlist-btn">Watchlist</button>
                <button class="jellio-btn" data-focusable="true" id="detail-watched-btn">Mark Watched</button>
                <button class="jellio-btn" data-focusable="true" id="detail-like-btn">Like</button>
              </div>
            </div>
          </section>

          <div id="detail-series-section" style="display: none;">
            <div class="jellio-row-container">
              <h2 class="jellio-row-title">Seasons</h2>
              <div class="jellio-row-track" id="detail-seasons-track"></div>
            </div>

            <div class="jellio-row-container">
              <h2 class="jellio-row-title">Episodes</h2>
              <div class="jellio-row-track" id="detail-episodes-track"></div>
            </div>
          </div>

          <div id="detail-cast-section" class="jellio-row-container" style="display: none;">
            <h2 class="jellio-row-title">Cast & Crew</h2>
            <div class="jellio-row-track" id="detail-cast-track"></div>
          </div>

          <div id="detail-recommendations-section" class="jellio-row-container" style="display: none;">
            <h2 class="jellio-row-title">More Like This</h2>
            <div class="jellio-row-track" id="detail-recommendations-track"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadDetails();
  }

  async loadDetails() {
    if (!this.itemId) return;
    try {
      const details = await getItemDetails(this.itemId);
      if (this.isDestroyed || !this.container) return;
      this.item = details;

      if (details.Type === 'Series') {
        this.nextUpEpisode = await getSeriesNextUp(details.Id).catch(() => null);
      }

      this.renderHero(details);

      if (details.Type === 'Series') {
        await this.loadSeasonsAndEpisodes();
      }

      // Warm target episode / item streams
      const targetWarmItem = details.Type === 'Series'
        ? (this.nextUpEpisode || this.episodes[0])
        : details;
      if (targetWarmItem && targetWarmItem.Id) {
        this.warmItemStream(targetWarmItem.Id);
      }

      if (details.People && details.People.length > 0) {
        this.renderCast(details.People);
      }

      await this.loadRecommendations();
      focusFirstIn(this.container.querySelector('#detail-actions-row') || this.container);
    } catch (err) {
      console.warn('DetailScreen: failed to load item', err);
    }
  }

  renderHero(item) {
    if (!this.container) return;
    const banner = this.container.querySelector('#detail-hero-banner');
    const logoBox = this.container.querySelector('#detail-logo-box');
    const metaRow = this.container.querySelector('#detail-meta-row');
    const badgesEl = this.container.querySelector('#detail-tech-badges');
    const overviewEl = this.container.querySelector('#detail-overview');
    const playBtn = this.container.querySelector('#detail-play-btn');
    const startOverBtn = this.container.querySelector('#detail-start-over-btn');
    const chooseStreamBtn = this.container.querySelector('#detail-choose-stream-btn');
    const trailerBtn = this.container.querySelector('#detail-trailer-btn');
    const watchlistBtn = this.container.querySelector('#detail-watchlist-btn');
    const watchedBtn = this.container.querySelector('#detail-watched-btn');
    const likeBtn = this.container.querySelector('#detail-like-btn');

    // ClearLogo or Title
    const logos = posterLogoCandidates(item, 600);
    logoBox.innerHTML = '';
    if (logos.length > 0) {
      const logoImg = document.createElement('img');
      logoImg.src = logos[0];
      logoImg.alt = item.Name || '';
      logoImg.style.maxHeight = '84px';
      logoImg.style.maxWidth = '380px';
      logoImg.style.objectFit = 'contain';
      logoImg.onerror = () => {
        logoBox.innerHTML = `<h1 class="jellio-title-hero">${item.Name || ''}</h1>`;
      };
      logoBox.appendChild(logoImg);
    } else {
      logoBox.innerHTML = `<h1 class="jellio-title-hero">${item.Name || ''}</h1>`;
    }

    // Metadata Row
    const metaParts = [];
    if (item.ProductionYear) metaParts.push(String(item.ProductionYear));
    if (item.OfficialRating) metaParts.push(item.OfficialRating);
    const dur = formatDuration(item.RunTimeTicks);
    if (dur) metaParts.push(dur);
    if (item.Genres && item.Genres.length > 0) metaParts.push(item.Genres.slice(0, 3).join(', '));

    let metaHtml = metaParts.map((p) => `<span>${p}</span>`).join('<span style="opacity:0.5;">•</span>');
    if (item.CommunityRating && item.CommunityRating > 0) {
      metaHtml += `<span style="opacity:0.5;">•</span><span style="display:inline-flex;align-items:center;gap:5px;">${TMDB_LOGO_SVG} <strong>${Number(item.CommunityRating).toFixed(1)}</strong></span>`;
    }
    metaRow.innerHTML = metaHtml;

    overviewEl.textContent = item.Overview || '';

    const badges = extractMediaTechBadges(item);
    badgesEl.innerHTML = badges.map((b) => `<span class="jellio-tech-badge">${b}</span>`).join('');

    const backdropTag = (item.BackdropImageTags && item.BackdropImageTags[0]) || item.ImageTags?.Primary;
    if (backdropTag) {
      let bg = banner.querySelector('.jellio-hero-backdrop');
      if (!bg) {
        bg = document.createElement('img');
        bg.className = 'jellio-hero-backdrop';
        banner.prepend(bg);
      }
      bg.src = getImageUrl(item.Id, backdropTag, 'Backdrop', 1920);
    }

    const playTarget = item.Type === 'Series' ? (this.nextUpEpisode || this.episodes[0] || item) : item;
    const posTicks = playTarget?.UserData?.PlaybackPositionTicks || 0;

    if (posTicks > 0) {
      const remMins = playTarget.RunTimeTicks
        ? Math.max(1, Math.round((playTarget.RunTimeTicks - posTicks) / (TICKS_PER_SECOND * 60)))
        : 0;
      playBtn.textContent = remMins > 0 ? `Resume (${remMins}m left)` : 'Resume';
      startOverBtn.style.display = 'inline-flex';
      startOverBtn.onclick = () => {
        if (this.options.onPlay) {
          this.options.onPlay(playTarget, { startPositionTicks: 0 });
        }
      };
    } else {
      playBtn.textContent =
        item.Type === 'Series' && this.nextUpEpisode
          ? `Play S${this.nextUpEpisode.ParentIndexNumber || 1}E${this.nextUpEpisode.IndexNumber || 1}`
          : 'Play';
      startOverBtn.style.display = 'none';
    }

    playBtn.onclick = () => {
      const target = item.Type === 'Series' ? (this.nextUpEpisode || this.episodes[0] || item) : item;
      if (this.options.onPlay) this.options.onPlay(target);
    };

    chooseStreamBtn.onclick = () => {
      const target = item.Type === 'Series' ? (this.nextUpEpisode || this.episodes[0] || item) : item;
      if (this.options.onChooseStream) {
        this.options.onChooseStream(target);
      } else if (this.options.onPlay) {
        this.options.onPlay(target);
      }
    };

    if (item.RemoteTrailers && item.RemoteTrailers.length > 0) {
      trailerBtn.style.display = 'inline-flex';
      trailerBtn.onclick = () => {
        if (this.options.onPlayTrailer) {
          this.options.onPlayTrailer(item.RemoteTrailers[0]);
        } else {
          showAnnouncementToast('Opening trailer...');
        }
      };
    } else {
      trailerBtn.style.display = 'none';
    }

    const updateWatchlistLabel = () => {
      const isFav = Boolean(item.UserData && item.UserData.IsFavorite);
      watchlistBtn.textContent = isFav ? 'In Watchlist' : '+ Watchlist';
    };
    updateWatchlistLabel();
    watchlistBtn.onclick = async () => {
      try {
        const nextFav = !(item.UserData && item.UserData.IsFavorite);
        await toggleFavorite(item.Id, nextFav);
        if (!item.UserData) item.UserData = {};
        item.UserData.IsFavorite = nextFav;
        updateWatchlistLabel();
      } catch (_) {}
    };

    const updateWatchedLabel = () => {
      const isPlayed = Boolean(item.UserData && item.UserData.Played);
      watchedBtn.textContent = isPlayed ? 'Watched' : 'Mark Watched';
    };
    updateWatchedLabel();
    watchedBtn.onclick = async () => {
      try {
        const nextPlayed = !(item.UserData && item.UserData.Played);
        await setPlayed(item.Id, nextPlayed);
        if (!item.UserData) item.UserData = {};
        item.UserData.Played = nextPlayed;
        updateWatchedLabel();
      } catch (_) {}
    };

    const updateLikeLabel = () => {
      const likes = item.UserData ? item.UserData.Likes : null;
      likeBtn.textContent = likes === true ? 'Liked' : 'Like';
    };
    updateLikeLabel();
    likeBtn.onclick = async () => {
      try {
        const currentLikes = item.UserData ? item.UserData.Likes : null;
        const nextLikes = currentLikes === true ? null : true;
        await setItemRating(item.Id, nextLikes);
        if (!item.UserData) item.UserData = {};
        item.UserData.Likes = nextLikes;
        updateLikeLabel();
      } catch (_) {}
    };
  }

  renderCast(people) {
    if (!this.container) return;
    const section = this.container.querySelector('#detail-cast-section');
    const track = this.container.querySelector('#detail-cast-track');
    section.style.display = 'flex';
    track.innerHTML = '';

    people.slice(0, 18).forEach((person) => {
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.style.width = '140px';
      card.style.height = '210px';
      card.setAttribute('data-focusable', 'true');

      const imgUrl = getImageUrl(person.Id, person.PrimaryImageTag, 'Primary', 240);
      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${person.Name}" loading="lazy" onerror="this.style.display='none'" />
        <div class="jellio-poster-card-overlay">
          <div class="jellio-poster-card-title">${person.Name}</div>
          <div class="jellio-poster-card-subtitle">${person.Role || person.Type || ''}</div>
        </div>
      `;

      card.onclick = () => {
        if (this.options.onNavigateToPerson) {
          this.options.onNavigateToPerson(person.Id);
        }
      };

      track.appendChild(card);
    });
  }

  async loadSeasonsAndEpisodes() {
    if (!this.container) return;
    const seriesSection = this.container.querySelector('#detail-series-section');
    seriesSection.style.display = 'block';

    try {
      this.seasons = await getSeasons(this.itemId);
      if (this.isDestroyed || !this.container) return;
      const seasonsTrack = this.container.querySelector('#detail-seasons-track');
      seasonsTrack.innerHTML = '';

      if (this.seasons.length > 0) {
        this.activeSeasonId = this.seasons[0].Id;
      }

      this.seasons.forEach((season) => {
        const btn = document.createElement('button');
        btn.className = `jellio-btn ${season.Id === this.activeSeasonId ? 'jellio-btn-primary' : ''}`;
        btn.setAttribute('data-focusable', 'true');
        btn.textContent = season.Name || 'Season';

        btn.onclick = async () => {
          this.activeSeasonId = season.Id;
          Array.from(seasonsTrack.children).forEach((c) => c.classList.remove('jellio-btn-primary'));
          btn.classList.add('jellio-btn-primary');
          await this.loadEpisodes(season.Id);
          const firstUnwatched = this.episodes.find((ep) => !ep.UserData?.Played) || this.episodes[0];
          if (firstUnwatched && firstUnwatched.Id) {
            this.warmItemStream(firstUnwatched.Id);
          }
        };

        seasonsTrack.appendChild(btn);
      });

      if (this.activeSeasonId) {
        await this.loadEpisodes(this.activeSeasonId);
      }
    } catch (err) {
      console.warn('DetailScreen: failed loading seasons', err);
    }
  }

  warmItemStream(targetId) {
    if (!targetId) return;
    if (this.secondSourceTimer) {
      clearTimeout(this.secondSourceTimer);
      this.secondSourceTimer = null;
    }
    prefetchStreams(targetId);
    getMediaSources(targetId).then((sources) => {
      if (this.isDestroyed || !sources || sources.length < 2) return;
      this.secondSourceTimer = warmSecondSource(targetId, sources);
    }).catch(() => {});
  }

  async loadEpisodes(seasonId) {
    if (!this.container) return;
    const epTrack = this.container.querySelector('#detail-episodes-track');
    epTrack.innerHTML = '';

    try {
      this.episodes = await getEpisodes(this.itemId, seasonId);
      if (this.isDestroyed || !this.container) return;

      this.episodes.forEach((ep) => {
        const card = document.createElement('div');
        card.className = 'jellio-poster-card jellio-card-landscape';
        card.setAttribute('data-focusable', 'true');

        const imgTag = ep.ImageTags?.Primary || ep.BackdropImageTags?.[0];
        const imgUrl = getImageUrl(ep.Id, imgTag, 'Primary', 400);

        let progressHtml = '';
        if (ep.UserData?.PlaybackPositionTicks && ep.RunTimeTicks) {
          const pct = Math.min(100, Math.round((ep.UserData.PlaybackPositionTicks / ep.RunTimeTicks) * 100));
          progressHtml = `<div class="jellio-progress-bar"><div class="jellio-progress-bar-fill" style="width: ${pct}%;"></div></div>`;
        }

        const isWatched = Boolean(ep.UserData?.Played);
        const checkBadge = isWatched ? '<div class="jellio-watched-check-badge">&#10003;</div>' : '';

        card.innerHTML = `
          <img class="jellio-poster-card-img" src="${imgUrl}" alt="${ep.Name}" loading="lazy" onerror="this.style.display='none'" />
          ${checkBadge}
          <div class="jellio-poster-card-overlay">
            <div class="jellio-poster-card-title">${ep.IndexNumber ? `E${ep.IndexNumber}: ` : ''}${ep.Name || 'Episode'}</div>
            <div class="jellio-poster-card-subtitle">${ep.RunTimeTicks ? `${Math.round(ep.RunTimeTicks / 600000000)}m` : ''}</div>
          </div>
          ${progressHtml}
        `;

        card.onclick = () => {
          if (this.options.onPlay) this.options.onPlay(ep);
        };

        const openEpOptions = () => {
          openCardDialog({
            title: `${ep.IndexNumber ? `E${ep.IndexNumber}: ` : ''}${ep.Name || 'Episode'}`,
            actions: [
              {
                label: 'Play Episode',
                onClick: () => {
                  if (this.options.onPlay) this.options.onPlay(ep);
                },
              },
              {
                label: 'Choose Stream',
                onClick: () => {
                  if (this.options.onChooseStream) this.options.onChooseStream(ep);
                },
              },
              {
                label: isWatched ? 'Mark Unwatched' : 'Mark Watched',
                onClick: async () => {
                  await setPlayed(ep.Id, !isWatched);
                  await this.loadEpisodes(seasonId);
                },
              },
            ],
          });
        };

        card._triggerCardOptions = openEpOptions;
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openEpOptions();
        });

        epTrack.appendChild(card);
      });
    } catch (err) {
      console.warn('DetailScreen: failed loading episodes', err);
    }
  }

  async loadRecommendations() {
    if (!this.container || !this.item) return;
    const recSection = this.container.querySelector('#detail-recommendations-section');
    const recTrack = this.container.querySelector('#detail-recommendations-track');

    try {
      const candidates = await getRecommendationCandidates(this.item, 12);
      if (this.isDestroyed || !this.container || !candidates || candidates.length === 0) return;

      recSection.style.display = 'flex';
      recTrack.innerHTML = '';

      candidates.forEach((rec) => {
        const imgUrl = getImageUrl(rec.Id, rec.ImageTags?.Primary, 'Primary', 300);
        const card = renderPosterCard(rec, {
          aspectRatio: CardAspectRatio.PORTRAIT,
          imageUrl: imgUrl,
          onSelect: (it) => {
            if (this.options.onNavigateToDetail) {
              this.options.onNavigateToDetail(it.Id);
            }
          },
        });
        recTrack.appendChild(card);
      });
    } catch (_) {}
  }

  destroy() {
    this.isDestroyed = true;
    if (this.secondSourceTimer) {
      clearTimeout(this.secondSourceTimer);
      this.secondSourceTimer = null;
    }
    this.item = null;
    this.seasons = [];
    this.episodes = [];
  }
}
