// 10-foot TV route stack and navigation controller.

export const RouteName = Object.freeze({
  HOME: 'Home',
  PROFILE: 'Profile',
  SEARCH: 'Search',
  FEED: 'Feed',
  LIBRARY_TAB: 'LibraryTab',
  SETTINGS: 'Settings',
  DETAIL: 'Detail',
  PERSON: 'Person',
  SERVICE: 'Service',
  PLAYER: 'Player',
  LIVE_TV: 'LiveTv',
  LIVE_PLAYER: 'LivePlayer',
});

export const Route = {
  Home(editMode = false) {
    return { name: RouteName.HOME, editMode: Boolean(editMode) };
  },
  Profile(userId = null) {
    return { name: RouteName.PROFILE, userId: userId ? String(userId) : null };
  },
  Search() {
    return { name: RouteName.SEARCH };
  },
  Feed() {
    return { name: RouteName.FEED };
  },
  LibraryTab(libraryId, name, collectionType = null) {
    return {
      name: RouteName.LIBRARY_TAB,
      libraryId: String(libraryId),
      name: String(name || ''),
      collectionType: collectionType ? String(collectionType) : null,
    };
  },
  Settings() {
    return { name: RouteName.SETTINGS };
  },
  Detail(itemId) {
    return { name: RouteName.DETAIL, itemId: String(itemId) };
  },
  Person(personId) {
    return { name: RouteName.PERSON, personId: String(personId) };
  },
  Service(name) {
    return { name: RouteName.SERVICE, name: String(name) };
  },
  Player(itemId, mediaSourceId = null, startPositionTicks = null) {
    return {
      name: RouteName.PLAYER,
      itemId: String(itemId),
      mediaSourceId: mediaSourceId ? String(mediaSourceId) : null,
      startPositionTicks: startPositionTicks !== null && startPositionTicks !== undefined ? Number(startPositionTicks) : null,
    };
  },
  LiveTv() {
    return { name: RouteName.LIVE_TV };
  },
  LivePlayer(channelId) {
    return { name: RouteName.LIVE_PLAYER, channelId: String(channelId) };
  },
};

export function isImmersive(route) {
  if (!route) return false;
  return route.name === RouteName.PLAYER || route.name === RouteName.LIVE_PLAYER;
}

export function routesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.name !== b.name) return false;

  switch (a.name) {
    case RouteName.HOME:
      return Boolean(a.editMode) === Boolean(b.editMode);
    case RouteName.PROFILE:
      return a.userId === b.userId;
    case RouteName.LIBRARY_TAB:
      return a.libraryId === b.libraryId && a.name === b.name;
    case RouteName.DETAIL:
      return a.itemId === b.itemId;
    case RouteName.PERSON:
      return a.personId === b.personId;
    case RouteName.SERVICE:
      return a.name === b.name;
    case RouteName.PLAYER:
      return a.itemId === b.itemId && a.mediaSourceId === b.mediaSourceId;
    case RouteName.LIVE_PLAYER:
      return a.channelId === b.channelId;
    default:
      return true;
  }
}

export class Router {
  constructor(initialRoute = Route.Home()) {
    this.stack = [initialRoute];
    this.listeners = new Set();
    this.exitHandler = null;
  }

  getCurrentRoute() {
    return this.stack[this.stack.length - 1] || Route.Home();
  }

  getRouteStack() {
    return [...this.stack];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const current = this.getCurrentRoute();
    const stackCopy = this.getRouteStack();
    for (const listener of this.listeners) {
      try {
        listener(current, stackCopy);
      } catch (err) {
        console.error('Router listener error:', err);
      }
    }
  }

  push(route) {
    if (!route) return;
    this.stack.push(route);
    this.notify();
  }

  replace(route) {
    if (!route) return;
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1] = route;
    } else {
      this.stack.push(route);
    }
    this.notify();
  }

  pop() {
    if (this.stack.length > 1) {
      const popped = this.stack.pop();
      this.notify();
      return popped;
    }
    return null;
  }

  switchTab(route) {
    if (!route) return;
    this.stack = [route];
    this.notify();
  }

  setExitHandler(handler) {
    this.exitHandler = handler;
  }

  handleBack() {
    if (this.stack.length > 1) {
      this.pop();
      return true;
    }

    if (typeof this.exitHandler === 'function') {
      const handled = this.exitHandler();
      if (handled) return true;
    }

    // Attempt Tizen app hide/minimize
    try {
      if (typeof tizen !== 'undefined' && tizen.application) {
        const app = tizen.application.getCurrentApplication();
        if (app && typeof app.hide === 'function') {
          app.hide();
          return true;
        }
      }
    } catch (_) {}

    return false;
  }
}

export const router = new Router();
