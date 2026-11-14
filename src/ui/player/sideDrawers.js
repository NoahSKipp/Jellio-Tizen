// Side drawers for 10-foot player: Episode drawer, Stream switcher, Audio, Subtitles, Speed, and Sleep timer.
import { focusFirstIn, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';
import { sourceResolutionLabel, sourceAudioLabel, sourceBitrateLabel } from '../overlays/streamPicker.js';

export class EpisodesPanel {
  constructor(options = {}) {
    this.options = options;
    this.parentEl = options.parentEl || null;
    this.seasons = options.seasons || [];
    this.episodes = options.episodes || [];
    this.currentSeasonId = options.currentSeasonId || null;
    this.currentEpisodeId = options.currentEpisodeId || null;

    this.onSelectEpisode = options.onSelectEpisode || null;
    this.onSelectSeason = options.onSelectSeason || null;
    this.onClose = options.onClose || null;

    this.container = null;
    this.isOpen = false;
  }

  mount(parentEl) {
    this.parentEl = parentEl;
  }

  setSeasons(seasons) {
    this.seasons = seasons || [];
    if (!this.currentSeasonId && this.seasons.length > 0) {
      this.currentSeasonId = this.seasons[0].Id;
    }
  }

  setEpisodes(episodes) {
    this.episodes = episodes || [];
    if (this.isOpen) {
      this.renderEpisodesList();
    }
  }

  open() {
    if (!this.parentEl || this.isOpen) return;
    this.isOpen = true;

    const scrim = document.createElement('div');
    scrim.className = 'jellio-player-drawer-scrim';
    scrim.id = 'jellio-episodes-drawer';
    this.container = scrim;

    scrim.innerHTML = `
      <div class="jellio-player-drawer" data-focus-trap="true">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="font-size: 24px; font-weight: 700; color: var(--jellio-text);">Episodes</h2>
          <button class="jellio-btn" data-focusable="true" id="episodes-drawer-close">Close</button>
        </div>

        ${this.seasons.length > 1 ? `
          <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; margin-bottom: 16px;" id="episodes-seasons-row">
            ${this.seasons.map((s) => `
              <button class="jellio-btn ${s.Id === this.currentSeasonId ? 'jellio-btn-primary' : ''}" data-focusable="true" data-season-id="${s.Id}">
                ${this.escape(s.Name || `Season ${s.IndexNumber}`)}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex: 1;" id="episodes-list-container"></div>
      </div>
    `;

    this.parentEl.appendChild(scrim);
    this.bindEvents();
    this.renderEpisodesList();

    pushFocusTrap(scrim, () => this.close());
  }

  bindEvents() {
    if (!this.container) return;

    const closeBtn = this.container.querySelector('#episodes-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    const seasonBtns = this.container.querySelectorAll('[data-season-id]');
    seasonBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const seasonId = btn.getAttribute('data-season-id');
        this.currentSeasonId = seasonId;
        seasonBtns.forEach((b) => b.classList.remove('jellio-btn-primary'));
        btn.classList.add('jellio-btn-primary');
        if (typeof this.onSelectSeason === 'function') {
          this.onSelectSeason(seasonId);
        }
      });
    });

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  renderEpisodesList() {
    if (!this.container) return;
    const listEl = this.container.querySelector('#episodes-list-container');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (this.episodes.length === 0) {
      listEl.innerHTML = '<div style="color: var(--jellio-text-secondary); font-size: 15px; padding: 16px 0;">No episodes loaded</div>';
      return;
    }

    this.episodes.forEach((ep) => {
      const isCurrent = ep.Id === this.currentEpisodeId;
      const isPlayed = Boolean(ep.UserData?.Played);
      const posTicks = ep.UserData?.PlaybackPositionTicks || 0;
      const runtimeTicks = ep.RunTimeTicks || 0;
      const progressPercent = runtimeTicks > 0 ? Math.min(100, Math.round((posTicks / runtimeTicks) * 100)) : 0;

      const itemEl = document.createElement('div');
      itemEl.className = 'jellio-drawer-item';
      itemEl.setAttribute('data-focusable', 'true');
      itemEl.setAttribute('data-episode-id', ep.Id);
      if (isCurrent) itemEl.classList.add('jellio-active-item');

      itemEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="font-weight: 700; font-size: 15px; color: var(--jellio-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
            ${ep.IndexNumber !== undefined ? `${ep.IndexNumber}. ` : ''}${this.escape(ep.Name || 'Episode')}
          </div>
          ${isPlayed ? '<span style="color: var(--jellio-trending); font-size: 14px; margin-left: 8px;">✓</span>' : ''}
        </div>
        ${progressPercent > 0 && !isPlayed ? `
          <div style="width: 100%; height: 3px; background: rgba(255,255,255,0.2); border-radius: 2px; margin-top: 6px; overflow: hidden;">
            <div style="width: ${progressPercent}%; height: 100%; background: var(--jellio-trending);"></div>
          </div>
        ` : ''}
      `;

      itemEl.addEventListener('click', () => {
        this.close();
        if (typeof this.onSelectEpisode === 'function') {
          this.onSelectEpisode(ep.Id);
        }
      });

      listEl.appendChild(itemEl);
    });

    focusFirstIn(this.container);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    popFocusTrap(this.container);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  destroy() {
    this.close();
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export class StreamsPanel {
  constructor(options = {}) {
    this.options = options;
    this.parentEl = options.parentEl || null;
    this.sources = options.sources || [];
    this.currentSourceId = options.currentSourceId || null;

    this.onSelectSource = options.onSelectSource || null;
    this.onClose = options.onClose || null;

    this.container = null;
    this.isOpen = false;
  }

  mount(parentEl) {
    this.parentEl = parentEl;
  }

  setSources(sources, currentSourceId = null) {
    this.sources = sources || [];
    if (currentSourceId) this.currentSourceId = currentSourceId;
    if (this.isOpen) {
      this.renderSourcesList();
    }
  }

  open() {
    if (!this.parentEl || this.isOpen) return;
    this.isOpen = true;

    const scrim = document.createElement('div');
    scrim.className = 'jellio-player-drawer-scrim';
    scrim.id = 'jellio-streams-drawer';
    this.container = scrim;

    scrim.innerHTML = `
      <div class="jellio-player-drawer" data-focus-trap="true">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="font-size: 24px; font-weight: 700; color: var(--jellio-text);">Streams</h2>
          <button class="jellio-btn" data-focusable="true" id="streams-drawer-close">Close</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;" id="streams-list-container"></div>
      </div>
    `;

    this.parentEl.appendChild(scrim);

    const closeBtn = scrim.querySelector('#streams-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) {
        this.close();
      }
    });

    this.renderSourcesList();
    pushFocusTrap(scrim, () => this.close());
  }

  renderSourcesList() {
    if (!this.container) return;
    const listEl = this.container.querySelector('#streams-list-container');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (this.sources.length === 0) {
      listEl.innerHTML = '<div style="color: var(--jellio-text-secondary); font-size: 15px; padding: 16px 0;">No alternative streams found</div>';
      return;
    }

    this.sources.forEach((source, index) => {
      const isCurrent = source.Id === this.currentSourceId || (!this.currentSourceId && index === 0);
      const resLabel = sourceResolutionLabel(source);
      const audioLabel = sourceAudioLabel(source);
      const bitrate = sourceBitrateLabel(source);
      const isDirectPlay = Boolean(source.SupportsDirectPlay !== false && !source.RequiresTranscoding);

      const itemEl = document.createElement('div');
      itemEl.className = 'jellio-drawer-item';
      itemEl.setAttribute('data-focusable', 'true');
      itemEl.setAttribute('data-source-id', source.Id);
      if (isCurrent) itemEl.classList.add('jellio-active-item');

      itemEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="jellio-badge" style="font-size: 12px;">${this.escape(resLabel)}</span>
            <span style="font-size: 14px; font-weight: 700; color: var(--jellio-text);">${this.escape(source.Name || `Source ${index + 1}`)}</span>
          </div>
          ${isCurrent ? '<span style="color: var(--jellio-trending); font-weight: 700; font-size: 14px;">ACTIVE</span>' : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 12px; color: var(--jellio-text-secondary);">
          <span>${this.escape(audioLabel)}</span>
          ${bitrate ? `<span>- ${this.escape(bitrate)}</span>` : ''}
          <span style="margin-left: auto; color: ${isDirectPlay ? '#4caf50' : '#ff9800'}; font-weight: 600;">
            ${isDirectPlay ? 'Direct Play' : 'Transcode'}
          </span>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        this.close();
        if (typeof this.onSelectSource === 'function') {
          this.onSelectSource(source);
        }
      });

      listEl.appendChild(itemEl);
    });

    focusFirstIn(this.container);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    popFocusTrap(this.container);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  destroy() {
    this.close();
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export class SimpleListDrawer {
  constructor({ title, items = [], selectedId = null, onSelect, onClose }) {
    this.title = title;
    this.items = items;
    this.selectedId = selectedId;
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.container = null;
    this.isOpen = false;
  }

  open(parentEl) {
    if (!parentEl || this.isOpen) return;
    this.isOpen = true;

    const scrim = document.createElement('div');
    scrim.className = 'jellio-player-drawer-scrim';
    this.container = scrim;

    scrim.innerHTML = `
      <div class="jellio-player-drawer" data-focus-trap="true">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="font-size: 24px; font-weight: 700; color: var(--jellio-text);">${this.escape(this.title)}</h2>
          <button class="jellio-btn" data-focusable="true" id="simple-drawer-close">Close</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1;" id="simple-drawer-items"></div>
      </div>
    `;

    parentEl.appendChild(scrim);

    const closeBtn = scrim.querySelector('#simple-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) this.close();
    });

    const listEl = scrim.querySelector('#simple-drawer-items');
    this.items.forEach((item) => {
      const isSelected = item.id === this.selectedId;
      const row = document.createElement('div');
      row.className = 'jellio-drawer-item';
      row.setAttribute('data-focusable', 'true');
      if (isSelected) row.classList.add('jellio-active-item');

      row.innerHTML = `
        <span style="font-weight: 600; font-size: 15px; color: var(--jellio-text);">${this.escape(item.label)}</span>
        ${isSelected ? '<span style="color: var(--jellio-trending); font-weight: 700;">✓</span>' : ''}
      `;

      row.addEventListener('click', () => {
        this.close();
        if (typeof this.onSelect === 'function') {
          this.onSelect(item.id, item);
        }
      });
      listEl.appendChild(row);
    });

    pushFocusTrap(scrim, () => this.close());
    focusFirstIn(scrim);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    popFocusTrap(this.container);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
