import test from 'node:test';
import assert from 'node:assert/strict';

import { AvplayAdapter, PlayState, EngineType } from '../src/player/avplayAdapter.js';
import { PlayerControls, formatTime } from '../src/ui/player/playerControls.js';
import { SkipOverlay } from '../src/ui/player/skipOverlay.js';
import { UpNextOverlay, DEFAULT_UP_NEXT_COUNTDOWN_SECONDS } from '../src/ui/player/upNextOverlay.js';
import { EpisodesPanel, StreamsPanel, SimpleListDrawer } from '../src/ui/player/sideDrawers.js';
import { computeEpisodeNavState, earlierSeasonIndexes, isSpecialsSeason } from '../src/runtime/episodeNav.js';
import { RemoteKey } from '../src/input/remote.js';

// Minimal DOM mock setup for Node test environment
function setupMockDom() {
  const elements = new Map();

  class MockClassList {
    constructor() {
      this.classes = new Set();
    }
    add(...names) {
      names.forEach((n) => this.classes.add(n));
    }
    remove(...names) {
      names.forEach((n) => this.classes.delete(n));
    }
    contains(name) {
      return this.classes.has(name);
    }
  }

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.classList = new MockClassList();
      this.style = {};
      this.eventListeners = new Map();
      this.innerHTMLContent = '';
      this.textContent = '';
      this.currentTime = 0;
      this.duration = 100;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') {
        value.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
      }
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    }

    addEventListener(event, handler) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
      const list = this.eventListeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    }

    dispatchEvent(event) {
      const list = this.eventListeners.get(event.type);
      if (list) {
        for (const handler of list) {
          handler(event);
        }
      }
    }

    click() {
      this.dispatchEvent({ type: 'click', target: this });
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const cleanSel = selector.trim();

      const match = (el) => {
        if (cleanSel.startsWith('#')) {
          return el.getAttribute('id') === cleanSel.slice(1);
        } else if (cleanSel.startsWith('.')) {
          return el.classList.contains(cleanSel.slice(1));
        } else if (cleanSel.startsWith('[') && cleanSel.endsWith(']')) {
          const attrPart = cleanSel.slice(1, -1);
          if (attrPart.includes('=')) {
            const [k, v] = attrPart.split('=');
            const cleanVal = v.replace(/['"]/g, '');
            return el.getAttribute(k) === cleanVal;
          }
          return el.getAttribute(attrPart) !== null;
        }
        return false;
      };

      const traverse = (node) => {
        for (const child of node.children) {
          if (match(child)) results.push(child);
          traverse(child);
        }
      };

      traverse(this);
      return results;
    }

    getBoundingClientRect() {
      return { top: 0, bottom: 1080, left: 0, right: 1920, width: 1920, height: 1080 };
    }

    focus() {}
    blur() {}
    load() {}
    play() {
      return Promise.resolve();
    }
    pause() {}

    set innerHTML(html) {
      this.innerHTMLContent = html;
      this.children = [];
      this.parseMockHtml(html);
    }

    get innerHTML() {
      return this.innerHTMLContent;
    }

    parseMockHtml(html) {
      // Tokenize tags and nested structures
      const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>(.*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/gs;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const tagName = match[1] || match[4];
        const rawAttrs = match[2] || match[5] || '';
        const childEl = new MockElement(tagName);

        const attrRegex = /([a-zA-Z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || 'true'));
          childEl.setAttribute(attrName, attrVal);
        }

        const innerContent = match[3] || '';
        childEl.textContent = innerContent.replace(/<[^>]*>/g, '').trim();
        childEl.innerHTML = innerContent;
        childEl.parentNode = this;
        this.children.push(childEl);
      }
    }
  }

  globalThis.HTMLElement = MockElement;

  const documentMock = {
    createElement(tag) {
      return new MockElement(tag);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    body: new MockElement('body'),
    contains() {
      return true;
    },
  };

  elements.set('av-player', new MockElement('object'));
  elements.set('html5-player', new MockElement('video'));
  elements.set('jellio-player-mount', new MockElement('div'));

  return { MockElement, documentMock, elements };
}

test('formatTime helper formats milliseconds correctly', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5000), '0:05');
  assert.equal(formatTime(65000), '1:05');
  assert.equal(formatTime(599000), '9:59');
  assert.equal(formatTime(3600000), '1:00:00');
  assert.equal(formatTime(3665000), '1:01:05');
  assert.equal(formatTime(-10), '0:00');
  assert.equal(formatTime(null), '0:00');
});

