// User and device preferences stored in localStorage.
import { readString, writeString, readJson, writeJson, remove, storageReadable } from '../runtime/storage.js';

// Keys
const KEYS = {
  // Display
  OVERSCAN: 'jellio_overscan_percent',
  UI_SCALE: 'jellio_ui_scale',
  SHOW_CLOCK: 'jellio_show_clock',
  CLOCK_USE_24H: 'jellio_clock_24h',
  REDUCE_MOTION: 'jellio_reduce_motion',
  SEASONAL_EFFECTS: 'jellio_seasonal_effects',

  // Player
  PREFER_READY_SOURCES: 'jellio_prefer_ready_sources',
  REMEMBER_STREAM_CHOICE: 'jellio_remember_stream_choice',
  AVOID_VIDEO_TRANSCODES: 'jellio_avoid_video_transcodes',
  AUTO_SKIP_INTRO: 'jellio_player_autoskip',
  UP_NEXT_COUNTDOWN: 'jellio_up_next_countdown',
  SUBTITLE_SIZE: 'jellio_subtitle_size',
  SUBTITLE_BACKGROUND: 'jellio_subtitle_background',
  SUBTITLE_LOOK: 'jellio_subtitle_look',
  AUDIO_LANGUAGE: 'jellio_audio_language_pref',
  SUBTITLE_LANGUAGE: 'jellio_subtitle_language_pref',
  REMEMBERED_SOURCES_MAP: 'jellio_remembered_sources',

  // QuickHub
  QUICK_HUB_SHOW_PILL: 'jellio_quick_hub_show_pill',
  QUICK_HUB_BUTTON: 'jellio_quick_hub_button',
  QUICK_HUB_TRIGGER: 'jellio_quick_hub_trigger',
  QUICK_HUB_CUSTOM_KEY: 'jellio_quick_hub_custom_key_code',

  // Home
  HOME_ROW_ORDER: 'jellio_home_row_order',
  HOME_HIDDEN_ROWS: 'jellio_home_hidden_rows',

  // Onboarding & Changelog
  ONBOARDING_DONE_PREFIX: 'jellio_onboarding_done_',
  CHANGELOG_SEEN_PREFIX: 'jellio_last_seen_changelog_',
};

// --- Display Preferences ---
export const DisplayPreferences = {
  getOverscanPercent() {
    const val = parseInt(readString(KEYS.OVERSCAN, '0'), 10);
    return isNaN(val) ? 0 : Math.max(0, Math.min(8, val));
  },
  setOverscanPercent(percent) {
    const clamped = Math.max(0, Math.min(8, Number(percent) || 0));
    writeString(KEYS.OVERSCAN, String(clamped));
  },

  getUiScale() {
    const val = parseFloat(readString(KEYS.UI_SCALE, '1.0'));
    return isNaN(val) ? 1.0 : val;
  },
  setUiScale(scale) {
    writeString(KEYS.UI_SCALE, String(scale));
  },

  getShowClock() {
    const val = readString(KEYS.SHOW_CLOCK, 'true');
    return val !== 'false';
  },
  setShowClock(show) {
    writeString(KEYS.SHOW_CLOCK, String(Boolean(show)));
  },

  getClockUse24h() {
    const val = readString(KEYS.CLOCK_USE_24H, 'false');
    return val === 'true';
  },
  setClockUse24h(use24h) {
    writeString(KEYS.CLOCK_USE_24H, String(Boolean(use24h)));
  },

  getReduceMotion() {
    return readString(KEYS.REDUCE_MOTION, 'false') === 'true';
  },
  setReduceMotion(reduce) {
    writeString(KEYS.REDUCE_MOTION, String(Boolean(reduce)));
  },

  getSeasonalEffects() {
    return readString(KEYS.SEASONAL_EFFECTS, 'true') !== 'false';
  },
  setSeasonalEffects(enable) {
    writeString(KEYS.SEASONAL_EFFECTS, String(Boolean(enable)));
  },

  getAll() {
    return {
      overscanPercent: this.getOverscanPercent(),
      uiScale: this.getUiScale(),
      showClock: this.getShowClock(),
      clockUse24h: this.getClockUse24h(),
      reduceMotion: this.getReduceMotion(),
      seasonalEffects: this.getSeasonalEffects(),
    };
  },
};

// --- Player Preferences ---
const REMEMBER_TTL_MS = 4 * 24 * 60 * 60 * 1000;

