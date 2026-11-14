// Friends, requests, watchlist sharing and added-by watchers.
import { getJson, postJson, authedFetch, apiCache } from './api.js';

export const ADDED_BY_MAX = 3;
export const ADDED_BY_KEY = 'friends:added-by';
export const ADDED_BY_TTL_MS = 30000;

export function plainId(id) {
  return String(id || '').replace(/-/g, '').toLowerCase();
}

export const FriendFailure = {
  Private: 'Private',
  Closed: 'Closed',
  Cooldown: 'Cooldown',
  FriendLimit: 'FriendLimit',
  Gone: 'Gone',
  Failed: 'Failed',
};

export class FriendRequestError extends Error {
  constructor(failure, message) {
    super(message || failure);
    this.name = 'FriendRequestError';
    this.failure = failure;
  }
}

export function friendFailureOf(code, status) {
  const normStatus = String(status || '').toLowerCase();
  if (code === 403) {
    if (normStatus === 'private') return FriendFailure.Private;
    if (normStatus === 'closed') return FriendFailure.Closed;
    return FriendFailure.Failed;
  }
  if (code === 429) return FriendFailure.Cooldown;
  if (code === 409) return FriendFailure.FriendLimit;
  if (code === 404) return FriendFailure.Gone;
  return FriendFailure.Failed;
}

export function statusFromBody(body) {
  if (!body) return null;
  if (typeof body === 'object') {
    return body.Status ? String(body.Status).toLowerCase() : null;
  }
  const match = /"Status"\s*:\s*"([A-Za-z]+)"/i.exec(String(body));
  return match ? match[1].toLowerCase() : null;
}

export function addedByMap(dto) {
  const result = {};
  if (!dto || !dto.Items) return result;
  for (const [itemId, entries] of Object.entries(dto.Items)) {
    if (!Array.isArray(entries)) continue;
    const people = entries
      .filter((e) => e && e.UserId)
      .slice(0, ADDED_BY_MAX)
      .map((e) => ({
        UserId: e.UserId,
        UserName: e.UserName || '',
        PrimaryImageTag: e.PrimaryImageTag || null,
      }));
    if (people.length > 0) {
      result[plainId(itemId)] = people;
    }
  }
  return result;
}

export function withAddedBy(items, byItemMap) {
  if (!Array.isArray(items)) return [];
  if (!byItemMap || Object.keys(byItemMap).length === 0) return items;
  return items.map((item) => {
    if (!item || !item.Id) return item;
    const by = byItemMap[plainId(item.Id)];
    if (!by) return item;
    return Object.assign({}, item, { AddedBy: by });
  });
}

export class FriendsRepository {
  constructor() {
    this.available = true;
    this.snapshot = null;
    this.addedBy = {};
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn(this.snapshot, this.available);
      } catch (_) {}
    }
  }

  reset() {
    this.available = true;
    this.snapshot = null;
    this.addedBy = {};
    this.notify();
  }

  async probe(promise) {
    if (!this.available) {
      throw new Error('Friends feature unavailable');
    }
    try {
      const res = await promise;
      return res;
    } catch (err) {
      if (err && err.status === 404 && this.available) {
        this.available = false;
        this.notify();
      }
      throw err;
    }
  }

  async list(force = false) {
    if (!force && this.snapshot) return this.snapshot;
    const data = await this.probe(getJson('/Jellio/friends'));
    this.snapshot = {
      Friends: (data && data.Friends) || [],
      Incoming: (data && data.Incoming) || [],
      Outgoing: (data && data.Outgoing) || [],
    };
    this.notify();
    return this.snapshot;
  }

  status(userId) {
    return this.probe(getJson('/Jellio/friends/status/' + encodeURIComponent(userId)));
  }

  async people(query) {
    const list = await this.probe(getJson('/Jellio/friends/people?query=' + encodeURIComponent(query || '')));
    return Array.isArray(list) ? list : [];
  }

  async action(path, body = null, method = 'POST') {
    if (!this.available) throw new Error('Friends feature unavailable');
    try {
      const res = await authedFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch (_) {}

      if (res.ok) {
        this.snapshot = null;
        return (parsed && parsed.Status) || 'none';
      }

      const status = (parsed && parsed.Status) || statusFromBody(text);
      const failure = friendFailureOf(res.status, status);
      throw new FriendRequestError(failure, 'Friend action failed: ' + failure);
    } catch (err) {
      if (err instanceof FriendRequestError) throw err;
      if (err && err.status === 404 && this.available) {
        this.available = false;
        this.notify();
      }
      throw err;
    }
  }

  sendRequest(userId) {
    return this.action('/Jellio/friends/requests', { UserId: userId });
  }

  accept(requestId) {
    return this.action('/Jellio/friends/requests/' + encodeURIComponent(requestId) + '/accept');
  }

  decline(requestId) {
    return this.action('/Jellio/friends/requests/' + encodeURIComponent(requestId) + '/decline');
  }

  cancel(requestId) {
    return this.action('/Jellio/friends/requests/' + encodeURIComponent(requestId), null, 'DELETE');
  }

  async remove(userId) {
    const res = await this.action('/Jellio/friends/' + encodeURIComponent(userId), null, 'DELETE');
    apiCache.invalidate(ADDED_BY_KEY);
    return res;
  }

  async setMuted(userId, muted) {
    const res = await this.probe(postJson('/Jellio/friends/' + encodeURIComponent(userId) + '/mute', {
      Muted: Boolean(muted),
    }));
    this.snapshot = null;
    return res && res.Muted !== undefined ? res.Muted : Boolean(muted);
  }

  async addToWatchlists(itemId, userIds) {
    const res = await this.probe(postJson('/Jellio/watchlist/friends', {
      ItemId: itemId,
      UserIds: userIds,
    }));
    return (res && res.Results) || [];
  }

  async settings() {
    const profile = await this.probe(getJson('/Jellio/profile/settings'));
    return {
      FriendsCanAddToWatchlist: profile.FriendsCanAddToWatchlist,
      FriendRequestsFrom: profile.FriendRequestsFrom,
    };
  }

  saveSettings(canAdd, requestsFrom) {
    return this.probe(postJson('/Jellio/profile/friends-settings', {
      FriendsCanAddToWatchlist: canAdd,
      FriendRequestsFrom: requestsFrom,
    }));
  }

  async refreshAddedBy() {
    try {
      const dto = await this.probe(getJson('/Jellio/watchlist/added-by'));
      this.addedBy = addedByMap(dto);
      return this.addedBy;
    } catch (_) {
      this.addedBy = {};
      return this.addedBy;
    }
  }

  withAddedBy(items) {
    return withAddedBy(items, this.addedBy);
  }
}

export const friendsRepository = new FriendsRepository();
