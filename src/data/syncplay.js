// SyncPlay WebSocket manager, clock synchronization, and playback actions.
import { getSession, cleanServerAddress } from './session.js';
import { getJson, postJson, TICKS_PER_MS } from './api.js';

const PING_INTERVAL_MS = 30000;
const RECONCILE_INTERVAL_MS = 15000;
const RECONCILE_IDLE_INTERVAL_MS = 60000;
const RECONNECT_DELAY_MS = 5000;
const MAX_MEASUREMENTS = 6;
const EXPLICIT_LEAVE_GRACE_MS = 20000;

export function sameId(a, b) {
  if (!a || !b) return false;
  return String(a).replace(/-/g, '').toLowerCase() === String(b).replace(/-/g, '').toLowerCase();
}

export function parseIsoTime(str) {
  if (!str) return null;
  const d = new Date(str);
  const time = d.getTime();
  return isNaN(time) ? null : time;
}

export function decideReconcile(groups, storedGroupId, current, myUserName, pendingCreateName, leaveGraceActive) {
  const list = Array.isArray(groups) ? groups : [];
  let mine = storedGroupId ? list.find((g) => sameId(g.GroupId, storedGroupId)) : null;

  if (!mine && pendingCreateName) {
    mine = list.find((g) => g.GroupName === pendingCreateName && g.Participants && g.Participants.includes(myUserName));
  }

  if (mine && leaveGraceActive) return { action: 'none' };
  if (mine && (!current || !sameId(current.groupId, mine.GroupId))) {
    return { action: 'join', group: mine };
  }

  if (!current) return { action: 'none' };
  const live = list.find((g) => sameId(g.GroupId, current.groupId));
  if (!live) return { action: 'reset' };

  if (!myUserName || (live.Participants && live.Participants.includes(myUserName))) {
    return { action: 'none' };
  }

  if (leaveGraceActive || list.some((g) => g.Participants && g.Participants.includes(myUserName))) {
    return { action: 'reset' };
  }

  return { action: 'join', group: live };
}

export class SyncPlayManager {
  constructor(options = {}) {
    this.remoteControlManager = options.remoteControlManager || null;
    this.socket = null;
    this.group = null;
    this.target = null;
    this.myGroupId = null;
    this.myUserName = '';
    this.activeUserId = null;
    this.measurements = [];
    this.explicitLeaveUntil = 0;
    this.lastDeniedAtMs = 0;
    this.pendingCreateName = null;
    this.pendingCreateUntil = 0;
    this.lastNotifiedPlaylistItemId = null;

    this.isRunning = false;
    this.pingTimer = null;
    this.reconcileTimer = null;
    this.reconnectTimer = null;
    this.keepAliveTimer = null;

    this.groupListeners = new Set();
    this.targetListeners = new Set();
    this.commandListeners = new Set();
    this.eventListeners = new Set();
  }

  subscribeGroup(fn) {
    this.groupListeners.add(fn);
    return () => this.groupListeners.delete(fn);
  }

  subscribeTarget(fn) {
    this.targetListeners.add(fn);
    return () => this.targetListeners.delete(fn);
  }

  subscribeCommands(fn) {
    this.commandListeners.add(fn);
    return () => this.commandListeners.delete(fn);
  }

  subscribeEvents(fn) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  notifyGroup() {
    for (const fn of this.groupListeners) {
      try {
        fn(this.group);
      } catch (_) {}
    }
  }

  notifyTarget() {
    for (const fn of this.targetListeners) {
      try {
        fn(this.target);
      } catch (_) {}
    }
  }

  notifyCommand(cmd) {
    for (const fn of this.commandListeners) {
      try {
        fn(cmd);
      } catch (_) {}
    }
  }

  notifyEvent(evt) {
    for (const fn of this.eventListeners) {
      try {
        fn(evt);
      } catch (_) {}
    }
  }

  start(session) {
    const active = session || getSession();
    if (!active || !active.serverAddress || !active.accessToken) return;

    if (this.activeUserId && !sameId(this.activeUserId, active.userId)) {
      if (this.group || this.myGroupId) {
        postJson('/SyncPlay/Leave').catch(() => {});
      }
      this.resetGroup();
      this.pendingCreateName = null;
      this.explicitLeaveUntil = 0;
      this.measurements = [];
    }

    this.activeUserId = active.userId;
    this.myUserName = active.userName || '';
    this.isRunning = true;

    this.connectWebSocket(active);
    this.startTimers();
  }

