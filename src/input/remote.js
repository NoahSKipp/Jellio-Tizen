export const RemoteKey = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  ENTER: 'ENTER',
  BACK: 'BACK',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  PLAY_PAUSE: 'PLAY_PAUSE',
  STOP: 'STOP',
  FAST_FORWARD: 'FAST_FORWARD',
  REWIND: 'REWIND',
  TRACK_PREV: 'TRACK_PREV',
  TRACK_NEXT: 'TRACK_NEXT',
  RED: 'RED',
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  BLUE: 'BLUE',
  INFO: 'INFO',
  CAPTION: 'CAPTION',
  CHANNEL_UP: 'CHANNEL_UP',
  CHANNEL_DOWN: 'CHANNEL_DOWN',
  TOOLS: 'TOOLS',
  GUIDE: 'GUIDE',
  SEARCH: 'SEARCH',
  QUICK_HUB: 'QUICK_HUB',
});

export const QuickHubButton = Object.freeze({
  BACK: 'back',
  PLAY_PAUSE: 'play_pause',
  RED: 'red',
  GREEN: 'green',
  YELLOW: 'yellow',
  BLUE: 'blue',
  CUSTOM: 'custom',
  NONE: 'none',
});

export const QuickHubTrigger = Object.freeze({
  HOLD: 'long_press',
  DOUBLE_TAP: 'double_tap',
  SINGLE_PRESS: 'short_press',
});

const TIZEN_KEYS = [
  'MediaPlay',
  'MediaPause',
  'MediaPlayPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'Info',
  'Caption',
  'ChannelUp',
  'ChannelDown',
  'Tools',
  'Guide',
  'Search',
];

export function registerTizenKeys() {
  if (typeof tizen === 'undefined' || !tizen.tvinputdevice) {
    return;
  }
  try {
    if (typeof tizen.tvinputdevice.registerKeyBatch === 'function') {
      tizen.tvinputdevice.registerKeyBatch(TIZEN_KEYS);
      return;
    }
  } catch (_) {}

  for (const key of TIZEN_KEYS) {
    try {
      tizen.tvinputdevice.registerKey(key);
    } catch (_) {}
  }
}

export function normalizeKey(e) {
  const code = e.keyCode || e.which;
  const key = e.key;

  switch (code) {
    case 38:
      return RemoteKey.UP;
    case 40:
      return RemoteKey.DOWN;
    case 37:
      return RemoteKey.LEFT;
    case 39:
      return RemoteKey.RIGHT;
    case 13:
      return RemoteKey.ENTER;
    case 10009:
    case 27:
      return RemoteKey.BACK;
    case 415:
      return RemoteKey.PLAY;
    case 19:
      return RemoteKey.PAUSE;
    case 10252:
      return RemoteKey.PLAY_PAUSE;
    case 413:
      return RemoteKey.STOP;
    case 417:
      return RemoteKey.FAST_FORWARD;
    case 412:
      return RemoteKey.REWIND;
    case 10232:
      return RemoteKey.TRACK_PREV;
    case 10233:
      return RemoteKey.TRACK_NEXT;
    case 403:
      return RemoteKey.RED;
    case 404:
      return RemoteKey.GREEN;
    case 405:
      return RemoteKey.YELLOW;
    case 406:
      return RemoteKey.BLUE;
    case 457:
      return RemoteKey.INFO;
    case 10221:
    case 460:
      return RemoteKey.CAPTION;
    case 427:
      return RemoteKey.CHANNEL_UP;
    case 428:
      return RemoteKey.CHANNEL_DOWN;
    case 10135:
      return RemoteKey.TOOLS;
    case 458:
      return RemoteKey.GUIDE;
    default:
      break;
  }

  if (key === 'ArrowUp') return RemoteKey.UP;
  if (key === 'ArrowDown') return RemoteKey.DOWN;
  if (key === 'ArrowLeft') return RemoteKey.LEFT;
  if (key === 'ArrowRight') return RemoteKey.RIGHT;
  if (key === 'Enter' || key === ' ') return RemoteKey.ENTER;
  if (key === 'Escape' || key === 'Backspace') return RemoteKey.BACK;
  if (key === 'p' || key === 'k') return RemoteKey.PLAY_PAUSE;
  if (key === 's') return RemoteKey.FAST_FORWARD;
  if (key === 'r') return RemoteKey.REWIND;
  if (key === 'q') return RemoteKey.QUICK_HUB;
  if (key === 'i') return RemoteKey.INFO;
  if (key === 'c') return RemoteKey.CAPTION;
  if (key === 'g') return RemoteKey.GUIDE;

  return null;
}

