import { MODULE_ID, POSITION_OPTIONS } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, isVideoMediaPath, resolveFoundryDocumentDrop } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { ensureGsap } from "../vendor/gsap-loader.js";

export class TheatreOverlayApplication extends Application {
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
    this.expandedMoodSceneActorId = null;
    this.isDimControlsOpen = false;
    this.isGmBarCollapsed = false;
    this.isSoundControlsOpen = false;
    this.isSoundPanelContentCollapsed = false;
    this.soundboardPage = 0;
    this._dragState = null;
    this._recentlyDraggedSceneActorId = null;
    this._transformPersistTimeouts = new Map();
    this._boundPointerMove = this._onActorPointerMove.bind(this);
    this._boundPointerUp = this._onActorPointerUp.bind(this);
    this._lastActorImages = {};
    this._boundBackgroundMediaLoad = this._onBackgroundMediaLoad.bind(this);
    this._musicAudio = null;
    this._lastSoundboardTriggerId = null;
    this._musicVolumePollId = null;
    this._lastFoundryMusicVolume = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-overlay`,
      title: tr("Footlights Overlay"),
      classes: [MODULE_ID, "theatre-overlay-app"],
      popOut: false,
      minimizable: false,
      resizable: false,
      width: window.innerWidth,
      height: window.innerHeight,
      template: `modules/${MODULE_ID}/templates/apps/theatre-overlay.hbs`
    });
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
      id: `${prefix}:${entry.id || `${index}`}`,
      label: String(entry.label || src.split("/").pop() || tr("Sound")).trim(),
      src,
      icon: String(entry.icon || "").trim(),
      playlistName
    };
  }

  _escapeMarkup(value) {
    return foundry.utils.escapeHTML?.(String(value ?? "")) ?? String(value ?? "");
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

  _getSceneSoundContext(theatreScene = null) {
    const scene = theatreScene ?? this.manager.getActiveScene?.();
    if (!scene?.id) {
      return {
        playlists: [],
        tracks: [],
        soundboard: [],
        soundboardPages: [],
        currentAudio: this.manager.getSceneAudioState()
      };
    }

    const playlists = TheatreStore.getSceneSoundPlaylists(scene.id);
    const tracks = [];
    const soundboard = [];

    playlists.forEach((playlist) => {
      (playlist.tracks ?? []).forEach((entry, index) => {
        const resolved = this._resolveSoundEntry(entry, playlist.name, index, "track");
        if (resolved) tracks.push(resolved);
      });
      (playlist.soundboard ?? []).forEach((entry, index) => {
        const resolved = this._resolveSoundEntry(entry, playlist.name, index, "soundboard");
        if (resolved) soundboard.push(resolved);
      });
    });

    const soundboardPages = [];
    for (let index = 0; index < soundboard.length; index += 10) {
      soundboardPages.push(soundboard.slice(index, index + 10));
    }
    if (this.soundboardPage >= soundboardPages.length) {
      this.soundboardPage = Math.max(0, soundboardPages.length - 1);
    }

    return {
      playlists,
      tracks,
      soundboard,
      soundboardPages,
      currentAudio: this.manager.getSceneAudioState()
    };
  }

  _ensureMusicAudioElement() {
    if (this._musicAudio) return this._musicAudio;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    audio.addEventListener("ended", () => {
      const context = this._getSceneSoundContext();
      const current = this.manager.getSceneAudioState();
      if (current.loop) return;
      if (!game.user?.isGM) return;
      const currentIndex = context.tracks.findIndex((track) => track.id === current.trackId);
      const nextTrack = currentIndex >= 0 ? context.tracks[currentIndex + 1] : null;
      if (nextTrack) {
        void this.manager.setSceneAudioState({
          trackId: nextTrack.id,
          src: nextTrack.src,
          label: nextTrack.label,
          playbackState: "playing",
          position: 0
        }, { skipRender: true }).then(() => {
          const nextContext = this._getSceneSoundContext();
          this._syncSceneAudioPlayback(nextContext);
          this._refreshSoundControlsUi(nextContext);
        });
      } else {
        void this.manager.setSceneAudioState({
          playbackState: "stopped",
          position: 0
        }, { skipRender: true }).then(() => {
          const nextContext = this._getSceneSoundContext();
          this._syncSceneAudioPlayback(nextContext);
          this._refreshSoundControlsUi(nextContext);
        });
      }
    });
    document.body.appendChild(audio);
    this._musicAudio = audio;
    return audio;
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

  _getEffectiveSceneAudioVolume(baseVolume) {
    const sceneVolume = Math.max(0, Math.min(1, Number(baseVolume) || 0));
    return Math.max(0, Math.min(1, sceneVolume * this._getFoundryMusicMasterVolume()));
  }

  _applyEffectiveSceneAudioVolume(audio, baseVolume) {
    if (!(audio instanceof HTMLAudioElement)) return;
    audio.volume = this._getEffectiveSceneAudioVolume(baseVolume);
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
      if (this._musicAudio) {
        this._applyEffectiveSceneAudioVolume(this._musicAudio, this.manager.getSceneAudioState().volume);
      }
    }, 400);
  }

  _stopMusicVolumePolling() {
    if (!this._musicVolumePollId) return;
    window.clearInterval(this._musicVolumePollId);
    this._musicVolumePollId = null;
    this._lastFoundryMusicVolume = null;
  }

  async getData() {
    const isGM = Boolean(game.user?.isGM);
    const theatreScene = this.manager.getActiveScene();
    const backgroundPath = String(theatreScene?.background || "").trim();
    const preserveBackgroundAspect = theatreScene?.settings?.preserveBackgroundAspect !== false;
    const backdropImagePath = String(theatreScene?.settings?.backdropImage || "").trim();
    const backdropBlurEnabled = theatreScene?.settings?.backdropBlurEnabled !== false;
    const backdropDarkness = Number.isFinite(Number(theatreScene?.settings?.backdropDarkness))
      ? Math.max(0, Math.min(0.92, Number(theatreScene.settings.backdropDarkness)))
      : 0.2;
    const themeState = TheatreStore.getThemeState();
    const playEntranceAnimation = Boolean(this.playEntranceAnimation);
    this.playEntranceAnimation = false;
    const managerActors = this.manager.getRenderableActors();
    const soundContext = this._getSceneSoundContext(theatreScene);
    const currentSceneAudio = soundContext.currentAudio;
    const sceneSoundTracks = soundContext.tracks.map((track) => ({
      ...track,
      isActive: currentSceneAudio.trackId === track.id,
      showPlaybackStatus: currentSceneAudio.trackId === track.id && currentSceneAudio.playbackState === "playing",
      isLooping: currentSceneAudio.trackId === track.id
        && currentSceneAudio.playbackState === "playing"
        && Boolean(currentSceneAudio.loop)
    }));
    const highlightedNames = managerActors.filter((actor) => actor.isHighlighted).map((actor) => actor.actorName);
    const stageMetrics = this._getStageMetrics(managerActors.length, isGM, highlightedNames.length);
    const nextActorImages = {};
    const renderableActors = managerActors.map((actor) => ({
      ...actor,
      showVisibilityToggle: isGM,
      isMoodMenuOpen: this.expandedMoodSceneActorId === actor.sceneActorId,
      positionClass: POSITION_OPTIONS.includes(actor.position) ? actor.position : "custom",
      style: this._buildActorStyle(actor),
      stageRoleLabel: actor.mood ? `${actor.actorName}, Stimmung ${actor.mood}` : actor.actorName,
      previousActorImage: this._lastActorImages[actor.sceneActorId] || "",
      imageTransitioning: Boolean(
        this._lastActorImages[actor.sceneActorId]
        && this._lastActorImages[actor.sceneActorId] !== actor.actorImage
      )
    })).map((actor) => {
      nextActorImages[actor.sceneActorId] = actor.actorImage;
      return actor;
    });

    this._lastActorImages = nextActorImages;

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      theatreScene,
      renderableActors,
      isGM,
      isDimControlsOpen: this.isDimControlsOpen && isGM,
      isGmBarCollapsed: this.isGmBarCollapsed && isGM,
      isSoundControlsOpen: this.isSoundControlsOpen && isGM && (soundContext.tracks.length > 0 || soundContext.soundboard.length > 0),
      isSoundPanelContentCollapsed: this.isSoundPanelContentCollapsed,
      hasSceneSoundControls: isGM && (soundContext.tracks.length > 0 || soundContext.soundboard.length > 0),
      sceneSoundTracks,
      sceneSoundboardPageItems: (soundContext.soundboardPages[this.soundboardPage] ?? []).map((entry) => ({
        ...entry,
        buttonStyle: this._buildSoundboardTileStyle(entry)
      })),
      sceneSoundboardPage: this.soundboardPage,
      sceneSoundboardPageCount: Math.max(1, soundContext.soundboardPages.length || 1),
      hasMultipleSoundboardPages: soundContext.soundboardPages.length > 1,
      currentSceneAudio: {
        ...currentSceneAudio,
        volumePercent: Math.round((Number(currentSceneAudio.volume) || 0) * 100),
        pageDisplay: this.soundboardPage + 1
      },
      backgroundDimPercent: Math.round(this.manager.getBackgroundDim() * 100),
      backgroundPath,
      backgroundIsVideo: isVideoMediaPath(backgroundPath),
      backgroundFitClass: preserveBackgroundAspect ? "is-cover" : "is-fill",
      hasCinematicBars: this._getCinematicBarInset(theatreScene) > 0,
      cinematicBarsStyle: this._buildCinematicBarsStyle(theatreScene),
      backdropBlurEnabled,
      hasBackdropMedia: Boolean(backdropImagePath),
      backdropMediaStyle: this._buildBackdropMediaStyle(theatreScene),
      backdropDimStyle: `opacity:${backdropDarkness};`,
      playEntranceAnimation,
      stageTitle: theatreScene?.stageTitle || theatreScene?.name || "",
      stageSubtitle: theatreScene?.stageSubtitle || "",
      highlightedActorsLabel: highlightedNames.length ? highlightedNames.join(", ") : tr("No highlight"),
      isSceneRevealedToPlayers: this.manager.isSceneRevealedToPlayers(theatreScene?.id),
      isLeftSidebarVisible: this.manager.isSharedLeftSidebarVisible(),
      isRightSidebarVisible: this.manager.isSharedRightSidebarVisible(),
      stageStyle: `${this._buildStageStyle(stageMetrics)};${this._buildCinematicBarsStyle(theatreScene)}`
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    const theatreScene = this.manager.getActiveScene();

    html.find("[data-action='select-speaker']").on("click", this._onSelectSpeaker.bind(this));
    html.find("[data-action='toggle-moods']").on("click", this._onToggleMoods.bind(this));
    html.find("[data-action='remove-actor-from-scene']").on("click", this._onRemoveActorFromScene.bind(this));
    html.find("[data-action='toggle-actor-mirror']").on("click", this._onToggleActorMirror.bind(this));
    html.find("[data-action='toggle-actor-name']").on("click", this._onToggleActorName.bind(this));
    html.find("[data-action='toggle-actor-visibility']").on("click", this._onToggleActorVisibility.bind(this));
    html.find("[data-action='set-mood']").on("click", this._onSetMood.bind(this));
    html.find("[data-action='close-scene']").on("click", this._onCloseScene.bind(this));
    html.find("[data-action='open-scene-library']").on("click", this._onOpenSceneLibrary.bind(this));
    html.find("[data-action='edit-scene']").on("click", this._onEditScene.bind(this));
    html.find("[data-action='auto-arrange-actors']").on("click", this._onAutoArrangeActors.bind(this));
    html.find("[data-action='reveal-scene-to-players']").on("click", this._onRevealSceneToPlayers.bind(this));
    html.find("[data-action='toggle-gm-bar']").on("click", this._onToggleGmBar.bind(this));
    html.find("[data-action='toggle-dim-controls']").on("click", this._onToggleDimControls.bind(this));
    html.find("[data-action='set-background-dim']").on("input change", this._onSetBackgroundDim.bind(this));
    html.on("click", "[data-action='toggle-sound-controls']", this._onToggleSoundControls.bind(this));
    html.on("click", "[data-action='play-scene-track']", this._onPlaySceneTrack.bind(this));
    html.on("click", "[data-action='scene-audio-play']", this._onSceneAudioPlay.bind(this));
    html.on("click", "[data-action='scene-audio-pause']", this._onSceneAudioPause.bind(this));
    html.on("click", "[data-action='scene-audio-loop']", this._onSceneAudioLoop.bind(this));
    html.on("click", "[data-action='scene-audio-stop']", this._onSceneAudioStop.bind(this));
    html.on("input change", "[data-action='set-scene-audio-volume']", this._onSetSceneAudioVolume.bind(this));
    html.on("click", "[data-action='toggle-sound-panel-content']", this._onToggleSoundPanelContent.bind(this));
    html.on("click", "[data-action='play-soundboard-item']", this._onPlaySoundboardItem.bind(this));
    html.on("click", "[data-action='soundboard-page-prev']", this._onSoundboardPagePrev.bind(this));
    html.on("click", "[data-action='soundboard-page-next']", this._onSoundboardPageNext.bind(this));
    html.find("[data-action='toggle-left-sidebar']").on("click", this._onToggleLeftSidebar.bind(this));
    html.find("[data-action='toggle-right-sidebar']").on("click", this._onToggleRightSidebar.bind(this));
    html.find(".tom-stage-shell").on("dragenter dragover", this._onStageDragOver.bind(this));
    html.find(".tom-stage-shell").on("drop", this._onStageDrop.bind(this));
    html.find(".tom-actor[data-scene-actor-id]").on("pointerdown", this._onActorPointerDown.bind(this));
    html.find(".tom-actor[data-scene-actor-id]").on("wheel", this._onActorWheel.bind(this));
    this._bindBackgroundMedia(html?.[0], theatreScene);
    this._startMusicVolumePolling();
    this._syncSceneAudioPlayback(this._getSceneSoundContext(theatreScene));
    this._playPendingSceneTransition(html?.[0]).catch((error) => {
      console.warn(`${MODULE_ID} | Scene transition fallback`, error);
    });
  }

  canSyncRuntimeState() {
    const root = this.element?.[0];
    const theatreScene = this.manager.getActiveScene();
    if (!root || !theatreScene) return false;

    const currentActorIds = Array.from(root.querySelectorAll(".tom-actor[data-scene-actor-id]"))
      .map((element) => element.dataset.sceneActorId)
      .filter(Boolean);
    const nextActorIds = this.manager.getRenderableActors().map((actor) => actor.sceneActorId);

    if (!currentActorIds.length && !nextActorIds.length) return true;
    if (currentActorIds.length !== nextActorIds.length) return false;

    return currentActorIds.every((sceneActorId, index) => sceneActorId === nextActorIds[index]);
  }

  async syncRuntimeState() {
    const root = this.element?.[0];
    if (!root) return false;
    applyThemeInlineStyleToHost(root, TheatreStore.getThemeState());

    const isGM = Boolean(game.user?.isGM);
    const theatreScene = this.manager.getActiveScene();
    const backgroundPath = String(theatreScene?.background || "").trim();
    const backgroundIsVideo = isVideoMediaPath(backgroundPath);
    const preserveBackgroundAspect = theatreScene?.settings?.preserveBackgroundAspect !== false;
    const backdropElement = root.querySelector(".tom-overlay-backdrop");
    const backdropMedia = root.querySelector(".tom-overlay-backdrop__media");
    const backdropImagePath = String(theatreScene?.settings?.backdropImage || "").trim();
    const backdropBlurEnabled = theatreScene?.settings?.backdropBlurEnabled !== false;
    const backdropDarkness = Number.isFinite(Number(theatreScene?.settings?.backdropDarkness))
      ? Math.max(0, Math.min(0.92, Number(theatreScene.settings.backdropDarkness)))
      : 0.2;
    const managerActors = this.manager.getRenderableActors();
    const highlightedNames = managerActors.filter((actor) => actor.isHighlighted).map((actor) => actor.actorName);
    const stageMetrics = this._getStageMetrics(managerActors.length, isGM, highlightedNames.length);
    const stageElement = root.querySelector(".tom-stage");
    const stageShell = root.querySelector(".tom-stage-shell");
    const stageStyle = `${this._buildStageStyle(stageMetrics)};${this._buildCinematicBarsStyle(theatreScene)}`;
    if (stageShell) {
      stageShell.setAttribute("style", stageStyle);
    }
    const backgroundElement = root.querySelector(".tom-background");
    if (backgroundElement) {
      backgroundElement.classList.toggle("is-cover", preserveBackgroundAspect);
      backgroundElement.classList.toggle("is-fill", !preserveBackgroundAspect);
      const currentMedia = backgroundElement.querySelector(".tom-background__media");
      const currentTag = currentMedia?.tagName?.toLowerCase?.() || "";
      const desiredTag = backgroundIsVideo ? "video" : "img";
      const currentSrc = currentMedia?.getAttribute?.("src") || "";
      if (!backgroundPath) {
        currentMedia?.remove?.();
      } else if (!currentMedia || currentTag !== desiredTag || currentSrc !== backgroundPath) {
        currentMedia?.remove?.();
        const nextMedia = document.createElement(desiredTag);
        nextMedia.className = "tom-background__media";
        nextMedia.setAttribute("src", backgroundPath);
        if (backgroundIsVideo) {
          nextMedia.setAttribute("autoplay", "");
          nextMedia.setAttribute("muted", "");
          nextMedia.setAttribute("loop", "");
          nextMedia.setAttribute("playsinline", "");
          nextMedia.setAttribute("preload", "auto");
        } else {
          nextMedia.setAttribute("alt", "");
        }
        backgroundElement.appendChild(nextMedia);
      }
    }
    if (backdropElement) {
      backdropElement.classList.toggle("is-blurred", backdropBlurEnabled);
    }
    const cinematicElement = root.querySelector(".tom-background-cinematic");
    if (cinematicElement instanceof HTMLElement) {
      const cinematicInset = this._getCinematicBarInset(theatreScene);
      cinematicElement.toggleAttribute("hidden", cinematicInset <= 0);
      cinematicElement.setAttribute("style", this._buildCinematicBarsStyle(theatreScene));
    }
    if (backdropMedia instanceof HTMLElement) {
      backdropMedia.toggleAttribute("hidden", !backdropImagePath);
      backdropMedia.setAttribute("style", this._buildBackdropMediaStyle(theatreScene) || "display:none;");
    }
    const backdropDimElement = root.querySelector(".tom-overlay-backdrop__dim");
    if (backdropDimElement instanceof HTMLElement) {
      backdropDimElement.setAttribute("style", `opacity:${backdropDarkness};`);
    }
    this._bindBackgroundMedia(root, theatreScene);
    this._updateStageShellLayout(root, theatreScene);

    const animationTasks = [];

    for (const actor of managerActors) {
      const actorElement = root.querySelector(`.tom-actor[data-scene-actor-id="${actor.sceneActorId}"]`);
      if (!actorElement) continue;

      actorElement.classList.toggle("is-highlighted", actor.isHighlighted);
      actorElement.classList.toggle("is-hidden", actor.isVisible === false);
      actorElement.dataset.offsetX = String(actor.offsetX ?? 0);
      actorElement.dataset.offsetY = String(actor.offsetY ?? 0);
      actorElement.dataset.scale = String(actor.scale ?? 1);
      actorElement.dataset.activeScale = String(actor.activeScale ?? ((actor.scale ?? 1) * 1.4));
      actorElement.setAttribute("style", this._buildActorStyle(actor));
      const portrait = actorElement.querySelector(".tom-actor-portrait");
      if (portrait) {
        portrait.classList.toggle("is-circular", Boolean(actor.useCircularCrop));
        portrait.classList.toggle("has-backdrop", Boolean(actor.showBackdrop) && !actor.useCircularCrop);
        portrait.classList.toggle("is-mirrored", Boolean(actor.isMirrored));
        portrait.style.setProperty("--tom-actor-crop-scale", String(Math.max(0.7, Math.min(1.3, Number(actor.circularCropScale ?? 1) || 1))));
        portrait.style.setProperty("--tom-actor-frame-fit-scale", String(Math.max(0.6, Math.min(1.2, Number(actor.frameFitScale ?? 1) || 1))));
        const frameOverlay = portrait.querySelector(".tom-actor-frame-overlay");
        if (actor.frameImage) {
          if (frameOverlay) {
            frameOverlay.setAttribute("src", actor.frameImage);
          } else {
            const overlayImage = document.createElement("img");
            overlayImage.className = "tom-actor-frame-overlay";
            overlayImage.alt = "";
            overlayImage.setAttribute("aria-hidden", "true");
            overlayImage.setAttribute("src", actor.frameImage);
            portrait.insertBefore(overlayImage, portrait.querySelector(".tom-actor-name"));
          }
        } else {
          frameOverlay?.remove();
        }
      }

      const currentImage = actorElement.querySelector(".tom-actor-image--current");
      const currentImagePath = currentImage?.getAttribute("src") || "";
      if (actor.actorImage && currentImagePath !== actor.actorImage) {
        animationTasks.push(this._animateMoodImageChange(actor.sceneActorId, actor.displayMoodLabel, actor.actorImage));
      } else {
        const moodButton = actorElement.querySelector("[data-action='toggle-moods']");
        const moodLabel = actorElement.querySelector(".tom-actor-mood");
        if (moodButton) moodButton.textContent = actor.displayMoodLabel;
        if (moodLabel) moodLabel.textContent = actor.displayMoodLabel;
        this._lastActorImages[actor.sceneActorId] = actor.actorImage;
      }

      const visibilityToggle = actorElement.querySelector("[data-action='toggle-actor-visibility']");
      const visibilityIcon = visibilityToggle?.querySelector("i");
      const mirrorToggle = actorElement.querySelector("[data-action='toggle-actor-mirror']");
      const nameToggle = actorElement.querySelector("[data-action='toggle-actor-name']");
      const nameElement = actorElement.querySelector(".tom-actor-name");
      if (nameElement) {
        nameElement.classList.toggle("is-hidden", actor.showName === false);
      }
      if (mirrorToggle) {
        const mirrored = Boolean(actor.isMirrored);
        mirrorToggle.setAttribute("aria-pressed", mirrored ? "true" : "false");
        mirrorToggle.setAttribute("aria-label", mirrored ? "Disable mirroring" : "Mirror avatar");
        mirrorToggle.setAttribute("title", mirrored ? "Disable mirroring" : "Mirror avatar");
      }
      if (nameToggle) {
        const showName = actor.showName !== false;
        nameToggle.setAttribute("aria-pressed", showName ? "true" : "false");
        nameToggle.setAttribute("aria-label", showName ? "Hide names" : "Show names");
        nameToggle.setAttribute("title", showName ? "Hide names" : "Show names");
      }
      if (visibilityToggle) {
        const isVisible = actor.isVisible !== false;
        visibilityToggle.setAttribute("aria-pressed", isVisible ? "true" : "false");
        visibilityToggle.setAttribute("aria-label", isVisible ? "Hide avatar" : "Show avatar");
        visibilityToggle.setAttribute("title", isVisible ? "Hide avatar" : "Show avatar");
      }
      if (visibilityIcon) {
        visibilityIcon.classList.toggle("fa-eye", actor.isVisible !== false);
        visibilityIcon.classList.toggle("fa-eye-slash", actor.isVisible === false);
      }
    }

    const subtitle = root.querySelector(".tom-gm-bar__subtitle");
    if (subtitle) {
      subtitle.textContent = highlightedNames.length
        ? `Hervorgehoben: ${highlightedNames.join(", ")}`
        : "Hervorgehoben: No highlight";
    }

    const gmBarShell = root.querySelector(".tom-gm-bar-shell");
    const gmBarElement = root.querySelector(".tom-gm-bar");
    const gmBarToggle = root.querySelector("[data-action='toggle-gm-bar']");
    const gmBarToggleIcon = gmBarToggle?.querySelector("i");
    if (gmBarShell instanceof HTMLElement) {
      gmBarShell.classList.toggle("is-collapsed", this.isGmBarCollapsed);
    }
    if (gmBarElement instanceof HTMLElement) {
      gmBarElement.toggleAttribute("hidden", this.isGmBarCollapsed);
    }
    if (gmBarToggleIcon) {
      gmBarToggleIcon.classList.toggle("fa-chevron-left", !this.isGmBarCollapsed);
      gmBarToggleIcon.classList.toggle("fa-chevron-right", this.isGmBarCollapsed);
    }
    if (gmBarToggle) {
      const gmBarLabel = this.isGmBarCollapsed ? "Show GM control bar" : "Hide GM control bar";
      gmBarToggle.setAttribute("title", gmBarLabel);
      gmBarToggle.setAttribute("aria-label", gmBarLabel);
      gmBarToggle.setAttribute("aria-pressed", this.isGmBarCollapsed ? "true" : "false");
    }

    const leftToggleIcon = root.querySelector("[data-action='toggle-left-sidebar'] i");
    const leftToggleButton = root.querySelector("[data-action='toggle-left-sidebar']");
    const isLeftSidebarVisible = this.manager.isSharedLeftSidebarVisible();
    if (leftToggleIcon) {
      leftToggleIcon.classList.toggle("fa-chevron-left", isLeftSidebarVisible);
      leftToggleIcon.classList.toggle("fa-chevron-right", !isLeftSidebarVisible);
    }
    if (leftToggleButton) {
      const label = isLeftSidebarVisible ? "Hide left sidebar" : "Show left sidebar";
      leftToggleButton.setAttribute("title", label);
      leftToggleButton.setAttribute("aria-label", label);
    }

    const rightToggleIcon = root.querySelector("[data-action='toggle-right-sidebar'] i");
    const rightToggleButton = root.querySelector("[data-action='toggle-right-sidebar']");
    const isRightSidebarVisible = this.manager.isSharedRightSidebarVisible();
    if (rightToggleIcon) {
      rightToggleIcon.classList.toggle("fa-chevron-right", isRightSidebarVisible);
      rightToggleIcon.classList.toggle("fa-chevron-left", !isRightSidebarVisible);
    }
    if (rightToggleButton) {
      const label = isRightSidebarVisible ? "Hide right sidebar" : "Show right sidebar";
      rightToggleButton.setAttribute("title", label);
      rightToggleButton.setAttribute("aria-label", label);
    }

    const dimRange = root.querySelector("[data-action='set-background-dim']");
    if (dimRange) {
      dimRange.value = String(Math.round(this.manager.getBackgroundDim() * 100));
    }

    const soundContext = this._getSceneSoundContext(theatreScene);
    this._refreshSoundControlsUi(soundContext);
    this._syncSceneAudioPlayback(soundContext);

    await Promise.all(animationTasks);
    return true;
  }

  applySceneDraftPreview(sceneDraft) {
    const root = this.element?.[0];
    if (!root || !sceneDraft) return false;

    const activeScene = this.manager.getActiveScene?.();
    if (!activeScene?.id || activeScene.id !== sceneDraft.id) return false;

    const backgroundPath = String(sceneDraft.background || "").trim();
    const backgroundIsVideo = isVideoMediaPath(backgroundPath);
    const preserveBackgroundAspect = sceneDraft?.settings?.preserveBackgroundAspect !== false;
    const managerActors = this.manager.getRenderableActors();
    const highlightedNames = managerActors.filter((actor) => actor.isHighlighted).map((actor) => actor.actorName);
    const stageMetrics = this._getStageMetrics(managerActors.length, Boolean(game.user?.isGM), highlightedNames.length);
    const stageShell = root.querySelector(".tom-stage-shell");
    const backdropImagePath = String(sceneDraft?.settings?.backdropImage || "").trim();
    const backdropBlurEnabled = sceneDraft?.settings?.backdropBlurEnabled !== false;
    const backdropDarkness = Number.isFinite(Number(sceneDraft?.settings?.backdropDarkness))
      ? Math.max(0, Math.min(0.92, Number(sceneDraft.settings.backdropDarkness)))
      : 0.2;

    if (stageShell instanceof HTMLElement) {
      stageShell.setAttribute("style", `${this._buildStageStyle(stageMetrics)};${this._buildCinematicBarsStyle(sceneDraft)}`);
    }

    const backgroundElement = root.querySelector(".tom-background");
    if (backgroundElement) {
      backgroundElement.classList.toggle("is-cover", preserveBackgroundAspect);
      backgroundElement.classList.toggle("is-fill", !preserveBackgroundAspect);
      const currentMedia = backgroundElement.querySelector(".tom-background__media");
      const currentTag = currentMedia?.tagName?.toLowerCase?.() || "";
      const desiredTag = backgroundIsVideo ? "video" : "img";
      const currentSrc = currentMedia?.getAttribute?.("src") || "";
      if (!backgroundPath) {
        currentMedia?.remove?.();
      } else if (!currentMedia || currentTag !== desiredTag || currentSrc !== backgroundPath) {
        currentMedia?.remove?.();
        const nextMedia = document.createElement(desiredTag);
        nextMedia.className = "tom-background__media";
        nextMedia.setAttribute("src", backgroundPath);
        if (backgroundIsVideo) {
          nextMedia.setAttribute("autoplay", "");
          nextMedia.setAttribute("muted", "");
          nextMedia.setAttribute("loop", "");
          nextMedia.setAttribute("playsinline", "");
          nextMedia.setAttribute("preload", "auto");
        } else {
          nextMedia.setAttribute("alt", "");
        }
        backgroundElement.appendChild(nextMedia);
      }
    }

    const backdropElement = root.querySelector(".tom-overlay-backdrop");
    if (backdropElement) {
      backdropElement.classList.toggle("is-blurred", backdropBlurEnabled);
    }
    const cinematicElement = root.querySelector(".tom-background-cinematic");
    if (cinematicElement instanceof HTMLElement) {
      const cinematicInset = this._getCinematicBarInset(sceneDraft);
      cinematicElement.toggleAttribute("hidden", cinematicInset <= 0);
      cinematicElement.setAttribute("style", this._buildCinematicBarsStyle(sceneDraft));
    }

    const backdropMedia = root.querySelector(".tom-overlay-backdrop__media");
    if (backdropMedia instanceof HTMLElement) {
      backdropMedia.toggleAttribute("hidden", !backdropImagePath);
      backdropMedia.setAttribute("style", this._buildBackdropMediaStyle(sceneDraft) || "display:none;");
    }

    const backdropDimElement = root.querySelector(".tom-overlay-backdrop__dim");
    if (backdropDimElement instanceof HTMLElement) {
      backdropDimElement.setAttribute("style", `opacity:${backdropDarkness};`);
    }

    const headingTitle = root.querySelector(".tom-stage-heading__title");
    if (headingTitle) {
      headingTitle.textContent = sceneDraft.stageTitle || sceneDraft.name || "";
    }

    const headingSubtitle = root.querySelector(".tom-stage-heading__subtitle");
    if (headingSubtitle) {
      const nextSubtitle = String(sceneDraft.stageSubtitle || "").trim();
      headingSubtitle.textContent = nextSubtitle;
      headingSubtitle.toggleAttribute("hidden", !nextSubtitle);
    }

    this._bindBackgroundMedia(root, sceneDraft);
    this._updateStageShellLayout(root, sceneDraft);
    return true;
  }

  _animateHighlightToggle(sceneActorId) {
    const root = this.element?.[0];
    if (!root) return;

    const actorElement = root.querySelector(`.tom-actor[data-scene-actor-id="${sceneActorId}"]`);
    if (!actorElement) return;

    const nextHighlighted = !actorElement.classList.contains("is-highlighted");
    const actorScale = Number(actorElement.dataset.scale) || 1;
    const activeScale = Number(actorElement.dataset.activeScale) || (actorScale * 1.4);
    const displayedScale = nextHighlighted ? activeScale : actorScale;
    actorElement.classList.toggle("is-highlighted", nextHighlighted);
    actorElement.style.setProperty("--tom-actor-scale", String(actorScale));
    actorElement.style.setProperty("--tom-actor-highlight-scale", String(nextHighlighted ? activeScale : actorScale));
    actorElement.style.setProperty("--tom-actor-label-compensation", String(this._buildActorLabelCompensation(displayedScale)));

    const subtitle = root.querySelector(".tom-gm-bar__subtitle");
    if (subtitle) {
      const highlightedNames = Array.from(root.querySelectorAll(".tom-actor.is-highlighted .tom-actor-name"))
        .map((element) => element.textContent?.trim())
        .filter(Boolean);

      subtitle.textContent = highlightedNames.length
        ? `Hervorgehoben: ${highlightedNames.join(", ")}`
        : "Hervorgehoben: No highlight";
    }
  }

  _buildActorStyle(actor) {
    const actorScale = Number(actor.scale ?? 1) || 1;
    const activeScale = Number(actor.activeScale ?? (actorScale * 1.4)) || (actorScale * 1.4);
    const displayedScale = actor.isHighlighted ? activeScale : actorScale;
    const labelCompensation = this._buildActorLabelCompensation(displayedScale);
    const order =
      actor.position === "left" ? 1 :
      actor.position === "center" ? 2 :
      actor.position === "right" ? 3 :
      4;

    return [
      `order:${order}`,
      `z-index:${Math.max(1, Number(actor.zIndex) || 1)}`,
      `--tom-actor-z-index:${Math.max(1, Number(actor.zIndex) || 1)}`,
      `--tom-actor-offset-x:${Number(actor.offsetX ?? 0)}px`,
      `--tom-actor-offset-y:${Number(actor.offsetY ?? 0)}px`,
      `--tom-actor-scale:${actorScale}`,
      `--tom-actor-highlight-scale:${activeScale}`,
      `--tom-actor-label-compensation:${labelCompensation}`,
      `--tom-actor-crop-scale:${Math.max(0.7, Math.min(1.3, Number(actor.circularCropScale ?? 1) || 1))}`,
      `--tom-actor-frame-fit-scale:${Math.max(0.6, Math.min(1.2, Number(actor.frameFitScale ?? 1) || 1))}`
    ].join(";");
  }

  _buildActorLabelCompensation(scale) {
    const currentScale = Number(scale) || 1;
    const labelScale = Math.max(0.82, 1 + ((currentScale - 1) * 0.42));
    return currentScale > 0 ? labelScale / currentScale : 1;
  }

  _buildBackdropMediaStyle(theatreScene) {
    const imagePath = String(theatreScene?.settings?.backdropImage || "").trim();
    if (!imagePath) return "";
    const scaleValue = Number(theatreScene?.settings?.backdropImageScale);
    const scale = Number.isFinite(scaleValue) ? Math.max(0.1, Math.min(4, scaleValue)) : 1;
    const repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(theatreScene?.settings?.backdropImageRepeat)
      ? theatreScene.settings.backdropImageRepeat
      : "repeat";
    const escapedPath = imagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      "display:block",
      `background-image:url(\"${escapedPath}\")`,
      "background-position:center center",
      `background-repeat:${repeat}`,
      `background-size:${(scale * 100).toFixed(0)}% auto`
    ].join(";");
  }

  _getCinematicBarInset(theatreScene) {
    const mode = String(theatreScene?.settings?.cinematicBars || "standard").trim();
    if (mode === "small") return 0.06;
    if (mode === "medium") return 0.1;
    if (mode === "big") return 0.145;
    return 0;
  }

  _buildCinematicBarsStyle(theatreScene) {
    const inset = this._getCinematicBarInset(theatreScene);
    return `--tom-cinematic-bar-size:${(inset * 100).toFixed(2)}%;`;
  }

  _getStageMetrics(actorCount, isGM, highlightedCount = 0) {
    const count = Math.max(actorCount, 1);
    const rem = 16;
    const horizontalPadding = 64;
    const verticalPadding = isGM ? 200 : 140;
    const gmReservedLeft = isGM ? 7 * rem : 0;
    const gmReservedRight = isGM ? 22 * rem : 0;
    const stageWidth = Math.max(360, window.innerWidth - gmReservedLeft - gmReservedRight - horizontalPadding);
    const stageHeight = Math.max(320, window.innerHeight - verticalPadding);
    const baseGap = Math.max(16, Math.min(36, Math.floor(stageWidth * 0.025)));
    const highlightGapBonus = highlightedCount > 0 ? Math.min(84, 34 + (Math.max(highlightedCount - 1, 0) * 18)) : 0;
    const gap = baseGap + highlightGapBonus;
    const availableWidthPerActor = Math.max(140, Math.floor((stageWidth - gap * (count - 1)) / count));
    const slotSize = Math.min(500, Math.floor(stageHeight * 0.6), availableWidthPerActor);

    return {
      actorCount: count,
      gap,
      slotSize
    };
  }

  _buildStageStyle(stageMetrics) {
    return [
      `--tom-actor-count:${stageMetrics.actorCount}`,
      `--tom-actor-gap:${stageMetrics.gap}px`,
      `--tom-actor-slot:${stageMetrics.slotSize}px`,
      `--tom-actor-image-height:${stageMetrics.slotSize}px`,
      `--tom-theatre-background-dim:${this.manager.getBackgroundDim()}`
    ].join(";");
  }

  _bindBackgroundMedia(root, theatreScene) {
    if (!(root instanceof HTMLElement)) return;
    const media = root.querySelector(".tom-background__media");
    if (!(media instanceof HTMLImageElement || media instanceof HTMLVideoElement)) {
      this._updateStageShellLayout(root, theatreScene);
      return;
    }
    media.removeEventListener("load", this._boundBackgroundMediaLoad);
    media.removeEventListener("loadedmetadata", this._boundBackgroundMediaLoad);
    media.addEventListener("load", this._boundBackgroundMediaLoad);
    media.addEventListener("loadedmetadata", this._boundBackgroundMediaLoad);
    this._updateStageShellLayout(root, theatreScene);
  }

  _onBackgroundMediaLoad() {
    const root = this.element?.[0];
    if (!root) return;
    this._updateStageShellLayout(root, this.manager.getActiveScene());
  }

  _getBackgroundAspectRatio(root) {
    const media = root?.querySelector(".tom-background__media");
    if (media instanceof HTMLVideoElement) {
      const width = Number(media.videoWidth) || 0;
      const height = Number(media.videoHeight) || 0;
      return width > 0 && height > 0 ? width / height : 0;
    }
    if (media instanceof HTMLImageElement) {
      const width = Number(media.naturalWidth) || 0;
      const height = Number(media.naturalHeight) || 0;
      return width > 0 && height > 0 ? width / height : 0;
    }
    return 0;
  }

  _updateStageShellLayout(root, theatreScene) {
    const stageShell = root?.querySelector(".tom-stage-shell");
    if (!(stageShell instanceof HTMLElement)) return;

    const body = root.ownerDocument?.body;
    const isGMPreview = body?.classList?.contains("tom-gm-preview-active") || Boolean(game.user?.isGM);
    const hasSharedLeftSidebar = body?.classList?.contains("tom-shared-left-sidebar-open") || this.manager.isSharedLeftSidebarVisible?.();
    const hasSharedRightSidebar = body?.classList?.contains("tom-shared-right-sidebar-open") || this.manager.isSharedRightSidebarVisible?.();

    const baseInsets = {
      top: isGMPreview ? 72 : 16,
      right: hasSharedRightSidebar ? 332 : (isGMPreview ? 20 : 16),
      bottom: isGMPreview ? 56 : 16,
      left: hasSharedLeftSidebar ? 304 : (isGMPreview ? 92 : 16)
    };

    const preserveAspect = theatreScene?.settings?.preserveBackgroundAspect !== false;
    if (!preserveAspect) {
      stageShell.style.width = "";
      stageShell.style.height = "";
      stageShell.style.left = `${baseInsets.left}px`;
      stageShell.style.top = `${baseInsets.top}px`;
      stageShell.style.right = `${baseInsets.right}px`;
      stageShell.style.bottom = `${baseInsets.bottom}px`;
      return;
    }

    stageShell.style.width = "";
    stageShell.style.height = "";
    stageShell.style.left = `${baseInsets.left}px`;
    stageShell.style.top = `${baseInsets.top}px`;
    stageShell.style.right = `${baseInsets.right}px`;
    stageShell.style.bottom = `${baseInsets.bottom}px`;

    const viewportWidth = root.clientWidth || window.innerWidth;
    const viewportHeight = root.clientHeight || window.innerHeight;
    const availableWidth = Math.max(320, viewportWidth - baseInsets.left - baseInsets.right);
    const availableHeight = Math.max(220, viewportHeight - baseInsets.top - baseInsets.bottom);
    const aspectRatio = this._getBackgroundAspectRatio(root);
    if (!(aspectRatio > 0)) return;

    let width = availableWidth;
    let height = width / aspectRatio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspectRatio;
    }

    const offsetLeft = baseInsets.left + Math.max(0, (availableWidth - width) / 2);
    const offsetTop = baseInsets.top + Math.max(0, (availableHeight - height) / 2);

    stageShell.style.left = `${offsetLeft}px`;
    stageShell.style.top = `${offsetTop}px`;
    stageShell.style.width = `${width}px`;
    stageShell.style.height = `${height}px`;
    stageShell.style.right = "auto";
    stageShell.style.bottom = "auto";
  }

  async _playPendingSceneTransition(root) {
    if (!(root instanceof HTMLElement)) return;
    const transition = this.manager.consumePendingSceneTransition?.();
    if (!transition?.settings || transition.settings.effect === "none") return;

    let gsap;
    try {
      gsap = await ensureGsap();
    } catch (error) {
        console.warn(`${MODULE_ID} | GSAP konnte nicht geladen werden`, error);
      return;
    }

    const stageShell = root.querySelector(".tom-stage-shell");
    if (!(stageShell instanceof HTMLElement)) return;

    const snapshot = transition.snapshot instanceof HTMLElement ? transition.snapshot : null;
    if (snapshot) {
      root.insertBefore(snapshot, stageShell);
    }

    try {
      await this._runSceneTransition(gsap, root, stageShell, snapshot, transition.settings);
    } finally {
      snapshot?.remove();
      root.querySelectorAll(".tom-scene-transition-curtain, .tom-scene-transition-veil, .tom-scene-transition-stripes").forEach((element) => element.remove());
      gsap.set(stageShell, { clearProps: "autoAlpha,scale,scaleY,x,y" });
      gsap.set(stageShell.querySelectorAll(".tom-actor, .tom-actor-frame, .tom-stage-heading, .tom-gm-bar, .tom-background, .tom-background__media"), {
        clearProps: "autoAlpha,scale,scaleY,x,y"
      });
    }
  }

  _createTransitionVeil(root, modifier = "") {
    const veil = document.createElement("div");
    veil.className = `tom-scene-transition-veil${modifier ? ` ${modifier}` : ""}`;
    root.appendChild(veil);
    return veil;
  }

  _createTransitionStripes(root) {
    const stripes = document.createElement("div");
    stripes.className = "tom-scene-transition-stripes";
    root.appendChild(stripes);
    return stripes;
  }

  async _runSceneTransition(gsap, root, stageShell, snapshot, settings) {
    const heading = stageShell.querySelector(".tom-stage-heading");
    const gmBar = stageShell.querySelector(".tom-gm-bar");
    const backgroundTarget = stageShell.querySelector(".tom-background__media") || stageShell.querySelector(".tom-background");
    const actorFrames = Array.from(stageShell.querySelectorAll(".tom-actor-frame"));
    const duration = Math.max(0.3, Number(settings?.duration) || 0.9);
    const intensity = Math.max(0.6, Number(settings?.intensity) || 1);
    const effect = settings?.effect || "blurZoom";
    const contentTargets = [heading, gmBar, ...actorFrames].filter(Boolean);

    const timeline = gsap.timeline({
      defaults: { ease: "power2.out" }
    });

    const finish = new Promise((resolve) => {
      timeline.eventCallback("onComplete", resolve);
    });

    if (effect === "glitch") {
      const veil = this._createTransitionVeil(root, "tom-scene-transition-veil--chromatic");
      gsap.set(stageShell, {
        autoAlpha: 1,
        x: 8 * intensity,
        y: -3 * intensity,
        scale: 1.008
      });
      gsap.set(veil, { autoAlpha: 0.22 });
      gsap.set(contentTargets, { autoAlpha: 0.35, y: 8 * intensity });
      if (snapshot) {
        timeline.to(snapshot, {
          x: 10 * intensity,
          y: -4 * intensity,
          autoAlpha: 0.38,
          duration: duration * 0.12,
          ease: "steps(2)"
        }, 0);
        timeline.to(snapshot, {
          x: -8 * intensity,
          y: 5 * intensity,
          autoAlpha: 0,
          duration: duration * 0.14,
          ease: "steps(2)"
        }, duration * 0.12);
      }
      timeline.to(stageShell, {
        x: 0,
        y: 0,
        scale: 1,
        duration: duration * 0.34,
        ease: "steps(4)"
      }, duration * 0.06);
      timeline.to(contentTargets, {
        autoAlpha: 1,
        y: 0,
        duration: duration * 0.3,
        stagger: 0.03
      }, duration * 0.12);
      timeline.to(veil, {
        autoAlpha: 0,
        duration: duration * 0.24
      }, duration * 0.18);
    } else if (effect === "scanlineBoot") {
      const veil = this._createTransitionVeil(root, "tom-scene-transition-veil--scanline");
      const stripes = this._createTransitionStripes(root);
      gsap.set(stageShell, {
        autoAlpha: 1,
        scaleY: 0.985,
        y: 10
      });
      gsap.set(contentTargets, { autoAlpha: 0.28, y: 14 });
      gsap.set(veil, { autoAlpha: 0.2 });
      gsap.set(stripes, { autoAlpha: 0.34, yPercent: -100 });
      if (snapshot) {
        timeline.to(snapshot, {
          autoAlpha: 0,
          duration: duration * 0.2
        }, 0);
      }
      timeline.to(stripes, {
        yPercent: 100,
        duration: duration * 0.5,
        ease: "none"
      }, 0.02);
      timeline.to(stageShell, {
        scaleY: 1,
        y: 0,
        duration: duration * 0.38,
        ease: "power2.out"
      }, duration * 0.06);
      timeline.to(contentTargets, {
        autoAlpha: 1,
        y: 0,
        duration: duration * 0.28,
        stagger: 0.04
      }, duration * 0.16);
      timeline.to([veil, stripes], {
        autoAlpha: 0,
        duration: duration * 0.2
      }, duration * 0.26);
    } else {
      const veil = this._createTransitionVeil(root);
      gsap.set(stageShell, { autoAlpha: 1 });
      if (backgroundTarget) {
        gsap.set(backgroundTarget, {
          scale: 1.018 + ((intensity - 1) * 0.015),
          transformOrigin: "50% 50%"
        });
      }
      gsap.set(veil, { autoAlpha: 0.12 });
      if (snapshot) {
        timeline.to(snapshot, {
          autoAlpha: 0,
          duration: duration * 0.26,
          ease: "power1.out"
        }, 0);
      }
      if (backgroundTarget) {
        timeline.to(backgroundTarget, {
          scale: 1,
          duration: duration * 0.4,
          ease: "power2.out"
        }, 0.02);
      }
      timeline.to(veil, {
        autoAlpha: 0,
        duration: duration * 0.22,
        ease: "power1.out"
      }, 0.08);
    }

    await finish;
  }

  async _animateMoodImageChange(sceneActorId, mood, targetImagePath) {
    const root = this.element?.[0];
    const actorElement = root?.querySelector(`.tom-actor[data-scene-actor-id="${sceneActorId}"]`);
    const stack = actorElement?.querySelector(".tom-actor-image-stack");
    const currentImage = stack?.querySelector(".tom-actor-image--current");
    const moodButton = actorElement?.querySelector("[data-action='toggle-moods']");
    const moodLabel = actorElement?.querySelector(".tom-actor-mood");

    if (!stack || !currentImage || !targetImagePath || currentImage.getAttribute("src") === targetImagePath) {
      if (moodButton) moodButton.textContent = mood;
      if (moodLabel) moodLabel.textContent = mood;
      return;
    }

    stack.querySelector(".tom-actor-image--previous")?.remove();

    const previousImage = currentImage.cloneNode(true);
    previousImage.classList.remove("tom-actor-image--current", "is-transitioning");
    previousImage.classList.add("tom-actor-image--previous");
    previousImage.setAttribute("aria-hidden", "true");
    previousImage.setAttribute("alt", "");

    currentImage.setAttribute("src", targetImagePath);
    currentImage.classList.add("is-transitioning");
    stack.classList.add("is-transitioning");
    stack.prepend(previousImage);

    if (moodButton) moodButton.textContent = mood;
    if (moodLabel) moodLabel.textContent = mood;
    this._lastActorImages[sceneActorId] = targetImagePath;

    await new Promise((resolve) => window.setTimeout(resolve, 340));

    previousImage.remove();
    currentImage.classList.remove("is-transitioning");
    stack.classList.remove("is-transitioning");
  }

  async _onSelectSpeaker(event) {
    event.preventDefault();
    const actorElement = event.currentTarget.closest(".tom-actor[data-scene-actor-id]");
    const sceneActorId = event.currentTarget.dataset.sceneActorId;
    if (this._recentlyDraggedSceneActorId === sceneActorId) return;
    if (actorElement) {
      const root = this.element?.[0];
      const actorElements = Array.from(root?.querySelectorAll(".tom-actor[data-scene-actor-id]") ?? []);
      const maxDomZIndex = actorElements.reduce((maxValue, element) => {
        const currentValue = Number(element.style.zIndex || element.style.getPropertyValue("--tom-actor-z-index")) || 0;
        return Math.max(maxValue, currentValue);
      }, 0);
      const nextDomZIndex = String(Math.max(1, maxDomZIndex + 1));
      actorElement.style.setProperty("--tom-actor-z-index", nextDomZIndex);
      actorElement.style.zIndex = nextDomZIndex;
    }
    const nextTransform = await this.manager.bringSceneActorToFront(sceneActorId, { skipRender: true });
    if (actorElement && nextTransform?.zIndex) {
      const nextZIndex = String(Math.max(1, Number(nextTransform.zIndex) || 1));
      actorElement.style.setProperty("--tom-actor-z-index", nextZIndex);
      actorElement.style.zIndex = nextZIndex;
    }
    this._animateHighlightToggle(sceneActorId);
    await this.manager.toggleHighlight(sceneActorId, { skipRender: true });
  }

  _onToggleMoods(event) {
    event.preventDefault();
    const sceneActorId = event.currentTarget.dataset.sceneActorId;
    this.expandedMoodSceneActorId = this.expandedMoodSceneActorId === sceneActorId ? null : sceneActorId;
    this.render();
  }

  async _onRemoveActorFromScene(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!game.user?.isGM) return;

    const button = event.currentTarget;
    const actorElement = button.closest(".tom-actor[data-scene-actor-id]");
    const sceneActorId = button.dataset.sceneActorId || actorElement?.dataset?.sceneActorId;
    if (!sceneActorId || !actorElement) return;

    if (this.expandedMoodSceneActorId === sceneActorId) {
      this.expandedMoodSceneActorId = null;
    }

    actorElement.style.pointerEvents = "none";
    actorElement.style.opacity = "0";
    actorElement.style.transform = `${actorElement.style.transform || ""}`;
    await this.manager.removeSceneActor(sceneActorId);
  }

  async _onToggleActorVisibility(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!game.user?.isGM) return;

    const button = event.currentTarget;
    const actorElement = button.closest(".tom-actor[data-scene-actor-id]");
    const sceneActorId = button.dataset.sceneActorId || actorElement?.dataset?.sceneActorId;
    if (!sceneActorId || !actorElement) return;

    const nextVisible = actorElement.classList.contains("is-hidden");
    actorElement.classList.toggle("is-hidden", !nextVisible);

    const icon = button.querySelector("i");
    button.setAttribute("aria-pressed", nextVisible ? "true" : "false");
    button.setAttribute("aria-label", nextVisible ? "Hide avatar" : "Show avatar");
    button.setAttribute("title", nextVisible ? "Hide avatar" : "Show avatar");
    if (icon) {
      icon.classList.toggle("fa-eye", nextVisible);
      icon.classList.toggle("fa-eye-slash", !nextVisible);
    }

    await this.manager.setSceneActorVisibility(sceneActorId, nextVisible, { skipRender: true });
  }

  async _onToggleActorMirror(event) {
    event.preventDefault();
    event.stopPropagation();
    const sceneActorId = event.currentTarget.dataset.sceneActorId;
    if (!sceneActorId || !game.user?.isGM) return;
    const actor = this.manager.getRenderableActors().find((entry) => entry.sceneActorId === sceneActorId);
    await this.manager.setSceneActorMirror(sceneActorId, !(actor?.isMirrored), { skipRender: false });
  }

  async _onToggleActorName(event) {
    event.preventDefault();
    event.stopPropagation();
    const sceneActorId = event.currentTarget.dataset.sceneActorId;
    if (!sceneActorId || !game.user?.isGM) return;
    const actor = this.manager.getRenderableActors().find((entry) => entry.sceneActorId === sceneActorId);
    await this.manager.setSceneActorNameVisibility(sceneActorId, actor?.showName === false, { skipRender: false });
  }

  async _onSetMood(event) {
    event.preventDefault();
    const sceneActorId = event.currentTarget.dataset.sceneActorId;
    const mood = event.currentTarget.dataset.mood;
    const targetImagePath = event.currentTarget.dataset.imagePath || "";
    await this._animateMoodImageChange(sceneActorId, mood, targetImagePath);
    await this.manager.setMood(sceneActorId, mood, { skipRender: true });
    this.expandedMoodSceneActorId = null;
    this.render(false);
  }

  async _onCloseScene(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    await this.manager.deactivateScene();
  }

  _onOpenSceneLibrary(event) {
    event.preventDefault();
    game.modules.get(MODULE_ID)?.api?.openSceneLibrary?.();
  }

  async _onRevealSceneToPlayers(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const theatreScene = this.manager.getActiveScene();
    if (!theatreScene?.id) return;
    await this.manager.revealSceneToPlayers();
    ui.notifications?.info(tr("Footlights Scene \"{name}\" is now visible to all players.", { name: theatreScene.name }));
  }

  async _onToggleLeftSidebar(event) {
    event.preventDefault();
    await this.manager.toggleSharedLeftSidebar();
  }

  async _onToggleRightSidebar(event) {
    event.preventDefault();
    await this.manager.toggleSharedRightSidebar();
  }

  _onToggleGmBar(event) {
    event.preventDefault();
    this.isGmBarCollapsed = !this.isGmBarCollapsed;
    const root = this.element?.[0];
    const gmBarShell = root?.querySelector(".tom-gm-bar-shell");
    const gmBar = root?.querySelector(".tom-gm-bar");
    const button = root?.querySelector("[data-action='toggle-gm-bar']");
    const icon = button?.querySelector("i");

    if (gmBarShell instanceof HTMLElement) {
      gmBarShell.classList.toggle("is-collapsed", this.isGmBarCollapsed);
    }
    if (gmBar instanceof HTMLElement) {
      gmBar.toggleAttribute("hidden", this.isGmBarCollapsed);
    }
    if (icon) {
      icon.classList.toggle("fa-chevron-left", !this.isGmBarCollapsed);
      icon.classList.toggle("fa-chevron-right", this.isGmBarCollapsed);
    }
    if (button) {
      const label = this.isGmBarCollapsed ? "Show GM control bar" : "Hide GM control bar";
      button.setAttribute("title", label);
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", this.isGmBarCollapsed ? "true" : "false");
    }
  }

  _onToggleDimControls(event) {
    event.preventDefault();
    this.isDimControlsOpen = !this.isDimControlsOpen;
    const root = this.element?.[0];
    const dimPanel = root?.querySelector(".tom-gm-bar__dim-panel");
    if (dimPanel instanceof HTMLElement) {
      dimPanel.toggleAttribute("hidden", !this.isDimControlsOpen);
      dimPanel.setAttribute("aria-hidden", this.isDimControlsOpen ? "false" : "true");
    }
  }

  async _onSetBackgroundDim(event) {
    const numericValue = Math.max(0, Math.min(85, Number(event.currentTarget?.value) || 0));
    const nextDim = numericValue / 100;
    await this.manager.setBackgroundDim(nextDim, { skipRender: true });
    const root = this.element?.[0];
    const stageShell = root?.querySelector(".tom-stage-shell");
    if (stageShell) {
      stageShell.style.setProperty("--tom-theatre-background-dim", String(nextDim));
    }
    const dimElement = root?.querySelector(".tom-background-dim");
    if (dimElement instanceof HTMLElement) {
      dimElement.style.opacity = String(nextDim);
    }
    const valueDisplay = event.currentTarget?.closest(".tom-gm-bar__dim-controls")?.querySelector("span");
    if (valueDisplay) valueDisplay.textContent = `${numericValue}%`;
  }

  _onToggleSoundControls(event) {
    event.preventDefault();
    this.isSoundControlsOpen = !this.isSoundControlsOpen;
    this._refreshSoundControlsUi(this._getSceneSoundContext());
  }

  _onToggleSoundPanelContent(event) {
    event.preventDefault();
    this.isSoundPanelContentCollapsed = !this.isSoundPanelContentCollapsed;
    this._refreshSoundControlsUi(this._getSceneSoundContext());
  }

  async _onPlaySceneTrack(event) {
    event.preventDefault();
    const trackId = String(event.currentTarget.dataset.trackId || "").trim();
    const src = String(event.currentTarget.dataset.src || "").trim();
    const label = String(event.currentTarget.dataset.label || "").trim();
    if (!trackId || !src) return;
    const current = this.manager.getSceneAudioState();
    await this.manager.setSceneAudioState({
      trackId,
      src,
      label,
      volume: current.volume,
      loop: current.loop,
      playbackState: "playing",
      position: 0
    }, { skipRender: true });
    const context = this._getSceneSoundContext();
    this._syncSceneAudioPlayback(context);
    this._refreshSoundControlsUi(context);
  }

  async _onSceneAudioPlay(event) {
    event.preventDefault();
    const context = this._getSceneSoundContext();
    const current = this.manager.getSceneAudioState();
    const nextTrack = context.tracks.find((track) => track.id === current.trackId) ?? context.tracks[0] ?? null;
    if (!nextTrack) return;
    const audio = this._ensureMusicAudioElement();
    await this.manager.setSceneAudioState({
      trackId: nextTrack.id,
      src: nextTrack.src,
      label: nextTrack.label,
      volume: current.volume,
      loop: current.loop,
      playbackState: "playing",
      position: current.playbackState === "paused" ? audio.currentTime || current.position || 0 : (current.position || 0)
    }, { skipRender: true });
    this._syncSceneAudioPlayback(context);
    this._refreshSoundControlsUi(context);
  }

  async _onSceneAudioPause(event) {
    event.preventDefault();
    const audio = this._ensureMusicAudioElement();
    await this.manager.setSceneAudioState({
      playbackState: "paused",
      position: audio.currentTime || 0
    }, { skipRender: true });
    const context = this._getSceneSoundContext();
    this._syncSceneAudioPlayback(context);
    this._refreshSoundControlsUi(context);
  }

  async _onSceneAudioStop(event) {
    event.preventDefault();
    await this.manager.setSceneAudioState({
      playbackState: "stopped",
      position: 0
    }, { skipRender: true });
    const context = this._getSceneSoundContext();
    this._syncSceneAudioPlayback(context);
    this._refreshSoundControlsUi(context);
  }

  async _onSceneAudioLoop(event) {
    event.preventDefault();
    const current = this.manager.getSceneAudioState();
    const nextLoop = !current.loop;
    const audio = this._ensureMusicAudioElement();
    audio.loop = nextLoop;
    audio.toggleAttribute("loop", nextLoop);
    await this.manager.setSceneAudioState({
      loop: nextLoop
    }, { skipRender: true });
    const context = this._getSceneSoundContext();
    this._syncSceneAudioPlayback(context);
    this._refreshSoundControlsUi(context);
  }

  async _onSetSceneAudioVolume(event) {
    const volume = Math.max(0, Math.min(1, Number(event.currentTarget?.value) || 0));
    const audio = this._ensureMusicAudioElement();
    this._applyEffectiveSceneAudioVolume(audio, volume);
    await this.manager.setSceneAudioState({
      volume
    }, { skipRender: true });
    this._refreshSoundControlsUi(this._getSceneSoundContext());
  }

  async _onPlaySoundboardItem(event) {
    event.preventDefault();
    const src = String(event.currentTarget.dataset.src || "").trim();
    const label = String(event.currentTarget.dataset.label || "").trim();
    if (!src) return;
    const volume = this.manager.getSceneAudioState().volume;
    await this.manager.triggerSoundboardSound({ src, label, volume }, { skipRender: true });
    this._syncSceneAudioPlayback(this._getSceneSoundContext());
  }

  _onSoundboardPagePrev(event) {
    event.preventDefault();
    this.soundboardPage = Math.max(0, this.soundboardPage - 1);
    this._refreshSoundControlsUi(this._getSceneSoundContext());
  }

  _onSoundboardPageNext(event) {
    event.preventDefault();
    const context = this._getSceneSoundContext();
    const maxPage = Math.max(0, context.soundboardPages.length - 1);
    this.soundboardPage = Math.min(maxPage, this.soundboardPage + 1);
    this._refreshSoundControlsUi(context);
  }

  _refreshSoundControlsUi(soundContext = null) {
    const root = this.element?.[0];
    if (!root) return;
    const context = soundContext ?? this._getSceneSoundContext();
    const current = this.manager.getSceneAudioState();
    const hasControls = Boolean(game.user?.isGM) && (context.tracks.length > 0 || context.soundboard.length > 0);
    const soundShell = root.querySelector(".tom-scene-sound-shell");
    const soundPanel = root.querySelector(".tom-scene-sound-panel");
    if (soundShell instanceof HTMLElement) {
      soundShell.toggleAttribute("hidden", !hasControls);
    }
    if (!(soundPanel instanceof HTMLElement)) return;
    soundPanel.toggleAttribute("hidden", !this.isSoundControlsOpen || !hasControls);
    if (soundPanel.hidden) return;
    soundPanel.classList.toggle("is-content-collapsed", this.isSoundPanelContentCollapsed);
    const contentToggle = soundPanel.querySelector("[data-action='toggle-sound-panel-content']");
    if (contentToggle instanceof HTMLElement) {
      contentToggle.classList.toggle("is-active", this.isSoundPanelContentCollapsed);
      contentToggle.setAttribute("aria-pressed", this.isSoundPanelContentCollapsed ? "true" : "false");
      contentToggle.setAttribute("title", this.isSoundPanelContentCollapsed ? tr("Show tracks and soundboard") : tr("Hide tracks and soundboard"));
      contentToggle.setAttribute("aria-label", this.isSoundPanelContentCollapsed ? tr("Show tracks and soundboard") : tr("Hide tracks and soundboard"));
      const icon = contentToggle.querySelector("i");
      if (icon) icon.className = `fas ${this.isSoundPanelContentCollapsed ? "fa-chevron-up" : "fa-chevron-down"}`;
    }
    const content = soundPanel.querySelector(".tom-scene-sound-panel__content");
    if (content instanceof HTMLElement) {
      content.hidden = this.isSoundPanelContentCollapsed;
    }

    const trackList = soundPanel.querySelector(".tom-scene-sound-panel__track-list");
    if (trackList instanceof HTMLElement) {
      trackList.innerHTML = context.tracks.map((track) => `
        <button
          type="button"
          class="tom-scene-sound-track tom-button tom-button-ghost ${current.trackId === track.id ? "is-active" : ""} ${current.trackId === track.id && current.loop ? "is-looping" : ""}"
          data-action="play-scene-track"
          data-track-id="${this._escapeMarkup(track.id)}"
          data-src="${this._escapeMarkup(track.src)}"
          data-label="${this._escapeMarkup(track.label)}"
          title="${this._escapeMarkup(track.label)}"
        >
          <span>${this._escapeMarkup(track.label)}</span>
          ${track.playlistName ? `<small>${this._escapeMarkup(track.playlistName)}</small>` : ""}
          ${current.trackId === track.id && current.playbackState === "playing" ? `
            <span class="tom-scene-sound-track__status" aria-hidden="true">
              <i class="fas fa-play"></i>
              ${current.loop ? '<i class="fas fa-repeat tom-scene-sound-track__loop"></i>' : ""}
            </span>
          ` : ""}
        </button>
      `).join("");
    }

    const volumeInput = soundPanel.querySelector("[data-action='set-scene-audio-volume']");
    if (volumeInput instanceof HTMLInputElement) {
      volumeInput.value = String(Math.max(0, Math.min(1, Number(current.volume) || 0)));
    }
    const volumeValue = soundPanel.querySelector(".tom-scene-sound-panel__volume-value");
    if (volumeValue instanceof HTMLElement) {
      volumeValue.textContent = `${Math.round((Number(current.volume) || 0) * 100)}%`;
    }

    const loopButton = soundPanel.querySelector("[data-action='scene-audio-loop']");
    if (loopButton instanceof HTMLElement) {
      const isLooping = Boolean(current.loop);
      loopButton.classList.toggle("is-active", isLooping);
      loopButton.setAttribute("aria-pressed", isLooping ? "true" : "false");
      loopButton.setAttribute("title", isLooping ? tr("Disable loop") : tr("Enable loop"));
      loopButton.setAttribute("aria-label", isLooping ? tr("Disable loop") : tr("Enable loop"));
    }

    const pageCount = Math.max(1, context.soundboardPages.length || 1);
    const pageItems = context.soundboardPages[this.soundboardPage] ?? [];
    const pagination = soundPanel.querySelector(".tom-scene-sound-panel__board-pagination");
    if (pagination instanceof HTMLElement) {
      pagination.hidden = pageCount <= 1;
      const label = pagination.querySelector("span");
      if (label) label.textContent = `${this.soundboardPage + 1} / ${pageCount}`;
    }

    const boardGrid = soundPanel.querySelector(".tom-scene-sound-panel__board-grid");
    if (boardGrid instanceof HTMLElement) {
      const columnCount = Math.max(1, Math.min(5, pageItems.length || 1));
      const boardWidth = (columnCount * 75) + ((columnCount - 1) * 7.2);
      const trackColumnWidth = 252;
      const targetPanelWidth = Math.max(520, Math.min(760, trackColumnWidth + boardWidth + 52));
      soundPanel.style.setProperty("--tom-sound-panel-target-width", `${targetPanelWidth}px`);
      boardGrid.style.setProperty("--tom-soundboard-columns", String(columnCount));
      boardGrid.innerHTML = pageItems.map((entry) => `
        <button
          type="button"
          class="tom-scene-soundboard-item tom-button tom-button-ghost ${entry.icon ? "has-image" : ""}"
          data-action="play-soundboard-item"
          data-src="${this._escapeMarkup(entry.src)}"
          data-label="${this._escapeMarkup(entry.label)}"
          title="${this._escapeMarkup(entry.label)}"
          style="${this._escapeMarkup(this._buildSoundboardTileStyle(entry))}"
        >
          <span>${this._escapeMarkup(entry.label)}</span>
        </button>
      `).join("");
    }
  }

  _playSoundboardEffect(src, volume = 1) {
    const normalizedSrc = String(src || "").trim();
    if (!normalizedSrc) return;
    const normalizedVolume = Math.max(0, Math.min(1, Number(volume) || 0));
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

  _syncSceneAudioPlayback(soundContext = null) {
    const context = soundContext ?? this._getSceneSoundContext();
    const state = this.manager.getSceneAudioState();
    const audio = this._ensureMusicAudioElement();
    const targetTrack = context.tracks.find((track) => track.id === state.trackId) ?? null;

    this._applyEffectiveSceneAudioVolume(audio, state.volume);
    audio.loop = Boolean(state.loop);
    audio.toggleAttribute("loop", Boolean(state.loop));

    if (!targetTrack || !state.src) {
      audio.pause();
      audio.currentTime = 0;
    } else {
      const normalizedSrc = String(targetTrack.src || state.src || "").trim();
      const currentSrc = audio.getAttribute("src") || "";
      let srcChanged = false;
      if (normalizedSrc && currentSrc !== normalizedSrc) {
        audio.setAttribute("src", normalizedSrc);
        audio.load();
        srcChanged = true;
      }

      if (state.playbackState === "playing") {
        const shouldRestorePosition = Number.isFinite(Number(state.position)) && (srcChanged || audio.paused);
        if (shouldRestorePosition && Math.abs((audio.currentTime || 0) - Number(state.position)) > 1) {
          try {
            audio.currentTime = Number(state.position) || 0;
          } catch (_error) {
            // ignore seek errors during load
          }
        }
        void audio.play().catch(() => {});
      } else if (state.playbackState === "paused") {
        audio.pause();
      } else {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch (_error) {
          // ignore
        }
      }
    }

    const trigger = this.manager.getSoundboardTrigger();
    if (trigger?.id && trigger.id !== this._lastSoundboardTriggerId && trigger.sceneId === this.manager.getActiveScene()?.id) {
      this._lastSoundboardTriggerId = trigger.id;
      this._playSoundboardEffect(trigger.src, trigger.volume);
    }
  }

  _onStageDragOver(event) {
    event.preventDefault();
    const transfer = (event.originalEvent ?? event)?.dataTransfer;
    if (transfer) transfer.dropEffect = "copy";
  }

  async _onStageDrop(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const dropData = await resolveFoundryDocumentDrop(event);
    if (!dropData?.actor) return;
    await this.manager.addDroppedActorToActiveScene(dropData);
  }

  _scheduleTransformPersist(sceneActorId, patch = {}) {
    if (!sceneActorId) return;
    const existingTimeout = this._transformPersistTimeouts.get(sceneActorId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    const timeoutId = window.setTimeout(async () => {
      this._transformPersistTimeouts.delete(sceneActorId);
      await this.manager.setSceneActorTransform(sceneActorId, patch, { skipRender: true });
    }, 120);
    this._transformPersistTimeouts.set(sceneActorId, timeoutId);
  }

  _onActorPointerDown(event) {
    if (!game.user?.isGM || event.button !== 0) return;
    const actorElement = event.currentTarget;
    if (event.target?.closest?.(".tom-actor-status-row")) return;
    if (!actorElement?.dataset?.sceneActorId) return;

    event.preventDefault();
    actorElement.classList.add("is-dragging");

    this._dragState = {
      actorElement,
      sceneActorId: actorElement.dataset.sceneActorId,
      startX: event.clientX,
      startY: event.clientY,
      originOffsetX: Number(actorElement.dataset.offsetX) || 0,
      originOffsetY: Number(actorElement.dataset.offsetY) || 0,
      dragged: false
    };

    window.addEventListener("pointermove", this._boundPointerMove);
    window.addEventListener("pointerup", this._boundPointerUp);
  }

  _onActorPointerMove(event) {
    if (!this._dragState) return;
    const deltaX = event.clientX - this._dragState.startX;
    const deltaY = event.clientY - this._dragState.startY;
    if (!this._dragState.dragged && Math.hypot(deltaX, deltaY) < 2) return;
    this._dragState.dragged = true;
    const nextOffsetX = this._dragState.originOffsetX + deltaX;
    const nextOffsetY = this._dragState.originOffsetY + deltaY;
    this._dragState.actorElement.dataset.offsetX = String(nextOffsetX);
    this._dragState.actorElement.dataset.offsetY = String(nextOffsetY);
    this._dragState.actorElement.style.setProperty("--tom-actor-offset-x", `${nextOffsetX}px`);
    this._dragState.actorElement.style.setProperty("--tom-actor-offset-y", `${nextOffsetY}px`);
  }

  async _onActorPointerUp() {
    if (!this._dragState) return;
    window.removeEventListener("pointermove", this._boundPointerMove);
    window.removeEventListener("pointerup", this._boundPointerUp);

    const sceneActorId = this._dragState.sceneActorId;
    const wasDragged = this._dragState.dragged;
    const finalOffsetX = Number(this._dragState.actorElement.dataset.offsetX) || 0;
    const finalOffsetY = Number(this._dragState.actorElement.dataset.offsetY) || 0;
    this._dragState.actorElement.classList.remove("is-dragging");
    this._dragState = null;
    if (!wasDragged) return;
    this._recentlyDraggedSceneActorId = sceneActorId;
    window.setTimeout(() => {
      if (this._recentlyDraggedSceneActorId === sceneActorId) {
        this._recentlyDraggedSceneActorId = null;
      }
    }, 60);
    await this.manager.setSceneActorTransform(sceneActorId, { offsetX: finalOffsetX, offsetY: finalOffsetY }, { skipRender: true });
  }

  async _onActorWheel(event) {
    if (!game.user?.isGM) return;
    const actorElement = event.currentTarget;
    if (!actorElement?.dataset?.sceneActorId) return;
    if (event.target?.closest?.(".tom-actor-status-row")) return;

    event.preventDefault();
    const sceneActorId = actorElement.dataset.sceneActorId;
    const isHighlighted = actorElement.classList.contains("is-highlighted");
    const currentScale = isHighlighted
      ? (Number(actorElement.dataset.activeScale) || ((Number(actorElement.dataset.scale) || 1) * 1.4))
      : (Number(actorElement.dataset.scale) || 1);
    const direction = event.originalEvent?.deltaY ?? event.deltaY;
    const nextScale = Math.max(0.4, Math.min(2.4, currentScale + (direction > 0 ? -0.05 : 0.05)));
    if (isHighlighted) {
      actorElement.dataset.activeScale = String(nextScale);
      actorElement.style.setProperty("--tom-actor-highlight-scale", String(nextScale));
      actorElement.style.setProperty("--tom-actor-label-compensation", String(this._buildActorLabelCompensation(nextScale)));
      this._scheduleTransformPersist(sceneActorId, { activeScale: nextScale });
      return;
    }

    const currentActiveScale = Number(actorElement.dataset.activeScale) || (currentScale * 1.4);
    actorElement.dataset.scale = String(nextScale);
    actorElement.style.setProperty("--tom-actor-scale", String(nextScale));
    actorElement.style.setProperty("--tom-actor-highlight-scale", String(currentActiveScale));
    actorElement.style.setProperty("--tom-actor-label-compensation", String(this._buildActorLabelCompensation(nextScale)));
    this._scheduleTransformPersist(sceneActorId, { scale: nextScale });
  }

  _onEditScene(event) {
    event.preventDefault();
    const sceneId = this.manager.getActiveScene()?.id;
    if (!sceneId) return;
    game.modules.get(MODULE_ID)?.api?.openSceneConfig?.(sceneId);
  }

  async _onAutoArrangeActors(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;

    const root = this.element?.[0];
    const actorsContainer = root?.querySelector(".tom-actors");
    if (!(actorsContainer instanceof HTMLElement)) return;

    const actorElements = Array.from(actorsContainer.querySelectorAll(".tom-actor[data-scene-actor-id]"));
    if (!actorElements.length) return;

    const containerRect = actorsContainer.getBoundingClientRect();

    const actors = actorElements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const currentOffsetX = Number(element.dataset.offsetX) || 0;
        const currentOffsetY = Number(element.dataset.offsetY) || 0;
        const scale = Number(element.dataset.scale) || 1;
        return {
          element,
          sceneActorId: element.dataset.sceneActorId,
          rect,
          width: rect.width,
          centerX: rect.left - containerRect.left + (rect.width / 2),
          currentOffsetX,
          currentOffsetY,
          scale
        };
      })
      .sort((left, right) => left.centerX - right.centerX);

    const totalWidth = actors.reduce((sum, actor) => sum + actor.width, 0);
    const edgeRatio =
      actors.length <= 2 ? 0.14 :
      actors.length === 3 ? 0.11 :
      actors.length === 4 ? 0.09 :
      0.07;
    const sidePadding = Math.max(42, Math.min(160, containerRect.width * edgeRatio));
    const availableWidth = Math.max(totalWidth, containerRect.width - (sidePadding * 2));
    const gap = actors.length > 1
      ? Math.max(20, Math.min(72, (availableWidth - totalWidth) / Math.max(actors.length - 1, 1)))
      : 0;
    const spanWidth = totalWidth + (gap * Math.max(actors.length - 1, 0));
    const startX = ((containerRect.width - spanWidth) / 2);
    let cursorX = startX;

    const transformPatches = {};

    for (const actor of actors) {
      const targetCenterX = cursorX + (actor.width / 2);
      cursorX += actor.width + gap;
      const deltaX = targetCenterX - actor.centerX;
      const nextOffsetX = actor.currentOffsetX + deltaX;
      const nextOffsetY = 0;

      actor.element.dataset.offsetX = String(nextOffsetX);
      actor.element.dataset.offsetY = String(nextOffsetY);
      actor.element.style.setProperty("--tom-actor-offset-x", `${nextOffsetX}px`);
      actor.element.style.setProperty("--tom-actor-offset-y", `${nextOffsetY}px`);
      actor.element.style.setProperty("--tom-actor-scale", String(actor.scale));
      actor.element.style.setProperty("--tom-actor-highlight-scale", String(actor.activeScale ?? (actor.scale * 1.4)));
      transformPatches[actor.sceneActorId] = {
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        scale: actor.scale,
        activeScale: actor.activeScale ?? (actor.scale * 1.4)
      };
    }

    await this.manager.setSceneActorTransformsBatch(transformPatches, { skipRender: true });
  }

  async close(options) {
    window.removeEventListener("pointermove", this._boundPointerMove);
    window.removeEventListener("pointerup", this._boundPointerUp);
    this._dragState = null;
    for (const timeoutId of this._transformPersistTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this._transformPersistTimeouts.clear();
    this._lastActorImages = {};
    this._stopMusicVolumePolling();
    return super.close(options);
  }
}
