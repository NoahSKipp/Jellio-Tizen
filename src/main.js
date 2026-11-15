import { RemoteInputEngine, RemoteKey } from './input/remote.js';
import {
  initSpatialNav,
  moveFocus,
  focusFirstIn,
  getCurrentFocused,
  popFocusTrap,
  Direction,
} from './input/spatialNav.js';
import { router, Route, RouteName, isImmersive } from './ui/router.js';
import { SidebarNav } from './ui/nav/sidebar.js';
import { QuickHubDrawer } from './ui/quickhub/quickHubDrawer.js';
import { AccountSwitcherOverlay } from './ui/overlays/accountSwitcher.js';
import { ChangelogPopup } from './ui/overlays/changelogPopup.js';
import { OnboardingOverlay } from './ui/overlays/onboardingOverlay.js';
import { StreamPickerOverlay } from './ui/overlays/streamPicker.js';
import { showToast, showAnnouncementToast } from './ui/overlays/toasts.js';
import { DisplayPreferences, ChangelogPrefs, OnboardingPrefs } from './data/prefs.js';
import { getSession, clearSession } from './data/session.js';
import {
  getLibraryNavEntries,
  getUserImageUrl,
  getPlaybackInfo,
  searchItems,
  updateLanguagePreferences,
} from './data/api.js';
import { nowPlayingManager, remoteControlManager } from './data/nowplaying.js';
import { friendsRepository } from './data/friends.js';
import { CURRENT_CHANGELOG } from './ui/changelog/changelog.js';

import { LoginScreen } from './ui/screens/login.js';
import { HomeScreen } from './ui/screens/home.js';
import { DetailScreen } from './ui/screens/detail.js';
import { PersonScreen } from './ui/screens/person.js';
import { LibraryScreen } from './ui/screens/library.js';
import { ServiceScreen } from './ui/screens/service.js';
import { ProfileScreen } from './ui/screens/profile.js';
import { SearchScreen } from './ui/screens/search.js';
import { FeedScreen } from './ui/screens/feed.js';
import { LiveTvScreen } from './ui/screens/liveTv.js';
import { SettingsScreen } from './ui/screens/settings.js';
import { PlayerScreen } from './ui/player/playerScreen.js';

class JellioTizenApp {
  constructor() {
    this.router = router;
    this.activeScreen = null;
    this.activePlayerScreen = null;
    this.isAuthenticated = false;

    this.sidebar = new SidebarNav({
      router: this.router,
      onOpenAccountSwitcher: () => this.openAccountSwitcher(),
    });

    this.quickHub = new QuickHubDrawer({
      router: this.router,
      onClose: () => {
        this.inputEngine.isQuickHubOpen = false;
      },
      onHandoff: (sess) => {
        const item = sess && (sess.NowPlayingItem || sess.Item);
        if (item && item.Id) {
          const posTicks =
            (sess.PlayState && sess.PlayState.PositionTicks) ||
            sess.PositionTicks ||
            null;
          this.router.push(Route.Player(item.Id, null, posTicks));
        }
      },
      onResumeLocal: () => {
        const paused = nowPlayingManager.localPaused;
        if (paused && paused.itemId) {
          this.router.push(Route.Player(paused.itemId, null, paused.positionTicks || 0));
        }
      },
      onDismissLocal: () => {
        nowPlayingManager.setLocalPaused(null);
      },
    });

    this.inputEngine = new RemoteInputEngine({
      onNavigate: (dirKey) => this.handleNavigation(dirKey),
      onSelect: () => this.handleSelect(),
      onLongSelect: () => this.handleLongSelect(),
      onBack: () => this.handleBack(),
      onPlayPause: (k) => this.handleMediaKey(k),
      onFastForward: () => this.handleMediaKey(RemoteKey.FAST_FORWARD),
      onRewind: () => this.handleMediaKey(RemoteKey.REWIND),
      onColorKey: (k) => this.handleColorKey(k),
      onQuickHub: () => this.toggleQuickHub(),
    });
  }

  init() {
    this.applyDisplayPreferences();
    this.mountAppShell();

    initSpatialNav();
    this.inputEngine.attach(window);

    this.bindBackgroundManagers();

    const session = getSession();
    if (session && session.accessToken && session.serverAddress) {
      this.onAuthenticated(session);
    } else {
      this.renderLoginGate();
    }
  }

