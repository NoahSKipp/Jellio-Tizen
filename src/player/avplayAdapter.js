// Dual-engine media playback manager: Samsung AVPlay native hardware decoder with HTML5 fallback.

export const EngineType = Object.freeze({
  AVPLAY: 'AVPLAY',
  HTML5: 'HTML5',
});

export const PlayState = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  BUFFERING: 'BUFFERING',
  ENDED: 'ENDED',
  ERROR: 'ERROR',
});

export class AvplayAdapter {
  constructor(options = {}) {
    this.options = options;
    this.avplayEl = options.avplayEl || (typeof document !== 'undefined' ? document.getElementById('av-player') : null);
    this.html5El = options.html5El || (typeof document !== 'undefined' ? document.getElementById('html5-player') : null);
    this.mountEl = options.mountEl || (typeof document !== 'undefined' ? document.getElementById('jellio-player-mount') : null);

    this.engineType = this.detectEngine();
    this.state = PlayState.IDLE;
    this.url = '';
    this.durationMs = 0;
    this.currentTimeMs = 0;
    this.playbackSpeed = 1.0;
    this.audioTracks = [];
    this.subtitleTracks = [];
    this.selectedAudioIndex = -1;
    this.selectedSubtitleIndex = -1;

    this.listeners = new Map();
    this.timeUpdateTimer = null;
    this.isSeeking = false;
    this.prepared = false;

    this.bindHtml5Events();
  }

