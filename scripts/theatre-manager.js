import { DEFAULT_RUNTIME_STATE, MODULE_ID, SCENE_TRANSITION_EFFECTS, SETTINGS } from "./constants.js";
import { clampScale, duplicateData, getActorById, hasActorOwnerPermission, normalizeRuntimeState, randomId } from "./helpers.js";
import { translate as tr } from "./localization.js";
import { TheatreStore } from "./store.js";

export class TheatreManager {
  constructor() {
    this.overlay = null;
    this._suppressedSettingKeys = new Set();
    this._pendingSceneTransition = null;
    this._lastActiveSceneId = null;
    this._bypassNextOverlaySync = false;
    this._previewRuntimeState = null;
  }

  _applyElementStyles(element, styles = {}) {
    if (!element) return;
    for (const [property, value] of Object.entries(styles)) {
      element.style[property] = value;
    }
    element.removeAttribute("hidden");
  }

  _clearElementStyles(element, properties = []) {
    if (!element) return;
    for (const property of properties) {
      element.style[property] = "";
    }
  }

  _notifyRenderError(error) {
      console.error(`${MODULE_ID} | Overlay render failed`, error);
    ui.notifications?.error(tr("Footlights Overlay could not be rendered. Details are available in the browser console."));
  }

  initialize(overlay) {
    this.overlay = overlay;
    this._lastActiveSceneId = this.getActiveScene()?.id ?? null;
    this.applyUiVisibility();
    this.renderOverlay();
  }

  _captureTransitionSnapshot() {
    const stageShell = this.overlay?.element?.[0]?.querySelector(".tom-stage-shell");
    if (!stageShell?.isConnected) return null;

    const snapshot = stageShell.cloneNode(true);
    snapshot.classList.add("tom-stage-shell--transition-snapshot");
    snapshot.setAttribute("aria-hidden", "true");
    snapshot.querySelectorAll("[data-action], button, input, select, textarea").forEach((element) => {
      element.setAttribute("disabled", "disabled");
      element.setAttribute("tabindex", "-1");
    });
    snapshot.querySelectorAll("video").forEach((video) => {
      try {
        video.pause?.();
      } catch (_error) {
        // no-op
      }
      video.removeAttribute("autoplay");
    });
    return snapshot;
  }

  getSceneTransitionSettings(theatreScene = null) {
    const scene = theatreScene ?? this.getActiveScene();
    const allowedEffects = SCENE_TRANSITION_EFFECTS.map((entry) => entry.value);
    const effect = String(scene?.settings?.transitionEffect || "none").trim();
    const duration = Number(scene?.settings?.transitionDuration);
    const intensity = Number(scene?.settings?.transitionIntensity);

    return {
      effect: allowedEffects.includes(effect) ? effect : "none",
      duration: Number.isFinite(duration) ? Math.max(0.3, Math.min(2.8, duration)) : 0.9,
      intensity: Number.isFinite(intensity) ? Math.max(0.6, Math.min(1.8, intensity)) : 1
    };
  }

  _queueSceneTransition(previousScene, nextScene) {
    if (!nextScene) {
      this._pendingSceneTransition = null;
      return;
    }

    const settings = this.getSceneTransitionSettings(nextScene);
    this._pendingSceneTransition = {
      fromSceneId: previousScene?.id || null,
      toSceneId: nextScene.id,
      settings,
      snapshot: settings.effect === "none" ? null : this._captureTransitionSnapshot()
    };
  }

  consumePendingSceneTransition() {
    const pending = this._pendingSceneTransition;
    this._pendingSceneTransition = null;
    return pending;
  }

  suppressNextSettingRefresh(settingKey) {
    if (settingKey) {
      this._suppressedSettingKeys.add(settingKey);
    }
  }

  shouldSkipSettingRefresh(settingKey) {
    if (!settingKey || !this._suppressedSettingKeys.has(settingKey)) return false;
    this._suppressedSettingKeys.delete(settingKey);
    return true;
  }

  _createFreshOverlay() {
    const OverlayClass = this.overlay?.constructor;
    if (!OverlayClass) return this.overlay;
    this.overlay = new OverlayClass(this);
    return this.overlay;
  }

  async _waitForOverlayElement(timeoutMs = 300) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const overlayElement = this.overlay?.element?.[0];
      if (overlayElement?.isConnected) {
        return overlayElement;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }

