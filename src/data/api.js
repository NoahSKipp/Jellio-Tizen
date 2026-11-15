// Unified REST client for Jellyfin and Jellio-Plugin.
import { getSession, setSession, clearSession, cleanServerAddress, defaultSessionGuard } from './session.js';
import { getAcceptLanguageHeader } from '../runtime/i18n.js';
import { PlayerPrefs } from './prefs.js';

export const DEFAULT_TIMEOUT_MS = 10000;
export const NEGOTIATION_TIMEOUT_MS = 30000;
export const SEARCH_TIMEOUT_MS = 30000;
export const ITEM_DETAILS_TIMEOUT_MS = 30000;
export const CACHE_TTL_MS = 60000;
export const SHORT_CACHE_TTL_MS = 8000;
export const TICKS_PER_SECOND = 10000000;
export const TICKS_PER_MS = 10000;

export const ITEM_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,PremiereDate,EndDate,CommunityRating,BackdropImageTags,Overview';
export const DETAIL_FIELDS = 'Overview,Genres,Tags,People,ProductionYear,RunTimeTicks,PremiereDate,RemoteTrailers,BackdropImageTags,OfficialRating,CommunityRating,ParentBackdropItemId,ParentBackdropImageTags,Status,EndDate';
export const SHOWCASE_FIELDS = 'Overview,Genres,ProductionYear,RunTimeTicks,PremiereDate,CommunityRating,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags';

const CLIENT_NAME = 'Jellio Tizen';
const DEVICE_NAME = 'Samsung Smart TV';
const APP_VERSION = '0.1.0';

export class TtlCache {
  constructor() {
    this.entries = new Map();
  }

  get(key, ttlMs, fetcher) {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && now < existing.expiresAt) {
      return Promise.resolve(existing.value);
    }
    if (existing && existing.promise) {
      return existing.promise;
    }

    const promise = Promise.resolve()
      .then(() => fetcher())
      .then((value) => {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs, promise: null });
        if (this.entries.size > 400) this.prune();
        return value;
      })
      .catch((err) => {
        this.entries.delete(key);
        throw err;
      });

    this.entries.set(key, {
      value: existing ? existing.value : null,
      expiresAt: existing ? existing.expiresAt : 0,
      promise,
    });
    return promise;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (now >= entry.expiresAt && !entry.promise) {
        this.entries.delete(key);
      }
    }
  }

  invalidate(key) {
    this.entries.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear() {
    this.entries.clear();
  }
}

export const apiCache = new TtlCache();

