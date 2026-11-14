// Live TV screen with channel list, current/next program EPG guide, and live player trigger.
import { getLiveChannels, getLivePrograms, getImageUrl } from '../../data/api.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

export class LiveTvScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.channels = [];
    this.programsMap = new Map();
    this.selectedChannel = null;
  }

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="livetv-screen">
        <div class="jellio-screen-scroll" id="livetv-scroll-container">
          <div style="padding: 36px 48px;">
            <h1 class="jellio-title-hero" style="font-size: 32px; margin-bottom: 24px;">Live TV & EPG Guide</h1>

            <div id="livetv-layout" style="display: flex; gap: 32px;">
              <div id="livetv-channels-list" style="width: 440px; display: flex; flex-direction: column; gap: 12px;">
                <div id="livetv-loading" style="color: var(--jellio-text-secondary);">Loading channels...</div>
              </div>

              <div id="livetv-epg-details" style="flex: 1; background: var(--jellio-bg-elevated); border: 1px solid var(--jellio-border); border-radius: 20px; padding: 32px; display: flex; flex-direction: column; gap: 20px;">
                <h2 id="epg-channel-name" style="font-size: 24px; font-weight: 700; color: var(--jellio-text);">Select a channel</h2>
                <div id="epg-current-program" style="display: flex; flex-direction: column; gap: 8px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--jellio-trending); text-transform: uppercase;">Now Playing</div>
                  <div id="epg-current-title" style="font-size: 20px; font-weight: 600; color: var(--jellio-text);">-</div>
                  <div id="epg-current-time" style="font-size: 14px; color: var(--jellio-text-secondary);">-</div>
                  <p id="epg-current-desc" style="font-size: 15px; color: var(--jellio-text-secondary); line-height: 1.5; margin-top: 6px;"></p>
                </div>

                <div id="epg-next-program" style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--jellio-border); padding-top: 16px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--jellio-text-tertiary); text-transform: uppercase;">Up Next</div>
                  <div id="epg-next-title" style="font-size: 17px; font-weight: 600; color: var(--jellio-text);">-</div>
                  <div id="epg-next-time" style="font-size: 14px; color: var(--jellio-text-secondary);">-</div>
                </div>

                <div style="margin-top: auto;">
                  <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="livetv-tune-btn" style="padding: 14px 28px; font-size: 18px;">Watch Channel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindControls();
    await this.loadChannels();
  }

  bindControls() {
    const tuneBtn = this.container.querySelector('#livetv-tune-btn');
    tuneBtn.onclick = () => {
      if (this.selectedChannel && this.options.onChannelSelect) {
        this.options.onChannelSelect(this.selectedChannel);
      }
    };
  }

  async loadChannels() {
    try {
      this.channels = await getLiveChannels(100);
      this.renderChannelsList();
      if (this.channels.length > 0) {
        this.selectChannel(this.channels[0]);
      }
      focusFirstIn(this.container);
    } catch (err) {
      console.warn('LiveTvScreen: failed to load channels', err);
    }
  }

  renderChannelsList() {
    const listEl = this.container.querySelector('#livetv-channels-list');
    listEl.innerHTML = '';

    if (this.channels.length === 0) {
      listEl.innerHTML = '<div style="color: var(--jellio-text-secondary);">No Live TV channels found.</div>';
      return;
    }

    this.channels.forEach((channel) => {
      const row = document.createElement('div');
      row.className = 'jellio-channel-row';
      row.style.background = 'var(--jellio-bg-elevated)';
      row.style.border = '1px solid var(--jellio-border)';
      row.style.borderRadius = '14px';
      row.style.padding = '12px 16px';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '14px';
      row.style.cursor = 'pointer';
      row.setAttribute('data-focusable', 'true');

      const logoUrl = getImageUrl(channel.Id, channel.ImageTags?.Primary, 'Primary', 100);
      const progName = channel.CurrentProgram?.Name || 'Live Broadcast';

      row.innerHTML = `
        <img src="${logoUrl}" style="width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: rgba(0,0,0,0.3);" alt="${channel.Name}" onerror="this.style.display='none'" />
        <div style="flex: 1; overflow: hidden;">
          <div style="font-size: 16px; font-weight: 700; color: var(--jellio-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${channel.Name}</div>
          <div style="font-size: 13px; color: var(--jellio-trending); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${progName}</div>
        </div>
      `;

      row.onclick = () => {
        this.selectChannel(channel);
        if (this.options.onChannelSelect) {
          this.options.onChannelSelect(channel);
        }
      };

      row.onfocus = () => {
        this.selectChannel(channel);
      };

      listEl.appendChild(row);
    });
  }

  selectChannel(channel) {
    this.selectedChannel = channel;
    const nameEl = this.container.querySelector('#epg-channel-name');
    const curTitle = this.container.querySelector('#epg-current-title');
    const curTime = this.container.querySelector('#epg-current-time');
    const curDesc = this.container.querySelector('#epg-current-desc');
    const nextTitle = this.container.querySelector('#epg-next-title');
    const nextTime = this.container.querySelector('#epg-next-time');

    nameEl.textContent = channel.Name || 'Live Channel';

    const cur = channel.CurrentProgram;
    if (cur) {
      curTitle.textContent = cur.Name || 'Live Program';
      curTime.textContent = this.formatTimeRange(cur.StartDate, cur.EndDate);
      curDesc.textContent = cur.Overview || 'No description provided.';
    } else {
      curTitle.textContent = 'Live Broadcast';
      curTime.textContent = 'Now';
      curDesc.textContent = 'Channel stream is live.';
    }

    const nxt = channel.NextProgram;
    if (nxt) {
      nextTitle.textContent = nxt.Name || 'Upcoming Program';
      nextTime.textContent = this.formatTimeRange(nxt.StartDate, nxt.EndDate);
    } else {
      nextTitle.textContent = 'Schedule unavailable';
      nextTime.textContent = '';
    }
  }

  formatTimeRange(startStr, endStr) {
    if (!startStr) return '';
    try {
      const s = new Date(startStr);
      const startFmt = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!endStr) return startFmt;
      const e = new Date(endStr);
      const endFmt = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${startFmt} - ${endFmt}`;
    } catch (_) {
      return '';
    }
  }

  destroy() {
    this.channels = [];
    this.selectedChannel = null;
  }
}
