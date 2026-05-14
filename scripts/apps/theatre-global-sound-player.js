import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

const GLOBAL_PLAYER_STORAGE_KEY = `${MODULE_ID}.globalSoundPlayer.position`;

export class TheatreGlobalSoundPlayerApplication extends Application {
  constructor(options = {}) {
    super(options);
    this._remoteOnly = Boolean(options.remoteOnly);
    this._rootElement = null;
    this._dragState = null;
    this._musicAudio = null;
    this._musicVolumePollId = null;
    this._lastFoundryMusicVolume = null;
    this._volume = 0.7;
    this._state = {
      trackId: "",
      src: "",
      label: "",
      playbackState: "stopped",
      position: 0,
      loop: false
    };
    this._soundboardPage = 0;
    this._isContentCollapsed = false;
    this._onMusicAudioEnded = this._onMusicAudioEnded.bind(this);
    this._onWindowMouseMove = this._onWindowMouseMove.bind(this);
    this._onWindowMouseUp = this._onWindowMouseUp.bind(this);
    this._boundRootHandlers = {
      "drag-global-sound-player": this._onDragStart.bind(this),
      "close-global-sound-player": this._onClose.bind(this),
      "play-global-track": this._onPlayTrack.bind(this),
      "global-audio-play": this._onAudioPlay.bind(this),
      "global-audio-pause": this._onAudioPause.bind(this),
      "global-audio-stop": this._onAudioStop.bind(this),
      "global-audio-loop": this._onAudioLoop.bind(this),
      "set-global-audio-volume": this._onSetVolume.bind(this),
      "toggle-global-player-content": this._onToggleContent.bind(this),
      "global-soundboard-page-prev": this._onSoundboardPagePrev.bind(this),
      "global-soundboard-page-next": this._onSoundboardPageNext.bind(this),
      "play-global-soundboard-item": this._onPlaySoundboardItem.bind(this)
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-global-sound-player`,
      title: tr("Player"),
      classes: [MODULE_ID, "theatre-global-sound-player-app"],
      popOut: false,
      minimizable: false,
      resizable: false,
      left: 128,
      top: 136,
      width: 640,
      height: 360,
      template: `modules/${MODULE_ID}/templates/apps/theatre-global-sound-player.hbs`
    });
  }

  getData() {
    const themeState = TheatreStore.getThemeState();
    const context = this._getGlobalSoundContext();
    const currentAudio = {
      ...this._state,
      volume: this._volume,
      volumePercent: Math.round(this._volume * 100),
      pageDisplay: this._soundboardPage + 1
    };
    const tracks = context.tracks.map((track) => ({
      ...track,
      isActive: this._state.trackId === track.id,
      showPlaybackStatus: this._state.trackId === track.id && ["playing", "paused"].includes(this._state.playbackState),
      isPaused: this._state.trackId === track.id && this._state.playbackState === "paused",
      isLooping: this._state.trackId === track.id && ["playing", "paused"].includes(this._state.playbackState) && this._state.loop
    }));
    const pageItems = context.soundboardPages[this._soundboardPage] ?? [];

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      hasControls: context.tracks.length > 0 || context.soundboard.length > 0,
      isContentCollapsed: this._isContentCollapsed,
      tracks,
      soundboardPageItems: pageItems.map((entry) => ({
        ...entry,
        buttonStyle: this._buildSoundboardTileStyle(entry)
      })),
      currentAudio,
      soundboardPageCount: Math.max(1, context.soundboardPages.length || 1),
      hasMultipleSoundboardPages: context.soundboardPages.length > 1,
      soundboardColumnCount: Math.max(1, Math.min(5, pageItems.length || 1))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._rootElement = html?.[0] ?? this._rootElement;
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    html?.[0]?.classList.toggle("is-remote-only", this._remoteOnly);
    this._applySavedPosition();
    this._bindRootListeners();
    this._syncAudioPlayback();
    this._startMusicVolumePolling();
    requestAnimationFrame(() => {
      const rootElement = this._getRootElement();
      applyThemeInlineStyleToHost(rootElement, TheatreStore.getThemeState());
      rootElement?.classList.toggle("is-remote-only", this._remoteOnly);
      this._applySavedPosition();
      this._bindRootListeners();
    });
  }

  _injectHTML(html) {
    const nextRoot = html[0];
    document.querySelectorAll(".tom-global-sound-player").forEach((element) => {
      if (element !== nextRoot) element.remove();
    });
    this._rootElement = nextRoot;
    document.body.appendChild(nextRoot);
  }

  _replaceHTML(element, html) {
    const nextRoot = html[0];
    const currentRoot = this._getRootElement();
    if (currentRoot && currentRoot !== nextRoot) {
      currentRoot.replaceWith(nextRoot);
    } else if (element && element !== nextRoot) {
      element.replaceWith(nextRoot);
    } else if (!nextRoot.isConnected) {
      document.body.appendChild(nextRoot);
    }
    this._rootElement = nextRoot;
    document.querySelectorAll(".tom-global-sound-player").forEach((rootElement) => {
      if (rootElement !== nextRoot) rootElement.remove();
    });
  }

  async close(options) {
    this._teardownDrag();
    this._destroyMusicAudioElement();
    this._stopMusicVolumePolling();
    this._rootElement?.remove?.();
    this._rootElement = null;
    return super.close(options);
  }

  _getRootElement() {
    if (this._rootElement?.isConnected) return this._rootElement;
    this._rootElement = document.querySelector(".tom-global-sound-player");
    return this._rootElement;
  }

  _getLegacyStoredPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_PLAYER_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  _getStoredPosition() {
    try {
      const state = TheatreStore.getGlobalSoundPlayerState();
      const legacy = this._getLegacyStoredPosition();
      if (legacy && Object.keys(legacy).length && !state?._migratedFromLocalStorage) {
        void TheatreStore.saveGlobalSoundPlayerPosition(legacy)
          .then(() => {
            try { localStorage.removeItem(GLOBAL_PLAYER_STORAGE_KEY); } catch (_error) {}
          })
          .catch(() => {});
        return legacy;
      }
      return state.position ?? {};
    } catch (_error) {
      return this._getLegacyStoredPosition();
    }
  }

  _saveStoredPosition(position = {}) {
    try {
      void TheatreStore.saveGlobalSoundPlayerPosition(position);
    } catch (_error) {
      // Local-only placement is a convenience, not critical state.
    }
  }

  _applySavedPosition() {
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const position = this._getStoredPosition();
    if (this._remoteOnly) {
      rootElement.style.display = "none";
      return;
    }
    const width = Math.max(420, Math.min(Number(position.width) || 640, window.innerWidth - 24));
    const left = Math.max(8, Math.min(Number(position.left) || 128, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(Number(position.top) || 136, window.innerHeight - 96));
    rootElement.style.position = "fixed";
    rootElement.style.left = `${left}px`;
    rootElement.style.top = `${top}px`;
    rootElement.style.width = `${width}px`;
    rootElement.style.right = "auto";
    rootElement.style.bottom = "auto";
    rootElement.style.zIndex = "330";
  }

  _bindRootListeners() {
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    for (const [action, handler] of Object.entries(this._boundRootHandlers)) {
      rootElement.querySelectorAll(`[data-action='${action}']`).forEach((element) => {
        if (action === "drag-global-sound-player") {
          element.onmousedown = handler;
          return;
        }
        if (action === "set-global-audio-volume") {
          element.oninput = handler;
          element.onchange = handler;
          return;
        }
        element.onclick = handler;
      });
    }
  }

  _notifyPlaybackError(error) {
    if (error?.name === "AbortError") return;
    console.warn(`${MODULE_ID} | Global player playback failed`, error);
    ui.notifications?.warn?.(tr("Audio playback could not be started. Please check the file path or browser audio permissions."));
  }

  _getFoundryMusicMasterVolume() {
    const candidates = ["globalPlaylistVolume", "playlistVolume", "globalMusicVolume", "musicVolume"];
    for (const key of candidates) {
      try {
        const value = game.settings?.get?.("core", key);
        if (Number.isFinite(Number(value))) {
          return Math.max(0, Math.min(1, Number(value)));
        }
      } catch (_error) {
        // continue with fallback candidates
      }
    }
    return 1;
  }

  _getEffectiveVolume(baseVolume = this._volume) {
    return Math.max(0, Math.min(1, Number(baseVolume) || 0)) * this._getFoundryMusicMasterVolume();
  }

  _applyEffectiveVolume() {
    if (!(this._musicAudio instanceof HTMLAudioElement)) return;
    this._musicAudio.volume = this._getEffectiveVolume(this._volume);
  }

  _startMusicVolumePolling() {
    if (this._musicVolumePollId) return;
    this._lastFoundryMusicVolume = this._getFoundryMusicMasterVolume();
    this._musicVolumePollId = window.setInterval(() => {
      const currentMaster = this._getFoundryMusicMasterVolume();
      if (this._lastFoundryMusicVolume !== null && Math.abs(currentMaster - this._lastFoundryMusicVolume) < 0.001) {
        return;
      }
      this._lastFoundryMusicVolume = currentMaster;
      this._applyEffectiveVolume();
    }, 400);
  }

  _stopMusicVolumePolling() {
    if (!this._musicVolumePollId) return;
    window.clearInterval(this._musicVolumePollId);
    this._musicVolumePollId = null;
    this._lastFoundryMusicVolume = null;
  }

  _emitControl(action, extra = {}) {
    if (!game.user?.isGM) return;
    game.socket?.emit?.(`module.${MODULE_ID}`, {
      action: "globalSoundPlayerControl",
      control: action,
      state: {
        ...this._state,
        volume: this._volume
      },
      ...extra
    });
  }

  applyRemoteControl(payload = {}) {
    const control = String(payload.control || "").trim();
    const remoteState = payload.state && typeof payload.state === "object" ? payload.state : {};
    if (Number.isFinite(Number(remoteState.volume))) {
      this._volume = Math.max(0, Math.min(1, Number(remoteState.volume)));
    }

    if (control === "soundboard") {
      const src = String(payload.src || "").trim();
      if (src) this._playSoundboardEffect(src, this._volume);
      return;
    }

    this._state = {
      ...this._state,
      trackId: remoteState.trackId ? String(remoteState.trackId) : this._state.trackId,
      src: remoteState.src !== undefined ? String(remoteState.src || "").trim() : this._state.src,
      label: remoteState.label !== undefined ? String(remoteState.label || "").trim() : this._state.label,
      loop: remoteState.loop !== undefined ? Boolean(remoteState.loop) : this._state.loop,
      playbackState: ["playing", "paused", "stopped"].includes(String(remoteState.playbackState || "").trim())
        ? String(remoteState.playbackState).trim()
        : this._state.playbackState,
      position: Number.isFinite(Number(remoteState.position)) ? Math.max(0, Number(remoteState.position)) : this._state.position
    };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
  }

  _escapeMarkup(value) {
    return foundry.utils.escapeHTML?.(String(value ?? "")) ?? String(value ?? "");
  }

  _refreshPlaybackUi() {
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const context = this._getGlobalSoundContext();
    const current = this._state;

    rootElement.querySelectorAll("[data-action='play-global-track']").forEach((element) => {
      const track = context.tracks.find((entry) => entry.id === element.dataset.trackId) ?? null;
      const isActive = Boolean(track && current.trackId === track.id);
      const isPlaying = isActive && current.playbackState === "playing";
      const isPaused = isActive && current.playbackState === "paused";
      const showPlaybackStatus = isPlaying || isPaused;
      element.classList.toggle("is-active", isActive);
      element.classList.toggle("is-looping", showPlaybackStatus && current.loop);
      element.classList.toggle("is-paused", isPaused);

      let statusElement = element.querySelector(".tom-global-sound-player__track-status");
      if (!showPlaybackStatus) {
        statusElement?.remove?.();
        return;
      }

      if (!statusElement) {
        statusElement = document.createElement("span");
        statusElement.className = "tom-global-sound-player__track-status";
        statusElement.setAttribute("aria-hidden", "true");
        element.appendChild(statusElement);
      }
      const playbackIcon = isPaused
        ? '<span class="tom-global-sound-player__track-status-icon is-pause"></span>'
        : '<span class="tom-global-sound-player__track-status-icon is-play"></span>';
      statusElement.classList.toggle("has-loop", Boolean(current.loop));
      statusElement.innerHTML = `${playbackIcon}${current.loop ? '<span class="tom-global-sound-player__track-status-icon is-loop"></span>' : ""}`;
    });

    const loopButton = rootElement.querySelector("[data-action='global-audio-loop']");
    if (loopButton instanceof HTMLElement) {
      loopButton.classList.toggle("is-active", Boolean(current.loop));
      loopButton.setAttribute("aria-pressed", current.loop ? "true" : "false");
      loopButton.setAttribute("title", current.loop ? tr("Disable loop") : tr("Enable loop"));
      loopButton.setAttribute("aria-label", current.loop ? tr("Disable loop") : tr("Enable loop"));
    }

    const volumeInput = rootElement.querySelector("[data-action='set-global-audio-volume']");
    if (volumeInput instanceof HTMLInputElement) {
      volumeInput.value = String(this._volume);
    }
    const volumeValue = rootElement.querySelector(".tom-scene-sound-panel__volume-value");
    if (volumeValue instanceof HTMLElement) {
      volumeValue.textContent = `${Math.round(this._volume * 100)}%`;
    }
  }

  _resolveSoundEntry(entry = {}, playlistName = "", index = 0, prefix = "entry") {
    if (!entry || typeof entry !== "object") return null;
    if (entry.sourceType === "playlistSound") {
      const playlist = game.playlists?.get?.(entry.playlistId) ?? null;
      const sound = playlist?.sounds?.get?.(entry.soundId) ?? null;
      const src = String(sound?.path || "").trim();
      if (!src) return null;
      return {
        id: `${prefix}:${entry.id || `${playlist?.id || "playlist"}:${sound?.id || index}`}`,
        label: String(entry.label || sound?.name || src.split("/").pop() || tr("Sound")).trim(),
        src,
        icon: String(entry.icon || "").trim(),
        playlistName: playlistName || playlist?.name || ""
      };
    }

    const src = String(entry.path || "").trim();
    if (!src) return null;
    return {
      id: `${prefix}:${entry.id || index}`,
      label: String(entry.label || src.split("/").pop() || tr("Sound")).trim(),
      src,
      icon: String(entry.icon || "").trim(),
      playlistName
    };
  }

  _getGlobalSoundContext() {
    const playlists = TheatreStore.getGlobalSoundPlaylists();
    const tracks = [];
    const soundboard = [];
    playlists.forEach((playlist) => {
      (playlist.tracks ?? []).forEach((entry, index) => {
        const resolved = this._resolveSoundEntry(entry, playlist.name, index, `global-track:${playlist.id}`);
        if (resolved) tracks.push(resolved);
      });
      (playlist.soundboard ?? []).forEach((entry, index) => {
        const resolved = this._resolveSoundEntry(entry, playlist.name, index, `global-soundboard:${playlist.id}`);
        if (resolved) soundboard.push(resolved);
      });
    });

    const soundboardPages = [];
    for (let index = 0; index < soundboard.length; index += 10) {
      soundboardPages.push(soundboard.slice(index, index + 10));
    }
    if (this._soundboardPage >= soundboardPages.length) {
      this._soundboardPage = Math.max(0, soundboardPages.length - 1);
    }
    return { playlists, tracks, soundboard, soundboardPages };
  }

  _buildSoundboardTileStyle(entry = {}) {
    const imagePath = String(entry.icon || "").trim();
    if (!imagePath) return "";
    const escapedPath = imagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      `background-image:linear-gradient(rgba(7, 15, 26, 0.28), rgba(7, 15, 26, 0.28)),url(\"${escapedPath}\")`,
      "background-position:center center",
      "background-size:cover",
      "background-repeat:no-repeat"
    ].join(";");
  }

  _ensureMusicAudioElement() {
    if (this._musicAudio) return this._musicAudio;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    audio.addEventListener("ended", this._onMusicAudioEnded);
    document.body.appendChild(audio);
    this._musicAudio = audio;
    return audio;
  }

  _onMusicAudioEnded() {
    if (this._state.loop) return;
    const context = this._getGlobalSoundContext();
    const currentIndex = context.tracks.findIndex((track) => track.id === this._state.trackId);
    const nextTrack = currentIndex >= 0 ? context.tracks[currentIndex + 1] : null;
    if (nextTrack) {
      this._state = {
        ...this._state,
        trackId: nextTrack.id,
        src: nextTrack.src,
        label: nextTrack.label,
        playbackState: "playing",
        position: 0
      };
    } else {
      this._state = { ...this._state, playbackState: "stopped", position: 0 };
    }
    this._syncAudioPlayback();
    this.render(false);
  }

  _destroyMusicAudioElement() {
    if (!this._musicAudio) return;
    this._musicAudio.removeEventListener("ended", this._onMusicAudioEnded);
    this._musicAudio.pause?.();
    this._musicAudio.remove?.();
    this._musicAudio = null;
  }

  _syncAudioPlayback() {
    const context = this._getGlobalSoundContext();
    const audio = this._ensureMusicAudioElement();
    const targetTrack = context.tracks.find((track) => track.id === this._state.trackId) ?? null;
    this._applyEffectiveVolume();
    audio.loop = Boolean(this._state.loop);
    audio.toggleAttribute("loop", Boolean(this._state.loop));

    if (!targetTrack || !this._state.src) {
      audio.pause();
      try { audio.currentTime = 0; } catch (_error) {}
      return;
    }

    const normalizedSrc = String(targetTrack.src || this._state.src || "").trim();
    if (normalizedSrc && (audio.getAttribute("src") || "") !== normalizedSrc) {
      audio.setAttribute("src", normalizedSrc);
      audio.load();
    }

    if (this._state.playbackState === "playing") {
      void audio.play().catch((error) => this._notifyPlaybackError(error));
    } else if (this._state.playbackState === "paused") {
      audio.pause();
    } else {
      audio.pause();
      try { audio.currentTime = 0; } catch (_error) {}
    }
  }

  _playSoundboardEffect(src, volume = 1) {
    const normalizedSrc = String(src || "").trim();
    if (!normalizedSrc) return;
    const normalizedVolume = this._getEffectiveVolume(volume);
    if (globalThis.AudioHelper?.play) {
      try {
        globalThis.AudioHelper.play({ src: normalizedSrc, volume: normalizedVolume, loop: false }, false);
        return;
      } catch (_error) {
        // fall through to plain audio
      }
    }
    const effectAudio = new Audio(normalizedSrc);
    effectAudio.volume = normalizedVolume;
    void effectAudio.play().catch(() => {});
  }

  _onDragStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    this._dragState = {
      offsetX: event.clientX - rootElement.getBoundingClientRect().left,
      offsetY: event.clientY - rootElement.getBoundingClientRect().top
    };
    document.addEventListener("mousemove", this._onWindowMouseMove);
    document.addEventListener("mouseup", this._onWindowMouseUp);
  }

