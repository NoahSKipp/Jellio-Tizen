import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QuickHubTab,
  ALL_QUICK_HUB_TABS,
  visibleQuickHubTabs,
  resolveQuickHubTab,
  quickHubBackLeavesAddList,
  PILL_WEIGHT_COMPACT,
  PILL_WEIGHT_EXPANDED,
  quickHubPillExpanded,
  quickHubPillWeight,
  quickHubShouldRecoverFocus,
  quickHubNeighbourTab,
  quickHubPillHandsBack,
  quickHubFocusAfterRemoval,
  QuickHubRecoveryTarget,
  QUICK_HUB_RECOVERY_FIRST_DELAY_MS,
  QUICK_HUB_RECOVERY_RETRY_MS,
  QUICK_HUB_RECOVERY_BODY_ATTEMPTS,
  QUICK_HUB_RECOVERY_ATTEMPTS,
  quickHubRecoveryTarget,
  QuickHubRecoveryLimiter,
} from '../src/runtime/quickHubLogic.js';

test('visibleQuickHubTabs hides Friends when unavailable', () => {
  const withoutFriends = visibleQuickHubTabs(false);
  assert.deepEqual(withoutFriends, [
    QuickHubTab.NOW_PLAYING,
    QuickHubTab.NOTIFICATIONS,
    QuickHubTab.GROUP_WATCH,
  ]);

  const withFriends = visibleQuickHubTabs(true);
  assert.deepEqual(withFriends, [
    QuickHubTab.NOW_PLAYING,
    QuickHubTab.NOTIFICATIONS,
    QuickHubTab.GROUP_WATCH,
    QuickHubTab.FRIENDS,
  ]);
});

test('resolveQuickHubTab falls back to NOW_PLAYING if tab is hidden', () => {
  assert.equal(resolveQuickHubTab(QuickHubTab.NOW_PLAYING, false), QuickHubTab.NOW_PLAYING);
  assert.equal(resolveQuickHubTab(QuickHubTab.FRIENDS, true), QuickHubTab.FRIENDS);
  assert.equal(resolveQuickHubTab(QuickHubTab.FRIENDS, false), QuickHubTab.NOW_PLAYING);
  assert.equal(resolveQuickHubTab('UNKNOWN_TAB', true), QuickHubTab.NOW_PLAYING);
});

test('quickHubBackLeavesAddList checks tab and adding flag', () => {
  assert.equal(quickHubBackLeavesAddList(QuickHubTab.FRIENDS, true), true);
  assert.equal(quickHubBackLeavesAddList(QuickHubTab.FRIENDS, false), false);
  assert.equal(quickHubBackLeavesAddList(QuickHubTab.NOW_PLAYING, true), false);
  assert.equal(quickHubBackLeavesAddList(QuickHubTab.NOTIFICATIONS, false), false);
});

test('quickHubPillExpanded and weight', () => {
  assert.equal(PILL_WEIGHT_COMPACT, 1);
  assert.equal(PILL_WEIGHT_EXPANDED, 2.2);
  assert.equal(quickHubPillExpanded(true), true);
  assert.equal(quickHubPillExpanded(false), false);
  assert.equal(quickHubPillWeight(true), 2.2);
  assert.equal(quickHubPillWeight(false), 1);
});

test('quickHubShouldRecoverFocus', () => {
  assert.equal(quickHubShouldRecoverFocus(true, false), true);
  assert.equal(quickHubShouldRecoverFocus(true, true), false);
  assert.equal(quickHubShouldRecoverFocus(false, false), false);
  assert.equal(quickHubShouldRecoverFocus(false, true), false);
});

test('quickHubNeighbourTab computes next and previous tabs', () => {
  const visible = visibleQuickHubTabs(true);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.NOW_PLAYING, 1), QuickHubTab.NOTIFICATIONS);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.NOW_PLAYING, -1), null);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.NOTIFICATIONS, 1), QuickHubTab.GROUP_WATCH);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.NOTIFICATIONS, -1), QuickHubTab.NOW_PLAYING);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.FRIENDS, 1), null);
  assert.equal(quickHubNeighbourTab(visible, QuickHubTab.FRIENDS, -1), QuickHubTab.GROUP_WATCH);
  assert.equal(quickHubNeighbourTab(visible, 'MISSING', 1), null);
  assert.equal(quickHubNeighbourTab(null, QuickHubTab.NOW_PLAYING, 1), null);
});

test('quickHubPillHandsBack', () => {
  assert.equal(quickHubPillHandsBack(QuickHubTab.NOW_PLAYING, QuickHubTab.NOW_PLAYING), false);
  assert.equal(quickHubPillHandsBack(QuickHubTab.NOW_PLAYING, QuickHubTab.FRIENDS), true);
  assert.equal(quickHubPillHandsBack(QuickHubTab.FRIENDS, QuickHubTab.NOW_PLAYING), true);
});

test('quickHubFocusAfterRemoval', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(quickHubFocusAfterRemoval(list, 'b'), 'c');
  assert.equal(quickHubFocusAfterRemoval(list, 'c'), 'b');
  assert.equal(quickHubFocusAfterRemoval(list, 'a'), 'b');
  assert.equal(quickHubFocusAfterRemoval(list, 'missing'), null);
  assert.equal(quickHubFocusAfterRemoval(['only'], 'only'), null);
  assert.equal(quickHubFocusAfterRemoval(null, 'a'), null);
});

test('quickHubRecovery constants and targets', () => {
  assert.equal(QUICK_HUB_RECOVERY_FIRST_DELAY_MS, 120);
  assert.equal(QUICK_HUB_RECOVERY_RETRY_MS, 60);
  assert.equal(QUICK_HUB_RECOVERY_BODY_ATTEMPTS, 6);
  assert.equal(QUICK_HUB_RECOVERY_ATTEMPTS, 8);

  for (let i = 0; i < 6; i++) {
    assert.equal(quickHubRecoveryTarget(i), QuickHubRecoveryTarget.BODY);
  }
  assert.equal(quickHubRecoveryTarget(6), QuickHubRecoveryTarget.SELECTED_PILL);
  assert.equal(quickHubRecoveryTarget(7), QuickHubRecoveryTarget.SELECTED_PILL);
});

test('QuickHubRecoveryLimiter enforces rate limit window', () => {
  const limiter = new QuickHubRecoveryLimiter(3, 1000);
  assert.equal(limiter.tryAcquire(100), true);
  assert.equal(limiter.tryAcquire(200), true);
  assert.equal(limiter.tryAcquire(300), true);
  assert.equal(limiter.tryAcquire(400), false);
  assert.equal(limiter.tryAcquire(1099), false);
  assert.equal(limiter.tryAcquire(1101), true);
});