  applyDisplayPreferences() {
    const root = document.documentElement;
    const overscan = DisplayPreferences.getOverscanPercent();
    const scale = DisplayPreferences.getUiScale();
    const overscanPx = Math.round(overscan * 10);

    root.style.setProperty('--jellio-overscan-x', `${overscanPx}px`);
    root.style.setProperty('--jellio-overscan-y', `${overscanPx}px`);
    root.style.setProperty('--jellio-ui-scale', `${scale}`);
  }

  mountAppShell() {
    const appRoot = document.getElementById('jellio-app-root');
    if (!appRoot) return;

    appRoot.innerHTML = '';

    // Mount collapsible SidebarNav overlay
    const sidebarEl = this.sidebar.render();
    appRoot.appendChild(sidebarEl);

    // Mount main screen container
    const mainScreen = document.createElement('main');
    mainScreen.className = 'jellio-screen';
    mainScreen.setAttribute('data-focus-group', 'screen');
    mainScreen.id = 'jellio-main-screen';

    // Content container where active screen renders
    const content = document.createElement('div');
    content.className = 'jellio-screen-scroll';
    content.setAttribute('data-scroll-orientation', 'vertical');
    content.id = 'jellio-screen-content';

    mainScreen.appendChild(content);
    appRoot.appendChild(mainScreen);

    // Subscribe to router navigation changes
    this.router.subscribe((route) => {
      if (!getSession()) {
        this.renderLoginGate();
        return;
      }
      this.sidebar.render();
      this.renderScreen(route);
    });
  }

  bindBackgroundManagers() {
    nowPlayingManager.subscribeSessions((sessions, activeCount) => {
      this.quickHub.updateData({
        sessions,
        localPaused: nowPlayingManager.localPaused,
      });
      if (this.activeScreen && this.activeScreen.topBar) {
        this.activeScreen.topBar.setNowPlayingState({
          activeCount,
          isLocalPlaying: Boolean(nowPlayingManager.localPaused),
        });
      }
    });

    nowPlayingManager.subscribeLocalPaused((localPaused) => {
      this.quickHub.updateData({
        sessions: nowPlayingManager.sessions,
        localPaused,
      });
      if (this.activeScreen && this.activeScreen.topBar) {
        this.activeScreen.topBar.setNowPlayingState({
          activeCount: nowPlayingManager.activeCount,
          isLocalPlaying: Boolean(localPaused),
        });
      }
    });

    friendsRepository.subscribe((snapshot, available) => {
      this.quickHub.setFriendsAvailable(available);
      const incoming = snapshot && Array.isArray(snapshot.IncomingRequests)
        ? snapshot.IncomingRequests
        : [];
      const friends = snapshot && Array.isArray(snapshot.Friends)
        ? snapshot.Friends
        : [];
      this.sidebar.setIncomingFriendRequests(incoming.length);
      this.quickHub.updateData({
        friends,
        incomingRequests: incoming,
      });
    });

    remoteControlManager.onPlay((cmd) => {
      if (cmd && cmd.itemId) {
        this.router.push(Route.Player(cmd.itemId, cmd.mediaSourceId, cmd.startPositionTicks || 0));
      }
    });
  }

  async onAuthenticated(session = getSession()) {
    if (!session) {
      this.renderLoginGate();
      return;
    }

    this.isAuthenticated = true;

    // Show sidebar and set avatar
    if (this.sidebar.container) {
      this.sidebar.container.style.display = 'flex';
    }
    const avatarUrl = getUserImageUrl(session.userId, session.avatarTag || null);
    this.sidebar.setUserAvatar(avatarUrl);
    this.sidebar.render();

    // Load dynamic library tabs for sidebar
    this.loadSidebarLibraries(session);

    // Start background polling for Now Playing & Friends
    nowPlayingManager.startPolling(session);
    remoteControlManager.reportCapabilities().catch(() => {});
    if (typeof friendsRepository.refresh === 'function') {
      friendsRepository.refresh().catch(() => {});
    }

    // Render current route (default Home)
    this.renderScreen(this.router.getCurrentRoute());

    // Check first-run onboarding and big-release changelog
    this.checkFirstRunOverlays(session);
  }