  _onWindowMouseMove(event) {
    if (!this._dragState) return;
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const rect = rootElement.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.min(event.clientX - this._dragState.offsetX, window.innerWidth - rect.width - 8));
    const nextTop = Math.max(8, Math.min(event.clientY - this._dragState.offsetY, window.innerHeight - rect.height - 8));
    rootElement.style.left = `${nextLeft}px`;
    rootElement.style.top = `${nextTop}px`;
  }

  _onWindowMouseUp() {
    const rootElement = this._getRootElement();
    if (rootElement) {
      this._saveStoredPosition({
        left: Number.parseFloat(rootElement.style.left || "0") || 0,
        top: Number.parseFloat(rootElement.style.top || "0") || 0,
        width: Number.parseFloat(rootElement.style.width || "0") || 640
      });
    }
    this._teardownDrag();
  }

  _teardownDrag() {
    this._dragState = null;
    document.removeEventListener("mousemove", this._onWindowMouseMove);
    document.removeEventListener("mouseup", this._onWindowMouseUp);
  }

  _onClose(event) {
    event.preventDefault();
    game.modules.get(MODULE_ID)?.api?.closeGlobalSoundPlayer?.();
  }

  _onPlayTrack(event) {
    event.preventDefault();
    const trackId = String(event.currentTarget.dataset.trackId || "").trim();
    const track = this._getGlobalSoundContext().tracks.find((entry) => entry.id === trackId) ?? null;
    if (!track?.src) return;
    this._state = { ...this._state, trackId: track.id, src: track.src, label: track.label, playbackState: "playing", position: 0 };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
    this._emitControl("play");
  }

  _onAudioPlay(event) {
    event.preventDefault();
    const context = this._getGlobalSoundContext();
    const nextTrack = context.tracks.find((track) => track.id === this._state.trackId) ?? context.tracks[0] ?? null;
    if (!nextTrack) return;
    this._state = {
      ...this._state,
      trackId: nextTrack.id,
      src: nextTrack.src,
      label: nextTrack.label,
      playbackState: "playing"
    };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
    this._emitControl("play");
  }

  _onAudioPause(event) {
    event.preventDefault();
    const audio = this._ensureMusicAudioElement();
    this._state = { ...this._state, playbackState: "paused", position: audio.currentTime || 0 };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
    this._emitControl("pause");
  }

  _onAudioStop(event) {
    event.preventDefault();
    this._state = { ...this._state, playbackState: "stopped", position: 0 };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
    this._emitControl("stop");
  }

  _onAudioLoop(event) {
    event.preventDefault();
    this._state = { ...this._state, loop: !this._state.loop };
    this._syncAudioPlayback();
    this._refreshPlaybackUi();
    this._emitControl("loop");
  }

  _onSetVolume(event) {
    this._volume = Math.max(0, Math.min(1, Number(event.currentTarget?.value) || 0));
    const audio = this._ensureMusicAudioElement();
    this._applyEffectiveVolume();
    const rootElement = this._getRootElement();
    const valueElement = rootElement?.querySelector(".tom-scene-sound-panel__volume-value");
    if (valueElement) valueElement.textContent = `${Math.round(this._volume * 100)}%`;
    this._emitControl("volume");
  }

  _onToggleContent(event) {
    event.preventDefault();
    this._isContentCollapsed = !this._isContentCollapsed;
    this.render(false);
  }

  _onSoundboardPagePrev(event) {
    event.preventDefault();
    this._soundboardPage = Math.max(0, this._soundboardPage - 1);
    this.render(false);
  }

  _onSoundboardPageNext(event) {
    event.preventDefault();
    const context = this._getGlobalSoundContext();
    this._soundboardPage = Math.min(Math.max(0, context.soundboardPages.length - 1), this._soundboardPage + 1);
    this.render(false);
  }

  _onPlaySoundboardItem(event) {
    event.preventDefault();
    const soundboardId = String(event.currentTarget.dataset.soundboardId || "").trim();
    const entry = this._getGlobalSoundContext().soundboard.find((sound) => sound.id === soundboardId) ?? null;
    if (!entry?.src) return;
    this._playSoundboardEffect(entry.src, this._volume);
    this._emitControl("soundboard", { src: entry.src, label: entry.label });
  }
}
