// Session storage, multi-user switching, and session guard.
import { readJson, writeJson, remove } from '../runtime/storage.js';

const KEY_ACTIVE_SESSION = 'jellio_session';
const KEY_SAVED_ACCOUNTS = 'jellio_saved_accounts';
const KEY_DEVICE_ID = 'jellio_device_id';
const KEY_LOGIN_HANDOFF = 'jellio_login_handoff';

// Generate or retrieve persistent UUID for this TV client
export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return 'tizen-device-node-test';
  try {
    let id = window.localStorage.getItem(KEY_DEVICE_ID);
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'tizen-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
      }
      window.localStorage.setItem(KEY_DEVICE_ID, id);
    }
    return id;
  } catch (err) {
    return 'tizen-device-fallback';
  }
}

export function cleanServerAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  let cleaned = addr.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'http://' + cleaned;
  }
  return cleaned.replace(/\/+$/, '');
}

// Active session: { serverAddress, userId, userName, accessToken, deviceId }
export function getSession() {
  const sess = readJson(KEY_ACTIVE_SESSION, null);
  if (!sess || !sess.serverAddress || !sess.userId || !sess.accessToken) {
    return null;
  }
  return {
    serverAddress: cleanServerAddress(sess.serverAddress),
    userId: sess.userId,
    userName: sess.userName || '',
    accessToken: sess.accessToken,
    deviceId: sess.deviceId || getOrCreateDeviceId(),
  };
}

export function setSession(sess) {
  if (!sess) {
    clearSession();
    return;
  }
  const normalized = {
    serverAddress: cleanServerAddress(sess.serverAddress),
    userId: sess.userId,
    userName: sess.userName || '',
    accessToken: sess.accessToken,
    deviceId: sess.deviceId || getOrCreateDeviceId(),
  };
  writeJson(KEY_ACTIVE_SESSION, normalized);
  saveAccount(normalized);
}

export function clearSession() {
  remove(KEY_ACTIVE_SESSION);
}

// Saved accounts list
export function getSavedAccounts() {
  const list = readJson(KEY_SAVED_ACCOUNTS, []);
  return Array.isArray(list) ? list : [];
}

export function saveAccount(sess) {
  if (!sess || !sess.userId || !sess.serverAddress) return;
  const list = getSavedAccounts();
  const server = cleanServerAddress(sess.serverAddress);
  const filtered = list.filter(
    (a) => !(a.userId === sess.userId && cleanServerAddress(a.serverAddress) === server)
  );
  filtered.unshift({
    serverAddress: server,
    userId: sess.userId,
    userName: sess.userName || '',
    accessToken: sess.accessToken || '',
    deviceId: sess.deviceId || getOrCreateDeviceId(),
    lastUsedAt: Date.now(),
  });
  writeJson(KEY_SAVED_ACCOUNTS, filtered);
}

export function removeAccount(userId, serverAddress) {
  const list = getSavedAccounts();
  const server = cleanServerAddress(serverAddress);
  const filtered = list.filter(
    (a) => !(a.userId === userId && cleanServerAddress(a.serverAddress) === server)
  );
  writeJson(KEY_SAVED_ACCOUNTS, filtered);

  const active = getSession();
  if (active && active.userId === userId && cleanServerAddress(active.serverAddress) === server) {
    clearSession();
  }
}

export function switchAccount(userId, serverAddress) {
  const list = getSavedAccounts();
  const server = cleanServerAddress(serverAddress);
  const found = list.find(
    (a) => a.userId === userId && cleanServerAddress(a.serverAddress) === server
  );
  if (found) {
    setSession(found);
    return true;
  }
  return false;
}

// Login Handoff
export const LoginHandoff = {
  set(username, message = '') {
    writeJson(KEY_LOGIN_HANDOFF, { username, message, at: Date.now() });
  },
  get() {
    return readJson(KEY_LOGIN_HANDOFF, null);
  },
  clear() {
    remove(KEY_LOGIN_HANDOFF);
  },
};

// SessionGuard
export class SessionGuard {
  constructor(options = {}) {
    this.onExpired = options.onExpired || (() => {});
    this.confirmCheck = options.confirmCheck || null;
    this.isChecking = false;
    this.lostTokens = new Set();
    this.lastCheckedAt = new Map();
    this.recheckDelayMs = options.recheckDelayMs || 60000;
  }

  isCandidate(status, url, carriesOwnAuth) {
    if (status !== 401 || carriesOwnAuth) return false;
    if (!url) return false;
    const lower = url.toLowerCase();
    const bypassPaths = [
      '/users/authenticatebyname',
      '/users/authenticatewithquickconnect',
      '/users/forgotpassword',
      '/quickconnect/',
    ];
    return !bypassPaths.some((p) => lower.includes(p));
  }

  async onResponse(status, url, token, carriesOwnAuth = false) {
    if (!token || !this.isCandidate(status, url, carriesOwnAuth)) return;
    if (this.lostTokens.has(token) || this.isChecking) return;

    const last = this.lastCheckedAt.get(token);
    if (last && Date.now() - last < this.recheckDelayMs) return;

    this.isChecking = true;
    try {
      const active = getSession();
      if (!active || active.accessToken !== token) {
        return;
      }

      let confirmedStatus = null;
      if (typeof this.confirmCheck === 'function') {
        confirmedStatus = await this.confirmCheck(active);
      } else {
        confirmedStatus = 401;
      }

      if (confirmedStatus === 401) {
        this.lostTokens.add(token);
        const expired = {
          serverAddress: active.serverAddress,
          userId: active.userId,
          userName: active.userName,
        };
        this.onExpired(expired);
      } else {
        this.lastCheckedAt.set(token, Date.now());
      }
    } catch (err) {
      // Network failure or timeout does not mark session lost
    } finally {
      this.isChecking = false;
    }
  }

  acknowledge(token) {
    if (token) this.lostTokens.delete(token);
  }
}

export const defaultSessionGuard = new SessionGuard({
  onExpired(expired) {
    LoginHandoff.set(expired.userName, 'Session expired. Please sign in again.');
  },
});