  async loadSidebarLibraries(session) {
    try {
      const libs = await getLibraryNavEntries(session.userId);
      if (Array.isArray(libs) && libs.length > 0) {
        this.sidebar.setLibraries(libs);
      }
    } catch (err) {
      console.warn('Failed to load library navigation entries:', err);
    }
  }

  destroyActiveScreens() {
    if (this.activePlayerScreen) {
      if (typeof this.activePlayerScreen.destroy === 'function') {
        this.activePlayerScreen.destroy();
      }
      this.activePlayerScreen = null;
    }
    if (this.activeScreen) {
      if (typeof this.activeScreen.destroy === 'function') {
        this.activeScreen.destroy();
      }
      this.activeScreen = null;
    }
  }

  renderLoginGate() {
    this.isAuthenticated = false;
    this.destroyActiveScreens();
    nowPlayingManager.stopPolling();

    const mainScreen = document.getElementById('jellio-main-screen');
    const content = document.getElementById('jellio-screen-content');
    if (!content) return;

    if (this.sidebar.container) {
      this.sidebar.container.style.display = 'none';
    }
    if (mainScreen) {
      mainScreen.classList.add('jellio-screen-full');
    }

    content.innerHTML = '';
    const loginScreen = new LoginScreen({
      onLoginSuccess: (sess) => {
        if (mainScreen) {
          mainScreen.classList.remove('jellio-screen-full');
        }
        this.router.switchTab(Route.Home());
        this.onAuthenticated(sess || getSession());
      },
    });
    this.activeScreen = loginScreen;
    loginScreen.render(content);
  }

  renderScreen(route) {
    const mainScreen = document.getElementById('jellio-main-screen');
    const content = document.getElementById('jellio-screen-content');
    if (!content) return;

    if (!getSession()) {
      this.renderLoginGate();
      return;
    }

    const immersive = isImmersive(route);
    if (this.sidebar.container) {
      this.sidebar.container.style.display = immersive ? 'none' : 'flex';
    }
    if (mainScreen) {
      if (immersive) {
        mainScreen.classList.add('jellio-screen-full');
      } else {
        mainScreen.classList.remove('jellio-screen-full');
      }
    }

    this.destroyActiveScreens();
    content.innerHTML = '';

    // 1. Player routes (VOD & Live TV)
    if (route.name === RouteName.PLAYER || route.name === RouteName.LIVE_PLAYER) {
      const targetItemId = route.name === RouteName.LIVE_PLAYER ? route.channelId : route.itemId;
      this.activePlayerScreen = new PlayerScreen({
        itemId: targetItemId,
        mediaSourceId: route.mediaSourceId || null,
        startPositionTicks: route.startPositionTicks || 0,
        isLive: route.name === RouteName.LIVE_PLAYER,
      });
      this.activePlayerScreen.render(
        content,
        targetItemId,
        route.mediaSourceId || null,
        route.startPositionTicks || 0
      );
      return;
    }

    // 2. Home Screen
    if (route.name === RouteName.HOME) {
      const homeScreen = new HomeScreen({
        editMode: Boolean(route.editMode),
        router: this.router,
        onOpenQuickHub: () => this.toggleQuickHub(),
        onServiceSelect: (serviceName) => this.router.push(Route.Service(serviceName)),
        onItemSelect: (item) => this.navigateToItem(item),
        onPlayItem: (item) => this.playItem(item),
      });
      this.activeScreen = homeScreen;
      homeScreen.render(content);
      return;
    }

    // 3. Detail Screen
    if (route.name === RouteName.DETAIL) {
      const detailScreen = new DetailScreen({
        itemId: route.itemId,
        onPlay: (target, opts) => this.playItem(target, opts),
        onChooseStream: (target) => this.openStreamPicker(target),
        onPlayTrailer: (trailer) => this.playTrailer(trailer),
        onNavigateToPerson: (personId) => this.router.push(Route.Person(personId)),
        onNavigateToDetail: (itemId) => this.router.push(Route.Detail(itemId)),
      });
      this.activeScreen = detailScreen;
      detailScreen.render(content, route.itemId);
      return;
    }

    // 4. Person Screen
    if (route.name === RouteName.PERSON) {
      const personScreen = new PersonScreen({
        personId: route.personId,
        onNavigateToItem: (idOrTitle) => this.navigateToCredit(idOrTitle),
      });
      this.activeScreen = personScreen;
      personScreen.render(content, route.personId);
      return;
    }

    // 5. Library Tab Screen
    if (route.name === RouteName.LIBRARY_TAB) {
      const libraryScreen = new LibraryScreen({
        libraryId: route.libraryId,
        libraryName: route.name,
        collectionType: route.collectionType,
        onItemSelect: (item) => this.navigateToItem(item),
      });
      this.activeScreen = libraryScreen;
      libraryScreen.render(content, route.libraryId);
      return;
    }

    // 6. Streaming Service Hub Screen
    if (route.name === RouteName.SERVICE) {
      const serviceScreen = new ServiceScreen({
        serviceName: route.name,
        onItemSelect: (item) => this.navigateToItem(item),
      });
      this.activeScreen = serviceScreen;
      serviceScreen.render(content, route.name);
      return;
    }

    // 7. User Profile Screen
    if (route.name === RouteName.PROFILE) {
      const profileScreen = new ProfileScreen({
        userId: route.userId,
        onFriendSelect: (uid) => this.router.push(Route.Profile(uid)),
        onItemSelect: (item) => this.navigateToItem(item),
      });
      this.activeScreen = profileScreen;
      profileScreen.render(content, route.userId);
      return;
    }

    // 8. Search Screen
    if (route.name === RouteName.SEARCH) {
      const searchScreen = new SearchScreen({
        onItemSelect: (item) => this.navigateToItem(item),
        onPersonSelect: (personId) => this.router.push(Route.Person(personId)),
      });
      this.activeScreen = searchScreen;
      searchScreen.render(content);
      return;
    }

    // 9. Activity Feed Screen
    if (route.name === RouteName.FEED) {
      const feedScreen = new FeedScreen({
        onItemSelect: (item) => this.navigateToItem(item),
        onUserSelect: (userId) => this.router.push(Route.Profile(userId)),
      });
      this.activeScreen = feedScreen;
      feedScreen.render(content);
      return;
    }

    // 10. Live TV & EPG Guide Screen
    if (route.name === RouteName.LIVE_TV) {
      const liveTvScreen = new LiveTvScreen({
        onChannelSelect: (channel) => {
          if (channel && channel.Id) {
            this.router.push(Route.LivePlayer(channel.Id));
          }
        },
      });
      this.activeScreen = liveTvScreen;
      liveTvScreen.render(content);
      return;
    }

    // 11. Settings Screen
    if (route.name === RouteName.SETTINGS) {
      const settingsScreen = new SettingsScreen({
        onCustomizeHome: () => {
          this.router.switchTab(Route.Home(true));
        },
        onToast: (msg) => {
          this.applyDisplayPreferences();
          showAnnouncementToast(msg);
        },
        onLogout: () => this.handleLogout(),
      });
      this.activeScreen = settingsScreen;
      settingsScreen.render(content);
      return;
    }

    // Fallback to Home
    this.router.switchTab(Route.Home());
  }