test('AvplayAdapter HTML5 fallback engine lifecycle and events', async () => {
  const { documentMock } = setupMockDom();
  globalThis.document = documentMock;
  globalThis.window = { webapis: null };

  const html5Mock = documentMock.getElementById('html5-player');
  const adapter = new AvplayAdapter({ html5El: html5Mock });

  assert.equal(adapter.engineType, EngineType.HTML5);
  assert.equal(adapter.state, PlayState.IDLE);

  let stateChanges = [];
  adapter.on('statechange', (st) => stateChanges.push(st));

  const loadPromise = adapter.loadStream('http://localhost:8096/stream.mp4', 10000);
  assert.equal(adapter.state, PlayState.LOADING);

  // Trigger canplay event on HTML5 video mock
  html5Mock.dispatchEvent({ type: 'canplay' });
  await loadPromise;

  assert.equal(adapter.state, PlayState.READY);
  assert.equal(adapter.currentTimeMs, 0);

  // Play and Pause
  adapter.play();
  html5Mock.dispatchEvent({ type: 'playing' });
  assert.equal(adapter.state, PlayState.PLAYING);

  adapter.pause();
  html5Mock.dispatchEvent({ type: 'pause' });
  assert.equal(adapter.state, PlayState.PAUSED);

  // Toggle play/pause
  adapter.togglePlayPause();
  html5Mock.dispatchEvent({ type: 'playing' });
  assert.equal(adapter.state, PlayState.PLAYING);

  // Seek
  let seekedTarget = null;
  adapter.on('seeked', (tgt) => { seekedTarget = tgt; });
  adapter.seek(25000);
  assert.equal(seekedTarget, 25000);

  // Step seek
  adapter.stepSeek(10);
  assert.equal(seekedTarget, 35000);

  // Speed
  adapter.setSpeed(1.5);
  assert.equal(adapter.playbackSpeed, 1.5);
  assert.equal(html5Mock.playbackRate, 1.5);

  adapter.destroy();
  assert.equal(adapter.state, PlayState.IDLE);
});

test('AvplayAdapter Samsung AVPlay native engine lifecycle and tracks', async () => {
  let avplayCalls = [];
  let listenerObj = null;

  globalThis.window = {
    webapis: {
      avplay: {
        open: (url) => avplayCalls.push({ call: 'open', url }),
        setDisplayRect: (x, y, w, h) => avplayCalls.push({ call: 'setDisplayRect', x, y, w, h }),
        setListener: (l) => { listenerObj = l; },
        prepareAsync: (success) => {
          avplayCalls.push({ call: 'prepareAsync' });
          setTimeout(success, 10);
        },
        play: () => avplayCalls.push({ call: 'play' }),
        pause: () => avplayCalls.push({ call: 'pause' }),
        seekTo: (ms, success) => {
          avplayCalls.push({ call: 'seekTo', ms });
          if (success) success();
        },
        stop: () => avplayCalls.push({ call: 'stop' }),
        close: () => avplayCalls.push({ call: 'close' }),
        getDuration: () => 120000,
        getCurrentTime: () => 15000,
        setSpeed: (spd) => avplayCalls.push({ call: 'setSpeed', spd }),
        getTotalTrackInfo: () => [
          { index: 0, type: 'AUDIO', extra_info: JSON.stringify({ language: 'eng', channels: 6, four_cc: 'AC3' }) },
          { index: 1, type: 'AUDIO', extra_info: JSON.stringify({ language: 'spa', channels: 2, four_cc: 'AAC' }) },
          { index: 2, type: 'TEXT', extra_info: JSON.stringify({ language: 'eng' }) },
        ],
        setSelectTrack: (type, idx) => avplayCalls.push({ call: 'setSelectTrack', type, idx }),
      },
    },
  };

  const adapter = new AvplayAdapter();
  assert.equal(adapter.engineType, EngineType.AVPLAY);

  await adapter.loadStream('http://tizen.tv/stream.mkv', 5000);

  assert.equal(adapter.state, PlayState.READY);
  assert.equal(adapter.getDuration(), 120000);

  const audioTracks = adapter.getAudioTracks();
  assert.equal(audioTracks.length, 2);
  assert.equal(audioTracks[0].language, 'eng');
  assert.equal(audioTracks[0].channels, 6);

  const subTracks = adapter.getSubtitleTracks();
  assert.equal(subTracks.length, 1);
  assert.equal(subTracks[0].language, 'eng');

  // Select tracks
  adapter.selectAudioTrack(1);
  adapter.selectSubtitleTrack(2);
  adapter.selectSubtitleTrack(-1);

  assert.ok(avplayCalls.some((c) => c.call === 'setSelectTrack' && c.type === 'AUDIO' && c.idx === 1));
  assert.ok(avplayCalls.some((c) => c.call === 'setSelectTrack' && c.type === 'TEXT' && c.idx === 2));
  assert.ok(avplayCalls.some((c) => c.call === 'setSelectTrack' && c.type === 'TEXT' && c.idx === -1));

  // Buffering events
  listenerObj.onbufferingstart();
  assert.equal(adapter.state, PlayState.BUFFERING);
  listenerObj.onbufferingcomplete();
  assert.equal(adapter.state, PlayState.PLAYING);

  // Time update listener
  let updatedMs = 0;
  adapter.on('timeupdate', (ms) => { updatedMs = ms; });
  listenerObj.oncurrentplaytime(42000);
  assert.equal(updatedMs, 42000);

  // Speed
  adapter.setSpeed(1.25);
  assert.ok(avplayCalls.some((c) => c.call === 'setSpeed' && c.spd === 1.25));

  adapter.destroy();
  assert.ok(avplayCalls.some((c) => c.call === 'stop'));
  assert.ok(avplayCalls.some((c) => c.call === 'close'));
});

