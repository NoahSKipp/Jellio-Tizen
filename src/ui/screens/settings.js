// Settings screen with two-pane layout: Display/Overscan, Playback, Subtitles, Audio, Home, Quick Hub, Friends, and About.
import {
  DisplayPreferences,
  PlayerPrefs,
  QuickHubPrefs,
  HomeRowPreferences,
} from '../../data/prefs.js';
import { getSession, clearSession } from '../../data/session.js';
import { setProfilePrivacy, getProfileSettings, updateLanguagePreferences } from '../../data/api.js';
import { CHANGELOG_RELEASES, CURRENT_CHANGELOG } from '../changelog/changelog.js';
import { focusFirstIn, focusElement, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';

const SETTINGS_CATEGORIES = [
  { id: 'display', label: 'Display & Overscan' },
  { id: 'playback', label: 'Playback' },
  { id: 'subtitles', label: 'Subtitles & Style' },
  { id: 'audio', label: 'Audio & Languages' },
  { id: 'home', label: 'Home Screen' },
  { id: 'quickhub', label: 'Quick Hub Shortcuts' },
  { id: 'friends', label: 'Friends & Privacy' },
  { id: 'about', label: 'About & What\'s New' },
];

export class SettingsScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.activeCategory = 'display';
  }

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="settings-screen">
        <div class="jellio-settings-layout">
          <div class="jellio-settings-sidebar" id="settings-sidebar" data-focus-group="settings-sidebar"></div>
          <div class="jellio-settings-pane" id="settings-pane" data-focus-group="settings-pane"></div>
        </div>
      </div>
    `;

    this.renderSidebar();
    this.renderCategoryPane(this.activeCategory);
    focusFirstIn(this.container.querySelector('#settings-sidebar'));
  }

  renderSidebar() {
    const sidebar = this.container.querySelector('#settings-sidebar');
    sidebar.innerHTML = `
      <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; padding-left: 12px; color: var(--jellio-text);">Settings</h2>
    `;

    SETTINGS_CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = `jellio-settings-nav-item ${cat.id === this.activeCategory ? 'jellio-focused' : ''}`;
      btn.setAttribute('data-focusable', 'true');
      btn.textContent = cat.label;

      btn.onclick = () => {
        this.activeCategory = cat.id;
        Array.from(sidebar.querySelectorAll('.jellio-settings-nav-item')).forEach((c) => c.classList.remove('jellio-focused'));
        btn.classList.add('jellio-focused');
        this.renderCategoryPane(cat.id);
      };

      sidebar.appendChild(btn);
    });
  }

  renderCategoryPane(catId) {
    const pane = this.container.querySelector('#settings-pane');
    pane.innerHTML = '';

    switch (catId) {
      case 'display':
        this.renderDisplayPane(pane);
        break;
      case 'playback':
        this.renderPlaybackPane(pane);
        break;
      case 'subtitles':
        this.renderSubtitlesPane(pane);
        break;
      case 'audio':
        this.renderAudioPane(pane);
        break;
      case 'home':
        this.renderHomePane(pane);
        break;
      case 'quickhub':
        this.renderQuickHubPane(pane);
        break;
      case 'friends':
        this.renderFriendsPane(pane);
        break;
      case 'about':
        this.renderAboutPane(pane);
        break;
    }
  }

  renderDisplayPane(pane) {
    const overscan = DisplayPreferences.getOverscanPercent();
    const uiScale = DisplayPreferences.getUiScale();
    const showClock = DisplayPreferences.getShowClock();
    const clock24h = DisplayPreferences.getClockUse24h();

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Display & Overscan</h1>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Overscan Calibration (${overscan}%)</label>
        <p style="font-size: 13px; color: var(--jellio-text-secondary);">Adjust safe area boundaries to fit your TV panel.</p>
        <div style="display: flex; gap: 12px; margin-top: 4px;">
          <button class="jellio-btn" data-focusable="true" id="btn-overscan-modal">Open Calibration Modal</button>
          <button class="jellio-btn" data-focusable="true" id="btn-overscan-dec">-1%</button>
          <button class="jellio-btn" data-focusable="true" id="btn-overscan-inc">+1%</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">UI Scale (${uiScale}x)</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn" data-focusable="true" id="btn-scale-09">0.9x</button>
          <button class="jellio-btn" data-focusable="true" id="btn-scale-10">1.0x (Default)</button>
          <button class="jellio-btn" data-focusable="true" id="btn-scale-11">1.1x</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Home Clock</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn" data-focusable="true" id="btn-toggle-clock">${showClock ? 'Clock: Visible' : 'Clock: Hidden'}</button>
          <button class="jellio-btn" data-focusable="true" id="btn-toggle-24h">${clock24h ? 'Format: 24h' : 'Format: 12h'}</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-overscan-modal').onclick = () => this.openOverscanModal();
    pane.querySelector('#btn-overscan-dec').onclick = () => {
      const cur = Math.max(0, DisplayPreferences.getOverscanPercent() - 1);
      DisplayPreferences.setOverscanPercent(cur);
      this.applyOverscanToRoot(cur);
      this.renderDisplayPane(pane);
    };
    pane.querySelector('#btn-overscan-inc').onclick = () => {
      const cur = Math.min(8, DisplayPreferences.getOverscanPercent() + 1);
      DisplayPreferences.setOverscanPercent(cur);
      this.applyOverscanToRoot(cur);
      this.renderDisplayPane(pane);
    };

    pane.querySelector('#btn-scale-09').onclick = () => {
      DisplayPreferences.setUiScale(0.9);
      document.documentElement.style.setProperty('--jellio-ui-scale', '0.9');
      this.renderDisplayPane(pane);
    };
    pane.querySelector('#btn-scale-10').onclick = () => {
      DisplayPreferences.setUiScale(1.0);
      document.documentElement.style.setProperty('--jellio-ui-scale', '1.0');
      this.renderDisplayPane(pane);
    };
    pane.querySelector('#btn-scale-11').onclick = () => {
      DisplayPreferences.setUiScale(1.1);
      document.documentElement.style.setProperty('--jellio-ui-scale', '1.1');
      this.renderDisplayPane(pane);
    };

    pane.querySelector('#btn-toggle-clock').onclick = () => {
      DisplayPreferences.setShowClock(!showClock);
      this.renderDisplayPane(pane);
    };
    pane.querySelector('#btn-toggle-24h').onclick = () => {
      DisplayPreferences.setClockUse24h(!clock24h);
      this.renderDisplayPane(pane);
    };
  }

  applyOverscanToRoot(percent) {
    const root = document.documentElement;
    const pxX = Math.round((1920 * (percent / 100)) / 2);
    const pxY = Math.round((1080 * (percent / 100)) / 2);
    root.style.setProperty('--jellio-overscan-x', `${pxX}px`);
    root.style.setProperty('--jellio-overscan-y', `${pxY}px`);
  }

  openOverscanModal() {
    const overlay = document.getElementById('jellio-overlay-root');
    if (!overlay) return;

    const modal = document.createElement('div');
    modal.className = 'jellio-card-dialog-scrim';
    modal.innerHTML = `
      <div class="jellio-card-dialog" style="min-width: 500px;" data-focus-group="overscan-modal">
        <div class="jellio-card-dialog-header">Overscan Calibration</div>
        <p style="padding: 12px 16px; font-size: 14px; color: var(--jellio-text-secondary); line-height: 1.5;">
          Adjust the overscan percentage until the edge border arrows touch your TV screen edges cleanly.
        </p>
        <div style="display: flex; justify-content: center; gap: 16px; padding: 12px 16px;">
          <button class="jellio-btn" data-focusable="true" id="modal-cal-dec">-1%</button>
          <div id="modal-cal-val" style="font-size: 20px; font-weight: 700; align-self: center;">${DisplayPreferences.getOverscanPercent()}%</div>
          <button class="jellio-btn" data-focusable="true" id="modal-cal-inc">+1%</button>
        </div>
        <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="modal-cal-done" style="margin: 12px 16px 8px; justify-content: center;">Done</button>
      </div>
    `;

    overlay.appendChild(modal);

    const valEl = modal.querySelector('#modal-cal-val');
    modal.querySelector('#modal-cal-dec').onclick = () => {
      const cur = Math.max(0, DisplayPreferences.getOverscanPercent() - 1);
      DisplayPreferences.setOverscanPercent(cur);
      valEl.textContent = `${cur}%`;
      this.applyOverscanToRoot(cur);
    };
    modal.querySelector('#modal-cal-inc').onclick = () => {
      const cur = Math.min(8, DisplayPreferences.getOverscanPercent() + 1);
      DisplayPreferences.setOverscanPercent(cur);
      valEl.textContent = `${cur}%`;
      this.applyOverscanToRoot(cur);
    };
    modal.querySelector('#modal-cal-done').onclick = () => {
      popFocusTrap(modal);
      modal.remove();
    };

    pushFocusTrap(modal, () => {
      popFocusTrap(modal);
      modal.remove();
    });
  }

  renderPlaybackPane(pane) {
    const preferReady = PlayerPrefs.getPreferReadySources();
    const autoSkip = PlayerPrefs.getAutoSkipIntro();
    const upNextSec = PlayerPrefs.getUpNextCountdownSeconds();

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Playback</h1>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Stream Source Preference</label>
        <p style="font-size: 13px; color: var(--jellio-text-secondary);">Prioritize ready/cached sources for faster start times.</p>
        <button class="jellio-btn" data-focusable="true" id="btn-toggle-ready">${preferReady ? 'Prefer Ready Sources: Enabled' : 'Prefer Ready Sources: Disabled'}</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Intro Skipper</label>
        <button class="jellio-btn" data-focusable="true" id="btn-toggle-autoskip">${autoSkip ? 'Auto-Skip Intros: Enabled' : 'Auto-Skip Intros: Disabled'}</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Up Next Countdown (${upNextSec}s)</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn" data-focusable="true" id="btn-upnext-10">10s</button>
          <button class="jellio-btn" data-focusable="true" id="btn-upnext-15">15s</button>
          <button class="jellio-btn" data-focusable="true" id="btn-upnext-30">30s</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-toggle-ready').onclick = () => {
      PlayerPrefs.setPreferReadySources(!preferReady);
      this.renderPlaybackPane(pane);
    };
    pane.querySelector('#btn-toggle-autoskip').onclick = () => {
      PlayerPrefs.setAutoSkipIntro(!autoSkip);
      this.renderPlaybackPane(pane);
    };
    pane.querySelector('#btn-upnext-10').onclick = () => {
      PlayerPrefs.setUpNextCountdownSeconds(10);
      this.renderPlaybackPane(pane);
    };
    pane.querySelector('#btn-upnext-15').onclick = () => {
      PlayerPrefs.setUpNextCountdownSeconds(15);
      this.renderPlaybackPane(pane);
    };
    pane.querySelector('#btn-upnext-30').onclick = () => {
      PlayerPrefs.setUpNextCountdownSeconds(30);
      this.renderPlaybackPane(pane);
    };
  }

  renderSubtitlesPane(pane) {
    const size = PlayerPrefs.getSubtitleSize();
    const bg = PlayerPrefs.getSubtitleBackground();
    const look = PlayerPrefs.getSubtitleLook();

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Subtitles & Style</h1>

      <div style="background: rgba(0,0,0,0.6); border-radius: 14px; padding: 32px; display: flex; justify-content: center; align-items: center; min-height: 120px; border: 1px solid var(--jellio-border);">
        <div id="sub-preview-box" style="font-size: ${size === 'large' ? '28px' : size === 'small' ? '18px' : '22px'}; color: #ffffff; background: ${bg === 'semi' ? 'rgba(0,0,0,0.75)' : bg === 'box' ? '#000000' : 'transparent'}; padding: 6px 14px; border-radius: 6px; text-shadow: ${look === 'clean' ? '1px 1px 3px #000' : '2px 2px 4px #000'}; font-weight: 600;">
          This is a sample subtitle line.
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Subtitle Size</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${size === 'small' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sub-small">Small</button>
          <button class="jellio-btn ${size === 'normal' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sub-normal">Normal</button>
          <button class="jellio-btn ${size === 'large' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sub-large">Large</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Subtitle Background</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${bg === 'none' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-bg-none">None</button>
          <button class="jellio-btn ${bg === 'semi' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-bg-semi">Semi-Transparent</button>
          <button class="jellio-btn ${bg === 'box' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-bg-box">Black Box</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-sub-small').onclick = () => {
      PlayerPrefs.setSubtitleSize('small');
      this.renderSubtitlesPane(pane);
    };
    pane.querySelector('#btn-sub-normal').onclick = () => {
      PlayerPrefs.setSubtitleSize('normal');
      this.renderSubtitlesPane(pane);
    };
    pane.querySelector('#btn-sub-large').onclick = () => {
      PlayerPrefs.setSubtitleSize('large');
      this.renderSubtitlesPane(pane);
    };

    pane.querySelector('#btn-bg-none').onclick = () => {
      PlayerPrefs.setSubtitleBackground('none');
      this.renderSubtitlesPane(pane);
    };
    pane.querySelector('#btn-bg-semi').onclick = () => {
      PlayerPrefs.setSubtitleBackground('semi');
      this.renderSubtitlesPane(pane);
    };
    pane.querySelector('#btn-bg-box').onclick = () => {
      PlayerPrefs.setSubtitleBackground('box');
      this.renderSubtitlesPane(pane);
    };
  }

  renderAudioPane(pane) {
    const audioPref = PlayerPrefs.getAudioLanguage() || 'Original';
    const subPref = PlayerPrefs.getSubtitleLanguage() || 'None';

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Audio & Languages</h1>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Preferred Audio Language</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${audioPref === 'Original' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-audio-orig">Original</button>
          <button class="jellio-btn ${audioPref === 'eng' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-audio-eng">English</button>
          <button class="jellio-btn ${audioPref === 'spa' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-audio-spa">Spanish</button>
          <button class="jellio-btn ${audioPref === 'deu' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-audio-deu">German</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Default Subtitles Language</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${subPref === 'None' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sublang-none">None</button>
          <button class="jellio-btn ${subPref === 'eng' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sublang-eng">English</button>
          <button class="jellio-btn ${subPref === 'spa' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sublang-spa">Spanish</button>
          <button class="jellio-btn ${subPref === 'fra' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-sublang-fra">French</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-audio-orig').onclick = () => {
      PlayerPrefs.setAudioLanguage(null);
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-audio-eng').onclick = () => {
      PlayerPrefs.setAudioLanguage('eng');
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-audio-spa').onclick = () => {
      PlayerPrefs.setAudioLanguage('spa');
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-audio-deu').onclick = () => {
      PlayerPrefs.setAudioLanguage('deu');
      this.renderAudioPane(pane);
    };

    pane.querySelector('#btn-sublang-none').onclick = () => {
      PlayerPrefs.setSubtitleLanguage(null);
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-sublang-eng').onclick = () => {
      PlayerPrefs.setSubtitleLanguage('eng');
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-sublang-spa').onclick = () => {
      PlayerPrefs.setSubtitleLanguage('spa');
      this.renderAudioPane(pane);
    };
    pane.querySelector('#btn-sublang-fra').onclick = () => {
      PlayerPrefs.setSubtitleLanguage('fra');
      this.renderAudioPane(pane);
    };
  }

  renderHomePane(pane) {
    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Home Screen Customization</h1>
      <p style="font-size: 14px; color: var(--jellio-text-secondary); line-height: 1.5;">
        Reorder and hide individual home rows directly on the Home screen, or reset to the default layout.
      </p>
      <div style="display: flex; gap: 14px; margin-top: 8px;">
        <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="btn-customize-home">Customize Home Rows</button>
        <button class="jellio-btn" data-focusable="true" id="btn-reset-home">Reset Home Rows to Default</button>
      </div>
    `;

    pane.querySelector('#btn-customize-home').onclick = () => {
      if (this.options.onCustomizeHome) {
        this.options.onCustomizeHome();
      }
    };

    pane.querySelector('#btn-reset-home').onclick = () => {
      HomeRowPreferences.setRowOrder([]);
      HomeRowPreferences.setHiddenRows([]);
      if (this.options.onToast) {
        this.options.onToast('Home row layout reset to default.');
      }
    };
  }

  renderQuickHubPane(pane) {
    const showPill = QuickHubPrefs.getShowPill();
    const button = QuickHubPrefs.getButton();
    const trigger = QuickHubPrefs.getTrigger();

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Quick Hub Shortcuts</h1>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Status Pill Indicator</label>
        <button class="jellio-btn" data-focusable="true" id="btn-toggle-pill">${showPill ? 'Pill: Visible' : 'Pill: Hidden'}</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Activation Remote Button</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${button === 'BACK' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-qhub-back">Back Button</button>
          <button class="jellio-btn ${button === 'GUIDE' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-qhub-guide">Guide / Info</button>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Trigger Mode</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn ${trigger === 'HOLD' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-trig-hold">Long Press (Hold)</button>
          <button class="jellio-btn ${trigger === 'CLICK' ? 'jellio-btn-primary' : ''}" data-focusable="true" id="btn-trig-click">Short Click</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-toggle-pill').onclick = () => {
      QuickHubPrefs.setShowPill(!showPill);
      this.renderQuickHubPane(pane);
    };
    pane.querySelector('#btn-qhub-back').onclick = () => {
      QuickHubPrefs.setButton('BACK');
      this.renderQuickHubPane(pane);
    };
    pane.querySelector('#btn-qhub-guide').onclick = () => {
      QuickHubPrefs.setButton('GUIDE');
      this.renderQuickHubPane(pane);
    };
    pane.querySelector('#btn-trig-hold').onclick = () => {
      QuickHubPrefs.setTrigger('HOLD');
      this.renderQuickHubPane(pane);
    };
    pane.querySelector('#btn-trig-click').onclick = () => {
      QuickHubPrefs.setTrigger('CLICK');
      this.renderQuickHubPane(pane);
    };
  }

  renderFriendsPane(pane) {
    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">Friends & Privacy</h1>
      <p style="font-size: 14px; color: var(--jellio-text-secondary); line-height: 1.5;">
        Control who can view your watched activity and send friend requests.
      </p>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 16px; font-weight: 600;">Profile Visibility</label>
        <div style="display: flex; gap: 12px;">
          <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="btn-privacy-public">Public</button>
          <button class="jellio-btn" data-focusable="true" id="btn-privacy-private">Private</button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-privacy-public').onclick = async () => {
      try {
        await setProfilePrivacy(false);
        if (this.options.onToast) this.options.onToast('Profile set to Public.');
      } catch (_) {}
    };

    pane.querySelector('#btn-privacy-private').onclick = async () => {
      try {
        await setProfilePrivacy(true);
        if (this.options.onToast) this.options.onToast('Profile set to Private.');
      } catch (_) {}
    };
  }

  renderAboutPane(pane) {
    const session = getSession();

    pane.innerHTML = `
      <h1 style="font-size: 28px; font-weight: 700;">About & What's New</h1>

      <div style="background: var(--jellio-bg-elevated); border: 1px solid var(--jellio-border); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 12px;">
        <div style="font-size: 20px; font-weight: 700; color: var(--jellio-text);">Jellio Tizen TV</div>
        <div style="font-size: 14px; color: var(--jellio-text-secondary);">Version ${CURRENT_CHANGELOG.version} (Native Smart TV Client)</div>
        <div style="font-size: 14px; color: var(--jellio-text-secondary);">Connected: ${session ? session.serverAddress : 'Not connected'}</div>
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <button class="jellio-btn jellio-btn-danger" data-focusable="true" id="btn-settings-signout">Sign Out</button>
        </div>
      </div>

      <div style="margin-top: 12px;">
        <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 16px;">Release Notes</h2>
        <div id="changelog-accordion" style="display: flex; flex-direction: column; gap: 12px;"></div>
      </div>
    `;

    pane.querySelector('#btn-settings-signout').onclick = () => {
      clearSession();
      if (this.options.onLogout) this.options.onLogout();
    };

    const accordion = pane.querySelector('#changelog-accordion');
    CHANGELOG_RELEASES.forEach((rel, index) => {
      const isLatest = index === 0;
      const box = document.createElement('div');
      box.style.background = 'var(--jellio-bg-elevated)';
      box.style.border = '1px solid var(--jellio-border)';
      box.style.borderRadius = '14px';
      box.style.overflow = 'hidden';

      const header = document.createElement('button');
      header.className = 'jellio-btn';
      header.setAttribute('data-focusable', 'true');
      header.style.width = '100%';
      header.style.justifyContent = 'space-between';
      header.style.padding = '16px 20px';
      header.style.borderRadius = '0';
      header.innerHTML = `
        <span style="font-size: 17px; font-weight: 700;">${rel.version}: ${rel.title}</span>
        <span style="font-size: 14px; color: var(--jellio-text-secondary);">${isLatest ? 'Latest' : 'Tap to expand'}</span>
      `;

      const content = document.createElement('div');
      content.style.padding = '16px 20px';
      content.style.display = isLatest ? 'flex' : 'none';
      content.style.flexDirection = 'column';
      content.style.gap = '12px';
      content.style.borderTop = '1px solid var(--jellio-border)';

      rel.features.forEach((feat) => {
        const item = document.createElement('div');
        item.innerHTML = `
          <div style="font-size: 15px; font-weight: 700; color: var(--jellio-text);">${feat.title}</div>
          <div style="font-size: 14px; color: var(--jellio-text-secondary); line-height: 1.4;">${feat.description}</div>
        `;
        content.appendChild(item);
      });

      header.onclick = () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'flex' : 'none';
      };

      box.appendChild(header);
      box.appendChild(content);
      accordion.appendChild(box);
    });
  }

  destroy() {
    this.container = null;
  }
}