export class LongPressDetector {
  constructor({ thresholdMs = 650, onSelect, onLongSelect } = {}) {
    this.thresholdMs = thresholdMs;
    this.onSelect = onSelect;
    this.onLongSelect = onLongSelect;
    this.timer = null;
    this.longFired = false;
    this.isPressed = false;
  }

  handleKeyDown(normalizedKey, rawEvent) {
    if (normalizedKey !== RemoteKey.ENTER) {
      return false;
    }
    if (rawEvent && rawEvent.repeat) {
      return true;
    }
    if (this.isPressed) {
      return true;
    }
    this.isPressed = true;
    this.longFired = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.longFired = true;
      if (typeof this.onLongSelect === 'function') {
        this.onLongSelect();
      }
    }, this.thresholdMs);
    return true;
  }

  handleKeyUp(normalizedKey) {
    if (normalizedKey !== RemoteKey.ENTER) {
      return false;
    }
    if (!this.isPressed) {
      return false;
    }
    this.isPressed = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.longFired) {
      if (typeof this.onSelect === 'function') {
        this.onSelect();
      }
    }
    this.longFired = false;
    return true;
  }

  reset() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.longFired = false;
    this.isPressed = false;
  }
}

export class QuickHubKeyGate {
  constructor({
    button = QuickHubButton.BACK,
    trigger = QuickHubTrigger.HOLD,
    customKeyCode = 0,
    holdTimeoutMs = 450,
    doubleTapTimeoutMs = 350,
    onToggle,
  } = {}) {
    this.button = button;
    this.trigger = trigger;
    this.customKeyCode = customKeyCode;
    this.holdTimeoutMs = holdTimeoutMs;
    this.doubleTapTimeoutMs = doubleTapTimeoutMs;
    this.onToggle = onToggle;

    this.isRecording = false;
    this.onRecordedKey = null;

    this.holdingCode = null;
    this.holdTimer = null;
    this.holdFired = false;
    this.lastTapTime = 0;
    this.swallowedCodes = new Set();
  }

  setConfig({ button, trigger, customKeyCode }) {
    if (button !== undefined) this.button = button;
    if (trigger !== undefined) this.trigger = trigger;
    if (customKeyCode !== undefined) this.customKeyCode = customKeyCode;
  }

  startRecording(onRecorded) {
    this.isRecording = true;
    this.onRecordedKey = onRecorded;
    this.resetState();
  }

  stopRecording() {
    this.isRecording = false;
    this.onRecordedKey = null;
  }

  isTargetEvent(rawCode, normalizedKey) {
    if (this.button === QuickHubButton.NONE) return false;
    if (this.button === QuickHubButton.BACK) return normalizedKey === RemoteKey.BACK;
    if (this.button === QuickHubButton.PLAY_PAUSE) {
      return normalizedKey === RemoteKey.PLAY_PAUSE || normalizedKey === RemoteKey.PLAY || normalizedKey === RemoteKey.PAUSE;
    }
    if (this.button === QuickHubButton.RED) return normalizedKey === RemoteKey.RED;
    if (this.button === QuickHubButton.GREEN) return normalizedKey === RemoteKey.GREEN;
    if (this.button === QuickHubButton.YELLOW) return normalizedKey === RemoteKey.YELLOW;
    if (this.button === QuickHubButton.BLUE) return normalizedKey === RemoteKey.BLUE;
    if (this.button === QuickHubButton.CUSTOM) {
      return rawCode === this.customKeyCode && this.customKeyCode !== 0;
    }
    return false;
  }

