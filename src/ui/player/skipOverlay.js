// Floating Skip Intro / Skip Credits prompt card with 15-second countdown.
import { SKIP_PROMPT_SECONDS, activeSkipSegment } from '../../runtime/skipSegments.js';
import { RemoteKey } from '../../input/remote.js';

export class SkipOverlay {
  constructor(options = {}) {
    this.options = options;
    this.parentEl = options.parentEl || null;
    this.onSkip = options.onSkip || null;
    this.onDismiss = options.onDismiss || null;

    this.container = null;
    this.activeSegment = null;
    this.countdown = options.countdownSeconds || SKIP_PROMPT_SECONDS;
    this.countdownTimer = null;
    this.dismissedSegments = new Set();
  }

  mount(parentEl) {
    this.parentEl = parentEl;
  }

  show(segment) {
    if (!segment || !this.parentEl) return;
    if (this.dismissedSegments.has(`${segment.kind}:${segment.target}`)) return;

    this.activeSegment = segment;
    this.countdown = this.options.countdownSeconds || SKIP_PROMPT_SECONDS;

    if (!this.container) {
      this.container = document.createElement('button');
      this.container.className = 'jellio-player-skip-prompt';
      this.container.setAttribute('data-focusable', 'true');
      this.container.id = 'jellio-skip-btn';
      this.container.addEventListener('click', () => this.triggerSkip());
      this.parentEl.appendChild(this.container);
    }

    this.updateLabel();
    this.startCountdown();
  }

  updateLabel() {
    if (!this.container || !this.activeSegment) return;
    const kindLabel = this.activeSegment.kind === 'intro' ? 'Skip Intro' : 'Skip Credits';
    this.container.textContent = `${kindLabel} (${this.countdown})`;
  }

  startCountdown() {
    this.clearCountdown();
    this.countdownTimer = setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        this.dismiss(true);
      } else {
        this.updateLabel();
      }
    }, 1000);
  }

  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  dismiss(remember = false) {
    if (remember && this.activeSegment) {
      this.dismissedSegments.add(`${this.activeSegment.kind}:${this.activeSegment.target}`);
    }
    this.clearCountdown();
    this.activeSegment = null;
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    if (typeof this.onDismiss === 'function') {
      this.onDismiss();
    }
  }

  triggerSkip() {
    if (!this.activeSegment) return;
    const targetSeconds = this.activeSegment.target;
    this.dismiss(true);
    if (typeof this.onSkip === 'function') {
      this.onSkip(targetSeconds);
    }
  }

  updatePlaybackTime(currentTimeSeconds, segments) {
    const currentActive = activeSkipSegment(segments, currentTimeSeconds);

    if (!currentActive) {
      if (this.activeSegment) {
        this.dismiss(false);
      }
      return;
    }

    const key = `${currentActive.kind}:${currentActive.target}`;
    if (this.dismissedSegments.has(key)) return;

    if (!this.activeSegment) {
      this.show(currentActive);
    } else if (
      this.activeSegment.kind !== currentActive.kind ||
      Math.abs(this.activeSegment.target - currentActive.target) > 1
    ) {
      this.dismiss(false);
      this.show(currentActive);
    }
  }

  handleKey(normalizedKey) {
    if (!this.container || !this.activeSegment) return false;

    if (normalizedKey === RemoteKey.GREEN || normalizedKey === RemoteKey.FAST_FORWARD) {
      this.triggerSkip();
      return true;
    }
    return false;
  }

  destroy() {
    this.dismiss(false);
    this.dismissedSegments.clear();
  }
}
