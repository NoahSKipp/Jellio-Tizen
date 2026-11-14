import { RemoteInputEngine, RemoteKey } from './input/remote.js';
import {
  initSpatialNav,
  moveFocus,
  focusFirstIn,
  getCurrentFocused,
  pushFocusTrap,
  popFocusTrap,
  Direction,
} from './input/spatialNav.js';
import { router, Route, RouteName, isImmersive } from './ui/router.js';
import { SidebarNav } from './ui/nav/sidebar.js';
import { TopBar } from './ui/nav/topBar.js';
import { QuickHubDrawer } from './ui/quickhub/quickHubDrawer.js';
import { AccountSwitcherOverlay } from './ui/overlays/accountSwitcher.js';
import { ChangelogPopup } from './ui/overlays/changelogPopup.js';
import { OnboardingOverlay } from './ui/overlays/onboardingOverlay.js';
import { StreamPickerOverlay } from './ui/overlays/streamPicker.js';
import { showToast, showAnnouncement } from './ui/overlays/toasts.js';
import { renderPosterCard, CardAspectRatio } from './ui/components/posterCard.js';
import { DisplayPreferences, ChangelogPrefs, OnboardingPrefs } from './data/prefs.js';
import { getSession } from './data/session.js';
import { CURRENT_CHANGELOG } from './ui/changelog/changelog.js';
import { PlayerScreen } from './ui/player/playerScreen.js';

class JellioTizenApp {
  constructor() {
    this.router = router;
    this.sidebar = new SidebarNav({
      router: this.router,
      onOpenAccountSwitcher: () => this.openAccountSwitcher(),
    });
    this.topBar = new TopBar({
      router: this.router,
      onOpenNotifications: () => this.quickHub.open('NOTIFICATIONS'),
    });
    this.quickHub = new QuickHubDrawer({
      router: this.router,
      onClose: () => {
        this.inputEngine.isQuickHubOpen = false;
      },
      onHandoff: (sess) => {
        if (sess && sess.NowPlayingItem) {
          this.router.push(Route.Player(sess.NowPlayingItem.Id, null, sess.PlayState ? sess.PlayState.PositionTicks : null));
        }
      },
      onResumeLocal: () => {
        // Will be wired to playback manager
      },
    });

    this.activePlayerScreen = null;

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

    this.checkFirstRunOverlays();
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

    // Mount SidebarNav
    const sidebarEl = this.sidebar.render();
    appRoot.appendChild(sidebarEl);

    // Mount main screen container
    const mainScreen = document.createElement('main');
    mainScreen.className = 'jellio-screen';
    mainScreen.setAttribute('data-focus-group', 'screen');
    mainScreen.id = 'jellio-main-screen';

    // Mount TopBar into mainScreen
    this.topBar.mount(mainScreen);

    // Content container
    const content = document.createElement('div');
    content.className = 'jellio-screen-scroll';
    content.setAttribute('data-scroll-orientation', 'vertical');
    content.id = 'jellio-screen-content';

    mainScreen.appendChild(content);
    appRoot.appendChild(mainScreen);

    // Router subscription to render screens
    this.router.subscribe((route) => {
      this.renderScreen(route);
    });

    // Render initial route
    this.renderScreen(this.router.getCurrentRoute());
  }

  renderScreen(route) {
    const content = document.getElementById('jellio-screen-content');
    if (!content) return;

    const immersive = isImmersive(route);
    if (this.sidebar.container) {
      this.sidebar.container.style.display = immersive ? 'none' : 'flex';
    }

    if (this.activePlayerScreen) {
      this.activePlayerScreen.destroy();
      this.activePlayerScreen = null;
    }

    if (route.name === RouteName.PLAYER) {
      content.innerHTML = '';
      this.activePlayerScreen = new PlayerScreen({
        itemId: route.itemId,
        mediaSourceId: route.mediaSourceId,
        startPositionTicks: route.startPositionTicks,
      });
      this.activePlayerScreen.render(content, route.itemId, route.mediaSourceId, route.startPositionTicks);
      return;
    }

    if (route.name === RouteName.HOME) {
      content.innerHTML = `
        <section class="jellio-hero-banner">
          <div class="jellio-hero-scrim"></div>
          <div class="jellio-hero-content">
            <h1 class="jellio-title-hero">Jellio TV</h1>
            <p class="jellio-text-muted">Welcome to the native Samsung Tizen TV client for Jellio.</p>
            <div class="jellio-hero-buttons">
              <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="hero-play-btn">Play</button>
              <button class="jellio-btn" data-focusable="true" id="hero-details-btn">Details</button>
            </div>
          </div>
        </section>

        <div class="jellio-row-container">
          <h2 class="jellio-row-title">Continue Watching</h2>
          <div class="jellio-row-track" data-scroll-orientation="horizontal" id="home-continue-track"></div>
        </div>
      `;

      const track = content.querySelector('#home-continue-track');
      if (track) {
        const dummyItem = {
          Id: 'demo-item-1',
          Name: 'Episode 1',
          SeriesName: 'Season 1',
          CommunityRating: 8.4,
          RunTimeTicks: 24000000000,
          UserData: { PlaybackPositionTicks: 10800000000, IsFavorite: false, Played: false },
        };
        const card = renderPosterCard(dummyItem, {
          aspectRatio: CardAspectRatio.LANDSCAPE,
          onSelect: (it) => {
            showToast(`Selected: ${it.Name}`);
          },
        });
        track.appendChild(card);
      }
    } else {
      content.innerHTML = `
        <div style="padding: 60px 48px;">
          <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 12px;">${route.name}</h1>
          <p style="color: var(--jellio-text-secondary); font-size: 16px;">Screen view for ${route.name}</p>
        </div>
      `;
    }

    focusFirstIn(content);
  }

  checkFirstRunOverlays() {
    const session = getSession();
    const userId = session ? session.userId : null;

    if (userId && OnboardingPrefs.shouldShowOnboarding(userId)) {
      const onboarding = new OnboardingOverlay({
        userId,
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
        showToast('Signed out');
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
