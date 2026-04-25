import { MODULE_ID, SCENE_TRANSITION_EFFECTS } from "../constants.js";
import {
  applyThemeInlineStyleToHost,
  clearDraggedAvatarId,
  buildThemeInlineStyle,
  duplicateData,
  extractAvatarDropData,
  resolveFoundryDocumentDrop,
  getActorById,
  isVideoMediaPath,
  normalizeSceneTags,
  openImagePickerForInput,
  randomId,
  setAvatarDragData,
  setTheatreSceneDragData
} from "../helpers.js";
import { getLanguageOptions, setActiveLanguage, translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { TheatreAdventurePlannerConfigApplication } from "./theatre-adventure-planner-config.js";
import { TheatreMindmapApplication } from "./theatre-mindmap.js";
import { TheatreWorldMapConfigApplication } from "./theatre-world-map-config.js";

export class TheatreSceneLibraryApplication extends FormApplication {
  constructor(manager, options = {}) {
    super({}, options);
    this.manager = manager;
    this.activeTab = options.initialTab ?? "scenes";
    this.draftMoods = null;
    this.draftTheme = null;
    this.activeThemeItemKey = "navigation.surface";
    this._collapsedThemeSections = new Set(["presets", "typography", "navigation", "content", "theatre", "planner", "stageGoblin"]);
    this._themeInspectorResizeObserver = null;
    this._onThemeInspectorWindowResize = null;
    this._onThemeInspectorScroll = null;
    this._themeInspectorScrollTargets = [];
    this.sceneEditor = null;
    this.sceneEditorActors = [];
    this.sceneEditorSoundPlaylistIds = [];
    this.sceneEditorDragOverIndex = null;
    this.sceneEditorDropzoneActive = false;
    this._collapsedSceneEditorSections = new Set(["setup", "background", "transition", "actors"]);
    this.avatarEditor = null;
    this.soundPlaylistEditor = null;
    this.mapConfigEditor = null;
    this.inlinePlannerId = null;
    this.inlinePlannerApp = null;
    this.sceneLibraryView = "list";
    this.librarySearchQueries = {
      scenes: "",
      avatars: "",
      sounds: "",
      maps: ""
    };
    this._windowResizeClassTimeout = null;
    this._fontsPreloaded = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-scene-library`,
      title: tr("Footlights Library"),
      classes: [MODULE_ID, "theatre-scene-library"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-scene-library.hbs`,
      width: 1180,
      height: 820,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  async getData() {
    if (!this._fontsPreloaded) {
      try {
        await globalThis.FontConfig?._loadFonts?.();
      } catch (_error) {
        // keep selector functional with available fallback sources
      }
      this._fontsPreloaded = true;
    }

    const runtime = TheatreStore.getRuntimeState();
    const activeSceneId = this.manager.getActiveScene()?.id ?? runtime.activeSceneId ?? null;
    const moodPresets = TheatreStore.getMoodPresets();
    const moods = this.draftMoods ?? moodPresets;
    const themeState = this.draftTheme ?? TheatreStore.getThemeState();
    const languageOptions = await getLanguageOptions(true);
    const selectedLanguage = TheatreStore.getLanguage();
    const moodSlots = Array.from({ length: 8 }, (_, index) => ({
      index,
      label: tr("Mood {index}", { index: index + 1 }),
      value: moods[index] ?? ""
    }));
    const tabs = [
      { id: "scenes", label: tr("Scenes"), icon: "fas fa-photo-film", isActive: this.activeTab === "scenes" },
      { id: "avatars", label: tr("Avatars"), icon: "fas fa-user-circle", isActive: this.activeTab === "avatars" },
      { id: "sounds", label: tr("Sounds"), icon: "fas fa-music", isActive: this.activeTab === "sounds" },
      { id: "maps", label: tr("Maps"), icon: "fas fa-map-location-dot", isActive: this.activeTab === "maps" },
      { id: "mindmap", label: tr("Planner"), icon: "fas fa-share-nodes", isActive: this.activeTab === "mindmap" },
      { id: "settings", label: tr("Settings"), icon: "fas fa-sliders", isActive: this.activeTab === "settings" }
    ];
    const primaryTabs = tabs.filter((tab) => tab.id !== "settings");
    const settingsTab = tabs.find((tab) => tab.id === "settings") ?? null;
    const foundryPlaylists = (game.playlists?.contents ?? []).map((playlist) => ({
      value: playlist.id,
      label: playlist.name,
      sounds: (playlist.sounds?.contents ?? []).map((sound) => ({
        value: sound.id,
        label: sound.name || sound.path || tr("Playlist sound")
      }))
    }));
    const sceneSearchQuery = this._getLibrarySearchQuery("scenes");
    const avatarSearchQuery = this._getLibrarySearchQuery("avatars");
    const soundSearchQuery = this._getLibrarySearchQuery("sounds");
    const mapSearchQuery = this._getLibrarySearchQuery("maps");

    const soundPlaylists = TheatreStore.getSoundPlaylists().map((playlist) => ({
      ...playlist,
      trackCount: Array.isArray(playlist.tracks) ? playlist.tracks.length : 0,
      soundboardCount: Array.isArray(playlist.soundboard) ? playlist.soundboard.length : 0,
      sceneCount: Array.isArray(playlist.sceneIds) ? playlist.sceneIds.length : 0
    })).filter((playlist) => this._matchesSoundPlaylistSearch(playlist, soundSearchQuery));
    const avatars = TheatreStore.getAvatars().map((avatar) => {
      const actor = getActorById(avatar.actorId);
      return {
        ...avatar,
        actorName: actor?.name || tr("No actor"),
        moodCount: Object.keys(avatar.moodImages ?? {}).length,
        thumbnail: avatar.defaultImage || actor?.img || ""
      };
    }).filter((avatar) => this._matchesAvatarSearch(avatar, avatarSearchQuery));
    const activeWorldMapId = TheatreStore.getActiveWorldMap()?.id ?? null;
    const worldMaps = TheatreStore.getWorldMaps().map((worldMap) => ({
      ...worldMap,
      pinCount: Array.isArray(worldMap.pins) ? worldMap.pins.length : 0,
      hasTiles: Boolean(worldMap.tileUrlTemplate),
      isActive: activeWorldMapId === worldMap.id
    })).filter((worldMap) => this._matchesMapSearch(worldMap, mapSearchQuery));
    const avatarLibrary = TheatreStore.getAvatarLibraryState();
    const sceneMoodDisplayModes = [
      { value: "all", label: tr("All") },
      { value: "gm", label: tr("GM only") },
      { value: "hidden", label: tr("Hidden") }
    ];
    const sceneTransitionOptions = SCENE_TRANSITION_EFFECTS.map(({ value, label }) => ({ value, label }));
    const sceneCinematicOptions = [
      { value: "standard", label: tr("Standard") },
      { value: "small", label: tr("Small") },
      { value: "medium", label: tr("Medium") },
      { value: "big", label: tr("Big") }
    ];
    const themeImageRepeatOptions = [
      { value: "no-repeat", label: tr("No tiling") },
      { value: "repeat", label: tr("Repeat") },
      { value: "repeat-x", label: tr("Repeat X") },
      { value: "repeat-y", label: tr("Repeat Y") }
    ];
    const actorOptions = (game.actors?.contents ?? []).map((actor) => ({
      value: actor.id,
      label: actor.name
    }));
    const themePresetSection = this._buildThemePresetSection(themeState);
    const themeSections = this._buildThemeSections(themeState);
    const selectedThemeItem = this._getSelectedThemeItem(themeSections);
    const inlinePlannerHtml = this.activeTab === "mindmap" && this.inlinePlannerId
      ? await this._getInlinePlannerHtml()
      : "";
    const mapEditorHtml = this.activeTab === "maps" && this.mapConfigEditor
      ? await this._getInlineMapEditorHtml()
      : "";
    const headerContext = this._getHeaderContext();
    const navigationSurfaceMediaStyle = this._buildNavigationSurfaceMediaStyle(themeState);

    return {
      themeInlineStyle: this._buildThemeInlineStyle(themeState),
      navigationSurfaceMediaStyle,
      themePresetSection,
      themeSections,
      selectedThemeItem,
      headerContext,
      languageOptions,
      selectedLanguage,
      tabs,
      primaryTabs,
      settingsTab,
      activeTab: this.activeTab,
      isScenesTab: this.activeTab === "scenes",
      isAvatarsTab: this.activeTab === "avatars",
      isSoundsTab: this.activeTab === "sounds",
      isMapsTab: this.activeTab === "maps",
      isMapEditorActive: this.activeTab === "maps" && Boolean(this.mapConfigEditor),
      mapEditorHtml,
      isMindmapTab: this.activeTab === "mindmap",
      isSettingsTab: this.activeTab === "settings",
      showLibrarySearch: ["scenes", "avatars", "sounds", "maps"].includes(this.activeTab)
        && !this.sceneEditor
        && !this.avatarEditor
        && !this.soundPlaylistEditor
        && !this.mapConfigEditor,
      librarySearchValue: this._getLibrarySearchQuery(this.activeTab),
      librarySearchPlaceholder: this._getLibrarySearchPlaceholder(),
      moods: moodSlots,
      avatarCount: avatars.length,
      avatars,
      worldMaps,
      avatarLibrary,
      soundPlaylists,
      foundryPlaylists,
      planners: TheatreStore.getAdventurePlanners().map((planner) => ({
        ...planner,
        nodeCount: planner.nodes.length,
        edgeCount: planner.edges.length,
        thumbnail: planner.nodes.find((node) => node.thumbnail)?.thumbnail || ""
      })),
      isInlinePlannerActive: this.activeTab === "mindmap" && Boolean(this.inlinePlannerId),
      inlinePlannerHtml,
      inlinePlannerName: this.inlinePlannerId ? (TheatreStore.getAdventurePlannerById(this.inlinePlannerId)?.name || tr("Adventure Planner")) : "",
      scenes: TheatreStore.getScenes().map((scene) => ({
        ...scene,
        actorCount: scene.actors.length,
        isActive: activeSceneId === scene.id,
        description: String(scene.description || "").trim(),
        location: String(scene.location || "").trim(),
        tags: normalizeSceneTags(scene.tags),
        thumbnail: scene.thumbnail || (!isVideoMediaPath(scene.background) ? (scene.background || this._getSceneFallbackThumbnail(scene)) : ""),
        isVideoThumbnailFallback: !scene.thumbnail && isVideoMediaPath(scene.background)
      })).filter((scene) => this._matchesSceneSearch(scene, sceneSearchQuery)),
      sceneLibraryView: this.sceneLibraryView,
      isSceneLibraryListView: this.sceneLibraryView === "list",
      isSceneLibraryCardView: this.sceneLibraryView === "cards",
      isSceneEditorActive: this.activeTab === "scenes" && Boolean(this.sceneEditor),
      sceneEditor: this.sceneEditor,
      sceneEditorTagsValue: Array.isArray(this.sceneEditor?.tags) ? this.sceneEditor.tags.join(", ") : "",
      sceneEditorActors: this._getSceneEditorActorRows(),
      sceneEditorAvatarSidebarItems: this._getSceneEditorSidebarAvatars(),
      sceneEditorHasAvatars: TheatreStore.getAvatars().length > 0,
      sceneEditorAvatarCount: TheatreStore.getAvatars().length,
      sceneEditorMoodPresets: moodPresets,
      themeImageRepeatOptions,
      sceneEditorMoodDisplayModes: sceneMoodDisplayModes,
      sceneEditorCinematicOptions: sceneCinematicOptions,
      sceneEditorTransitionOptions: sceneTransitionOptions,
      sceneEditorSelectedTransitionOption: SCENE_TRANSITION_EFFECTS.find((option) => option.value === this.sceneEditor?.settings?.transitionEffect)
        ?? SCENE_TRANSITION_EFFECTS[0],
      sceneEditorSectionSetupCollapsed: this._collapsedSceneEditorSections.has("setup"),
      sceneEditorSectionBackgroundCollapsed: this._collapsedSceneEditorSections.has("background"),
      sceneEditorSectionTransitionCollapsed: this._collapsedSceneEditorSections.has("transition"),
      sceneEditorSectionActorsCollapsed: this._collapsedSceneEditorSections.has("actors"),
      sceneEditorSoundPlaylists: this._getSceneEditorSoundPlaylistRows(),
      sceneEditorDropzoneActive: this.sceneEditorDropzoneActive,
      isAvatarEditorActive: this.activeTab === "avatars" && Boolean(this.avatarEditor),
      avatarEditor: this.avatarEditor,
      avatarEditorActorOptions: actorOptions,
      avatarEditorMoodPresets: moodPresets,
      isSoundPlaylistEditorActive: this.activeTab === "sounds" && Boolean(this.soundPlaylistEditor),
      soundPlaylistEditor: this._getSoundPlaylistEditorData(),
      soundPlaylistEditorSceneRows: this._getSoundPlaylistEditorSceneRows()
    };
  }

  _getLibrarySearchQuery(tabId = this.activeTab) {
    const key = String(tabId || "").trim();
    return String(this.librarySearchQueries?.[key] ?? "").trim();
  }

  _getLibrarySearchPlaceholder() {
    switch (this.activeTab) {
      case "avatars":
        return tr("Search avatars");
      case "sounds":
        return tr("Search playlists");
      case "maps":
        return tr("Search maps");
      case "scenes":
      default:
        return tr("Search scenes");
    }
  }

  _normalizeSearchText(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  _matchesSceneSearch(scene, query) {
    const needle = this._normalizeSearchText(query);
    if (!needle) return true;
    const haystack = [
      scene.name,
      scene.stageTitle,
      scene.stageSubtitle,
      scene.description,
      scene.location,
      ...(Array.isArray(scene.tags) ? scene.tags : [])
    ]
      .map((part) => this._normalizeSearchText(part))
      .filter(Boolean)
      .join(" ");
    return haystack.includes(needle);
  }

  _matchesAvatarSearch(avatar, query) {
    const needle = this._normalizeSearchText(query);
    if (!needle) return true;
    const haystack = [
      avatar.name,
      avatar.actorName
    ]
      .map((part) => this._normalizeSearchText(part))
      .filter(Boolean)
      .join(" ");
    return haystack.includes(needle);
  }

  _matchesSoundPlaylistSearch(playlist, query) {
    const needle = this._normalizeSearchText(query);
    if (!needle) return true;
    const haystack = [
      playlist.name,
      ...(Array.isArray(playlist.tracks) ? playlist.tracks.map((entry) => entry?.label || "") : []),
      ...(Array.isArray(playlist.soundboard) ? playlist.soundboard.map((entry) => entry?.label || "") : [])
    ]
      .map((part) => this._normalizeSearchText(part))
      .filter(Boolean)
      .join(" ");
    return haystack.includes(needle);
  }

  _matchesMapSearch(worldMap, query) {
    const needle = this._normalizeSearchText(query);
    if (!needle) return true;
    const haystack = [
      worldMap.name,
      worldMap.description,
      worldMap.tileRootPath
    ]
      .map((part) => this._normalizeSearchText(part))
      .filter(Boolean)
      .join(" ");
    return haystack.includes(needle);
  }

  _getHeaderContext() {
    if (this.activeTab === "scenes" && this.sceneEditor) {
      return {
        title: this.sceneEditor.name || tr("Edit scene"),
        description: tr("Edit stage, titles, permissions, and actors directly inside the library."),
        showCancelSceneEditor: true,
        showSaveSceneEditor: true
      };
    }

    if (this.activeTab === "sounds" && this.soundPlaylistEditor) {
      return {
        title: this.soundPlaylistEditor.name || tr("Edit sound playlist"),
        description: tr("Manage tracks, soundboard, and scene assignments directly in the library."),
        showCancelSoundPlaylistEditor: true,
        showSaveSoundPlaylistEditor: true
      };
    }

    if (this.activeTab === "avatars" && this.avatarEditor) {
      return {
        title: this.avatarEditor.name || tr("Edit avatar"),
        description: tr("Avatar and mood setup"),
        showCancelAvatarEditor: true,
        showSaveAvatarEditor: true
      };
    }

    if (this.activeTab === "maps" && this.mapConfigEditor) {
      const worldMap = this.mapConfigEditor._getMapDraft?.() ?? null;
      return {
        title: worldMap?.name || tr("Edit map"),
        description: tr("Import large world maps, generate tiles, and configure categories directly inside the library."),
        showCancelMapEditor: true,
        showSaveMapEditor: true
      };
    }

    if (this.activeTab === "mindmap" && this.inlinePlannerId) {
      return {
        title: this.inlinePlannerId ? (TheatreStore.getAdventurePlannerById(this.inlinePlannerId)?.name || tr("Adventure Planner")) : tr("Adventure Planner"),
        description: tr("Use the Adventure Planner directly inside the Footlights Library."),
        showCloseInlineMindmap: true
      };
    }

    if (this.activeTab === "settings") {
      return {
        title: tr("Settings"),
        description: tr("Global mood presets and theme controls for navigation, content, Adventure Planner, and StageGoblin."),
        showSaveMoods: true
      };
    }

    if (this.activeTab === "avatars") {
      return {
        title: tr("Avatar Library"),
        description: tr("Manage reusable avatars across multiple scenes."),
        showCreateAvatar: true
      };
    }

    if (this.activeTab === "sounds") {
      return {
        title: tr("Sound Library"),
        description: tr("Manage playlists, music, and soundboards for Footlights scenes."),
        showCreateSoundPlaylist: true
      };
    }

    if (this.activeTab === "maps") {
      return {
        title: tr("Map Library"),
        description: tr("Import large world maps, generate tiles, and place pins."),
        showCreateMap: true
      };
    }

    if (this.activeTab === "mindmap") {
      return {
        title: tr("Adventure Planner"),
        description: tr("Boards for adventure planning, relationships, and Foundry documents."),
        showCreatePlanner: true
      };
    }

    return {
      title: tr("Scene Library"),
      description: tr("Manage cinematic scenes with backgrounds and cast."),
      showCreateScene: true
    };
  }

  _getDefaultSoundPlaylistData() {
    return {
      id: "",
      name: "",
      sceneIds: [],
      tracks: [],
      soundboard: []
    };
  }

  _normalizeSoundEntry(entry = {}) {
    return {
      id: String(entry.id || randomId()),
      label: String(entry.label || "").trim(),
      sourceType: entry.sourceType === "playlistSound" ? "playlistSound" : "file",
      path: String(entry.path || "").trim(),
      playlistId: String(entry.playlistId || "").trim(),
      soundId: String(entry.soundId || "").trim(),
      icon: String(entry.icon || "").trim()
    };
  }

  _normalizeSoundPlaylistData(playlist = {}) {
    return {
      id: String(playlist.id || ""),
      name: String(playlist.name || "").trim(),
      sceneIds: Array.isArray(playlist.sceneIds) ? playlist.sceneIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
      tracks: Array.isArray(playlist.tracks) ? playlist.tracks.map((entry) => this._normalizeSoundEntry(entry)) : [],
      soundboard: Array.isArray(playlist.soundboard) ? playlist.soundboard.map((entry) => this._normalizeSoundEntry(entry)).slice(0, 10) : []
    };
  }

  _openSoundPlaylistEditor(playlistId = null) {
    const source = playlistId ? TheatreStore.getSoundPlaylistById(playlistId) : null;
    this.soundPlaylistEditor = this._normalizeSoundPlaylistData(source ?? this._getDefaultSoundPlaylistData());
    if (!this.soundPlaylistEditor.id) {
      this.soundPlaylistEditor.id = randomId();
    }
    this.activeTab = "sounds";
    this._renderLibrary();
  }

  _closeSoundPlaylistEditor() {
    this.soundPlaylistEditor = null;
  }

  _getSceneEditorSoundPlaylistRows() {
    if (!this.sceneEditor) return [];
    const selectedIds = new Set(this.sceneEditorSoundPlaylistIds);
    return TheatreStore.getSoundPlaylists().map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      trackCount: Array.isArray(playlist.tracks) ? playlist.tracks.length : 0,
      soundboardCount: Array.isArray(playlist.soundboard) ? playlist.soundboard.length : 0,
      isAssigned: selectedIds.has(playlist.id)
    }));
  }

  _getSoundPlaylistEditorSceneRows() {
    if (!this.soundPlaylistEditor) return [];
    const selectedIds = new Set(this.soundPlaylistEditor.sceneIds ?? []);
    return TheatreStore.getScenes().map((scene) => ({
      id: scene.id,
      name: scene.name,
      stageTitle: scene.stageTitle || "",
      isAssigned: selectedIds.has(scene.id)
    }));
  }

  _getSoundPlaylistEditorData() {
    if (!this.soundPlaylistEditor) return null;
    const foundryPlaylistMap = new Map((game.playlists?.contents ?? []).map((playlist) => [playlist.id, playlist]));
    const playlistOptions = (game.playlists?.contents ?? []).map((playlist) => ({
      value: playlist.id,
      label: playlist.name
    }));
    return {
      ...this.soundPlaylistEditor,
      tracks: (this.soundPlaylistEditor.tracks ?? []).map((entry, index) => ({
        ...entry,
        index,
        isFile: entry.sourceType !== "playlistSound",
        isPlaylistSound: entry.sourceType === "playlistSound",
        playlistOptions,
        soundOptions: (foundryPlaylistMap.get(entry.playlistId)?.sounds?.contents ?? []).map((sound) => ({
          value: sound.id,
          label: sound.name || sound.path || tr("Playlist sound")
        }))
      })),
      soundboard: (this.soundPlaylistEditor.soundboard ?? []).map((entry, index) => ({
        ...entry,
        index,
        isFile: entry.sourceType !== "playlistSound",
        isPlaylistSound: entry.sourceType === "playlistSound",
        playlistOptions,
        soundOptions: (foundryPlaylistMap.get(entry.playlistId)?.sounds?.contents ?? []).map((sound) => ({
          value: sound.id,
          label: sound.name || sound.path || tr("Playlist sound")
        }))
      }))
    };
  }

  _buildNavigationSurfaceMediaStyle(theme) {
    const imagePath = String(theme?.navigation?.surfaceImage ?? "").trim();
    if (!imagePath) return "display:none;";

    const alphaValue = Number(theme?.navigation?.surfaceImageAlpha);
    const alpha = Number.isFinite(alphaValue)
      ? Math.max(0, Math.min(1, alphaValue))
      : 0;
    if (alpha <= 0) return "display:none;";
    const scaleValue = Number(theme?.navigation?.surfaceImageScale);
    const scale = Number.isFinite(scaleValue) ? Math.max(0.1, Math.min(4, scaleValue)) : 1;
    const repeat = String(theme?.navigation?.surfaceImageRepeat ?? "repeat").trim() || "repeat";
    const escapedPath = imagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      "display:block",
      `background-image:url(\"${escapedPath}\")`,
      "background-position:center center",
      `background-repeat:${repeat}`,
      `background-size:${(scale * 100).toFixed(0)}% auto`,
      `opacity:${alpha}`
    ].join(";");
  }

  _buildSurfaceImageStyle(pathValue, alphaValue, scaleValue, repeatValue) {
    const imagePath = String(pathValue ?? "").trim();
    if (!imagePath) return "";
    const alpha = Number.isFinite(Number(alphaValue)) ? Math.max(0, Math.min(1, Number(alphaValue))) : 1;
    const scale = Number.isFinite(Number(scaleValue)) ? Math.max(0.1, Math.min(4, Number(scaleValue))) : 1;
    const repeat = String(repeatValue ?? "repeat").trim() || "repeat";
    const escapedPath = imagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      `background-image:url(\"${escapedPath}\")`,
      "background-position:center center",
      `background-repeat:${repeat}`,
      `background-size:${(scale * 100).toFixed(0)}% auto`,
      `opacity:${alpha}`,
      `--tom-theme-preview-image-alpha:${alpha}`
    ].join(";");
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='set-scene-library-view']").on("click", this._onSetSceneLibraryView.bind(this));
    html.find("[data-action='library-search']").on("input", this._onLibrarySearchInput.bind(this));
    this._bindSharedTabListeners(html);
    this._bindSceneLibraryListeners(html);
    this._bindAvatarLibraryListeners(html);
    this._bindSoundLibraryListeners(html);
    this._bindMapLibraryListeners(html);
    this._bindPlannerLibraryListeners(html);
    this._bindSettingsListeners(html);
    this._bindThemeLayoutObservers();
    this._applyThemePreviewFromForm();
    this._syncAvatarEditorPreview();
    this._applyLibrarySearchFilter(html);
    this._activateInlinePlannerListeners(html);
    this._activateInlineMapEditorListeners(html);
  }

  _onSetSceneLibraryView(event) {
    event.preventDefault();
    const nextView = String(event.currentTarget?.dataset?.view || "").trim();
    if (!["list", "cards"].includes(nextView)) return;
    this.sceneLibraryView = nextView;
    this._renderLibrary();
  }

  _onLibrarySearchInput(event) {
    const input = event.currentTarget;
    if (!["scenes", "avatars", "sounds", "maps"].includes(this.activeTab)) return;
    this.librarySearchQueries[this.activeTab] = String(input?.value ?? "");
    this._applyLibrarySearchFilter();
  }

  _applyLibrarySearchFilter(root = null) {
    const host = root?.jquery ? root[0] : (root?.nodeType ? root : this.form);
    if (!host) return;
    const query = this._normalizeSearchText(this._getLibrarySearchQuery(this.activeTab));
    const items = host.querySelectorAll(`[data-library-search-tab="${this.activeTab}"]`);
    items.forEach((item) => {
      const haystack = this._normalizeSearchText(item.dataset.librarySearchText || "");
      const matches = !query || haystack.includes(query);
      item.hidden = !matches;
      item.classList.toggle("is-search-hidden", !matches);
      item.setAttribute("aria-hidden", matches ? "false" : "true");
    });
  }

  setPosition(...args) {
    if (!this.element?.length) {
      return super.setPosition(...args);
    }
    const result = super.setPosition(...args);
    if (this.activeTab === "mindmap" && this.inlinePlannerApp) {
      this.inlinePlannerApp._setResizeVisualState?.(true);
      this._scheduleInlinePlannerResizeVisualStateClear();
    }
    return result;
  }

  _scheduleInlinePlannerResizeVisualStateClear() {
    clearTimeout(this._windowResizeClassTimeout);
    this._windowResizeClassTimeout = window.setTimeout(() => {
      this._windowResizeClassTimeout = null;
      this.inlinePlannerApp?._setResizeVisualState?.(false);
    }, 160);
  }

  _bindSharedTabListeners(html) {
    html.find("[data-action='switch-tab']").on("click", this._onSwitchTab.bind(this));
  }

  _bindSceneLibraryListeners(html) {
    html.find("[data-action='create-scene']").on("click", this._onCreateScene.bind(this));
    html.find("[data-action='edit-scene']").on("click", this._onEditScene.bind(this));
    html.find("[data-action='activate-scene']").on("click", this._onActivateScene.bind(this));
    html.find("[data-action='deactivate-scene']").on("click", this._onDeactivateScene.bind(this));
    html.find("[data-action='duplicate-scene']").on("click", this._onDuplicateScene.bind(this));
    html.find("[data-action='delete-scene']").on("click", this._onDeleteScene.bind(this));
    html.find("[data-action='cancel-scene-editor']").on("click", this._onCancelSceneEditor.bind(this));
    html.find("[data-action='save-scene-editor']").on("click", this._onSaveSceneEditor.bind(this));
    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
    html.find("[data-action='remove-scene-actor']").on("click", this._onRemoveSceneActor.bind(this));
    html.find("[data-action='create-scene-editor-actor-avatar']").on("click", this._onCreateSceneEditorActorAvatar.bind(this));
    html.find("[data-action='add-avatar-to-scene-editor']").on("click", this._onAddAvatarToSceneEditor.bind(this));
    html.find("select[name$='.initialMood']").on("change", this._onSceneActorConfigChanged.bind(this));
    html.find("[data-scene-editor-avatar='true']").on("dragstart", this._onSceneEditorAvatarDragStart.bind(this));
    html.find("[data-scene-editor-avatar='true']").on("dragend", this._onSceneEditorAvatarDragEnd.bind(this));
    html.find("[data-dropzone='scene-editor-actors']").on("dragenter", this._onSceneEditorDropzoneDragOver.bind(this));
    html.find("[data-dropzone='scene-editor-actors']").on("dragover", this._onSceneEditorDropzoneDragOver.bind(this));
    html.find("[data-dropzone='scene-editor-actors']").on("dragleave", this._onSceneEditorDropzoneDragLeave.bind(this));
    html.find("[data-dropzone='scene-editor-actors']").on("drop", this._onSceneEditorDropzoneDrop.bind(this));
    html.find("[data-scene-editor-actor-index]").on("dragenter", this._onSceneEditorActorRowDragOver.bind(this));
    html.find("[data-scene-editor-actor-index]").on("dragover", this._onSceneEditorActorRowDragOver.bind(this));
    html.find("[data-scene-editor-actor-index]").on("dragleave", this._onSceneEditorActorRowDragLeave.bind(this));
    html.find("[data-scene-editor-actor-index]").on("drop", this._onSceneEditorActorRowDrop.bind(this));
    html.find("[name='sceneEditor.background'], [name='sceneEditor.settings.preserveBackgroundAspect'], [name='sceneEditor.settings.cinematicBars'], [name='sceneEditor.settings.backdropBlurEnabled'], [name='sceneEditor.settings.backdropImage'], [name='sceneEditor.settings.backdropImageScale'], [name='sceneEditor.settings.backdropImageRepeat'], [name='sceneEditor.settings.backdropDarkness']").on("input change", this._onSceneEditorLivePreviewInput.bind(this));
    html.find("[data-action='toggle-scene-editor-section']").on("click", this._onToggleSceneEditorSection.bind(this));
  }

  _bindAvatarLibraryListeners(html) {
    html.find("[data-action='create-avatar']").on("click", this._onCreateAvatar.bind(this));
    html.find("[data-action='edit-avatar']").on("click", this._onEditAvatar.bind(this));
    html.find("[data-action='delete-avatar']").on("click", this._onDeleteAvatar.bind(this));
    html.find("[data-action='cancel-avatar-editor']").on("click", this._onCancelAvatarEditor.bind(this));
    html.find("[data-action='save-avatar-editor']").on("click", this._onSaveAvatarEditor.bind(this));
    html.find("[data-drag-avatar='true']").on("dragstart", this._onDragAvatarStart.bind(this));
    html.find("[data-drag-avatar='true']").on("dragend", this._onDragAvatarEnd.bind(this));
    html.find("[data-drag-theatre-scene='true']").on("dragstart", this._onDragSceneStart.bind(this));
    html.find("[name^='avatarLibrary.']").on("change", this._onAvatarLibraryDefaultsChanged.bind(this));
    html.find("[name='avatarEditor.defaultImage'], [name='avatarEditor.frameImage'], [name='avatarEditor.useCircularCrop'], [name='avatarEditor.showBackdrop'], [name='avatarEditor.circularCropScale'], [name='avatarEditor.frameFitScale']").on("input change", this._onAvatarEditorPreviewInput.bind(this));
  }

  _bindSoundLibraryListeners(html) {
    html.find("[data-action='create-sound-playlist']").on("click", this._onCreateSoundPlaylist.bind(this));
    html.find("[data-action='edit-sound-playlist']").on("click", this._onEditSoundPlaylist.bind(this));
    html.find("[data-action='delete-sound-playlist']").on("click", this._onDeleteSoundPlaylist.bind(this));
    html.find("[data-action='cancel-sound-playlist-editor']").on("click", this._onCancelSoundPlaylistEditor.bind(this));
    html.find("[data-action='save-sound-playlist-editor']").on("click", this._onSaveSoundPlaylistEditor.bind(this));
    html.find("[data-action='add-sound-track']").on("click", this._onAddSoundTrack.bind(this));
    html.find("[data-action='remove-sound-track']").on("click", this._onRemoveSoundTrack.bind(this));
    html.find("[data-action='add-soundboard-item']").on("click", this._onAddSoundboardItem.bind(this));
    html.find("[data-action='remove-soundboard-item']").on("click", this._onRemoveSoundboardItem.bind(this));
    html.find("[name^='soundPlaylistEditor.']").on("change", this._onSoundPlaylistEditorFieldChanged.bind(this));
    html.find("[data-action='pick-audio']").on("click", this._onPickImage.bind(this));
  }

  _bindPlannerLibraryListeners(html) {
    html.find("[data-action='open-mindmap']").on("click", this._onOpenMindmap.bind(this));
    html.find("[data-action='close-inline-mindmap']").on("click", this._onCloseInlineMindmap.bind(this));
    html.find("[data-action='create-planner']").on("click", this._onCreatePlanner.bind(this));
    html.find("[data-action='edit-planner']").on("click", this._onEditPlanner.bind(this));
    html.find("[data-action='duplicate-planner']").on("click", this._onDuplicatePlanner.bind(this));
    html.find("[data-action='delete-planner']").on("click", this._onDeletePlanner.bind(this));
  }

  _bindMapLibraryListeners(html) {
    html.find("[data-action='create-map']").on("click", this._onCreateMap.bind(this));
    html.find("[data-action='edit-map']").on("click", this._onEditMap.bind(this));
    html.find("[data-action='cancel-map-editor']").on("click", this._onCancelMapEditor.bind(this));
    html.find("[data-action='save-map-editor']").on("click", this._onSaveMapEditor.bind(this));
    html.find("[data-action='open-world-map']").on("click", this._onOpenWorldMap.bind(this));
    html.find("[data-action='open-world-map-stage']").on("click", this._onOpenWorldMapStage.bind(this));
    html.find("[data-action='duplicate-map']").on("click", this._onDuplicateMap.bind(this));
    html.find("[data-action='delete-map']").on("click", this._onDeleteMap.bind(this));
    html.find("[data-action='create-map-macro']").on("click", this._onCreateMapMacro.bind(this));
    html.find("[data-action='create-map-stage-macro']").on("click", this._onCreateMapStageMacro.bind(this));
  }

  _bindSettingsListeners(html) {
    html.find("[data-action='save-moods']").on("click", this._onSaveMoods.bind(this));
    html.find("[data-action='apply-theme-preset']").on("click", this._onApplyThemePreset.bind(this));
    html.find("[data-action='create-theme-preset']").on("click", this._onCreateThemePreset.bind(this));
    html.find("[data-action='overwrite-theme-preset']").on("click", this._onOverwriteThemePreset.bind(this));
    html.find("[data-action='delete-theme-preset']").on("click", this._onDeleteThemePreset.bind(this));
    html.find("[data-action='select-theme-item']").on("click", this._onSelectThemeItem.bind(this));
    html.find("[data-action='select-theme-item']").on("keydown", this._onThemeItemKeydown.bind(this));
    html.find("[data-action='toggle-theme-section']").on("click", this._onToggleThemeSection.bind(this));
    html.find("[name^='themeEditor.']").on("input change", this._onThemeEditorInput.bind(this));
  }

  _activateInlinePlannerListeners(html) {
    if (!(this.activeTab === "mindmap" && this.inlinePlannerId && this.inlinePlannerApp)) return;
    const plannerContainer = html.find(".tom-library-inline-mindmap");
    const plannerRoot = plannerContainer.children(".tom-mindmap");
    if (!plannerRoot.length) return;

    this.inlinePlannerApp._element = plannerRoot;
    this.inlinePlannerApp.activateListeners(plannerRoot);
  }

  _activateInlineMapEditorListeners(html) {
    if (!(this.activeTab === "maps" && this.mapConfigEditor)) return;
    const mapEditorRoot = html.find(".tom-library-inline-map-editor > .tom-world-map-config");
    if (!mapEditorRoot.length) return;
    this.mapConfigEditor.activateInlineListeners(mapEditorRoot, this.form);
  }

  _getInlinePlannerApp() {
    if (!this.inlinePlannerId) return null;
    if (!this.inlinePlannerApp || this.inlinePlannerApp.plannerId !== this.inlinePlannerId) {
      const plannerApp = new TheatreMindmapApplication({ plannerId: this.inlinePlannerId });
      plannerApp.render = async (force = false) => {
        await this.render(force);
        return plannerApp;
      };
      this.inlinePlannerApp = plannerApp;
    }
    return this.inlinePlannerApp;
  }

  async _getInlinePlannerHtml() {
    const plannerApp = this._getInlinePlannerApp();
    if (!plannerApp) return "";
    const templateData = await plannerApp.getData();
    templateData.themeInlineStyle = this._buildThemeInlineStyle(this.draftTheme ?? TheatreStore.getThemeState());
    return await renderTemplate(
      `modules/${MODULE_ID}/templates/apps/theatre-mindmap.hbs`,
      templateData
    );
  }

  async _getInlineMapEditorHtml() {
    if (!this.mapConfigEditor) return "";
    this.mapConfigEditor.setInlineHost(this);
    const templateData = await this.mapConfigEditor.getData();
    templateData.inline = true;
    templateData.themeInlineStyle = this._buildThemeInlineStyle(this.draftTheme ?? TheatreStore.getThemeState());
    return await renderTemplate(
      `modules/${MODULE_ID}/templates/apps/theatre-world-map-config.hbs`,
      templateData
    );
  }

  renderInlineMapEditor(force = false) {
    return this._renderLibrary(force);
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

  _getDefaultAvatarData() {
    return {
      id: "",
      name: "",
      actorId: "",
      defaultImage: "",
      moodImages: {},
      useCircularCrop: false,
      circularCropScale: 1,
      frameFitScale: 1,
      frameImage: "",
      showBackdrop: true
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
        ? Math.max(0.7, Math.min(1.3, Number(avatar.circularCropScale) || 1))
        : Math.max(0.7, Math.min(1.3, Number(sceneActor.circularCropScale) || 1)),
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

  _createTokenSceneActorEntry(dropData) {
    const actor = dropData?.actor;
    const actorId = String(actor?.id || dropData?.data?.actorId || "").trim();
    if (!actor) return null;

    const libraryAvatar = actorId ? this._getAvatarByActorId(actorId) : null;
    if (libraryAvatar) {
      return this._normalizeSceneActorEntry({
        sceneActorId: randomId(),
        name: libraryAvatar.name || actor.name || dropData?.name || "Unnamed actor",
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
      name: dropData?.name || actor.name || "Unnamed actor",
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

  _getSceneActorDisplayName(sceneActor) {
    const avatar = sceneActor?.avatarId ? TheatreStore.getAvatarById(sceneActor.avatarId) : null;
    const actor = getActorById(sceneActor?.actorId);
    return sceneActor?.name || avatar?.name || actor?.name || "Unnamed actor";
  }

  _getAvatarPreviewData(avatarId, mood, actorId) {
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) {
      return {
        name: "No library avatar",
        previewImage: ""
      };
    }

    const actor = getActorById(actorId || avatar.actorId);
    return {
      name: avatar.name,
      previewImage: avatar.moodImages?.[mood] || avatar.defaultImage || actor?.img || "",
      useCircularCrop: Boolean(avatar.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(1.3, Number(avatar.circularCropScale) || 1)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale) || 1)),
      frameImage: avatar.frameImage || "",
      showBackdrop: avatar.showBackdrop !== false
    };
  }

  _collectMoodValues() {
    if (!this.form) return null;
    const inputs = Array.from(this.form.querySelectorAll("input[name^='moods.']"));
    if (!inputs.length) return null;

    return inputs
      .sort((left, right) => {
        const leftIndex = Number(left.name.split(".")[1] || 0);
        const rightIndex = Number(right.name.split(".")[1] || 0);
        return leftIndex - rightIndex;
      })
      .map((input) => input.value ?? "");
  }

  _buildThemeSections(theme) {
    return [
      this._buildThemeSection("typography", tr("Typography"), tr("Core typography and shared interaction text for navigation, content, and previews. Mindmap node text remains separate."), this._buildTypographyThemeGroups(theme)),
      this._buildThemeSection("navigation", tr("Navigation"), tr("Header shell, tabs, dividers, and semantic navigation actions."), this._buildNavigationThemeGroups(theme)),
      this._buildThemeSection("content", tr("Content"), tr("Surfaces, separators, and semantic content actions across the library and editors."), this._buildContentThemeGroups(theme)),
      this._buildThemeSection("theatre", tr("Footlights Theatre"), tr("Style the Footlights Theatre overlay for title, subtitle, avatar names, and mood indicators separately."), this._buildTheatreThemeGroups(theme)),
      this._buildThemeSection("planner", tr("Adventure Planner"), tr("Customize the planner canvas, grid, and node typography separately. Everything else inherits from Content."), this._buildPlannerThemeGroups(theme)),
      this._buildThemeSection("stageGoblin", tr("StageGoblin"), tr("Global overlay bar for compact play helpers with its own shell and typography binding."), this._buildStageGoblinThemeGroups(theme))
    ];
  }

  _buildThemePresetSection(activeTheme) {
    const themePresets = TheatreStore.getThemePresets();
    return {
      key: "presets",
      title: tr("Presets"),
      description: tr("Save, apply, and manage complete theme setups."),
      isExpanded: !this._collapsedThemeSections.has("presets"),
      presets: this._buildThemePresetCards(themePresets, activeTheme),
      canCreatePreset: true
    };
  }

  _buildThemePresetCards(presets, activeTheme) {
    const normalizedActiveTheme = TheatreStore._normalizeThemeState(activeTheme);
    return (Array.isArray(presets) ? presets : []).map((preset) => {
      const normalizedPreset = TheatreStore._normalizeThemePreset(preset, { builtIn: preset?.builtIn });
      return {
        id: normalizedPreset.id,
        name: normalizedPreset.name,
        isBuiltIn: Boolean(normalizedPreset.builtIn),
        isActive: this._areThemeStatesEqual(normalizedActiveTheme, normalizedPreset.theme),
        style: this._buildThemePresetCardStyle(normalizedPreset.theme),
        mediaStyle: this._buildNavigationSurfaceMediaStyle(normalizedPreset.theme),
        navSurfaceMediaStyle: this._buildNavigationSurfaceMediaStyle(normalizedPreset.theme),
        sampleTitle: "Footlights Library",
        sampleText: "Header, content, and planner",
        sampleTabPrimary: "Navigation",
        sampleTabSecondary: tr("Hover"),
        sampleTabActive: "Active"
      };
    });
  }

  _buildThemePresetCardStyle(theme) {
    const headingFont = String(theme?.typography?.heading2Font || "").trim();
    const bodyFont = String(theme?.typography?.subTextFont || theme?.typography?.bodyFont || "").trim();
    const navImagePath = String(theme?.navigation?.surfaceImage || "").trim();
    const navImageAlphaValue = Number(theme?.navigation?.surfaceImageAlpha);
    const navImageAlpha = Number.isFinite(navImageAlphaValue) ? Math.max(0, Math.min(1, navImageAlphaValue)) : 0;
    const navImageScaleValue = Number(theme?.navigation?.surfaceImageScale);
    const navImageScale = Number.isFinite(navImageScaleValue) ? Math.max(0.1, Math.min(4, navImageScaleValue)) : 1;
    const navImageRepeat = String(theme?.navigation?.surfaceImageRepeat ?? "repeat").trim() || "repeat";
    const escapedNavImagePath = navImagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      `--tom-theme-preset-shell:${this._linearGradientCss(theme.navigation.surfaceStart, theme.navigation.surfaceEnd)}`,
      `--tom-theme-preset-shell-border:${this._colorStopToCss(theme.navigation.border1)}`,
      `--tom-theme-preset-header-rule:${this._colorStopToCss(theme.content.headerRule)}`,
      `--tom-theme-preset-tab:${this._linearGradientCss(theme.navigation.buttonStart, theme.navigation.buttonEnd)}`,
      `--tom-theme-preset-tab-border:${this._colorStopToCss(theme.navigation.buttonBorder)}`,
      `--tom-theme-preset-tab-text:${this._colorStopToCss(theme.navigation.text)}`,
      `--tom-theme-preset-tab-hover:${this._linearGradientCss(theme.navigation.buttonHoverStart, theme.navigation.buttonHoverEnd)}`,
      `--tom-theme-preset-tab-hover-text:${this._colorStopToCss(theme.content.buttonHoverHeading)}`,
      `--tom-theme-preset-tab-active:${this._linearGradientCss(theme.navigation.buttonActiveStart, theme.navigation.buttonActiveEnd)}`,
      `--tom-theme-preset-tab-active-text:${this._colorStopToCss(theme.navigation.iconActive)}`,
      `--tom-theme-preset-card:${this._colorStopToCss(theme.content.card)}`,
      `--tom-theme-preset-card-border:${this._colorStopToCss(theme.content.border2)}`,
      `--tom-theme-preset-card-shadow:${this._colorStopToCss(theme.content.cardHover)}`,
      `--tom-theme-preset-title:${this._colorStopToCss(theme.content.heading)}`,
      `--tom-theme-preset-kicker:${this._colorStopToCss(theme.content.subheading)}`,
      `--tom-theme-preset-text:${this._colorStopToCss(theme.content.mutedText)}`,
      `--tom-theme-preset-label:${this._colorStopToCss(theme.content.label)}`,
      `--tom-theme-preset-background:${this._colorStopToCss(theme.content.appBackground)}`,
      `--tom-theme-preset-title-size:${Number(theme.typography.heading2 || 1.18).toFixed(2)}rem`,
      `--tom-theme-preset-kicker-size:${Number(theme.typography.heading3 || 1.02).toFixed(2)}rem`,
      `--tom-theme-preset-text-size:${Number(theme.typography.subText || theme.typography.body || 0.82).toFixed(2)}rem`,
      `--tom-theme-preset-title-font:${headingFont ? JSON.stringify(headingFont) : "inherit"}`,
      `--tom-theme-preset-text-font:${bodyFont ? JSON.stringify(bodyFont) : "inherit"}`,
      `--tom-theme-preset-media-image:${navImagePath ? `url("${escapedNavImagePath}")` : "none"}`,
      `--tom-theme-preset-media-alpha:${navImagePath ? navImageAlpha : 0}`,
      `--tom-theme-preset-media-size:${(navImageScale * 100).toFixed(0)}% auto`,
      `--tom-theme-preset-media-repeat:${navImageRepeat}`
    ].join(";");
  }

  _areThemeStatesEqual(leftTheme, rightTheme) {
    return JSON.stringify(TheatreStore._normalizeThemeState(leftTheme)) === JSON.stringify(TheatreStore._normalizeThemeState(rightTheme));
  }

  _getNextThemePresetName() {
    const existingNames = new Set(
      TheatreStore.getCustomThemePresets()
        .map((preset) => String(preset?.name || "").trim().toLowerCase())
        .filter(Boolean)
    );

    let index = 1;
    while (existingNames.has(`${tr("Preset")} ${index}`.toLowerCase())) {
      index += 1;
    }
    return `${tr("Preset")} ${index}`;
  }

  _buildThemeSection(key, title, description, groups) {
    return {
      key,
      title,
      description,
      groups,
      isExpanded: !this._collapsedThemeSections.has(key),
      groupCount: groups.length,
      itemCount: groups.reduce((sum, group) => sum + group.items.length, 0)
    };
  }

  _themeStop(theme, key) {
    return foundry.utils.getProperty(theme, key);
  }

  _createThemeColorItems(theme, items) {
    return items.map(({ key, label, previewType, radiusKey = "", radiusValue = null }) =>
      this._createThemeColorComponent(key, label, this._themeStop(theme, key), previewType, { radiusKey, radiusValue })
    );
  }

  _createThemeGradientItems(theme, items) {
    return items.map(({ key, label, previewType, radiusKey = "", radiusValue = null }) =>
      this._createThemeGradientComponent(
        key,
        label,
        this._themeStop(theme, `${key}Start`),
        this._themeStop(theme, `${key}End`),
        previewType,
        { radiusKey, radiusValue }
      )
    );
  }

  _createThemeActionButtonItems(theme, items) {
    return items.map(({ componentKey, label, bgKey, iconKey, iconLabel = "Icon", iconSizeKey = "", iconSizeValue = 1, previewType, borderKey = "", borderStop = null, borderWidthKey = "", borderWidthValue = 1, radiusKey = "", radiusValue = 16 }) =>
      this._createThemeActionButtonComponent(
        componentKey,
        label,
        bgKey,
        this._themeStop(theme, bgKey),
        iconKey,
        this._themeStop(theme, iconKey),
        iconLabel,
        previewType,
        iconSizeKey,
        iconSizeValue,
        borderKey,
        borderStop ?? (borderKey ? this._themeStop(theme, borderKey) : null),
        borderWidthKey,
        borderWidthValue,
        radiusKey,
        radiusValue
      )
    );
  }

  _buildTypographyThemeGroups(theme) {
    return [
      {
        title: tr("Core typography"),
        items: [
          this._createThemeTypographyStyleComponent("typography.heading1", tr("Heading 1"), theme.typography.heading1, "heading-text", tr("Sample title"), {
            colorKey: "content.heading",
            colorStop: theme.content.heading,
            colorLabel: tr("Heading 1"),
            colorPreviewType: "heading-text",
            fontKey: "typography.heading1Font",
            fontValue: theme.typography.heading1Font,
            fontOptions: this._getFontTypeOptions(theme.typography.heading1Font)
          }),
          this._createThemeTypographyStyleComponent("typography.heading2", tr("Heading 2"), theme.typography.heading2, "heading-text", tr("Section Title"), {
            colorKey: "content.subheading",
            colorStop: theme.content.subheading,
            colorLabel: tr("Heading 2"),
            colorPreviewType: "subheading-text",
            fontKey: "typography.heading2Font",
            fontValue: theme.typography.heading2Font,
            fontOptions: this._getFontTypeOptions(theme.typography.heading2Font)
          }),
          this._createThemeTypographyStyleComponent("typography.heading3", tr("Heading 3"), theme.typography.heading3, "subheading-text", tr("Smaller heading"), {
            colorKey: "content.label",
            colorStop: theme.content.label,
            colorLabel: tr("Labels"),
            colorPreviewType: "label-text",
            fontKey: "typography.heading3Font",
            fontValue: theme.typography.heading3Font,
            fontOptions: this._getFontTypeOptions(theme.typography.heading3Font)
          }),
          this._createThemeTypographyStyleComponent("typography.body", tr("Body text"), theme.typography.body, "text", tr("Sample text for normal content."), {
            colorKey: "content.text",
            colorStop: theme.content.text,
            colorLabel: tr("Content Text"),
            colorPreviewType: "text",
            fontKey: "typography.bodyFont",
            fontValue: theme.typography.bodyFont,
            fontOptions: this._getFontTypeOptions(theme.typography.bodyFont)
          }),
          this._createThemeTypographyStyleComponent("typography.subText", tr("Subtext"), theme.typography.subText, "text-muted", tr("Secondary description text."), {
            colorKey: "content.mutedText",
            colorStop: theme.content.mutedText,
            colorLabel: tr("Content Description"),
            colorPreviewType: "text-muted",
            fontKey: "typography.subTextFont",
            fontValue: theme.typography.subTextFont,
            fontOptions: this._getFontTypeOptions(theme.typography.subTextFont)
          }),
          this._createThemeTypographyStyleComponent("typography.microText", tr("Micro text"), theme.typography.microText, "label-text", tr("Micro text"), {
            fontKey: "typography.microTextFont",
            fontValue: theme.typography.microTextFont,
            fontOptions: this._getFontTypeOptions(theme.typography.microTextFont)
          }),
          this._createThemeNavigationTypographyComponent("typography.navigation", tr("Navigation"), theme.navigation, theme.typography.navigationFont, theme.typography.navigationSize)
        ]
      },
      {
        title: tr("Interactive text"),
        items: [
          this._createThemeTypographyStyleComponent("typography.heading2Hover", tr("Hover title"), theme.typography.heading2Hover, "heading-text", tr("Button Hover"), {
            colorKey: "content.buttonHoverHeading",
            colorStop: theme.content.buttonHoverHeading,
            colorLabel: tr("Hover title color"),
            colorPreviewType: "heading-text",
            fontKey: "typography.heading2Font",
            fontValue: theme.typography.heading2Font,
            fontOptions: this._getFontTypeOptions(theme.typography.heading2Font)
          }),
          this._createThemeTypographyStyleComponent("typography.subTextHover", tr("Hover subtext"), theme.typography.subTextHover, "text-muted", tr("Button Hover Description"), {
            colorKey: "content.buttonHoverSubText",
            colorStop: theme.content.buttonHoverSubText,
            colorLabel: tr("Hover subtext color"),
            colorPreviewType: "text-muted",
            fontKey: "typography.subTextFont",
            fontValue: theme.typography.subTextFont,
            fontOptions: this._getFontTypeOptions(theme.typography.subTextFont)
          })
        ]
      }
    ];
  }

  _buildNavigationThemeGroups(theme) {
    return [
      {
        title: tr("Borders"),
        items: [
          this._createThemeGradientComponent("navigation.titleBar", tr("Title bar"), theme.navigation.titleBarStart, theme.navigation.titleBarEnd, "navigation-surface"),
          this._createThemeBorderComponent("navigation.borderFrame1", tr("Borders 1"), "navigation.border1", theme.navigation.border1, "navigation.border1Width", theme.navigation.border1Width, "container"),
          this._createThemeBorderComponent("navigation.borderFrame2", tr("Borders 2"), "navigation.border2", theme.navigation.border2, "navigation.border2Width", theme.navigation.border2Width, "card")
        ]
      },
      {
        title: tr("Backgrounds"),
        items: [
          this._createThemeNavigationSurfaceComponent("navigation.surface", tr("Navigation surface"), theme.navigation),
          this._createThemeNavigationTabsComponent("navigation.tabs", tr("Navigation tabs"), theme.navigation)
        ]
      },
      {
        title: tr("Icons & dividers"),
        items: this._createThemeColorItems(theme, [
          { key: "navigation.shellDivider", label: tr("Section divider"), previewType: "splitter" }
        ])
      },
      {
        title: tr("Semantic actions"),
          items: this._createThemeActionButtonItems(theme, [
            {
              componentKey: "navigation.actionSafe",
              label: tr("Save button"),
              bgKey: "navigation.actionSafeBg",
              iconKey: "navigation.actionSafeIcon",
              iconSizeKey: "navigation.actionSafeIconSize",
              iconSizeValue: theme.navigation.actionSafeIconSize,
              previewType: "action-button-safe",
              borderKey: "navigation.actionSafeBorder",
              borderWidthKey: "navigation.actionSafeBorderWidth",
              borderWidthValue: theme.navigation.actionSafeBorderWidth,
              radiusKey: "navigation.actionSafeRadius",
              radiusValue: theme.navigation.actionSafeRadius
            },
            {
              componentKey: "navigation.actionSettings",
              label: tr("Settings button"),
              bgKey: "navigation.actionSettingsBg",
              iconKey: "navigation.actionSettingsIcon",
              iconSizeKey: "navigation.actionSettingsIconSize",
              iconSizeValue: theme.navigation.actionSettingsIconSize,
              previewType: "action-button-settings",
              borderKey: "navigation.actionSettingsBorder",
              borderWidthKey: "navigation.actionSettingsBorderWidth",
              borderWidthValue: theme.navigation.actionSettingsBorderWidth,
              radiusKey: "navigation.actionSettingsRadius",
              radiusValue: theme.navigation.actionSettingsRadius
            },
            {
              componentKey: "navigation.actionCreate",
              label: tr("Create button"),
              bgKey: "navigation.actionCreateBg",
              iconKey: "navigation.actionCreateText",
              iconLabel: tr("Text"),
              previewType: "action-button-create",
              borderKey: "navigation.actionCreateBorder",
              borderWidthKey: "navigation.actionCreateBorderWidth",
              borderWidthValue: theme.navigation.actionCreateBorderWidth,
              radiusKey: "navigation.actionCreateRadius",
              radiusValue: theme.navigation.actionCreateRadius
            }
          ])
      },
      {
        title: tr("Header lines"),
        items: this._createThemeColorItems(theme, [
          { key: "navigation.headerRule", label: tr("Header line"), previewType: "header-rule" }
        ])
      }
    ];
  }

  _buildContentThemeGroups(theme) {
    return [
      {
        title: tr("Surfaces"),
        items: [
          this._createThemeContentSurfaceComponent("content.surface", tr("Content surface"), theme.content),
          this._createThemeAppBackgroundComponent("content.appBackground", tr("App Background"), theme.content),
          ...this._createThemeColorItems(theme, [
            { key: "content.cardHover", label: tr("Card hover"), previewType: "card-hover", radiusKey: "content.cardHoverRadius", radiusValue: theme.content.cardHoverRadius },
            { key: "content.formBackground", label: tr("Forms"), previewType: "form-field", radiusKey: "content.formRadius", radiusValue: theme.content.formRadius }
          ]),
          this._createThemeContentContainerComponent("content.container", tr("Content Container"), theme.content),
          this._createThemeContentCardComponent("content.card", tr("Cards"), theme.content)
        ]
      },
      {
        title: tr("Borders"),
        items: [
          this._createThemeBorderComponent("content.borderFrame1", tr("Borders 1"), "content.border1", theme.content.border1, "content.border1Width", theme.content.border1Width, "container"),
          this._createThemeBorderComponent("content.borderFrame2", tr("Borders 2"), "content.border2", theme.content.border2, "content.border2Width", theme.content.border2Width, "card"),
          this._createThemeBorderComponent("content.borderFrame3", tr("Borders 3"), "content.border3", theme.content.border3, "content.border3Width", theme.content.border3Width, "form-field")
        ]
      },
      {
        title: tr("Dividers & feedback"),
        items: this._createThemeColorItems(theme, [
          { key: "content.divider", label: tr("Content divider"), previewType: "splitter" },
          { key: "content.horizontal2", label: tr("Horizontal 2"), previewType: "splitter" },
          { key: "content.headerRule", label: tr("Header line"), previewType: "header-rule" },
          { key: "content.scrollbar", label: tr("Scrollbar"), previewType: "splitter" }
        ])
      },
      {
        title: tr("Semantic actions"),
        items: this._createThemeActionButtonItems(theme, [
          {
            componentKey: "content.actionEdit",
            label: tr("Edit button"),
            bgKey: "content.actionEditBg",
            iconKey: "content.actionEditIcon",
            iconSizeKey: "content.actionEditIconSize",
            iconSizeValue: theme.content.actionEditIconSize,
            previewType: "action-button-edit"
          },
          {
            componentKey: "content.actionDuplicate",
            label: tr("Duplicate button"),
            bgKey: "content.actionDuplicateBg",
            iconKey: "content.actionDuplicateIcon",
            iconSizeKey: "content.actionDuplicateIconSize",
            iconSizeValue: theme.content.actionDuplicateIconSize,
            previewType: "action-button-duplicate"
          },
          {
            componentKey: "content.actionPlay",
            label: tr("Play/open button"),
            bgKey: "content.actionPlayBg",
            iconKey: "content.actionPlayIcon",
            iconSizeKey: "content.actionPlayIconSize",
            iconSizeValue: theme.content.actionPlayIconSize,
            previewType: "action-button-play"
          },
          {
            componentKey: "content.actionDelete",
            label: tr("Delete button"),
            bgKey: "content.actionDeleteBg",
            iconKey: "content.actionDeleteIcon",
            iconSizeKey: "content.actionDeleteIconSize",
            iconSizeValue: theme.content.actionDeleteIconSize,
            previewType: "action-button-delete"
          },
          {
            componentKey: "content.actionSidebar",
            label: tr("Avatar sidebar button"),
            bgKey: "content.actionSidebarBg",
            iconKey: "content.actionSidebarIcon",
            iconSizeKey: "content.actionSidebarIconSize",
            iconSizeValue: theme.content.actionSidebarIconSize,
            previewType: "action-button-edit"
          },
          {
            componentKey: "content.actionGeneric",
            label: tr("Generic buttons"),
            bgKey: "content.actionGenericBg",
            iconKey: "content.actionGenericText",
            borderKey: "content.actionGenericBorder",
            borderStop: theme.content.actionGenericBorder,
            borderWidthKey: "content.actionGenericBorderWidth",
            borderWidthValue: theme.content.actionGenericBorderWidth,
            radiusKey: "content.actionGenericRadius",
            radiusValue: theme.content.actionGenericRadius,
            previewType: "action-button-edit"
          }
        ])
      }
    ];
  }

  _buildPlannerThemeGroups(theme) {
    return [
      {
        title: "Canvas",
        items: [
          ...this._createThemeGradientItems(theme, [
            { key: "planner.canvas", label: "Canvas background", previewType: "planner-canvas" }
          ]),
          this._createThemePlannerGridComponent("planner.grid", "Canvas Grid", "planner.gridPrimary", theme.planner.gridPrimary, "planner.gridSecondary", theme.planner.gridSecondary),
          this._createThemePlannerBackdropComponent("planner.backdrop", "Backdrop", "planner.backdrop", theme.planner.backdrop, "planner.backdropText", theme.planner.backdropText),
          this._createThemePlannerToggleComponent("planner.toggle", "Toggle", "planner.toggleBg", theme.planner.toggleBg, "planner.toggleIcon", theme.planner.toggleIcon)
        ]
      },
      {
        title: "Divider",
        items: this._createThemeColorItems(theme, [
          { key: "planner.separator", label: "Separator", previewType: "splitter" }
        ])
      }
    ];
  }

  _buildStageGoblinThemeGroups(theme) {
    return [
      {
        title: "Bar",
        items: [
          this._createThemeStageGoblinBarComponent("stageGoblin.bar", "StageGoblin Bar", theme.stageGoblin, theme.typography)
        ]
      }
    ];
  }

  _buildTheatreThemeGroups(theme) {
    return [
      {
        title: tr("Fonts"),
        items: [
          this._createThemeTypographyStyleComponent("theatre.stageTitleSize", tr("Stage title"), theme.theatre.stageTitleSize, "theatre-stage-title", tr("Footlights Scene"), {
            colorKey: "theatre.stageTitle",
            colorStop: theme.theatre.stageTitle,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-stage-title"
          }),
          this._createThemeTypographyStyleComponent("theatre.stageSubtitleSize", tr("Subtitle"), theme.theatre.stageSubtitleSize, "theatre-stage-subtitle", tr("Scene begins"), {
            colorKey: "theatre.stageSubtitle",
            colorStop: theme.theatre.stageSubtitle,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-stage-subtitle"
          }),
          this._createThemeTypographyStyleComponent("theatre.avatarNameSize", tr("Avatar name"), theme.theatre.avatarNameSize, "theatre-avatar-name", "Yonks", {
            colorKey: "theatre.avatarName",
            colorStop: theme.theatre.avatarName,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-avatar-name"
          }),
          this._createThemeTypographyStyleComponent("theatre.moodSize", tr("Mood"), theme.theatre.moodSize, "theatre-mood", tr("Neutral"), {
            colorKey: "theatre.mood",
            colorStop: theme.theatre.mood,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-mood"
          })
        ]
      },
      {
        title: tr("Elements"),
        items: [
          this._createThemeTheatreBackgroundComponent("theatre.backgrounds", "Backgrounds", theme.theatre),
          this._createThemeTheatreContainerComponent("theatre.container1", "Container 1", theme.theatre, {
            backgroundKey: "theatre.container1",
            backgroundStop: theme.theatre.container1,
            borderKey: "theatre.container1Border",
            borderStop: theme.theatre.container1Border,
            borderWidthKey: "theatre.container1BorderWidth",
            borderWidthValue: theme.theatre.container1BorderWidth,
            radiusKey: "theatre.container1Radius",
            radiusValue: theme.theatre.container1Radius,
            blurKey: "theatre.container1BlurEnabled",
            blurEnabled: theme.theatre.container1BlurEnabled,
            previewLabel: "Container 1"
          }),
          this._createThemeTheatreContainerComponent("theatre.container2", "Container 2", theme.theatre, {
            backgroundKey: "theatre.container2",
            backgroundStop: theme.theatre.container2,
            borderKey: "theatre.container2Border",
            borderStop: theme.theatre.container2Border,
            borderWidthKey: "theatre.container2BorderWidth",
            borderWidthValue: theme.theatre.container2BorderWidth,
            radiusKey: "theatre.container2Radius",
            radiusValue: theme.theatre.container2Radius,
            blurKey: "theatre.container2BlurEnabled",
            blurEnabled: theme.theatre.container2BlurEnabled,
            previewLabel: "Container 2"
          }),
          this._createThemeTheatreContainerComponent("theatre.container3", "Container 3", theme.theatre, {
            backgroundKey: "theatre.container3",
            backgroundStop: theme.theatre.container3,
            borderKey: "theatre.container3Border",
            borderStop: theme.theatre.container3Border,
            borderWidthKey: "theatre.container3BorderWidth",
            borderWidthValue: theme.theatre.container3BorderWidth,
            radiusKey: "theatre.container3Radius",
            radiusValue: theme.theatre.container3Radius,
            blurKey: "theatre.container3BlurEnabled",
            blurEnabled: theme.theatre.container3BlurEnabled,
            previewLabel: "Container 3"
          }),
          this._createThemeTheatreIconComponent("theatre.icons", "Icons", theme.theatre),
          this._createThemeTheatreGmBarComponent("theatre.gmBar", "GM control bar", theme.theatre)
        ]
      }
    ];
  }

  _getTypographyPresetOptions() {
    return [
      { value: "heading1", label: "Heading 1" },
      { value: "heading2", label: "Heading 2" },
      { value: "heading3", label: "Heading 3" },
      { value: "body", label: "Body text" },
      { value: "subText", label: "Subtext" },
      { value: "microText", label: "Micro text" }
    ];
  }

  _getFontTypeOptions(selectedValue = "") {
    const options = [{ value: "", label: "Standard" }];
    const seen = new Set([""]);
    const appendOption = (value, label = value) => {
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue || seen.has(normalizedValue)) return;
      seen.add(normalizedValue);
      options.push({
        value: normalizedValue,
        label: String(label ?? normalizedValue).trim() || normalizedValue
      });
    };

    const consumeFontSource = (source) => {
      if (!source) return;

      if (source instanceof Map) {
        for (const [value, label] of source.entries()) {
          appendFontEntry(value, label);
        }
        return;
      }

      if (source instanceof Set) {
        for (const value of source.values()) {
          appendFontEntry(value, value);
        }
        return;
      }

      if (Array.isArray(source)) {
        for (const entry of source) {
          if (typeof entry === "string") appendFontEntry(entry, entry);
          else if (entry && typeof entry === "object") consumeFontSource(entry);
        }
        return;
      }

      if (typeof source === "object") {
        for (const [key, value] of Object.entries(source)) {
          appendFontEntry(key, value);
        }
      }
    };

    const appendFontEntry = (key, value) => {
      if (typeof value === "string") {
        appendOption(key, value);
        return;
      }

      if (value && typeof value === "object") {
        const explicitValue = String(value.family ?? value.value ?? key ?? "").trim();
        const explicitLabel = String(value.label ?? value.name ?? value.family ?? explicitValue).trim();
        if (explicitValue) {
          appendOption(explicitValue, explicitLabel);
          return;
        }
      }

      appendOption(key, key);
    };

    const fontConfig = globalThis.FontConfig;
    const resolveFontSource = (source) => {
      try {
        return typeof source === "function" ? source.call(fontConfig) : source;
      } catch (_error) {
        return null;
      }
    };
    let coreFonts = null;
    try {
      coreFonts = globalThis.game?.settings?.get?.("core", "fonts");
    } catch (_error) {
      coreFonts = null;
    }

    consumeFontSource(resolveFontSource(fontConfig?.getAvailableFontChoices));
    consumeFontSource(resolveFontSource(fontConfig?.getAvailableFonts));
    consumeFontSource(resolveFontSource(fontConfig?._collectDefinitions));
    consumeFontSource(globalThis.CONFIG?.fontDefinitions);
    consumeFontSource(coreFonts);

    options.sort((left, right) => {
      if (!left.value) return -1;
      if (!right.value) return 1;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });

    const selected = String(selectedValue || "").trim();
    if (selected && !options.some((option) => option.value === selected)) {
      options.push({ value: selected, label: selected });
    }

    return options;
  }

  _resolveTypographyPresetSize(typographyTheme, preset) {
    return typographyTheme?.[preset] ?? typographyTheme?.subText ?? 0.82;
  }

  _getSelectedThemeItem(themeSections) {
    const flatItems = [];
    for (const section of themeSections) {
      for (const group of section.groups) {
        for (const item of group.items) {
          flatItems.push({
            ...item,
            sectionTitle: section.title,
            groupTitle: group.title,
            isSelected: item.key === this.activeThemeItemKey
          });
        }
      }
    }

    const selected = flatItems.find((item) => item.isSelected) ?? flatItems[0] ?? null;
    if (selected && selected.key !== this.activeThemeItemKey) {
      this.activeThemeItemKey = selected.key;
      selected.isSelected = true;
    }

    for (const section of themeSections) {
      for (const group of section.groups) {
        for (const item of group.items) {
          item.isSelected = item.key === selected?.key;
        }
      }
    }

    return selected;
  }

  _buildThemePreviewHtml(previewType, previewParts = {}, sampleText = "") {
    const partStyle = (part) => previewParts[part] ? ` style="${previewParts[part]}"` : "";
    const sample = sampleText || tr("Sample text");

    switch (previewType) {
      case "navigation-surface":
        return `<div class="tom-theme-preview tom-theme-preview--header" data-theme-preview-part="main"${partStyle("main")}><span>${tr("Navigation")}</span></div>`;
      case "navigation-tabs":
        return `
          <div class="tom-theme-preview tom-theme-preview--navigation-tabs">
            <div class="tom-theme-preview__navigation-tabs-row">
              <span class="tom-theme-preview__navigation-tab" data-theme-preview-part="button"${partStyle("button")}>
                <i class="fas fa-star" aria-hidden="true"></i>
                <span>${tr("Button")}</span>
              </span>
              <span class="tom-theme-preview__navigation-tab" data-theme-preview-part="hover"${partStyle("hover")}>
                <i class="fas fa-star" aria-hidden="true"></i>
                <span>${tr("Hover")}</span>
              </span>
              <span class="tom-theme-preview__navigation-tab is-active" data-theme-preview-part="active"${partStyle("active")}>
                <i class="fas fa-circle" aria-hidden="true"></i>
                <span>${tr("Active")}</span>
              </span>
            </div>
            <div class="tom-theme-preview__navigation-tab-border" data-theme-preview-part="border"${partStyle("border")}></div>
          </div>
        `;
      case "content-surface":
        return `<div class="tom-theme-preview tom-theme-preview--card" data-theme-preview-part="main"${partStyle("main")}><span>Content</span></div>`;
      case "content-surface-image":
        return `
          <div class="tom-theme-preview tom-theme-preview--card tom-theme-preview--image-host" data-theme-preview-part="main"${partStyle("main")}>
            <div class="tom-theme-preview__image-layer" data-theme-preview-part="image"${partStyle("image")}></div>
            <span>${tr("Content")}</span>
          </div>
        `;
      case "content-box-image":
        return `
          <div class="tom-theme-preview tom-theme-preview--card tom-theme-preview--image-host" data-theme-preview-part="main"${partStyle("main")}>
            <div class="tom-theme-preview__image-layer" data-theme-preview-part="image"${partStyle("image")}></div>
            <span>${tr("Surface")}</span>
          </div>
        `;
      case "planner-canvas":
        return `<div class="tom-theme-preview tom-theme-preview--planner-canvas" data-theme-preview-part="main"${partStyle("main")}><span>Canvas</span></div>`;
      case "planner-backdrop":
        return `
          <div class="tom-theme-preview tom-theme-preview--planner-backdrop" data-theme-preview-part="main"${partStyle("main")}>
            <span data-theme-preview-part="text"${partStyle("text")}>${tr("Backdrop Text")}</span>
          </div>
        `;
      case "planner-toggle":
        return `
          <div class="tom-theme-preview tom-theme-preview--planner-toggle">
            <span class="tom-theme-preview__planner-toggle-button" data-theme-preview-part="button"${partStyle("button")}>
              <i class="fas fa-angle-left" data-theme-preview-part="icon"${partStyle("icon")} aria-hidden="true"></i>
            </span>
          </div>
        `;
      case "stage-goblin-bar":
        return `
          <div class="tom-theme-preview tom-theme-preview--stage-goblin-bar">
            <div class="tom-theme-preview__stage-goblin-shell" data-theme-preview-part="main"${partStyle("main")}>
              <span class="tom-theme-preview__stage-goblin-handle" data-theme-preview-part="icon"${partStyle("icon")} aria-hidden="true">
                <i class="fas fa-arrows-up-down-left-right"></i>
              </span>
              <span class="tom-theme-preview__stage-goblin-planner" data-theme-preview-part="icon"${partStyle("icon")} aria-hidden="true">
                <i class="fas fa-diagram-project"></i>
              </span>
              <span class="tom-theme-preview__stage-goblin-item">
                <span class="tom-theme-preview__stage-goblin-item-handle" aria-hidden="true">
                  <i></i><i></i>
                  <i></i><i></i>
                  <i></i><i></i>
                </span>
                <span class="tom-theme-preview__stage-goblin-item-label" data-theme-preview-part="label"${partStyle("label")}>${sample}</span>
              </span>
            </div>
          </div>
        `;
      case "theatre-stage-title":
        return `<div class="tom-theme-preview tom-theme-preview--text"><strong class="tom-theme-preview__theatre-stage-title" data-theme-preview-part="main"${partStyle("main")}>${sample}</strong></div>`;
      case "theatre-stage-subtitle":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span class="tom-theme-preview__theatre-stage-subtitle" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "theatre-avatar-name":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span class="tom-theme-preview__theatre-avatar-name-text" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "theatre-mood":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span class="tom-theme-preview__theatre-mood-text" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "theatre-backgrounds":
        return `
          <div
            class="tom-theme-preview tom-theme-preview--theatre-backgrounds"
            data-theme-preview-part="main"${partStyle("main")}
            style="border-color:var(--tom-theme-preview-stage-frame, rgba(126, 186, 236, 0.22));border-width:var(--tom-theme-preview-stage-frame-width, 1px);"
          >
            <div class="tom-theme-preview__theatre-heading-shell" style="background:var(--tom-theme-preview-title-bg, rgba(8, 21, 35, 0.88));">
              <strong>${tr("Footlights Scene")}</strong>
              <span>${tr("Scene begins")}</span>
            </div>
            <div class="tom-theme-preview__theatre-pill-row">
              <span class="tom-theme-preview__theatre-pill-label" style="background:var(--tom-theme-preview-avatar-name-bg, rgba(8, 21, 35, 0.92));">Yonks</span>
              <span class="tom-theme-preview__theatre-pill-label" style="background:var(--tom-theme-preview-mood-bg, rgba(8, 21, 35, 0.92));">${tr("Neutral")}</span>
            </div>
          </div>
        `;
      case "navigation-card":
        return `
          <div class="tom-theme-preview tom-theme-preview--header-card-sample">
            <div class="tom-app-header tom-panel tom-theme-surface tom-theme-surface--navigation tom-theme-preview__header-card" data-theme-preview-part="main"${partStyle("main")}>
              <div>
                <strong>${tr("Header Card")}</strong>
                <p class="notes">${tr("Context")}</p>
              </div>
            </div>
          </div>
        `;
      case "navigation-card-image":
        return `
          <div class="tom-theme-preview tom-theme-preview--header-card-sample">
            <div class="tom-app-header tom-panel tom-theme-surface tom-theme-surface--navigation tom-theme-preview__header-card tom-theme-preview--image-host" data-theme-preview-part="main"${partStyle("main")}>
              <div class="tom-theme-preview__image-layer" data-theme-preview-part="image"${partStyle("image")}></div>
              <div>
                <strong>${tr("Header Card")}</strong>
                <p class="notes">${tr("Context")}</p>
              </div>
            </div>
          </div>
        `;
      case "navigation-button":
        return `<div class="tom-theme-preview tom-theme-preview--button" data-theme-preview-part="main"${partStyle("main")}>${tr("Button")}</div>`;
      case "navigation-button-hover":
        return `<div class="tom-theme-preview tom-theme-preview--button" data-theme-preview-part="main"${partStyle("main")}>${tr("Hover")}</div>`;
      case "navigation-button-active":
        return `<div class="tom-theme-preview tom-theme-preview--button tom-theme-preview--button-active" data-theme-preview-part="main"${partStyle("main")}>${tr("Active")}</div>`;
      case "heading-text":
        return `<div class="tom-theme-preview tom-theme-preview--text"><strong data-theme-preview-part="main"${partStyle("main")}>${sample}</strong></div>`;
      case "subheading-text":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span class="tom-theme-preview__subheading" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "label-text":
        return `<div class="tom-theme-preview tom-theme-preview--label-sample"><span class="tom-theme-preview__label" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "text":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "text-muted":
        return `<div class="tom-theme-preview tom-theme-preview--text"><span class="notes" data-theme-preview-part="main"${partStyle("main")}>${sample}</span></div>`;
      case "navigation-typography":
        return `
          <div class="tom-theme-preview tom-theme-preview--header-rule">
            <strong data-theme-preview-part="text"${partStyle("text")}>${tr("Navigation")}</strong>
            <span class="notes" data-theme-preview-part="muted"${partStyle("muted")}>${tr("Description")}</span>
          </div>
        `;
      case "icon-active":
        return `
          <div class="tom-theme-preview tom-theme-preview--icon">
            <div class="tom-theme-preview__icon-inline">
              <i class="fas fa-circle" data-theme-preview-part="main"${partStyle("main")} aria-hidden="true"></i>
              <span>${tr("Active")}</span>
            </div>
          </div>
        `;
      case "icon":
        return `<div class="tom-theme-preview tom-theme-preview--icon"><i class="fas fa-star" data-theme-preview-part="main"${partStyle("main")} aria-hidden="true"></i></div>`;
      case "splitter":
        return `<div class="tom-theme-preview tom-theme-preview--splitter"><div class="tom-theme-preview__splitter-line" data-theme-preview-part="main"${partStyle("main")}></div></div>`;
      case "header-rule":
        return `
          <div class="tom-theme-preview tom-theme-preview--header-rule">
            <strong>${tr("Heading")}</strong>
            <div class="tom-theme-preview__header-rule-line" data-theme-preview-part="main"${partStyle("main")}></div>
            <span class="notes">${tr("Description")}</span>
          </div>
        `;
      case "app-background":
        return `<div class="tom-theme-preview tom-theme-preview--app-background" data-theme-preview-part="main"${partStyle("main")}><span>${tr("App")}</span></div>`;
      case "app-background-image":
        return `
          <div class="tom-theme-preview tom-theme-preview--app-background tom-theme-preview--image-host" data-theme-preview-part="main"${partStyle("main")}>
            <div class="tom-theme-preview__image-layer" data-theme-preview-part="image"${partStyle("image")}></div>
            <span>${tr("App")}</span>
          </div>
        `;
      case "container":
        return `<div class="tom-theme-preview tom-theme-preview--container" data-theme-preview-part="main"${partStyle("main")}><span>${tr("Container")}</span></div>`;
      case "form-field":
        return `<div class="tom-theme-preview tom-theme-preview--form-field" data-theme-preview-part="main"${partStyle("main")}><span>${tr("Form field")}</span></div>`;
      case "card":
      case "card-hover":
      case "overlay":
        return `<div class="tom-theme-preview tom-theme-preview--card" data-theme-preview-part="main"${partStyle("main")}><span>${tr("Surface")}</span></div>`;
      case "action-button-edit":
        return this._buildActionButtonPreviewHtml("edit", "fa-pen-to-square", previewParts);
      case "action-button-safe":
        return this._buildActionButtonPreviewHtml("safe", "fa-save", previewParts);
      case "action-button-create":
        return this._buildActionButtonPreviewHtml("create", "", previewParts, tr("Create"));
      case "action-button-settings":
        return this._buildActionButtonPreviewHtml("settings", "fa-gear", previewParts);
      case "action-button-duplicate":
        return this._buildActionButtonPreviewHtml("duplicate", "fa-clone", previewParts);
      case "action-button-play":
        return this._buildActionButtonPreviewHtml("play", "fa-circle-play", previewParts);
      case "action-button-delete":
        return this._buildActionButtonPreviewHtml("delete", "fa-trash-can", previewParts);
      case "planner-grid":
        return `<div class="tom-theme-preview tom-theme-preview--planner-grid" data-theme-preview-part="main"${partStyle("main")}><span>${tr("Grid")}</span></div>`;
      case "planner-node-typography":
        return this._buildPlannerNodeTypographyPreviewHtml(previewParts, false);
      case "planner-node-typography-inverted":
        return this._buildPlannerNodeTypographyPreviewHtml(previewParts, true);
      default:
        return "";
    }
  }

  _buildActionButtonPreviewHtml(variant, iconClass, previewParts, labelText = "") {
    const buttonStyle = previewParts.button ? ` style="${previewParts.button}"` : "";
    const iconStyle = previewParts.icon ? ` style="${previewParts.icon}"` : "";
    const iconHtml = iconClass
      ? `<i class="fas ${iconClass}" data-theme-preview-part="icon"${iconStyle} aria-hidden="true"></i>`
      : `<span class="tom-theme-preview__action-button-label" data-theme-preview-part="icon"${iconStyle}>${labelText || "Create"}</span>`;
    return `
      <div class="tom-theme-preview tom-theme-preview--action-button">
        <span class="tom-theme-preview__action-button tom-theme-preview__action-button--${variant}" data-theme-preview-part="button"${buttonStyle}>
          ${iconHtml}
        </span>
      </div>
    `;
  }

  _buildPlannerNodeTypographyPreviewHtml(previewParts, isInverted = false) {
    const handleStyle = previewParts.handle ? ` style="${previewParts.handle}"` : "";
    const headingStyle = previewParts.heading ? ` style="${previewParts.heading}"` : "";
    const textStyle = previewParts.text ? ` style="${previewParts.text}"` : "";
    const actionStyle = previewParts.action ? ` style="${previewParts.action}"` : "";
    const invertedClass = isInverted ? " is-inverted" : "";

    return `
      <div class="tom-theme-preview tom-theme-preview--planner-node-typography">
        <div class="tom-theme-preview__planner-node-card${invertedClass}">
          <span class="tom-theme-preview__planner-node-handle" data-theme-preview-part="handle"${handleStyle}>
            <i></i><i></i>
            <i></i><i></i>
            <i></i><i></i>
          </span>
          <div class="tom-theme-preview__planner-node-copy">
            <strong data-theme-preview-part="heading"${headingStyle}>FOOTLIGHTS SCENE</strong>
            <span data-theme-preview-part="text"${textStyle}>Sample text</span>
          </div>
          <span class="tom-theme-preview__planner-node-action" data-theme-preview-part="action"${actionStyle}>
            <i class="fas fa-circle-play" aria-hidden="true"></i>
          </span>
        </div>
      </div>
    `;
  }

  _createThemeColorControl(key, label, stop) {
    return {
      key,
      label,
      showHeader: label !== "Color",
      isColor: true,
      color: stop.color,
      alpha: Math.round(stop.alpha * 100)
    };
  }

  _createThemeGradientControl(key, label, start, end, extraColorControls = [], extraRangeControls = []) {
    return {
      key,
      label,
      showHeader: true,
      isGradient: true,
      startColor: start.color,
      startAlpha: Math.round(start.alpha * 100),
      endColor: end.color,
      endAlpha: Math.round(end.alpha * 100),
      extraColorControls,
      extraRangeControls
    };
  }

  _createThemeSizeControl(key, label, value, min = 0.62, max = 2.4, step = 0.01) {
    return {
      key,
      label,
      showHeader: label !== tr("Size"),
      isRange: true,
      value: Number(value).toFixed(2),
      min,
      max,
      step,
      unit: "rem"
    };
  }

  _createThemeRangeControl(key, label, value, min = 0, max = 10, step = 0.1, unit = "px") {
    return {
      key,
      label,
      showHeader: label !== tr("Size"),
      isRange: true,
      value: Number(value).toFixed(unit === "px" ? 1 : (step >= 1 ? 0 : 2)),
      min,
      max,
      step,
      unit
    };
  }

  _createThemeSelectControl(key, label, value, options = []) {
    return {
      key,
      label,
      showHeader: true,
      isSelect: true,
      value,
      options
    };
  }

  _createThemeBooleanSelectControl(key, label, value) {
    return this._createThemeSelectControl(key, label, value ? "true" : "false", [
      { value: "false", label: "Off" },
      { value: "true", label: "On" }
    ]);
  }

  _createThemeTextControl(key, label, value, placeholder = "", { imagePicker = false } = {}) {
    return {
      key,
      label,
      showHeader: true,
      isText: true,
      value: String(value ?? "").trim(),
      placeholder,
      imagePicker
    };
  }

  _getNavigationSurfaceRepeatOptions(selectedValue = "repeat") {
    const selected = String(selectedValue || "repeat").trim() || "repeat";
    return [
      { value: "no-repeat", label: "No tiling" },
      { value: "repeat", label: "Repeat" },
      { value: "repeat-x", label: "Repeat X" },
      { value: "repeat-y", label: "Repeat Y" }
    ].map((option) => ({
      ...option,
      selected: option.value === selected
    }));
  }

  _createThemeGradientComponent(key, label, start, end, previewType, {
    radiusKey = "",
    radiusValue = null
  } = {}) {
    const previewParts = {
      main:
        `background:${this._linearGradientCss(start, end)};` +
        `${radiusKey ? this._previewStyleForRadius(radiusValue) : ""}`
    };
    const controls = [
      this._createThemeGradientControl(key, tr("Gradient"), start, end)
    ];
    if (radiusKey) {
      controls.push(this._createThemeRangeControl(radiusKey, "Corner radius", radiusValue, 0, 40, 1, "px"));
    }
    return {
      key,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts),
      controls
    };
  }

  _createThemeNavigationSurfaceComponent(componentKey, label, navigationTheme) {
    const previewParts = {
      main: `background:${this._linearGradientCss(navigationTheme.surfaceStart, navigationTheme.surfaceEnd)};`
    };

    return {
      key: componentKey,
      label,
      previewType: "navigation-surface",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("navigation-surface", previewParts),
      controls: [
        this._createThemeGradientControl("navigation.surface", tr("Gradient"), navigationTheme.surfaceStart, navigationTheme.surfaceEnd),
        ...this._createThemeImageControls(
          "navigation.surface",
          navigationTheme.surfaceImage,
          navigationTheme.surfaceImageAlpha,
          navigationTheme.surfaceImageScale,
          navigationTheme.surfaceImageRepeat,
          this._getNavigationSurfaceRepeatOptions(navigationTheme.surfaceImageRepeat)
        )
      ]
    };
  }

  _createThemeNavigationCardComponent(componentKey, label, navigationTheme) {
    const imageAlpha = Number(navigationTheme.cardImageAlpha ?? 0);
    const previewParts = {
      main:
        `background:${this._linearGradientCss(navigationTheme.cardStart, navigationTheme.cardEnd)};` +
        this._previewStyleForRadius(navigationTheme.cardRadius) +
        `backdrop-filter:blur(${navigationTheme.cardBlurEnabled ? 14 : 0}px);-webkit-backdrop-filter:blur(${navigationTheme.cardBlurEnabled ? 14 : 0}px);`,
      image: this._buildThemeImagePreviewLayer(
        navigationTheme.cardImage,
        imageAlpha,
        navigationTheme.cardImageScale,
        navigationTheme.cardImageRepeat,
        navigationTheme.cardRadius
      )
    };

    return {
      key: componentKey,
      label,
      previewType: "navigation-card-image",
      previewParts,
      controls: [
        this._createThemeGradientControl("navigation.card", tr("Gradient"), navigationTheme.cardStart, navigationTheme.cardEnd),
        ...this._createThemeImageControls(
          "navigation.card",
          navigationTheme.cardImage,
          navigationTheme.cardImageAlpha,
          navigationTheme.cardImageScale,
          navigationTheme.cardImageRepeat,
          this._getNavigationSurfaceRepeatOptions(navigationTheme.cardImageRepeat)
        ),
        this._createThemeRangeControl("navigation.cardRadius", tr("Corner radius"), navigationTheme.cardRadius, 0, 40, 1, "px"),
        this._createThemeBooleanSelectControl("navigation.cardBlurEnabled", tr("Blur"), navigationTheme.cardBlurEnabled)
      ]
    };
  }

  _createThemeContentImageRepeatOptions(selectedValue = "repeat") {
    return this._getNavigationSurfaceRepeatOptions(selectedValue);
  }

  _buildThemeImagePreviewLayer(imagePath, imageAlpha, imageScale, imageRepeat, radiusValue = null) {
    return (
      this._buildSurfaceImageStyle(imagePath, imageAlpha, imageScale, imageRepeat) +
      `opacity:${Math.max(0, Math.min(1, imageAlpha || 0))};` +
      (radiusValue === null ? "" : this._previewStyleForRadius(radiusValue))
    );
  }

  _createThemeImageControls(baseKey, imagePath, imageAlpha, imageScale, imageRepeat, repeatOptions) {
    return [
      this._createThemeTextControl(`${baseKey}Image`, tr("Background image"), imagePath, tr("Path to PNG/WebP/JPG"), { imagePicker: true }),
      this._createThemeRangeControl(`${baseKey}ImageAlpha`, tr("Image opacity"), Number(imageAlpha ?? 0), 0, 1, 0.01, ""),
      this._createThemeRangeControl(`${baseKey}ImageScale`, tr("Image scale"), Number(imageScale ?? 1), 0.1, 4, 0.01, "x"),
      this._createThemeSelectControl(`${baseKey}ImageRepeat`, tr("Tiling"), String(imageRepeat ?? "repeat"), repeatOptions)
    ];
  }

  _createThemeContentSurfaceComponent(componentKey, label, contentTheme) {
    const imageAlpha = Number(contentTheme.surfaceImageAlpha ?? 0);
    const previewParts = {
      main:
        `background:${this._linearGradientCss(contentTheme.surfaceStart, contentTheme.surfaceEnd)};` +
        this._previewStyleForRadius(contentTheme.surfaceRadius),
      image: this._buildThemeImagePreviewLayer(
        contentTheme.surfaceImage,
        imageAlpha,
        contentTheme.surfaceImageScale,
        contentTheme.surfaceImageRepeat,
        contentTheme.surfaceRadius
      )
    };
    return {
      key: componentKey,
      label,
      previewType: "content-surface-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-surface-image", previewParts),
      controls: [
        this._createThemeGradientControl("content.surface", tr("Gradient"), contentTheme.surfaceStart, contentTheme.surfaceEnd),
        ...this._createThemeImageControls(
          "content.surface",
          contentTheme.surfaceImage,
          contentTheme.surfaceImageAlpha,
          contentTheme.surfaceImageScale,
          contentTheme.surfaceImageRepeat,
          this._createThemeContentImageRepeatOptions(contentTheme.surfaceImageRepeat)
        ),
        this._createThemeRangeControl("content.surfaceRadius", tr("Corner radius"), contentTheme.surfaceRadius, 0, 40, 1, "px")
      ]
    };
  }

  _createThemeAppBackgroundComponent(componentKey, label, contentTheme) {
    const imageAlpha = Number(contentTheme.appBackgroundImageAlpha ?? 0);
    const previewParts = {
      main: this._previewStyleForColor("app-background", contentTheme.appBackground, "content.appBackground"),
      image: this._buildThemeImagePreviewLayer(
        contentTheme.appBackgroundImage,
        imageAlpha,
        contentTheme.appBackgroundImageScale,
        contentTheme.appBackgroundImageRepeat
      )
    };
    return {
      key: componentKey,
      label,
      previewType: "app-background-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("app-background-image", previewParts),
      controls: [
        this._createThemeColorControl("content.appBackground", tr("Color"), contentTheme.appBackground),
        ...this._createThemeImageControls(
          "content.appBackground",
          contentTheme.appBackgroundImage,
          contentTheme.appBackgroundImageAlpha,
          contentTheme.appBackgroundImageScale,
          contentTheme.appBackgroundImageRepeat,
          this._createThemeContentImageRepeatOptions(contentTheme.appBackgroundImageRepeat)
        )
      ]
    };
  }

  _createThemeContentContainerComponent(componentKey, label, contentTheme) {
    const imageAlpha = Number(contentTheme.containerImageAlpha ?? 0);
    const previewParts = {
      main:
        this._previewStyleForColor("container", contentTheme.container, "content.container") +
        this._previewStyleForRadius(contentTheme.containerRadius),
      image: this._buildThemeImagePreviewLayer(
        contentTheme.containerImage,
        imageAlpha,
        contentTheme.containerImageScale,
        contentTheme.containerImageRepeat,
        contentTheme.containerRadius
      )
    };
    return {
      key: componentKey,
      label,
      previewType: "content-box-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-box-image", previewParts),
      controls: [
        this._createThemeColorControl("content.container", tr("Color"), contentTheme.container),
        ...this._createThemeImageControls(
          "content.container",
          contentTheme.containerImage,
          contentTheme.containerImageAlpha,
          contentTheme.containerImageScale,
          contentTheme.containerImageRepeat,
          this._createThemeContentImageRepeatOptions(contentTheme.containerImageRepeat)
        ),
        this._createThemeRangeControl("content.containerRadius", tr("Corner radius"), contentTheme.containerRadius, 0, 40, 1, "px")
      ]
    };
  }

  _createThemeContentCardComponent(componentKey, label, contentTheme) {
    const imageAlpha = Number(contentTheme.cardImageAlpha ?? 0);
    const previewParts = {
      main:
        this._previewStyleForColor("card", contentTheme.card, "content.card") +
        this._previewStyleForRadius(contentTheme.cardRadius),
      image: this._buildThemeImagePreviewLayer(
        contentTheme.cardImage,
        imageAlpha,
        contentTheme.cardImageScale,
        contentTheme.cardImageRepeat,
        contentTheme.cardRadius
      )
    };
    return {
      key: componentKey,
      label,
      previewType: "content-box-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-box-image", previewParts),
      controls: [
        this._createThemeColorControl("content.card", tr("Color"), contentTheme.card),
        ...this._createThemeImageControls(
          "content.card",
          contentTheme.cardImage,
          contentTheme.cardImageAlpha,
          contentTheme.cardImageScale,
          contentTheme.cardImageRepeat,
          this._createThemeContentImageRepeatOptions(contentTheme.cardImageRepeat)
        ),
        this._createThemeRangeControl("content.cardRadius", tr("Corner radius"), contentTheme.cardRadius, 0, 40, 1, "px")
      ]
    };
  }

  _createThemeNavigationTabsComponent(componentKey, label, navigationTheme) {
      const previewParts = {
        button:
          `background:${this._linearGradientCss(navigationTheme.buttonStart, navigationTheme.buttonEnd)};` +
          `border-color:${this._colorStopToCss(navigationTheme.buttonBorder)};` +
          `border-width:${Number(navigationTheme.buttonBorderWidth || 0).toFixed(1)}px;` +
          `${this._previewStyleForRadius(navigationTheme.tabRadius)}` +
          `color:${this._colorStopToCss(navigationTheme.text)};`,
        hover:
          `background:${this._linearGradientCss(navigationTheme.buttonHoverStart, navigationTheme.buttonHoverEnd)};` +
          `border-color:${this._colorStopToCss(navigationTheme.buttonHoverBorder)};` +
          `border-width:${Number(navigationTheme.buttonHoverBorderWidth || 0).toFixed(1)}px;` +
          `${this._previewStyleForRadius(navigationTheme.tabRadius)}` +
        `color:${this._colorStopToCss(navigationTheme.iconHover)};`,
      active:
        `background:${this._linearGradientCss(navigationTheme.buttonActiveStart, navigationTheme.buttonActiveEnd)};` +
        `border-color:${this._colorStopToCss(navigationTheme.buttonActiveBorder)};` +
        `border-width:${Number(navigationTheme.buttonActiveBorderWidth || 0).toFixed(1)}px;` +
        `${this._previewStyleForRadius(navigationTheme.tabRadius)}` +
        `color:${this._colorStopToCss(navigationTheme.iconActive)};` +
        `-webkit-text-fill-color:${this._colorStopToCss(navigationTheme.iconActive)};`,
      border: this._previewStyleForColor("splitter", navigationTheme.divider, "navigation.divider")
    };
    return {
      key: componentKey,
      label,
      previewType: "navigation-tabs",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("navigation-tabs", previewParts),
        controls: [
          this._createThemeGradientControl("navigation.button", tr("Button"), navigationTheme.buttonStart, navigationTheme.buttonEnd, [
            this._createThemeColorControl("navigation.text", tr("Text"), navigationTheme.text),
            this._createThemeColorControl("navigation.buttonBorder", tr("Borders"), navigationTheme.buttonBorder)
          ], [
            this._createThemeRangeControl("navigation.buttonBorderWidth", tr("Border width"), navigationTheme.buttonBorderWidth, 0, 8, 0.1, "px")
          ]),
        this._createThemeGradientControl("navigation.buttonHover", tr("Hover"), navigationTheme.buttonHoverStart, navigationTheme.buttonHoverEnd, [
          this._createThemeColorControl("navigation.iconHover", tr("Text"), navigationTheme.iconHover),
          this._createThemeColorControl("navigation.buttonHoverBorder", tr("Borders"), navigationTheme.buttonHoverBorder)
        ], [
          this._createThemeRangeControl("navigation.buttonHoverBorderWidth", tr("Border width"), navigationTheme.buttonHoverBorderWidth, 0, 8, 0.1, "px")
        ]),
        this._createThemeGradientControl("navigation.buttonActive", tr("Active"), navigationTheme.buttonActiveStart, navigationTheme.buttonActiveEnd, [
          this._createThemeColorControl("navigation.iconActive", tr("Text"), navigationTheme.iconActive),
          this._createThemeColorControl("navigation.buttonActiveBorder", tr("Borders"), navigationTheme.buttonActiveBorder)
        ], [
          this._createThemeRangeControl("navigation.buttonActiveBorderWidth", tr("Border width"), navigationTheme.buttonActiveBorderWidth, 0, 8, 0.1, "px")
        ]),
        this._createThemeRangeControl("navigation.tabRadius", tr("Corner radius"), navigationTheme.tabRadius, 0, 30, 1, "px")
      ]
    };
  }

  _createThemePlannerBackdropComponent(componentKey, label, bgKey, bgStop, textKey, textStop) {
    const previewParts = {
      main: this._previewStyleForColor("planner-backdrop", bgStop, bgKey),
      text: this._previewStyleForColor("text", textStop, textKey)
    };
    return {
      key: componentKey,
      label,
      previewType: "planner-backdrop",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("planner-backdrop", previewParts),
      controls: [
        this._createThemeColorControl(bgKey, tr("Background"), bgStop),
        this._createThemeColorControl(textKey, tr("Text"), textStop)
      ]
    };
  }

  _createThemePlannerToggleComponent(componentKey, label, bgKey, bgStop, iconKey, iconStop) {
    const previewParts = {
      button: this._previewStyleForColor("planner-toggle", bgStop, bgKey),
      icon: this._previewStyleForColor("planner-action-icon", iconStop, iconKey)
    };
    return {
      key: componentKey,
      label,
      previewType: "planner-toggle",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("planner-toggle", previewParts),
      controls: [
        this._createThemeColorControl(bgKey, tr("Background"), bgStop),
        this._createThemeColorControl(iconKey, tr("Icon"), iconStop)
      ]
    };
  }

  _createThemeColorComponent(key, label, stop, previewType, {
    radiusKey = "",
    radiusValue = null
  } = {}) {
    const previewParts = {
      main:
        this._previewStyleForColor(previewType, stop) +
        `${radiusKey ? this._previewStyleForRadius(radiusValue) : ""}`
    };
    const controls = [
      this._createThemeColorControl(key, tr("Color"), stop)
    ];
    if (radiusKey) {
      controls.push(this._createThemeRangeControl(radiusKey, tr("Corner radius"), radiusValue, 0, 40, 1, "px"));
    }
    return {
      key,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts),
      controls
    };
  }

  _createThemeBorderComponent(componentKey, label, borderKey, borderStop, widthKey, widthValue, previewType) {
    const previewParts = {
      main:
        `${this._previewStyleForColor(previewType, { color: "#000000", alpha: 0.04 })}` +
        `border-style:solid;` +
        `border-color:${this._colorStopToCss(borderStop)};` +
        `border-width:${Number(widthValue || 0).toFixed(1)}px;`
    };

    return {
      key: componentKey,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts),
      controls: [
        this._createThemeColorControl(borderKey, tr("Color"), borderStop),
        this._createThemeRangeControl(widthKey, tr("Thickness"), widthValue, 0, 8, 0.1, "px")
      ]
    };
  }

  _createThemeTypographyComponent(key, label, size, previewType, sampleText) {
    const previewParts = {
      main: this._previewStyleForSize(size)
    };
    return {
      key,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts, sampleText),
      controls: [
        this._createThemeSizeControl(key, tr("Size"), size)
      ]
    };
  }

  _createThemeTypographyStyleComponent(key, label, size, previewType, sampleText, {
    colorKey = "",
    colorStop = null,
    colorLabel = tr("Text color"),
    colorPreviewType = previewType,
    fontKey = "",
    fontValue = "",
    fontOptions = []
  } = {}) {
    const previewParts = {
      main:
        `${this._previewStyleForSize(size)}` +
        `${colorStop ? this._previewStyleForColor(colorPreviewType, colorStop, colorKey) : ""}` +
        `${fontKey ? this._previewStyleForFontFamily(fontValue) : ""}`
    };

    const controls = [
      this._createThemeSizeControl(key, tr("Size"), size)
    ];
    if (colorKey && colorStop) {
      controls.push(this._createThemeColorControl(colorKey, colorLabel, colorStop));
    }
    if (fontKey) {
      controls.push(this._createThemeSelectControl(fontKey, tr("Font Type"), fontValue, fontOptions));
    }

    return {
      key,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts, sampleText),
      controls
    };
  }

  _createThemeNavigationTypographyComponent(componentKey, label, navigationTheme, fontValue = "", sizeValue = 0.76) {
    const previewParts = {
      text:
        this._previewStyleForSize(sizeValue) +
        this._previewStyleForColor("text", navigationTheme.text, "navigation.text") +
        this._previewStyleForFontFamily(fontValue),
      muted:
        this._previewStyleForColor("text-muted", navigationTheme.mutedText, "navigation.mutedText") +
        this._previewStyleForFontFamily(fontValue)
    };

    return {
      key: componentKey,
      label,
      previewType: "navigation-typography",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("navigation-typography", previewParts),
      controls: [
        this._createThemeSizeControl("typography.navigationSize", tr("Font size"), sizeValue),
        this._createThemeSelectControl("typography.navigationFont", tr("Font Type"), fontValue, this._getFontTypeOptions(fontValue)),
        this._createThemeColorControl("navigation.text", tr("Navigation Text"), navigationTheme.text),
        this._createThemeColorControl("navigation.mutedText", tr("Navigation Description"), navigationTheme.mutedText)
      ]
    };
  }

  _createThemeActionButtonComponent(componentKey, label, bgKey, bgStop, iconKey, iconStop, iconLabel = "Icon", previewType, iconSizeKey = "", iconSizeValue = 1, borderKey = "", borderStop = null, borderWidthKey = "", borderWidthValue = 1, radiusKey = "", radiusValue = 16) {
    const previewParts = {
      button: this._previewStyleForColor(previewType, bgStop, bgKey),
      icon:
        this._previewStyleForColor(previewType, iconStop, iconKey) +
        `font-size:${Number(iconSizeValue || 1).toFixed(2)}rem;`
    };
    if (borderKey && borderStop) {
      previewParts.button += `border-color:${this._colorStopToCss(borderStop)};border-width:${Number(borderWidthValue || 0).toFixed(1)}px;`;
    }
    if (radiusKey) {
      previewParts.button += this._previewStyleForRadius(radiusValue);
    }
    return {
      key: componentKey,
      label,
      previewType,
      previewParts,
        previewHtml: this._buildThemePreviewHtml(previewType, previewParts),
      controls: [
        this._createThemeColorControl(bgKey, tr("Background"), bgStop),
        this._createThemeColorControl(iconKey, iconLabel, iconStop),
        ...(borderKey && borderStop ? [this._createThemeColorControl(borderKey, tr("Borders"), borderStop)] : []),
        ...(borderWidthKey ? [this._createThemeRangeControl(borderWidthKey, tr("Border width"), borderWidthValue, 0, 8, 0.1, "px")] : []),
        ...(radiusKey ? [this._createThemeRangeControl(radiusKey, tr("Corner radius"), radiusValue, 0, 40, 1, "px")] : []),
        ...(iconSizeKey ? [this._createThemeRangeControl(iconSizeKey, tr("Icon size"), iconSizeValue, 0.62, 2.4, 0.01, "rem")] : [])
      ]
    };
  }

  _createThemeStageGoblinBarComponent(componentKey, label, stageGoblinTheme, typographyTheme) {
    const fontPresetSize = this._resolveTypographyPresetSize(typographyTheme, stageGoblinTheme.fontPreset);
    const borderWidth = Number.isFinite(Number(stageGoblinTheme.borderWidth))
      ? Number(stageGoblinTheme.borderWidth)
      : 1;
    const radius = Number.isFinite(Number(stageGoblinTheme.radius))
      ? Number(stageGoblinTheme.radius)
      : 11;
    const previewParts = {
      main:
        `${this._previewStyleForColor("stage-goblin-bar", stageGoblinTheme.surface, "stageGoblin.surface")}` +
        `border-color:${this._colorStopToCss(stageGoblinTheme.border)};` +
        `border-width:${borderWidth}px;` +
        this._previewStyleForRadius(radius),
      icon: this._previewStyleForColor("icon", stageGoblinTheme.icon, "stageGoblin.icon"),
      label: this._previewStyleForSize(fontPresetSize)
    };

    return {
      key: componentKey,
      label,
      previewType: "stage-goblin-bar",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("stage-goblin-bar", previewParts, tr("StageGoblin")),
      controls: [
        this._createThemeColorControl("stageGoblin.surface", tr("Background"), stageGoblinTheme.surface),
        this._createThemeColorControl("stageGoblin.border", tr("Borders"), stageGoblinTheme.border),
        this._createThemeColorControl("stageGoblin.icon", tr("Icon"), stageGoblinTheme.icon),
        this._createThemeRangeControl("stageGoblin.borderWidth", tr("Border width"), stageGoblinTheme.borderWidth, 0, 6, 0.1, "px"),
        this._createThemeRangeControl("stageGoblin.radius", tr("Corner radius"), stageGoblinTheme.radius, 0, 40, 1, "px"),
        this._createThemeSelectControl("stageGoblin.fontPreset", tr("Font size"), stageGoblinTheme.fontPreset, this._getTypographyPresetOptions())
      ]
    };
  }

  _createThemeTheatreBackgroundComponent(componentKey, label, theatreTheme) {
    const previewParts = {
      main:
        `--tom-theme-preview-title-bg:${this._colorStopToCss(theatreTheme.titleBackground)};` +
        `--tom-theme-preview-title-bg-radius:${Number(theatreTheme.titleBackgroundRadius || 999).toFixed(0)}px;` +
        `--tom-theme-preview-avatar-name-bg:${this._colorStopToCss(theatreTheme.avatarNameBackground)};` +
        `--tom-theme-preview-mood-bg:${this._colorStopToCss(theatreTheme.moodBackground)};` +
        `--tom-theme-preview-stage-frame:${this._colorStopToCss(theatreTheme.stageFrame)};` +
        `--tom-theme-preview-stage-frame-width:${Number(theatreTheme.stageFrameWidth || 0).toFixed(1)}px;`
    };

    return {
      key: componentKey,
      label,
      previewType: "theatre-backgrounds",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("theatre-backgrounds", previewParts),
      controls: [
        this._createThemeColorControl("theatre.titleBackground", "Title background", theatreTheme.titleBackground),
        this._createThemeRangeControl("theatre.titleBackgroundRadius", "Title Corner radius", theatreTheme.titleBackgroundRadius, 0, 999, 1, "px"),
        this._createThemeColorControl("theatre.avatarNameBackground", "Avatar name background", theatreTheme.avatarNameBackground),
        this._createThemeColorControl("theatre.moodBackground", "Mood background", theatreTheme.moodBackground),
        this._createThemeColorControl("theatre.stageFrame", "Bordersfarbe", theatreTheme.stageFrame),
        this._createThemeRangeControl("theatre.stageFrameWidth", "Border width", theatreTheme.stageFrameWidth, 0, 8, 0.1, "px")
      ]
    };
  }

  _createThemeTheatreContainerComponent(componentKey, label, _theatreTheme, {
    backgroundKey,
    backgroundStop,
    borderKey,
    borderStop,
    borderWidthKey,
    borderWidthValue,
    radiusKey,
    radiusValue,
    blurKey,
    blurEnabled,
    previewLabel
  }) {
    const previewParts = {
      main:
        this._previewStyleForColor("container", backgroundStop, backgroundKey) +
        `border-color:${this._colorStopToCss(borderStop)};` +
        `border-width:${Number(borderWidthValue || 0).toFixed(1)}px;` +
        this._previewStyleForRadius(radiusValue) +
        `backdrop-filter:blur(${blurEnabled ? 12 : 0}px);`
    };

    return {
      key: componentKey,
      label,
      previewType: "content-box-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-box-image", previewParts, previewLabel),
      controls: [
        this._createThemeColorControl(backgroundKey, "Color", backgroundStop),
        this._createThemeColorControl(borderKey, "Borders", borderStop),
        this._createThemeRangeControl(borderWidthKey, "Border width", borderWidthValue, 0, 8, 0.1, "px"),
        this._createThemeRangeControl(radiusKey, "Corner radius", radiusValue, 0, 40, 1, "px"),
        this._createThemeBooleanSelectControl(blurKey, "Blur", blurEnabled)
      ]
    };
  }

  _createThemeTheatreGmBarComponent(componentKey, label, theatreTheme) {
    const imageAlpha = Number(theatreTheme.gmBarImageAlpha ?? 0);
    const previewParts = {
      main:
        this._previewStyleForColor("container", theatreTheme.gmBarBackground, "theatre.gmBarBackground") +
        this._previewStyleForRadius(theatreTheme.gmBarRadius),
      image: this._buildThemeImagePreviewLayer(
        theatreTheme.gmBarImage,
        imageAlpha,
        theatreTheme.gmBarImageScale,
        theatreTheme.gmBarImageRepeat,
        theatreTheme.gmBarRadius
      )
    };

    return {
      key: componentKey,
      label,
      previewType: "content-box-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-box-image", previewParts, tr("GM control bar")),
      controls: [
        this._createThemeColorControl("theatre.gmBarBackground", tr("Color"), theatreTheme.gmBarBackground),
        ...this._createThemeImageControls(
          "theatre.gmBar",
          theatreTheme.gmBarImage,
          theatreTheme.gmBarImageAlpha,
          theatreTheme.gmBarImageScale,
          theatreTheme.gmBarImageRepeat,
          this._createThemeContentImageRepeatOptions(theatreTheme.gmBarImageRepeat)
        ),
        this._createThemeRangeControl("theatre.gmBarRadius", tr("Corner radius"), theatreTheme.gmBarRadius, 0, 40, 1, "px")
      ]
    };
  }

  _createThemeTheatreIconComponent(componentKey, label, theatreTheme) {
    const previewParts = {
      button:
        this._previewStyleForColor("card", theatreTheme.iconBackground, "theatre.iconBackground") +
        `border-color:${this._colorStopToCss(theatreTheme.iconBorder)};` +
        `border-width:${Number(theatreTheme.iconBorderWidth || 0).toFixed(1)}px;`,
      icon: this._previewStyleForColor("icon", theatreTheme.iconColor, "theatre.iconColor")
    };

    return {
      key: componentKey,
      label,
      previewType: "action-button-edit",
      previewParts,
      previewHtml: this._buildActionButtonPreviewHtml("edit", "fa-eye", previewParts),
      controls: [
        this._createThemeColorControl("theatre.iconBackground", "Background", theatreTheme.iconBackground),
        this._createThemeColorControl("theatre.iconBorder", "Borders", theatreTheme.iconBorder),
        this._createThemeRangeControl("theatre.iconBorderWidth", "Border width", theatreTheme.iconBorderWidth, 0, 8, 0.1, "px"),
        this._createThemeColorControl("theatre.iconColor", "Icon", theatreTheme.iconColor)
      ]
    };
  }

  _createThemePlannerGridComponent(componentKey, label, primaryKey, primaryStop, secondaryKey, secondaryStop) {
    const previewParts = {
      main:
        `--tom-theme-preview-grid-primary:${this._colorStopToCss(primaryStop)};` +
        `--tom-theme-preview-grid-secondary:${this._colorStopToCss(secondaryStop)};`
    };
    return {
      key: componentKey,
      label,
      previewType: "planner-grid",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("planner-grid", previewParts),
      controls: [
        this._createThemeColorControl(primaryKey, "Hauptlinie", primaryStop),
        this._createThemeColorControl(secondaryKey, "Feinlinie", secondaryStop)
      ]
    };
  }

  _createThemePlannerNodeTypographyComponent(componentKey, label, tokenMap, previewType) {
    const headingStop = tokenMap.heading[1];
    const textStop = tokenMap.text[1];
    const handleStop = tokenMap.handle[1];
    const actionStop = tokenMap.action[1];

    const previewParts = {
      handle: this._previewStyleForColor("planner-handle", handleStop, tokenMap.handle[0]),
      heading: this._previewStyleForColor("heading-text", headingStop, tokenMap.heading[0]),
      text: this._previewStyleForColor("text", textStop, tokenMap.text[0]),
      action: this._previewStyleForColor("planner-action-icon", actionStop, tokenMap.action[0])
    };

    return {
      key: componentKey,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts),
      controls: [
        this._createThemeColorControl(tokenMap.heading[0], "Heading", headingStop),
        this._createThemeColorControl(tokenMap.text[0], "Text", textStop),
        this._createThemeColorControl(tokenMap.handle[0], "Handle", handleStop),
        this._createThemeColorControl(tokenMap.action[0], "Action icon", actionStop)
      ]
    };
  }

  _previewStyleForColor(previewType, stop, keyOverride = "") {
    const rgba = this._colorStopToCss(stop);
    const backgroundPreviewTypes = new Set([
      "splitter",
      "planner-backdrop",
      "planner-toggle",
      "header-rule",
      "stage-goblin-bar"
    ]);
    const colorPreviewTypes = new Set([
      "planner-grid",
      "text",
      "heading-text",
      "subheading-text",
      "label-text",
      "text-muted",
      "theatre-stage-title",
      "theatre-stage-subtitle",
      "theatre-avatar-name",
      "theatre-mood",
      "icon",
      "icon-active"
    ]);

    if (backgroundPreviewTypes.has(previewType)) {
      return `background:${rgba};`;
    }

    if (colorPreviewTypes.has(previewType) || keyOverride.endsWith("Icon") || keyOverride.endsWith("Text")) {
      return `--tom-theme-preview-color:${rgba};`;
    }

    return `background:${rgba};`;
  }

  _previewStyleForSize(size) {
    const numericValue = Number(size);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 1;
    return `font-size:${safeValue}rem;`;
  }

  _previewStyleForRadius(radius) {
    const numericValue = Number(radius);
    const safeValue = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
    return `border-radius:${safeValue}px;`;
  }

  _previewStyleForFontFamily(fontFamily) {
    const family = String(fontFamily || "").trim();
    return family ? `font-family:${JSON.stringify(family)};` : "";
  }

  _hexToRgb(hex) {
    const value = String(hex ?? "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16)
    };
  }

  _colorStopToCss(stop) {
    const rgb = this._hexToRgb(stop?.color);
    const alpha = Math.max(0, Math.min(1, Number(stop?.alpha)));
    if (!rgb) return "rgba(255,255,255,1)";
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number.isFinite(alpha) ? alpha : 1})`;
  }

  _linearGradientCss(start, end) {
    return `linear-gradient(180deg, ${this._colorStopToCss(start)}, ${this._colorStopToCss(end)})`;
  }

  _buildThemeInlineStyle(theme) {
    return buildThemeInlineStyle(theme);
  }

  _getSceneFallbackThumbnail(scene) {
    const firstActorId = scene.actors?.[0]?.actorId;
    return getActorById(firstActorId)?.img || "";
  }

  _syncDraftMoodsFromForm() {
    const moods = this._collectMoodValues();
    if (moods !== null) {
      this.draftMoods = moods;
    }
  }

  _syncDraftThemeFromForm() {
    if (!this.form) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const themeEditor = formData.themeEditor;
    if (themeEditor && typeof themeEditor === "object") {
      const normalizedEditor = this._normalizeThemeEditorInput(themeEditor);
      const navigationSurfaceImage = String(normalizedEditor?.navigation?.surfaceImage ?? "").trim();
      const navigationSurfaceImageAlpha = Number(normalizedEditor?.navigation?.surfaceImageAlpha);
      const baseTheme = duplicateData(this.draftTheme ?? TheatreStore.getThemeState());
      const mergedTheme = foundry.utils.mergeObject(baseTheme, normalizedEditor, {
        inplace: false,
        recursive: true,
        insertKeys: true,
        overwrite: true
      });
      this.draftTheme = TheatreStore._normalizeThemeState(mergedTheme);
    }
  }

  _normalizeThemeEditorInput(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => this._normalizeThemeEditorInput(entry));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

      const normalized = {};
      for (const [key, entry] of Object.entries(value)) {
        if (key === "alpha") {
          const numericValue = Number(entry);
          if (!Number.isFinite(numericValue)) {
            normalized[key] = 1;
            continue;
          }

          const normalizedAlpha = numericValue > 1
            ? numericValue / 100
            : numericValue;
          normalized[key] = Math.max(0, Math.min(1, normalizedAlpha));
          continue;
        }

      normalized[key] = this._normalizeThemeEditorInput(entry);
    }
    return normalized;
  }

  _applyThemeInlineStyle(theme) {
    if (!this.form || !theme) return;
    applyThemeInlineStyleToHost(this.form, theme);
  }

  _updateThemePreviewCards(theme) {
    if (!this.form || !theme) return;
    const themeSections = this._buildThemeSections(theme);
    const componentMap = new Map();
    for (const section of themeSections) {
      for (const group of section.groups) {
        for (const item of group.items) {
          componentMap.set(item.key, item);
        }
      }
    }

    const items = this.form.querySelectorAll("[data-theme-key]");
    for (const item of items) {
      const key = item.dataset.themeKey;
      if (!key) continue;
      const component = componentMap.get(key);
      if (!component) continue;

      for (const [part, styleValue] of Object.entries(component.previewParts ?? {})) {
        item.querySelectorAll(`[data-theme-preview-part='${part}']`).forEach((preview) => {
          preview.setAttribute("style", styleValue);
        });
      }
    }

    const inputsByName = new Map(
      Array.from(this.form.querySelectorAll("[name]"))
        .filter((input) => input?.name)
        .map((input) => [input.name, input])
    );

    this.form.querySelectorAll("[data-theme-alpha-display-for]").forEach((display) => {
      const inputName = display.dataset.themeAlphaDisplayFor;
      if (!inputName) return;
      const input = inputsByName.get(inputName);
      if (input) {
        display.textContent = `${input.value ?? "0"}%`;
      }
    });

    this.form.querySelectorAll("[data-theme-range-display-for]").forEach((display) => {
      const inputName = display.dataset.themeRangeDisplayFor;
      if (!inputName) return;
      const input = inputsByName.get(inputName);
      if (input) {
        const numericValue = Number(input.value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : 1;
        const unit = display.dataset.themeRangeUnit || "";
        const precision = unit === "px" ? 1 : 2;
        display.textContent = `${safeValue.toFixed(precision)}${unit}`;
      }
    });
  }

  _applyThemePreviewFromForm() {
    this._syncDraftThemeFromForm();
    const theme = this.draftTheme ?? TheatreStore.getThemeState();
    this._applyThemeInlineStyle(theme);
    this._syncNavigationSurfaceMedia(theme);
    this._updateThemePreviewCards(theme);
    applyThemeInlineStyleToHost(this.manager?.overlay?.element?.[0], theme);
    this._syncStageGoblinThemePreview(theme);
    this._syncThemeSectionLayouts();
  }

  _syncStageGoblinThemePreview(theme) {
    const root = document.querySelector(".tom-stage-goblin");
    if (!root || !theme) return;
    applyThemeInlineStyleToHost(root, theme);
  }

  _syncNavigationSurfaceMedia(theme) {
    if (!this.form) return;
    const media = this.form.querySelector(".tom-library-shell-head__media");
    if (!media) return;
    media.setAttribute("style", this._buildNavigationSurfaceMediaStyle(theme));
  }

  _bindThemeLayoutObservers() {
    this._teardownThemeLayoutObservers();
    this._syncThemeSectionLayouts();

    const settingsRoot = this.form?.querySelector(".tom-library-settings");
    const windowContent = this.form?.closest(".window-content");
    const browser = this.form?.querySelector(".tom-theme-browser");
    const observedElements = [settingsRoot, windowContent, browser].filter(Boolean);

    if (typeof ResizeObserver === "function" && observedElements.length) {
      this._themeInspectorResizeObserver = new ResizeObserver(() => {
        this._syncThemeSectionLayouts();
      });
      for (const element of observedElements) {
        this._themeInspectorResizeObserver.observe(element);
      }
    }

    this._onThemeInspectorWindowResize = () => {
      this._syncThemeSectionLayouts();
    };
    window.addEventListener("resize", this._onThemeInspectorWindowResize);
    this._onThemeInspectorScroll = () => {
      this._syncThemeSectionLayouts();
    };
    this._themeInspectorScrollTargets = [settingsRoot, windowContent, browser].filter(Boolean);
    for (const target of this._themeInspectorScrollTargets) {
      target.addEventListener("scroll", this._onThemeInspectorScroll, { passive: true });
    }

    requestAnimationFrame(() => {
      this._syncThemeSectionLayouts();
    });
  }

  _teardownThemeLayoutObservers() {
    this._themeInspectorResizeObserver?.disconnect?.();
    this._themeInspectorResizeObserver = null;
    if (this._onThemeInspectorWindowResize) {
      window.removeEventListener("resize", this._onThemeInspectorWindowResize);
      this._onThemeInspectorWindowResize = null;
    }
    if (this._onThemeInspectorScroll) {
      for (const target of this._themeInspectorScrollTargets) {
        target?.removeEventListener?.("scroll", this._onThemeInspectorScroll);
      }
      this._themeInspectorScrollTargets = [];
      this._onThemeInspectorScroll = null;
    }
  }

  _syncThemeSectionLayouts() {
    if (!this.form) return;
    const inspector = this.form.querySelector(".tom-theme-inspector");
    const windowContent = this.form.closest(".window-content");
    if (inspector && windowContent) {
      const inspectorRect = inspector.getBoundingClientRect();
      const windowContentRect = windowContent.getBoundingClientRect();
      const visibleTop = Math.max(windowContentRect.top, inspectorRect.top, 0);
      const visibleBottom = Math.min(windowContentRect.bottom, window.innerHeight || windowContentRect.bottom);
      const availableHeight = Math.max(180, Math.floor(visibleBottom - visibleTop - 8));
      inspector.style.setProperty("--tom-theme-inspector-max-height", `${availableHeight}px`);
    }

    const sections = this.form.querySelectorAll("[data-theme-section]");
    for (const section of sections) {
      const groups = section.querySelector(".tom-theme-settings__groups");
      if (!groups) continue;
      const isCollapsed = section.classList.contains("is-collapsed");
      groups.style.maxHeight = isCollapsed ? "0px" : `${groups.scrollHeight}px`;
      groups.style.opacity = isCollapsed ? "0" : "1";
    }
  }

  async _renderPreservingSettingsScroll(force = false) {
    const scrollTargets = [
      this.form?.closest(".window-content"),
      this.form,
      this.form?.querySelector(".tom-library-content"),
      this.form?.querySelector(".tom-library-content--shell"),
      this.form?.querySelector(".tom-library-settings"),
      this.form?.querySelector(".tom-scene-config-main"),
      this.form?.querySelector(".tom-scene-avatar-sidebar__list")
    ]
      .filter(Boolean)
      .map((element) => ({
        selector:
          element === this.form?.closest(".window-content") ? ".window-content" :
          element === this.form ? "form" :
          element === this.form?.querySelector(".tom-library-content") ? ".tom-library-content" :
          element === this.form?.querySelector(".tom-library-content--shell") ? ".tom-library-content--shell" :
          element === this.form?.querySelector(".tom-library-settings") ? ".tom-library-settings" :
          element === this.form?.querySelector(".tom-scene-config-main") ? ".tom-scene-config-main" :
          ".tom-scene-avatar-sidebar__list",
        scrollTop: element.scrollTop ?? 0,
        scrollLeft: element.scrollLeft ?? 0
      }));

    await this.render(force);

    const restoreScroll = () => {
      for (const target of scrollTargets) {
        let element = null;
        if (target.selector === ".window-content") element = this.form?.closest(".window-content");
        if (target.selector === "form") element = this.form;
        if (target.selector === ".tom-library-content") element = this.form?.querySelector(".tom-library-content");
        if (target.selector === ".tom-library-content--shell") element = this.form?.querySelector(".tom-library-content--shell");
        if (target.selector === ".tom-library-settings") element = this.form?.querySelector(".tom-library-settings");
        if (target.selector === ".tom-scene-config-main") element = this.form?.querySelector(".tom-scene-config-main");
        if (target.selector === ".tom-scene-avatar-sidebar__list") element = this.form?.querySelector(".tom-scene-avatar-sidebar__list");
        if (!element) continue;
        element.scrollTop = target.scrollTop;
        element.scrollLeft = target.scrollLeft;
      }
    };

    restoreScroll();
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(() => restoreScroll());
    });
  }

  _renderLibrary(force = false) {
    const scrollTargets = [
      this.form?.closest?.(".window-content"),
      this.form,
      this.form?.querySelector(".tom-library-content"),
      this.form?.querySelector(".tom-library-content--shell"),
      this.form?.querySelector(".tom-scene-config-main"),
      this.form?.querySelector(".tom-world-map-config"),
      this.form?.querySelector(".tom-sound-playlist-editor"),
      this.form?.querySelector(".tom-sound-playlist-scenes__list")
    ]
      .filter(Boolean)
      .map((element) => ({
        selector:
          element === this.form?.closest(".window-content") ? ".window-content" :
          element === this.form ? "form" :
          element === this.form?.querySelector(".tom-library-content") ? ".tom-library-content" :
          element === this.form?.querySelector(".tom-library-content--shell") ? ".tom-library-content--shell" :
          element === this.form?.querySelector(".tom-scene-config-main") ? ".tom-scene-config-main" :
          element === this.form?.querySelector(".tom-world-map-config") ? ".tom-world-map-config" :
          element === this.form?.querySelector(".tom-sound-playlist-editor") ? ".tom-sound-playlist-editor" :
          ".tom-sound-playlist-scenes__list",
        scrollTop: element.scrollTop ?? 0,
        scrollLeft: element.scrollLeft ?? 0
      }));

    const restoreScroll = () => {
      for (const target of scrollTargets) {
        let element = null;
        if (target.selector === ".window-content") element = this.form?.closest(".window-content");
        if (target.selector === "form") element = this.form;
        if (target.selector === ".tom-library-content") element = this.form?.querySelector(".tom-library-content");
        if (target.selector === ".tom-library-content--shell") element = this.form?.querySelector(".tom-library-content--shell");
        if (target.selector === ".tom-scene-config-main") element = this.form?.querySelector(".tom-scene-config-main");
        if (target.selector === ".tom-world-map-config") element = this.form?.querySelector(".tom-world-map-config");
        if (target.selector === ".tom-sound-playlist-editor") element = this.form?.querySelector(".tom-sound-playlist-editor");
        if (target.selector === ".tom-sound-playlist-scenes__list") element = this.form?.querySelector(".tom-sound-playlist-scenes__list");
        if (!element) continue;
        element.scrollTop = target.scrollTop;
        element.scrollLeft = target.scrollLeft;
      }
    };

    const scheduleRestore = () => {
      restoreScroll();
      requestAnimationFrame(() => {
        restoreScroll();
        requestAnimationFrame(() => restoreScroll());
      });
    };

    const renderResult = this.render(force);
    if (renderResult?.then instanceof Function) {
      return renderResult.then(() => {
        scheduleRestore();
      });
    }

    scheduleRestore();
    return renderResult;
  }

  _onThemeEditorInput() {
    this._applyThemePreviewFromForm();
  }

  async _onSelectThemeItem(event) {
    event.preventDefault();
    this._syncDraftThemeFromForm();
    const nextKey = event.currentTarget.dataset.themeKey;
    if (!nextKey || nextKey === this.activeThemeItemKey) return;
    this.activeThemeItemKey = nextKey;
    await this._renderPreservingSettingsScroll(false);
  }

  _onThemeItemKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    this._onSelectThemeItem(event);
  }

  async _onToggleThemeSection(event) {
    event.preventDefault();
    const toggle = event.currentTarget;
    const sectionKey = toggle.dataset.themeSectionKey;
    if (!sectionKey) return;

    if (this._collapsedThemeSections.has(sectionKey)) this._collapsedThemeSections.delete(sectionKey);
    else this._collapsedThemeSections.add(sectionKey);

    const section = toggle.closest("[data-theme-section]");
    const icon = toggle.querySelector(".tom-theme-settings__section-meta i");
    const isExpanded = !this._collapsedThemeSections.has(sectionKey);
    if (section) {
      section.classList.toggle("is-collapsed", !isExpanded);
      section.classList.toggle("is-expanded", isExpanded);
    }
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    if (icon) {
      icon.classList.toggle("fa-chevron-down", isExpanded);
      icon.classList.toggle("fa-chevron-right", !isExpanded);
    }
    this._syncThemeSectionLayouts();
  }

  async _onApplyThemePreset(event) {
    event.preventDefault();
    const presetId = event.currentTarget.dataset.presetId;
    if (!presetId) return;

    const preset = TheatreStore.getThemePresets().find((entry) => entry.id === presetId);
    if (!preset) return;

    this.draftTheme = duplicateData(preset.theme);
    await this._renderPreservingSettingsScroll(false);
  }

  async _onCreateThemePreset(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncDraftThemeFromForm();

    const theme = duplicateData(this.draftTheme ?? TheatreStore.getThemeState());
    await TheatreStore.createThemePreset({
      name: this._getNextThemePresetName(),
      theme
    });
    await this._renderPreservingSettingsScroll(false);
  }

  async _onOverwriteThemePreset(event) {
    event.preventDefault();
    event.stopPropagation();

    const presetId = event.currentTarget.dataset.presetId;
    if (!presetId) return;

    const existingPreset = TheatreStore.getCustomThemePresets().find((preset) => preset.id === presetId);
    if (!existingPreset) return;

    this._syncDraftThemeFromForm();
    await TheatreStore.updateThemePreset(presetId, {
      theme: duplicateData(this.draftTheme ?? TheatreStore.getThemeState())
    });
    await this._renderPreservingSettingsScroll(false);
  }

  async _onDeleteThemePreset(event) {
    event.preventDefault();
    event.stopPropagation();

    const presetId = event.currentTarget.dataset.presetId;
    if (!presetId) return;

    const existingPreset = TheatreStore.getCustomThemePresets().find((preset) => preset.id === presetId);
    if (!existingPreset) return;

    await TheatreStore.deleteThemePreset(presetId);
    await this._renderPreservingSettingsScroll(false);
  }

  _initSceneEditor(sceneId = null) {
    const theatreScene = sceneId ? TheatreStore.getSceneById(sceneId) : null;
    this.sceneEditor = foundry.utils.mergeObject(
      this._getDefaultSceneData(),
      duplicateData(theatreScene ?? {}),
      { inplace: false }
    );
    this.sceneEditorActors = (Array.isArray(this.sceneEditor.actors) ? this.sceneEditor.actors : [])
      .map((sceneActor) => this._normalizeSceneActorEntry(sceneActor));
    this.sceneEditorSoundPlaylistIds = theatreScene?.id ? TheatreStore.getSceneSoundPlaylistIds(theatreScene.id) : [];
    this._resetSceneEditorTransientState();
    this.activeTab = "scenes";
  }

  _initAvatarEditor(avatarId = null) {
    const avatar = avatarId ? TheatreStore.getAvatarById(avatarId) : null;
    this.avatarEditor = duplicateData(avatar ?? this._getDefaultAvatarData());
    this.activeTab = "avatars";
  }

  _resetSceneEditorTransientState() {
    this.sceneEditorDragOverIndex = null;
    this.sceneEditorDropzoneActive = false;
  }

  _onToggleSceneEditorSection(event) {
    event.preventDefault();
    const toggle = event.currentTarget;
    const sectionKey = String(toggle?.dataset?.sceneEditorSectionKey || "").trim();
    if (!sectionKey) return;
    if (this._collapsedSceneEditorSections.has(sectionKey)) this._collapsedSceneEditorSections.delete(sectionKey);
    else this._collapsedSceneEditorSections.add(sectionKey);
    const section = toggle.closest("[data-scene-editor-section]");
    const isExpanded = !this._collapsedSceneEditorSections.has(sectionKey);
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

  _closeSceneEditor() {
    const sceneId = this.sceneEditor?.id || null;
    this.sceneEditor = null;
    this.sceneEditorActors = [];
    this.sceneEditorSoundPlaylistIds = [];
    this._resetSceneEditorTransientState();
    this._restoreLiveScenePreview(sceneId);
  }

  _closeAvatarEditor() {
    this.avatarEditor = null;
  }

  _openPlannerConfig(plannerId = null) {
    new TheatreAdventurePlannerConfigApplication(plannerId ? { plannerId } : {}).render(true);
  }

  _openWorldMapConfig(mapId = null) {
    this.mapConfigEditor = new TheatreWorldMapConfigApplication(mapId ? { mapId } : {});
    this.mapConfigEditor.setInlineHost(this);
    this.activeTab = "maps";
    this._renderLibrary();
  }

  _openSceneEditor(sceneId = null) {
    const previousSceneId = this.sceneEditor?.id || null;
    if (previousSceneId && previousSceneId !== sceneId) {
      this._restoreLiveScenePreview(previousSceneId);
    }
    this._initSceneEditor(sceneId);
    this._renderLibrary();
  }

  _openAvatarEditor(avatarId = null) {
    this._initAvatarEditor(avatarId);
    this._renderLibrary();
  }

  _openInlinePlanner(plannerId = null) {
    this.inlinePlannerId = plannerId || TheatreStore.getActiveAdventurePlanner()?.id || null;
    this.inlinePlannerApp = null;
    this.activeTab = "mindmap";
    this._renderLibrary();
  }

  _closeInlinePlanner() {
    this.inlinePlannerId = null;
    this.inlinePlannerApp = null;
    this._renderLibrary();
  }

  _closeMapEditor() {
    this.mapConfigEditor = null;
  }

  _mutateSceneEditorActors(mutator, { clearDragState = false, preserveDraggedAvatar = false } = {}) {
    this._syncSceneEditorFromForm();
    if (clearDragState) {
      this._clearSceneEditorDragState({ preserveDraggedAvatar });
    }
    mutator?.();
    this._renderPreservingSettingsScroll();
  }

  _getSceneEditorSidebarAvatars() {
    if (!this.sceneEditor) return [];
    return TheatreStore.getAvatars().map((avatar) => {
      const actor = getActorById(avatar.actorId);
      return {
        id: avatar.id,
        name: avatar.name,
        actorName: actor?.name || tr("No actor"),
        thumbnail: avatar.defaultImage || actor?.img || ""
      };
    });
  }

  _getSceneEditorActorRows() {
    if (!this.sceneEditor) return [];
    return this.sceneEditorActors.map((sceneActor, index) => {
      const actor = getActorById(sceneActor.actorId);
      const avatar = this._getAvatarPreviewData(sceneActor.avatarId, sceneActor.initialMood, sceneActor.actorId);

      return {
        ...sceneActor,
        actorName: this._getSceneActorDisplayName(sceneActor),
        previewImage: sceneActor.imageOverride || avatar.previewImage || actor?.img || "",
        hasLibraryAvatar: Boolean(sceneActor.avatarId && TheatreStore.getAvatarById(sceneActor.avatarId)),
        isDragOver: this.sceneEditorDragOverIndex === index,
        index
      };
    });
  }

  _createSceneEditorActorEntry(avatarId = "", actorId = "") {
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

  _applyAvatarToSceneEditorActor(index, avatarId) {
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return false;
    const entry = this.sceneEditorActors[index];
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
      circularCropScale: Math.max(0.7, Math.min(1.3, Number(sceneActor.circularCropScale ?? 1) || 1)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(sceneActor.frameFitScale ?? 1) || 1)),
      frameImage: String(sceneActor.frameImage || "").trim(),
      showBackdrop: sceneActor.showBackdrop !== false,
      moodImages: {}
    };
  }

  _syncSceneEditorFromForm() {
    if (!this.form || !this.sceneEditor) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const expanded = formData.sceneEditor ?? {};
    const actors = this._normalizeSubmittedActors(expanded.actors);
    const soundAssignments = Array.isArray(expanded.soundPlaylistAssignments)
      ? expanded.soundPlaylistAssignments
      : (expanded.soundPlaylistAssignments ? [expanded.soundPlaylistAssignments] : []);

    this.sceneEditorActors = actors.map((sceneActor) => this._normalizeSceneActorEntry(sceneActor));
    this.sceneEditorSoundPlaylistIds = soundAssignments.map((id) => String(id || "").trim()).filter(Boolean);

    this.sceneEditor = {
      ...this._getDefaultSceneData(),
      ...this.sceneEditor,
      id: expanded.id || this.sceneEditor.id || "",
      name: expanded.name || "",
      stageTitle: expanded.stageTitle || "",
      stageSubtitle: expanded.stageSubtitle || "",
      description: String(expanded.description || "").trim(),
      location: String(expanded.location || "").trim(),
      tags: normalizeSceneTags(expanded.tagsInput),
      background: expanded.background || "",
      thumbnail: expanded.thumbnail || "",
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
      },
      actors: duplicateData(this.sceneEditorActors)
    };
  }

  _applyLiveScenePreview(sceneDraft) {
    const activeScene = this.manager?.getActiveScene?.();
    if (!sceneDraft?.id || activeScene?.id !== sceneDraft.id) return;
    this.manager?.overlay?.applySceneDraftPreview?.(sceneDraft);
  }

  _restoreLiveScenePreview(sceneId) {
    const activeScene = this.manager?.getActiveScene?.();
    if (!sceneId || activeScene?.id !== sceneId) return;
    void this.manager?.onSettingsChanged?.();
  }

  _onSceneEditorLivePreviewInput() {
    this._syncSceneEditorFromForm();
    this._applyLiveScenePreview(this.sceneEditor);
  }

  _syncAvatarEditorFromForm() {
    if (!this.form || !this.avatarEditor) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const expanded = formData.avatarEditor ?? {};
    this.avatarEditor = {
      id: expanded.id || this.avatarEditor.id || "",
      name: expanded.name || "",
      actorId: expanded.actorId || "",
      defaultImage: expanded.defaultImage || "",
      useCircularCrop: Boolean(expanded.useCircularCrop),
      circularCropScale: Math.max(0.7, Math.min(1.3, Number(expanded.circularCropScale) || 1)),
      frameFitScale: Math.max(0.6, Math.min(1.2, Number(expanded.frameFitScale) || 1)),
      frameImage: expanded.frameImage || "",
      showBackdrop: Boolean(expanded.showBackdrop),
      moodImages: expanded.moodImages && typeof expanded.moodImages === "object"
        ? expanded.moodImages
        : {}
    };
  }

  _onAvatarEditorPreviewInput() {
    this._syncAvatarEditorPreview();
  }

  _syncAvatarEditorPreview() {
    if (!this.form) return;

    const defaultImage = this.form.querySelector("[name='avatarEditor.defaultImage']")?.value?.trim?.() ?? "";
    const frameImage = this.form.querySelector("[name='avatarEditor.frameImage']")?.value?.trim?.() ?? "";
    const useCircularCrop = Boolean(this.form.querySelector("[name='avatarEditor.useCircularCrop']")?.checked);
    const showBackdrop = Boolean(this.form.querySelector("[name='avatarEditor.showBackdrop']")?.checked);
    const circularCropScale = Math.max(0.7, Math.min(1.3, Number(this.form.querySelector("[name='avatarEditor.circularCropScale']")?.value) || 1));
    const frameFitScale = Math.max(0.6, Math.min(1.2, Number(this.form.querySelector("[name='avatarEditor.frameFitScale']")?.value) || 1));

    this.form.querySelectorAll("[data-avatar-preview-value-for]").forEach((element) => {
      const field = element.dataset.avatarPreviewValueFor;
      if (!field || !field.startsWith("avatarEditor.")) return;
      const input = this.form.querySelector(`[name='${field}']`);
      if (!input) return;
      element.textContent = `${Number(input.value || 1).toFixed(2)}`;
    });

    const portrait = this.form.querySelector("[data-avatar-preview-portrait]");
    if (!portrait) return;

    portrait.classList.toggle("is-circular", useCircularCrop);
    portrait.classList.toggle("has-backdrop", showBackdrop && !useCircularCrop);
    portrait.style.setProperty("--tom-avatar-preview-crop-scale", String(circularCropScale));
    portrait.style.setProperty("--tom-avatar-preview-frame-fit-scale", String(frameFitScale));

    const stack = portrait.querySelector("[data-avatar-preview-stack]");
    let image = portrait.querySelector("[data-avatar-preview-image]");
    let placeholder = portrait.querySelector("[data-avatar-preview-placeholder]");
    if (defaultImage) {
      if (!image && stack) {
        image = document.createElement("img");
        image.className = "tom-avatar-preview-image";
        image.setAttribute("data-avatar-preview-image", "");
        image.alt = "";
        stack.appendChild(image);
      }
      if (image) image.setAttribute("src", defaultImage);
      placeholder?.remove();
    } else {
      image?.remove();
      image = null;
      if (!placeholder && stack) {
        placeholder = document.createElement("div");
        placeholder.className = "tom-avatar-preview-placeholder";
        placeholder.setAttribute("data-avatar-preview-placeholder", "");
        placeholder.textContent = tr("Avatar preview");
        stack.appendChild(placeholder);
      }
    }

    let frame = portrait.querySelector("[data-avatar-preview-frame]");
    if (frameImage) {
      if (!frame) {
        frame = document.createElement("img");
        frame.className = "tom-avatar-preview-frame";
        frame.setAttribute("data-avatar-preview-frame", "");
        frame.alt = "";
        portrait.appendChild(frame);
      }
      frame.setAttribute("src", frameImage);
    } else {
      frame?.remove();
    }
  }

  _clearSceneEditorDragState({ preserveDraggedAvatar = false } = {}) {
    this._resetSceneEditorTransientState();
    if (!preserveDraggedAvatar) {
      clearDraggedAvatarId();
    }
    this.element?.find(".tom-scene-dropzone").removeClass("is-dragover");
    this.element?.find(".tom-scene-actor-row").removeClass("is-dragover");
  }

  _onSwitchTab(event) {
    event.preventDefault();
    this._syncDraftMoodsFromForm();
    this._syncDraftThemeFromForm();
    this.activeTab = event.currentTarget.dataset.tab || "scenes";
    this._renderLibrary();
  }

  _onCreateScene(event) {
    event.preventDefault();
    this._openSceneEditor();
  }

  _syncSoundPlaylistEditorFromForm() {
    if (!this.form || !this.soundPlaylistEditor) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const expanded = formData.soundPlaylistEditor ?? {};
    const sceneIds = Array.isArray(expanded.sceneIds)
      ? expanded.sceneIds
      : (expanded.sceneIds ? [expanded.sceneIds] : []);
    const tracks = Array.isArray(expanded.tracks)
      ? expanded.tracks
      : (expanded.tracks && typeof expanded.tracks === "object" ? Object.values(expanded.tracks) : []);
    const soundboard = Array.isArray(expanded.soundboard)
      ? expanded.soundboard
      : (expanded.soundboard && typeof expanded.soundboard === "object" ? Object.values(expanded.soundboard) : []);

    this.soundPlaylistEditor = this._normalizeSoundPlaylistData({
      ...this.soundPlaylistEditor,
      id: expanded.id || this.soundPlaylistEditor.id || randomId(),
      name: expanded.name || "",
      sceneIds,
      tracks,
      soundboard
    });
  }

  _onCreateSoundPlaylist(event) {
    event.preventDefault();
    this._openSoundPlaylistEditor();
  }

  _onEditSoundPlaylist(event) {
    event.preventDefault();
    this._openSoundPlaylistEditor(event.currentTarget.dataset.playlistId);
  }

  async _onDeleteSoundPlaylist(event) {
    event.preventDefault();
    const playlistId = event.currentTarget.dataset.playlistId;
    if (!playlistId) return;
    await TheatreStore.deleteSoundPlaylist(playlistId);
    if (this.soundPlaylistEditor?.id === playlistId) {
      this._closeSoundPlaylistEditor();
    }
    this._renderLibrary();
  }

  _onCancelSoundPlaylistEditor(event) {
    event.preventDefault();
    this._closeSoundPlaylistEditor();
    this._renderLibrary();
  }

  async _onSaveSoundPlaylistEditor(event) {
    event.preventDefault();
    this._syncSoundPlaylistEditorFromForm();
    if (!this.soundPlaylistEditor) return;
    await TheatreStore.upsertSoundPlaylist(this.soundPlaylistEditor);
    this._closeSoundPlaylistEditor();
    ui.notifications?.info(tr("Sound playlist saved."));
    this._renderLibrary();
  }

  _onAddSoundTrack(event) {
    event.preventDefault();
    if (!this.soundPlaylistEditor) return;
    this._syncSoundPlaylistEditorFromForm();
    this.soundPlaylistEditor.tracks.unshift(this._normalizeSoundEntry({ id: randomId(), sourceType: "file" }));
    this._renderLibrary();
  }

  _onRemoveSoundTrack(event) {
    event.preventDefault();
    if (!this.soundPlaylistEditor) return;
    this._syncSoundPlaylistEditorFromForm();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.soundPlaylistEditor.tracks.splice(index, 1);
    this._renderLibrary();
  }

  _onAddSoundboardItem(event) {
    event.preventDefault();
    if (!this.soundPlaylistEditor) return;
    this._syncSoundPlaylistEditorFromForm();
    if ((this.soundPlaylistEditor.soundboard?.length ?? 0) >= 10) {
      ui.notifications?.warn(tr("A playlist can contain at most 10 soundboard sounds."));
      return;
    }
    this.soundPlaylistEditor.soundboard.unshift(this._normalizeSoundEntry({ id: randomId(), sourceType: "file" }));
    this._renderLibrary();
  }

  _onRemoveSoundboardItem(event) {
    event.preventDefault();
    if (!this.soundPlaylistEditor) return;
    this._syncSoundPlaylistEditorFromForm();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.soundPlaylistEditor.soundboard.splice(index, 1);
    this._renderLibrary();
  }

  _onSoundPlaylistEditorFieldChanged(event) {
    this._syncSoundPlaylistEditorFromForm();
    const fieldName = String(event?.currentTarget?.name || "");
    if (fieldName.endsWith(".sourceType")) {
      this._renderLibrary();
      return;
    }
    if (fieldName.endsWith(".playlistId")) {
      this._refreshSoundSourceOptionsForRow(event.currentTarget);
    }
  }

  _refreshSoundSourceOptionsForRow(field) {
    const row = field?.closest?.(".tom-sound-entry-row");
    if (!row) return;
    const playlistSelect = row.querySelector("select[name$='.playlistId']");
    const soundSelect = row.querySelector("select[name$='.soundId']");
    if (!(playlistSelect instanceof HTMLSelectElement) || !(soundSelect instanceof HTMLSelectElement)) return;

    const playlist = game.playlists?.get?.(playlistSelect.value) ?? null;
    const options = (playlist?.sounds?.contents ?? []).map((sound) => ({
      value: sound.id,
      label: sound.name || sound.path || tr("Playlist sound")
    }));
    const previousValue = soundSelect.value;
    soundSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = tr("Choose sound");
    soundSelect.appendChild(placeholder);

    options.forEach((option) => {
      const nextOption = document.createElement("option");
      nextOption.value = option.value;
      nextOption.textContent = option.label;
      if (option.value === previousValue) nextOption.selected = true;
      soundSelect.appendChild(nextOption);
    });

    if (![...soundSelect.options].some((option) => option.selected)) {
      soundSelect.value = "";
    }
  }

  _onEditScene(event) {
    event.preventDefault();
    this._openSceneEditor(event.currentTarget.dataset.sceneId);
  }

  async _onSaveSceneEditor(event) {
    event.preventDefault();
    this._syncSceneEditorFromForm();
    const scene = this.sceneEditor;
    if (!scene) return;

    const actors = this.sceneEditorActors
      .map((sceneActor) => this._normalizeSceneActorEntry(sceneActor))
      .filter((sceneActor) => sceneActor.actorId || sceneActor.imageOverride);

    if (actors.some((sceneActor) => !Number.isFinite(sceneActor.scale) || sceneActor.scale <= 0)) {
      ui.notifications?.error(tr("Scale must be greater than 0."));
      return;
    }

    await TheatreStore.upsertScene({
      id: scene.id,
      name: scene.name,
      stageTitle: scene.stageTitle,
      stageSubtitle: scene.stageSubtitle,
      description: scene.description,
      location: scene.location,
      tags: scene.tags,
      background: scene.background,
      thumbnail: scene.thumbnail || "",
      actors,
      settings: scene.settings
    });
    await TheatreStore.setSceneSoundPlaylistAssignments(scene.id, this.sceneEditorSoundPlaylistIds);

    this._closeSceneEditor();
    ui.notifications?.info(tr("Footlights scene saved."));
    this._renderLibrary();
  }

  _onCancelSceneEditor(event) {
    event.preventDefault();
    this._closeSceneEditor();
    this._renderLibrary();
  }

  _onSceneActorConfigChanged() {
    this._mutateSceneEditorActors();
  }

  _onRemoveSceneActor(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this._mutateSceneEditorActors(() => {
      this.sceneEditorActors.splice(index, 1);
    });
  }

  _onPickImage(event) {
    event.preventDefault();
    openImagePickerForInput(this.form, event.currentTarget.dataset.target, event.currentTarget.dataset.pickerType || "image");
    window.setTimeout(() => this._syncAvatarEditorPreview(), 0);
  }

  _onSceneEditorAvatarDragStart(event) {
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;
    setAvatarDragData(event, avatarId);
  }

  _onSceneEditorAvatarDragEnd() {
    clearDraggedAvatarId();
  }

  _onAddAvatarToSceneEditor(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;

    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return;

    this._mutateSceneEditorActors(() => {
      this.sceneEditorActors.push(this._createSceneEditorActorEntry(avatar.id, avatar.actorId || ""));
    });
  }

  async _onCreateSceneEditorActorAvatar(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;

    this._syncSceneEditorFromForm();
    const entry = this.sceneEditorActors[index];
    if (!entry || (entry.avatarId && TheatreStore.getAvatarById(entry.avatarId))) return;

    const avatar = await TheatreStore.upsertAvatar(this._buildAvatarFromSceneActor(entry));
    this._mutateSceneEditorActors(() => {
      this._applyAvatarToSceneEditorActor(index, avatar.id);
    });
    this._openAvatarEditor(avatar.id);
  }

  _onSceneEditorDropzoneDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this._clearSceneEditorDragState({ preserveDraggedAvatar: true });
    this.sceneEditorDropzoneActive = true;
    event.currentTarget.classList.add("is-dragover");
    if (event.originalEvent?.dataTransfer) {
      event.originalEvent.dataTransfer.dropEffect = "copy";
    }
  }

  _onSceneEditorDropzoneDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("is-dragover");
    this.sceneEditorDropzoneActive = false;
  }

  async _onSceneEditorDropzoneDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const payload = extractAvatarDropData(event);
    if (!payload?.avatarId) {
      const droppedDocument = await resolveFoundryDocumentDrop(event);
      if (droppedDocument?.actor) {
        const tokenEntry = this._createTokenSceneActorEntry(droppedDocument);
        this._mutateSceneEditorActors(() => {
          if (tokenEntry) this.sceneEditorActors.push(tokenEntry);
        }, { clearDragState: true });
        return;
      }
      this._mutateSceneEditorActors(null, { clearDragState: true });
      return;
    }

    const avatar = TheatreStore.getAvatarById(payload.avatarId);
    if (!avatar) {
      this._mutateSceneEditorActors(null, { clearDragState: true });
      return;
    }

    this._mutateSceneEditorActors(() => {
      this.sceneEditorActors.push(this._createSceneEditorActorEntry(avatar.id, avatar.actorId || ""));
    }, { clearDragState: true });
  }

  _onSceneEditorActorRowDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.sceneEditorActorIndex);
    this._clearSceneEditorDragState({ preserveDraggedAvatar: true });
    this.sceneEditorDragOverIndex = index;
    event.currentTarget.classList.add("is-dragover");
    if (event.originalEvent?.dataTransfer) {
      event.originalEvent.dataTransfer.dropEffect = "copy";
    }
  }

  _onSceneEditorActorRowDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("is-dragover");
    this.sceneEditorDragOverIndex = null;
  }

  async _onSceneEditorActorRowDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.sceneEditorActorIndex);
    const payload = extractAvatarDropData(event);

    if (!Number.isInteger(index)) {
      this._mutateSceneEditorActors(null, { clearDragState: true });
      return;
    }

    if (!payload?.avatarId) {
      const droppedDocument = await resolveFoundryDocumentDrop(event);
      if (droppedDocument?.actor) {
        this._mutateSceneEditorActors(() => {
          const tokenEntry = this._createTokenSceneActorEntry(droppedDocument);
          if (tokenEntry) this.sceneEditorActors[index] = tokenEntry;
        }, { clearDragState: true });
        return;
      }
      this._mutateSceneEditorActors(null, { clearDragState: true });
      return;
    }

    this._mutateSceneEditorActors(() => {
      this._applyAvatarToSceneEditorActor(index, payload.avatarId);
    }, { clearDragState: true });
  }

  async _onActivateScene(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const sceneId = event.currentTarget.dataset.sceneId;
    const button = event.currentTarget;
    let activated = false;

    try {
      button.disabled = true;
      activated = await this.manager.activateScene(sceneId);

      if (!activated) {
      ui.notifications?.warn(tr("Footlights Scene could not be activated cleanly and was reset."));
        return;
      }

      const activeScene = TheatreStore.getSceneById(sceneId);
      if (!activeScene?.actors?.length) {
        ui.notifications?.warn(tr("Scene activated, but no actors are assigned yet."));
      } else if (!this.manager.isSceneRevealedToPlayers(sceneId)) {
        ui.notifications?.info(tr("Footlights Scene \"{name}\" is prepared for the GM. Players will only see it after it is revealed from the GM bar.", { name: activeScene.name }));
      } else {
        ui.notifications?.info(tr("Footlights Scene \"{name}\" is active.", { name: activeScene.name }));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Scene activation failed`, error);
      ui.notifications?.error(tr("Footlights Scene could not be activated. Details are available in the browser console."));
    } finally {
      button.disabled = false;
      this._renderLibrary();
    }
  }

  async _onDeactivateScene(event) {
    event.preventDefault();
    await this.manager.deactivateScene();
    ui.notifications?.info(tr("Footlights Scene ended."));
    this._renderLibrary();
  }

  async _onDeleteScene(event) {
    event.preventDefault();
    const sceneId = event.currentTarget.dataset.sceneId;
    await TheatreStore.deleteScene(sceneId);
    this._renderLibrary();
  }

  async _onDuplicateScene(event) {
    event.preventDefault();
    const sceneId = event.currentTarget.dataset.sceneId;
    const scene = await TheatreStore.duplicateScene(sceneId);
    if (!scene) {
      ui.notifications?.warn(tr("Footlights Scene could not be duplicated."));
      return;
    }

    ui.notifications?.info(tr("Footlights Scene \"{name}\" was duplicated.", { name: scene.name }));
    this._renderLibrary();
  }

  async _onSaveMoods(event) {
    event.preventDefault();
    this._syncDraftMoodsFromForm();
    this._syncDraftThemeFromForm();
    const selectedLanguage = String(this.form?.querySelector("[name='settings.language']")?.value || TheatreStore.getLanguage()).trim();
    const moods = this.draftMoods ?? [];
    const theme = this.draftTheme ?? TheatreStore.getThemeState();
    await TheatreStore.saveLanguage(selectedLanguage);
    await setActiveLanguage(selectedLanguage);
    await TheatreStore.saveMoodPresets(moods);
    await TheatreStore.saveThemeState(theme);
    this.draftMoods = null;
    this.draftTheme = null;
    ui.notifications?.info(tr("Settings saved."));
    Object.values(ui.windows ?? {}).forEach((app) => app?.render?.(false));
    game.modules.get(MODULE_ID)?.api?.renderStageGoblin?.();
    ui.controls?.render?.(false);
    this._renderLibrary();
  }

  _onDragAvatarStart(event) {
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;
    setAvatarDragData(event, avatarId);
  }

  _onDragAvatarEnd() {
    clearDraggedAvatarId();
  }

  _onDragSceneStart(event) {
    const sceneId = event.currentTarget.dataset.sceneId;
    if (!sceneId) return;
    setTheatreSceneDragData(event, sceneId);
  }

  async _onAvatarLibraryDefaultsChanged() {
    if (!this.form) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    await TheatreStore.saveAvatarLibraryState(formData.avatarLibrary ?? {});
    this._renderLibrary();
  }

  _onCreateAvatar(event) {
    event.preventDefault();
    this._openAvatarEditor();
  }

  _onEditAvatar(event) {
    event.preventDefault();
    this._openAvatarEditor(event.currentTarget.dataset.avatarId);
  }

  async _onSaveAvatarEditor(event) {
    event.preventDefault();
    this._syncAvatarEditorFromForm();
    const avatar = this.avatarEditor;
    if (!avatar) return;

    await TheatreStore.upsertAvatar({
      id: avatar.id,
      name: avatar.name,
      actorId: avatar.actorId,
      defaultImage: avatar.defaultImage,
      useCircularCrop: avatar.useCircularCrop,
      circularCropScale: avatar.circularCropScale,
      frameFitScale: avatar.frameFitScale,
      frameImage: avatar.frameImage,
      showBackdrop: avatar.showBackdrop,
      moodImages: avatar.moodImages
    });

    this._closeAvatarEditor();
    ui.notifications?.info(tr("Footlights avatar saved."));
    this._renderLibrary();
  }

  _onCancelAvatarEditor(event) {
    event.preventDefault();
    this._closeAvatarEditor();
    this._renderLibrary();
  }

  async _onDeleteAvatar(event) {
    event.preventDefault();
    const avatarId = event.currentTarget.dataset.avatarId;
    await TheatreStore.deleteAvatar(avatarId);
    this._renderLibrary();
  }

  async _onOpenMindmap(event) {
    event.preventDefault();
    const plannerId = event.currentTarget.dataset.plannerId || null;
    if (plannerId) {
      await TheatreStore.setActiveAdventurePlanner(plannerId);
    }
    this._openInlinePlanner(plannerId);
  }

  _onCloseInlineMindmap(event) {
    event.preventDefault();
    this._closeInlinePlanner();
  }

  _onCreatePlanner(event) {
    event.preventDefault();
    this._openPlannerConfig();
  }

  _onEditPlanner(event) {
    event.preventDefault();
    this._openPlannerConfig(event.currentTarget.dataset.plannerId);
  }

  async _onDuplicatePlanner(event) {
    event.preventDefault();
    const planner = await TheatreStore.duplicateAdventurePlanner(event.currentTarget.dataset.plannerId);
    if (planner) {
      ui.notifications?.info(tr("Adventure Planner \"{name}\" was duplicated.", { name: planner.name }));
      this._renderLibrary();
    }
  }

  async _onDeletePlanner(event) {
    event.preventDefault();
    await TheatreStore.deleteAdventurePlanner(event.currentTarget.dataset.plannerId);
    this._renderLibrary();
  }

  _onCreateMap(event) {
    event.preventDefault();
    this._openWorldMapConfig();
  }

  _onEditMap(event) {
    event.preventDefault();
    this._openWorldMapConfig(event.currentTarget.dataset.mapId);
  }

  _onCancelMapEditor(event) {
    event.preventDefault();
    this._closeMapEditor();
    this._renderLibrary();
  }

  async _onSaveMapEditor(event) {
    event.preventDefault();
    if (!this.mapConfigEditor) return;
    this.mapConfigEditor.setInlineForm(this.form);
    await this.mapConfigEditor.saveInline();
    this._closeMapEditor();
    this._renderLibrary();
  }

  async _onOpenWorldMap(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    if (!mapId) return;
    await TheatreStore.setActiveWorldMap(mapId);
    game.modules.get(MODULE_ID)?.api?.openWorldMap?.(mapId);
  }

  async _onOpenWorldMapStage(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    if (!mapId) return;
    await TheatreStore.setActiveWorldMap(mapId);
    game.modules.get(MODULE_ID)?.api?.openWorldMapStage?.(mapId);
  }

  async _onDuplicateMap(event) {
    event.preventDefault();
    const map = await TheatreStore.duplicateWorldMap(event.currentTarget.dataset.mapId);
    if (map) {
      ui.notifications?.info(tr("World map \"{name}\" was duplicated.", { name: map.name }));
      this._renderLibrary();
    }
  }

  async _onDeleteMap(event) {
    event.preventDefault();
    await TheatreStore.deleteWorldMap(event.currentTarget.dataset.mapId);
    this._renderLibrary();
  }

  async _onCreateMapMacro(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(mapId);
    if (!worldMap) return;
    const macro = await Macro.create({
      name: tr("Map: {name}", { name: worldMap.name }),
      type: "script",
      scope: "global",
      img: "icons/svg/map.svg",
      command: `game.modules.get("${MODULE_ID}")?.api?.openWorldMap("${worldMap.id}");`
    });
    if (macro) ui.notifications?.info(tr("Map macro created."));
  }

  async _onCreateMapStageMacro(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(mapId);
    if (!worldMap) return;
    const macro = await Macro.create({
      name: tr("Fullscreen map: {name}", { name: worldMap.name }),
      type: "script",
      scope: "global",
      img: "icons/svg/map.svg",
      command: `game.modules.get("${MODULE_ID}")?.api?.openWorldMapStage("${worldMap.id}");`
    });
    if (macro) ui.notifications?.info(tr("Fullscreen map macro created."));
  }

  async close(options) {
    clearTimeout(this._windowResizeClassTimeout);
    this._windowResizeClassTimeout = null;
    this.inlinePlannerApp?._setResizeVisualState?.(false);
    this._teardownThemeLayoutObservers();
    return super.close(options);
  }

  async _updateObject() {}
}
