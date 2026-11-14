// Now Playing session polling, local paused state, and remote control handoff.
import { getSession } from './session.js';
import { getJson, postJson, reportCapabilities } from './api.js';

export class RemoteControlManager {
  constructor() {
    this.playListeners = new Set();
    this.playstateListeners = new Set();
    this.generalListeners = new Set();
  }

  onPlay(fn) {
    this.playListeners.add(fn);
    return () => this.playListeners.delete(fn);
  }

  onPlaystate(fn) {
    this.playstateListeners.add(fn);
    return () => this.playstateListeners.delete(fn);
  }

  onGeneralCommand(fn) {
    this.generalListeners.add(fn);
    return () => this.generalListeners.delete(fn);
  }

  reportCapabilities() {
    return reportCapabilities();
  }

  handleWebSocketMessage(message) {
    if (!message || !message.MessageType) return false;
    const type = message.MessageType;
    const data = message.Data;
    if (!data || typeof data !== 'object') return false;

    if (type === 'Play') {
      const itemIds = Array.isArray(data.ItemIds) ? data.ItemIds : null;
      const rawId = (itemIds && itemIds[0]) || data.ItemId;
      if (!rawId) return false;

      const cleanId = String(rawId).replace(/-/g, '').trim();
      if (!cleanId) return false;

      const playCommand = (typeof data.PlayCommand === 'string' && data.PlayCommand.trim()) || 'PlayNow';
      const startPositionTicks = Number(data.StartPositionTicks) || 0;
      const mediaSourceId = (typeof data.MediaSourceId === 'string' && data.MediaSourceId.trim()) || null;
      const audioStreamIndex = typeof data.AudioStreamIndex === 'number' ? data.AudioStreamIndex : null;
      const subtitleStreamIndex = typeof data.SubtitleStreamIndex === 'number' ? data.SubtitleStreamIndex : null;

      const cmd = {
        itemId: cleanId,
        playCommand,
        startPositionTicks,
        mediaSourceId,
        audioStreamIndex,
        subtitleStreamIndex,
      };

      for (const fn of this.playListeners) {
        try {
          fn(cmd);
        } catch (_) {}
      }
      return true;
    }

    if (type === 'Playstate') {
      const command = typeof data.Command === 'string' ? data.Command.trim() : null;
      if (!command) return false;
      const seekPositionTicks = typeof data.SeekPositionTicks === 'number' ? data.SeekPositionTicks : null;

      const cmd = {
        command,
        seekPositionTicks,
      };

      for (const fn of this.playstateListeners) {
        try {
          fn(cmd);
        } catch (_) {}
      }
      return true;
    }

    if (type === 'GeneralCommand') {
      const name = typeof data.Name === 'string' ? data.Name.trim() : null;
      if (!name) return false;
      const args = {};
      if (data.Arguments && typeof data.Arguments === 'object') {
        for (const [k, v] of Object.entries(data.Arguments)) {
          if (k != null && v != null) args[String(k)] = String(v);
        }
      }

      const cmd = {
        name,
        arguments: args,
      };

      for (const fn of this.generalListeners) {
        try {
          fn(cmd);
        } catch (_) {}
      }
      return true;
    }

    return false;
  }
}

export const remoteControlManager = new RemoteControlManager();

export class NowPlayingManager {
  constructor(options = {}) {
    this.remoteControlManager = options.remoteControlManager || remoteControlManager;
    this.pollIntervalMs = 12000;
    this.sessions = [];
    this.activeCount = 0;
    this.localPaused = null;
    this.inBackground = false;
    this.pollTimer = null;
    this.lastSession = null;

    this.sessionsListeners = new Set();
    this.localPausedListeners = new Set();
  }

  subscribeSessions(fn) {
    this.sessionsListeners.add(fn);
    return () => this.sessionsListeners.delete(fn);
  }

  subscribeLocalPaused(fn) {
    this.localPausedListeners.add(fn);
    return () => this.localPausedListeners.delete(fn);
  }

  notifySessions() {
    for (const fn of this.sessionsListeners) {
      try {
        fn(this.sessions, this.activeCount);
      } catch (_) {}
    }
  }

  notifyLocalPaused() {
    for (const fn of this.localPausedListeners) {
      try {
        fn(this.localPaused);
      } catch (_) {}
    }
  }

  setLocalPaused(media) {
    if (!media) {
      this.localPaused = null;
    } else {
      this.localPaused = {
        itemId: media.itemId,
        title: media.title,
        subtitle: media.subtitle || null,
        positionTicks: media.positionTicks || 0,
        runTimeTicks: media.runTimeTicks || null,
      };
    }
    this.notifyLocalPaused();
  }

  startPolling(session, intervalMs = 12000) {
    this.lastSession = session || getSession();
    this.pollIntervalMs = intervalMs;
    if (!this.lastSession || !this.lastSession.accessToken || this.inBackground) return;
    if (this.pollTimer) return;

    this.fetchNowPlaying().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.fetchNowPlaying().catch(() => {});
    }, this.pollIntervalMs);
  }

  onAppStopped() {
    this.inBackground = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onAppStarted() {
    this.inBackground = false;
    if (this.lastSession) {
      this.startPolling(this.lastSession, this.pollIntervalMs);
    }
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.lastSession = null;
    this.sessions = [];
    this.activeCount = 0;
    this.notifySessions();
  }

  refresh() {
    if (!this.lastSession) return Promise.resolve();
    return this.fetchNowPlaying().catch(() => {});
  }

  async fetchNowPlaying() {
    try {
      const list = await getJson('/Jellio/now-playing');
      const active = Array.isArray(list)
        ? list.filter((s) => s && s.Item && typeof s.Item.Name === 'string' && s.Item.Name.trim().length > 0)
        : [];
      this.sessions = active;
      this.activeCount = active.length;
      this.notifySessions();
      return active;
    } catch (_) {
      return [];
    }
  }
}

export const nowPlayingManager = new NowPlayingManager({ remoteControlManager });
