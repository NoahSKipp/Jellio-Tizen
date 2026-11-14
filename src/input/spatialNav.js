export const Direction = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
});

let currentFocusedElement = null;
const focusTrapStack = [];
const savedFocusMap = new Map();

export function getCurrentFocused() {
  return currentFocusedElement;
}

export function saveFocusState(key) {
  if (!key || !currentFocusedElement) return;
  savedFocusMap.set(key, currentFocusedElement);
}

export function restoreFocusState(key) {
  if (!key) return false;
  const target = savedFocusMap.get(key);
  if (target && document.contains(target) && isElementFocusable(target)) {
    focusElement(target);
    return true;
  }
  return false;
}

export function isElementFocusable(el) {
  if (!el) return false;
  if (typeof HTMLElement !== 'undefined' && !(el instanceof HTMLElement)) return false;
  if (el.getAttribute('data-focusable') !== 'true') return false;
  if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.offsetParent === null && el.style && el.style.position !== 'fixed' && el.style.position !== undefined) return false;
  return true;
}

export function getActiveFocusTrap() {
  if (focusTrapStack.length === 0) return null;
  return focusTrapStack[focusTrapStack.length - 1];
}

export function pushFocusTrap(container, onBack = null) {
  if (!container) return;
  focusTrapStack.push({
    container,
    onBack,
    previousFocused: currentFocusedElement,
  });
  container.setAttribute('data-focus-trap', 'true');
  focusFirstIn(container);
}

export function popFocusTrap(container = null) {
  if (focusTrapStack.length === 0) return null;
  const trap = (container && focusTrapStack[focusTrapStack.length - 1].container === container)
    ? focusTrapStack.pop()
    : focusTrapStack.pop();

  if (trap && trap.container) {
    trap.container.removeAttribute('data-focus-trap');
    if (trap.previousFocused && document.contains(trap.previousFocused) && isElementFocusable(trap.previousFocused)) {
      focusElement(trap.previousFocused);
    }
  }
  return trap;
}

export function focusElement(el, { smoothScroll = true } = {}) {
  if (!el || !isElementFocusable(el)) return false;

  if (currentFocusedElement && currentFocusedElement !== el) {
    currentFocusedElement.classList.remove('jellio-focused');
    currentFocusedElement.blur();
  }

  currentFocusedElement = el;
  el.classList.add('jellio-focused');
  el.focus({ preventScroll: true });

  const group = typeof el.closest === 'function' ? el.closest('[data-focus-group]') : null;
  if (group) {
    const groupId = group.getAttribute('data-focus-group');
    if (groupId) {
      savedFocusMap.set(`group:${groupId}`, el);
    }
  }

  bringIntoView(el, { smooth: smoothScroll });
  return true;
}

export function focusFirstIn(container) {
  if (!container) return false;
  const focusables = Array.from(container.querySelectorAll('[data-focusable="true"]'))
    .filter(isElementFocusable);
  if (focusables.length > 0) {
    return focusElement(focusables[0]);
  }
  return false;
}

export function moveFocus(direction) {
  const current = currentFocusedElement;
  const activeTrap = getActiveFocusTrap();
  const scope = activeTrap ? activeTrap.container : document.body;

  const candidates = Array.from(scope.querySelectorAll('[data-focusable="true"]'))
    .filter((el) => isElementFocusable(el) && el !== current);

  if (!current || !document.contains(current)) {
    return focusFirstIn(scope);
  }

  const currentRect = current.getBoundingClientRect();
  let bestCandidate = null;
  let minDistance = Infinity;

  for (const candidate of candidates) {
    const candRect = candidate.getBoundingClientRect();

    if (!isInDirection(currentRect, candRect, direction)) {
      continue;
    }

    const dist = calculateSpatialDistance(currentRect, candRect, direction);
    if (dist < minDistance) {
      minDistance = dist;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    return focusElement(bestCandidate);
  }

  return false;
}

function isInDirection(curr, cand, direction) {
  const threshold = 4;
  switch (direction) {
    case Direction.UP:
      return cand.bottom <= curr.top + threshold;
    case Direction.DOWN:
      return cand.top >= curr.bottom - threshold;
    case Direction.LEFT:
      return cand.right <= curr.left + threshold;
    case Direction.RIGHT:
      return cand.left >= curr.right - threshold;
    default:
      return false;
  }
}

function calculateSpatialDistance(curr, cand, direction) {
  const currCenterX = curr.left + curr.width / 2;
  const currCenterY = curr.top + curr.height / 2;
  const candCenterX = cand.left + cand.width / 2;
  const candCenterY = cand.top + cand.height / 2;

  let primaryDist = 0;
  let secondaryDist = 0;

  if (direction === Direction.UP) {
    primaryDist = Math.max(0, curr.top - cand.bottom);
    secondaryDist = Math.abs(currCenterX - candCenterX);
  } else if (direction === Direction.DOWN) {
    primaryDist = Math.max(0, cand.top - curr.bottom);
    secondaryDist = Math.abs(currCenterX - candCenterX);
  } else if (direction === Direction.LEFT) {
    primaryDist = Math.max(0, curr.left - cand.right);
    secondaryDist = Math.abs(currCenterY - candCenterY);
  } else if (direction === Direction.RIGHT) {
    primaryDist = Math.max(0, cand.left - curr.right);
    secondaryDist = Math.abs(currCenterY - candCenterY);
  }

  return primaryDist * 1.5 + secondaryDist;
}

export function bringIntoView(el, { smooth = true } = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function' || typeof el.closest !== 'function') return;

  const rowTrack = el.closest('.jellio-row-track, [data-scroll-orientation="horizontal"]');
  if (rowTrack) {
    scrollHorizontalTrack(rowTrack, el, smooth);
  }

  const verticalScroll = el.closest('.jellio-content, .jellio-screen-scroll, [data-scroll-orientation="vertical"]');
  if (verticalScroll) {
    scrollVerticalContainer(verticalScroll, el, smooth);
  }
}

function scrollHorizontalTrack(track, el, smooth) {
  const trackRect = track.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const leadingPx = 48;
  const offset = elRect.left - trackRect.left;
  const targetScroll = track.scrollLeft + (offset - leadingPx);

  track.scrollTo({
    left: Math.max(0, targetScroll),
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function scrollVerticalContainer(container, el, smooth) {
  const cRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  const margin = Math.min(120, Math.max(60, cRect.height * 0.12));

  if (elRect.top < cRect.top + margin) {
    const diff = (cRect.top + margin) - elRect.top;
    container.scrollBy({
      top: -diff,
      behavior: smooth ? 'smooth' : 'auto',
    });
  } else if (elRect.bottom > cRect.bottom - margin) {
    const diff = elRect.bottom - (cRect.bottom - margin);
    container.scrollBy({
      top: diff,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
}

export function initSpatialNav() {
  currentFocusedElement = null;
  focusTrapStack.length = 0;
  savedFocusMap.clear();

  document.addEventListener('click', (e) => {
    const focusable = e.target.closest('[data-focusable="true"]');
    if (focusable && isElementFocusable(focusable)) {
      focusElement(focusable);
    }
  });

  const initial = document.querySelector('[data-focusable="true"]');
  if (initial && isElementFocusable(initial)) {
    focusElement(initial);
  }
}
