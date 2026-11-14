// QuickHub navigation and focus recovery logic.

export const QuickHubTab = Object.freeze({
  NOW_PLAYING: 'NOW_PLAYING',
  NOTIFICATIONS: 'NOTIFICATIONS',
  GROUP_WATCH: 'GROUP_WATCH',
  FRIENDS: 'FRIENDS',
});

export const ALL_QUICK_HUB_TABS = Object.freeze([
  QuickHubTab.NOW_PLAYING,
  QuickHubTab.NOTIFICATIONS,
  QuickHubTab.GROUP_WATCH,
  QuickHubTab.FRIENDS,
]);

export function visibleQuickHubTabs(friendsAvailable = false) {
  return ALL_QUICK_HUB_TABS.filter((tab) => tab !== QuickHubTab.FRIENDS || friendsAvailable);
}

export function resolveQuickHubTab(tab, friendsAvailable = false) {
  const visible = visibleQuickHubTabs(friendsAvailable);
  return visible.includes(tab) ? tab : QuickHubTab.NOW_PLAYING;
}

export function quickHubBackLeavesAddList(tab, adding) {
  return tab === QuickHubTab.FRIENDS && Boolean(adding);
}

export const PILL_WEIGHT_COMPACT = 1;
export const PILL_WEIGHT_EXPANDED = 2.2;

export function quickHubPillExpanded(selected) {
  return Boolean(selected);
}

export function quickHubPillWeight(selected) {
  return quickHubPillExpanded(selected) ? PILL_WEIGHT_EXPANDED : PILL_WEIGHT_COMPACT;
}

export function quickHubShouldRecoverFocus(hadFocus, hasFocus) {
  return Boolean(hadFocus && !hasFocus);
}

export function quickHubNeighbourTab(visible, current, step) {
  if (!Array.isArray(visible)) return null;
  const index = visible.indexOf(current);
  if (index < 0) return null;
  const targetIndex = index + step;
  if (targetIndex < 0 || targetIndex >= visible.length) return null;
  return visible[targetIndex];
}

export function quickHubPillHandsBack(pill, selected) {
  return pill !== selected;
}

export function quickHubFocusAfterRemoval(keys, removed) {
  if (!Array.isArray(keys)) return null;
  const index = keys.indexOf(removed);
  if (index < 0) return null;
  if (index + 1 < keys.length) return keys[index + 1];
  if (index - 1 >= 0) return keys[index - 1];
  return null;
}

export const QuickHubRecoveryTarget = Object.freeze({
  BODY: 'BODY',
  SELECTED_PILL: 'SELECTED_PILL',
});

export const QUICK_HUB_RECOVERY_FIRST_DELAY_MS = 120;
export const QUICK_HUB_RECOVERY_RETRY_MS = 60;
export const QUICK_HUB_RECOVERY_BODY_ATTEMPTS = 6;
export const QUICK_HUB_RECOVERY_ATTEMPTS = 8;

export function quickHubRecoveryTarget(attempt) {
  return attempt < QUICK_HUB_RECOVERY_BODY_ATTEMPTS
    ? QuickHubRecoveryTarget.BODY
    : QuickHubRecoveryTarget.SELECTED_PILL;
}

export class QuickHubRecoveryLimiter {
  constructor(maxRuns = 4, windowMs = 2000) {
    this.maxRuns = maxRuns;
    this.windowMs = windowMs;
    this.starts = [];
  }

  tryAcquire(nowMs = Date.now()) {
    while (this.starts.length > 0 && nowMs - this.starts[0] >= this.windowMs) {
      this.starts.shift();
    }
    if (this.starts.length >= this.maxRuns) return false;
    this.starts.push(nowMs);
    return true;
  }
}