test('PlayerControls HUD render, transport actions, and auto-hide timer', (t, done) => {
  const { documentMock } = setupMockDom();
  globalThis.document = documentMock;

  let playPauseClicked = false;
  let seekDeltaCalled = null;

  const controls = new PlayerControls({
    title: 'Episode 10',
    subtitle: 'The Great Journey',
    seriesName: 'Cosmos',
    seasonEpisode: 'S1E10',
    qualityBadge: '4K UHD',
    isEpisode: true,
    hasPreviousEpisode: true,
    hasNextEpisode: true,
    durationMs: 3600000,
    autoHideDelayMs: 60,
    onPlayPause: () => { playPauseClicked = true; },
    onSeekDelta: (d) => { seekDeltaCalled = d; },
  });

  const hud = controls.render();
  assert.ok(hud);

  controls.show();
  assert.equal(controls.isVisible, true);

  // Verify elements
  const btnPlay = hud.querySelector('#hud-btn-playpause');
  assert.ok(btnPlay);
  btnPlay.click();
  assert.equal(playPauseClicked, true);

  const btnFwd = hud.querySelector('#hud-btn-forward30');
  assert.ok(btnFwd);
  btnFwd.click();
  assert.equal(seekDeltaCalled, 30);

  // Progress update
  controls.updateProgress(1800000, 3600000, 75);
  assert.equal(controls.currentTimeMs, 1800000);

  // Verify auto-hide
  setTimeout(() => {
    assert.equal(controls.isVisible, false);
    controls.destroy();
    done();
  }, 90);
});

test('SkipOverlay countdown and remote key trigger', (t, done) => {
  const { documentMock } = setupMockDom();
  globalThis.document = documentMock;

  const parent = documentMock.createElement('div');
  let skippedTarget = null;

  const skipOverlay = new SkipOverlay({
    parentEl: parent,
    onSkip: (tgt) => { skippedTarget = tgt; },
  });

  const introSegment = { kind: 'intro', target: 95 };
  skipOverlay.show(introSegment);

  assert.ok(skipOverlay.container);
  assert.equal(skipOverlay.activeSegment, introSegment);

  // Shortcut key triggers skip
  const handled = skipOverlay.handleKey(RemoteKey.GREEN);
  assert.equal(handled, true);
  assert.equal(skippedTarget, 95);
  assert.equal(skipOverlay.activeSegment, null);

  // Second test: countdown auto-dismiss
  let dismissed = false;
  const skipOverlay2 = new SkipOverlay({
    parentEl: parent,
    countdownSeconds: 1,
    onDismiss: () => { dismissed = true; },
  });
  skipOverlay2.show({ kind: 'credits', target: 1200 });

  setTimeout(() => {
    assert.equal(dismissed, true);
    skipOverlay2.destroy();
    done();
  }, 1150);
});