  navigateToItem(item) {
    if (!item) return;
    const itemId = item.Id || item.ItemId;
    if (itemId) {
      this.router.push(Route.Detail(itemId));
    }
  }

  async navigateToCredit(idOrTitle) {
    if (!idOrTitle) return;
    const raw = String(idOrTitle).trim();
    // If it looks like a 32-char hex Jellyfin ID or UUID, open Detail directly
    if (/^[0-9a-fA-F-]{32,36}$/.test(raw)) {
      this.router.push(Route.Detail(raw));
      return;
    }
    try {
      const matches = await searchItems(raw, 'Movie,Series', 5);
      if (Array.isArray(matches) && matches.length > 0 && matches[0].Id) {
        this.router.push(Route.Detail(matches[0].Id));
        return;
      }
    } catch (_) {}
    this.router.switchTab(Route.Search());
  }

  playItem(item, opts = {}) {
    if (!item) return;
    const itemId = item.Id || item.ItemId;
    if (!itemId) return;
    const startPositionTicks =
      opts.startPositionTicks !== undefined
        ? opts.startPositionTicks
        : (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
    const mediaSourceId = opts.mediaSourceId || null;
    this.router.push(Route.Player(itemId, mediaSourceId, startPositionTicks));
  }

  async openStreamPicker(item) {
    if (!item || !item.Id) return;
    try {
      const playbackInfo = await getPlaybackInfo(item.Id);
      const sources = (playbackInfo && playbackInfo.MediaSources) || item.MediaSources || [];
      const picker = new StreamPickerOverlay({
        item,
        sources,
        onSelect: (selectedSource) => {
          this.playItem(item, {
            mediaSourceId: selectedSource ? selectedSource.Id : null,
          });
        },
      });
      picker.show();
    } catch (err) {
      console.warn('Stream picker fallback to direct playback:', err);
      this.playItem(item);
    }
  }

  playTrailer(trailer) {
    if (!trailer) return;
    const url = trailer.Url || trailer.url;
    if (url) {
      showAnnouncementToast('Opening trailer...');
      window.open(url, '_blank');
    }
  }

  handleLogout() {
    clearSession();
    showToast('Signed out');
    this.renderLoginGate();
  }

  checkFirstRunOverlays(session = getSession()) {
    const userId = session ? session.userId : null;
    if (!userId) return;

    if (OnboardingPrefs.shouldShowOnboarding(userId)) {
      const onboarding = new OnboardingOverlay({
        userId,
        onSavePreferences: (audioLang, subLang) => {
          updateLanguagePreferences(audioLang, subLang).catch(() => {});
        },
        onComplete: () => {
          this.checkChangelog();
        },
      });
      onboarding.show();
    } else {
      this.checkChangelog();
    }
  }

  checkChangelog() {
    if (ChangelogPrefs.shouldShowChangelog(CURRENT_CHANGELOG.version)) {
      const popup = new ChangelogPopup({
        release: CURRENT_CHANGELOG,
      });
      popup.show();
    }
  }

  openAccountSwitcher() {
    const switcher = new AccountSwitcherOverlay({
      router: this.router,
      onSignOut: () => {
        this.handleLogout();
      },
    });
    switcher.show();
  }

  handleNavigation(dirKey) {
    let direction = Direction.RIGHT;
    if (dirKey === RemoteKey.UP) direction = Direction.UP;
    else if (dirKey === RemoteKey.DOWN) direction = Direction.DOWN;
    else if (dirKey === RemoteKey.LEFT) direction = Direction.LEFT;
    else if (dirKey === RemoteKey.RIGHT) direction = Direction.RIGHT;

    moveFocus(direction);
  }

  handleSelect() {
    const focused = getCurrentFocused();
    if (focused) {
      focused.click();
    }
  }

  handleLongSelect() {
    const focused = getCurrentFocused();
    if (focused && typeof focused._triggerCardOptions === 'function') {
      focused._triggerCardOptions();
    }
  }

  handleBack() {
    const overlayRoot = document.getElementById('jellio-overlay-root');
    if (overlayRoot && overlayRoot.children.length > 0) {
      popFocusTrap();
      const last = overlayRoot.lastElementChild;
      if (last) last.remove();
      return;
    }

    if (this.quickHub.isOpen) {
      this.quickHub.close();
      return;
    }

    if (this.activePlayerScreen) {
      const handled = this.activePlayerScreen.handleRemoteKey(RemoteKey.BACK);
      if (handled) return;
    }

    // If on Home in editMode, exit editMode first
    const currentRoute = this.router.getCurrentRoute();
    if (currentRoute && currentRoute.name === RouteName.HOME && currentRoute.editMode) {
      this.router.replace(Route.Home(false));
      return;
    }

    // If focus is in screen content on a top-level tab, pressing BACK moves focus to sidebar (matching Jellio-TV)
    if (this.isAuthenticated && this.router.getRouteStack().length === 1 && !isImmersive(currentRoute)) {
      const focused = getCurrentFocused();
      if (focused && this.sidebar.container && !this.sidebar.container.contains(focused)) {
        this.sidebar.focusSelected();
        return;
      }
    }

    this.router.handleBack();
  }

  handleMediaKey(key) {
    if (this.activePlayerScreen) {
      this.activePlayerScreen.handleRemoteKey(key);
    }
  }

  handleColorKey(key) {
    if (this.activePlayerScreen) {
      this.activePlayerScreen.handleRemoteKey(key);
    }
  }

  toggleQuickHub() {
    if (!this.isAuthenticated) return;
    if (this.quickHub.isOpen) {
      this.quickHub.close();
    } else {
      this.inputEngine.isQuickHubOpen = true;
      this.quickHub.open();
    }
  }
}

export { JellioTizenApp };

if (typeof window !== 'undefined') {
  const app = new JellioTizenApp();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}
