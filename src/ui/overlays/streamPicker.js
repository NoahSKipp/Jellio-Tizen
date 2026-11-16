// StreamPickerOverlay modal matching StreamPickerOverlay.kt.
import { pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { PlayerPrefs } from '../../data/prefs.js';
import { normalizeSourceId } from '../../data/api.js';
import { t } from '../../runtime/i18n.js';

export function isSourceReady(source, readyInfo) {
  if (!source || !source.Id || !readyInfo) return false;
  const normId = normalizeSourceId(source.Id);
  if (readyInfo instanceof Set) {
    return readyInfo.has(normId);
  }
  if (typeof readyInfo === 'object') {
    return Boolean(
      readyInfo[normId] ||
      readyInfo[source.Id] ||
      (Array.isArray(readyInfo) && readyInfo.some((r) => normalizeSourceId(r) === normId))
    );
  }
  return false;
}

export function sourceResolutionLabel(source) {
  if (!source || !source.MediaStreams) return '';
  const video = source.MediaStreams.find((s) => s.Type === 'Video');
  if (!video || !video.Height) return '';
  return video.Height >= 2000 ? '4K' : `${video.Height}p`;
}

export function sourceAudioLabel(source) {
  if (!source || !source.MediaStreams) return '';
  const audio = source.MediaStreams.find((s) => s.Type === 'Audio');
  if (!audio) return '';
  const parts = [];
  if (audio.Codec) parts.push(audio.Codec.toUpperCase());
  if (audio.Channels) parts.push(`${audio.Channels}ch`);
  return parts.join(' ');
}

export function sourceBitrateLabel(source) {
  if (!source || !source.MediaStreams) return '';
  const video = source.MediaStreams.find((s) => s.Type === 'Video');
  if (!video || !video.BitRate) return '';
  return `${(video.BitRate / 1000000).toFixed(1)} Mbps`;
}

export class StreamPickerOverlay {
  constructor(options = {}) {
    this.item = options.item || null;
    this.sources = options.sources || [];
    this.readyInfo = options.readyInfo || null;
    this.onSelect = options.onSelect || (() => {});
    this.container = null;
  }

  show() {
    this.container = document.createElement('div');
    this.container.className = 'jellio-card-dialog-scrim';
    this.container.setAttribute('data-focus-group', 'stream-picker');

    const rememberedId = this.item ? PlayerPrefs.getRememberedSourceId(this.item.Id) : null;
    const readyLabel = '\u26A1 ' + (t('stream_ready') || 'Ready');

    let sourcesHtml = '';
    for (const source of this.sources) {
      const res = sourceResolutionLabel(source);
      const audio = sourceAudioLabel(source);
      const bitrate = sourceBitrateLabel(source);
      const isRemembered = rememberedId && rememberedId === source.Id;
      const isDirectPlay = Boolean(source.SupportsDirectPlay !== false);
      const ready = isSourceReady(source, this.readyInfo);

      sourcesHtml += `
        <div class="jellio-stream-option-card" data-focusable="true" data-action="pick-stream" data-source-id="${source.Id}" style="background: rgba(255,255,255,0.06); padding: 14px 18px; border-radius: 12px; margin-bottom: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 16px;">${source.Name || 'Stream'}</div>
            <div style="font-size: 13px; color: var(--jellio-text-secondary); margin-top: 4px; display: flex; gap: 10px;">
              ${res ? `<span>${res}</span>` : ''}
              ${audio ? `<span>${audio}</span>` : ''}
              ${bitrate ? `<span>${bitrate}</span>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${ready ? `<span class="jellio-stream-ready-badge" style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(102, 187, 106, 0.18); color: #81C784; font-weight: 600;">${readyLabel}</span>` : ''}
            ${isDirectPlay ? '<span style="font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(34,197,94,0.2); color: #22c55e;">DirectPlay</span>' : '<span style="font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(239,68,68,0.2); color: #ef4444;">Transcode</span>'}
            ${isRemembered ? '<span style="font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(255,152,0,0.2); color: #ff9800;">Default</span>' : ''}
          </div>
        </div>
      `;
    }

    if (this.sources.length === 0) {
      sourcesHtml = `<div style="text-align: center; color: var(--jellio-text-secondary); padding: 30px;">No compatible streams found.</div>`;
    }

    this.container.innerHTML = `
      <div class="jellio-stream-picker-card" style="width: 580px; max-height: 80vh; overflow-y: auto;">
        <div style="margin-bottom: 16px;">
          <h2 style="font-size: 20px; font-weight: 700;">Select Stream</h2>
          <p style="font-size: 13px; color: var(--jellio-text-secondary); margin-top: 4px;">${this.item ? this.item.Name : ''}</p>
        </div>
        <div class="jellio-stream-picker-list">
          ${sourcesHtml}
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
      if (e.target === this.container) {
        this.dismiss();
        return;
      }

      const streamCard = e.target.closest('[data-action="pick-stream"]');
      if (streamCard) {
        const sourceId = streamCard.getAttribute('data-source-id');
        const selected = this.sources.find((s) => s.Id === sourceId);
        if (selected) {
          if (this.item) {
            PlayerPrefs.rememberSourceId(this.item.Id, selected.Id);
          }
          this.dismiss();
          this.onSelect(selected);
        }
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