  stop() {
    this.isRunning = false;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
  }

  startTimers() {
    this.clearTimers();
    this.pingTimer = setInterval(() => {
      if (this.isRunning) this.pingServerTime().catch(() => {});
    }, PING_INTERVAL_MS);

    const scheduleReconcile = () => {
      if (!this.isRunning) return;
      const interval = this.group ? RECONCILE_INTERVAL_MS : RECONCILE_IDLE_INTERVAL_MS;
      this.reconcileTimer = setTimeout(async () => {
        await this.reconcile().catch(() => {});
        scheduleReconcile();
      }, interval);
    };
    scheduleReconcile();

    this.pingServerTime().catch(() => {});
    this.reconcile().catch(() => {});
  }

  clearTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.pingTimer = null;
    this.reconcileTimer = null;
    this.reconnectTimer = null;
    this.keepAliveTimer = null;
  }

  connectWebSocket(session) {
    if (!this.isRunning) return;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) {
      return;
    }

    const cleanServer = cleanServerAddress(session.serverAddress);
    const wsProto = cleanServer.startsWith('https://') ? 'wss://' : 'ws://';
    const host = cleanServer.replace(/^https?:\/\//i, '');
    const wsUrl = `${wsProto}${host}/socket?api_key=${encodeURIComponent(session.accessToken)}&deviceId=${encodeURIComponent(session.deviceId)}`;

    try {
      if (typeof WebSocket === 'undefined') return;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconcile().catch(() => {});
        if (this.remoteControlManager && typeof this.remoteControlManager.reportCapabilities === 'function') {
          this.remoteControlManager.reportCapabilities().catch(() => {});
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
          if (data) this.handleMessage(data);
        } catch (_) {}
      };

      this.socket.onclose = () => {
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
        if (this.isRunning) {
          this.reconnectTimer = setTimeout(() => {
            const currentSession = getSession();
            if (currentSession) this.connectWebSocket(currentSession);
          }, RECONNECT_DELAY_MS);
        }
      };

      this.socket.onerror = () => {
        try {
          this.socket.close();
        } catch (_) {}
      };
    } catch (_) {}
  }

  handleMessage(message) {
    const type = message.MessageType;
    const data = message.Data;

    if (type === 'ForceKeepAlive') {
      const seconds = Math.max(10, Number(data) || 60);
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (this.socket && this.socket.readyState === 1) {
          this.socket.send(JSON.stringify({ MessageType: 'KeepAlive' }));
        }
      }, (seconds * 1000) / 2);
      return;
    }

    if (type === 'SyncPlayGroupUpdate') {
      this.handleGroupUpdate(data);
    } else if (type === 'SyncPlayCommand') {
      if (!data || !data.Command) return;
      const cmd = {
        command: data.Command,
        whenRemoteMs: parseIsoTime(data.When) || Date.now(),
        positionTicks: data.PositionTicks != null ? Number(data.PositionTicks) : null,
        playlistItemId: data.PlaylistItemId || null,
        receivedAtMs: Date.now(),
      };
      this.notifyCommand(cmd);
    } else if (type === 'Play' || type === 'Playstate' || type === 'GeneralCommand') {
      if (this.remoteControlManager && typeof this.remoteControlManager.handleWebSocketMessage === 'function') {
        this.remoteControlManager.handleWebSocketMessage(message);
      }
    }
  }

  handleGroupUpdate(update) {
    if (!update || !update.Type) return;
    const type = update.Type;
    const data = update.Data;

    switch (type) {
      case 'GroupJoined':
        if (data) {
          this.group = this.parseGroup(data);
          this.myGroupId = this.group.groupId;
          this.pendingCreateName = null;
          this.target = null;
          this.lastNotifiedPlaylistItemId = null;
          this.notifyGroup();
          this.notifyTarget();
        }
        break;

      case 'GroupUpdate':
        if (data) {
          this.group = this.parseGroup(data);
          this.notifyGroup();
        }
        break;

      case 'UserJoined': {
        const name = String(data || '');
        if (this.group && name) {
          const parts = this.group.participants.slice();
          if (!parts.includes(name)) parts.push(name);
          this.group = Object.assign({}, this.group, { participants: parts });
          this.notifyGroup();
          if (name !== this.myUserName) {
            this.notifyEvent({ type: 'presence', name, joined: true });
          }
        }
        break;
      }

      case 'UserLeft': {
        const name = String(data || '');
        if (this.group && name) {
          const parts = this.group.participants.filter((p) => p !== name);
          this.group = Object.assign({}, this.group, { participants: parts });
          this.notifyGroup();
          if (name !== this.myUserName) {
            this.notifyEvent({ type: 'presence', name, joined: false });
          }
        }
        break;
      }

      case 'PlayQueue':
        if (data) {
          const target = this.parseTarget(data);
          this.target = target;
          this.notifyTarget();
          if (target && target.playlistItemId !== this.lastNotifiedPlaylistItemId) {
            this.lastNotifiedPlaylistItemId = target.playlistItemId;
            this.notifyEvent({ type: 'started', target });
          }
        }
        break;

      case 'NotInGroup':
      case 'GroupLeft':
        this.resetGroup();
        break;

      case 'GroupDoesNotExist':
        this.resetGroup();
        this.notifyEvent({ type: 'denied', reason: 'GroupDoesNotExist', inGroup: false });
        break;

      case 'JoinGroupDenied':
      case 'CreateGroupDenied':
      case 'LibraryAccessDenied': {
        const inGroup = this.group !== null;
        if (!inGroup) {
          this.lastDeniedAtMs = Date.now();
          this.myGroupId = null;
          this.pendingCreateName = null;
        }
        this.notifyEvent({ type: 'denied', reason: type, inGroup });
        break;
      }
    }
  }

  parseGroup(data) {
    const rawParts = Array.isArray(data.Participants) ? data.Participants : [];
    return {
      groupId: data.GroupId || '',
      groupName: data.GroupName || 'Group Watch',
      participants: rawParts.map((p) => (typeof p === 'string' ? p : (p && p.UserName) || '')).filter(Boolean),
    };
  }

  parseTarget(queue) {
    const playlist = Array.isArray(queue.Playlist) ? queue.Playlist : null;
    const index = typeof queue.PlayingItemIndex === 'number' ? queue.PlayingItemIndex : -1;
    if (!playlist || index < 0 || index >= playlist.length) return null;
    const entry = playlist[index];
    if (!entry) return null;

    const itemId = String(entry.ItemId || '').replace(/-/g, '');
    const playlistItemId = entry.PlaylistItemId || '';
    if (!itemId || !playlistItemId) return null;

    return {
      itemId,
      playlistItemId,
      startPositionTicks: Number(queue.StartPositionTicks) || 0,
      isPlaying: Boolean(queue.IsPlaying),
    };
  }

  resetGroup() {
    this.myGroupId = null;
    this.group = null;
    this.target = null;
    this.lastNotifiedPlaylistItemId = null;
    this.notifyGroup();
    this.notifyTarget();
  }

  async reconcile() {
    const beforeId = this.group ? this.group.groupId : null;
    let groups = [];
    try {
      groups = await this.listGroups();
    } catch (_) {
      return;
    }

    if ((this.group ? this.group.groupId : null) !== beforeId) return;

    const stored = this.myGroupId;
    if (stored && !groups.some((g) => sameId(g.GroupId, stored))) {
      this.myGroupId = null;
    }

    const now = Date.now();
    const pendingName = this.pendingCreateName && now < this.pendingCreateUntil ? this.pendingCreateName : null;
    const leaveGrace = now < this.explicitLeaveUntil;

    const decision = decideReconcile(groups, stored, this.group, this.myUserName, pendingName, leaveGrace);

    if (decision.action === 'reset') {
      this.resetGroup();
    } else if (decision.action === 'join' && decision.group) {
      const mine = decision.group;
      const startedAt = Date.now();
      try {
        await postJson('/SyncPlay/Join', { GroupId: mine.GroupId });
        if (this.lastDeniedAtMs < startedAt) {
          this.myGroupId = mine.GroupId;
          setTimeout(() => {
            if (!this.group && sameId(this.myGroupId, mine.GroupId)) {
              this.group = {
                groupId: mine.GroupId,
                groupName: mine.GroupName || 'Group Watch',
                participants: mine.Participants || [],
              };
              this.notifyGroup();
            }
          }, 3000);
        }
      } catch (err) {
        if (err && err.status === 403 && this.group && sameId(this.group.groupId, mine.GroupId)) {
          this.resetGroup();
        }
      }
    }
  }

  async listGroups() {
    const res = await getJson('/SyncPlay/List');
    return Array.isArray(res) ? res : [];
  }

  async join(groupId) {
    this.explicitLeaveUntil = 0;
    const startedAt = Date.now();
    await postJson('/SyncPlay/Join', { GroupId: groupId });
    if (this.lastDeniedAtMs < startedAt) {
      this.myGroupId = groupId;
    }
  }

  async create(name) {
    this.explicitLeaveUntil = 0;
    this.pendingCreateName = name;
    this.pendingCreateUntil = Date.now() + 15000;

    await postJson('/SyncPlay/New', { GroupName: name });

    for (let i = 0; i < 32; i++) {
      if (this.group) return this.group;
      if (!this.pendingCreateName) return this.group;
      if (i % 4 === 3) {
        try {
          const list = await this.listGroups();
          const found = list.find((g) => g.GroupName === name && (!this.myUserName || (g.Participants && g.Participants.includes(this.myUserName))));
          if (found) {
            this.myGroupId = found.GroupId;
            this.pendingCreateName = null;
            if (!this.group) {
              this.group = {
                groupId: found.GroupId,
                groupName: found.GroupName || name,
                participants: found.Participants || [],
              };
              this.notifyGroup();
            }
            return this.group;
          }
        } catch (_) {}
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return this.group;
  }

  async leave() {
    this.explicitLeaveUntil = Date.now() + EXPLICIT_LEAVE_GRACE_MS;
    this.myGroupId = null;
    try {
      await postJson('/SyncPlay/Leave');
    } catch (_) {}
    this.resetGroup();
  }

  leaveLocally() {
    this.pendingCreateName = null;
    this.resetGroup();
  }

  requestPause() {
    return postJson('/SyncPlay/Pause').catch(() => {});
  }

  requestUnpause() {
    return postJson('/SyncPlay/Unpause').catch(() => {});
  }

  requestSeek(positionTicks) {
    return postJson('/SyncPlay/Seek', { PositionTicks: Math.round(positionTicks) }).catch(() => {});
  }

  notifyBuffering(positionTicks, isPlaying, playlistItemId) {
    return postJson('/SyncPlay/Buffering', {
      When: this.remoteNowIso(),
      PositionTicks: Math.round(positionTicks),
      IsPlaying: Boolean(isPlaying),
      PlaylistItemId: playlistItemId,
    }).catch(() => {});
  }

  notifyReady(positionTicks, isPlaying, playlistItemId) {
    return postJson('/SyncPlay/Ready', {
      When: this.remoteNowIso(),
      PositionTicks: Math.round(positionTicks),
      IsPlaying: Boolean(isPlaying),
      PlaylistItemId: playlistItemId,
    }).catch(() => {});
  }

  publishQueue(itemId, startPositionTicks = 0) {
    return postJson('/SyncPlay/SetNewQueue', {
      ItemIds: [itemId],
      PlayingItemIndex: 0,
      StartPositionTicks: Math.round(startPositionTicks),
    }).catch(() => {});
  }

  async pingServerTime() {
    const sent = Date.now();
    let timeRes = null;
    try {
      timeRes = await getJson('/GetUtcTime');
    } catch (_) {
      return;
    }
    const received = Date.now();
    const serverIn = parseIsoTime(timeRes && timeRes.RequestReceptionTime);
    const serverOut = parseIsoTime(timeRes && timeRes.ResponseTransmissionTime);
    if (!serverIn || !serverOut) return;

    const offset = ((serverIn - sent) + (serverOut - received)) / 2.0;
    const roundTrip = (received - sent) - (serverOut - serverIn);

    this.measurements.push({ offset, delay: roundTrip });
    while (this.measurements.length > MAX_MEASUREMENTS) {
      this.measurements.shift();
    }
  }

  offsetMs() {
    if (this.measurements.length === 0) return 0;
    let best = this.measurements[0];
    for (const m of this.measurements) {
      if (m.delay < best.delay) best = m;
    }
    return Math.round(best.offset);
  }

  remoteToLocalMs(remoteMs) {
    return remoteMs - this.offsetMs();
  }

  estimateTicksNow(positionTicks, whenRemoteMs) {
    const elapsedMs = Date.now() + this.offsetMs() - whenRemoteMs;
    return positionTicks + elapsedMs * TICKS_PER_MS;
  }

  remoteNowIso() {
    return new Date(Date.now() + this.offsetMs()).toISOString();
  }
}

export const syncPlayManager = new SyncPlayManager();