export const PlayerPrefs = {
  getPreferReadySources() {
    return readString(KEYS.PREFER_READY_SOURCES, 'true') !== 'false';
  },
  setPreferReadySources(pref) {
    writeString(KEYS.PREFER_READY_SOURCES, String(Boolean(pref)));
  },

  getRememberStreamChoice() {
    return readString(KEYS.REMEMBER_STREAM_CHOICE, 'true') !== 'false';
  },
  setRememberStreamChoice(remember) {
    writeString(KEYS.REMEMBER_STREAM_CHOICE, String(Boolean(remember)));
  },

  getRememberedSourceId(itemId) {
    if (!this.getRememberStreamChoice()) return null;
    const map = readJson(KEYS.REMEMBERED_SOURCES_MAP, {});
    const entry = map[String(itemId)];
    if (!entry || !entry.mediaSourceId || !entry.timestampMs) return null;
    if (Date.now() - entry.timestampMs > REMEMBER_TTL_MS) return null;
    return entry.mediaSourceId;
  },
  rememberSourceId(itemId, mediaSourceId) {
    if (!this.getRememberStreamChoice()) return;
    const now = Date.now();
    const map = readJson(KEYS.REMEMBERED_SOURCES_MAP, {});
    const cleanMap = {};
    for (const [id, entry] of Object.entries(map)) {
      if (entry && now - entry.timestampMs <= REMEMBER_TTL_MS) {
        cleanMap[id] = entry;
      }
    }
    cleanMap[String(itemId)] = { mediaSourceId, timestampMs: now };
    writeJson(KEYS.REMEMBERED_SOURCES_MAP, cleanMap);
  },

  getAvoidVideoTranscodes() {
    return readString(KEYS.AVOID_VIDEO_TRANSCODES, 'false') === 'true';
  },
  setAvoidVideoTranscodes(avoid) {
    writeString(KEYS.AVOID_VIDEO_TRANSCODES, String(Boolean(avoid)));
  },

  getAutoSkipIntro() {
    return readString(KEYS.AUTO_SKIP_INTRO, 'false') === 'true';
  },
  setAutoSkipIntro(skip) {
    writeString(KEYS.AUTO_SKIP_INTRO, String(Boolean(skip)));
  },

  getUpNextCountdownSeconds() {
    const val = parseInt(readString(KEYS.UP_NEXT_COUNTDOWN, '15'), 10);
    return isNaN(val) ? 15 : Math.max(0, val);
  },
  setUpNextCountdownSeconds(sec) {
    writeString(KEYS.UP_NEXT_COUNTDOWN, String(Math.max(0, Number(sec) || 0)));
  },

  getSubtitleSize() {
    return readString(KEYS.SUBTITLE_SIZE, 'normal');
  },
  setSubtitleSize(size) {
    writeString(KEYS.SUBTITLE_SIZE, size || 'normal');
  },

  getSubtitleBackground() {
    return readString(KEYS.SUBTITLE_BACKGROUND, 'none');
  },
  setSubtitleBackground(bg) {
    writeString(KEYS.SUBTITLE_BACKGROUND, bg || 'none');
  },

  getSubtitleLook() {
    return readString(KEYS.SUBTITLE_LOOK, 'clean');
  },
  setSubtitleLook(look) {
    writeString(KEYS.SUBTITLE_LOOK, look || 'clean');
  },

  getAudioLanguage() {
    return readString(KEYS.AUDIO_LANGUAGE, null);
  },
  setAudioLanguage(lang) {
    if (lang) writeString(KEYS.AUDIO_LANGUAGE, lang);
    else remove(KEYS.AUDIO_LANGUAGE);
  },

  getSubtitleLanguage() {
    return readString(KEYS.SUBTITLE_LANGUAGE, null);
  },
  setSubtitleLanguage(lang) {
    if (lang) writeString(KEYS.SUBTITLE_LANGUAGE, lang);
    else remove(KEYS.SUBTITLE_LANGUAGE);
  },

  getAll() {
    return {
      preferReadySources: this.getPreferReadySources(),
      rememberStreamChoice: this.getRememberStreamChoice(),
      avoidVideoTranscodes: this.getAvoidVideoTranscodes(),
      autoSkipIntro: this.getAutoSkipIntro(),
      upNextCountdownSeconds: this.getUpNextCountdownSeconds(),
      subtitleSize: this.getSubtitleSize(),
      subtitleBackground: this.getSubtitleBackground(),
      subtitleLook: this.getSubtitleLook(),
      audioLanguage: this.getAudioLanguage(),
      subtitleLanguage: this.getSubtitleLanguage(),
    };
  },
};

