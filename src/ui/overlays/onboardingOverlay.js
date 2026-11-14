// Onboarding modal overlay matching OnboardingOverlay.kt.
import { pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { OnboardingPrefs, PlayerPrefs } from '../../data/prefs.js';
import { DISPLAY_LANGUAGES, t } from '../../runtime/i18n.js';

export class OnboardingOverlay {
  constructor(options = {}) {
    this.userId = options.userId || null;
    this.initialAudioLang = options.initialAudioLang || null;
    this.initialSubtitleLang = options.initialSubtitleLang || null;
    this.onSavePreferences = options.onSavePreferences || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.container = null;
    this.selectedAudio = this.initialAudioLang || 'en';
    this.selectedSubtitle = this.initialSubtitleLang || 'off';
  }

  show() {
    this.container = document.createElement('div');
    this.container.className = 'jellio-card-dialog-scrim';
    this.container.setAttribute('data-focus-group', 'onboarding');

    const languages = [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'German (Deutsch)' },
      { code: 'es', label: 'Spanish (Español)' },
      { code: 'fr', label: 'French (Français)' },
      { code: 'it', label: 'Italian (Italiano)' },
      { code: 'ja', label: 'Japanese' },
    ];

    let audioOptionsHtml = '';
    for (const lang of languages) {
      const active = this.selectedAudio === lang.code ? ' jellio-active' : '';
      audioOptionsHtml += `
        <button class="jellio-btn${active}" data-focusable="true" data-type="audio" data-code="${lang.code}" style="padding: 8px 16px; margin: 4px; border-radius: 8px;">
          ${lang.label}
        </button>
      `;
    }

    const subLanguages = [{ code: 'off', label: 'Subtitles Off' }, ...languages];
    let subOptionsHtml = '';
    for (const lang of subLanguages) {
      const active = this.selectedSubtitle === lang.code ? ' jellio-active' : '';
      subOptionsHtml += `
        <button class="jellio-btn${active}" data-focusable="true" data-type="sub" data-code="${lang.code}" style="padding: 8px 16px; margin: 4px; border-radius: 8px;">
          ${lang.label}
        </button>
      `;
    }

    this.container.innerHTML = `
      <div class="jellio-onboarding-modal" style="width: 680px;">
        <h2 style="font-size: 24px; font-weight: 700;">Welcome to Jellio TV</h2>
        <p style="font-size: 14px; color: var(--jellio-text-secondary); margin-top: -12px;">Choose your default playback languages to get started.</p>

        <div style="width: 100%; text-align: left; margin-top: 10px;">
          <label style="font-weight: 600; font-size: 14px; color: var(--jellio-text-secondary); margin-bottom: 8px; display: block;">Preferred Audio Language</label>
          <div style="display: flex; flex-wrap: wrap;">
            ${audioOptionsHtml}
          </div>
        </div>

        <div style="width: 100%; text-align: left; margin-top: 14px;">
          <label style="font-weight: 600; font-size: 14px; color: var(--jellio-text-secondary); margin-bottom: 8px; display: block;">Preferred Subtitle Language</label>
          <div style="display: flex; flex-wrap: wrap;">
            ${subOptionsHtml}
          </div>
        </div>

        <div style="margin-top: 20px; width: 100%; display: flex; justify-content: flex-end; gap: 12px;">
          <button class="jellio-btn jellio-btn-primary" data-focusable="true" data-action="save-complete" style="padding: 10px 28px; font-size: 15px; font-weight: 700;">Save and Continue</button>
        </div>
      </div>
    `;

    this.attachEvents();

    const overlayRoot = document.getElementById('jellio-overlay-root');
    if (overlayRoot) {
      overlayRoot.appendChild(this.container);
      pushFocusTrap(this.container, () => this.dismiss());
    }
  }

  attachEvents() {
    this.container.addEventListener('click', (e) => {
      const audioBtn = e.target.closest('[data-type="audio"]');
      if (audioBtn) {
        this.selectedAudio = audioBtn.getAttribute('data-code');
        this.container.querySelectorAll('[data-type="audio"]').forEach((b) => b.classList.remove('jellio-active'));
        audioBtn.classList.add('jellio-active');
        return;
      }

      const subBtn = e.target.closest('[data-type="sub"]');
      if (subBtn) {
        this.selectedSubtitle = subBtn.getAttribute('data-code');
        this.container.querySelectorAll('[data-type="sub"]').forEach((b) => b.classList.remove('jellio-active'));
        subBtn.classList.add('jellio-active');
        return;
      }

      const saveBtn = e.target.closest('[data-action="save-complete"]');
      if (saveBtn) {
        PlayerPrefs.setAudioLanguage(this.selectedAudio);
        PlayerPrefs.setSubtitleLanguage(this.selectedSubtitle);
        if (this.userId) {
          OnboardingPrefs.markOnboardingSeen(this.userId);
        }
        this.onSavePreferences(this.selectedAudio, this.selectedSubtitle);
        this.dismiss();
        this.onComplete();
      }
    });
  }

  dismiss() {
    if (this.container) {
      popFocusTrap(this.container);
      this.container.remove();
      this.container = null;
    }
  }
}