    return null;
  }

  getSharedRuntimeState() {
    return TheatreStore.getRuntimeState();
  }

  _isPreviewRuntimeActive() {
    return Boolean(game.user?.isGM && this._previewRuntimeState?.activeSceneId);
  }

  getRuntimeState() {
    return this._isPreviewRuntimeActive()
      ? normalizeRuntimeState(this._previewRuntimeState)
      : this.getSharedRuntimeState();
  }

  async _saveWorkingRuntimeState(runtimeState, { shared = false } = {}) {
    const normalizedRuntimeState = normalizeRuntimeState(runtimeState);
    if (!shared && this._isPreviewRuntimeActive()) {
      this._previewRuntimeState = normalizedRuntimeState;
      return normalizedRuntimeState;
    }

    this._previewRuntimeState = null;
    this.suppressNextSettingRefresh(`${MODULE_ID}.${SETTINGS.RUNTIME}`);
    await TheatreStore.saveRuntimeState(normalizedRuntimeState);
    return normalizedRuntimeState;
  }

  _buildSceneRuntimeState(theatreScene) {
    const sceneActorMoods = {};
    const sceneActorTransforms = {};
    for (const [index, sceneActor] of theatreScene.actors.entries()) {
      const sceneActorId = this.getSceneActorRuntimeId(sceneActor, index);
      sceneActorMoods[sceneActorId] = sceneActor.disableMoods && !sceneActor.avatarId
        ? ""
        : (sceneActor.initialMood || "neutral");
      sceneActorTransforms[sceneActorId] = {
        offsetX: Number.isFinite(Number(sceneActor.offsetX)) ? Number(sceneActor.offsetX) : 0,
        offsetY: Number.isFinite(Number(sceneActor.offsetY)) ? Number(sceneActor.offsetY) : 0,
        zIndex: Number.isFinite(Number(sceneActor.zIndex)) ? Number(sceneActor.zIndex) : (index + 1),
        scale: clampScale(sceneActor.scale, 1),
        activeScale: clampScale(sceneActor.activeScale, clampScale(sceneActor.scale, 1) * 1.4)
      };
    }

    return normalizeRuntimeState({
      activeSceneId: theatreScene.id,
      highlightedSceneActorIds: [],
      sceneActorMoods,
      sceneActorTransforms,
      backgroundDim: Number.isFinite(Number(theatreScene.settings?.backgroundDim))
        ? Math.max(0, Math.min(0.92, Number(theatreScene.settings.backgroundDim)))
        : 0,
      sceneAudio: {
        sceneId: theatreScene.id,
        trackId: null,
        src: "",
        label: "",
        volume: 0.7,
        loop: false,
        playbackState: "stopped",
        position: 0
      },
      soundboardTrigger: {
        id: null,
        sceneId: theatreScene.id,
        src: "",
        label: "",
        volume: 1
      },
      sharedLeftSidebarVisible: Boolean(theatreScene.settings?.sharedLeftSidebarVisible),
      sharedRightSidebarVisible: Boolean(theatreScene.settings?.sharedRightSidebarVisible)
    });
  }

  isSceneRevealedToPlayers(sceneId = null) {
    const targetSceneId = String(sceneId || this.getActiveScene()?.id || "").trim();
    if (!targetSceneId) return false;
    return this.getSharedRuntimeState().activeSceneId === targetSceneId;
  }

  isSharedLeftSidebarVisible() {
    return Boolean(this.getRuntimeState().sharedLeftSidebarVisible);
  }

  isSharedRightSidebarVisible() {
    return Boolean(this.getRuntimeState().sharedRightSidebarVisible);
  }

  _setLeftSidebarDomState(visible) {
    const uiLeftElement = document.getElementById("ui-left");
    const navigationElement = document.getElementById("navigation");
    const controlsElement = document.getElementById("controls");
    const playersElement = document.getElementById("players");

    this._applyElementStyles(uiLeftElement, {
      display: "",
      position: "fixed",
      top: "0",
      left: "0",
      bottom: "0",
      width: "18rem",
      maxWidth: "18rem",
      zIndex: "200"
    });

    for (const element of [navigationElement, controlsElement, playersElement]) {
      this._applyElementStyles(element, {
        display: "",
        visibility: "visible",
        opacity: "1",
        pointerEvents: "auto"
      });
    }
  }

  _setRightSidebarDomState(visible) {
    const uiRightElement = document.getElementById("ui-right");
    const sidebarElement = document.getElementById("sidebar");
    const sidebarTabsElement = document.getElementById("sidebar-tabs");
    const sidebarContentElement = document.getElementById("sidebar-content");
    const sidebarActiveTab = ui.sidebar?.activeTab || "chat";

    uiRightElement?.classList.toggle("collapsed", !visible);
    sidebarElement?.classList.toggle("collapsed", !visible);

    this._applyElementStyles(uiRightElement, {
      display: "",
      position: "fixed",
      top: "0",
      right: "0",
      bottom: "0",
      width: "20rem",
      maxWidth: "20rem",
      zIndex: "200"
    });

    this._applyElementStyles(sidebarElement, {
      display: "flex",
      flexDirection: "column",
      zIndex: "201",
      position: "relative",
      width: "100%",
      maxWidth: "100%"
    });

    this._applyElementStyles(sidebarTabsElement, {
      display: "flex"
    });

    this._applyElementStyles(sidebarContentElement, {
      display: ""
    });

    if (ui.sidebar) {
      ui.sidebar._collapsed = !visible;
      if (visible) {
        ui.sidebar.activateTab?.(sidebarActiveTab);
      }
    }
  }

  _clearRightSidebarDomState() {
    const uiRightElement = document.getElementById("ui-right");
    const sidebarElement = document.getElementById("sidebar");
    const sidebarTabsElement = document.getElementById("sidebar-tabs");
    const sidebarContentElement = document.getElementById("sidebar-content");
    const sidebarActiveTab = ui.sidebar?.activeTab || "chat";
    const elements = [
      uiRightElement,
      sidebarElement,
      sidebarTabsElement,
      sidebarContentElement
    ];

    for (const element of elements) {
      this._clearElementStyles(element, [
        "display",
        "position",
        "top",
        "right",
        "bottom",
        "width",
        "maxWidth",
        "zIndex",
        "flexDirection"
      ]);
    }

    uiRightElement?.classList.remove("collapsed");
    sidebarElement?.classList.remove("collapsed");
    sidebarTabsElement?.removeAttribute("hidden");
    sidebarContentElement?.removeAttribute("hidden");

    if (ui.sidebar) {
      ui.sidebar._collapsed = false;
      try {
        if (typeof ui.sidebar.expand === "function") {
          ui.sidebar.expand();
        }
        ui.sidebar.activateTab?.(sidebarActiveTab);
      } catch (error) {
        console.warn(`${MODULE_ID} | Sidebar state restore failed`, error);
      }
    }
  }

  _clearLeftSidebarDomState() {
    const elements = [
      document.getElementById("ui-left"),
      document.getElementById("navigation"),
      document.getElementById("controls"),
      document.getElementById("players")
    ];

    for (const element of elements) {
      this._clearElementStyles(element, [
        "display",
        "position",
        "top",
        "left",
        "bottom",
        "width",
        "maxWidth",
        "zIndex",
        "visibility",
        "pointerEvents",
        "opacity"
      ]);
    }
  }

  async setSharedLeftSidebarVisible(visible) {
    if (!game.user?.isGM) return;

    const theatreScene = this.getActiveScene();
    if (!theatreScene) return;

    const runtime = this.getRuntimeState();
    runtime.sharedLeftSidebarVisible = Boolean(visible);
    await this._saveWorkingRuntimeState(runtime);
    this.applyUiVisibility();
    if (this.overlay?.rendered) {
      await this.overlay.syncRuntimeState?.();
      return;
    }
    await this.renderOverlay(false);
  }

  async toggleSharedLeftSidebar() {
    await this.setSharedLeftSidebarVisible(!this.isSharedLeftSidebarVisible());
  }

  async setSharedRightSidebarVisible(visible) {
    if (!game.user?.isGM) return;

    const theatreScene = this.getActiveScene();
    if (!theatreScene) return;

    const runtime = this.getRuntimeState();
    runtime.sharedRightSidebarVisible = Boolean(visible);
    await this._saveWorkingRuntimeState(runtime);
    this.applyUiVisibility();
    if (this.overlay?.rendered) {
      await this.overlay.syncRuntimeState?.();
      return;
    }
    await this.renderOverlay(false);
  }

  async toggleSharedRightSidebar() {
    await this.setSharedRightSidebarVisible(!this.isSharedRightSidebarVisible());
  }

  getActiveScene() {
    const runtime = this.getRuntimeState();
    return runtime.activeSceneId ? TheatreStore.getSceneById(runtime.activeSceneId) : null;
  }

  getHighlightedSceneActorIds() {
    return this.getRuntimeState().highlightedSceneActorIds ?? [];
  }

  getBackgroundDim() {
    return Number(this.getRuntimeState().backgroundDim) || 0;
  }

  getSceneAudioState() {
    const runtime = this.getRuntimeState();
    return runtime.sceneAudio ?? {
      sceneId: null,
      trackId: null,
      src: "",
      label: "",
      volume: 0.7,
      loop: false,
      playbackState: "stopped",
      position: 0
    };
  }

  getSoundboardTrigger() {
    const runtime = this.getRuntimeState();
    return runtime.soundboardTrigger ?? {
      id: null,
      sceneId: null,
      src: "",
      label: "",
      volume: 1
    };
  }

  getSceneActorTransform(sceneActorId, theatreSceneActor = null) {
    const runtime = this.getRuntimeState();
    const runtimeTransform = runtime.sceneActorTransforms?.[sceneActorId] ?? {};
    const baseScale = clampScale(
      runtimeTransform.scale,
      clampScale(theatreSceneActor?.scale, 1)
    );
    return {
      offsetX: Number.isFinite(Number(runtimeTransform.offsetX))
        ? Number(runtimeTransform.offsetX)
        : (Number.isFinite(Number(theatreSceneActor?.offsetX)) ? Number(theatreSceneActor.offsetX) : 0),
      offsetY: Number.isFinite(Number(runtimeTransform.offsetY))
        ? Number(runtimeTransform.offsetY)
        : (Number.isFinite(Number(theatreSceneActor?.offsetY)) ? Number(theatreSceneActor.offsetY) : 0),
      zIndex: Number.isFinite(Number(runtimeTransform.zIndex))
        ? Number(runtimeTransform.zIndex)
        : (Number.isFinite(Number(theatreSceneActor?.zIndex)) ? Number(theatreSceneActor.zIndex) : 1),
      scale: baseScale,
      activeScale: clampScale(
        runtimeTransform.activeScale,
        clampScale(theatreSceneActor?.activeScale, baseScale * 1.4)
      )
    };
  }

  getSceneActorRuntimeId(theatreSceneActor, index = 0) {
    if (theatreSceneActor?.sceneActorId) return theatreSceneActor.sceneActorId;
    return `${theatreSceneActor?.actorId || "actor"}::${theatreSceneActor?.name || "entry"}::${index}`;
  }

  async _persistActiveSceneActorPatch(sceneActorId, patch = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const nextScene = duplicateData(theatreScene);
    const actorIndex = nextScene.actors.findIndex((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index) === sceneActorId);
    if (actorIndex === -1) return null;

    nextScene.actors[actorIndex] = {
      ...nextScene.actors[actorIndex],
      ...patch,
      sceneActorId
    };

    this.suppressNextSettingRefresh(`${MODULE_ID}.${SETTINGS.SCENES}`);
    await TheatreStore.upsertScene(nextScene);
    return nextScene.actors[actorIndex];
  }

  async _persistActiveSceneSettingsPatch(settingsPatch = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const nextScene = duplicateData(theatreScene);
    nextScene.settings = {
      ...(nextScene.settings ?? {}),
      ...settingsPatch
    };

    this.suppressNextSettingRefresh(`${MODULE_ID}.${SETTINGS.SCENES}`);
    await TheatreStore.upsertScene(nextScene);
    return nextScene.settings;
  }

  getCurrentMood(sceneActorId, theatreSceneActor = null) {
    if (theatreSceneActor?.disableMoods && !theatreSceneActor?.avatarId) return "";
    const runtime = this.getRuntimeState();
    const mood = runtime.sceneActorMoods[sceneActorId] ?? theatreSceneActor?.initialMood ?? "neutral";
    return this.normalizeMoodKey(mood);
  }

  normalizeMoodKey(mood) {
    const normalized = String(mood ?? "").trim().toLowerCase();
    if (!normalized || normalized === "0") return "neutral";
    return normalized;
  }

  findMoodValue(source, mood) {
    if (!source || typeof source !== "object") return "";
    const normalizedMood = this.normalizeMoodKey(mood);
    const directKey = Object.keys(source).find((key) => this.normalizeMoodKey(key) === normalizedMood);
    return directKey ? source[directKey] : "";
  }

  getDisplayedMoodLabel(mood) {
    if (!String(mood ?? "").trim()) return "";
    const normalized = this.normalizeMoodKey(mood);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  getMoodDisplayMode() {
    const theatreScene = this.getActiveScene();
    const mode = theatreScene?.settings?.moodDisplayMode;
    return ["all", "gm", "hidden"].includes(mode) ? mode : "all";
  }

  shouldShowMoodDisplay() {
    const mode = this.getMoodDisplayMode();
    if (mode === "hidden") return false;
    if (mode === "gm") return Boolean(game.user?.isGM);
    return true;
  }

  getDisplayedImage(actorId, sceneActorId, theatreSceneActor = null, overrideMood = null) {
    if (theatreSceneActor?.imageOverride && !theatreSceneActor?.avatarId) {
      return theatreSceneActor.imageOverride;
    }
    const mood = overrideMood || this.getCurrentMood(sceneActorId, theatreSceneActor);
    const libraryAvatar = theatreSceneActor?.avatarId
      ? TheatreStore.getAvatarById(theatreSceneActor.avatarId)
      : null;
    const profile = TheatreStore.getProfileByActorId(actorId);
    const actor = getActorById(actorId);

    return this.findMoodValue(libraryAvatar?.moodImages, mood)
      || libraryAvatar?.defaultImage
      || this.findMoodValue(profile?.moods, mood)
      || profile?.defaultImage
      || actor?.img
      || "";
  }

  getDisplayedActorName(actorId, theatreSceneActor = null) {
    const libraryAvatar = theatreSceneActor?.avatarId
      ? TheatreStore.getAvatarById(theatreSceneActor.avatarId)
      : null;
    const actor = getActorById(actorId);

    return theatreSceneActor?.name
      || libraryAvatar?.name
      || actor?.name
      || tr("Unnamed actor");
  }

  getRenderableActors() {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return [];

    const highlightedSceneActorIds = this.getHighlightedSceneActorIds();

    return theatreScene.actors
      .map((sceneActor, index) => {
        const actor = getActorById(sceneActor.actorId);
        if (!actor && !sceneActor?.imageOverride) return null;
        const libraryAvatar = sceneActor?.avatarId
          ? TheatreStore.getAvatarById(sceneActor.avatarId)
          : null;

        const sceneActorId = this.getSceneActorRuntimeId(sceneActor, index);
        const actorTransform = this.getSceneActorTransform(sceneActorId, sceneActor);
        const mood = this.getCurrentMood(sceneActorId, sceneActor);
        const isHighlighted = highlightedSceneActorIds.includes(sceneActorId);
        const availableMoods = this.getAvailableMoods(actor?.id || sceneActor.actorId || "", mood || "neutral", sceneActor);

        return {
          sceneActorId,
          actorId: actor?.id || sceneActor.actorId || sceneActorId,
          actorName: this.getDisplayedActorName(actor?.id || sceneActor.actorId || "", sceneActor),
          actorImage: this.getDisplayedImage(actor?.id || sceneActor.actorId || "", sceneActorId, sceneActor),
          frameImage: sceneActor?.frameImage || libraryAvatar?.frameImage || "",
          useCircularCrop: sceneActor?.useCircularCrop ?? Boolean(libraryAvatar?.useCircularCrop),
          circularCropScale: Math.max(0.7, Math.min(1.3, Number(sceneActor?.circularCropScale ?? libraryAvatar?.circularCropScale ?? 1) || 1)),
          frameFitScale: Math.max(0.6, Math.min(1.2, Number(sceneActor?.frameFitScale ?? libraryAvatar?.frameFitScale ?? 1) || 1)),
          showBackdrop: sceneActor?.showBackdrop ?? (libraryAvatar?.showBackdrop !== false),
          isMirrored: Boolean(sceneActor?.mirrored),
          showName: sceneActor?.showName !== false,
          isVisible: sceneActor?.isVisible !== false,
          mood,
          displayMoodLabel: this.getDisplayedMoodLabel(mood),
          position: sceneActor.position || "center",
          scale: actorTransform.scale,
          activeScale: actorTransform.activeScale,
          zIndex: actorTransform.zIndex,
          offsetX: actorTransform.offsetX,
          offsetY: actorTransform.offsetY,
          isHighlighted,
          canChangeMood: this.canUserChangeMood(actor),
          showMoodDisplay: this.shouldShowMoodDisplay() && availableMoods.length > 0,
          availableMoods,
          availableMoodOptions: availableMoods.map((moodKey) => ({
            key: moodKey,
            label: this.getDisplayedMoodLabel(moodKey),
            imagePath: this.getDisplayedImage(actor?.id || sceneActor.actorId || "", sceneActorId, sceneActor, moodKey)
          }))
        };
      })
      .filter(Boolean)
      .sort((left, right) => this.getActorOrder(left.position) - this.getActorOrder(right.position));
  }

  getActorOrder(position) {
    if (position === "left") return 1;
    if (position === "center") return 2;
    if (position === "right") return 3;
    return 4;
  }

  getAvailableMoods(actorId, fallbackMood = "neutral", theatreSceneActor = null) {
    if (theatreSceneActor?.disableMoods && !theatreSceneActor?.avatarId) return [];
    const libraryAvatar = theatreSceneActor?.avatarId
      ? TheatreStore.getAvatarById(theatreSceneActor.avatarId)
      : null;
    const profile = TheatreStore.getProfileByActorId(actorId);
    const moods = Array.from(new Set([
      ...TheatreStore.getMoodPresets(),
      ...Object.keys(libraryAvatar?.moodImages ?? {}),
      ...Object.keys(profile?.moods ?? {}),
      fallbackMood
    ].filter(Boolean).map((mood) => this.normalizeMoodKey(mood))));

    return moods.length ? moods : [fallbackMood];
  }

  canUserChangeMood(actor) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene || !actor) return false;
    if (game.user?.isGM) return true;
    if (!theatreScene.settings?.allowPlayerMoodChange) return false;
    return hasActorOwnerPermission(actor);
  }

  async activateScene(sceneId) {
    const theatreScene = TheatreStore.getSceneById(sceneId);
    if (!theatreScene) return false;
    const nextRuntimeState = this._buildSceneRuntimeState(theatreScene);

    if (game.user?.isGM) {
      this._previewRuntimeState = nextRuntimeState;
      return this.onSettingsChanged(true);
    }

    await this._saveWorkingRuntimeState(nextRuntimeState, { shared: true });

    const rendered = await this.onSettingsChanged(true);
    if (rendered) return true;

    await this._saveWorkingRuntimeState(duplicateData(DEFAULT_RUNTIME_STATE), { shared: true });
    await this.onSettingsChanged(true);
    return false;
  }

  async revealSceneToPlayers() {
    if (!game.user?.isGM) return false;
    const runtime = this.getRuntimeState();
    if (!runtime?.activeSceneId) return false;
    await this._saveWorkingRuntimeState(runtime, { shared: true });
    return this.onSettingsChanged(true);
  }

  async deactivateScene() {
    const sharedRuntime = this.getSharedRuntimeState();
    const previewSceneId = this._previewRuntimeState?.activeSceneId ?? null;
    if (this._isPreviewRuntimeActive() && previewSceneId && previewSceneId !== sharedRuntime.activeSceneId) {
      this._previewRuntimeState = null;
      await this.onSettingsChanged(true);
      return;
    }

    this._previewRuntimeState = null;
    await this._saveWorkingRuntimeState(duplicateData(DEFAULT_RUNTIME_STATE), { shared: true });
    await this.onSettingsChanged(true);
  }

  async toggleHighlight(sceneActorId, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return;

    const runtime = this.getRuntimeState();
    const highlighted = new Set(runtime.highlightedSceneActorIds ?? []);
    if (highlighted.has(sceneActorId)) highlighted.delete(sceneActorId);
    else highlighted.add(sceneActorId);
    runtime.highlightedSceneActorIds = Array.from(highlighted);
    await this._saveWorkingRuntimeState(runtime);
    if (!skipRender) {
      await this.onSettingsChanged();
    }
  }

  async setActiveSpeaker(actorId, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return;
    const firstMatch = theatreScene.actors.find((sceneActor) => sceneActor.actorId === actorId);
    if (!firstMatch) return;
    const sceneActorId = this.getSceneActorRuntimeId(firstMatch, theatreScene.actors.indexOf(firstMatch));
    await this.toggleHighlight(sceneActorId, { skipRender });
  }

  async setMood(sceneActorId, moodKey, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return;

    const sceneActor = theatreScene.actors.find((entry, index) => this.getSceneActorRuntimeId(entry, index) === sceneActorId) ?? null;
    if (!sceneActor?.actorId) return;

    const actor = getActorById(sceneActor.actorId);
    if (!this.canUserChangeMood(actor)) return;
    const normalizedMoodKey = this.normalizeMoodKey(moodKey);
    if (!this.getAvailableMoods(sceneActor.actorId, "neutral", sceneActor).includes(normalizedMoodKey)) return;

    const runtime = this.getRuntimeState();
    runtime.sceneActorMoods[sceneActorId] = normalizedMoodKey;
    await this._saveWorkingRuntimeState(runtime);
    if (!skipRender) {
      await this.onSettingsChanged();
    }
  }

  async setBackgroundDim(value, { skipRender = false } = {}) {
    const runtime = this.getRuntimeState();
    runtime.backgroundDim = Math.max(0, Math.min(0.92, Number(value) || 0));
    await this._saveWorkingRuntimeState(runtime);
    await this._persistActiveSceneSettingsPatch({ backgroundDim: runtime.backgroundDim });
    if (!skipRender) {
      await this.onSettingsChanged();
    }
  }

  async setSceneAudioState(patch = {}, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const runtime = this.getRuntimeState();
    runtime.sceneAudio = {
      ...(runtime.sceneAudio ?? {}),
      sceneId: theatreScene.id,
      trackId: patch.trackId !== undefined ? (patch.trackId ? String(patch.trackId) : null) : (runtime.sceneAudio?.trackId ?? null),
      src: patch.src !== undefined ? String(patch.src || "").trim() : String(runtime.sceneAudio?.src || "").trim(),
      label: patch.label !== undefined ? String(patch.label || "").trim() : String(runtime.sceneAudio?.label || "").trim(),
      volume: patch.volume !== undefined
        ? Math.max(0, Math.min(1, Number(patch.volume) || 0))
        : (Number.isFinite(Number(runtime.sceneAudio?.volume)) ? Number(runtime.sceneAudio.volume) : 0.7),
      loop: patch.loop !== undefined ? Boolean(patch.loop) : Boolean(runtime.sceneAudio?.loop),
      playbackState: ["playing", "paused", "stopped"].includes(String(patch.playbackState || "").trim())
        ? String(patch.playbackState).trim()
        : (["playing", "paused", "stopped"].includes(String(runtime.sceneAudio?.playbackState || "").trim())
          ? String(runtime.sceneAudio.playbackState).trim()
          : "stopped"),
      position: patch.position !== undefined
        ? Math.max(0, Number(patch.position) || 0)
        : (Number.isFinite(Number(runtime.sceneAudio?.position)) ? Number(runtime.sceneAudio.position) : 0)
    };
    await this._saveWorkingRuntimeState(runtime);
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return runtime.sceneAudio;
  }

  async triggerSoundboardSound({ src = "", label = "", volume = 1 } = {}, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene || !String(src || "").trim()) return null;

    const runtime = this.getRuntimeState();
    runtime.soundboardTrigger = {
      id: randomId(),
      sceneId: theatreScene.id,
      src: String(src || "").trim(),
      label: String(label || "").trim(),
      volume: Math.max(0, Math.min(1, Number(volume) || 0))
    };
    await this._saveWorkingRuntimeState(runtime);
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return runtime.soundboardTrigger;
  }

  async setSceneActorTransform(sceneActorId, patch = {}, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return null;

    const runtime = this.getRuntimeState();
    const current = runtime.sceneActorTransforms?.[sceneActorId] ?? { offsetX: 0, offsetY: 0, zIndex: 1, scale: 1, activeScale: 1.4 };
    runtime.sceneActorTransforms ??= {};
    runtime.sceneActorTransforms[sceneActorId] = {
      offsetX: Number.isFinite(Number(patch.offsetX)) ? Number(patch.offsetX) : Number(current.offsetX) || 0,
      offsetY: Number.isFinite(Number(patch.offsetY)) ? Number(patch.offsetY) : Number(current.offsetY) || 0,
      zIndex: Number.isFinite(Number(patch.zIndex)) ? Number(patch.zIndex) : Number(current.zIndex) || 1,
      scale: clampScale(patch.scale, clampScale(current.scale, 1)),
      activeScale: clampScale(
        patch.activeScale,
        clampScale(current.activeScale, clampScale(current.scale, 1) * 1.4)
      )
    };
    await this._saveWorkingRuntimeState(runtime);
    await this._persistActiveSceneActorPatch(sceneActorId, runtime.sceneActorTransforms[sceneActorId]);
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return runtime.sceneActorTransforms[sceneActorId];
  }

  async setSceneActorTransformsBatch(patchesById = {}, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene || !patchesById || typeof patchesById !== "object") return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    const runtime = this.getRuntimeState();
    runtime.sceneActorTransforms ??= {};
    const nextScene = duplicateData(theatreScene);
    const appliedTransforms = {};

    for (const [sceneActorId, patch] of Object.entries(patchesById)) {
      if (!validSceneActorIds.includes(sceneActorId)) continue;

      const current = runtime.sceneActorTransforms?.[sceneActorId] ?? { offsetX: 0, offsetY: 0, zIndex: 1, scale: 1, activeScale: 1.4 };
      const nextTransform = {
        offsetX: Number.isFinite(Number(patch?.offsetX)) ? Number(patch.offsetX) : Number(current.offsetX) || 0,
        offsetY: Number.isFinite(Number(patch?.offsetY)) ? Number(patch.offsetY) : Number(current.offsetY) || 0,
        zIndex: Number.isFinite(Number(patch?.zIndex)) ? Number(patch.zIndex) : Number(current.zIndex) || 1,
        scale: clampScale(patch?.scale, clampScale(current.scale, 1)),
        activeScale: clampScale(
          patch?.activeScale,
          clampScale(current.activeScale, clampScale(current.scale, 1) * 1.4)
        )
      };

      runtime.sceneActorTransforms[sceneActorId] = nextTransform;
      appliedTransforms[sceneActorId] = nextTransform;

      const actorIndex = nextScene.actors.findIndex((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index) === sceneActorId);
      if (actorIndex !== -1) {
        nextScene.actors[actorIndex] = {
          ...nextScene.actors[actorIndex],
          ...nextTransform,
          sceneActorId
        };
      }
    }

    if (!Object.keys(appliedTransforms).length) return null;

    await this._saveWorkingRuntimeState(runtime);
    this.suppressNextSettingRefresh(`${MODULE_ID}.${SETTINGS.SCENES}`);
    await TheatreStore.upsertScene(nextScene);

    if (!skipRender) {
      await this.onSettingsChanged();
    }

    return appliedTransforms;
  }

  async setSceneActorVisibility(sceneActorId, isVisible, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return null;

    const updatedActor = await this._persistActiveSceneActorPatch(sceneActorId, { isVisible: Boolean(isVisible) });
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return updatedActor;
  }

  async setSceneActorMirror(sceneActorId, isMirrored, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return null;

    const updatedActor = await this._persistActiveSceneActorPatch(sceneActorId, { mirrored: Boolean(isMirrored) });
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return updatedActor;
  }

  async setSceneActorNameVisibility(sceneActorId, showName, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return null;

    const updatedActor = await this._persistActiveSceneActorPatch(sceneActorId, { showName: Boolean(showName) });
    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return updatedActor;
  }

  async bringSceneActorToFront(sceneActorId, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return null;

    const validSceneActorIds = theatreScene.actors.map((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index));
    if (!validSceneActorIds.includes(sceneActorId)) return null;

    const runtime = this.getRuntimeState();
    runtime.sceneActorTransforms ??= {};
    const maxZIndex = Math.max(
      1,
      ...Object.values(runtime.sceneActorTransforms).map((entry) => Number(entry?.zIndex) || 0),
      ...theatreScene.actors.map((sceneActor, index) => {
        const id = this.getSceneActorRuntimeId(sceneActor, index);
        return Number(runtime.sceneActorTransforms?.[id]?.zIndex ?? sceneActor?.zIndex) || 0;
      })
    );

    return this.setSceneActorTransform(sceneActorId, { zIndex: maxZIndex + 1 }, { skipRender });
  }

  async removeSceneActor(sceneActorId, { skipRender = false } = {}) {
    const theatreScene = this.getActiveScene();
    if (!theatreScene) return false;

    const nextScene = duplicateData(theatreScene);
    const actorIndex = nextScene.actors.findIndex((sceneActor, index) => this.getSceneActorRuntimeId(sceneActor, index) === sceneActorId);
    if (actorIndex === -1) return false;

    nextScene.actors.splice(actorIndex, 1);

    this.suppressNextSettingRefresh(`${MODULE_ID}.${SETTINGS.SCENES}`);
    await TheatreStore.upsertScene(nextScene);

    const runtime = this.getRuntimeState();
    if (runtime.sceneActorMoods?.[sceneActorId] !== undefined) {
      delete runtime.sceneActorMoods[sceneActorId];
    }
    if (runtime.sceneActorTransforms?.[sceneActorId] !== undefined) {
      delete runtime.sceneActorTransforms[sceneActorId];
    }
    runtime.highlightedSceneActorIds = (runtime.highlightedSceneActorIds ?? []).filter((entry) => entry !== sceneActorId);
    await this._saveWorkingRuntimeState(runtime);

    if (!skipRender) {
      await this.onSettingsChanged();
    }
    return true;
  }

  async addDroppedActorToActiveScene(dropData = {}) {
    const theatreScene = this.getActiveScene();
    const actor = dropData?.actor;
    const actorId = String(actor?.id || dropData?.data?.actorId || "").trim();
    if (!theatreScene || !actor) return null;

    const libraryAvatar = actorId ? (TheatreStore.getAvatars().find((avatar) => avatar.actorId === actorId) ?? null) : null;
    const tokenDefaults = TheatreStore.getAvatarLibraryState()?.tokenDefaults ?? { frameImage: "", useCircularCrop: false };
    const sceneActor = {
      sceneActorId: randomId(),
      name: libraryAvatar ? (libraryAvatar.name || actor.name || dropData.name || tr("Unnamed actor")) : (dropData.name || actor.name || tr("Unnamed actor")),
      actorId,
      position: "center",
      scale: 1,
      initialMood: libraryAvatar ? (TheatreStore.getMoodPresets()[0] || "neutral") : "",
      avatarId: libraryAvatar?.id || "",
      imageOverride: libraryAvatar ? "" : String(dropData.imagePath || actor.img || "").trim(),
      disableMoods: !libraryAvatar,
      useCircularCrop: libraryAvatar ? Boolean(libraryAvatar.useCircularCrop) : Boolean(tokenDefaults.useCircularCrop),
      frameImage: libraryAvatar?.frameImage || tokenDefaults.frameImage || "",
      mirrored: false,
      showName: true,
      showBackdrop: libraryAvatar?.showBackdrop !== false,
      isVisible: true,
      offsetX: 0,
      offsetY: 0,
      zIndex: (Array.isArray(theatreScene.actors) ? theatreScene.actors.length : 0) + 1,
      activeScale: 1.4
    };

    await TheatreStore.upsertScene({
      ...duplicateData(theatreScene),
      actors: [...(Array.isArray(theatreScene.actors) ? theatreScene.actors : []), sceneActor]
    });

    const runtime = this.getRuntimeState();
    runtime.sceneActorMoods[sceneActor.sceneActorId] = sceneActor.initialMood || "";
    runtime.sceneActorTransforms ??= {};
    runtime.sceneActorTransforms[sceneActor.sceneActorId] = {
      offsetX: 0,
      offsetY: 0,
      zIndex: (Array.isArray(theatreScene.actors) ? theatreScene.actors.length : 0) + 1,
      scale: 1,
      activeScale: 1.4
    };
    await this._saveWorkingRuntimeState(runtime);
    await this.onSettingsChanged(false);
    return sceneActor;
  }

  async onSettingsChanged(force = false) {
    const previousScene = this._lastActiveSceneId ? TheatreStore.getSceneById(this._lastActiveSceneId) : null;
    const nextScene = this.getActiveScene();
    const sceneChanged = (previousScene?.id || null) !== (nextScene?.id || null);
    let hasCustomTransition = false;

    if (sceneChanged) {
      this._queueSceneTransition(previousScene, nextScene);
      hasCustomTransition = Boolean(this._pendingSceneTransition?.settings?.effect && this._pendingSceneTransition.settings.effect !== "none");
      force = !hasCustomTransition;
      this._bypassNextOverlaySync = hasCustomTransition;
    }

    this.applyUiVisibility();
    const rendered = await this.renderOverlay(force);
    this._lastActiveSceneId = nextScene?.id ?? null;
    return rendered;
  }

  applyUiVisibility() {
    const theatreScene = this.getActiveScene();
    const shouldHideUi = Boolean(theatreScene?.settings?.uiHidden) && !game.user?.isGM;
    const shouldShowSharedLeftSidebar = Boolean(theatreScene) && this.isSharedLeftSidebarVisible();
    const shouldShowSharedRightSidebar = Boolean(theatreScene) && this.isSharedRightSidebarVisible();

    document.body.classList.toggle("tom-ui-hidden", shouldHideUi);
    document.body.classList.toggle("tom-overlay-active", Boolean(theatreScene));
    document.body.classList.toggle("tom-gm-preview-active", Boolean(theatreScene) && Boolean(game.user?.isGM));
    document.body.classList.toggle("tom-shared-left-sidebar-open", shouldShowSharedLeftSidebar);
    document.body.classList.toggle("tom-shared-right-sidebar-open", shouldShowSharedRightSidebar);

    if (theatreScene) {
      this._setLeftSidebarDomState(shouldShowSharedLeftSidebar);
      this._setRightSidebarDomState(shouldShowSharedRightSidebar);
    } else {
      this._clearLeftSidebarDomState();
      this._clearRightSidebarDomState();
    }
  }

  async renderOverlay(force = false) {
    if (!this.overlay) return false;

    if (!this.getActiveScene()) {
      try {
        await this.overlay.close({ force: true });
      } catch (error) {
        this._notifyRenderError(error);
      }
      return true;
    }

    try {
      if (force && this.overlay.rendered) {
        await this.overlay.close({ force: true });
        this._createFreshOverlay();
      }

      if (!this.overlay.element?.length && !this.overlay.rendered) {
        this._createFreshOverlay();
      }

        if (!force && this.overlay.rendered && !this._bypassNextOverlaySync && this.overlay.canSyncRuntimeState?.()) {
          await this.overlay.syncRuntimeState?.();
          return true;
        }

        this._bypassNextOverlaySync = false;

        if (force) {
          this.overlay.playEntranceAnimation = !this._pendingSceneTransition;
        }

      const renderResult = this.overlay.render(true);
      if (renderResult && typeof renderResult.then === "function") {
        await renderResult;
      }

      const overlayElement = await this._waitForOverlayElement();
      if (!overlayElement) {
        throw new Error("Overlay wurde nicht in den DOM eingefuegt.");
      }

      return true;
    } catch (error) {
      this._notifyRenderError(error);
      return false;
    }
  }
}