// --- QuickHub Preferences ---
export const QuickHubPrefs = {
  getShowPill() {
    return readString(KEYS.QUICK_HUB_SHOW_PILL, 'true') !== 'false';
  },
  setShowPill(show) {
    writeString(KEYS.QUICK_HUB_SHOW_PILL, String(Boolean(show)));
  },

  getButton() {
    return readString(KEYS.QUICK_HUB_BUTTON, 'BACK');
  },
  setButton(btn) {
    writeString(KEYS.QUICK_HUB_BUTTON, btn || 'BACK');
  },

  getTrigger() {
    return readString(KEYS.QUICK_HUB_TRIGGER, 'HOLD');
  },
  setTrigger(trig) {
    writeString(KEYS.QUICK_HUB_TRIGGER, trig || 'HOLD');
  },

  getCustomKeyCode() {
    const code = readString(KEYS.QUICK_HUB_CUSTOM_KEY, null);
    return code === null ? null : parseInt(code, 10);
  },
  setCustomKeyCode(code) {
    if (code === null || code === undefined) remove(KEYS.QUICK_HUB_CUSTOM_KEY);
    else writeString(KEYS.QUICK_HUB_CUSTOM_KEY, String(code));
  },

  getAll() {
    return {
      showPill: this.getShowPill(),
      button: this.getButton(),
      trigger: this.getTrigger(),
      customKeyCode: this.getCustomKeyCode(),
    };
  },
};

// --- Home Preferences ---
export const HomePrefs = {
  getRowOrder() {
    return readJson(KEYS.HOME_ROW_ORDER, null);
  },
  setRowOrder(order) {
    if (Array.isArray(order)) writeJson(KEYS.HOME_ROW_ORDER, order);
    else remove(KEYS.HOME_ROW_ORDER);
  },

  getHiddenRowKeys() {
    return readJson(KEYS.HOME_HIDDEN_ROWS, []);
  },
  setHiddenRowKeys(keys) {
    if (Array.isArray(keys)) writeJson(KEYS.HOME_HIDDEN_ROWS, keys);
    else remove(KEYS.HOME_HIDDEN_ROWS);
  },
  isRowHidden(key) {
    const list = this.getHiddenRowKeys();
    return list.includes(key);
  },
  getHiddenRows() {
    return this.getHiddenRowKeys();
  },
  setHiddenRows(keys) {
    this.setHiddenRowKeys(keys);
  },
};

export const HomeRowPreferences = HomePrefs;

// --- Changelog & Onboarding Preferences ---
export function isBigRelease(version) {
  if (!version || typeof version !== 'string') return false;
  const clean = version.trim().replace(/^v/i, '');
  const parts = clean.split('.');
  if (parts.length >= 3) {
    const patch = parseInt(parts[2], 10);
    const build = parts.length > 3 ? parseInt(parts[3], 10) : 0;
    return !isNaN(patch) && patch === 0 && (!build || build === 0);
  }
  if (parts.length === 2) return true;
  return false;
}

export const OnboardingPrefs = {
  shouldShowOnboarding(userId) {
    if (!userId) return false;
    if (!storageReadable()) return false;
    const seen = readString(KEYS.ONBOARDING_DONE_PREFIX + userId, null);
    return seen !== 'true';
  },
  markOnboardingSeen(userId) {
    if (!userId) return;
    writeString(KEYS.ONBOARDING_DONE_PREFIX + userId, 'true');
  },
};

export const ChangelogPrefs = {
  shouldShowChangelog(version = '0.1.0', userId = 'global') {
    if (!isBigRelease(version)) return false;
    const key = KEYS.CHANGELOG_SEEN_PREFIX + (userId || 'global');
    const seen = readString(key, null);
    if (seen && seen !== version) {
      remove(key);
      return true;
    }
    return seen !== version;
  },
  markChangelogSeen(version, userId = 'global') {
    if (!version) return;
    const key = KEYS.CHANGELOG_SEEN_PREFIX + (userId || 'global');
    writeString(key, version);
  },
};
