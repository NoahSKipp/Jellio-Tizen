import test from 'node:test';
import assert from 'node:assert/strict';

test('Verify all screen modules, showcase, OSK, and main app load and export constructors', async () => {
  const loginModule = await import('../src/ui/screens/login.js');
  assert.equal(typeof loginModule.LoginScreen, 'function');

  const homeModule = await import('../src/ui/screens/home.js');
  assert.equal(typeof homeModule.HomeScreen, 'function');
  assert.ok(Array.isArray(homeModule.DEFAULT_ROW_KEYS));
  assert.ok(Array.isArray(homeModule.DEFAULT_HOME_ROW_SPECS));

  const detailModule = await import('../src/ui/screens/detail.js');
  assert.equal(typeof detailModule.DetailScreen, 'function');
  assert.equal(typeof detailModule.extractMediaTechBadges, 'function');

  const personModule = await import('../src/ui/screens/person.js');
  assert.equal(typeof personModule.PersonScreen, 'function');

  const libraryModule = await import('../src/ui/screens/library.js');
  assert.equal(typeof libraryModule.LibraryScreen, 'function');
  assert.ok(Array.isArray(libraryModule.SORT_ORDERS));

  const serviceModule = await import('../src/ui/screens/service.js');
  assert.equal(typeof serviceModule.ServiceScreen, 'function');
  assert.equal(typeof serviceModule.SERVICE_BRAND_COLORS, 'object');

  const profileModule = await import('../src/ui/screens/profile.js');
  assert.equal(typeof profileModule.ProfileScreen, 'function');
  assert.equal(typeof profileModule.RARITY_COLORS, 'object');

  const searchModule = await import('../src/ui/screens/search.js');
  assert.equal(typeof searchModule.SearchScreen, 'function');

  const feedModule = await import('../src/ui/screens/feed.js');
  assert.equal(typeof feedModule.FeedScreen, 'function');

  const liveTvModule = await import('../src/ui/screens/liveTv.js');
  assert.equal(typeof liveTvModule.LiveTvScreen, 'function');

  const settingsModule = await import('../src/ui/screens/settings.js');
  assert.equal(typeof settingsModule.SettingsScreen, 'function');

  const showcaseModule = await import('../src/ui/components/showcase.js');
  assert.equal(typeof showcaseModule.ShowcaseHost, 'function');
  assert.equal(typeof showcaseModule.renderHomeItemShowcase, 'function');

  const oskModule = await import('../src/ui/components/onScreenKeyboard.js');
  assert.equal(typeof oskModule.openOnScreenKeyboard, 'function');
  assert.equal(typeof oskModule.bindTvInput, 'function');

  const mainModule = await import('../src/main.js');
  assert.equal(typeof mainModule.JellioTizenApp, 'function');

  const changelogModule = await import('../src/ui/changelog/changelog.js');
  assert.equal(typeof changelogModule.isBigRelease, 'function');
  assert.ok(Array.isArray(changelogModule.CHANGELOG_RELEASES));
  assert.equal(changelogModule.isBigRelease('0.84.0'), true);
  assert.equal(changelogModule.isBigRelease('0.84.1'), false);
});

test('extractMediaTechBadges identifies resolution, HDR, and audio formats', async () => {
  const { extractMediaTechBadges } = await import('../src/ui/screens/detail.js');

  const sample4kDoviAtmos = {
    MediaStreams: [
      {
        Type: 'Video',
        Width: 3840,
        Height: 2160,
        Codec: 'hevc',
        VideoRange: 'DOVI',
        VideoRangeType: 'DOVI',
        DisplayTitle: '4K Dolby Vision',
      },
      {
        Type: 'Audio',
        Codec: 'truehd',
        Channels: 8,
        Title: 'English Dolby Atmos TrueHD',
        IsDefault: true,
      },
    ],
  };

  const badges = extractMediaTechBadges(sample4kDoviAtmos);
  assert.ok(badges.includes('4K UHD'));
  assert.ok(badges.includes('Dolby Vision'));
  assert.ok(badges.includes('HEVC'));
  assert.ok(badges.includes('Dolby Atmos'));
});
