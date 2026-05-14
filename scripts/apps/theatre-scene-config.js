import { MODULE_ID, SCENE_TRANSITION_EFFECTS } from "../constants.js";
import { applyThemeInlineStyleToHost, bindFootlightsToggleSwitches, buildThemeInlineStyle, clearDraggedAvatarId, duplicateData, extractAvatarDropData, getActorById, isVideoMediaPath, normalizeSceneTags, openImagePickerForInput, randomId, resolveFoundryDocumentDrop, setAvatarDragData } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

const AVATAR_CROP_OFFSET_BASE = 220;

function cropOffsetToPercent(value) {
  const offset = Math.max(-160, Math.min(160, Number(value) || 0));
  return `${((offset / AVATAR_CROP_OFFSET_BASE) * 100).toFixed(3)}%`;
}

export class TheatreSceneConfigApplication extends FormApplication {
  constructor(manager, options = {}) {
    super({}, options);
    this.manager = manager;
    this.sceneId = options.sceneId ?? null;
    const theatreScene = this.sceneId ? TheatreStore.getSceneById(this.sceneId) : null;
    this.editableScene = foundry.utils.mergeObject(
      this._getDefaultSceneData(),
      duplicateData(theatreScene ?? {}),
      { inplace: false }
    );
    this.editableActors = (Array.isArray(this.editableScene.actors) ? this.editableScene.actors : [])
      .map((sceneActor) => this._normalizeSceneActorEntry(sceneActor));
    this.assignedSoundPlaylistIds = theatreScene?.id ? TheatreStore.getSceneSoundPlaylistIds(theatreScene.id) : [];
    this.dragOverIndex = null;
    this.isDropzoneActive = false;
    this._collapsedSections = new Set(["setup", "background", "transition", "actors"]);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-scene-config`,
      title: tr("Footlights Scene Config"),
      classes: [MODULE_ID, "theatre-scene-config"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-scene-config.hbs`,
      width: 1180,
      height: 900,
      closeOnSubmit: true,
      submitOnChange: false,
      resizable: true
    });
  }

  getData() {
    const moodPresets = TheatreStore.getMoodPresets();
    const avatars = TheatreStore.getAvatars();
    const themeState = TheatreStore.getThemeState();
    const moodDisplayModes = [
      { value: "all", label: tr("All") },
      { value: "gm", label: tr("GM only") },
      { value: "hidden", label: tr("Hidden") }
    ];
    const themeImageRepeatOptions = [
      { value: "no-repeat", label: tr("No tiling") },
      { value: "repeat", label: tr("Repeat") },
      { value: "repeat-x", label: tr("Repeat X") },
      { value: "repeat-y", label: tr("Repeat Y") }
    ];
    const transitionOptions = SCENE_TRANSITION_EFFECTS.map(({ value, label }) => ({ value, label }));
    const cinematicOptions = [
      { value: "standard", label: tr("Standard") },
      { value: "small", label: tr("Small") },
      { value: "medium", label: tr("Medium") },
      { value: "big", label: tr("Big") }
    ];
    const selectedTransitionOption = SCENE_TRANSITION_EFFECTS.find((option) => option.value === this.editableScene.settings?.transitionEffect)
      ?? SCENE_TRANSITION_EFFECTS[0];

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      scene: this.editableScene,
      moodPresets,
      moodDisplayModes,
      cinematicOptions,
      themeImageRepeatOptions,
      transitionOptions,
      selectedTransitionOption,
      sceneTagsValue: Array.isArray(this.editableScene?.tags) ? this.editableScene.tags.join(", ") : "",
      sectionSetupCollapsed: this._collapsedSections.has("setup"),
      sectionBackgroundCollapsed: this._collapsedSections.has("background"),
      sectionTransitionCollapsed: this._collapsedSections.has("transition"),
      sectionActorsCollapsed: this._collapsedSections.has("actors"),
      soundPlaylistRows: TheatreStore.getSoundPlaylists().map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        trackCount: Array.isArray(playlist.tracks) ? playlist.tracks.length : 0,
        soundboardCount: Array.isArray(playlist.soundboard) ? playlist.soundboard.length : 0,
        isAssigned: this.assignedSoundPlaylistIds.includes(playlist.id)
      })),
      libraryAvatarCount: avatars.length,
      hasAvatars: avatars.length > 0,
      isDropzoneActive: this.isDropzoneActive,
      avatarSidebarItems: avatars.map((avatar) => {
        const actor = getActorById(avatar.actorId);
        const thumbnail = avatar.defaultImage || actor?.img || "";
        return {
          id: avatar.id,
          name: avatar.name,
          actorName: actor?.name || tr("No actor"),
          thumbnail,
          frameImage: avatar.frameImage || "",
          useCircularCrop: Boolean(avatar.useCircularCrop),
          showBackdrop: avatar.showBackdrop !== false,
          thumbnailStyle: this._buildAvatarThumbnailStyle(avatar),
          hasAvatarThumbnail: Boolean(thumbnail)
        };
      }),
      sceneActors: this.editableActors.map((sceneActor, index) => {
        const actor = getActorById(sceneActor.actorId);
        const avatar = this._getAvatarPreviewData(sceneActor.avatarId, sceneActor.initialMood, sceneActor.actorId);

        return {
          ...sceneActor,
          actorName: this._getSceneActorDisplayName(sceneActor),
          actorImage: actor?.img || "",
          avatarName: avatar.name,
          previewImage: sceneActor.imageOverride || avatar.previewImage || actor?.img || "",
          frameImage: sceneActor.imageOverride ? sceneActor.frameImage : avatar.frameImage,
          useCircularCrop: sceneActor.imageOverride ? sceneActor.useCircularCrop : avatar.useCircularCrop,
          showBackdrop: sceneActor.imageOverride ? sceneActor.showBackdrop : avatar.showBackdrop,
          thumbnailStyle: sceneActor.imageOverride
            ? this._buildAvatarThumbnailStyle(sceneActor)
            : avatar.thumbnailStyle,
          hasLibraryAvatar: Boolean(sceneActor.avatarId && TheatreStore.getAvatarById(sceneActor.avatarId)),
          isDragOver: this.dragOverIndex === index,
          index
        };
      })
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const themeState = TheatreStore.getThemeState();
    const windowApp = this.form?.closest?.(".window-app") ?? html?.closest?.(".window-app")?.[0] ?? null;
    applyThemeInlineStyleToHost(windowApp, themeState);
    applyThemeInlineStyleToHost(this.element?.[0], themeState);
    applyThemeInlineStyleToHost(this.form, themeState);
    bindFootlightsToggleSwitches(html?.[0]);
    html.find("[data-scene-config-avatar='true']").on("dragstart", this._onSidebarAvatarDragStart.bind(this));
    html.find("[data-scene-config-avatar='true']").on("dragend", this._onSidebarAvatarDragEnd.bind(this));
    html.find("[data-action='add-avatar-to-scene']").on("click", this._onAddAvatarToScene.bind(this));
    html.find("[data-action='remove-actor']").on("click", this._onRemoveActor.bind(this));
    html.find("[data-action='create-scene-actor-avatar']").on("click", this._onCreateSceneActorAvatar.bind(this));
    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
    html.find("select[name$='.initialMood']").on("change", this._onActorConfigChanged.bind(this));
    html.find("[data-dropzone='scene-avatars']").on("dragenter", this._onDropzoneDragOver.bind(this));
    html.find("[data-dropzone='scene-avatars']").on("dragover", this._onDropzoneDragOver.bind(this));
    html.find("[data-dropzone='scene-avatars']").on("dragleave", this._onDropzoneDragLeave.bind(this));
    html.find("[data-dropzone='scene-avatars']").on("drop", this._onDropzoneDrop.bind(this));
    html.find("[data-scene-actor-index]").on("dragenter", this._onActorRowDragOver.bind(this));
    html.find("[data-scene-actor-index]").on("dragover", this._onActorRowDragOver.bind(this));
    html.find("[data-scene-actor-index]").on("dragleave", this._onActorRowDragLeave.bind(this));
    html.find("[data-scene-actor-index]").on("drop", this._onActorRowDrop.bind(this));
    html.find(".tom-range-with-value input[type='range']").on("input change", this._onRangeValueInput.bind(this));
    html.find("[name='background'], [name='settings.preserveBackgroundAspect'], [name='settings.cinematicBars'], [name='settings.backdropBlurEnabled'], [name='settings.backdropImage'], [name='settings.backdropImageScale'], [name='settings.backdropImageRepeat'], [name='settings.backdropDarkness'], [name='settings.transitionEffect'], [name='settings.transitionDuration'], [name='settings.transitionIntensity']").on("input change", this._onLivePreviewInput.bind(this));
    html.find("[data-action='toggle-scene-config-section']").on("click", this._onToggleSection.bind(this));
  }

  _formatRangeDisplayValue(input) {
    const value = Number(input?.value);
    if (!Number.isFinite(value)) return String(input?.value ?? "");
    const step = Number(input?.step);
    const decimals = Number.isFinite(step) && step > 0 && !Number.isInteger(step)
      ? Math.min(3, String(input.step).split(".")[1]?.length ?? 0)
      : 0;
    return value.toFixed(decimals).replace(/\.?0+$/, "");
  }

  _onRangeValueInput(event) {
    const input = event.currentTarget;
    const display = input?.closest?.(".tom-range-with-value")?.querySelector?.("span");
    if (!display) return;
    const suffix = input.dataset.rangeDisplaySuffix || "";
    display.textContent = `${this._formatRangeDisplayValue(input)}${suffix}`;
  }

  _onToggleSection(event) {
    event.preventDefault();
    const toggle = event.currentTarget;
    const sectionKey = String(toggle?.dataset?.sceneConfigSectionKey || "").trim();
    if (!sectionKey) return;
    if (this._collapsedSections.has(sectionKey)) this._collapsedSections.delete(sectionKey);
    else this._collapsedSections.add(sectionKey);
    const section = toggle.closest("[data-scene-config-section]");
    const isExpanded = !this._collapsedSections.has(sectionKey);
    const icon = toggle.querySelector("i");
    if (section) {
      section.classList.toggle("is-collapsed", !isExpanded);
      section.classList.toggle("is-expanded", isExpanded);
    }
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    if (icon) {
      icon.classList.toggle("fa-chevron-down", isExpanded);
      icon.classList.toggle("fa-chevron-right", !isExpanded);
    }
  }

  _getDefaultSceneData() {
    return {
      id: "",
      name: "",
      stageTitle: "",
      stageSubtitle: "",
      description: "",
      location: "",
      tags: [],
      background: "",
      thumbnail: "",
      actors: [],
      settings: {
        uiHidden: true,
        allowPlayerMoodChange: false,
        moodDisplayMode: "all",
        preserveBackgroundAspect: true,
        cinematicBars: "standard",
        backdropBlurEnabled: true,
        backdropImage: "",
        backdropImageScale: 1,
        backdropImageRepeat: "repeat",
        backdropDarkness: 0.2,
        transitionEffect: "none",
        transitionDuration: 0.9,
        transitionIntensity: 1,
        sharedLeftSidebarVisible: false,
        sharedRightSidebarVisible: false
      }
    };
  }

  _normalizeSubmittedActors(rawActors) {
    if (Array.isArray(rawActors)) return rawActors;
    if (!rawActors || typeof rawActors !== "object") return [];

    return Object.entries(rawActors)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, actorData]) => actorData);
  }

  _getValidAvatarId(actorId, avatarId) {
    if (!avatarId) return "";
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return "";
    if (actorId && avatar.actorId && avatar.actorId !== actorId) return "";
    return avatarId;
  }

  _getAvatarByActorId(actorId) {
    return TheatreStore.getAvatars().find((avatar) => avatar.actorId === actorId) ?? null;
  }

  _getTokenAvatarDefaults() {
    return TheatreStore.getAvatarLibraryState()?.tokenDefaults ?? { frameImage: "", useCircularCrop: false };
  }

  _buildAvatarThumbnailStyle(avatar = {}) {
    return [
      `--tom-avatar-thumb-crop-scale:${Math.max(0.7, Math.min(3, Number(avatar.circularCropScale ?? 1) || 1))}`,
      `--tom-avatar-thumb-crop-offset-x:${cropOffsetToPercent(avatar.cropOffsetX)}`,
      `--tom-avatar-thumb-crop-offset-y:${cropOffsetToPercent(avatar.cropOffsetY)}`,
      `--tom-avatar-thumb-frame-fit-scale:${Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale ?? 1) || 1))}`
    ].join(";");
  }

  _normalizeSceneActorEntry(sceneActor = {}) {
    const toBoolean = (value) => value === true || value === "true" || value === 1 || value === "1" || value === "on";
    const actorId = String(sceneActor.actorId || "").trim();
    const avatarId = this._getValidAvatarId(actorId, sceneActor.avatarId || "");
    const avatar = avatarId ? TheatreStore.getAvatarById(avatarId) : null;
    const fallbackMood = TheatreStore.getMoodPresets()[0] || "neutral";

    return {
      sceneActorId: sceneActor.sceneActorId || randomId(),
      name: sceneActor.name || this._getSceneActorDisplayName(sceneActor),
      actorId,
      position: sceneActor.position || "center",
      scale: Number(sceneActor.scale ?? 1) || 1,
      activeScale: Math.max(0.4, Number(sceneActor.activeScale ?? ((Number(sceneActor.scale ?? 1) || 1) * 1.4)) || ((Number(sceneActor.scale ?? 1) || 1) * 1.4)),
      initialMood: avatarId
        ? (sceneActor.initialMood || fallbackMood)
        : (toBoolean(sceneActor.disableMoods) ? "" : (sceneActor.initialMood || fallbackMood)),
      avatarId,
      imageOverride: String(sceneActor.imageOverride || "").trim(),
      disableMoods: avatarId ? false : toBoolean(sceneActor.disableMoods),
      useCircularCrop: avatar ? Boolean(avatar.useCircularCrop) : toBoolean(sceneActor.useCircularCrop),
      circularCropScale: avatar
        ? Math.max(0.7, Math.min(3, Number(avatar.circularCropScale) || 1))
        : Math.max(0.7, Math.min(3, Number(sceneActor.circularCropScale) || 1)),
      cropOffsetX: avatar
        ? Math.max(-160, Math.min(160, Number(avatar.cropOffsetX) || 0))
        : Math.max(-160, Math.min(160, Number(sceneActor.cropOffsetX) || 0)),
      cropOffsetY: avatar
        ? Math.max(-160, Math.min(160, Number(avatar.cropOffsetY) || 0))
        : Math.max(-160, Math.min(160, Number(sceneActor.cropOffsetY) || 0)),
      frameFitScale: avatar
        ? Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale) || 1))
        : Math.max(0.6, Math.min(1.2, Number(sceneActor.frameFitScale) || 1)),
      frameImage: avatar ? String(avatar.frameImage || "").trim() : String(sceneActor.frameImage || "").trim(),
      showBackdrop: avatar
        ? avatar.showBackdrop !== false
        : (sceneActor.showBackdrop === undefined ? true : toBoolean(sceneActor.showBackdrop)),
      mirrored: toBoolean(sceneActor.mirrored),
      showName: sceneActor.showName === undefined ? true : toBoolean(sceneActor.showName),
      isVisible: sceneActor.isVisible === undefined ? true : toBoolean(sceneActor.isVisible),
      offsetX: Number.isFinite(Number(sceneActor.offsetX)) ? Number(sceneActor.offsetX) : 0,
      offsetY: Number.isFinite(Number(sceneActor.offsetY)) ? Number(sceneActor.offsetY) : 0
    };
  }

  _createTokenActorEntry(dropData) {
    const actor = dropData?.actor;
    const actorId = String(actor?.id || dropData?.data?.actorId || "").trim();
    if (!actor) return null;

    const libraryAvatar = actorId ? this._getAvatarByActorId(actorId) : null;
    if (libraryAvatar) {
      return this._normalizeSceneActorEntry({
        sceneActorId: randomId(),
        name: libraryAvatar.name || actor.name || dropData?.name || tr("Unnamed actor"),
        actorId,
        position: "center",
        scale: 1,
        activeScale: 1.4,
        initialMood: TheatreStore.getMoodPresets()[0] || "neutral",
        avatarId: libraryAvatar.id
      });
    }

    const defaults = this._getTokenAvatarDefaults();
    return this._normalizeSceneActorEntry({
      sceneActorId: randomId(),
      name: dropData?.name || actor.name || tr("Unnamed actor"),
      actorId,
      position: "center",
      scale: 1,
      activeScale: 1.4,
      initialMood: "",
      avatarId: "",
      imageOverride: dropData?.imagePath || actor.img || "",
      disableMoods: true,
      useCircularCrop: Boolean(defaults.useCircularCrop),
      frameImage: defaults.frameImage || "",
      mirrored: false,
      showName: true,
      showBackdrop: true,
      isVisible: true
    });
  }

  _getAvatarPreviewData(avatarId, mood, actorId) {
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) {
      return {
        name: tr("No library avatar"),
        previewImage: ""
      };
    }

    const actor = getActorById(actorId || avatar.actorId);
    return {
      name: avatar.name,
      previewImage: avatar.moodImages?.[mood] || avatar.defaultImage || actor?.img || "",
      useCircularCrop: Boolean(avatar.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(3, Number(avatar.circularCropScale) || 1)),
      cropOffsetX: Math.max(-160, Math.min(160, Number(avatar.cropOffsetX) || 0)),
      cropOffsetY: Math.max(-160, Math.min(160, Number(avatar.cropOffsetY) || 0)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale) || 1)),
      frameImage: avatar.frameImage || "",
      showBackdrop: avatar.showBackdrop !== false,
      thumbnailStyle: this._buildAvatarThumbnailStyle(avatar)
    };
  }

  _getSceneActorDisplayName(sceneActor) {
    const avatar = sceneActor?.avatarId ? TheatreStore.getAvatarById(sceneActor.avatarId) : null;
    const actor = getActorById(sceneActor?.actorId);
    return sceneActor?.name || avatar?.name || actor?.name || tr("Unnamed actor");
  }

  _syncEditableActorsFromForm() {
    if (!this.form) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const actors = this._normalizeSubmittedActors(formData.actors);

    this.editableActors = actors.map((sceneActor) => this._normalizeSceneActorEntry(sceneActor));

    this.editableScene = {
      ...this._getDefaultSceneData(),
      ...this.editableScene,
      id: formData.id || this.sceneId || "",
      name: formData.name || "",
      stageTitle: formData.stageTitle || "",
      stageSubtitle: formData.stageSubtitle || "",
      description: String(formData.description || "").trim(),
      location: String(formData.location || "").trim(),
      tags: normalizeSceneTags(formData.tagsInput),
      background: formData.background || "",
      thumbnail: formData.thumbnail || "",
      settings: {
        uiHidden: Boolean(formData.settings?.uiHidden),
        allowPlayerMoodChange: Boolean(formData.settings?.allowPlayerMoodChange),
          moodDisplayMode: ["all", "gm", "hidden"].includes(formData.settings?.moodDisplayMode)
            ? formData.settings.moodDisplayMode
            : "all",
          preserveBackgroundAspect: Boolean(formData.settings?.preserveBackgroundAspect),
          cinematicBars: ["standard", "small", "medium", "big"].includes(formData.settings?.cinematicBars)
            ? formData.settings.cinematicBars
            : "standard",
          backdropBlurEnabled: Boolean(formData.settings?.backdropBlurEnabled),
        backdropImage: String(formData.settings?.backdropImage || "").trim(),
        backdropImageScale: Number.isFinite(Number(formData.settings?.backdropImageScale))
          ? Math.max(0.1, Math.min(4, Number(formData.settings.backdropImageScale)))
          : 1,
        backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(formData.settings?.backdropImageRepeat)
          ? formData.settings.backdropImageRepeat
          : "repeat",
        backdropDarkness: Number.isFinite(Number(formData.settings?.backdropDarkness))
          ? Math.max(0, Math.min(0.92, Number(formData.settings.backdropDarkness)))
          : 0.2,
        transitionEffect: SCENE_TRANSITION_EFFECTS.some((option) => option.value === formData.settings?.transitionEffect)
          ? formData.settings.transitionEffect
          : "none",
        transitionDuration: Number.isFinite(Number(formData.settings?.transitionDuration))
          ? Math.max(0.3, Math.min(2.8, Number(formData.settings.transitionDuration)))
          : 0.9,
        transitionIntensity: Number.isFinite(Number(formData.settings?.transitionIntensity))
          ? Math.max(0.6, Math.min(1.8, Number(formData.settings.transitionIntensity)))
          : 1,
        sharedLeftSidebarVisible: Boolean(formData.settings?.sharedLeftSidebarVisible),
        sharedRightSidebarVisible: Boolean(formData.settings?.sharedRightSidebarVisible)
      },
      actors: duplicateData(this.editableActors)
    };
  }

  _applyLiveScenePreview(sceneDraft) {
    const activeScene = this.manager?.getActiveScene?.();
    if (!sceneDraft?.id || activeScene?.id !== sceneDraft.id) return;
    this.manager?.overlay?.applySceneDraftPreview?.(sceneDraft);
  }

  _restoreLiveScenePreview() {
    const activeScene = this.manager?.getActiveScene?.();
    if (!this.sceneId || activeScene?.id !== this.sceneId) return;
    void this.manager?.onSettingsChanged?.();
  }

  _onLivePreviewInput() {
    this._syncEditableActorsFromForm();
    this._applyLiveScenePreview(this.editableScene);
  }

  _createActorEntry(avatarId = "", actorId = "") {
    const fallbackMood = TheatreStore.getMoodPresets()[0] || "neutral";
    const fallbackActor = actorId || game.actors?.contents?.[0]?.id || "";
    const avatar = avatarId ? TheatreStore.getAvatarById(avatarId) : null;
    const actor = getActorById(fallbackActor);
    return this._normalizeSceneActorEntry({
      sceneActorId: randomId(),
      name: avatar?.name || actor?.name || tr("Unnamed actor"),
      actorId: fallbackActor,
      position: "center",
      scale: 1,
      initialMood: fallbackMood,
      avatarId: this._getValidAvatarId(fallbackActor, avatarId),
      isVisible: true
    });
  }

  _applyAvatarToActor(index, avatarId) {
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return false;
    const entry = this.editableActors[index];
    if (!entry) return false;

    if (avatar.actorId) {
      entry.actorId = avatar.actorId;
    }
    entry.name = avatar.name || entry.name || getActorById(entry.actorId)?.name || tr("Unnamed actor");
    entry.avatarId = this._getValidAvatarId(entry.actorId || "", avatar.id);
    entry.initialMood = entry.initialMood || TheatreStore.getMoodPresets()[0] || "neutral";
    entry.disableMoods = false;
    entry.imageOverride = "";
      entry.useCircularCrop = Boolean(avatar.useCircularCrop);
      entry.circularCropScale = Math.max(0.7, Math.min(3, Number(avatar.circularCropScale) || 1));
      entry.cropOffsetX = Math.max(-160, Math.min(160, Number(avatar.cropOffsetX) || 0));
      entry.cropOffsetY = Math.max(-160, Math.min(160, Number(avatar.cropOffsetY) || 0));
      entry.frameFitScale = Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale) || 1));
      entry.frameImage = avatar.frameImage || "";
    entry.showBackdrop = avatar.showBackdrop !== false;
    return true;
  }

  _buildAvatarFromSceneActor(sceneActor = {}) {
    const actor = getActorById(sceneActor.actorId);
    return {
      name: String(sceneActor.name || actor?.name || tr("New Avatar")).trim() || tr("New Avatar"),
      actorId: String(sceneActor.actorId || "").trim(),
      defaultImage: String(sceneActor.imageOverride || actor?.img || "").trim(),
      useCircularCrop: Boolean(sceneActor.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(3, Number(sceneActor.circularCropScale ?? 1) || 1)),
      cropOffsetX: Math.max(-160, Math.min(160, Number(sceneActor.cropOffsetX) || 0)),
      cropOffsetY: Math.max(-160, Math.min(160, Number(sceneActor.cropOffsetY) || 0)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(sceneActor.frameFitScale ?? 1) || 1)),
      frameImage: String(sceneActor.frameImage || "").trim(),
      showBackdrop: sceneActor.showBackdrop !== false,
      moodImages: {}
    };
  }

  _clearDragState({ preserveDraggedAvatar = false } = {}) {
    this.dragOverIndex = null;
    this.isDropzoneActive = false;
    if (!preserveDraggedAvatar) {
      clearDraggedAvatarId();
    }
    this.element?.find(".tom-scene-dropzone").removeClass("is-dragover");
    this.element?.find(".tom-scene-actor-row").removeClass("is-dragover");
  }

  _onActorConfigChanged() {
    this._syncEditableActorsFromForm();
    this.render();
  }

  _onRemoveActor(event) {
    event.preventDefault();
    this._syncEditableActorsFromForm();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.editableActors.splice(index, 1);
    this.render();
  }

  _onPickImage(event) {
    event.preventDefault();
    openImagePickerForInput(this.form, event.currentTarget.dataset.target, event.currentTarget.dataset.pickerType || "image");
  }

  _onSidebarAvatarDragStart(event) {
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;
    setAvatarDragData(event, avatarId);
  }

  _onSidebarAvatarDragEnd() {
    clearDraggedAvatarId();
  }

  _captureScrollPosition() {
    const root = this.element?.[0];
    if (!(root instanceof HTMLElement)) return [];
    return [
      ".window-content",
      ".tom-scene-config-layout",
      ".tom-scene-config-layout--inline",
      ".tom-scene-config-main"
    ].map((selector) => {
      const element = root.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      return {
        selector,
        top: element.scrollTop,
        left: element.scrollLeft
      };
    }).filter(Boolean);
  }

  _restoreScrollPosition(positions) {
    if (!Array.isArray(positions) || !positions.length) return;
    const restore = () => {
      const root = this.element?.[0];
      if (!(root instanceof HTMLElement)) return;
      positions.forEach((position) => {
        const element = root.querySelector(position.selector);
        if (!(element instanceof HTMLElement)) return;
        element.scrollTop = position.top;
        element.scrollLeft = position.left;
      });
    };
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
  }

  _renderPreservingScroll() {
    const positions = this._captureScrollPosition();
    const renderResult = this.render();
    if (renderResult && typeof renderResult.then === "function") {
      renderResult.finally(() => this._restoreScrollPosition(positions));
      return;
    }
    this._restoreScrollPosition(positions);
  }

  _onAddAvatarToScene(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this._syncEditableActorsFromForm();
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;

    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return;

    this.editableActors.push(this._createActorEntry(avatar.id, avatar.actorId || ""));
    this._renderPreservingScroll();
  }

  async _onCreateSceneActorAvatar(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this._syncEditableActorsFromForm();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    const entry = this.editableActors[index];
    if (!entry || (entry.avatarId && TheatreStore.getAvatarById(entry.avatarId))) return;

    const avatar = await TheatreStore.upsertAvatar(this._buildAvatarFromSceneActor(entry));
    this._applyAvatarToActor(index, avatar.id);
    this.render();
    game.modules.get(MODULE_ID)?.api?.openAvatarConfig?.(avatar.id);
  }

  _onDropzoneDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this._clearDragState({ preserveDraggedAvatar: true });
    this.isDropzoneActive = true;
    event.currentTarget.classList.add("is-dragover");
    event.originalEvent?.dataTransfer && (event.originalEvent.dataTransfer.dropEffect = "copy");
  }

  _onDropzoneDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("is-dragover");
    this.isDropzoneActive = false;
  }

  async _onDropzoneDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncEditableActorsFromForm();
    const payload = extractAvatarDropData(event);
    this._clearDragState();
    if (!payload?.avatarId) {
      const droppedDocument = await resolveFoundryDocumentDrop(event);
      if (droppedDocument?.actor) {
        const tokenEntry = this._createTokenActorEntry(droppedDocument);
        if (tokenEntry) this.editableActors.push(tokenEntry);
        this._renderPreservingScroll();
        return;
      }
      this._renderPreservingScroll();
      return;
    }

    const avatar = TheatreStore.getAvatarById(payload.avatarId);
    if (!avatar) {
      this._renderPreservingScroll();
      return;
    }

    this.editableActors.push(this._createActorEntry(avatar.id, avatar.actorId || ""));
    this._renderPreservingScroll();
  }

  _onActorRowDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.sceneActorIndex);
    this._clearDragState({ preserveDraggedAvatar: true });
    this.dragOverIndex = index;
    event.currentTarget.classList.add("is-dragover");
    event.originalEvent?.dataTransfer && (event.originalEvent.dataTransfer.dropEffect = "copy");
  }

  _onActorRowDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("is-dragover");
    this.dragOverIndex = null;
  }

  async _onActorRowDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncEditableActorsFromForm();
    const index = Number(event.currentTarget.dataset.sceneActorIndex);
    const payload = extractAvatarDropData(event);
    this._clearDragState();

    if (!Number.isInteger(index)) {
      this._renderPreservingScroll();
      return;
    }

    if (!payload?.avatarId) {
      const droppedDocument = await resolveFoundryDocumentDrop(event);
      if (droppedDocument?.actor) {
        const tokenEntry = this._createTokenActorEntry(droppedDocument);
        if (tokenEntry) this.editableActors[index] = tokenEntry;
        this._renderPreservingScroll();
        return;
      }
      this._renderPreservingScroll();
      return;
    }

    this._applyAvatarToActor(index, payload.avatarId);
    this._renderPreservingScroll();
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const soundPlaylistAssignments = Array.isArray(expanded.soundPlaylistAssignments)
      ? expanded.soundPlaylistAssignments
      : (expanded.soundPlaylistAssignments ? [expanded.soundPlaylistAssignments] : []);
    let actors = this._normalizeSubmittedActors(expanded.actors);

    actors = actors
      .map((sceneActor) => this._normalizeSceneActorEntry(sceneActor))
      .filter((sceneActor) => sceneActor.actorId || sceneActor.imageOverride);

    if (actors.some((sceneActor) => !Number.isFinite(sceneActor.scale) || sceneActor.scale <= 0)) {
      ui.notifications?.error(tr("Scale must be greater than 0."));
      return;
    }

    this.editableActors = duplicateData(actors);
    this.assignedSoundPlaylistIds = soundPlaylistAssignments.map((id) => String(id || "").trim()).filter(Boolean);
    this.editableScene = {
      ...this.editableScene,
      id: expanded.id || this.sceneId || "",
      name: expanded.name || "",
      stageTitle: expanded.stageTitle || "",
      stageSubtitle: expanded.stageSubtitle || "",
      description: String(expanded.description || "").trim(),
      location: String(expanded.location || "").trim(),
      tags: normalizeSceneTags(expanded.tagsInput),
        background: expanded.background || "",
        thumbnail: expanded.thumbnail || "",
        actors: duplicateData(actors),
        settings: {
          uiHidden: Boolean(expanded.settings?.uiHidden),
          allowPlayerMoodChange: Boolean(expanded.settings?.allowPlayerMoodChange),
          moodDisplayMode: ["all", "gm", "hidden"].includes(expanded.settings?.moodDisplayMode)
            ? expanded.settings.moodDisplayMode
            : "all",
          preserveBackgroundAspect: Boolean(expanded.settings?.preserveBackgroundAspect),
          cinematicBars: ["standard", "small", "medium", "big"].includes(expanded.settings?.cinematicBars)
            ? expanded.settings.cinematicBars
            : "standard",
          backdropBlurEnabled: Boolean(expanded.settings?.backdropBlurEnabled),
          backdropImage: String(expanded.settings?.backdropImage || "").trim(),
          backdropImageScale: Number.isFinite(Number(expanded.settings?.backdropImageScale))
            ? Math.max(0.1, Math.min(4, Number(expanded.settings.backdropImageScale)))
            : 1,
          backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(expanded.settings?.backdropImageRepeat)
            ? expanded.settings.backdropImageRepeat
            : "repeat",
          backdropDarkness: Number.isFinite(Number(expanded.settings?.backdropDarkness))
            ? Math.max(0, Math.min(0.92, Number(expanded.settings.backdropDarkness)))
            : 0.2,
          transitionEffect: SCENE_TRANSITION_EFFECTS.some((option) => option.value === expanded.settings?.transitionEffect)
            ? expanded.settings.transitionEffect
            : "none",
          transitionDuration: Number.isFinite(Number(expanded.settings?.transitionDuration))
            ? Math.max(0.3, Math.min(2.8, Number(expanded.settings.transitionDuration)))
            : 0.9,
          transitionIntensity: Number.isFinite(Number(expanded.settings?.transitionIntensity))
            ? Math.max(0.6, Math.min(1.8, Number(expanded.settings.transitionIntensity)))
            : 1,
          sharedLeftSidebarVisible: Boolean(expanded.settings?.sharedLeftSidebarVisible),
          sharedRightSidebarVisible: Boolean(expanded.settings?.sharedRightSidebarVisible)
        }
    };

    await TheatreStore.upsertScene({
      id: expanded.id || this.sceneId,
      name: expanded.name,
      stageTitle: expanded.stageTitle,
      stageSubtitle: expanded.stageSubtitle,
      description: String(expanded.description || "").trim(),
      location: String(expanded.location || "").trim(),
      tags: normalizeSceneTags(expanded.tagsInput),
      background: expanded.background,
      thumbnail: expanded.thumbnail || "",
      actors,
      settings: {
        uiHidden: Boolean(expanded.settings?.uiHidden),
        allowPlayerMoodChange: Boolean(expanded.settings?.allowPlayerMoodChange),
          moodDisplayMode: ["all", "gm", "hidden"].includes(expanded.settings?.moodDisplayMode)
            ? expanded.settings.moodDisplayMode
            : "all",
          preserveBackgroundAspect: Boolean(expanded.settings?.preserveBackgroundAspect),
          cinematicBars: ["standard", "small", "medium", "big"].includes(expanded.settings?.cinematicBars)
            ? expanded.settings.cinematicBars
            : "standard",
          backdropBlurEnabled: Boolean(expanded.settings?.backdropBlurEnabled),
          backdropImage: String(expanded.settings?.backdropImage || "").trim(),
          backdropImageScale: Number.isFinite(Number(expanded.settings?.backdropImageScale))
            ? Math.max(0.1, Math.min(4, Number(expanded.settings.backdropImageScale)))
            : 1,
          backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(expanded.settings?.backdropImageRepeat)
            ? expanded.settings.backdropImageRepeat
            : "repeat",
          backdropDarkness: Number.isFinite(Number(expanded.settings?.backdropDarkness))
            ? Math.max(0, Math.min(0.92, Number(expanded.settings.backdropDarkness)))
            : 0.2,
          transitionEffect: SCENE_TRANSITION_EFFECTS.some((option) => option.value === expanded.settings?.transitionEffect)
            ? expanded.settings.transitionEffect
            : "none",
          transitionDuration: Number.isFinite(Number(expanded.settings?.transitionDuration))
            ? Math.max(0.3, Math.min(2.8, Number(expanded.settings.transitionDuration)))
            : 0.9,
          transitionIntensity: Number.isFinite(Number(expanded.settings?.transitionIntensity))
            ? Math.max(0.6, Math.min(1.8, Number(expanded.settings.transitionIntensity)))
            : 1,
          sharedLeftSidebarVisible: Boolean(expanded.settings?.sharedLeftSidebarVisible),
          sharedRightSidebarVisible: Boolean(expanded.settings?.sharedRightSidebarVisible)
        }
    });
    await TheatreStore.setSceneSoundPlaylistAssignments(this.editableScene.id, this.assignedSoundPlaylistIds);

    ui.notifications?.info(tr("Footlights scene saved."));
  }

  async close(options) {
    this._restoreLiveScenePreview();
    return super.close(options);
  }
}