test('UpNextOverlay countdown card and EndScreen modal', (t, done) => {
  const { documentMock } = setupMockDom();
  globalThis.document = documentMock;

  const parent = documentMock.createElement('div');
  let playedNext = null;
  let replayed = false;

  const upNext = new UpNextOverlay({
    parentEl: parent,
    countdownSeconds: 1,
    nextEpisode: { Id: 'ep-2', Name: 'Episode 2', SeriesName: 'Show' },
    onPlayNext: (ep) => { playedNext = ep; },
    onReplay: () => { replayed = true; },
  });

  upNext.showUpNextCard();
  assert.ok(upNext.cardContainer);

  setTimeout(() => {
    assert.ok(playedNext);
    assert.equal(playedNext.Id, 'ep-2');

    // EndScreen test
    upNext.showEndScreen('Show Name', 'S1E1');
    assert.ok(upNext.endScreenContainer);

    const replayBtn = upNext.endScreenContainer.querySelector('#endscreen-replay-btn');
    assert.ok(replayBtn);
    replayBtn.click();
    assert.equal(replayed, true);

    upNext.destroy();
    done();
  }, 1100);
});

test('Side drawers: EpisodesPanel and StreamsPanel rendering and selection', () => {
  const { documentMock } = setupMockDom();
  globalThis.document = documentMock;

  const parent = documentMock.createElement('div');
  let selectedEp = null;
  let selectedSrc = null;

  const episodes = [
    { Id: 'ep-1', Name: 'Pilot', IndexNumber: 1, UserData: { Played: true } },
    { Id: 'ep-2', Name: 'Chapter 2', IndexNumber: 2, UserData: { PlaybackPositionTicks: 100000000 } },
  ];

  const epPanel = new EpisodesPanel({
    parentEl: parent,
    seasons: [{ Id: 's-1', Name: 'Season 1' }],
    episodes,
    currentEpisodeId: 'ep-1',
    onSelectEpisode: (id) => { selectedEp = id; },
  });

  epPanel.open();
  assert.equal(epPanel.isOpen, true);

  const epItems = epPanel.container.querySelectorAll('[data-episode-id]');
  assert.equal(epItems.length, 2);
  epItems[1].click();
  assert.equal(selectedEp, 'ep-2');
  assert.equal(epPanel.isOpen, false);

  const sources = [
    {
      Id: 'src-1',
      Name: 'Direct 4K',
      SupportsDirectPlay: true,
      RequiresTranscoding: false,
      MediaStreams: [{ Type: 'Video', Height: 2160 }, { Type: 'Audio', Codec: 'aac', Channels: 6 }],
    },
    {
      Id: 'src-2',
      Name: 'Transcode 1080p',
      SupportsDirectPlay: false,
      RequiresTranscoding: true,
      MediaStreams: [{ Type: 'Video', Height: 1080 }, { Type: 'Audio', Codec: 'mp3', Channels: 2 }],
    },
  ];

  const streamPanel = new StreamsPanel({
    parentEl: parent,
    sources,
    onSelectSource: (s) => { selectedSrc = s; },
  });

  streamPanel.open();
  assert.equal(streamPanel.isOpen, true);

  const srcItems = streamPanel.container.querySelectorAll('[data-source-id]');
  assert.equal(srcItems.length, 2);
  srcItems[0].click();
  assert.equal(selectedSrc.Id, 'src-1');
  assert.equal(streamPanel.isOpen, false);
});

test('Episode navigation helper logic', () => {
  assert.equal(isSpecialsSeason({ IndexNumber: 0 }), true);
  assert.equal(isSpecialsSeason({ IndexNumber: 1 }), false);

  const seasonsList = [true, false, false]; // Specials, S1, S2
  assert.deepEqual(earlierSeasonIndexes(seasonsList, 2), [1]);
  assert.deepEqual(earlierSeasonIndexes(seasonsList, 1), []);
  assert.deepEqual(earlierSeasonIndexes(seasonsList, 0), []);

  const state1 = computeEpisodeNavState({ isEpisode: true, blockedInGroup: false, hasPrevious: true, hasNext: true });
  assert.equal(state1.showPrevious, true);
  assert.equal(state1.showNext, true);

  const state2 = computeEpisodeNavState({ isEpisode: true, blockedInGroup: true, hasPrevious: true, hasNext: true });
  assert.equal(state2.showPrevious, false);
  assert.equal(state2.showNext, false);

  const state3 = computeEpisodeNavState({ isEpisode: false, blockedInGroup: false, hasPrevious: true, hasNext: true });
  assert.equal(state3.showPrevious, false);
  assert.equal(state3.showNext, false);
});