  forcesHold(rawCode, normalizedKey) {
    if (normalizedKey === RemoteKey.BACK) return true;
    if (this.button === QuickHubButton.BACK) return true;
    return false;
  }

  onKeyDown(rawCode, normalizedKey, available = true, hubOpen = false) {
    if (this.isRecording) {
      if (typeof this.onRecordedKey === 'function') {
        const handled = this.onRecordedKey(rawCode, normalizedKey);
        if (handled) {
          this.stopRecording();
          return { action: 'CONSUME' };
        }
      }
      return { action: 'PASS' };
    }

    if (normalizedKey === RemoteKey.QUICK_HUB && available) {
      return { action: 'TOGGLE' };
    }

    if (!available || this.button === QuickHubButton.NONE) {
      return { action: 'PASS' };
    }

    if (hubOpen && normalizedKey === RemoteKey.BACK) {
      return { action: 'PASS' };
    }

    if (!this.isTargetEvent(rawCode, normalizedKey)) {
      return { action: 'PASS' };
    }

    const effectiveTrigger = this.forcesHold(rawCode, normalizedKey) ? QuickHubTrigger.HOLD : this.trigger;

    if (effectiveTrigger === QuickHubTrigger.SINGLE_PRESS) {
      this.swallowedCodes.add(rawCode);
      return { action: 'TOGGLE' };
    }

    if (effectiveTrigger === QuickHubTrigger.DOUBLE_TAP) {
      const now = Date.now();
      if (now - this.lastTapTime < this.doubleTapTimeoutMs) {
        this.lastTapTime = 0;
        this.swallowedCodes.add(rawCode);
        return { action: 'TOGGLE' };
      }
      this.lastTapTime = now;
      return { action: 'PASS' };
    }

    if (effectiveTrigger === QuickHubTrigger.HOLD) {
      if (this.holdingCode === rawCode) {
        return { action: 'CONSUME' };
      }
      this.holdingCode = rawCode;
      this.holdFired = false;
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.holdingCode === rawCode) {
          this.holdFired = true;
          if (typeof this.onToggle === 'function') {
            this.onToggle();
          }
        }
      }, this.holdTimeoutMs);
      return { action: 'START_HOLD' };
    }

    return { action: 'PASS' };
  }

  onKeyUp(rawCode, normalizedKey) {
    if (this.isRecording) {
      return { action: 'PASS' };
    }

    if (this.swallowedCodes.has(rawCode)) {
      this.swallowedCodes.delete(rawCode);
      return { action: 'CONSUME' };
    }

    if (this.holdingCode === rawCode) {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
        this.holdTimer = null;
      }
      const fired = this.holdFired;
      this.holdingCode = null;
      this.holdFired = false;

      if (fired) {
        return { action: 'CONSUME' };
      }
      return { action: 'REPLAY_PRESS' };
    }

    return { action: 'PASS' };
  }

  resetState() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdingCode = null;
    this.holdFired = false;
    this.lastTapTime = 0;
    this.swallowedCodes.clear();
  }
}

export class RemoteInputEngine {
  constructor({
    onNavigate,
    onSelect,
    onLongSelect,
    onBack,
    onPlayPause,
    onStop,
    onFastForward,
    onRewind,
    onColorKey,
    onQuickHub,
    quickHubGate,
  } = {}) {
    this.onNavigate = onNavigate;
    this.onSelect = onSelect;
    this.onLongSelect = onLongSelect;
    this.onBack = onBack;
    this.onPlayPause = onPlayPause;
    this.onStop = onStop;
    this.onFastForward = onFastForward;
    this.onRewind = onRewind;
    this.onColorKey = onColorKey;
    this.onQuickHub = onQuickHub;
    this.quickHubGate = quickHubGate || new QuickHubKeyGate({ onToggle: onQuickHub });

    this.longPressDetector = new LongPressDetector({
      thresholdMs: 650,
      onSelect: () => {
        if (typeof this.onSelect === 'function') this.onSelect();
      },
      onLongSelect: () => {
        if (typeof this.onLongSelect === 'function') this.onLongSelect();
      },
    });

    this.isQuickHubAvailable = true;
    this.isQuickHubOpen = false;
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
  }