export function buildAuthHeader(token, deviceId) {
  const parts = [
    `Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${deviceId || 'tizen-device'}"`,
    `Version="${APP_VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return 'MediaBrowser ' + parts.join(', ');
}

export function getAuthHeaders(customToken, customDeviceId) {
  const session = getSession();
  const token = customToken !== undefined ? customToken : (session ? session.accessToken : null);
  const devId = customDeviceId !== undefined ? customDeviceId : (session ? session.deviceId : null);
  const langHeader = typeof getAcceptLanguageHeader === 'function' ? getAcceptLanguageHeader() : 'en-US, en;q=0.9';

  const headers = {
    Accept: 'application/json',
    Authorization: buildAuthHeader(token, devId),
    'Accept-Language': langHeader,
  };
  return headers;
}

function resolveFullUrl(path, baseAddress) {
  if (/^https?:\/\//i.test(path)) return path;
  const session = getSession();
  const server = cleanServerAddress(baseAddress || (session ? session.serverAddress : ''));
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return server + cleanPath;
}

function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS)
    : null;

  const onAbort = () => {
    if (controller) controller.abort();
  };

  if (externalSignal && controller) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort);
  }

  const fetchOptions = Object.assign({}, options);
  if (controller) fetchOptions.signal = controller.signal;

  return fetch(url, fetchOptions)
    .catch((err) => {
      if (err && err.name === 'AbortError') {
        const timeoutErr = new Error('Request timed out: ' + url);
        timeoutErr.timedOut = true;
        throw timeoutErr;
      }
      throw err;
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      if (externalSignal && controller) {
        externalSignal.removeEventListener('abort', onAbort);
      }
    });
}

export async function requestJson(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, externalSignal = null) {
  const url = resolveFullUrl(path, options.baseAddress);
  const session = getSession();
  const token = options.token || (session ? session.accessToken : null);

  const headers = Object.assign({}, getAuthHeaders(token), options.headers);
  const fetchOptions = Object.assign({}, options, { headers });

  const response = await fetchWithTimeout(url, fetchOptions, timeoutMs, externalSignal);

  if (!response.ok) {
    if (token) {
      defaultSessionGuard.onResponse(response.status, url, token, options.carriesOwnAuth);
    }
    const err = new Error('Request failed: ' + path + ' (' + response.status + ')');
    err.status = response.status;
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    err.body = body;
    throw err;
  }

  return response;
}

export async function getJson(path, timeoutMs = DEFAULT_TIMEOUT_MS, signal = null) {
  const res = await requestJson(path, { method: 'GET' }, timeoutMs, signal);
  return res.json();
}

export async function postJson(path, body = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await requestJson(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    },
    timeoutMs
  );
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function deleteJson(path, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await requestJson(path, { method: 'DELETE' }, timeoutMs);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function authedFetch(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = resolveFullUrl(path, options.baseAddress);
  const session = getSession();
  const token = options.token || (session ? session.accessToken : null);
  const headers = Object.assign({}, getAuthHeaders(token), options.headers);
  const fetchOptions = Object.assign({}, options, { headers });
  return fetchWithTimeout(url, fetchOptions, timeoutMs);
}

// --- Server & Authentication ---

export async function getPublicSystemInfo(serverAddress) {
  return getJson(resolveFullUrl('/System/Info/Public', serverAddress));
}

export async function resolveServerAddress(input) {
  const trimmed = cleanServerAddress(input);
  if (!trimmed) {
    const err = new Error('Please enter a server address');
    err.code = 'ENTER_SERVER';
    throw err;
  }
  const hasScheme = /^https?:\/\//i.test(input.trim());
  const candidates = hasScheme
    ? [trimmed]
    : trimmed.startsWith('https://')
      ? [trimmed, 'http://' + trimmed.slice(8)]
      : [trimmed, 'https://' + trimmed.slice(7)];

  for (const candidate of candidates) {
    try {
      const info = await getPublicSystemInfo(candidate);
      if (info) return candidate;
    } catch (_) {}
  }
  const err = new Error('Server not found at ' + candidates.join(' or '));
  err.code = 'SERVER_NOT_FOUND';
  throw err;
}

export async function getPublicUsers(serverAddress) {
  return getJson(resolveFullUrl('/Users/Public', serverAddress));
}

export async function authenticateByName(serverAddress, username, password) {
  const normalized = await resolveServerAddress(serverAddress);
  const res = await postJson(resolveFullUrl('/Users/AuthenticateByName', normalized), {
    Username: username,
    Pw: password,
  });
  if (res && res.AccessToken && res.User) {
    apiCache.clear();
    setSession({
      serverAddress: normalized,
      userId: res.User.Id,
      userName: res.User.Name,
      accessToken: res.AccessToken,
    });
  }
  return res;
}

export async function getUser(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return apiCache.get('user:' + targetId, CACHE_TTL_MS, () => getJson('/Users/' + targetId));
}

export async function getUserFresh(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  apiCache.invalidate('user:' + targetId);
  return getUser(targetId);
}

export function updateUserPassword(userId, currentPassword, newPassword) {
  return postJson(`/Users/${userId}/Password`, {
    CurrentPassword: currentPassword,
    NewPassword: newPassword,
  });
}

export function requestPasswordReset(serverAddress, username) {
  return postJson(resolveFullUrl('/Users/ForgotPassword', serverAddress), {
    EnteredUsername: username,
  });
}

export function redeemPasswordResetPin(serverAddress, pin) {
  return postJson(resolveFullUrl('/Users/ForgotPassword/Pin', serverAddress), {
    Pin: pin,
  });
}

export function isQuickConnectEnabled() {
  return getJson('/QuickConnect/Enabled').catch(() => false);
}

export function initiateQuickConnect(serverAddress) {
  return postJson(resolveFullUrl('/QuickConnect/Initiate', serverAddress));
}

export function checkQuickConnect(secret) {
  return getJson('/QuickConnect/Connect?Secret=' + encodeURIComponent(secret));
}

export function authorizeQuickConnect(code) {
  return postJson('/QuickConnect/Authorize?Code=' + encodeURIComponent(code));
}

export async function authenticateWithQuickConnect(serverAddress, secret) {
  const normalized = await resolveServerAddress(serverAddress);
  const res = await postJson(resolveFullUrl('/Users/AuthenticateWithQuickConnect', normalized), {
    Secret: secret,
  });
  if (res && res.AccessToken && res.User) {
    apiCache.clear();
    setSession({
      serverAddress: normalized,
      userId: res.User.Id,
      userName: res.User.Name,
      accessToken: res.AccessToken,
    });
  }
  return res;
}

export async function updateLanguagePreferences(userId, audioLanguage, subtitleLanguage) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  const user = await getJson('/Users/' + targetId);
  const config = user.Configuration || {};
  if (audioLanguage !== undefined) config.AudioLanguagePreference = audioLanguage;
  if (subtitleLanguage !== undefined) config.SubtitleLanguagePreference = subtitleLanguage;

  await postJson(`/Users/${targetId}/Configuration`, config);
  apiCache.invalidate('user:' + targetId);
}

export function logout() {
  apiCache.clear();
  clearSession();
}

// --- Views & Libraries & Collections ---

export function getUserViews(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return apiCache.get('views:' + targetId, CACHE_TTL_MS, async () => {
    const res = await getJson(`/Users/${targetId}/Views`);
    return (res && res.Items) || [];
  });
}

export function getCollections(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return apiCache.get('collections:' + targetId, CACHE_TTL_MS, async () => {
    const params = new URLSearchParams({
      IncludeItemTypes: 'BoxSet',
      Recursive: 'true',
      SortBy: 'SortName',
      Fields: 'ProviderIds,ChildCount',
    });
    const res = await getJson(`/Users/${targetId}/Items?` + params.toString());
    return (res && res.Items) || [];
  });
}

export async function getCollectionItems(userId, collectionId, kind, limit = 24, startIndex = 0) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  const params = new URLSearchParams({
    ParentId: collectionId,
    Recursive: 'true',
    Limit: String(limit),
    StartIndex: String(startIndex),
    Fields: ITEM_FIELDS,
  });
  if (kind === 'movies') params.set('IncludeItemTypes', 'Movie');
  else if (kind === 'series') params.set('IncludeItemTypes', 'Series');

  const res = await getJson(`/Users/${targetId}/Items?` + params.toString());
  return (res && res.Items) || [];
}

export async function getLibraryItems(userId, options = {}) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  const params = new URLSearchParams();

  if (options.parentId) params.set('ParentId', options.parentId);
  if (options.includeItemTypes) params.set('IncludeItemTypes', options.includeItemTypes);
  params.set('Recursive', options.recursive !== false ? 'true' : 'false');
  if (options.limit) params.set('Limit', String(options.limit));
  if (options.startIndex) params.set('StartIndex', String(options.startIndex));
  if (options.sortBy) params.set('SortBy', options.sortBy);
  if (options.sortOrder) params.set('SortOrder', options.sortOrder);
  params.set('Fields', options.fields || ITEM_FIELDS);
  if (options.genres) params.set('Genres', options.genres);
  if (options.filters) params.set('Filters', options.filters);
  if (options.searchTerm) params.set('searchTerm', options.searchTerm);
  if (options.personIds) params.set('personIds', options.personIds);

  const res = await getJson(`/Users/${targetId}/Items?` + params.toString());
  return res || { Items: [], TotalRecordCount: 0 };
}

export async function getAllGenres(userId, parentId, itemType) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  const params = new URLSearchParams({
    UserId: targetId,
    SortBy: 'SortName',
    Recursive: 'true',
  });
  if (parentId) params.set('ParentId', parentId);
  if (itemType) params.set('IncludeItemTypes', itemType);

  const res = await getJson('/Genres?' + params.toString());
  return ((res && res.Items) || []).map((i) => i.Name).filter(Boolean);
}

export async function discoverGenres(userId, parentId, itemType, limit = 6, minCount = 8) {
  const genres = await getAllGenres(userId, parentId, itemType);
  return genres.slice(0, limit);
}

export async function getGenreItems(userId, parentId, itemType, genre, limit = 20) {
  return getGenreItemsPage(userId, parentId, itemType, genre, 0, limit);
}

export async function getGenreItemsPage(userId, parentId, itemType, genre, startIndex = 0, limit = 20) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  const params = new URLSearchParams({
    genre,
    limit: String(limit),
    startIndex: String(startIndex),
  });
  if (parentId) params.set('parentId', parentId);
  if (itemType) params.set('itemType', itemType);

  try {
    const res = await getJson('/Jellio/genres/items?' + params.toString());
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.Items)) return res.Items;
  } catch (_) {}

  const fallback = await getLibraryItems(targetId, {
    parentId,
    includeItemTypes: itemType,
    genres: genre,
    limit,
    startIndex,
    sortBy: 'CommunityRating,SortName',
    sortOrder: 'Descending',
  });
  return fallback.Items || [];
}

export function searchGenreOrCategory(query) {
  return getJson('/Jellio/genres/search?q=' + encodeURIComponent(query)).catch(() => null);
}

export function getAnimeIds() {
  return apiCache.get('anime:ids', CACHE_TTL_MS * 5, async () => {
    try {
      const ids = await getJson('/Jellio/anime/ids');
      return new Set(Array.isArray(ids) ? ids : []);
    } catch (_) {
      return new Set();
    }
  });
}

// --- Items & Details ---

export function getItem(itemId, fields = DETAIL_FIELDS) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const key = `item:${itemId}:${fields}`;
  return apiCache.get(key, CACHE_TTL_MS, () =>
    getJson(`/Users/${targetId}/Items/${itemId}?Fields=${encodeURIComponent(fields)}`)
  );
}

export function getItemDetails(itemId) {
  return getItem(itemId, DETAIL_FIELDS);
}

export async function getItemsByIds(itemIds, fields = ITEM_FIELDS) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const ids = Array.isArray(itemIds) ? itemIds.join(',') : itemIds;
  const res = await getJson(`/Items?userId=${targetId}&ids=${encodeURIComponent(ids)}&Fields=${encodeURIComponent(fields)}`);
  return (res && res.Items) || [];
}

export async function getResumeItems(limit = 20) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const res = await getJson(`/Users/${targetId}/Items/Resume?Limit=${limit}&Fields=${encodeURIComponent(ITEM_FIELDS)}`);
  return (res && res.Items) || [];
}

export async function getNextUp(limit = 20, seriesId = null) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    userId: targetId,
    Limit: String(limit),
    Fields: ITEM_FIELDS,
  });
  if (seriesId) params.set('seriesId', seriesId);
  const res = await getJson('/Shows/NextUp?' + params.toString());
  return (res && res.Items) || [];
}

export async function getSeriesNextUp(seriesId) {
  const list = await getNextUp(1, seriesId);
  return list[0] || null;
}

export function hideSeriesFromNextUp(seriesId) {
  apiCache.invalidatePrefix('item:');
  return postJson(`/Jellio/next-up-hidden/${seriesId}`);
}

export async function getSeasons(seriesId) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const res = await getJson(`/Shows/${seriesId}/Seasons?userId=${targetId}`);
  return (res && res.Items) || [];
}

export async function getEpisodes(seriesId, seasonId = null, fields = ITEM_FIELDS) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    userId: targetId,
    Fields: fields,
  });
  if (seasonId) params.set('seasonId', seasonId);
  const res = await getJson(`/Shows/${seriesId}/Episodes?` + params.toString());
  return (res && res.Items) || [];
}

export async function getNextEpisode(seriesId, seasonId, currentEpisodeIndex) {
  const episodes = await getEpisodes(seriesId, seasonId);
  return episodes.find((e) => e.IndexNumber === currentEpisodeIndex + 1) || null;
}

export async function getPreviousEpisode(seriesId, seasonId, currentEpisodeIndex) {
  const episodes = await getEpisodes(seriesId, seasonId);
  return episodes.find((e) => e.IndexNumber === currentEpisodeIndex - 1) || null;
}

export function getPerson(personId) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  return apiCache.get('person:' + personId, CACHE_TTL_MS, () =>
    getJson(`/Users/${targetId}/Items/${personId}`)
  );
}

export async function getRecentlyCompleted(limit = 20) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    Filters: 'IsPlayed',
    SortBy: 'DatePlayed',
    SortOrder: 'Descending',
    Limit: String(limit),
    Fields: ITEM_FIELDS,
    Recursive: 'true',
  });
  const res = await getJson(`/Users/${targetId}/Items?` + params.toString());
  return (res && res.Items) || [];
}

export async function getRecommendationCandidates(seed, limit = 12) {
  if (!seed || !seed.Id) return [];
  const genre = (seed.Genres && seed.Genres[0]) || '';
  if (!genre) return [];
  const session = getSession();
  const targetId = session ? session.userId : '';
  const items = await getGenreItems(targetId, null, seed.Type, genre, limit + 1);
  return items.filter((i) => i.Id !== seed.Id).slice(0, limit);
}

export async function getHeroCandidates(limit = 8, parentId = null) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = {
    parentId,
    includeItemTypes: 'Movie,Series',
    limit,
    sortBy: 'DateCreated,CommunityRating',
    sortOrder: 'Descending',
    fields: SHOWCASE_FIELDS,
  };
  const res = await getLibraryItems(targetId, params);
  return res.Items || [];
}

export async function getSeasonalItems(limit = 20) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const res = await getLibraryItems(targetId, {
    limit,
    sortBy: 'PremiereDate',
    sortOrder: 'Descending',
  });
  return res.Items || [];
}

export async function getShowcaseItems(ids) {
  if (!ids || ids.length === 0) return {};
  const items = await getItemsByIds(ids, SHOWCASE_FIELDS);
  const map = {};
  for (const item of items) {
    if (item && item.Id) map[item.Id] = item;
  }
  return map;
}

// --- Search ---

export async function searchItems(term, limit = 50) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    searchTerm: term,
    Limit: String(limit),
    Recursive: 'true',
    Fields: ITEM_FIELDS,
  });
  const res = await getJson(`/Users/${targetId}/Items?` + params.toString(), SEARCH_TIMEOUT_MS);
  return (res && res.Items) || [];
}

export async function searchLibrary(term) {
  return searchItems(term, 30);
}

export function searchMovies(term) {
  return getJson('/gelato/search/movie?q=' + encodeURIComponent(term), SEARCH_TIMEOUT_MS).catch(() => []);
}

export function searchSeries(term) {
  return getJson('/gelato/search/series?q=' + encodeURIComponent(term), SEARCH_TIMEOUT_MS).catch(() => []);
}

export function getSearchSuggestions(query) {
  return getJson('/Jellio/search/suggestions?q=' + encodeURIComponent(query)).catch(() => ({
    Suggestions: [],
  }));
}

// --- Watchlist & Rating & UserData ---

export async function getWatchlistItems(limit = 100) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    Filters: 'IsFavorite',
    SortBy: 'SortName',
    Limit: String(limit),
    Recursive: 'true',
    Fields: ITEM_FIELDS,
  });
  const res = await getJson(`/Users/${targetId}/Items?` + params.toString());
  return (res && res.Items) || [];
}

export function toggleFavorite(itemId, isFavorite) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  apiCache.invalidatePrefix('item:' + itemId);
  if (isFavorite) {
    return postJson(`/Users/${targetId}/FavoriteItems/${itemId}`);
  } else {
    return deleteJson(`/Users/${targetId}/FavoriteItems/${itemId}`);
  }
}

export function setPlayed(itemId, played) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  apiCache.invalidatePrefix('item:' + itemId);
  if (played) {
    return postJson(`/Users/${targetId}/PlayedItems/${itemId}`);
  } else {
    return deleteJson(`/Users/${targetId}/PlayedItems/${itemId}`);
  }
}

export function clearResumePosition(itemId) {
  apiCache.invalidatePrefix('item:' + itemId);
  return postJson(`/UserItems/${itemId}/UserData`, { PlaybackPositionTicks: 0 });
}

export function setItemRating(itemId, likes) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  apiCache.invalidatePrefix('item:' + itemId);
  if (likes == null) {
    return deleteJson(`/Users/${targetId}/Items/${itemId}/Rating`);
  }
  return postJson(`/Users/${targetId}/Items/${itemId}/Rating`, { Likes: Boolean(likes) });
}

export function creditRealWatch(itemId) {
  return postJson('/Jellio/achievements/real-watch', { ItemId: itemId }).catch(() => {});
}

export function reportRealDuration(itemId, durationTicks) {
  return postJson('/Jellio/real-duration', { ItemId: itemId, DurationTicks: durationTicks }).catch(() => {});
}

export async function getCalendarEntries() {
  const res = await getJson('/Jellio/calendar').catch(() => []);
  return Array.isArray(res) ? res : [];
}

export function hideFromComingSoon(itemId) {
  return postJson(`/Jellio/calendar/hidden/${itemId}`);
}

export function unhideFromComingSoon(itemId) {
  return deleteJson(`/Jellio/calendar/hidden/${itemId}`);
}

// --- Skip Segments ---

export function getIntroSkipperSegments(itemId) {
  return getJson(`/Episode/${itemId}/Timestamps`).catch(() => null);
}

export function getCommunitySkipSegments(itemId) {
  return getJson(`/Jellio/introcredits/community/${itemId}`).catch(() => null);
}

export function getJellioIntroCredits(itemId) {
  return getJson(`/Jellio/introcredits/${itemId}`).catch(() => null);
}

export function getMediaSegments(itemId) {
  return getJson(`/MediaSegments/${itemId}`).catch(() => null);
}

// --- Streams & Playback ---

export async function getPlaybackInfo(itemId, startTicks = 0, mediaSourceId = null, audioStreamIndex = null, subtitleStreamIndex = null) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const body = {
    UserId: targetId,
    StartTimeTicks: startTicks || 0,
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: true,
    AutoOpenLiveStream: true,
  };
  if (mediaSourceId) body.MediaSourceId = mediaSourceId;
  if (audioStreamIndex != null) body.AudioStreamIndex = audioStreamIndex;
  if (subtitleStreamIndex != null) body.SubtitleStreamIndex = subtitleStreamIndex;

  return postJson(`/Items/${itemId}/PlaybackInfo`, body, NEGOTIATION_TIMEOUT_MS);
}

export async function getMediaSources(itemId, reason = 'play', forceFresh = false) {
  const key = 'sources:' + itemId;
  if (!forceFresh) {
    const cached = apiCache.entries.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.value;
  }
  const info = await getPlaybackInfo(itemId, 0);
  const sources = (info && info.MediaSources) || [];
  apiCache.entries.set(key, { value: sources, expiresAt: Date.now() + CACHE_TTL_MS, promise: null });
  return sources;
}

export function getWarmSources(itemId) {
  return getJson(`/gelato/warm/${itemId}`).catch(() => null);
}

export function getQualityTiers(itemId) {
  return getJson(`/gelato/tiers/${itemId}`).catch(() => ({}));
}

export function prefetchStreams(itemId) {
  return postJson(`/gelato/prefetch/${itemId}`).catch(() => {});
}

export function prefetchStreamsBatch(itemIds, probe = false) {
  return postJson('/gelato/prefetch-batch', { ItemIds: itemIds, Probe: Boolean(probe) }).catch(() => null);
}

export function buildStreamUrl(itemId, mediaSource, options = {}) {
  const session = getSession();
  const server = cleanServerAddress(session ? session.serverAddress : '');
  const token = session ? session.accessToken : '';
  const devId = session ? session.deviceId : '';

  const mediaSourceId = (mediaSource && mediaSource.Id) || itemId;
  const container = (mediaSource && mediaSource.Container) || 'mp4';
  const directPlay = options.directPlay !== false;
  const startTicks = options.startPositionTicks || 0;

  const params = new URLSearchParams({
    MediaSourceId: mediaSourceId,
    DeviceId: devId,
    ApiKey: token,
    api_key: token,
    StartTimeTicks: String(startTicks),
  });

  if (options.playSessionId) params.set('PlaySessionId', options.playSessionId);
  if (directPlay) {
    params.set('Static', 'true');
  } else {
    params.set('VideoCodec', 'h264');
    params.set('AudioCodec', 'aac');
    params.set('AudioBitRate', '192000');
  }
  if (options.audioStreamIndex != null) params.set('AudioStreamIndex', String(options.audioStreamIndex));
  if (options.subtitleStreamIndex != null) {
    params.set('SubtitleStreamIndex', String(options.subtitleStreamIndex));
    params.set('SubtitleMethod', 'Encode');
  }

  return `${server}/Videos/${itemId}/stream.${container}?${params.toString()}`;
}

export async function resolvePlayback(itemId, mediaSourceId = null, startTimeTicks = 0, options = {}) {
  const response = await getPlaybackInfo(
    itemId,
    startTimeTicks,
    mediaSourceId,
    options.audioStreamIndex,
    options.subtitleStreamIndex
  );

  const sources = (response && response.MediaSources) || [];
  const mediaSource = sources.find((s) => s.Id === mediaSourceId) || sources[0];
  if (!mediaSource) {
    throw new Error('No playable media source for this item');
  }

  const directPlay = options.forceDirectPlay || (!options.forceTranscode && options.subtitleStreamIndex == null);
  const streamUrl = buildStreamUrl(itemId, mediaSource, {
    directPlay,
    startPositionTicks: startTimeTicks,
    playSessionId: response.PlaySessionId,
    audioStreamIndex: options.audioStreamIndex,
    subtitleStreamIndex: options.subtitleStreamIndex,
  });

  return {
    streamUrl,
    mediaSource,
    playSessionId: response.PlaySessionId,
    startPositionTicks: startTimeTicks,
    directPlay,
  };
}

export function buildSubtitleUrl(itemId, mediaSourceId, stream, offsetTicks = 0) {
  const session = getSession();
  const server = cleanServerAddress(session ? session.serverAddress : '');
  const token = session ? session.accessToken : '';

  if (stream.DeliveryMethod === 'External' && stream.DeliveryUrl) {
    return stream.IsExternalUrl ? stream.DeliveryUrl : server + stream.DeliveryUrl;
  }

  const format = stream.Codec || 'vtt';
  const params = new URLSearchParams({
    ApiKey: token,
    api_key: token,
  });
  if (offsetTicks > 0) params.set('StartTimeTicks', String(offsetTicks));

  return `${server}/Videos/${itemId}/${mediaSourceId}/Subtitles/${stream.Index}/Stream.${format}?${params.toString()}`;
}

export function reportPlaybackStart(itemId, mediaSourceId, positionTicks = 0) {
  return postJson('/Sessions/Playing', {
    ItemId: itemId,
    MediaSourceId: mediaSourceId,
    PositionTicks: positionTicks,
    EventName: 'timeupdate',
  }).catch(() => {});
}

export function reportPlaybackProgress(itemId, mediaSourceId, positionTicks = 0, isPaused = false) {
  return postJson('/Sessions/Playing/Progress', {
    ItemId: itemId,
    MediaSourceId: mediaSourceId,
    PositionTicks: positionTicks,
    IsPaused: Boolean(isPaused),
    EventName: 'timeupdate',
  }).catch(() => {});
}

export function reportPlaybackStopped(itemId, mediaSourceId, positionTicks = 0) {
  return postJson('/Sessions/Playing/Stopped', {
    ItemId: itemId,
    MediaSourceId: mediaSourceId,
    PositionTicks: positionTicks,
  }).catch(() => {});
}

export function logPlaybackDecision(itemId, mediaSource, directPlay, reasons = [], policy = 'PreferReady') {
  return postJson('/Jellio/playback/decision', {
    ItemId: itemId,
    MediaSourceId: mediaSource ? mediaSource.Id : null,
    PlayMethod: directPlay ? 'DirectPlay' : 'Transcode',
    Reasons: reasons,
    Policy: policy,
  }).catch(() => {});
}

export function logPlayStart(record) {
  return postJson('/Jellio/playback/start', record).catch(() => {});
}

export function logFailover(record) {
  return postJson('/Jellio/playback/failover', record).catch(() => {});
}

export function reportCapabilities() {
  return postJson('/Sessions/Capabilities/Full', {
    PlayableMediaTypes: ['Video', 'Audio'],
    SupportedCommands: ['Play', 'Playstate', 'PlayNext', 'GeneralCommand'],
    SupportsMediaControl: true,
    SupportsPersistentIdentifier: true,
  }).catch(() => {});
}

// --- Live TV ---

export async function getLiveChannels(limit = 1000) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    UserId: targetId,
    Limit: String(limit),
    SortBy: 'SortName',
    AddCurrentProgram: 'true',
    EnableUserData: 'true',
    EnableImageTypes: 'Primary',
    ImageTypeLimit: '1',
  });
  const res = await getJson('/LiveTv/Channels?' + params.toString());
  return (res && res.Items) || [];
}

export function getLivePrograms(channelIds, minStartDate, maxEndDate) {
  return postJson('/LiveTv/Programs', {
    ChannelIds: channelIds,
    MinStartDate: minStartDate,
    MaxEndDate: maxEndDate,
  });
}

export function openLiveChannel(channelId) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  return postJson(`/Items/${channelId}/PlaybackInfo?UserId=${targetId}&AutoOpenLiveStream=true`, {
    UserId: targetId,
    StartTimeTicks: 0,
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: true,
    AutoOpenLiveStream: true,
  });
}

export function closeLiveStream(liveStreamId) {
  return postJson('/LiveStreams/Close?liveStreamId=' + encodeURIComponent(liveStreamId)).catch(() => {});
}

export function stopEncoding(playSessionId) {
  const session = getSession();
  const devId = session ? session.deviceId : '';
  return deleteJson(`/Videos/ActiveEncodings?deviceId=${encodeURIComponent(devId)}&playSessionId=${encodeURIComponent(playSessionId)}`).catch(() => {});
}

export function getLiveHealth() {
  return getJson('/Jellio/LiveHealth').catch(() => ({}));
}

export function reportLiveWatching(channelId) {
  return postJson('/Jellio/now-playing/live', { ChannelId: channelId }).catch(() => {});
}

export function stopLiveWatching() {
  return deleteJson('/Jellio/now-playing/live').catch(() => {});
}

// --- Sleep Timer ---

export function startSleepTimer(minutes) {
  return postJson('/Jellio/sleep-timer/start', { Minutes: minutes });
}

export function cancelSleepTimer() {
  return postJson('/Jellio/sleep-timer/cancel').catch(() => {});
}

export function getSleepTimerStatus() {
  return getJson('/Jellio/sleep-timer/status').catch(() => null);
}

// --- Profile & Social & Settings ---

export async function getFeed() {
  const res = await getJson('/Jellio/feed').catch(() => []);
  return Array.isArray(res) ? res : [];
}

export function getProfile(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return getJson('/Jellio/profile/' + targetId);
}

export function getProfileSettings() {
  return getJson('/Jellio/profile/settings');
}

export function setProfileBio(bio) {
  return postJson('/Jellio/profile/bio', { Bio: bio });
}

export function setProfilePrivacy(isPrivate) {
  return postJson('/Jellio/profile/privacy', { IsPrivate: Boolean(isPrivate) });
}

export function saveSubtitleStyle(style) {
  return postJson('/Jellio/profile/subtitles', style);
}

export function saveProfileRecommendations(selectedGenres, customGenres) {
  return postJson('/Jellio/profile/recommendations', {
    SelectedGenres: selectedGenres,
    CustomGenres: customGenres,
  });
}

export function getAchievements(userId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return getJson('/Jellio/achievements/' + targetId);
}

export async function getJellioNotifications() {
  const res = await getJson('/Jellio/notifications').catch(() => []);
  return Array.isArray(res) ? res : [];
}

export function getPendingOverlays(after = 0) {
  return getJson('/Jellio/overlays/pending?after=' + String(after)).catch(() => ({ Overlays: [] }));
}

export function getPendingSounds(after = 0) {
  return getJson('/Jellio/sounds/pending?after=' + String(after)).catch(() => ({ Sounds: [] }));
}

export function getJellioConfig() {
  return getJson('/Jellio/config').catch(() => null);
}

export function loadVideoTranscodePolicy() {
  return PlayerPrefs.getAvoidVideoTranscodes() ? 'Avoid' : 'PreferReady';
}

export async function getCommunityUsers() {
  const res = await getJson('/Jellio/community/users').catch(() => []);
  return Array.isArray(res) ? res : [];
}

export async function getCommunityWatching(excludedUserIds = []) {
  const res = await getJson('/Jellio/community/watching').catch(() => []);
  const list = Array.isArray(res) ? res : [];
  if (excludedUserIds && excludedUserIds.length > 0) {
    const excluded = new Set(excludedUserIds);
    return list.filter((item) => !excluded.has(item.UserId));
  }
  return list;
}

export async function getAvatarPresets() {
  const res = await getJson('/Jellio/avatars').catch(() => []);
  return Array.isArray(res) ? res : [];
}

export function setUserAvatarFromPreset(userId, presetId) {
  const session = getSession();
  const targetId = userId || (session ? session.userId : '');
  return postJson(`/Users/${targetId}/Images/Primary`, { PresetId: presetId });
}

// --- Image URLs ---

export function getImageUrl(itemId, tag = null, imageType = 'Primary', maxWidth = 400, options = {}) {
  if (typeof tag === 'object' && tag !== null) {
    options = tag;
    tag = options.tag || null;
    imageType = options.imageType || options.type || 'Primary';
    maxWidth = options.maxWidth || 400;
  }
  if (tag && (tag.startsWith('http://') || tag.startsWith('https://'))) return tag;
  if (typeof itemId === 'string' && (itemId.startsWith('http://') || itemId.startsWith('https://'))) {
    return itemId;
  }
  const session = getSession();
  const server = cleanServerAddress(options.serverAddress || (session ? session.serverAddress : ''));
  const token = options.accessToken || (session ? session.accessToken : null);

  const params = new URLSearchParams({
    maxWidth: String(maxWidth),
    quality: String(options.quality || 85),
  });
  if (tag) params.set('tag', tag);
  if (token) {
    params.set('ApiKey', token);
    params.set('api_key', token);
  }
  return `${server}/Items/${itemId}/Images/${imageType}?${params.toString()}`;
}

export function getUserImageUrl(userId, tag = null, maxWidth = 300, options = {}) {
  if (typeof tag === 'object' && tag !== null) {
    options = tag;
    tag = options.tag || null;
    maxWidth = options.maxWidth || 300;
  }
  const session = getSession();
  const server = cleanServerAddress(options.serverAddress || (session ? session.serverAddress : ''));
  const token = options.accessToken || (session ? session.accessToken : null);

  const params = new URLSearchParams({ maxWidth: String(maxWidth) });
  if (tag) params.set('tag', tag);
  if (token) {
    params.set('ApiKey', token);
    params.set('api_key', token);
  }
  return `${server}/Users/${userId}/Images/Primary?${params.toString()}`;
}

export function getBannerUrl(userId, options = {}) {
  const session = getSession();
  const server = cleanServerAddress(options.serverAddress || (session ? session.serverAddress : ''));
  const token = options.accessToken || (session ? session.accessToken : null);
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (token) {
    params.set('ApiKey', token);
    params.set('api_key', token);
  }
  return `${server}/Jellio/profile/banner/${userId}?${params.toString()}`;
}

export function getAvatarPresetUrl(presetId, options = {}) {
  const session = getSession();
  const server = cleanServerAddress(options.serverAddress || (session ? session.serverAddress : ''));
  const token = options.accessToken || (session ? session.accessToken : null);
  const encodedId = String(presetId)
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');

  const params = new URLSearchParams();
  if (token) {
    params.set('ApiKey', token);
    params.set('api_key', token);
  }
  const query = params.toString();
  return `${server}/Jellio/avatars/${encodedId}${query ? '?' + query : ''}`;
}

export async function getLibraryNavEntries(userId) {
  const views = await getUserViews(userId).catch(() => []);
  const list = Array.isArray(views) ? views : (views && views.Items) || [];
  return list.filter((v) => {
    if (!v || !v.Id) return false;
    const col = (v.CollectionType || '').toLowerCase();
    return col === 'movies' || col === 'tvshows' || col === 'livetv' || /anime/i.test(v.Name || '');
  });
}

export function getServiceLogoUrl(serviceName, options = {}) {
  const session = getSession();
  const server = cleanServerAddress(options.serverAddress || (session ? session.serverAddress : ''));
  const token = options.accessToken || (session ? session.accessToken : null);
  const params = new URLSearchParams();
  if (token) {
    params.set('ApiKey', token);
    params.set('api_key', token);
  }
  const query = params.toString();
  return `${server}/Jellio/services/logo/${encodeURIComponent(serviceName)}${query ? '?' + query : ''}`;
}

export async function getServiceCatalogRow(serviceName, type = 'Movie', sort = 'Popular', limit = 20, genre = undefined) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    service: serviceName,
    type,
    sort,
    limit: String(limit),
  });
  if (genre) params.set('genre', genre);

  try {
    const res = await getJson('/Jellio/catalog/service?' + params.toString());
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.Items)) return res.Items;
  } catch (_) {}

  const fallback = await getLibraryItems(targetId, {
    includeItemTypes: type,
    genres: genre,
    limit,
    sortBy: sort === 'TopRated' ? 'CommunityRating,SortName' : 'DateCreated,CommunityRating',
    sortOrder: 'Descending',
  }).catch(() => ({ Items: [] }));
  return fallback.Items || [];
}

export async function getCatalogRow(catalog = 'trending', type = 'Movie', limit = 20, startIndex = 0) {
  const session = getSession();
  const targetId = session ? session.userId : '';
  const params = new URLSearchParams({
    catalog,
    type,
    limit: String(limit),
    startIndex: String(startIndex),
  });

  try {
    const res = await getJson('/Jellio/catalog?' + params.toString());
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.Items)) return res.Items;
  } catch (_) {}

  const fallback = await getLibraryItems(targetId, {
    includeItemTypes: type,
    limit,
    startIndex,
    sortBy: 'DateCreated,CommunityRating',
    sortOrder: 'Descending',
  }).catch(() => ({ Items: [] }));
  return fallback.Items || [];
}

