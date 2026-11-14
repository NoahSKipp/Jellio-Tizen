import test from 'node:test';
import assert from 'node:assert/strict';
import { Route, RouteName, isImmersive, routesEqual, Router } from '../src/ui/router.js';
import { sourceResolutionLabel, sourceAudioLabel, sourceBitrateLabel } from '../src/ui/overlays/streamPicker.js';
import { isBigRelease, CHANGELOG_RELEASES, CURRENT_CHANGELOG } from '../src/ui/changelog/changelog.js';

test('Router navigation stack operations', () => {
  const router = new Router(Route.Home());

  assert.equal(router.getCurrentRoute().name, RouteName.HOME);
  assert.equal(router.getRouteStack().length, 1);

  // push
  router.push(Route.Search());
  assert.equal(router.getCurrentRoute().name, RouteName.SEARCH);
  assert.equal(router.getRouteStack().length, 2);

  router.push(Route.Detail('item-123'));
  assert.equal(router.getCurrentRoute().name, RouteName.DETAIL);
  assert.equal(router.getCurrentRoute().itemId, 'item-123');
  assert.equal(router.getRouteStack().length, 3);

  // replace
  router.replace(Route.Person('person-456'));
  assert.equal(router.getCurrentRoute().name, RouteName.PERSON);
  assert.equal(router.getCurrentRoute().personId, 'person-456');
  assert.equal(router.getRouteStack().length, 3);

  // pop
  const popped = router.pop();
  assert.equal(popped.name, RouteName.PERSON);
  assert.equal(router.getCurrentRoute().name, RouteName.SEARCH);
  assert.equal(router.getRouteStack().length, 2);

  // switchTab
  router.switchTab(Route.Settings());
  assert.equal(router.getCurrentRoute().name, RouteName.SETTINGS);
  assert.equal(router.getRouteStack().length, 1);

  // pop at root does not drop below 1
  assert.equal(router.pop(), null);
  assert.equal(router.getRouteStack().length, 1);
});

test('Router isImmersive checks', () => {
  assert.equal(isImmersive(Route.Home()), false);
  assert.equal(isImmersive(Route.Search()), false);
  assert.equal(isImmersive(Route.Settings()), false);
  assert.equal(isImmersive(Route.Detail('123')), false);
  assert.equal(isImmersive(Route.Player('123')), true);
  assert.equal(isImmersive(Route.LivePlayer('channel-1')), true);
});

test('Router routesEqual checks', () => {
  assert.equal(routesEqual(Route.Home(false), Route.Home(false)), true);
  assert.equal(routesEqual(Route.Home(true), Route.Home(false)), false);
  assert.equal(routesEqual(Route.Detail('a'), Route.Detail('a')), true);
  assert.equal(routesEqual(Route.Detail('a'), Route.Detail('b')), false);
  assert.equal(routesEqual(Route.Player('a', 's1'), Route.Player('a', 's1')), true);
  assert.equal(routesEqual(Route.Player('a', 's1'), Route.Player('a', 's2')), false);
});

test('StreamPicker format helpers', () => {
  const source4k = {
    MediaStreams: [
      { Type: 'Video', Height: 2160, BitRate: 15400000 },
      { Type: 'Audio', Codec: 'aac', Channels: 6 },
    ],
  };
  assert.equal(sourceResolutionLabel(source4k), '4K');
  assert.equal(sourceAudioLabel(source4k), 'AAC 6ch');
  assert.equal(sourceBitrateLabel(source4k), '15.4 Mbps');

  const source1080p = {
    MediaStreams: [
      { Type: 'Video', Height: 1080, BitRate: 8000000 },
      { Type: 'Audio', Codec: 'ac3', Channels: 2 },
    ],
  };
  assert.equal(sourceResolutionLabel(source1080p), '1080p');
  assert.equal(sourceAudioLabel(source1080p), 'AC3 2ch');
  assert.equal(sourceBitrateLabel(source1080p), '8.0 Mbps');
});

test('Changelog version helpers', () => {
  assert.equal(isBigRelease('1.0.0'), true);
  assert.equal(isBigRelease('0.80.0'), true);
  assert.equal(isBigRelease('1.1.0'), true);
  assert.equal(isBigRelease('1.1.1'), false);
  assert.equal(isBigRelease('0.43.2'), false);
  assert.equal(Array.isArray(CHANGELOG_RELEASES), true);
  assert.equal(CURRENT_CHANGELOG.version, '0.84.0');
});