  detectEngine() {
    if (typeof window !== 'undefined' && window.webapis && window.webapis.avplay) {
      return EngineType.AVPLAY;
    }
    return EngineType.HTML5;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event, ...args) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (_) {}
      }
    }
  }

  loadStream(url, startMs = 0, opts = {}) {
    this.destroy();
    this.url = url;
    this.state = PlayState.LOADING;
    this.emit('statechange', this.state);

    if (this.mountEl) {
      if (this.mountEl.classList && typeof this.mountEl.classList.add === 'function') {
        this.mountEl.classList.add('jellio-player-active');
      }
      if (typeof this.mountEl.removeAttribute === 'function') {
        this.mountEl.removeAttribute('aria-hidden');
      }
    }

    if (this.engineType === EngineType.AVPLAY) {
      return this.loadAvplay(url, startMs, opts);
    } else {
      return this.loadHtml5(url, startMs, opts);
    }
  }

  loadAvplay(url, startMs = 0, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        const avplay = window.webapis.avplay;
        avplay.open(url);
        avplay.setDisplayRect(0, 0, 1920, 1080);

        if (opts.drm) {
          try {
            avplay.setDrm(opts.drm.type, opts.drm.operation, JSON.stringify(opts.drm.data || {}));
          } catch (_) {}
        }

        const listener = {
          onbufferingstart: () => {
            this.state = PlayState.BUFFERING;
            this.emit('bufferingstart');
            this.emit('statechange', this.state);
          },
          onbufferingprogress: (percent) => {
            this.emit('bufferingprogress', percent);
          },
          onbufferingcomplete: () => {
            if (this.state === PlayState.BUFFERING) {
              this.state = PlayState.PLAYING;
              this.emit('bufferingcomplete');
              this.emit('statechange', this.state);
            }
          },
          oncurrentplaytime: (ms) => {
            this.currentTimeMs = ms;
            this.emit('timeupdate', ms, this.durationMs);
          },
          onerror: (err) => {
            this.state = PlayState.ERROR;
            this.emit('error', err);
            this.emit('statechange', this.state);
          },
          onevent: (eventType, eventData) => {
            this.emit('event', eventType, eventData);
            if (eventType === 'PLAYER_MSG_BITRATE_CHANGE') {
              this.emit('bitratechange', eventData);
            }
          },
          onsubtitlechange: (duration, text, data3, data4) => {
            this.emit('subtitlechange', text);
          },
          ondrmevent: (drmType, drmData) => {
            this.emit('drmevent', drmType, drmData);
          },
          onstreamcompleted: () => {
            this.state = PlayState.ENDED;
            this.emit('ended');
            this.emit('statechange', this.state);
          },
        };

        avplay.setListener(listener);

        avplay.prepareAsync(
          () => {
            this.prepared = true;
            try {
              this.durationMs = avplay.getDuration();
            } catch (_) {
              this.durationMs = 0;
            }
            this.refreshAvplayTracks();

            if (startMs > 0) {
              try {
                avplay.seekTo(
                  startMs,
                  () => {
                    this.currentTimeMs = startMs;
                    this.state = PlayState.READY;
                    this.emit('ready', { durationMs: this.durationMs, startMs });
                    this.emit('statechange', this.state);
                    resolve();
                  },
                  () => {
                    this.state = PlayState.READY;
                    this.emit('ready', { durationMs: this.durationMs, startMs: 0 });
                    this.emit('statechange', this.state);
                    resolve();
                  }
                );
                return;
              } catch (_) {}
            }

            this.state = PlayState.READY;
            this.emit('ready', { durationMs: this.durationMs, startMs });
            this.emit('statechange', this.state);
            resolve();
          },
          (err) => {
            this.state = PlayState.ERROR;
            this.emit('error', err);
            this.emit('statechange', this.state);
            reject(err);
          }
        );
      } catch (err) {
        this.state = PlayState.ERROR;
        this.emit('error', err);
        this.emit('statechange', this.state);
        reject(err);
      }
    });
  }

  loadHtml5(url, startMs = 0) {
    return new Promise((resolve, reject) => {
      if (!this.html5El) {
        const err = new Error('HTML5 video element not available');
        this.state = PlayState.ERROR;
        this.emit('error', err);
        return reject(err);
      }

      const video = this.html5El;
      video.src = url;
      video.load();

      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        this.prepared = true;
        this.durationMs = Math.round((video.duration || 0) * 1000);
        this.refreshHtml5Tracks();

        if (startMs > 0) {
          video.currentTime = startMs / 1000;
        }

        this.state = PlayState.READY;
        this.emit('ready', { durationMs: this.durationMs, startMs });
        this.emit('statechange', this.state);
        resolve();
      };

      const onError = (e) => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        this.state = PlayState.ERROR;
        const err = video.error || new Error('Video loading failed');
        this.emit('error', err);
        this.emit('statechange', this.state);
        reject(err);
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);
    });
  }

  bindHtml5Events() {
    if (!this.html5El) return;
    const video = this.html5El;

    video.addEventListener('timeupdate', () => {
      if (this.engineType !== EngineType.HTML5) return;
      this.currentTimeMs = Math.round(video.currentTime * 1000);
      this.durationMs = Math.round((video.duration || 0) * 1000);
      this.emit('timeupdate', this.currentTimeMs, this.durationMs);
    });

    video.addEventListener('waiting', () => {
      if (this.engineType !== EngineType.HTML5) return;
      this.state = PlayState.BUFFERING;
      this.emit('bufferingstart');
      this.emit('statechange', this.state);
    });

    video.addEventListener('playing', () => {
      if (this.engineType !== EngineType.HTML5) return;
      this.state = PlayState.PLAYING;
      this.emit('bufferingcomplete');
      this.emit('play');
      this.emit('statechange', this.state);
    });

    video.addEventListener('pause', () => {
      if (this.engineType !== EngineType.HTML5) return;
      if (this.state !== PlayState.ENDED) {
        this.state = PlayState.PAUSED;
        this.emit('pause');
        this.emit('statechange', this.state);
      }
    });

    video.addEventListener('ended', () => {
      if (this.engineType !== EngineType.HTML5) return;
      this.state = PlayState.ENDED;
      this.emit('ended');
      this.emit('statechange', this.state);
    });
  }

  play() {
    if (this.engineType === EngineType.AVPLAY) {
      try {
        const avplay = window.webapis.avplay;
        avplay.play();
        this.state = PlayState.PLAYING;
        this.emit('play');
        this.emit('statechange', this.state);
      } catch (err) {
        this.emit('error', err);
      }
    } else if (this.html5El) {
      this.html5El.play().catch((err) => {
        this.emit('error', err);
      });
    }
  }

  pause() {
    if (this.engineType === EngineType.AVPLAY) {
      try {
        const avplay = window.webapis.avplay;
        avplay.pause();
        this.state = PlayState.PAUSED;
        this.emit('pause');
        this.emit('statechange', this.state);
      } catch (err) {
        this.emit('error', err);
      }
    } else if (this.html5El) {
      this.html5El.pause();
    }
  }

  togglePlayPause() {
    if (this.state === PlayState.PLAYING) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(targetMs) {
    const clamped = Math.max(0, Math.min(this.durationMs || Infinity, targetMs));
    this.currentTimeMs = clamped;
    this.isSeeking = true;
    this.emit('seeking', clamped);

    if (this.engineType === EngineType.AVPLAY) {
      try {
        const avplay = window.webapis.avplay;
        avplay.seekTo(
          clamped,
          () => {
            this.isSeeking = false;
            this.emit('seeked', clamped);
          },
          (err) => {
            this.isSeeking = false;
            this.emit('error', err);
          }
        );
      } catch (err) {
        this.isSeeking = false;
        this.emit('error', err);
      }
    } else if (this.html5El) {
      this.html5El.currentTime = clamped / 1000;
      this.isSeeking = false;
      this.emit('seeked', clamped);
    }
  }

  stepSeek(seconds) {
    const deltaMs = seconds * 1000;
    this.seek(this.currentTimeMs + deltaMs);
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
    if (this.engineType === EngineType.AVPLAY) {
      try {
        window.webapis.avplay.setSpeed(speed);
      } catch (err) {
        this.emit('error', err);
      }
    } else if (this.html5El) {
      this.html5El.playbackRate = speed;
    }
    this.emit('speedchange', speed);
  }

  getDuration() {
    return this.durationMs;
  }

  getCurrentTime() {
    if (this.engineType === EngineType.AVPLAY && window.webapis?.avplay) {
      try {
        return window.webapis.avplay.getCurrentTime();
      } catch (_) {}
    } else if (this.html5El) {
      return Math.round(this.html5El.currentTime * 1000);
    }
    return this.currentTimeMs;
  }

  refreshAvplayTracks() {
    this.audioTracks = [];
    this.subtitleTracks = [];
    try {
      const avplay = window.webapis.avplay;
      const trackInfo = avplay.getTotalTrackInfo();
      if (Array.isArray(trackInfo)) {
        trackInfo.forEach((tr, idx) => {
          const type = (tr.type || '').toUpperCase();
          const extra = typeof tr.extra_info === 'string' ? JSON.parse(tr.extra_info || '{}') : (tr.extra_info || {});
          const track = {
            index: tr.index !== undefined ? tr.index : idx,
            type,
            language: extra.language || tr.language || 'und',
            channels: extra.channels || 2,
            codec: extra.four_cc || extra.codec || '',
            extra,
          };
          if (type === 'AUDIO') {
            this.audioTracks.push(track);
          } else if (type === 'TEXT') {
            this.subtitleTracks.push(track);
          }
        });
      }
    } catch (_) {}
  }

  refreshHtml5Tracks() {
    this.audioTracks = [];
    this.subtitleTracks = [];
    if (!this.html5El) return;

    if (this.html5El.audioTracks) {
      for (let i = 0; i < this.html5El.audioTracks.length; i++) {
        const at = this.html5El.audioTracks[i];
        this.audioTracks.push({
          index: i,
          type: 'AUDIO',
          language: at.language || 'und',
          label: at.label || `Audio ${i + 1}`,
          enabled: at.enabled,
        });
      }
    }

    if (this.html5El.textTracks) {
      for (let i = 0; i < this.html5El.textTracks.length; i++) {
        const tt = this.html5El.textTracks[i];
        this.subtitleTracks.push({
          index: i,
          type: 'TEXT',
          language: tt.language || 'und',
          label: tt.label || `Subtitle ${i + 1}`,
          mode: tt.mode,
        });
      }
    }
  }

  getAudioTracks() {
    return this.audioTracks;
  }

  selectAudioTrack(index) {
    this.selectedAudioIndex = index;
    if (this.engineType === EngineType.AVPLAY) {
      try {
        window.webapis.avplay.setSelectTrack('AUDIO', index);
      } catch (err) {
        this.emit('error', err);
      }
    } else if (this.html5El && this.html5El.audioTracks) {
      for (let i = 0; i < this.html5El.audioTracks.length; i++) {
        this.html5El.audioTracks[i].enabled = i === index;
      }
    }
    this.emit('audiotrackchange', index);
  }

  getSubtitleTracks() {
    return this.subtitleTracks;
  }

  selectSubtitleTrack(index) {
    this.selectedSubtitleIndex = index;
    if (this.engineType === EngineType.AVPLAY) {
      try {
        if (index < 0) {
          // Off
          window.webapis.avplay.setSelectTrack('TEXT', -1);
        } else {
          window.webapis.avplay.setSelectTrack('TEXT', index);
        }
      } catch (err) {
        this.emit('error', err);
      }
    } else if (this.html5El && this.html5El.textTracks) {
      for (let i = 0; i < this.html5El.textTracks.length; i++) {
        this.html5El.textTracks[i].mode = i === index ? 'showing' : 'disabled';
      }
    }
    this.emit('subtitletrackchange', index);
  }

  destroy() {
    this.prepared = false;
    this.state = PlayState.IDLE;
    if (this.timeUpdateTimer) {
      clearInterval(this.timeUpdateTimer);
      this.timeUpdateTimer = null;
    }

    if (this.engineType === EngineType.AVPLAY) {
      try {
        const avplay = window.webapis?.avplay;
        if (avplay) {
          try { avplay.stop(); } catch (_) {}
          try { avplay.close(); } catch (_) {}
        }
      } catch (_) {}
    } else if (this.html5El) {
      try {
        this.html5El.pause();
        this.html5El.removeAttribute('src');
        this.html5El.load();
      } catch (_) {}
    }

    if (this.mountEl) {
      if (this.mountEl.classList && typeof this.mountEl.classList.remove === 'function') {
        this.mountEl.classList.remove('jellio-player-active');
      }
      if (typeof this.mountEl.setAttribute === 'function') {
        this.mountEl.setAttribute('aria-hidden', 'true');
      }
    }

    this.emit('statechange', this.state);
  }
}