  attach(target = window) {
    registerTizenKeys();
    target.addEventListener('keydown', this.onKeyDownBound);
    target.addEventListener('keyup', this.onKeyUpBound);
  }

  detach(target = window) {
    target.removeEventListener('keydown', this.onKeyDownBound);
    target.removeEventListener('keyup', this.onKeyUpBound);
    this.longPressDetector.reset();
    this.quickHubGate.resetState();
  }

  handleKeyDown(e) {
    const rawCode = e.keyCode || e.which;
    const normalizedKey = normalizeKey(e);

    const gateResult = this.quickHubGate.onKeyDown(
      rawCode,
      normalizedKey,
      this.isQuickHubAvailable,
      this.isQuickHubOpen
    );

    if (gateResult.action === 'CONSUME') {
      e.preventDefault();
      return;
    }
    if (gateResult.action === 'TOGGLE') {
      e.preventDefault();
      if (typeof this.onQuickHub === 'function') this.onQuickHub();
      return;
    }
    if (gateResult.action === 'START_HOLD') {
      e.preventDefault();
      return;
    }

    if (normalizedKey === RemoteKey.ENTER) {
      e.preventDefault();
      this.longPressDetector.handleKeyDown(normalizedKey, e);
      return;
    }

    if (
      normalizedKey === RemoteKey.UP ||
      normalizedKey === RemoteKey.DOWN ||
      normalizedKey === RemoteKey.LEFT ||
      normalizedKey === RemoteKey.RIGHT
    ) {
      e.preventDefault();
      if (typeof this.onNavigate === 'function') {
        this.onNavigate(normalizedKey);
      }
      return;
    }

    if (normalizedKey === RemoteKey.BACK) {
      e.preventDefault();
      if (typeof this.onBack === 'function') {
        this.onBack();
      }
      return;
    }

    if (normalizedKey === RemoteKey.PLAY_PAUSE || normalizedKey === RemoteKey.PLAY || normalizedKey === RemoteKey.PAUSE) {
      e.preventDefault();
      if (typeof this.onPlayPause === 'function') {
        this.onPlayPause(normalizedKey);
      }
      return;
    }

    if (normalizedKey === RemoteKey.STOP) {
      e.preventDefault();
      if (typeof this.onStop === 'function') this.onStop();
      return;
    }

    if (normalizedKey === RemoteKey.FAST_FORWARD) {
      e.preventDefault();
      if (typeof this.onFastForward === 'function') this.onFastForward();
      return;
    }

    if (normalizedKey === RemoteKey.REWIND) {
      e.preventDefault();
      if (typeof this.onRewind === 'function') this.onRewind();
      return;
    }

    if (
      normalizedKey === RemoteKey.RED ||
      normalizedKey === RemoteKey.GREEN ||
      normalizedKey === RemoteKey.YELLOW ||
      normalizedKey === RemoteKey.BLUE
    ) {
      e.preventDefault();
      if (typeof this.onColorKey === 'function') {
        this.onColorKey(normalizedKey);
      }
    }
  }

  handleKeyUp(e) {
    const rawCode = e.keyCode || e.which;
    const normalizedKey = normalizeKey(e);

    const gateResult = this.quickHubGate.onKeyUp(rawCode, normalizedKey);

    if (gateResult.action === 'CONSUME') {
      e.preventDefault();
      return;
    }
    if (gateResult.action === 'REPLAY_PRESS') {
      e.preventDefault();
      if (normalizedKey === RemoteKey.BACK && typeof this.onBack === 'function') {
        this.onBack();
      }
      return;
    }

    if (normalizedKey === RemoteKey.ENTER) {
      e.preventDefault();
      this.longPressDetector.handleKeyUp(normalizedKey);
    }
  }
}
