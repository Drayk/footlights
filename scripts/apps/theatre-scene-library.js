import { MODULE_ID, SCENE_TRANSITION_EFFECTS } from "../constants.js";
import {
  applyThemeInlineStyleToHost,
  animateFootlightsToggleSwitch,
  bindFootlightsToggleSwitches,
  clearDraggedAvatarId,
  buildThemeInlineStyle,
  duplicateData,
  escapeHtml,
  extractFoundryDocumentDropData,
  extractAvatarDropData,
  resolveFoundryDocumentDrop,
  getActorById,
  isVideoMediaPath,
  normalizeSceneTags,
  openImagePickerForInput,
  randomId,
  scheduleTheatreDialogTheme,
  setAvatarDragData,
  setPortalDragData,
  setWorldMapDragData,
  setTheatreSceneDragData
} from "../helpers.js";
import { getLanguageOptions, setActiveLanguage, translate as tr } from "../localization.js";
import { sanitizePortalCustomHtml, scopePortalCustomCss } from "../portal-content-utils.js";
import { TheatreStore } from "../store.js";
import { TheatreAdventurePlannerConfigApplication } from "./theatre-adventure-planner-config.js";
import { TheatreMindmapApplication } from "./theatre-mindmap.js";
import { TheatreWorldMapConfigApplication } from "./theatre-world-map-config.js";

const AVATAR_CROP_OFFSET_BASE = 220;
const PORTAL_ELEMENT_POSITION_MIN = -100;
const PORTAL_ELEMENT_POSITION_MAX = 200;
const PORTAL_ELEMENT_SIZE_MIN = 1;
const PORTAL_ELEMENT_SIZE_MAX = 200;
const FOOTLIGHTS_MACRO_ICON = "icons/svg/dice-target.svg";
const WORLD_MAP_PACKAGE_FILE = "footlights-map.json";
const WORLD_MAP_PACKAGE_TYPE = "footlights-world-map-package";

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function stringToBytes(value = "") {
  return new TextEncoder().encode(String(value ?? ""));
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function zipCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZipUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeZipUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function createZipHeader(size) {
  return new Uint8Array(size);
}

function getZipDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function createStoredZip(entries = []) {
  const files = [];
  const central = [];
  let offset = 0;
  const { dosDate, dosTime } = getZipDosDateTime();

  for (const entry of entries) {
    const nameBytes = stringToBytes(entry.name);
    const dataBytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
    const crc = zipCrc32(dataBytes);
    const local = createZipHeader(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    writeZipUint32(localView, 0, 0x04034b50);
    writeZipUint16(localView, 4, 20);
    writeZipUint16(localView, 6, 0x0800);
    writeZipUint16(localView, 8, 0);
    writeZipUint16(localView, 10, dosTime);
    writeZipUint16(localView, 12, dosDate);
    writeZipUint32(localView, 14, crc);
    writeZipUint32(localView, 18, dataBytes.length);
    writeZipUint32(localView, 22, dataBytes.length);
    writeZipUint16(localView, 26, nameBytes.length);
    local.set(nameBytes, 30);
    files.push(local, dataBytes);

    const directory = createZipHeader(46 + nameBytes.length);
    const directoryView = new DataView(directory.buffer);
    writeZipUint32(directoryView, 0, 0x02014b50);
    writeZipUint16(directoryView, 4, 20);
    writeZipUint16(directoryView, 6, 20);
    writeZipUint16(directoryView, 8, 0x0800);
    writeZipUint16(directoryView, 10, 0);
    writeZipUint16(directoryView, 12, dosTime);
    writeZipUint16(directoryView, 14, dosDate);
    writeZipUint32(directoryView, 16, crc);
    writeZipUint32(directoryView, 20, dataBytes.length);
    writeZipUint32(directoryView, 24, dataBytes.length);
    writeZipUint16(directoryView, 28, nameBytes.length);
    writeZipUint32(directoryView, 42, offset);
    directory.set(nameBytes, 46);
    central.push(directory);
    offset += local.length + dataBytes.length;
  }

  const centralBytes = concatBytes(central);
  const end = createZipHeader(22);
  const endView = new DataView(end.buffer);
  writeZipUint32(endView, 0, 0x06054b50);
  writeZipUint16(endView, 8, entries.length);
  writeZipUint16(endView, 10, entries.length);
  writeZipUint32(endView, 12, centralBytes.length);
  writeZipUint32(endView, 16, offset);
  return new Blob([...files, centralBytes, end], { type: "application/zip" });
}

function readStoredZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(tr("Map package is not a valid ZIP file."));
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = bytesToString(bytes.slice(nameStart, nameStart + nameLength)).replaceAll("\\", "/");
    if (dataEnd > bytes.length) throw new Error(tr("Map package is truncated."));
    if (compression !== 0) throw new Error(tr("This map package uses unsupported ZIP compression."));
    const data = bytes.slice(dataStart, dataEnd);
    if (data.length !== uncompressedSize) throw new Error(tr("Map package contains an invalid file."));
    if (name && !name.endsWith("/")) entries.set(name, data);
    offset = dataEnd;
  }
  return entries;
}

function sanitizePackageFileName(value = "world-map") {
  return String(value || "world-map")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "world-map";
}

function normalizePortalBackgroundFit(value) {
  const fit = String(value || "").trim();
  return ["contain", "cover", "fill", "none"].includes(fit) ? fit : "contain";
}

function normalizePortalBackgroundRepeat(value) {
  const repeat = String(value || "").trim();
  return ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(repeat) ? repeat : "no-repeat";
}

function normalizePortalBackgroundPositionMode(value) {
  return String(value || "").trim() === "custom" ? "custom" : "center";
}

function clampPortalPercent(value, fallback = 50) {
  const numeric = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : fallback));
}

function escapePortalStyleUrl(path = "") {
  return String(path || "").trim().replaceAll("\\", "/").replaceAll("\"", "\\\"");
}

function normalizePortalOpenMode(value) {
  const mode = String(value || "").trim();
  return ["stage", "fullscreen"].includes(mode) ? "stage" : "window";
}

function cropOffsetToPercent(value) {
  const offset = Math.max(-160, Math.min(160, Number(value) || 0));
  return `${((offset / AVATAR_CROP_OFFSET_BASE) * 100).toFixed(3)}%`;
}

function getFirstAvatarImagePath(values = []) {
  return values
    .flat()
    .map((path) => String(path || "").trim())
    .find(Boolean) || "";
}

function getAvatarMoodImageFallback(avatar = {}) {
  return Object.values(avatar?.moodImages ?? {})
    .map((path) => String(path || "").trim())
    .find(Boolean) || "";
}

function getAvatarPrimaryImage(avatar = {}, actor = null, mood = "", fallbackImage = "") {
  return getFirstAvatarImagePath([
    avatar?.moodImages?.[mood],
    avatar?.defaultImage,
    avatar?.image,
    avatar?.thumbnail,
    avatar?.img,
    avatar?.imagePath,
    avatar?.texture?.src,
    avatar?.prototypeToken?.texture?.src,
    getAvatarMoodImageFallback(avatar),
    actor?.img,
    fallbackImage
  ]);
}

function getAvatarLibraryThumbnail(avatar = {}, actor = null, fallbackImage = "") {
  return getFirstAvatarImagePath([
    avatar?.defaultImage,
    avatar?.image,
    avatar?.thumbnail,
    avatar?.img,
    avatar?.imagePath,
    avatar?.texture?.src,
    avatar?.prototypeToken?.texture?.src,
    actor?.img,
    getAvatarMoodImageFallback(avatar),
    fallbackImage
  ]);
}

function buildAvatarImageStackStyle(imagePath = "") {
  const path = String(imagePath || "").trim();
  if (!path) return "";
  const escapedPath = path.replaceAll("\\", "/").replaceAll("\"", "\\\"");
  return [
    `background-image:url("${escapedPath}")`,
    "background-position:center center",
    "background-repeat:no-repeat",
    "background-size:contain"
  ].join(";");
}

function formatPortalDataTextValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => formatPortalDataTextValue(entry)).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function collectPortalActorDataPaths(source = {}, prefix = "system", depth = 0, results = []) {
  if (!source || typeof source !== "object" || depth > 5 || results.length >= 180) return results;
  const entries = Object.entries(source).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    if (key.startsWith("_") || typeof value === "function") continue;
    const path = `${prefix}.${key}`;
    if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) {
      results.push({ path, value: formatPortalDataTextValue(value) });
    } else if (Array.isArray(value)) {
      results.push({ path, value: formatPortalDataTextValue(value) });
    } else if (typeof value === "object") {
      collectPortalActorDataPaths(value, path, depth + 1, results);
    }
    if (results.length >= 180) break;
  }
  return results;
}

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
    this.portalEditor = null;
    this.portalEditorSelectedElementId = null;
    this.portalEditorSidebarTab = "general";
    this.portalEditorContextMenu = null;
    this.portalEditorZoom = 1;
    this.portalEditorPanX = 0;
    this.portalEditorPanY = 0;
    this.portalEditorShowObjectFrames = false;
    this.portalEditorCropMode = false;
    this._portalEditorOpenFieldsets = new Set(["general-elements"]);
    this._portalEditorSkipNextDisclosureCapture = false;
    this._portalEditorOpenEffectSubsections = new Set();
    this._portalEditorDragState = null;
    this._portalEditorSuppressNextCanvasClick = false;
    this._portalEditorResizeObserver = null;
    this._onPortalEditorWindowResize = null;
    this._onPortalEditorPointerMove = this._onPortalEditorPointerMove.bind(this);
    this._onPortalEditorPointerUp = this._onPortalEditorPointerUp.bind(this);
    this._portalEffectDragId = null;
    this._portalContentLayerDragId = null;
    this._portalContentLayerDrafts = new Map();
    this.inlinePlannerId = null;
    this.inlinePlannerApp = null;
    this.sceneLibraryView = "list";
    this.librarySearchQueries = {
      scenes: "",
      avatars: "",
      sounds: "",
      maps: "",
      portals: ""
    };
    this._windowResizeClassTimeout = null;
    this._stageGoblinSetupSaveTimeout = null;
    this._stageGoblinTargetMenu = null;
    this._onStageGoblinTargetMenuPointerDown = this._onStageGoblinTargetMenuPointerDown.bind(this);
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
      { id: "portals", label: tr("Portals"), icon: "fas fa-door-open", isActive: this.activeTab === "portals" },
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
    const portalSearchQuery = this._getLibrarySearchQuery("portals");

    const soundPlaylists = TheatreStore.getSoundPlaylists().map((playlist) => ({
      ...playlist,
      trackCount: Array.isArray(playlist.tracks) ? playlist.tracks.length : 0,
      soundboardCount: Array.isArray(playlist.soundboard) ? playlist.soundboard.length : 0,
      sceneCount: Array.isArray(playlist.sceneIds) ? playlist.sceneIds.length : 0
    })).filter((playlist) => this._matchesSoundPlaylistSearch(playlist, soundSearchQuery));
    const avatars = TheatreStore.getAvatars().map((avatar) => {
      const actor = getActorById(avatar.actorId);
      const thumbnail = getAvatarLibraryThumbnail(avatar, actor);
      return {
        ...avatar,
        actorName: actor?.name || tr("No actor"),
        moodCount: Object.keys(avatar.moodImages ?? {}).length,
        thumbnail,
        thumbnailStyle: this._buildAvatarThumbnailStyle(avatar),
        hasAvatarThumbnail: Boolean(thumbnail)
      };
    }).filter((avatar) => this._matchesAvatarSearch(avatar, avatarSearchQuery));
    const activeWorldMapId = TheatreStore.getActiveWorldMap()?.id ?? null;
    const worldMaps = TheatreStore.getWorldMaps().map((worldMap) => ({
      ...worldMap,
      pinCount: Array.isArray(worldMap.pins) ? worldMap.pins.length : 0,
      hasTiles: Boolean(worldMap.tileUrlTemplate),
      isActive: activeWorldMapId === worldMap.id
    })).filter((worldMap) => this._matchesMapSearch(worldMap, mapSearchQuery));
    const activePortalId = TheatreStore.getActivePortal()?.id ?? null;
    const openPortalState = this._getOpenPortalAppState();
    const portals = TheatreStore.getPortals().map((portal) => ({
      ...portal,
      elementCount: Array.isArray(portal.elements) ? portal.elements.length : 0,
      thumbnail: portal.thumbnail || (portal.backgroundType !== "video" ? portal.background : ""),
      isVideoThumbnailFallback: !portal.thumbnail && portal.backgroundType === "video",
      isActive: activePortalId === portal.id,
      isWindowOpen: openPortalState.windowPortalId === portal.id,
      isStageOpen: openPortalState.stagePortalId === portal.id
    })).filter((portal) => this._matchesPortalSearch(portal, portalSearchQuery));
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
    const sceneBackgroundFullscreenFitOptions = [
      { value: "width", label: tr("Fit width") },
      { value: "height", label: tr("Fit height") }
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
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const stageGoblinTagColors = ["#8db4db", "#86d18f", "#f2c778", "#b298ff", "#ff85b6"];
    const stageGoblinTagPositionOptions = [
      { value: "left", label: tr("Left") },
      { value: "top-left", label: tr("Top left") },
      { value: "bottom-left", label: tr("Bottom left") },
      { value: "right", label: tr("Right") },
      { value: "top-right", label: tr("Top right") },
      { value: "bottom-right", label: tr("Bottom right") }
    ];
    const normalizeAlpha = (value, fallback = 1) => {
      const numeric = Number(value);
      const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
      const alpha = resolved > 1 ? resolved / 100 : resolved;
      return Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    };
    const stageGoblinSetupBars = Array.from({ length: 5 }, (_entry, index) => {
      const existingBar = stageGoblinState.bars[index] ?? {};
      const tagPosition = String(existingBar.tagPosition || "left").trim();
      const orientation = String(existingBar.orientation || "horizontal").trim() === "vertical" ? "vertical" : "horizontal";
      const surfaceColor = existingBar.surfaceColor || themeState.stageGoblin.surface.color;
      const borderColor = existingBar.borderColor || themeState.stageGoblin.border.color;
      const iconColor = existingBar.iconColor || themeState.stageGoblin.icon.color;
      const textColor = existingBar.textColor || themeState.stageGoblin.text?.color || themeState.content.text.color;
      const surfaceAlpha = normalizeAlpha(existingBar.surfaceAlpha ?? themeState.stageGoblin.surface.alpha ?? 1);
      const borderAlpha = normalizeAlpha(existingBar.borderAlpha ?? themeState.stageGoblin.border.alpha ?? 1);
      const iconAlpha = normalizeAlpha(existingBar.iconAlpha ?? themeState.stageGoblin.icon.alpha ?? 1);
      const textAlpha = normalizeAlpha(existingBar.textAlpha ?? themeState.stageGoblin.text?.alpha ?? 1);
      const tagAlpha = normalizeAlpha(existingBar.tagAlpha ?? 1);
      const tagTextAlpha = normalizeAlpha(existingBar.tagTextAlpha ?? 1);
      return {
        id: existingBar.id || `bar-${index + 1}`,
        label: existingBar.label || tr("Stage Goblin Bar {number}", { number: index + 1 }),
        tagColor: existingBar.tagColor || stageGoblinTagColors[index] || "#8db4db",
        tagAlpha,
        tagAlphaPercent: Math.round(tagAlpha * 100),
        tagTextColor: existingBar.tagTextColor || "#0d1722",
        tagTextAlpha,
        tagTextAlphaPercent: Math.round(tagTextAlpha * 100),
        tagPosition,
        orientation,
        isVertical: orientation === "vertical",
        verticalItemHeight: Number(existingBar.verticalItemHeight ?? 38),
        showLabel: existingBar.showLabel !== false,
        surfaceColor,
        surfaceAlpha,
        surfaceAlphaPercent: Math.round(surfaceAlpha * 100),
        borderColor,
        borderAlpha,
        borderAlphaPercent: Math.round(borderAlpha * 100),
        iconColor,
        iconAlpha,
        iconAlphaPercent: Math.round(iconAlpha * 100),
        textColor,
        textAlpha,
        textAlphaPercent: Math.round(textAlpha * 100),
        borderWidth: Number(existingBar.borderWidth ?? themeState.stageGoblin.borderWidth ?? 1),
        radius: Number(existingBar.radius ?? themeState.stageGoblin.radius ?? 11),
        fontSize: Number(existingBar.fontSize ?? this._resolveTypographyPresetSize(themeState.typography, themeState.stageGoblin.fontPreset) ?? 0.82),
        iconSize: Number(existingBar.iconSize ?? themeState.stageGoblin.iconSize ?? 0.92),
        tagFontSize: Number(existingBar.tagFontSize ?? themeState.stageGoblin.tagFontSize ?? 0.62),
        tagHeight: Number(existingBar.tagHeight ?? themeState.stageGoblin.tagHeight ?? 26),
        tagWidth: Number(existingBar.tagWidth ?? themeState.stageGoblin.tagWidth ?? 92),
        tagRadius: Number(existingBar.tagRadius ?? themeState.stageGoblin.tagRadius ?? 4),
        tagGlowEnabled: existingBar.tagGlowEnabled !== false,
        tagGlowBlur: Number(existingBar.tagGlowBlur ?? themeState.stageGoblin.tagGlowBlur ?? 14),
        isSelected: this.activeThemeItemKey === `stageGoblin.setup.${index}`,
        tagPositionOptions: stageGoblinTagPositionOptions.map((option) => ({
          ...option,
          isSelected: option.value === tagPosition
        })),
        number: index + 1,
        isVisibleInSetup: index < stageGoblinState.barCount
      };
    });
    const inlinePlannerHtml = this.activeTab === "mindmap" && this.inlinePlannerId
      ? await this._getInlinePlannerHtml()
      : "";
    const mapEditorHtml = this.activeTab === "maps" && this.mapConfigEditor
      ? await this._getInlineMapEditorHtml()
      : "";
    const headerContext = this._getHeaderContext();
    const navigationSurfaceMediaStyle = this._buildNavigationSurfaceMediaStyle(themeState);
    const libraryLogoSrc = this._getLibraryLogoSrc(themeState);

    const scenes = TheatreStore.getScenes().map((scene) => ({
      ...scene,
      actorCount: scene.actors.length,
      isActive: activeSceneId === scene.id,
      description: String(scene.description || "").trim(),
      location: String(scene.location || "").trim(),
      tags: normalizeSceneTags(scene.tags),
      thumbnail: scene.thumbnail || (!isVideoMediaPath(scene.background) ? (scene.background || this._getSceneFallbackThumbnail(scene)) : ""),
      isVideoThumbnailFallback: !scene.thumbnail && isVideoMediaPath(scene.background)
    })).filter((scene) => this._matchesSceneSearch(scene, sceneSearchQuery));

    return {
      themeInlineStyle: this._buildThemeInlineStyle(themeState),
      navigationSurfaceMediaStyle,
      libraryLogoSrc,
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
      isGM: Boolean(game.user?.isGM),
      isScenesTab: this.activeTab === "scenes",
      isAvatarsTab: this.activeTab === "avatars",
      isSoundsTab: this.activeTab === "sounds",
      isMapsTab: this.activeTab === "maps",
      isPortalsTab: this.activeTab === "portals",
      isMapEditorActive: this.activeTab === "maps" && Boolean(this.mapConfigEditor),
      isPortalEditorActive: this.activeTab === "portals" && Boolean(this.portalEditor),
      mapEditorHtml,
      isMindmapTab: this.activeTab === "mindmap",
      isSettingsTab: this.activeTab === "settings",
      showLibrarySearch: ["scenes", "avatars", "sounds", "maps", "portals"].includes(this.activeTab)
        && !this.sceneEditor
        && !this.avatarEditor
        && !this.soundPlaylistEditor
        && !this.mapConfigEditor
        && !this.portalEditor,
      librarySearchValue: this._getLibrarySearchQuery(this.activeTab),
      librarySearchPlaceholder: this._getLibrarySearchPlaceholder(),
      moods: moodSlots,
      stageGoblinSetup: {
        barCount: stageGoblinState.barCount,
        showLabels: stageGoblinState.showLabels !== false,
        bars: stageGoblinSetupBars
      },
      sceneCount: scenes.length,
      avatarCount: avatars.length,
      mapCount: worldMaps.length,
      portalCount: portals.length,
      avatars,
      worldMaps,
      portals,
      portalEditor: this.portalEditor,
      portalEditorElements: this._getPortalEditorElementRows(),
      portalEditorSelectedElement: this._getPortalEditorSelectedElementData(),
      portalEditorContextMenu: this.portalEditorContextMenu,
      portalEditorFieldsets: this._getPortalEditorFieldsetOpenState(),
      isPortalEditorGeneralTab: this.portalEditorSidebarTab !== "inspector",
      isPortalEditorInspectorTab: this.portalEditorSidebarTab === "inspector",
      isPortalEditorFoundryRightSidebarVisible: Boolean(document.body?.classList?.contains("tom-shared-right-sidebar-open")),
      portalEditorShowGrid: this.portalEditor?.settings?.showGridByDefault !== false,
      portalEditorSnapToGrid: this.portalEditor?.settings?.snapToGrid !== false,
      portalEditorShowObjectFrames: Boolean(this.portalEditorShowObjectFrames),
      isPortalEditorCropMode: Boolean(this.portalEditorCropMode),
      portalEditorGridSize: this.portalEditor?.settings?.gridSize ?? 24,
      portalEditorZoom: this.portalEditorZoom.toFixed(2),
      portalEditorZoomPercent: `${Math.round(this.portalEditorZoom * 100)}%`,
      portalEditorPanX: this.portalEditorPanX.toFixed(1),
      portalEditorPanY: this.portalEditorPanY.toFixed(1),
      isPortalEditorVideoBackground: this.portalEditor?.backgroundType === "video",
      isPortalEditorBackdropBlur: this.portalEditor?.settings?.fullscreenBackdropMode === "blur",
      isPortalEditorBackdropImage: this.portalEditor?.settings?.fullscreenBackdropMode === "image",
      isPortalEditorSurfaceOverrideEnabled: Boolean(this.portalEditor?.settings?.surfaceOverrideEnabled),
      isPortalEditorBackgroundRepeated: this.portalEditor?.backgroundType !== "video"
        && normalizePortalBackgroundRepeat(this.portalEditor?.settings?.backgroundRepeat) !== "no-repeat",
      isPortalEditorBackgroundPositionCustom: normalizePortalBackgroundPositionMode(this.portalEditor?.settings?.backgroundPositionMode) === "custom",
      isPortalEditorFullscreenRoundedBorders: Boolean(this.portalEditor?.settings?.fullscreenRoundedBorders),
      isPortalEditorFullscreenFitHeight: this.portalEditor?.settings?.fullscreenFitMode === "height",
      isPortalEditorFullscreenFitWidth: this.portalEditor?.settings?.fullscreenFitMode === "width",
      portalEditorSurfaceAspect: this._getPortalEditorSurfaceAspectOverride(),
      portalEditorBackgroundMediaStyle: this._buildPortalEditorBackgroundMediaStyle(),
      portalEditorBackgroundPositionX: clampPortalPercent(this.portalEditor?.settings?.backgroundPositionX),
      portalEditorBackgroundPositionY: clampPortalPercent(this.portalEditor?.settings?.backgroundPositionY),
      portalEditorBackgroundTypeOptions: [
        { value: "image", label: tr("Image"), isSelected: this.portalEditor?.backgroundType !== "video" },
        { value: "video", label: tr("WebM / Video"), isSelected: this.portalEditor?.backgroundType === "video" }
      ],
      portalEditorBackgroundFitOptions: [
        { value: "contain", label: tr("Contain"), isSelected: normalizePortalBackgroundFit(this.portalEditor?.settings?.backgroundFit) === "contain" },
        { value: "cover", label: tr("Cover"), isSelected: normalizePortalBackgroundFit(this.portalEditor?.settings?.backgroundFit) === "cover" },
        { value: "fill", label: tr("Fill"), isSelected: normalizePortalBackgroundFit(this.portalEditor?.settings?.backgroundFit) === "fill" },
        { value: "none", label: tr("Original size"), isSelected: normalizePortalBackgroundFit(this.portalEditor?.settings?.backgroundFit) === "none" }
      ],
      portalEditorBackgroundPositionOptions: [
        { value: "center", label: tr("Centered"), isSelected: normalizePortalBackgroundPositionMode(this.portalEditor?.settings?.backgroundPositionMode) === "center" },
        { value: "custom", label: tr("Custom XY"), isSelected: normalizePortalBackgroundPositionMode(this.portalEditor?.settings?.backgroundPositionMode) === "custom" }
      ],
      portalEditorBackgroundRepeatOptions: [
        { value: "no-repeat", label: tr("No repeat"), isSelected: normalizePortalBackgroundRepeat(this.portalEditor?.settings?.backgroundRepeat) === "no-repeat" },
        { value: "repeat", label: tr("Repeat"), isSelected: normalizePortalBackgroundRepeat(this.portalEditor?.settings?.backgroundRepeat) === "repeat" },
        { value: "repeat-x", label: tr("Repeat horizontal"), isSelected: normalizePortalBackgroundRepeat(this.portalEditor?.settings?.backgroundRepeat) === "repeat-x" },
        { value: "repeat-y", label: tr("Repeat vertical"), isSelected: normalizePortalBackgroundRepeat(this.portalEditor?.settings?.backgroundRepeat) === "repeat-y" }
      ],
      portalEditorFullscreenBackdropModeOptions: [
        { value: "color", label: tr("Background color"), isSelected: !["blur", "image"].includes(String(this.portalEditor?.settings?.fullscreenBackdropMode || "color")) },
        { value: "blur", label: tr("Blur Foundry background"), isSelected: this.portalEditor?.settings?.fullscreenBackdropMode === "blur" },
        { value: "image", label: tr("Background image"), isSelected: this.portalEditor?.settings?.fullscreenBackdropMode === "image" }
      ],
      portalEditorAvatarOptions: TheatreStore.getAvatars().map((avatar) => {
        const actor = getActorById(avatar.actorId);
        return {
          value: avatar.id,
          label: avatar.name || actor?.name || tr("Avatar")
        };
      }),
      portalEditorPlaylistOptions: [
        { value: "", label: tr("No playlist"), isSelected: !this.portalEditor?.settings?.autoplayPlaylistId },
        ...soundPlaylists.map((playlist) => ({
          value: playlist.id,
          label: playlist.name || tr("Sound playlist"),
          isSelected: this.portalEditor?.settings?.autoplayPlaylistId === playlist.id
        }))
      ],
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
      scenes,
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
      sceneEditorBackgroundFullscreenFitOptions: sceneBackgroundFullscreenFitOptions,
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
      case "portals":
        return tr("Search portals");
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

  _matchesPortalSearch(portal, query) {
    const needle = this._normalizeSearchText(query);
    if (!needle) return true;
    const haystack = [
      portal.name,
      portal.description,
      portal.background,
      ...(Array.isArray(portal.elements) ? portal.elements.map((element) => `${element.name} ${element.text}`) : [])
    ]
      .map((part) => this._normalizeSearchText(part))
      .filter(Boolean)
      .join(" ");
    return haystack.includes(needle);
  }

  _clampPortalNumber(value, min, max, fallback = min) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  _getPortalElementTypeOptions(selected = "text") {
    return [
      { value: "object", label: tr("Object") },
      { value: "text", label: tr("Text") },
      { value: "image", label: tr("Image") },
      { value: "video", label: tr("WebM / Video") },
      { value: "shape", label: tr("Shape") }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _getOpenPortalAppState() {
    const windows = Object.values(ui.windows ?? {});
    const windowApp = windows.find((app) => app.constructor?.name === "TheatrePortalApplication") ?? null;
    const stageApp = windows.find((app) => app.constructor?.name === "TheatrePortalStageApplication") ?? null;
    return {
      windowPortalId: String(windowApp?.portalId || "").trim(),
      stagePortalId: String(stageApp?.portalId || "").trim()
    };
  }

  _getPortalActionTypeOptions(selected = "none") {
    return [
      { value: "none", label: tr("None") },
      { value: "actor", label: tr("Actor") },
      { value: "journal", label: tr("Journal") },
      { value: "scene", label: tr("Foundry Scene") },
      { value: "theatreScene", label: tr("Footlights Scene") },
      { value: "worldMap", label: tr("World Map") },
      { value: "portal", label: tr("Portal") }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _getPortalActionTargetOptions(action = {}) {
    const type = String(action?.type || "none");
    const selected = String(action?.documentId || action?.theatreSceneId || action?.worldMapId || action?.portalId || "").trim();
    const mapOption = (value, label) => ({ value, label, isSelected: String(value) === selected });
    if (type === "scene") {
      return (game.scenes?.contents ?? []).map((scene) => mapOption(scene.id, scene.name));
    }
    if (type === "theatreScene") {
      return TheatreStore.getScenes().map((scene) => mapOption(scene.id, scene.name));
    }
    if (type === "worldMap") {
      return TheatreStore.getWorldMaps().map((worldMap) => mapOption(worldMap.id, worldMap.name));
    }
    if (type === "portal") {
      return TheatreStore.getPortals()
        .filter((portal) => portal.id !== this.portalEditor?.id)
        .map((portal) => mapOption(portal.id, portal.name));
    }
    return [];
  }

  _getPortalOpenModeOptions(action = {}) {
    const selected = normalizePortalOpenMode(action?.openMode);
    return [
      { value: "window", label: tr("Windowed"), isSelected: selected === "window" },
      { value: "stage", label: tr("Fullscreen"), isSelected: selected === "stage" }
    ];
  }

  _normalizePortalColorInput(value, fallback = "#ffffff") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  _formatPortalDecimal(value, fallback = 0) {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
    return Number(resolved.toFixed(1));
  }

  _hexToPortalRgbString(hex, fallback = "255, 255, 255") {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!match) return fallback;
    const value = match[1];
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16)
    ].join(", ");
  }

  _getPortalShapeOptions(selected = "rounded") {
    return [
      { value: "rectangle", label: tr("Rectangle") },
      { value: "rounded", label: tr("Rounded") },
      { value: "circle", label: tr("Circle") },
      { value: "diamond", label: tr("Diamond") },
      { value: "triangle", label: tr("Triangle") }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _getPortalEffectDefinitions() {
    return {
      shadow: {
        label: tr("Shadow"),
        icon: "fa-moon",
        defaults: { color: "#000000", opacity: 0.28, blur: 16, x: 0, y: 12 }
      },
      glow: {
        label: tr("Glow"),
        icon: "fa-sun",
        defaults: { color: "#cfe8ff", opacity: 0.55, blur: 18, spread: 0 }
      },
      blur: {
        label: tr("Blur"),
        icon: "fa-droplet",
        defaults: { amount: 2, backdrop: false }
      },
      glass: {
        label: tr("Glass"),
        icon: "fa-gem",
        defaults: { color: "#dceeff", opacity: 0.22, blur: 10, saturation: 1.25, shine: 0.28 }
      },
      scanlines: {
        label: tr("Scanlines"),
        icon: "fa-bars-staggered",
        defaults: { color: "#ffffff", opacity: 0.18, spacing: 7, thickness: 1, speed: 0 }
      },
      chroma: {
        label: tr("Chroma Shift"),
        icon: "fa-wand-magic-sparkles",
        defaults: { amount: 2, opacity: 0.55 }
      },
      rotate: {
        label: tr("Rotate"),
        icon: "fa-rotate-right",
        defaults: { angle: 0 }
      },
      tilt: {
        label: tr("Tilt"),
        icon: "fa-cube",
        defaults: { x: 0, y: 0, perspective: 700 }
      },
      pulse: {
        label: tr("Pulse"),
        icon: "fa-wave-square",
        defaults: { scale: 1.04, opacity: 0.82, duration: 1.8 }
      },
      float: {
        label: tr("Float Wobble"),
        icon: "fa-water",
        defaults: { distance: 5, rotation: 1.2, duration: 3.6 }
      },
      perspectiveHover: {
        label: tr("Perspective Hover"),
        icon: "fa-cube",
        defaults: { x: 8, y: -8, perspective: 800, scale: 1.03 },
        hover: true
      },
      sound: {
        label: tr("Sound Effect"),
        icon: "fa-volume-high",
        defaults: { src: "", volume: 0.7 }
      }
    };
  }

  _createPortalEffect(type = "glow", overrides = {}) {
    const definitions = this._getPortalEffectDefinitions();
    const effectType = definitions[type] ? type : "glow";
    return {
      id: overrides.id || randomId(),
      type: effectType,
      enabled: overrides.enabled !== false,
      expanded: Boolean(overrides.expanded),
      hover: overrides.hover ?? Boolean(definitions[effectType].hover),
      disableOnHover: Boolean(overrides.disableOnHover),
      preview: Boolean(overrides.preview),
      targetMode: String(overrides.targetMode || "") === "layer" ? "layer" : "object",
      targetLayerId: String(overrides.targetLayerId || "").trim(),
      targetLocked: Boolean(overrides.targetLocked),
      transition: {
        duration: overrides.transition?.duration ?? 0.22,
        easing: overrides.transition?.easing ?? "ease"
      },
      settings: {
        ...definitions[effectType].defaults,
        ...(overrides.settings ?? {})
      }
    };
  }

  _normalizePortalEffects(element = {}) {
    const definitions = this._getPortalEffectDefinitions();
    const sourceEffects = Array.isArray(element.effects) ? element.effects : [];
    const firstContentLayer = this._normalizePortalContentLayers(element).find((layer) => layer.visible !== false);
    const normalized = sourceEffects
      .filter((effect) => definitions[String(effect?.type || "")])
      .map((effect) => {
        const shouldPreferContentLayer = firstContentLayer && effect?.targetLocked !== true;
        const targetDefaults = shouldPreferContentLayer
          ? {
              targetMode: "layer",
              targetLayerId: effect?.targetMode === "layer" && effect?.targetLayerId
                ? String(effect.targetLayerId)
                : firstContentLayer.id
            }
          : {};
        return this._createPortalEffect(String(effect.type), { ...effect, ...targetDefaults });
      });

    if (!normalized.length && element.style?.shadow) {
      const targetDefaults = firstContentLayer
        ? { targetMode: "layer", targetLayerId: firstContentLayer.id }
        : {};
      normalized.push(this._createPortalEffect("shadow", {
        id: "legacy-shadow",
        enabled: true,
        expanded: false,
        ...targetDefaults,
        settings: { color: "#000000", opacity: 0.28, blur: 16, x: 0, y: 12 }
      }));
    }

    return normalized;
  }

  _getPortalEffectTypeOptions(element = {}) {
    const definitions = this._getPortalEffectDefinitions();
    return Object.entries(definitions)
      .map(([value, definition]) => ({ value, label: definition.label, icon: definition.icon }));
  }

  _getPortalEffectTargetModeOptions(selected = "object") {
    const resolved = String(selected || "object") === "layer" ? "layer" : "object";
    return [
      { value: "object", label: tr("Full object") },
      { value: "layer", label: tr("Content layer") }
    ].map((option) => ({ ...option, isSelected: option.value === resolved }));
  }

  _getPortalEffectTargetLayerOptions(element = {}, selected = "") {
    const layers = this._normalizePortalContentLayers(element)
      .sort((a, b) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1));
    const selectedId = String(selected || "").trim();
    return layers.map((layer) => ({
      value: layer.id,
      label: layer.name || this._getPortalContentLayerDefinitions()[layer.type]?.label || tr("Content layer"),
      isSelected: String(layer.id) === selectedId
    }));
  }

  _getPortalContentLayerDefinitions() {
    return {
      text: {
        label: tr("Text layer"),
        icon: "fa-font",
        defaults: {
          text: tr("Portal text"),
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          textStyle: { fontFamily: "", fontSize: 24, color: "#ffffff", shadow: false, shadowColor: "#000000", shadowOpacity: 0.45, shadowBlur: 4, shadowX: 0, shadowY: 2 },
          media: { src: "", type: "image", fit: "contain", repeat: "no-repeat", hoverSrc: "", hoverType: "image" }
        }
      },
      dataText: {
        label: tr("Data text layer"),
        icon: "fa-database",
        defaults: {
          text: "",
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          textStyle: { fontFamily: "", fontSize: 24, color: "#ffffff", shadow: false, shadowColor: "#000000", shadowOpacity: 0.45, shadowBlur: 4, shadowX: 0, shadowY: 2 },
          media: { src: "", avatarId: "", dataPath: "", dataFormat: "{value}", type: "image", fit: "contain", repeat: "no-repeat", hoverSrc: "", hoverType: "image" }
        }
      },
      image: {
        label: tr("Image layer"),
        icon: "fa-image",
        defaults: {
          text: "",
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          media: { src: "", type: "image", fit: "contain", repeat: "no-repeat", hoverSrc: "", hoverType: "image" }
        }
      },
      video: {
        label: tr("Video layer"),
        icon: "fa-film",
        defaults: {
          text: "",
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          media: { src: "", type: "video", fit: "cover", repeat: "no-repeat", hoverSrc: "", hoverType: "video" }
        }
      },
      html: {
        label: tr("HTML/CSS layer"),
        icon: "fa-code",
        defaults: {
          text: "",
          html: `<button class="portal-custom-button">${tr("Button")}</button>`,
          css: `.portal-custom-button {
  padding: 0.65rem 1rem;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
}`,
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          media: { src: "", type: "image", fit: "contain", repeat: "no-repeat", hoverSrc: "", hoverType: "image" }
        }
      },
      portalAvatar: {
        label: tr("Portal Avatars"),
        icon: "fa-user-astronaut",
        defaults: {
          text: "",
          layout: { alignX: "center", alignY: "center", textAlign: "center", scale: 1, offsetX: 0, offsetY: 0 },
          media: { src: "", avatarId: "", type: "image", fit: "contain", repeat: "no-repeat", hoverSrc: "", hoverType: "image", openActorSheetOnClick: false }
        }
      }
    };
  }

  _createPortalContentLayer(type = "text", overrides = {}) {
    const definitions = this._getPortalContentLayerDefinitions();
    const layerType = definitions[type] ? type : "text";
    const defaults = definitions[layerType].defaults;
    return {
      id: overrides.id || randomId(),
      type: layerType,
      name: overrides.name || definitions[layerType].label,
      text: overrides.text ?? defaults.text ?? "",
      html: overrides.html ?? defaults.html ?? "",
      css: overrides.css ?? defaults.css ?? "",
      visible: overrides.visible !== false,
      expanded: Boolean(overrides.expanded),
      zIndex: Number.isFinite(Number(overrides.zIndex)) ? Number(overrides.zIndex) : 1,
      layout: this._normalizePortalContentLayerLayout(overrides.layout ?? defaults.layout),
      textStyle: this._normalizePortalContentLayerTextStyle(overrides.textStyle ?? defaults.textStyle),
      media: {
        ...(defaults.media ?? {}),
        ...(overrides.media ?? {}),
        type: layerType === "video" ? "video" : "image",
        hoverType: layerType === "video" ? "video" : "image"
      }
    };
  }

  _normalizePortalContentLayerTextStyle(textStyle = {}) {
    return {
      fontFamily: String(textStyle.fontFamily || "").trim(),
      fontSize: this._clampPortalNumber(textStyle.fontSize, 6, 160, 24),
      color: this._normalizePortalColorInput(textStyle.color, "#ffffff"),
      shadow: Boolean(textStyle.shadow),
      shadowColor: this._normalizePortalColorInput(textStyle.shadowColor, "#000000"),
      shadowOpacity: this._clampPortalNumber(textStyle.shadowOpacity, 0, 1, 0.45),
      shadowBlur: this._clampPortalNumber(textStyle.shadowBlur, 0, 40, 4),
      shadowX: this._clampPortalNumber(textStyle.shadowX, -80, 80, 0),
      shadowY: this._clampPortalNumber(textStyle.shadowY, -80, 80, 2)
    };
  }

  _normalizePortalContentLayerLayout(layout = {}) {
    const alignX = ["left", "center", "right"].includes(String(layout.alignX || "")) ? String(layout.alignX) : "center";
    const alignY = ["top", "center", "bottom"].includes(String(layout.alignY || "")) ? String(layout.alignY) : "center";
    const textAlign = ["left", "center", "right"].includes(String(layout.textAlign || "")) ? String(layout.textAlign) : alignX;
    return {
      alignX,
      alignY,
      textAlign,
      scale: this._clampPortalNumber(layout.scale, 0.1, 4, 1),
      offsetX: this._clampPortalNumber(layout.offsetX, -100, 100, 0),
      offsetY: this._clampPortalNumber(layout.offsetY, -100, 100, 0)
    };
  }

  _normalizePortalContentLayers(element = {}) {
    const definitions = this._getPortalContentLayerDefinitions();
    const sourceLayers = Array.isArray(element.contentLayers) ? element.contentLayers : [];
    const normalized = sourceLayers
      .filter((layer) => definitions[String(layer?.type || "")])
      .map((layer) => this._applyPortalContentLayerDraftsToLayer(this._createPortalContentLayer(String(layer.type), layer)));
    if (normalized.length) return normalized;

    const legacyType = String(element.type || "");
    if (!definitions[legacyType]) return [];
    return [
      this._createPortalContentLayer(legacyType, {
        id: "legacy-content",
        name: element.name || definitions[legacyType].label,
        text: element.text || "",
        media: element.media || {},
        visible: true,
        zIndex: 1
      })
    ];
  }

  _rememberPortalContentLayerDraft(layerId, field, value, fallback = "") {
    const id = String(layerId || "").trim();
    const key = String(field || "").trim();
    if (!id || !["html", "css", "text", "name"].includes(key)) return;
    const draft = this._portalContentLayerDrafts.get(id) ?? {};
    const nextValue = String(value ?? "");
    const previousValue = String(draft[key] ?? fallback ?? "");

    // Textarea change events can occasionally fire after the live CSS preview
    // was re-scoped. Never let an invalid selector-only fragment replace a
    // previously complete CSS block.
    if (key === "css" && nextValue.trim() && !nextValue.includes("{") && previousValue.includes("{")) {
      return previousValue;
    }

    draft[key] = nextValue;
    this._portalContentLayerDrafts.set(id, draft);
    return nextValue;
  }

  _applyPortalContentLayerDraftsToLayer(layer = {}) {
    const draft = this._portalContentLayerDrafts.get(String(layer?.id || ""));
    if (!draft) return layer;
    const has = (key) => Object.prototype.hasOwnProperty.call(draft, key);
    if (has("html")) layer.html = draft.html;
    if (has("css")) layer.css = draft.css;
    if (has("text")) layer.text = draft.text;
    if (has("name")) layer.name = draft.name;
    return layer;
  }

  _applyPortalContentLayerDraftsToElements(elements = []) {
    if (!Array.isArray(elements) || !this._portalContentLayerDrafts.size) return;
    for (const element of elements) {
      if (!Array.isArray(element?.contentLayers)) continue;
      for (const layer of element.contentLayers) this._applyPortalContentLayerDraftsToLayer(layer);
    }
  }

  _getPortalContentLayerTypeOptions() {
    const definitions = this._getPortalContentLayerDefinitions();
    return Object.entries(definitions)
      .map(([value, definition]) => ({ value, label: definition.label, icon: definition.icon }));
  }

  _getPortalAvatarLayerOptions(selected = "") {
    const selectedId = String(selected || "").trim();
    return TheatreStore.getAvatars().map((avatar) => {
      const actor = getActorById(avatar.actorId);
      const value = String(avatar.id || "").trim();
      return {
        value,
        label: avatar.name || actor?.name || tr("Avatar"),
        isSelected: value === selectedId
      };
    });
  }

  _getPortalDataTextActor(avatarId = "") {
    const avatar = TheatreStore.getAvatarById(avatarId);
    return avatar?.actorId ? getActorById(avatar.actorId) : null;
  }

  _getPortalDataTextValue(avatarId = "", path = "") {
    const actor = this._getPortalDataTextActor(avatarId);
    const propertyPath = String(path || "").trim();
    if (!actor || !propertyPath) return "";
    const source = propertyPath.startsWith("system.") ? actor : actor.system;
    const resolvedPath = propertyPath.startsWith("system.") ? propertyPath : propertyPath.replace(/^system\./, "");
    const value = foundry.utils.getProperty(source, resolvedPath);
    return formatPortalDataTextValue(value);
  }

  _renderPortalDataTextLayer(layer = {}) {
    const value = this._getPortalDataTextValue(layer.media?.avatarId, layer.media?.dataPath);
    const format = String(layer.media?.dataFormat || "{value}").trim() || "{value}";
    return format.replaceAll("{value}", value).replaceAll("{path}", String(layer.media?.dataPath || "").trim());
  }

  _getPortalDataTextPathOptions(avatarId = "", selected = "") {
    const actor = this._getPortalDataTextActor(avatarId);
    if (!actor) return [];
    const selectedPath = String(selected || "").trim();
    return collectPortalActorDataPaths(actor.system ?? {})
      .slice(0, 140)
      .map((entry) => ({
        value: entry.path,
        label: `${entry.path}${entry.value !== "" ? ` = ${entry.value}` : ""}`,
        isSelected: entry.path === selectedPath
      }));
  }

  _getPortalContentLayerRows(element = {}) {
    this._applyPortalContentLayerDraftsToElements([element]);
    const definitions = this._getPortalContentLayerDefinitions();
    const layers = this._normalizePortalContentLayers(element)
      .sort((a, b) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1));
    return layers.map((layer, index) => {
      const definition = definitions[layer.type] ?? definitions.text;
      const mediaType = String(layer.media?.type || layer.type);
      const repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(layer.media?.repeat || "")) ? String(layer.media.repeat) : "no-repeat";
      const layout = this._normalizePortalContentLayerLayout(layer.layout);
      const textStyle = this._normalizePortalContentLayerTextStyle(layer.textStyle);
      const renderedText = layer.type === "dataText" ? this._renderPortalDataTextLayer(layer) : (layer.text || layer.name || "");
      return {
        ...layer,
        layout,
        textStyle,
        index,
        label: layer.name || definition.label,
        icon: definition.icon,
        isText: layer.type === "text",
        isDataText: layer.type === "dataText",
        isImage: layer.type === "image",
        isVideo: layer.type === "video",
        isHtml: layer.type === "html",
        isPortalAvatar: layer.type === "portalAvatar",
        avatar: layer.type === "portalAvatar" ? this._getPortalAvatarRenderData(layer.media?.avatarId, layer.media?.src, { baked: true }) : null,
        openActorSheetOnClick: Boolean(layer.media?.openActorSheetOnClick),
        isMediaVideo: mediaType === "video",
        hasMedia: Boolean(layer.media?.src),
        renderedText,
        escapedText: escapeHtml(renderedText),
        customHtml: sanitizePortalCustomHtml(layer.html || ""),
        scopedCss: scopePortalCustomCss(layer.css || "", layer.id),
        mediaFit: ["contain", "cover", "fill", "none"].includes(layer.media?.fit) ? layer.media.fit : "contain",
        mediaRepeat: repeat,
        isRepeatedImage: layer.type === "image" && repeat !== "no-repeat" && Boolean(layer.media?.src),
        isExpanded: layer.expanded !== false,
        canMoveUp: index > 0,
        canMoveDown: index < layers.length - 1,
        layerStyle: this._buildPortalContentLayerStyle({ ...layer, layout, textStyle, media: { ...(layer.media ?? {}), repeat } }, element),
        alignXOptions: this._getPortalLayerAlignXOptions(layout.alignX),
        alignYOptions: this._getPortalLayerAlignYOptions(layout.alignY),
        textAlignOptions: this._getPortalLayerTextAlignOptions(layout.textAlign),
        fontOptions: this._getFontTypeOptions(textStyle.fontFamily).map((option) => ({
          ...option,
          isSelected: option.value === textStyle.fontFamily
        })),
        repeatOptions: this._getPortalLayerRepeatOptions(repeat),
        avatarOptions: this._getPortalAvatarLayerOptions(layer.media?.avatarId),
        dataPathOptions: layer.type === "dataText" ? this._getPortalDataTextPathOptions(layer.media?.avatarId, layer.media?.dataPath) : [],
        dataTextValue: layer.type === "dataText" ? this._getPortalDataTextValue(layer.media?.avatarId, layer.media?.dataPath) : "",
        fitOptions: ["contain", "cover", "fill", "none"].map((value) => ({
          value,
          label: tr(value.charAt(0).toUpperCase() + value.slice(1)),
          isSelected: (["contain", "cover", "fill", "none"].includes(layer.media?.fit) ? layer.media.fit : "contain") === value
        })),
        visibilityIcon: layer.visible !== false ? "fa-eye" : "fa-eye-slash",
        visibilityLabel: layer.visible !== false ? tr("Hide layer") : tr("Show layer")
      };
    });
  }

  _getPortalLayerAlignXOptions(selected = "center") {
    return [
      { value: "left", label: tr("Left"), icon: "fa-align-left" },
      { value: "center", label: tr("Center"), icon: "fa-align-center" },
      { value: "right", label: tr("Right"), icon: "fa-align-right" }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _getPortalLayerAlignYOptions(selected = "center") {
    return [
      { value: "top", label: tr("Top"), icon: "fa-arrow-up" },
      { value: "center", label: tr("Middle"), icon: "fa-arrows-up-down" },
      { value: "bottom", label: tr("Bottom"), icon: "fa-arrow-down" }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _getPortalLayerTextAlignOptions(selected = "center") {
    return this._getPortalLayerAlignXOptions(selected);
  }

  _getPortalLayerRepeatOptions(selected = "no-repeat") {
    return [
      { value: "no-repeat", label: tr("No repeat") },
      { value: "repeat", label: tr("Repeat") },
      { value: "repeat-x", label: tr("Repeat horizontal") },
      { value: "repeat-y", label: tr("Repeat vertical") }
    ].map((option) => ({ ...option, isSelected: option.value === selected }));
  }

  _buildPortalContentLayerStyle(layer = {}, element = {}) {
    const layout = this._normalizePortalContentLayerLayout(layer.layout);
    const isHtmlLayer = String(layer.type || "") === "html";
    const anchorX = isHtmlLayer ? "center" : layout.alignX;
    const anchorY = isHtmlLayer ? "center" : layout.alignY;
    const alignX = { left: "flex-start", center: "center", right: "flex-end" }[anchorX] || "center";
    const alignY = { top: "flex-start", center: "center", bottom: "flex-end" }[anchorY] || "center";
    const objectPositionX = { left: "left", center: "center", right: "right" }[anchorX] || "center";
    const objectPositionY = { top: "top", center: "center", bottom: "bottom" }[anchorY] || "center";
    const media = layer.media ?? {};
    const textStyle = this._normalizePortalContentLayerTextStyle(layer.textStyle);
    const shadowRgb = this._hexToPortalRgbString(textStyle.shadowColor, "0, 0, 0");
    const textShadow = textStyle.shadow
      ? `${textStyle.shadowX}px ${textStyle.shadowY}px ${textStyle.shadowBlur}px rgba(${shadowRgb}, ${textStyle.shadowOpacity})`
      : "none";
    const repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(media.repeat || "")) ? String(media.repeat) : "no-repeat";
    const mediaSrc = String(media.src || "").trim().replaceAll("\\", "/").replaceAll("\"", "\\\"");
    const baseEffects = this._getPortalEffectStyleState(element, false, { mode: "layer", layerId: layer.id });
    const hoverEffects = this._getPortalEffectStyleState(element, true, { mode: "layer", layerId: layer.id });
    const hasHoverEffectControls = this._portalElementHasHoverEffectControls(element, { mode: "layer", layerId: layer.id });
    const hoverFallback = (value, fallback) => value || (hasHoverEffectControls ? "none" : fallback);
    const hoverNumberFallback = (value, fallback) => hasHoverEffectControls ? value : fallback;
    return [
      `z-index:${Number(layer.zIndex) || 1}`,
      `--tom-portal-layer-justify:${alignX}`,
      `--tom-portal-layer-align:${alignY}`,
      `--tom-portal-layer-text-align:${layout.textAlign}`,
      `--tom-portal-layer-object-position:${objectPositionX} ${objectPositionY}`,
      `--tom-portal-layer-font-family:${textStyle.fontFamily ? JSON.stringify(textStyle.fontFamily) : "var(--tom-font-family-heading-2, inherit)"}`,
      `--tom-portal-layer-font-size:${textStyle.fontSize}px`,
      `--tom-portal-layer-text-color:${textStyle.color}`,
      `--tom-portal-layer-text-shadow:${textShadow}`,
      `--tom-portal-layer-scale:${["text", "dataText"].includes(layer.type) ? 1 : layout.scale}`,
      `--tom-portal-layer-offset-x:${layout.offsetX}%`,
      `--tom-portal-layer-offset-y:${layout.offsetY}%`,
      `--tom-portal-layer-bg-image:${mediaSrc && repeat !== "no-repeat" ? `url("${mediaSrc}")` : "none"}`,
      `--tom-portal-layer-bg-repeat:${repeat}`,
      `--tom-portal-layer-bg-size:${repeat !== "no-repeat" ? `${Math.max(1, layout.scale * 100).toFixed(2)}% auto` : (media.fit === "cover" ? "cover" : (media.fit === "fill" ? "100% 100%" : "auto"))}`,
      `--tom-portal-transform:${baseEffects.transforms.length ? baseEffects.transforms.join(" ") : "translateZ(0)"}`,
      `--tom-portal-hover-transform:${hoverFallback(hoverEffects.transforms.length ? hoverEffects.transforms.join(" ") : "", "var(--tom-portal-transform)")}`,
      `--tom-portal-filter:${baseEffects.filters.length ? baseEffects.filters.join(" ") : "none"}`,
      `--tom-portal-hover-filter:${hoverFallback(hoverEffects.filters.length ? hoverEffects.filters.join(" ") : "", "var(--tom-portal-filter)")}`,
      `--tom-portal-backdrop-filter:${baseEffects.backdrops.length ? baseEffects.backdrops.join(" ") : "none"}`,
      `--tom-portal-hover-backdrop-filter:${hoverFallback(hoverEffects.backdrops.length ? hoverEffects.backdrops.join(" ") : "", "var(--tom-portal-backdrop-filter)")}`,
      `--tom-portal-shadow:${baseEffects.boxShadows.length ? baseEffects.boxShadows.join(", ") : "none"}`,
      `--tom-portal-hover-shadow:${hoverEffects.boxShadows.length ? hoverEffects.boxShadows.join(", ") : (hasHoverEffectControls ? "none" : "var(--tom-portal-shadow)")}`,
      `--tom-portal-animation:${baseEffects.animation}`,
      `--tom-portal-hover-animation:${hoverEffects.animation !== "none" ? hoverEffects.animation : (hasHoverEffectControls ? "none" : "var(--tom-portal-animation)")}`,
      `--tom-portal-pulse-scale:${hoverNumberFallback(hoverEffects.pulseScale, baseEffects.pulseScale)}`,
      `--tom-portal-pulse-opacity:${hoverNumberFallback(hoverEffects.pulseOpacity, baseEffects.pulseOpacity)}`,
      `--tom-portal-float-distance:${hoverNumberFallback(hoverEffects.floatDistance, baseEffects.floatDistance)}px`,
      `--tom-portal-float-rotation-amount:${hoverNumberFallback(hoverEffects.floatRotation, baseEffects.floatRotation)}deg`,
      `--tom-portal-scanline-opacity:${baseEffects.scanlineOpacity}`,
      `--tom-portal-hover-scanline-opacity:${hoverEffects.scanlineOpacity}`,
      `--tom-portal-scanline-color:${baseEffects.scanlineColor}`,
      `--tom-portal-hover-scanline-color:${hoverEffects.scanlineColor}`,
      `--tom-portal-scanline-spacing:${baseEffects.scanlineSpacing}px`,
      `--tom-portal-hover-scanline-spacing:${hoverEffects.scanlineSpacing}px`,
      `--tom-portal-scanline-thickness:${baseEffects.scanlineThickness}px`,
      `--tom-portal-hover-scanline-thickness:${hoverEffects.scanlineThickness}px`,
      `--tom-portal-scanline-duration:${baseEffects.scanlineDuration}s`,
      `--tom-portal-hover-scanline-duration:${hoverEffects.scanlineDuration}s`,
      `--tom-portal-glass-opacity:${baseEffects.glassOpacity}`,
      `--tom-portal-hover-glass-opacity:${hoverEffects.glassOpacity}`,
      `--tom-portal-glass-color:${baseEffects.glassColor}`,
      `--tom-portal-hover-glass-color:${hoverEffects.glassColor}`,
      `--tom-portal-effect-duration:${hoverEffects.transitionDuration}s`,
      `--tom-portal-effect-easing:${hoverEffects.transitionEasing}`
    ].join(";");
  }

  _getPortalEffectEasingOptions(selected = "ease") {
    const resolved = String(selected || "ease").trim();
    return [
      { value: "ease", label: tr("Ease") },
      { value: "ease-in", label: tr("Ease in") },
      { value: "ease-out", label: tr("Ease out") },
      { value: "ease-in-out", label: tr("Ease in out") },
      { value: "linear", label: tr("Linear") },
      { value: "cubic-bezier(0.16, 1, 0.3, 1)", label: tr("Soft spring") },
      { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: tr("Overshoot") },
      { value: "cubic-bezier(0.83, 0, 0.17, 1)", label: tr("Dramatic") }
    ].map((option) => ({ ...option, isSelected: option.value === resolved }));
  }

  _getPortalEditorFieldsetOpenState() {
    return {
      position: this._portalEditorOpenFieldsets?.has("position") ?? false,
      media: this._portalEditorOpenFieldsets?.has("media") ?? false,
      action: this._portalEditorOpenFieldsets?.has("action") ?? false,
      style: this._portalEditorOpenFieldsets?.has("style") ?? false,
      layersEffects: this._portalEditorOpenFieldsets?.has("layers-effects") ?? false,
      soundsPermissions: this._portalEditorOpenFieldsets?.has("sounds-permissions") ?? false,
      generalIdentity: this._portalEditorOpenFieldsets?.has("general-identity") ?? false,
      generalBackground: this._portalEditorOpenFieldsets?.has("general-background") ?? false,
      generalCanvas: this._portalEditorOpenFieldsets?.has("general-canvas") ?? false,
      generalBackgroundLayout: this._portalEditorOpenFieldsets?.has("general-background-layout") ?? false,
      generalFullscreen: this._portalEditorOpenFieldsets?.has("general-fullscreen") ?? false,
      generalBackgroundSound: this._portalEditorOpenFieldsets?.has("general-background-sound") ?? false,
      generalElements: this._portalEditorOpenFieldsets?.has("general-elements") ?? false
    };
  }

  _getPortalEffectSubsectionKey(effectId, section) {
    const id = String(effectId || "").trim();
    const part = String(section || "").trim();
    return id && part ? `${id}:${part}` : "";
  }

  _isPortalEffectSubsectionOpen(effectId, section) {
    const key = this._getPortalEffectSubsectionKey(effectId, section);
    return Boolean(key && this._portalEditorOpenEffectSubsections?.has(key));
  }

  _capturePortalEditorDisclosureState() {
    if (!this.form || !this.portalEditor) return;
    const fieldsets = new Set();
    this.form.querySelectorAll("[data-portal-editor-fieldset]").forEach((fieldset) => {
      const key = String(fieldset.dataset.portalEditorFieldset || "").trim();
      if (key && fieldset.open) fieldsets.add(key);
    });
    this._portalEditorOpenFieldsets = fieldsets;

    const subsections = new Set();
    this.form.querySelectorAll("[data-portal-effect-subsection]").forEach((subsection) => {
      const key = this._getPortalEffectSubsectionKey(subsection.dataset.effectId, subsection.dataset.portalEffectSubsection);
      if (key && subsection.open) subsections.add(key);
    });
    this._portalEditorOpenEffectSubsections = subsections;
  }

  _onPortalEditorDisclosureToggle(event) {
    const disclosure = event.currentTarget;
    if (!disclosure) return;
    const fieldsetKey = String(disclosure.dataset?.portalEditorFieldset || "").trim();
    if (fieldsetKey) {
      if (disclosure.open) this._portalEditorOpenFieldsets.add(fieldsetKey);
      else this._portalEditorOpenFieldsets.delete(fieldsetKey);
      return;
    }
    const subsectionKey = this._getPortalEffectSubsectionKey(disclosure.dataset?.effectId, disclosure.dataset?.portalEffectSubsection);
    if (!subsectionKey) return;
    if (disclosure.open) this._portalEditorOpenEffectSubsections.add(subsectionKey);
    else this._portalEditorOpenEffectSubsections.delete(subsectionKey);
  }

  _getPortalEffectRows(element = {}) {
    const definitions = this._getPortalEffectDefinitions();
    return this._normalizePortalEffects(element).map((effect, index) => {
      const definition = definitions[effect.type] ?? definitions.glow;
      const settings = effect.settings ?? {};
      return {
        ...effect,
        label: definition.label,
        icon: definition.icon,
        index,
        canDelete: true,
        canMoveUp: index > 0,
        canMoveDown: index < this._normalizePortalEffects(element).length - 1,
        enabledIcon: effect.enabled !== false ? "fa-eye" : "fa-eye-slash",
        enabledLabel: effect.enabled !== false ? tr("Hide effect") : tr("Show effect"),
        disableOnHover: Boolean(effect.disableOnHover),
        hasHoverControls: effect.type !== "sound" && Boolean(effect.hover || effect.disableOnHover),
        showHoverToggles: effect.type !== "sound",
        targetMode: effect.targetMode === "layer" ? "layer" : "object",
        isLayerTargeted: effect.targetMode === "layer",
        targetModeOptions: this._getPortalEffectTargetModeOptions(effect.targetMode),
        targetLayerOptions: this._getPortalEffectTargetLayerOptions(element, effect.targetLayerId),
        isTargetHoverOpen: this._isPortalEffectSubsectionOpen(effect.id, "target-hover"),
        isSettingsOpen: this._isPortalEffectSubsectionOpen(effect.id, "settings"),
        isShadow: effect.type === "shadow",
        isGlow: effect.type === "glow",
        isBlur: effect.type === "blur",
        isGlass: effect.type === "glass",
        isScanlines: effect.type === "scanlines",
        isChroma: effect.type === "chroma",
        isRotate: effect.type === "rotate",
        isTilt: effect.type === "tilt",
        isPulse: effect.type === "pulse",
        isFloat: effect.type === "float",
        isPerspectiveHover: effect.type === "perspectiveHover",
        isSound: effect.type === "sound",
        hoverEasingOptions: this._getPortalEffectEasingOptions(effect.transition?.easing),
        settings: {
          ...definition.defaults,
          ...settings,
          color: this._normalizePortalColorInput(settings.color, definition.defaults.color || "#ffffff")
        }
      };
    });
  }

  _getPortalEditorElementRows() {
    const elements = Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : [];
    return elements.map((element) => {
      const type = String(element.type || "text");
      const mediaType = String(element.media?.type || type);
      const isMedia = ["image", "video"].includes(type);
      const avatar = element.media?.avatarId
        ? this._getPortalAvatarRenderData(element.media.avatarId, element.media?.src)
        : null;
      const visible = element.visible !== false;
      return {
        ...element,
        avatar,
        contentLayers: this._getPortalContentLayerRows(element),
        visible,
        visibilityIcon: visible ? "fa-eye" : "fa-eye-slash",
        visibilityLabel: visible ? tr("Hide element") : tr("Show element"),
        isPortalAvatar: Boolean(avatar),
        isSelected: element.id === this.portalEditorSelectedElementId,
        isEmptyObject: type === "object" && !this._getPortalContentLayerRows(element).length,
        isText: type === "text",
        isShape: type === "shape",
        isImage: type === "image",
        isVideo: type === "video",
        isMedia,
        isMediaVideo: mediaType === "video",
        isPreviewingEffects: this._normalizePortalEffects(element).some((effect) => effect.enabled !== false && effect.hover && effect.preview),
        styleString: this._buildPortalEditorElementStyle(element),
        visualStyleString: this._buildPortalEditorElementVisualStyle(element),
        label: String(element.name || element.text || tr("Portal element"))
      };
    });
  }

  _getPortalEditorSelectedElementData() {
    const elements = Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : [];
    const selected = elements.find((element) => element.id === this.portalEditorSelectedElementId) ?? null;
    if (!selected) return null;
    const type = String(selected.type || "text");
    const isPortalAvatar = Boolean(selected.media?.avatarId);
    const actionType = String(selected.action?.type || "none");
    const actionTargetOptions = this._getPortalActionTargetOptions(selected.action);
    const supportsOpenMode = ["worldMap", "portal"].includes(actionType);
    const supportsCloseCurrentPortal = ["scene", "theatreScene", "worldMap", "portal"].includes(actionType);
    const shapeType = String(selected.style?.shapeType || "rounded");
    const isShapeLike = type === "shape";
    const effectRows = this._getPortalEffectRows(selected);
    return {
      ...selected,
      typeOptions: this._getPortalElementTypeOptions(type),
      actionTypeOptions: this._getPortalActionTypeOptions(actionType),
      isMediaElement: ["image", "video"].includes(type),
      isPortalAvatar,
      isTextElement: type === "text",
      isShapeElement: type === "shape",
      supportsTextContent: type === "text",
      supportsMediaFields: ["image", "video"].includes(type) && !isPortalAvatar,
      supportsShapeFields: type === "shape",
      supportsBackgroundStyle: ["object", "text", "shape"].includes(type),
      supportsTextStyle: type === "text",
      supportsBorderStyle: ["object", "image", "video", "text", "shape"].includes(type) && !isPortalAvatar,
      showRadiusField: !isShapeLike || shapeType === "rounded",
      showKeepAspectRatio: isShapeLike && ["circle", "diamond", "triangle"].includes(shapeType),
      hasDocumentAction: actionType !== "none",
      x: this._formatPortalDecimal(selected.x, 18),
      y: this._formatPortalDecimal(selected.y, 18),
      width: this._formatPortalDecimal(selected.width, 18),
      height: this._formatPortalDecimal(selected.height, 10),
      style: {
        backgroundColor: this._normalizePortalColorInput(selected.style?.backgroundColor, "#1f2d3a"),
        textColor: this._normalizePortalColorInput(selected.style?.textColor, "#ffffff"),
        borderColor: this._normalizePortalColorInput(selected.style?.borderColor, "#dce6f2"),
        borderWidth: selected.style?.borderWidth ?? 1,
        borderRadius: selected.style?.borderRadius ?? 6,
        opacity: selected.style?.opacity ?? 1,
        backgroundOpacity: selected.style?.backgroundOpacity ?? selected.style?.opacity ?? 1,
        textOpacity: selected.style?.textOpacity ?? 1,
        shapeType,
        keepAspectRatio: Boolean(selected.style?.keepAspectRatio),
        shadow: selected.style?.shadow ?? "",
        hoverScale: selected.style?.hoverScale ?? 1.04,
        hoverOpacity: selected.style?.hoverOpacity ?? 1
      },
      shapeOptions: this._getPortalShapeOptions(selected.style?.shapeType ?? "rounded"),
      media: {
        src: selected.media?.src ?? "",
        hoverSrc: selected.media?.hoverSrc ?? "",
        fit: selected.media?.fit ?? "cover"
      },
      action: {
        type: actionType,
        documentUuid: selected.action?.documentUuid ?? "",
        documentId: selected.action?.documentId ?? "",
        theatreSceneId: selected.action?.theatreSceneId ?? "",
        worldMapId: selected.action?.worldMapId ?? "",
        portalId: selected.action?.portalId ?? "",
        openMode: normalizePortalOpenMode(selected.action?.openMode),
        closeCurrentPortal: Boolean(selected.action?.closeCurrentPortal),
        targetId: selected.action?.documentId || selected.action?.theatreSceneId || selected.action?.worldMapId || selected.action?.portalId || "",
        label: selected.action?.label || selected.action?.documentUuid || ""
      },
      hasActionTargetOptions: actionTargetOptions.length > 0,
      actionTargetOptions,
      supportsOpenMode,
      supportsCloseCurrentPortal,
      openModeOptions: this._getPortalOpenModeOptions(selected.action),
      effects: effectRows,
      effectTypeOptions: this._getPortalEffectTypeOptions(selected),
      contentLayerTypeOptions: this._getPortalContentLayerTypeOptions(),
      contentLayers: this._getPortalContentLayerRows(selected),
      canAddEffect: this._getPortalEffectTypeOptions(selected).length > 0,
      clickSound: {
        src: selected.clickSound?.src ?? "",
        volume: selected.clickSound?.volume ?? 0.7
      },
      hoverSound: {
        src: selected.hoverSound?.src ?? "",
        volume: selected.hoverSound?.volume ?? 0.45
      },
      zIndex: selected.zIndex ?? 1
    };
  }

  _buildPortalEditorElementStyle(element = {}) {
    const x = this._clampPortalNumber(element.x, PORTAL_ELEMENT_POSITION_MIN, PORTAL_ELEMENT_POSITION_MAX, 12);
    const y = this._clampPortalNumber(element.y, PORTAL_ELEMENT_POSITION_MIN, PORTAL_ELEMENT_POSITION_MAX, 12);
    const width = this._clampPortalNumber(element.width, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, 18);
    const height = this._clampPortalNumber(element.height, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, 10);
    return [
      `left:${x}%`,
      `top:${y}%`,
      `width:${width}%`,
      `height:${height}%`,
      `z-index:${Number(element.zIndex) || 1}`,
      `opacity:${this._clampPortalNumber(element.style?.opacity, 0, 1, 1)}`
    ].filter(Boolean).join(";");
  }

  _getPortalEffectStyleState(element = {}, includeHoverEffects = false, target = {}) {
    const targetMode = target.mode === "layer" ? "layer" : "object";
    const targetLayerId = String(target.layerId || "").trim();
    const effects = this._normalizePortalEffects(element).filter((effect) => effect.enabled !== false);
    const activeEffects = effects.filter((effect) => {
      const effectTargetMode = effect.targetMode === "layer" ? "layer" : "object";
      if (targetMode === "object" && effectTargetMode === "layer") return false;
      if (targetMode === "layer" && (effectTargetMode !== "layer" || String(effect.targetLayerId || "") !== targetLayerId)) return false;
      if (!includeHoverEffects && effect.hover) return false;
      if (includeHoverEffects && effect.disableOnHover) return false;
      return true;
    });
    const transforms = [];
    const filters = [];
    const backdrops = [];
    const boxShadows = [];
    let animation = "none";
    let pulseScale = 1.04;
    let pulseOpacity = 0.82;
    let scanlineOpacity = 0;
    let scanlineColor = "255, 255, 255";
    let scanlineSpacing = 7;
    let scanlineThickness = 1;
    let scanlineDuration = 0;
    let glassOpacity = 0;
    let glassColor = "220, 238, 255";
    let transitionDuration = 0.18;
    let transitionEasing = "ease";
    let floatDistance = 0;
    let floatRotation = 0;

    for (const effect of effects) {
      if (!effect.hover && !effect.disableOnHover) continue;
      transitionDuration = Math.max(transitionDuration, this._clampPortalNumber(effect.transition?.duration, 0.01, 5, 0.22));
      transitionEasing = String(effect.transition?.easing || transitionEasing);
    }

    for (const effect of activeEffects) {
      const settings = effect.settings ?? {};
      if (effect.type === "shadow" || effect.type === "glow") {
        const color = this._hexToPortalRgbString(settings.color || (effect.type === "glow" ? "#cfe8ff" : "#000000"), effect.type === "glow" ? "207, 232, 255" : "0, 0, 0");
        const opacity = this._clampPortalNumber(settings.opacity, 0, 1, effect.type === "glow" ? 0.55 : 0.28);
        const blur = this._clampPortalNumber(settings.blur, 0, 80, effect.type === "glow" ? 18 : 16);
        if (targetMode === "layer") {
          const offsetX = effect.type === "glow" ? 0 : this._clampPortalNumber(settings.x, -80, 80, 0);
          const offsetY = effect.type === "glow" ? 0 : this._clampPortalNumber(settings.y, -80, 80, 12);
          filters.push(`drop-shadow(${offsetX}px ${offsetY}px ${blur}px rgba(${color}, ${opacity}))`);
        } else if (effect.type === "glow") {
          const spread = this._clampPortalNumber(settings.spread, -20, 40, 0);
          boxShadows.push(`0 0 ${blur}px ${spread}px rgba(${color}, ${opacity})`);
        } else {
          const offsetX = this._clampPortalNumber(settings.x, -80, 80, 0);
          const offsetY = this._clampPortalNumber(settings.y, -80, 80, 12);
          boxShadows.push(`${offsetX}px ${offsetY}px ${blur}px rgba(${color}, ${opacity})`);
        }
      }
      if (effect.type === "blur") {
        const amount = this._clampPortalNumber(settings.amount, 0, 30, 2);
        if (settings.backdrop) backdrops.push(`blur(${amount}px)`);
        else filters.push(`blur(${amount}px)`);
      }
      if (effect.type === "glass") {
        const amount = this._clampPortalNumber(settings.blur, 0, 30, 10);
        const saturation = this._clampPortalNumber(settings.saturation, 0.2, 3, 1.25);
        backdrops.push(`blur(${amount}px) saturate(${saturation})`);
        glassOpacity = Math.max(glassOpacity, this._clampPortalNumber(settings.opacity, 0, 1, 0.22));
        glassColor = this._hexToPortalRgbString(settings.color, "220, 238, 255");
      }
      if (effect.type === "scanlines") {
        scanlineOpacity = Math.max(scanlineOpacity, this._clampPortalNumber(settings.opacity, 0, 1, 0.18));
        scanlineColor = this._hexToPortalRgbString(settings.color, "255, 255, 255");
        scanlineSpacing = this._clampPortalNumber(settings.spacing, 2, 40, 7);
        scanlineThickness = this._clampPortalNumber(settings.thickness, 1, 12, 1);
        scanlineDuration = this._clampPortalNumber(settings.speed, 0, 12, 0);
      }
      if (effect.type === "chroma") {
        const amount = this._clampPortalNumber(settings.amount, 0, 20, 2);
        const opacity = this._clampPortalNumber(settings.opacity, 0, 1, 0.55);
        filters.push(`drop-shadow(${amount}px 0 0 rgba(255, 36, 92, ${opacity})) drop-shadow(${-amount}px 0 0 rgba(0, 232, 255, ${opacity}))`);
      }
      if (effect.type === "rotate") transforms.push(`rotate(${this._clampPortalNumber(settings.angle, -360, 360, 0)}deg)`);
      if (effect.type === "tilt") {
        const perspective = this._clampPortalNumber(settings.perspective, 250, 1600, 700);
        const tiltX = this._clampPortalNumber(settings.x, -75, 75, 0);
        const tiltY = this._clampPortalNumber(settings.y, -75, 75, 0);
        transforms.push(`perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`);
      }
      if (effect.type === "perspectiveHover") {
        const perspective = this._clampPortalNumber(settings.perspective, 250, 1800, 800);
        const tiltX = this._clampPortalNumber(settings.x, -75, 75, 8);
        const tiltY = this._clampPortalNumber(settings.y, -75, 75, -8);
        const scale = this._clampPortalNumber(settings.scale, 0.5, 2, 1.03);
        transforms.push(`perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${scale})`);
      }
      if (effect.type === "pulse") {
        pulseScale = this._clampPortalNumber(settings.scale, 0.7, 1.6, 1.04);
        pulseOpacity = this._clampPortalNumber(settings.opacity, 0, 1, 0.82);
        animation = `tom-portal-effect-pulse ${this._clampPortalNumber(settings.duration, 0.2, 12, 1.8)}s ease-in-out infinite`;
        transforms.push("scale(var(--tom-portal-pulse-scale-current, 1))");
      }
      if (effect.type === "float") {
        floatDistance = this._clampPortalNumber(settings.distance, 0, 40, 5);
        floatRotation = this._clampPortalNumber(settings.rotation, -12, 12, 1.2);
        animation = `tom-portal-effect-float ${this._clampPortalNumber(settings.duration, 0.4, 20, 3.6)}s ease-in-out infinite`;
        transforms.push(`translateY(var(--tom-portal-float-offset, 0px)) rotate(var(--tom-portal-float-rotation, 0deg))`);
      }
    }

    return {
      transforms,
      filters,
      backdrops,
      boxShadows,
      animation,
      pulseScale,
      pulseOpacity,
      floatDistance,
      floatRotation,
      scanlineOpacity,
      scanlineColor,
      scanlineSpacing,
      scanlineThickness,
      scanlineDuration,
      glassOpacity,
      glassColor,
      transitionDuration,
      transitionEasing
    };
  }

  _portalElementHasHoverEffectControls(element = {}, target = {}) {
    const targetMode = target.mode === "layer" ? "layer" : "object";
    const targetLayerId = String(target.layerId || "").trim();
    return this._normalizePortalEffects(element)
      .filter((effect) => {
        const effectTargetMode = effect.targetMode === "layer" ? "layer" : "object";
        if (targetMode === "object") return effectTargetMode !== "layer";
        return effectTargetMode === "layer" && String(effect.targetLayerId || "") === targetLayerId;
      })
      .some((effect) => effect.enabled !== false && (effect.hover || effect.disableOnHover));
  }

  _buildPortalEditorElementVisualStyle(element = {}) {
    const style = element.style ?? {};
    const radius = Math.min(6, this._clampPortalNumber(style.borderRadius, 0, 40, 6));
    const type = String(element.type || "text");
    const isPortalAvatar = Boolean(element.media?.avatarId);
    const backgroundColor = style.backgroundColor || "#14202a";
    const backgroundOpacity = this._clampPortalNumber(style.backgroundOpacity ?? style.opacity, 0, 1, 1);
    const textColor = style.textColor || "#ffffff";
    const textOpacity = this._clampPortalNumber(style.textOpacity, 0, 1, 1);
    const shapeType = String(style.shapeType || "rounded");
    const clipPath = shapeType === "diamond"
      ? "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"
      : (shapeType === "triangle" ? "polygon(50% 0, 100% 100%, 0 100%)" : "none");
    const borderWidth = this._clampPortalNumber(style.borderWidth, 0, 12, 1);
    const visualRadius = shapeType === "circle"
      ? "999px"
      : (shapeType === "rectangle" || shapeType === "diamond" || shapeType === "triangle" ? "0" : `${radius + borderWidth}px`);
    const baseEffects = this._getPortalEffectStyleState(element, false, { mode: "object" });
    const hoverEffects = this._getPortalEffectStyleState(element, true, { mode: "object" });
    const hasHoverEffectControls = this._portalElementHasHoverEffectControls(element, { mode: "object" });
    const hoverFallback = (value, fallback) => value || (hasHoverEffectControls ? "none" : fallback);
    const hoverNumberFallback = (value, fallback) => hasHoverEffectControls ? value : fallback;
    const hasBackdropBlur = baseEffects.backdrops.length > 0 || hoverEffects.backdrops.length > 0;
    const isMediaElement = ["image", "video"].includes(type);
    const elementBackground = isPortalAvatar || (isMediaElement && hasBackdropBlur)
      ? "rgba(255, 255, 255, 0.001)"
      : `rgba(${this._hexToPortalRgbString(backgroundColor, "20, 32, 42")}, ${backgroundOpacity})`;
    return [
      "background:transparent",
      `--tom-portal-element-bg:${elementBackground}`,
      `color:rgba(${this._hexToPortalRgbString(textColor)}, ${textOpacity})`,
      isPortalAvatar
        ? "border:0"
        : `border:${borderWidth}px solid ${style.borderColor || "var(--tom-content-border-1)"}`,
      isPortalAvatar
        ? "border-radius:0"
        : `border-radius:${visualRadius}`,
      isPortalAvatar ? "clip-path:none" : `clip-path:${clipPath}`,
      `--tom-portal-editor-element-shadow:${baseEffects.boxShadows.length && !isPortalAvatar ? baseEffects.boxShadows.join(", ") : "none"}`,
      `--tom-portal-editor-element-hover-shadow:${hoverEffects.boxShadows.length && !isPortalAvatar ? hoverEffects.boxShadows.join(", ") : (hasHoverEffectControls ? "none" : "var(--tom-portal-editor-element-shadow)")}`,
      `--tom-portal-transform:${baseEffects.transforms.length ? baseEffects.transforms.join(" ") : "none"}`,
      `--tom-portal-hover-transform:${hoverFallback(hoverEffects.transforms.length ? hoverEffects.transforms.join(" ") : "", "var(--tom-portal-transform)")}`,
      `--tom-portal-filter:${baseEffects.filters.length ? baseEffects.filters.join(" ") : "none"}`,
      `--tom-portal-hover-filter:${hoverFallback(hoverEffects.filters.length ? hoverEffects.filters.join(" ") : "", "var(--tom-portal-filter)")}`,
      `--tom-portal-backdrop-filter:${baseEffects.backdrops.length ? baseEffects.backdrops.join(" ") : "none"}`,
      `--tom-portal-hover-backdrop-filter:${hoverFallback(hoverEffects.backdrops.length ? hoverEffects.backdrops.join(" ") : "", "var(--tom-portal-backdrop-filter)")}`,
      `--tom-portal-backdrop-layer-z:${baseEffects.backdrops.length ? 3 : 0}`,
      `--tom-portal-hover-backdrop-layer-z:${hoverEffects.backdrops.length ? 3 : (hasHoverEffectControls ? 0 : "var(--tom-portal-backdrop-layer-z)")}`,
      `--tom-portal-animation:${baseEffects.animation}`,
      `--tom-portal-hover-animation:${hoverEffects.animation !== "none" ? hoverEffects.animation : (hasHoverEffectControls ? "none" : "var(--tom-portal-animation)")}`,
      `--tom-portal-pulse-scale:${hoverNumberFallback(hoverEffects.pulseScale, baseEffects.pulseScale)}`,
      `--tom-portal-pulse-opacity:${hoverNumberFallback(hoverEffects.pulseOpacity, baseEffects.pulseOpacity)}`,
      `--tom-portal-float-distance:${hoverNumberFallback(hoverEffects.floatDistance, baseEffects.floatDistance)}px`,
      `--tom-portal-float-rotation-amount:${hoverNumberFallback(hoverEffects.floatRotation, baseEffects.floatRotation)}deg`,
      `--tom-portal-scanline-opacity:${baseEffects.scanlineOpacity}`,
      `--tom-portal-hover-scanline-opacity:${hoverEffects.scanlineOpacity}`,
      `--tom-portal-scanline-color:${baseEffects.scanlineColor}`,
      `--tom-portal-hover-scanline-color:${hoverEffects.scanlineColor}`,
      `--tom-portal-scanline-spacing:${baseEffects.scanlineSpacing}px`,
      `--tom-portal-hover-scanline-spacing:${hoverEffects.scanlineSpacing}px`,
      `--tom-portal-scanline-thickness:${baseEffects.scanlineThickness}px`,
      `--tom-portal-hover-scanline-thickness:${hoverEffects.scanlineThickness}px`,
      `--tom-portal-scanline-duration:${baseEffects.scanlineDuration}s`,
      `--tom-portal-hover-scanline-duration:${hoverEffects.scanlineDuration}s`,
      `--tom-portal-glass-opacity:${baseEffects.glassOpacity}`,
      `--tom-portal-hover-glass-opacity:${hoverEffects.glassOpacity}`,
      `--tom-portal-glass-color:${baseEffects.glassColor}`,
      `--tom-portal-hover-glass-color:${hoverEffects.glassColor}`,
      `--tom-portal-effect-duration:${hoverEffects.transitionDuration}s`,
      `--tom-portal-effect-easing:${hoverEffects.transitionEasing}`
    ].filter(Boolean).join(";");
  }

  _getPortalAvatarRenderData(avatarId, fallbackImage = "", { baked = false } = {}) {
    const avatar = TheatreStore.getAvatarById(avatarId);
    if (!avatar) return null;
    const actor = avatar.actorId ? getActorById(avatar.actorId) : null;
    const bakedImage = String(avatar.tokenImage || "").trim();
    const useBakedImage = Boolean(baked && bakedImage);
    const thumbnail = useBakedImage ? bakedImage : getAvatarLibraryThumbnail(avatar, actor, fallbackImage);
    return {
      id: avatar.id,
      name: avatar.name || actor?.name || tr("Avatar"),
      thumbnail,
      image: thumbnail,
      frameImage: useBakedImage ? "" : avatar.frameImage || "",
      actorId: avatar.actorId || "",
      useCircularCrop: useBakedImage ? false : Boolean(avatar.useCircularCrop),
      showBackdrop: useBakedImage ? false : avatar.showBackdrop !== false,
      thumbnailStyle: useBakedImage ? "" : this._buildAvatarThumbnailStyle(avatar),
      imageStackStyle: useBakedImage ? "" : buildAvatarImageStackStyle(thumbnail),
      isBaked: useBakedImage,
      hasImage: Boolean(thumbnail),
      hasAvatarThumbnail: Boolean(thumbnail)
    };
  }

  _getPortalEditorSurfaceRect() {
    const surface = this.form?.querySelector?.("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  _getPortalContextMenuPosition(event, menuWidth = 190, menuHeight = 240) {
    const surface = event.currentTarget?.closest?.("[data-portal-editor-surface]")
      ?? this.form?.querySelector?.("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect?.();
    const layoutWidth = surface instanceof HTMLElement ? surface.offsetWidth : 0;
    const layoutHeight = surface instanceof HTMLElement ? surface.offsetHeight : 0;
    if (!rect || rect.width <= 0 || rect.height <= 0 || layoutWidth <= 0 || layoutHeight <= 0) {
      const maxX = Math.max(6, window.innerWidth - menuWidth);
      const maxY = Math.max(6, window.innerHeight - menuHeight);
      return {
        x: this._clampPortalNumber(event.clientX, 6, maxX, 12),
        y: this._clampPortalNumber(event.clientY, 6, maxY, 12),
        inverseScale: 1
      };
    }
    const scaleX = rect.width / Math.max(1, layoutWidth);
    const scaleY = rect.height / Math.max(1, layoutHeight);
    const scale = Math.max(0.1, Math.min(8, Math.min(scaleX, scaleY) || 1));
    const localX = (event.clientX - rect.left) / scaleX;
    const localY = (event.clientY - rect.top) / scaleY;
    const maxX = Math.max(6, layoutWidth - (menuWidth / scale));
    const maxY = Math.max(6, layoutHeight - (menuHeight / scale));
    return {
      x: this._clampPortalNumber(localX, 6, maxX, 12),
      y: this._clampPortalNumber(localY, 6, maxY, 12),
      inverseScale: 1 / scale
    };
  }

  _correctPortalContextMenuPosition() {
    const menu = this.form?.querySelector?.(".tom-portal-editor-context-menu");
    if (!(menu instanceof HTMLElement)) return;
    if (getComputedStyle(menu).position !== "fixed") return;
    const requestedX = Number(menu.dataset.portalContextClientX);
    const requestedY = Number(menu.dataset.portalContextClientY);
    if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return;
    const rect = menu.getBoundingClientRect();
    const targetX = this._clampPortalNumber(requestedX, 6, Math.max(6, window.innerWidth - rect.width - 6), requestedX);
    const targetY = this._clampPortalNumber(requestedY, 6, Math.max(6, window.innerHeight - rect.height - 6), requestedY);
    const nextLeft = (Number.parseFloat(menu.style.left) || 0) + (targetX - rect.left);
    const nextTop = (Number.parseFloat(menu.style.top) || 0) + (targetY - rect.top);
    menu.style.left = `${nextLeft}px`;
    menu.style.top = `${nextTop}px`;
  }

  _getPortalElementLockedPixelAspect(element = {}, drag = null) {
    if (element.media?.avatarId) return 1;
    const shapeType = String(element.style?.shapeType || "");
    if (["circle", "diamond", "triangle"].includes(shapeType)) return 1;
    const rect = drag?.rect ?? this._getPortalEditorSurfaceRect();
    const width = Math.max(0.1, Number(drag?.startWidth ?? element.width) || 8);
    const height = Math.max(0.1, Number(drag?.startHeight ?? element.height) || 8);
    if (!rect) return width / height;
    return (width * rect.width) / Math.max(0.1, height * rect.height);
  }

  _applyPortalElementPixelAspect(element, aspect = 1) {
    const rect = this._getPortalEditorSurfaceRect();
    if (!element || !rect) return;
    let width = this._clampPortalNumber(Number(element.width) || 8, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, 8);
    let height = (width * rect.width) / Math.max(1, aspect * rect.height);
    if (height > PORTAL_ELEMENT_SIZE_MAX) {
      height = PORTAL_ELEMENT_SIZE_MAX;
      width = (height * aspect * rect.height) / Math.max(1, rect.width);
    }
    element.width = this._clampPortalNumber(width, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, width);
    element.height = this._clampPortalNumber(height, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, height);
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

    if (this.activeTab === "portals" && this.portalEditor) {
      return {
        title: this.portalEditor.name || tr("Edit portal"),
        description: tr("Configure an interactive landing page with background media and portal behavior."),
        showCancelPortalEditor: true,
        showSavePortalEditor: true
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

    if (this.activeTab === "portals") {
      return {
        title: tr("Portal Library"),
        description: tr("Build interactive landing pages with backgrounds, hover media, sounds, and Foundry links."),
        showCreatePortal: true
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

  _buildAvatarThumbnailStyle(avatar = {}) {
    return [
      `--tom-avatar-thumb-crop-scale:${Math.max(0.7, Math.min(3, Number(avatar.circularCropScale ?? 1) || 1))}`,
      `--tom-avatar-thumb-crop-offset-x:${cropOffsetToPercent(avatar.cropOffsetX)}`,
      `--tom-avatar-thumb-crop-offset-y:${cropOffsetToPercent(avatar.cropOffsetY)}`,
      `--tom-avatar-thumb-frame-fit-scale:${Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale ?? 1) || 1))}`
    ].join(";");
  }

  _getDefaultSoundPlaylistData() {
    return {
      id: "",
      name: "",
      globalPlayer: false,
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
      globalPlayer: Boolean(playlist.globalPlayer),
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
        displayIndex: index + 1,
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
        displayIndex: index + 1,
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

  _getLibraryLogoSrc(theme) {
    const luminance = this._getNavigationSurfaceLuminance(theme);
    return luminance >= 0.58
      ? `modules/${MODULE_ID}/assets/ui/logo_dark.webp`
      : `modules/${MODULE_ID}/assets/ui/logo.webp`;
  }

  _getNavigationSurfaceLuminance(theme) {
    const stops = [theme?.navigation?.surfaceStart, theme?.navigation?.surfaceEnd]
      .map((stop) => this._colorStopLuminance(stop))
      .filter((value) => Number.isFinite(value));
    if (!stops.length) return 0;
    return stops.reduce((sum, value) => sum + value, 0) / stops.length;
  }

  _colorStopLuminance(stop) {
    const rgb = this._hexToRgb(stop?.color);
    if (!rgb) return NaN;
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
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
    this._closeStageGoblinTargetMenu();
    bindFootlightsToggleSwitches(html?.[0]);
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
    this._bindPortalEditorListeners(html);
    this._applyPortalEditorStageState();
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
    if (!["scenes", "avatars", "sounds", "maps", "portals"].includes(this.activeTab)) return;
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
    this._applyPortalEditorStageState();
    if (this.activeTab === "settings") {
      this._syncThemeSectionLayouts();
    }
    if (this.activeTab === "mindmap" && this.inlinePlannerApp) {
      this.inlinePlannerApp._setResizeVisualState?.(true);
      this._scheduleInlinePlannerResizeVisualStateClear();
    }
    return result;
  }

  _isPortalEditorStageActive() {
    return this.activeTab === "portals" && Boolean(this.portalEditor);
  }

  _applyPortalEditorStageState() {
    const active = this._isPortalEditorStageActive();
    const root = this.element?.[0];
    root?.classList?.toggle("tom-portal-stage-editor-host", active);
    if (!active) {
      this._clearPortalEditorStageState();
      return;
    }
    document.body?.classList.add("tom-overlay-active", "tom-portal-editor-stage-active", "tom-ui-hidden");
  }

  _clearPortalEditorStageState() {
    this.element?.[0]?.classList?.remove("tom-portal-stage-editor-host");
    const body = document.body;
    if (!body) return;
    body.classList.remove("tom-portal-editor-stage-active", "tom-shared-right-sidebar-open");
    if (!body.classList.contains("tom-portal-stage-active") && !body.classList.contains("tom-world-map-stage-active")) {
      body.classList.remove("tom-overlay-active");
    }
    if (!body.classList.contains("tom-overlay-active") && !body.classList.contains("tom-portal-stage-active")) {
      body.classList.remove("tom-ui-hidden");
    }
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
    html.find("[data-action='add-stage-goblin-entry']").on("click", this._onAddStageGoblinEntry.bind(this));
  }

  _bindSceneLibraryListeners(html) {
    html.find("[data-action='create-scene']").on("click", this._onCreateScene.bind(this));
    html.find("[data-action='edit-scene']").on("click", this._onEditScene.bind(this));
    html.find("[data-action='activate-scene']").on("click", this._onActivateScene.bind(this));
    html.find("[data-action='deactivate-scene']").on("click", this._onDeactivateScene.bind(this));
    html.find("[data-action='create-scene-macro']").on("click", this._onCreateSceneMacro.bind(this));
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
    html.find(".tom-range-with-value input[type='range']").on("input change", this._onRangeValueInput.bind(this));
    html.find("[name='sceneEditor.background'], [name='sceneEditor.settings.boxed'], [name='sceneEditor.settings.backgroundFullscreenFit'], [name='sceneEditor.settings.preserveBackgroundAspect'], [name='sceneEditor.settings.cinematicBars'], [name='sceneEditor.settings.backdropBlurEnabled'], [name='sceneEditor.settings.backdropImage'], [name='sceneEditor.settings.backdropImageScale'], [name='sceneEditor.settings.backdropImageRepeat'], [name='sceneEditor.settings.backdropDarkness'], [name='sceneEditor.settings.transitionEffect'], [name='sceneEditor.settings.transitionDuration'], [name='sceneEditor.settings.transitionIntensity']").on("input change", this._onSceneEditorLivePreviewInput.bind(this));
    html.find("[data-action='toggle-scene-editor-section']").on("click", this._onToggleSceneEditorSection.bind(this));
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

  _bindAvatarLibraryListeners(html) {
    html.find("[data-action='create-avatar']").on("click", this._onCreateAvatar.bind(this));
    html.find("[data-action='edit-avatar']").on("click", this._onEditAvatar.bind(this));
    html.find("[data-action='delete-avatar']").on("click", this._onDeleteAvatar.bind(this));
    html.find("[data-action='cancel-avatar-editor']").on("click", this._onCancelAvatarEditor.bind(this));
    html.find("[data-action='save-avatar-editor']").on("click", this._onSaveAvatarEditor.bind(this));
    html.find("[data-drag-avatar='true']").on("dragstart", this._onDragAvatarStart.bind(this));
    html.find("[data-drag-avatar='true']").on("dragend", this._onDragAvatarEnd.bind(this));
    html.find("[data-drag-theatre-scene='true']").on("dragstart", this._onDragSceneStart.bind(this));
    html.find("[name='avatarLibrary.tokenDefaults.useCircularCrop']").on("change", this._onAvatarDefaultsSwitchChanged.bind(this));
    html.find("[name^='avatarLibrary.']").not("[name='avatarLibrary.tokenDefaults.useCircularCrop']").on("change", this._onAvatarLibraryDefaultsChanged.bind(this));
    html.find("[name='avatarEditor.defaultImage'], [name='avatarEditor.frameImage'], [name='avatarEditor.useCircularCrop'], [name='avatarEditor.showBackdrop'], [name='avatarEditor.circularCropScale'], [name='avatarEditor.frameFitScale']").on("input change", this._onAvatarEditorPreviewInput.bind(this));
    html.find("[data-avatar-preview-stack]").on("pointerdown", this._onAvatarPreviewCropPointerDown.bind(this));
    if (this.avatarEditor) window.requestAnimationFrame(() => this._syncAvatarEditorPreview());
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
    html.find("[data-drag-stage-goblin-sound='true']").on("dragstart", this._onStageGoblinLibraryDragStart.bind(this));
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
    html.find("[data-action='export-map-package']").on("click", this._onExportMapPackage.bind(this));
    html.find("[data-action='import-map-package']").on("click", this._onImportMapPackage.bind(this));
    html.find("[data-action='create-map-macro']").on("click", this._onCreateMapMacro.bind(this));
    html.find("[data-action='create-map-stage-macro']").on("click", this._onCreateMapStageMacro.bind(this));
    html.find("[data-drag-stage-goblin-map='true']").on("dragstart", this._onMapLibraryDragStart.bind(this));
    html.find("[data-action='create-portal']").on("click", this._onCreatePortal.bind(this));
    html.find("[data-action='edit-portal']").on("click", this._onEditPortal.bind(this));
    html.find("[data-action='cancel-portal-editor']").on("click", this._onCancelPortalEditor.bind(this));
    html.find("[data-action='save-portal-editor']").on("click", this._onSavePortalEditor.bind(this));
    html.find("[data-action='open-portal']").on("click", this._onOpenPortal.bind(this));
    html.find("[data-action='open-portal-stage']").on("click", this._onOpenPortalStage.bind(this));
    html.find("[data-action='close-portal']").on("click", this._onClosePortal.bind(this));
    html.find("[data-action='close-portal-stage']").on("click", this._onClosePortalStage.bind(this));
    html.find("[data-action='force-portal']").on("click", this._onForcePortal.bind(this));
    html.find("[data-action='force-portal-stage']").on("click", this._onForcePortalStage.bind(this));
    html.find(".tom-portal-library-play-menu").on("toggle", this._onPortalPlayMenuToggle.bind(this));
    html.find("[data-action='duplicate-portal']").on("click", this._onDuplicatePortal.bind(this));
    html.find("[data-action='delete-portal']").on("click", this._onDeletePortal.bind(this));
    html.find("[data-action='create-portal-macro']").on("click", this._onCreatePortalMacro.bind(this));
    html.find("[data-action='create-portal-stage-macro']").on("click", this._onCreatePortalStageMacro.bind(this));
    html.find("[data-drag-stage-goblin-portal='true']").on("dragstart", this._onPortalLibraryDragStart.bind(this));
  }

  _bindPortalEditorListeners(html) {
    if (!(this.activeTab === "portals" && this.portalEditor)) return;
    this._restorePortalContentLayerRawTextareas(html);
    html.find("[data-portal-editor-surface]").on("contextmenu", this._onPortalCanvasContextMenu.bind(this));
    html.find("[data-portal-editor-surface]").on("click", this._onPortalCanvasClick.bind(this));
    html.find("[data-portal-editor-canvas]").on("wheel", this._onPortalEditorCanvasWheel.bind(this));
    html.find("[data-portal-editor-canvas]").on("pointerdown", this._onPortalEditorCanvasPointerDown.bind(this));
    html.find("[data-portal-editor-element-id]").on("click", this._onPortalElementSelect.bind(this));
    html.find("[data-portal-editor-element-id]").on("contextmenu", this._onPortalElementContextMenu.bind(this));
    html.find("[data-portal-editor-element-id]").on("pointerdown", this._onPortalElementPointerDown.bind(this));
    html.find("[data-portal-resize-handle]").on("pointerdown", this._onPortalElementResizePointerDown.bind(this));
    html.find("[data-action='portal-context-menu-action']").on("click", this._onPortalContextMenuAction.bind(this));
    html.find("[data-action='close-portal-context-menu']").on("click", this._onClosePortalContextMenu.bind(this));
    html.find("[data-action='set-portal-sidebar-tab']").on("click", this._onSetPortalSidebarTab.bind(this));
    html.find("[data-action='toggle-portal-editor-foundry-right-sidebar']").on("click", this._onTogglePortalEditorFoundryRightSidebar.bind(this));
    html.find("[data-action='toggle-portal-editor-object-frames']").on("click", this._onTogglePortalEditorObjectFrames.bind(this));
    html.find("[data-action='toggle-portal-crop-mode']").on("click", this._onTogglePortalCropMode.bind(this));
    html.find("[data-portal-crop-handle]").on("pointerdown", this._onPortalCropHandlePointerDown.bind(this));
    html.find("[data-portal-editor-fieldset], [data-portal-effect-subsection]").on("toggle", this._onPortalEditorDisclosureToggle.bind(this));
    html.find("[data-action='select-portal-element']").on("click", this._onSelectPortalElementFromList.bind(this));
    html.find("[data-action='toggle-portal-element-visibility']").on("click", this._onTogglePortalElementVisibility.bind(this));
    html.find("[data-action='duplicate-portal-element']").on("click", this._onDuplicatePortalElement.bind(this));
    html.find("[data-action='delete-portal-element']").on("click", this._onDeletePortalElement.bind(this));
    html.find("[data-action='portal-layer']").on("click", this._onPortalLayerAction.bind(this));
    html.find("[data-action='add-portal-content-layer']").on("click", this._onAddPortalContentLayer.bind(this));
    html.find("[data-action='delete-portal-content-layer']").on("click", this._onDeletePortalContentLayer.bind(this));
    html.find("[data-action='toggle-portal-content-layer']").on("click", this._onTogglePortalContentLayer.bind(this));
    html.find("[data-action='toggle-portal-content-layer-expanded']").on("click", this._onTogglePortalContentLayerExpanded.bind(this));
    html.find("[data-action='move-portal-content-layer']").on("click", this._onMovePortalContentLayer.bind(this));
    html.find("[data-portal-content-layer-drag-handle]").on("dragstart", this._onPortalContentLayerDragStart.bind(this));
    html.find("[data-portal-content-layer-card-id]").on("dragover", this._onPortalContentLayerDragOver.bind(this));
    html.find("[data-portal-content-layer-card-id]").on("dragleave", this._onPortalContentLayerDragLeave.bind(this));
    html.find("[data-portal-content-layer-card-id]").on("drop", this._onPortalContentLayerDrop.bind(this));
    html.find("[data-portal-content-layer-drag-handle]").on("dragend", this._onPortalContentLayerDragEnd.bind(this));
    html.find("[data-action='add-portal-effect']").on("click", this._onAddPortalEffect.bind(this));
    html.find("[data-action='delete-portal-effect']").on("click", this._onDeletePortalEffect.bind(this));
    html.find("[data-action='toggle-portal-effect-expanded']").on("click", this._onTogglePortalEffectExpanded.bind(this));
    html.find("[data-action='move-portal-effect']").on("click", this._onMovePortalEffect.bind(this));
    html.find("[data-portal-effect-drag-handle]").on("dragstart", this._onPortalEffectDragStart.bind(this));
    html.find("[data-portal-effect-id]").on("dragover", this._onPortalEffectDragOver.bind(this));
    html.find("[data-portal-effect-id]").on("dragleave", this._onPortalEffectDragLeave.bind(this));
    html.find("[data-portal-effect-id]").on("drop", this._onPortalEffectDrop.bind(this));
    html.find("[data-portal-effect-drag-handle]").on("dragend", this._onPortalEffectDragEnd.bind(this));
    html.find("[data-portal-document-dropzone]").on("dragover", this._onPortalDocumentDragOver.bind(this));
    html.find("[data-portal-document-dropzone]").on("dragleave", this._onPortalDocumentDragLeave.bind(this));
    html.find("[data-portal-document-dropzone]").on("drop", this._onPortalDocumentDrop.bind(this));
    html.find("[data-action='clear-portal-document']").on("click", this._onClearPortalDocument.bind(this));
    html.find("[name^='portalElement.']").on("input change", this._onPortalElementFieldChanged.bind(this));
    html.find("[name^='portalContentLayer.']").on("input change", this._onPortalContentLayerFieldChanged.bind(this));
    html.find("[data-portal-content-layer-raw-id][data-portal-content-layer-raw-field]").on("input change", this._onPortalContentLayerRawFieldChanged.bind(this));
    html.find("[name^='portalEffect.']").on("input change", this._onPortalEffectFieldChanged.bind(this));
    html.find("[name^='portalEditor.']").on("input change", this._onPortalEditorFieldChanged.bind(this));
    this._activatePortalEditorSurfaceSizing(html?.[0]);
    window.requestAnimationFrame(() => this._correctPortalContextMenuPosition());
  }

  _findPortalContentLayerById(layerId) {
    const id = String(layerId || "").trim();
    if (!id) return null;
    for (const element of Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : []) {
      if (!Array.isArray(element?.contentLayers)) continue;
      const layer = element.contentLayers.find((entry) => String(entry.id) === id);
      if (layer) return layer;
    }
    return null;
  }

  _restorePortalContentLayerRawTextareas(html) {
    const root = html?.[0] ?? html;
    if (!(root instanceof HTMLElement)) return;
    root.querySelectorAll("[data-portal-content-layer-raw-id][data-portal-content-layer-raw-field]").forEach((textarea) => {
      const layer = this._findPortalContentLayerById(textarea.dataset.portalContentLayerRawId);
      const field = String(textarea.dataset.portalContentLayerRawField || "").trim();
      if (!(textarea instanceof HTMLTextAreaElement) || !layer || !["html", "css"].includes(field)) return;
      this._applyPortalContentLayerDraftsToLayer(layer);
      textarea.value = String(layer[field] ?? "");
    });
  }

  _syncPortalContentLayerRawFieldsFromForm() {
    if (!this.portalEditor || !this.form) return;
    this.form.querySelectorAll("[data-portal-content-layer-raw-id][data-portal-content-layer-raw-field]").forEach((textarea) => {
      const layer = this._findPortalContentLayerById(textarea.dataset.portalContentLayerRawId);
      const field = String(textarea.dataset.portalContentLayerRawField || "").trim();
      if (!(textarea instanceof HTMLTextAreaElement) || !layer || !["html", "css"].includes(field)) return;
      const previousValue = layer[field];
      layer[field] = this._rememberPortalContentLayerDraft(layer.id, field, textarea.value, previousValue) ?? layer[field];
    });
  }

  _activatePortalEditorSurfaceSizing(root) {
    this._portalEditorResizeObserver?.disconnect?.();
    this._portalEditorResizeObserver = null;
    if (this._onPortalEditorWindowResize) {
      window.removeEventListener("resize", this._onPortalEditorWindowResize);
      this._onPortalEditorWindowResize = null;
    }
    const canvas = root?.querySelector?.("[data-portal-editor-canvas]");
    const surface = root?.querySelector?.("[data-portal-editor-surface]");
    if (!canvas || !surface) return;
    const update = () => this._updatePortalEditorSurfaceSize(canvas, surface);
    const media = surface.querySelector(".tom-portal-editor-canvas__background-probe, .tom-portal-editor-canvas__background");
    if (media) {
      media.addEventListener("load", update, { once: true });
      media.addEventListener("loadedmetadata", update, { once: true });
    }
    if ("ResizeObserver" in window) {
      this._portalEditorResizeObserver = new ResizeObserver(update);
      this._portalEditorResizeObserver.observe(canvas);
    } else {
      this._onPortalEditorWindowResize = update;
      window.addEventListener("resize", this._onPortalEditorWindowResize, { passive: true });
    }
    requestAnimationFrame(update);
  }

  _getPortalEditorBackgroundLayout() {
    const settings = this.portalEditor?.settings ?? {};
    const mode = normalizePortalBackgroundPositionMode(settings.backgroundPositionMode);
    return {
      fit: normalizePortalBackgroundFit(settings.backgroundFit),
      repeat: normalizePortalBackgroundRepeat(settings.backgroundRepeat),
      positionMode: mode,
      x: mode === "custom" ? clampPortalPercent(settings.backgroundPositionX) : 50,
      y: mode === "custom" ? clampPortalPercent(settings.backgroundPositionY) : 50
    };
  }

  _buildPortalEditorBackgroundMediaStyle() {
    const background = String(this.portalEditor?.background || "").trim();
    const settings = this.portalEditor?.settings ?? {};
    const layout = this._getPortalEditorBackgroundLayout();
    const position = `${layout.x}% ${layout.y}%`;
    const fit = layout.fit === "fill" ? "fill" : layout.fit;
    const isOverride = Boolean(settings.surfaceOverrideEnabled);
    if (this.portalEditor?.backgroundType !== "video" && background && layout.repeat !== "no-repeat") {
      const size = isOverride
        ? (layout.fit === "cover" ? "100% auto" : (layout.fit === "fill" ? "100% 100%" : (layout.fit === "none" ? "auto" : "calc(var(--tom-portal-background-width-ratio, 1) * 100%) calc(var(--tom-portal-background-height-ratio, 1) * 100%)")))
        : (layout.fit === "fill" ? "100% 100%" : (layout.fit === "none" ? "auto" : layout.fit));
      return [
        `background-image:url("${escapePortalStyleUrl(background)}")`,
        `background-position:${position}`,
        `background-repeat:${layout.repeat}`,
        `background-size:${size}`
      ].join(";");
    }
    if (isOverride) {
      const sizeStyles = layout.fit === "cover"
        ? ["width:100%", "height:auto", "max-width:none", "max-height:none"]
        : (layout.fit === "fill"
          ? ["width:100%", "height:100%"]
          : (layout.fit === "none"
            ? ["width:auto", "height:auto", "max-width:none", "max-height:none"]
            : ["width:calc(var(--tom-portal-background-width-ratio, 1) * 100%)", "height:calc(var(--tom-portal-background-height-ratio, 1) * 100%)", "max-width:none", "max-height:none"]));
      return [
        "position:absolute",
        "inset:auto",
        "left:calc(50% + var(--tom-portal-background-offset-x, 0%))",
        "top:calc(50% + var(--tom-portal-background-offset-y, 0%))",
        "transform:translate(-50%, -50%)",
        `object-fit:${fit}`,
        `object-position:${position}`,
        ...sizeStyles
      ].join(";");
    }
    return [
      `object-fit:${fit}`,
      `object-position:${position}`
    ].join(";");
  }

  _getPortalEditorSurfaceAspectOverride() {
    const settings = this.portalEditor?.settings ?? {};
    if (!settings.surfaceOverrideEnabled) return "";
    const width = Math.max(1, Math.min(64, Number(settings.surfaceAspectWidth) || 16));
    const height = Math.max(1, Math.min(64, Number(settings.surfaceAspectHeight) || 9));
    return (width / height).toFixed(6);
  }

  _getPortalEditorSurfaceAspect(surface) {
    const overrideAspect = Number(surface?.dataset?.portalSurfaceAspect || 0);
    if (Number.isFinite(overrideAspect) && overrideAspect > 0) return overrideAspect;
    return this._getPortalEditorBackgroundMediaAspect(surface) || 16 / 9;
  }

  _getPortalEditorBackgroundMediaAspect(surface) {
    const media = surface?.querySelector?.(".tom-portal-editor-canvas__background-probe, .tom-portal-editor-canvas__background");
    const width = Number(media?.naturalWidth || media?.videoWidth || 0);
    const height = Number(media?.naturalHeight || media?.videoHeight || 0);
    return width > 0 && height > 0 ? width / height : null;
  }

  _updatePortalEditorBackgroundOverrideSizing(surface, surfaceAspect) {
    const settings = this.portalEditor?.settings ?? {};
    const fit = normalizePortalBackgroundFit(settings.backgroundFit);
    if (!settings.surfaceOverrideEnabled || fit !== "contain") {
      surface.style.removeProperty("--tom-portal-background-width-ratio");
      surface.style.removeProperty("--tom-portal-background-height-ratio");
      return;
    }
    const mediaAspect = this._getPortalEditorBackgroundMediaAspect(surface);
    const storedWidthRatio = Number(settings.backgroundCropWidthRatio);
    const storedHeightRatio = Number(settings.backgroundCropHeightRatio);
    if (Number.isFinite(storedWidthRatio) && storedWidthRatio > 0 && Number.isFinite(storedHeightRatio) && storedHeightRatio > 0) {
      surface.style.setProperty("--tom-portal-background-width-ratio", String(Math.max(0.05, Math.min(20, storedWidthRatio))));
      surface.style.setProperty("--tom-portal-background-height-ratio", String(Math.max(0.05, Math.min(20, storedHeightRatio))));
      surface.style.setProperty("--tom-portal-background-offset-x", `${Math.max(-200, Math.min(200, Number(settings.backgroundCropOffsetX) || 0))}%`);
      surface.style.setProperty("--tom-portal-background-offset-y", `${Math.max(-200, Math.min(200, Number(settings.backgroundCropOffsetY) || 0))}%`);
      return;
    }
    if (!Number.isFinite(mediaAspect) || mediaAspect <= 0 || !Number.isFinite(surfaceAspect) || surfaceAspect <= 0) {
      surface.style.setProperty("--tom-portal-background-width-ratio", "1");
      surface.style.setProperty("--tom-portal-background-height-ratio", "1");
      surface.style.setProperty("--tom-portal-background-offset-x", "0%");
      surface.style.setProperty("--tom-portal-background-offset-y", "0%");
      return;
    }
    if (surfaceAspect > mediaAspect) {
      surface.style.setProperty("--tom-portal-background-width-ratio", String(mediaAspect / surfaceAspect));
      surface.style.setProperty("--tom-portal-background-height-ratio", "1");
    } else {
      surface.style.setProperty("--tom-portal-background-width-ratio", "1");
      surface.style.setProperty("--tom-portal-background-height-ratio", String(surfaceAspect / mediaAspect));
    }
    surface.style.setProperty("--tom-portal-background-offset-x", "0%");
    surface.style.setProperty("--tom-portal-background-offset-y", "0%");
  }

  _updatePortalEditorSurfaceSize(canvas, surface) {
    const canvasRect = canvas.getBoundingClientRect();
    const aspect = this._getPortalEditorSurfaceAspect(surface);
    if (!canvasRect.width || !canvasRect.height || !Number.isFinite(aspect) || aspect <= 0) return;
    const canvasAspect = canvasRect.width / canvasRect.height;
    const width = canvasAspect > aspect ? canvasRect.height * aspect : canvasRect.width;
    const height = canvasAspect > aspect ? canvasRect.height : canvasRect.width / aspect;
    surface.style.width = `${Math.max(1, width)}px`;
    surface.style.height = `${Math.max(1, height)}px`;
    this._updatePortalEditorBackgroundOverrideSizing(surface, aspect);
  }

  _setPortalEditorZoom(value) {
    this.portalEditorZoom = Math.max(0.35, Math.min(3, Number(value) || 1));
    const canvas = this.form?.querySelector?.("[data-portal-editor-canvas]");
    canvas?.style?.setProperty("--tom-portal-editor-zoom", this.portalEditorZoom.toFixed(2));
    const label = this.form?.querySelector?.("[data-portal-editor-zoom-label]");
    if (label) label.textContent = `${Math.round(this.portalEditorZoom * 100)}%`;
  }

  _setPortalEditorPan(x = 0, y = 0) {
    this.portalEditorPanX = Math.max(-2400, Math.min(2400, Number(x) || 0));
    this.portalEditorPanY = Math.max(-2400, Math.min(2400, Number(y) || 0));
    const canvas = this.form?.querySelector?.("[data-portal-editor-canvas]");
    canvas?.style?.setProperty("--tom-portal-editor-pan-x", `${this.portalEditorPanX.toFixed(1)}px`);
    canvas?.style?.setProperty("--tom-portal-editor-pan-y", `${this.portalEditorPanY.toFixed(1)}px`);
  }

  _resetPortalEditorViewport() {
    this.portalEditorZoom = 1;
    this.portalEditorPanX = 0;
    this.portalEditorPanY = 0;
  }

  _onPortalEditorCanvasWheel(event) {
    const originalEvent = event?.originalEvent ?? event;
    if (!this.portalEditor || !originalEvent) return;
    originalEvent.preventDefault?.();
    const delta = Math.sign(Number(originalEvent.deltaY) || 0);
    if (!delta) return;
    const step = originalEvent.shiftKey ? 0.05 : 0.1;
    this._setPortalEditorZoom(this.portalEditorZoom + (delta < 0 ? step : -step));
  }

  _onPortalEditorCanvasPointerDown(event) {
    if (event.button !== 0 || !this.portalEditor) return;
    if (event.target?.closest?.("[data-portal-editor-element-id], .tom-portal-editor-context-menu, .tom-portal-editor-canvas-tools, button, input, select, textarea, label")) return;
    event.preventDefault();
    this._syncPortalEditorFromForm();
    this._portalEditorSuppressNextCanvasClick = false;
    this.portalEditorContextMenu = null;
    this.form?.querySelector?.(".tom-portal-editor-context-menu")?.remove?.();
    event.currentTarget.classList?.add("is-panning");
    this._portalEditorDragState = {
      mode: "pan",
      canvas: event.currentTarget,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: this.portalEditorPanX,
      startPanY: this.portalEditorPanY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this._onPortalEditorPointerMove);
    document.addEventListener("pointerup", this._onPortalEditorPointerUp, { once: true });
  }

  _bindSettingsListeners(html) {
    html.find("[data-action='save-moods']").on("click", this._onSaveMoods.bind(this));
    html.find("[data-action='apply-theme-preset']").on("click", this._onApplyThemePreset.bind(this));
    html.find("[data-action='create-theme-preset']").on("click", this._onCreateThemePreset.bind(this));
    html.find("[data-action='export-theme-preset']").on("click", this._onExportThemePreset.bind(this));
    html.find("[data-action='import-theme-preset']").on("click", this._onImportThemePreset.bind(this));
    html.find("[data-action='overwrite-theme-preset']").on("click", this._onOverwriteThemePreset.bind(this));
    html.find("[data-action='delete-theme-preset']").on("click", this._onDeleteThemePreset.bind(this));
    html.find("[data-action='select-theme-item']").on("click", this._onSelectThemeItem.bind(this));
    html.find("[data-action='select-theme-item']").on("keydown", this._onThemeItemKeydown.bind(this));
    html.find("[data-action='toggle-theme-section']").on("click", this._onToggleThemeSection.bind(this));
    html.find("[name^='themeEditor.']").on("input change", this._onThemeEditorInput.bind(this));
    html.find("[data-action='adjust-stage-goblin-bar-count']").on("click", this._onAdjustStageGoblinBarCount.bind(this));
    html.find("[name='stageGoblin.showLabels'], [name^='stageGoblin.bars.']").on("input change", this._onStageGoblinSetupInput.bind(this));
    requestAnimationFrame(() => this._syncStageGoblinSetupDom());
  }

  async _onAdjustStageGoblinBarCount(event) {
    event.preventDefault();
    const input = this.form?.querySelector?.("[name='stageGoblin.barCount']");
    const currentCount = Math.max(1, Math.min(5, Math.round(Number(input?.value) || 1)));
    const delta = Math.trunc(Number(event.currentTarget?.dataset?.stageGoblinCountDelta) || 0);
    const nextCount = Math.max(1, Math.min(5, currentCount + delta));
    if (input) input.value = String(nextCount);
    this._syncStageGoblinSetupDom(nextCount);
    await this._saveStageGoblinSetupFromForm();
  }

  _onStageGoblinSetupInput(event) {
    const toggle = event.currentTarget?.closest?.(".tom-toggle-switch");
    if (toggle) toggle.classList.toggle("is-checked", Boolean(event.currentTarget?.checked));
    this._syncStageGoblinSetupDom();
    clearTimeout(this._stageGoblinSetupSaveTimeout);
    this._stageGoblinSetupSaveTimeout = window.setTimeout(() => {
      this._stageGoblinSetupSaveTimeout = null;
      this._saveStageGoblinSetupFromForm();
    }, 160);
  }

  _syncStageGoblinSetupDom(count = null) {
    const input = this.form?.querySelector?.("[name='stageGoblin.barCount']");
    const resolvedCount = Math.max(1, Math.min(5, Math.round(Number(count ?? input?.value) || 1)));
    if (input) input.value = String(resolvedCount);
    this.form?.querySelectorAll?.("[data-stage-goblin-bar-count]").forEach((element) => {
      element.textContent = String(resolvedCount);
    });
    this.form?.querySelectorAll?.("[data-action='adjust-stage-goblin-bar-count']").forEach((button) => {
      const delta = Math.trunc(Number(button.dataset.stageGoblinCountDelta) || 0);
      button.disabled = (delta < 0 && resolvedCount <= 1) || (delta > 0 && resolvedCount >= 5);
    });
    this.form?.querySelectorAll?.("[data-stage-goblin-setup-bar-index]").forEach((element) => {
      const index = Number(element.dataset.stageGoblinSetupBarIndex) || 0;
      element.classList.toggle("is-hidden", index > resolvedCount);
      const nameInput = element.querySelector("[name$='.label']");
      const colorInput = element.querySelector("[name$='.tagColor']");
      const textColorInput = element.querySelector("[name$='.tagTextColor']");
      const preview = element.querySelector(".tom-stage-goblin-setup__tag-preview");
      if (preview) {
        const fallbackLabel = `Stage Goblin Leiste ${index}`;
        preview.textContent = String(nameInput?.value || fallbackLabel).trim() || fallbackLabel;
        if (colorInput?.value) preview.style.setProperty("--tom-stage-goblin-tag-preview", colorInput.value);
        if (textColorInput?.value) preview.style.setProperty("--tom-stage-goblin-tag-preview-text", textColorInput.value);
      }
    });
    this.form?.querySelectorAll?.("input[type='checkbox'][name$='.orientation'][name^='stageGoblin.bars.']").forEach((input) => {
      const match = input.name.match(/^stageGoblin\.bars\.(\d+)\.orientation$/);
      if (!match) return;
      const verticalOnly = this.form.querySelector(`[data-stage-goblin-vertical-only="${match[1]}"]`);
      verticalOnly?.classList?.toggle("is-hidden", !input.checked);
    });
    this._syncThemeSectionLayouts();
  }

  async _saveStageGoblinSetupFromForm() {
    if (!this.form) return;
    const expandedForm = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    this._patchStageGoblinCheckboxState(expandedForm);
    const stageGoblinState = this._getStageGoblinSetupFromForm(expandedForm.stageGoblin ?? {});
    await TheatreStore.saveStageGoblinState(stageGoblinState);
    game.modules.get(MODULE_ID)?.api?.renderStageGoblin?.();
  }

  _patchStageGoblinCheckboxState(expandedForm) {
    if (!this.form) return expandedForm;
    this.form.querySelectorAll("input[type='checkbox'][name^='stageGoblin.bars.']").forEach((input) => {
      const match = input.name.match(/^stageGoblin\.bars\.(\d+)\.([^.]+)$/);
      if (!match) return;
      const [, index, field] = match;
      foundry.utils.setProperty(expandedForm, `stageGoblin.bars.${index}.${field}`, field === "orientation"
        ? (input.checked ? "vertical" : "horizontal")
        : Boolean(input.checked));
    });
    return expandedForm;
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
        boxed: true,
        backgroundFullscreenFit: "width",
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
      cropOffsetX: 0,
      cropOffsetY: 0,
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
    const position = sceneActor.position || "center";
    const defaultAnchorX =
      position === "left" ? 34 :
      position === "right" ? 66 :
      50;

    return {
      sceneActorId: sceneActor.sceneActorId || randomId(),
      name: sceneActor.name || this._getSceneActorDisplayName(sceneActor),
      actorId,
      position,
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
      anchorX: Number.isFinite(Number(sceneActor.anchorX)) ? Math.max(0, Math.min(100, Number(sceneActor.anchorX))) : defaultAnchorX,
      anchorY: Number.isFinite(Number(sceneActor.anchorY)) ? Math.max(0, Math.min(100, Number(sceneActor.anchorY))) : 72,
      referencePlaneWidth: Number.isFinite(Number(sceneActor.referencePlaneWidth)) ? Math.max(0, Number(sceneActor.referencePlaneWidth)) : 0,
      referencePlaneHeight: Number.isFinite(Number(sceneActor.referencePlaneHeight)) ? Math.max(0, Number(sceneActor.referencePlaneHeight)) : 0,
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
      previewImage: getAvatarPrimaryImage(avatar, actor, mood),
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
    theme = TheatreStore._normalizeThemeState(theme);
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
      `--tom-theme-preset-nav-surface:${this._linearGradientCss(theme.navigation.surfaceStart, theme.navigation.surfaceEnd)}`,
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
      isStageGoblin: key === "stageGoblin",
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
    return items.map(({ componentKey, label, bgKey, iconKey, iconLabel = "Icon", hoverBgKey = "", hoverTextKey = "", iconSizeKey = "", iconSizeValue = 1, previewType, borderKey = "", borderStop = null, borderWidthKey = "", borderWidthValue = 1, radiusKey = "", radiusValue = 16 }) =>
      this._createThemeActionButtonComponent(
        componentKey,
        label,
        bgKey,
        this._themeStop(theme, bgKey),
        iconKey,
        this._themeStop(theme, iconKey),
        iconLabel,
        hoverBgKey,
        hoverBgKey ? this._themeStop(theme, hoverBgKey) : null,
        hoverTextKey,
        hoverTextKey ? this._themeStop(theme, hoverTextKey) : null,
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
            fontOptions: this._getFontTypeOptions(theme.typography.heading2Font),
            extraControls: [
              this._createThemeTypographyHoverControl(
                "typography.heading2Hover",
                theme.typography.heading2Hover,
                "content.buttonHoverHeading",
                theme.content.buttonHoverHeading,
                "heading-text"
              )
            ]
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
            fontOptions: this._getFontTypeOptions(theme.typography.subTextFont),
            extraControls: [
              this._createThemeTypographyHoverControl(
                "typography.subTextHover",
                theme.typography.subTextHover,
                "content.buttonHoverSubText",
                theme.content.buttonHoverSubText,
                "text-muted"
              )
            ]
          }),
          this._createThemeTypographyStyleComponent("typography.microText", tr("Micro text"), theme.typography.microText, "label-text", tr("Micro text"), {
            fontKey: "typography.microTextFont",
            fontValue: theme.typography.microTextFont,
            fontOptions: this._getFontTypeOptions(theme.typography.microTextFont)
          }),
          this._createThemeTypographyStyleComponent("typography.labelText", tr("Label text"), theme.typography.labelText, "label-text", tr("Label text"), {
            colorKey: "content.label",
            colorStop: theme.content.label,
            colorLabel: tr("Label text"),
            colorPreviewType: "label-text",
            fontKey: "typography.labelTextFont",
            fontValue: theme.typography.labelTextFont,
            fontOptions: this._getFontTypeOptions(theme.typography.labelTextFont)
          }),
          this._createThemeNavigationTypographyComponent("typography.navigation", tr("Navigation"), theme.navigation, theme.typography.navigationFont, theme.typography.navigationSize)
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
              label: tr("Important Highlight Button"),
              bgKey: "navigation.actionCreateBg",
              iconKey: "navigation.actionCreateText",
              iconLabel: tr("Text"),
              hoverBgKey: "navigation.actionCreateHoverBg",
              hoverTextKey: "navigation.actionCreateHoverText",
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
        items: [
          ...this._createThemeColorItems(theme, [
            { key: "content.divider", label: tr("Content divider"), previewType: "splitter" },
            { key: "content.highlight", label: tr("Highlight"), previewType: "color-swatch" },
            { key: "content.horizontal2", label: tr("Horizontal 2"), previewType: "splitter" },
            { key: "content.headerRule", label: tr("Header line"), previewType: "header-rule" },
            { key: "content.scrollbar", label: tr("Scrollbar"), previewType: "splitter" }
          ]),
          this._createThemeStandardShadowComponent("content.shadowPreview", tr("Standard Shadow"), theme.content),
          this._createThemeFocusShadowComponent("content.focusShadowPreview", tr("Focus Shadow"), theme.content)
        ]
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
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const bars = stageGoblinState.bars.map((bar, index) => this._createStageGoblinSetupBarComponent(bar, index, theme));
    return [
      {
        title: tr("StageGoblin Setup"),
        isHidden: true,
        items: bars
      }
    ];
  }

  _createStageGoblinSetupBarComponent(bar, index, theme) {
    const label = bar.label || tr("Stage Goblin Bar {number}", { number: index + 1 });
    const setupBar = this._getStageGoblinSetupBarData(bar, index, theme);
    const surfaceCss = this._colorStopToCss({ color: setupBar.surfaceColor, alpha: setupBar.surfaceAlpha });
    const borderCss = this._colorStopToCss({ color: setupBar.borderColor, alpha: setupBar.borderAlpha });
    const iconCss = this._colorStopToCss({ color: setupBar.iconColor, alpha: setupBar.iconAlpha });
    const textCss = this._colorStopToCss({ color: setupBar.textColor, alpha: setupBar.textAlpha });
    const tagCss = this._colorStopToCss({ color: setupBar.tagColor, alpha: setupBar.tagAlpha });
    const tagTextCss = this._colorStopToCss({ color: setupBar.tagTextColor, alpha: setupBar.tagTextAlpha });
    return {
      key: `stageGoblin.setup.${index}`,
      label,
      isStageGoblinSetupPreview: true,
      previewType: "stage-goblin-bar-setup",
      previewParts: {
        tag: `background:${tagCss};color:${tagTextCss};`,
        main: `background:${surfaceCss};border-color:${borderCss};border-width:${setupBar.borderWidth}px;border-radius:${setupBar.radius}px;`,
        icon: `color:${iconCss};font-size:${Number(setupBar.iconSize || 0.92).toFixed(2)}rem;`,
        label: `color:${textCss};font-size:${Number(setupBar.fontSize || 0.82).toFixed(2)}rem;`
      },
      previewHtml: this._buildThemePreviewHtml("stage-goblin-bar-setup", {
        tag: `background:${tagCss};color:${tagTextCss};`,
        main: `background:${surfaceCss};border-color:${borderCss};border-width:${setupBar.borderWidth}px;border-radius:${setupBar.radius}px;`,
        icon: `color:${iconCss};font-size:${Number(setupBar.iconSize || 0.92).toFixed(2)}rem;`,
        label: `color:${textCss};font-size:${Number(setupBar.fontSize || 0.82).toFixed(2)}rem;`
      }, label),
      controls: [{
        label,
        showHeader: false,
        isStageGoblinBarSettings: true,
        bar: setupBar
      }]
    };
  }

  _getStageGoblinSetupBarData(bar = {}, index = 0, theme = TheatreStore.getThemeState()) {
    const positionOptions = [
      { value: "left", label: tr("Left") },
      { value: "top-left", label: tr("Top left") },
      { value: "bottom-left", label: tr("Bottom left") },
      { value: "right", label: tr("Right") },
      { value: "top-right", label: tr("Top right") },
      { value: "bottom-right", label: tr("Bottom right") }
    ];
    const tagPosition = String(bar.tagPosition || "left");
    const orientation = String(bar.orientation || "horizontal") === "vertical" ? "vertical" : "horizontal";
    const fontSize = Number(bar.fontSize ?? this._resolveTypographyPresetSize(theme.typography, theme.stageGoblin.fontPreset) ?? 0.82);
    const normalizeAlpha = (value, fallback = 1) => {
      const numeric = Number(value);
      const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
      const alpha = resolved > 1 ? resolved / 100 : resolved;
      return Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    };
    const surfaceAlpha = normalizeAlpha(bar.surfaceAlpha ?? theme.stageGoblin.surface.alpha ?? 1);
    const borderAlpha = normalizeAlpha(bar.borderAlpha ?? theme.stageGoblin.border.alpha ?? 1);
    const iconAlpha = normalizeAlpha(bar.iconAlpha ?? theme.stageGoblin.icon.alpha ?? 1);
    const textAlpha = normalizeAlpha(bar.textAlpha ?? theme.stageGoblin.text?.alpha ?? 1);
    const tagAlpha = normalizeAlpha(bar.tagAlpha ?? 1);
    const tagTextAlpha = normalizeAlpha(bar.tagTextAlpha ?? 1);
    return {
      index,
      number: index + 1,
      label: bar.label || tr("Stage Goblin Bar {number}", { number: index + 1 }),
      showLabel: bar.showLabel !== false,
      tagColor: bar.tagColor || ["#8db4db", "#86d18f", "#f2c778", "#b298ff", "#ff85b6"][index] || "#8db4db",
      tagAlpha,
      tagAlphaPercent: Math.round(tagAlpha * 100),
      tagTextColor: bar.tagTextColor || "#0d1722",
      tagTextAlpha,
      tagTextAlphaPercent: Math.round(tagTextAlpha * 100),
      tagPosition,
      orientation,
      isVertical: orientation === "vertical",
      verticalItemHeight: Number(bar.verticalItemHeight ?? 38),
      tagPositionOptions: positionOptions.map((option) => ({ ...option, isSelected: option.value === tagPosition })),
      surfaceColor: bar.surfaceColor || theme.stageGoblin.surface.color,
      surfaceAlpha,
      surfaceAlphaPercent: Math.round(surfaceAlpha * 100),
      borderColor: bar.borderColor || theme.stageGoblin.border.color,
      borderAlpha,
      borderAlphaPercent: Math.round(borderAlpha * 100),
      iconColor: bar.iconColor || theme.stageGoblin.icon.color,
      iconAlpha,
      iconAlphaPercent: Math.round(iconAlpha * 100),
      textColor: bar.textColor || theme.stageGoblin.text?.color || theme.content.text.color,
      textAlpha,
      textAlphaPercent: Math.round(textAlpha * 100),
      borderWidth: Number(bar.borderWidth ?? theme.stageGoblin.borderWidth ?? 1),
      radius: Number(bar.radius ?? theme.stageGoblin.radius ?? 11),
      fontSize,
      iconSize: Number(bar.iconSize ?? theme.stageGoblin.iconSize ?? 0.92),
      tagFontSize: Number(bar.tagFontSize ?? theme.stageGoblin.tagFontSize ?? 0.62),
      tagHeight: Number(bar.tagHeight ?? theme.stageGoblin.tagHeight ?? 26),
      tagWidth: Number(bar.tagWidth ?? theme.stageGoblin.tagWidth ?? 92),
      tagRadius: Number(bar.tagRadius ?? theme.stageGoblin.tagRadius ?? 4),
      tagGlowEnabled: bar.tagGlowEnabled !== false,
      tagGlowBlur: Number(bar.tagGlowBlur ?? theme.stageGoblin.tagGlowBlur ?? 14)
    };
  }

  _buildTheatreThemeGroups(theme) {
    return [
      {
        title: tr("Fonts"),
        items: [
          this._createThemeTheatreStageTitleComponent(theme.theatre),
          this._createThemeTypographyStyleComponent("theatre.avatarNameSize", tr("Avatar name"), theme.theatre.avatarNameSize, "theatre-avatar-name", "Yonks", {
            colorKey: "theatre.avatarName",
            colorStop: theme.theatre.avatarName,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-avatar-name",
            extraControls: [
              this._createThemeColorControl("theatre.avatarNameBackground", "Background", theme.theatre.avatarNameBackground)
            ]
          }),
          this._createThemeTypographyStyleComponent("theatre.moodSize", tr("Mood"), theme.theatre.moodSize, "theatre-mood", tr("Neutral"), {
            colorKey: "theatre.mood",
            colorStop: theme.theatre.mood,
            colorLabel: tr("Text color"),
            colorPreviewType: "theatre-mood",
            extraControls: [
              this._createThemeColorControl("theatre.moodBackground", "Background", theme.theatre.moodBackground)
            ]
          })
        ]
      },
      {
        title: tr("Elements"),
        items: [
          this._createThemeTheatreBackgroundComponent("theatre.backgrounds", "Backgrounds", theme.theatre),
          this._createThemeTheatreContainersComponent("theatre.containers", "Containers", theme.theatre),
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
      { value: "microText", label: "Micro text" },
      { value: "labelText", label: "Label text" }
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
            <span class="tom-theme-preview__stage-goblin-tag" data-theme-preview-part="tag"${partStyle("tag")}>${tr("Tag")}</span>
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
      case "stage-goblin-bar-setup":
        return `
          <div class="tom-theme-preview tom-theme-preview--stage-goblin-bar">
            <span class="tom-theme-preview__stage-goblin-tag" data-theme-preview-part="tag"${partStyle("tag")}>${sample}</span>
            <div class="tom-theme-preview__stage-goblin-shell" data-theme-preview-part="main"${partStyle("main")}>
              <span class="tom-theme-preview__stage-goblin-handle" data-theme-preview-part="icon"${partStyle("icon")} aria-hidden="true">
                <i class="fas fa-arrows-up-down-left-right"></i>
              </span>
              <span class="tom-theme-preview__stage-goblin-item">
                <span class="tom-theme-preview__stage-goblin-item-label">${tr("Entry")}</span>
              </span>
            </div>
          </div>
        `;
      case "theatre-stage-title":
        return `<div class="tom-theme-preview tom-theme-preview--text"><strong class="tom-theme-preview__theatre-stage-title" data-theme-preview-part="main"${partStyle("main")}>${sample}</strong></div>`;
      case "theatre-stage-heading":
        return `
          <div class="tom-theme-preview tom-theme-preview--theatre-heading-type">
            <strong class="tom-theme-preview__theatre-stage-title" data-theme-preview-part="title"${partStyle("title")}>${tr("Footlights Scene")}</strong>
            <span class="tom-theme-preview__theatre-stage-subtitle" data-theme-preview-part="subtitle"${partStyle("subtitle")}>${tr("Scene begins")}</span>
          </div>
        `;
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
            style="border-color:var(--tom-theme-preview-stage-frame, rgba(126, 186, 236, 0.22));border-width:var(--tom-theme-preview-stage-frame-width, 1px);border-radius:var(--tom-theme-preview-stage-frame-radius, 12px);"
          >
            <div class="tom-theme-preview__theatre-heading-shell" style="background:var(--tom-theme-preview-title-bg, rgba(8, 21, 35, 0.88));border-color:var(--tom-theme-preview-title-bg-border, transparent);border-width:var(--tom-theme-preview-title-bg-border-width, 0);">
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
      case "color-swatch":
        return `<div class="tom-theme-preview tom-theme-preview--color-swatch" data-theme-preview-part="main"${partStyle("main")} aria-hidden="true"></div>`;
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

  _createThemeControlSectionTitle(label) {
    return {
      label,
      isControlSectionTitle: true
    };
  }

  _createThemeControlPanel(label, controls = []) {
    return {
      label,
      showHeader: true,
      isControlPanel: true,
      controls
    };
  }

  _createThemeTypographyHoverControl(sizeKey, sizeValue, colorKey, colorStop, colorPreviewType = "text") {
    return {
      key: sizeKey,
      colorKey,
      label: tr("Hover"),
      showHeader: true,
      isTypographyHover: true,
      value: Number(sizeValue).toFixed(2),
      min: 0.62,
      max: 2.4,
      step: 0.01,
      unit: "rem",
      color: colorStop.color,
      alpha: Math.round(colorStop.alpha * 100),
      colorPreviewType
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

  _buildThemeImagePreviewLayer(imagePath, imageAlpha, imageScale, imageRepeat, radiusValue = null, imageBlur = 0) {
    const blur = Math.max(0, Math.min(32, Number(imageBlur) || 0));
    return (
      this._buildSurfaceImageStyle(imagePath, imageAlpha, imageScale, imageRepeat) +
      `filter:${blur > 0 ? `blur(${blur}px)` : "none"};` +
      `opacity:${Math.max(0, Math.min(1, imageAlpha || 0))};` +
      (radiusValue === null ? "" : this._previewStyleForRadius(radiusValue))
    );
  }

  _createThemeImageControls(baseKey, imagePath, imageAlpha, imageScale, imageRepeat, repeatOptions, { includeBlur = false, imageBlur = 0 } = {}) {
    const controls = [
      this._createThemeTextControl(`${baseKey}Image`, tr("Background image"), imagePath, tr("Path to PNG/WebP/JPG"), { imagePicker: true }),
      this._createThemeRangeControl(`${baseKey}ImageAlpha`, tr("Image opacity"), Number(imageAlpha ?? 0), 0, 1, 0.01, ""),
      this._createThemeRangeControl(`${baseKey}ImageScale`, tr("Image scale"), Number(imageScale ?? 1), 0.1, 4, 0.01, "x")
    ];
    if (includeBlur) {
      controls.push(this._createThemeRangeControl(`${baseKey}ImageBlur`, tr("Image blur"), Number(imageBlur ?? 0), 0, 32, 1, "px"));
    }
    controls.push(this._createThemeSelectControl(`${baseKey}ImageRepeat`, tr("Tiling"), String(imageRepeat ?? "repeat"), repeatOptions));
    return controls;
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
        contentTheme.surfaceRadius,
        contentTheme.surfaceImageBlur
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
          this._createThemeContentImageRepeatOptions(contentTheme.surfaceImageRepeat),
          { includeBlur: true, imageBlur: contentTheme.surfaceImageBlur }
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
        contentTheme.appBackgroundImageRepeat,
        null,
        contentTheme.appBackgroundImageBlur
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
          this._createThemeContentImageRepeatOptions(contentTheme.appBackgroundImageRepeat),
          { includeBlur: true, imageBlur: contentTheme.appBackgroundImageBlur }
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

  _createThemeFocusShadowComponent(componentKey, label, contentTheme) {
    const blurValue = Number(contentTheme?.focusShadowBlur ?? 0);
    const distanceValue = Number(contentTheme?.focusShadowDistance ?? 2);
    const blur = Number.isFinite(blurValue) ? Math.max(0, blurValue) : 0;
    const distance = Number.isFinite(distanceValue) ? Math.max(0, distanceValue) : 2;
    const shadowColor = this._colorStopToCss(contentTheme?.focusShadow);
    const previewParts = {
      main:
        `background:${this._colorStopToCss(contentTheme?.formBackground)};` +
        `border:1px solid ${this._colorStopToCss(contentTheme?.border3)};` +
        `box-shadow:0 0 ${blur}px ${distance}px ${shadowColor};`
    };

    return {
      key: componentKey,
      label,
      previewType: "form-field",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("form-field", previewParts, tr("Focus")),
      controls: [
        this._createThemeColorControl("content.focusShadow", tr("Shadow color"), contentTheme.focusShadow),
        this._createThemeRangeControl("content.focusShadowBlur", tr("Shadow blur"), contentTheme.focusShadowBlur, 0, 32, 0.1, "px"),
        this._createThemeRangeControl("content.focusShadowDistance", tr("Shadow distance"), contentTheme.focusShadowDistance, 0, 32, 0.1, "px")
      ]
    };
  }

  _createThemeStandardShadowComponent(componentKey, label, contentTheme) {
    const blurValue = Number(contentTheme?.shadowBlur ?? 42);
    const distanceValue = Number(contentTheme?.shadowDistance ?? 18);
    const blur = Number.isFinite(blurValue) ? Math.max(0, blurValue) : 42;
    const distance = Number.isFinite(distanceValue) ? Math.max(0, distanceValue) : 18;
    const shadowColor = this._colorStopToCss(contentTheme?.shadow);
    const previewParts = {
      main:
        `background:${this._colorStopToCss(contentTheme?.card)};` +
        `border:1px solid ${this._colorStopToCss(contentTheme?.border2)};` +
        `box-shadow:0 ${distance}px ${blur}px ${shadowColor};`
    };

    return {
      key: componentKey,
      label,
      previewType: "card",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("card", previewParts, tr("Shadow")),
      controls: [
        this._createThemeColorControl("content.shadow", tr("Shadow color"), contentTheme.shadow),
        this._createThemeRangeControl("content.shadowBlur", tr("Shadow blur"), contentTheme.shadowBlur, 0, 96, 0.1, "px"),
        this._createThemeRangeControl("content.shadowDistance", tr("Shadow distance"), contentTheme.shadowDistance, 0, 96, 0.1, "px")
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
    fontOptions = [],
    extraControls = []
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
    controls.push(...extraControls);

    return {
      key,
      label,
      previewType,
      previewParts,
      previewHtml: this._buildThemePreviewHtml(previewType, previewParts, sampleText),
      controls
    };
  }

  _createThemeTheatreStageTitleComponent(theatreTheme) {
    const previewParts = {
      title:
        `${this._previewStyleForSize(theatreTheme.stageTitleSize)}` +
        `${this._previewStyleForColor("theatre-stage-title", theatreTheme.stageTitle, "theatre.stageTitle")}` +
        `${this._previewStyleForFontFamily(theatreTheme.stageTitleFont)}`,
      subtitle:
        `${this._previewStyleForSize(theatreTheme.stageSubtitleSize)}` +
        `${this._previewStyleForColor("theatre-stage-subtitle", theatreTheme.stageSubtitle, "theatre.stageSubtitle")}` +
        `${this._previewStyleForFontFamily(theatreTheme.stageSubtitleFont)}`
    };

    return {
      key: "theatre.stageTitleSize",
      label: tr("Stage title"),
      previewType: "theatre-stage-heading",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("theatre-stage-heading", previewParts),
      controls: [
        this._createThemeControlSectionTitle(tr("Stage title")),
        this._createThemeSizeControl("theatre.stageTitleSize", tr("Stage title size"), theatreTheme.stageTitleSize),
        this._createThemeColorControl("theatre.stageTitle", tr("Stage title text color"), theatreTheme.stageTitle),
        this._createThemeSelectControl("theatre.stageTitleFont", tr("Font Type"), theatreTheme.stageTitleFont, this._getFontTypeOptions(theatreTheme.stageTitleFont)),
        this._createThemeControlSectionTitle(tr("Subtitle")),
        this._createThemeSizeControl("theatre.stageSubtitleSize", tr("Subtitle size"), theatreTheme.stageSubtitleSize),
        this._createThemeColorControl("theatre.stageSubtitle", tr("Subtitle text color"), theatreTheme.stageSubtitle),
        this._createThemeSelectControl("theatre.stageSubtitleFont", tr("Font Type"), theatreTheme.stageSubtitleFont, this._getFontTypeOptions(theatreTheme.stageSubtitleFont))
      ]
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

  _createThemeActionButtonComponent(componentKey, label, bgKey, bgStop, iconKey, iconStop, iconLabel = "Icon", hoverBgKey = "", hoverBgStop = null, hoverTextKey = "", hoverTextStop = null, previewType, iconSizeKey = "", iconSizeValue = 1, borderKey = "", borderStop = null, borderWidthKey = "", borderWidthValue = 1, radiusKey = "", radiusValue = 16) {
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
        ...(hoverBgKey && hoverBgStop ? [this._createThemeColorControl(hoverBgKey, tr("Hover Background"), hoverBgStop)] : []),
        ...(hoverTextKey && hoverTextStop ? [this._createThemeColorControl(hoverTextKey, tr("Hover Text"), hoverTextStop)] : []),
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
    const tagFontSize = Number.isFinite(Number(stageGoblinTheme.tagFontSize)) ? Number(stageGoblinTheme.tagFontSize) : 0.62;
    const tagHeight = Number.isFinite(Number(stageGoblinTheme.tagHeight)) ? Number(stageGoblinTheme.tagHeight) : 26;
    const tagWidth = Number.isFinite(Number(stageGoblinTheme.tagWidth)) ? Number(stageGoblinTheme.tagWidth) : 92;
    const tagRadius = Number.isFinite(Number(stageGoblinTheme.tagRadius)) ? Number(stageGoblinTheme.tagRadius) : 4;
    const tagGlowBlur = stageGoblinTheme.tagGlowEnabled === false ? 0 : (Number.isFinite(Number(stageGoblinTheme.tagGlowBlur)) ? Number(stageGoblinTheme.tagGlowBlur) : 14);
    const previewParts = {
      main:
        `${this._previewStyleForColor("stage-goblin-bar", stageGoblinTheme.surface, "stageGoblin.surface")}` +
        `border-color:${this._colorStopToCss(stageGoblinTheme.border)};` +
        `border-width:${borderWidth}px;` +
        this._previewStyleForRadius(radius),
      icon: this._previewStyleForColor("icon", stageGoblinTheme.icon, "stageGoblin.icon") + `font-size:${Number(stageGoblinTheme.iconSize || 0.92).toFixed(2)}rem;`,
      label: this._previewStyleForSize(fontPresetSize) + this._previewStyleForColor("text", stageGoblinTheme.text, "stageGoblin.text"),
      tag: `font-size:${tagFontSize.toFixed(2)}rem !important;width:${tagWidth.toFixed(1)}px;height:${tagHeight.toFixed(1)}px;min-height:0;border-radius:${tagRadius.toFixed(1)}px;box-shadow:0 0 ${tagGlowBlur.toFixed(1)}px color-mix(in srgb, #8db4db 34%, transparent);`
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
        this._createThemeRangeControl("stageGoblin.iconSize", tr("Icon size"), stageGoblinTheme.iconSize, 0.62, 2.4, 0.01, "rem"),
        this._createThemeColorControl("stageGoblin.text", tr("Standard text color"), stageGoblinTheme.text),
        this._createThemeRangeControl("stageGoblin.borderWidth", tr("Border width"), stageGoblinTheme.borderWidth, 0, 6, 0.1, "px"),
        this._createThemeRangeControl("stageGoblin.radius", tr("Corner radius"), stageGoblinTheme.radius, 0, 40, 1, "px"),
        this._createThemeSelectControl("stageGoblin.fontPreset", tr("Font size"), stageGoblinTheme.fontPreset, this._getTypographyPresetOptions()),
        this._createThemeRangeControl("stageGoblin.tagFontSize", tr("Tag font size"), stageGoblinTheme.tagFontSize, 0.2, 1.2, 0.01, "rem"),
        this._createThemeRangeControl("stageGoblin.tagHeight", tr("Tag height"), stageGoblinTheme.tagHeight, 10, 52, 1, "px"),
        this._createThemeRangeControl("stageGoblin.tagWidth", tr("Tag width"), stageGoblinTheme.tagWidth, 36, 180, 1, "px"),
        this._createThemeRangeControl("stageGoblin.tagRadius", tr("Tag rounded borders"), stageGoblinTheme.tagRadius, 0, 16, 1, "px"),
        this._createThemeBooleanSelectControl("stageGoblin.tagGlowEnabled", tr("Tag glow"), stageGoblinTheme.tagGlowEnabled),
        this._createThemeRangeControl("stageGoblin.tagGlowBlur", tr("Tag glow blur"), stageGoblinTheme.tagGlowBlur, 0, 32, 1, "px")
      ]
    };
  }

  _createThemeTheatreBackgroundComponent(componentKey, label, theatreTheme) {
    const previewParts = {
      main:
        `--tom-theme-preview-title-bg:${this._colorStopToCss(theatreTheme.titleBackground)};` +
        `--tom-theme-preview-title-bg-border:${this._colorStopToCss(theatreTheme.titleBackgroundBorder)};` +
        `--tom-theme-preview-title-bg-border-width:${Number(theatreTheme.titleBackgroundBorderWidth || 0).toFixed(1)}px;` +
        `--tom-theme-preview-title-bg-radius:${Number(theatreTheme.titleBackgroundRadius || 100).toFixed(0)}px;` +
        `--tom-theme-preview-avatar-name-bg:${this._colorStopToCss(theatreTheme.avatarNameBackground)};` +
        `--tom-theme-preview-mood-bg:${this._colorStopToCss(theatreTheme.moodBackground)};` +
        `--tom-theme-preview-stage-frame:${this._colorStopToCss(theatreTheme.stageFrame)};` +
        `--tom-theme-preview-stage-frame-width:${Number(theatreTheme.stageFrameWidth || 0).toFixed(1)}px;` +
        `--tom-theme-preview-stage-frame-radius:${Number(theatreTheme.stageFrameRadius || 24).toFixed(1)}px;`
    };

    return {
      key: componentKey,
      label,
      previewType: "theatre-backgrounds",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("theatre-backgrounds", previewParts),
      controls: [
        this._createThemeControlPanel("Title background", [
          this._createThemeColorControl("theatre.titleBackground", "Background", theatreTheme.titleBackground),
          this._createThemeColorControl("theatre.titleBackgroundBorder", "Border color", theatreTheme.titleBackgroundBorder),
          this._createThemeRangeControl("theatre.titleBackgroundBorderWidth", "Border width", theatreTheme.titleBackgroundBorderWidth, 0, 8, 0.1, "px"),
          this._createThemeRangeControl("theatre.titleBackgroundRadius", "Corner radius", theatreTheme.titleBackgroundRadius, 0, 100, 1, "px")
        ]),
        this._createThemeControlPanel("Theatre frame", [
          this._createThemeColorControl("theatre.stageFrame", "Border color", theatreTheme.stageFrame),
          this._createThemeRangeControl("theatre.stageFrameWidth", "Border width", theatreTheme.stageFrameWidth, 0, 8, 0.1, "px"),
          this._createThemeRangeControl("theatre.stageFrameRadius", "Corner radius", theatreTheme.stageFrameRadius, 0, 100, 1, "px")
        ])
      ]
    };
  }

  _createThemeTheatreContainersComponent(componentKey, label, theatreTheme) {
    const previewParts = {
      main:
        this._previewStyleForColor("container", theatreTheme.container1, "theatre.container1") +
        `border-color:${this._colorStopToCss(theatreTheme.container1Border)};` +
        `border-width:${Number(theatreTheme.container1BorderWidth || 0).toFixed(1)}px;` +
        this._previewStyleForRadius(theatreTheme.container1Radius)
    };
    const buildContainerControls = (index) => [
      this._createThemeColorControl(`theatre.container${index}`, "Color", theatreTheme[`container${index}`]),
      this._createThemeColorControl(`theatre.container${index}Border`, "Borders", theatreTheme[`container${index}Border`]),
      this._createThemeRangeControl(`theatre.container${index}BorderWidth`, "Border width", theatreTheme[`container${index}BorderWidth`], 0, 8, 0.1, "px"),
      this._createThemeRangeControl(`theatre.container${index}Radius`, "Corner radius", theatreTheme[`container${index}Radius`], 0, 100, 1, "px"),
      this._createThemeBooleanSelectControl(`theatre.container${index}BlurEnabled`, "Blur", theatreTheme[`container${index}BlurEnabled`])
    ];

    return {
      key: componentKey,
      label,
      previewType: "content-box-image",
      previewParts,
      previewHtml: this._buildThemePreviewHtml("content-box-image", previewParts, "Container"),
      controls: [
        this._createThemeControlPanel("Container 1", buildContainerControls(1)),
        this._createThemeControlPanel("Container 2", buildContainerControls(2)),
        this._createThemeControlPanel("Container 3", buildContainerControls(3))
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
        this._createThemeRangeControl(radiusKey, "Corner radius", radiusValue, 0, 100, 1, "px"),
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
        this._createThemeRangeControl("theatre.gmBarRadius", tr("Corner radius"), theatreTheme.gmBarRadius, 0, 100, 1, "px")
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
    if (!theme) return;
    document.querySelectorAll(".tom-stage-goblin-stack").forEach((root) => {
      applyThemeInlineStyleToHost(root, theme);
    });
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
    const libraryContent = this.form?.querySelector(".tom-library-content");
    const contentShell = this.form?.querySelector(".tom-library-content--shell");
    const settingsLayout = this.form?.querySelector(".tom-settings-layout");
    const settingsMain = this.form?.querySelector(".tom-settings-layout__main");
    const themeWorkspace = this.form?.querySelector(".tom-theme-workspace");
    const browser = this.form?.querySelector(".tom-theme-browser");
    const observedElements = [windowContent, libraryContent, contentShell, settingsRoot, settingsLayout, settingsMain, themeWorkspace, browser].filter(Boolean);

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
    this._themeInspectorScrollTargets = [contentShell, libraryContent, windowContent, settingsRoot, settingsMain].filter(Boolean);
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
    const settingsLayout = this.form.querySelector(".tom-settings-layout");
    const workspace = this.form.querySelector(".tom-theme-workspace");
    const inspector = this.form.querySelector(".tom-theme-inspector");
    const scrollHost =
      this.form.querySelector(".tom-library-content--shell")
      ?? this.form.querySelector(".tom-library-content")
      ?? this.form.querySelector(".tom-library-settings")
      ?? this.form.closest(".window-content");
    if (scrollHost) {
      const hostRect = scrollHost.getBoundingClientRect();
      const visibleBottom = Math.min(hostRect.bottom - 36, (window.innerHeight || hostRect.bottom) - 36);
      const hostHeight = Math.max(180, Math.floor(hostRect.height - 24));
      const layoutTop = settingsLayout?.getBoundingClientRect?.().top ?? workspace?.getBoundingClientRect?.().top ?? hostRect.top;
      const visibleHeight = Math.max(180, Math.floor(visibleBottom - Math.max(layoutTop, hostRect.top + 12)));
      const availableHeight = Math.min(hostHeight, visibleHeight);
      if (settingsLayout) {
        settingsLayout.style.setProperty("--tom-settings-layout-height", `${availableHeight}px`);
      }
      if (workspace) {
        workspace.style.removeProperty("--tom-theme-workspace-height");
      }
      this.form.style.setProperty("--tom-theme-inspector-max-height", `${availableHeight}px`);
      inspector?.style?.setProperty("--tom-theme-inspector-max-height", `${availableHeight}px`);
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
      this.form?.querySelector(".tom-settings-layout__main"),
      this.form?.querySelector(".tom-theme-inspector"),
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
          element === this.form?.querySelector(".tom-settings-layout__main") ? ".tom-settings-layout__main" :
          element === this.form?.querySelector(".tom-theme-inspector") ? ".tom-theme-inspector" :
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
        if (target.selector === ".tom-settings-layout__main") element = this.form?.querySelector(".tom-settings-layout__main");
        if (target.selector === ".tom-theme-inspector") element = this.form?.querySelector(".tom-theme-inspector");
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
    if (this._portalEditorSkipNextDisclosureCapture) {
      this._portalEditorSkipNextDisclosureCapture = false;
    } else {
      this._capturePortalEditorDisclosureState();
    }
    const openPortalFieldsets = new Set(this._portalEditorOpenFieldsets ?? []);
    const openPortalEffectSubsections = new Set(this._portalEditorOpenEffectSubsections ?? []);
    const scrollTargets = [
      this.form?.closest?.(".window-content"),
      this.form,
      this.form?.querySelector(".tom-library-content"),
      this.form?.querySelector(".tom-library-content--shell"),
      this.form?.querySelector(".tom-scene-config-main"),
      this.form?.querySelector(".tom-world-map-config"),
      this.form?.querySelector(".tom-sound-playlist-editor"),
      this.form?.querySelector(".tom-sound-playlist-scenes__list"),
      this.form?.querySelector(".tom-portal-editor-sidebar")
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
          element === this.form?.querySelector(".tom-portal-editor-sidebar") ? ".tom-portal-editor-sidebar" :
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
        if (target.selector === ".tom-portal-editor-sidebar") element = this.form?.querySelector(".tom-portal-editor-sidebar");
        if (!element) continue;
        element.scrollTop = target.scrollTop;
        element.scrollLeft = target.scrollLeft;
      }
    };

    const restorePortalFieldsets = () => {
      for (const key of openPortalFieldsets) {
        const fieldset = this.form?.querySelector?.(`[data-portal-editor-fieldset="${key}"]`);
        if (fieldset) fieldset.open = true;
      }
      for (const key of openPortalEffectSubsections) {
        const [effectId, ...sectionParts] = String(key).split(":");
        const section = sectionParts.join(":");
        if (!effectId || !section) continue;
        const subsection = this.form?.querySelector?.(`[data-portal-effect-subsection="${section}"][data-effect-id="${effectId}"]`);
        if (subsection) subsection.open = true;
      }
    };

    const scheduleRestore = () => {
      restorePortalFieldsets();
      restoreScroll();
      requestAnimationFrame(() => {
        restorePortalFieldsets();
        restoreScroll();
        requestAnimationFrame(() => {
          restorePortalFieldsets();
          restoreScroll();
        });
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
    if (event.currentTarget?.classList?.contains("tom-stage-goblin-setup__bar") && event.target?.closest?.("input, select, textarea, button")) return;
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
    requestAnimationFrame(() => this._syncThemeSectionLayouts());
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

  async _onExportThemePreset(event) {
    event.preventDefault();
    event.stopPropagation();

    const presetId = event.currentTarget.dataset.presetId;
    if (!presetId) return;

    const preset = TheatreStore.getThemePresets().find((entry) => entry.id === presetId);
    if (!preset) return;

    const normalizedPreset = TheatreStore._normalizeThemePreset(preset, { builtIn: preset.builtIn });
    const code = this._encodeThemePresetCode({
      type: "footlights-theme-preset",
      version: 1,
      name: normalizedPreset.name,
      theme: normalizedPreset.theme
    });
    await this._showThemePresetExportDialog(normalizedPreset.name, code);
  }

  async _onImportThemePreset(event) {
    event.preventDefault();
    event.stopPropagation();

    const presetId = event.currentTarget.dataset.presetId;
    if (!presetId) return;

    const existingPreset = TheatreStore.getCustomThemePresets().find((preset) => preset.id === presetId);
    if (!existingPreset) return;

    const code = await this._promptThemePresetImportCode(existingPreset.name);
    if (!code) return;

    let importedPreset;
    try {
      importedPreset = this._decodeThemePresetCode(code);
    } catch (error) {
      console.warn(`${MODULE_ID} | Theme preset import failed`, error);
      ui.notifications?.error(tr("Theme preset code could not be imported."));
      return;
    }

    const nextTheme = duplicateData(importedPreset.theme);
    await TheatreStore.updateThemePreset(presetId, {
      name: importedPreset.name || existingPreset.name,
      theme: nextTheme
    });
    await TheatreStore.saveThemeState(nextTheme);
    this.draftTheme = null;
    applyThemeInlineStyleToHost(this.manager?.overlay?.element?.[0], nextTheme);
    game.modules.get(MODULE_ID)?.api?.renderStageGoblin?.();
    ui.controls?.render?.(false);
    ui.notifications?.info(tr("Theme preset imported."));
    await this._renderPreservingSettingsScroll(false);
  }

  _encodeThemePresetCode(payload = {}) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `FTL-THEME:${btoa(binary)}`;
  }

  _decodeThemePresetCode(code = "") {
    const rawCode = String(code || "").trim();
    if (!rawCode) throw new Error("Empty theme preset code.");

    let json = rawCode;
    if (rawCode.startsWith("FTL-THEME:")) {
      const binary = atob(rawCode.slice("FTL-THEME:".length).trim());
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    }

    const payload = JSON.parse(json);
    const themeSource = payload?.theme ?? payload?.settings ?? payload;
    return {
      name: String(payload?.name || tr("Imported preset")).trim() || tr("Imported preset"),
      theme: TheatreStore._normalizeThemeState(themeSource)
    };
  }

  async _copyTextToClipboard(text) {
    try {
      await navigator.clipboard?.writeText?.(text);
      return true;
    } catch (_error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const didCopy = document.execCommand?.("copy") ?? false;
      textarea.remove();
      return didCopy;
    }
  }

  async _showThemePresetExportDialog(presetName, code) {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr("Export theme preset"),
        content: `
          <div class="tom-theme-root tom-theme-default tom-theme-code-dialog">
            <p class="notes">${escapeHtml(tr("Share this code or keep it as a backup for this complete theme setup."))}</p>
            <label>
              <span>${escapeHtml(presetName)}</span>
              <textarea readonly rows="8">${escapeHtml(code)}</textarea>
            </label>
          </div>
        `,
        buttons: {
          copy: {
            icon: '<i class="fas fa-copy"></i>',
            label: tr("Copy code"),
            callback: async () => {
              const didCopy = await this._copyTextToClipboard(code);
              if (didCopy) ui.notifications?.info(tr("Theme preset code copied."));
              resolve(true);
            }
          },
          close: {
            label: tr("Close"),
            callback: () => resolve(false)
          }
        },
        default: "copy",
        close: () => resolve(false),
        render: (html) => {
          const textarea = html?.find?.("textarea")?.[0];
          textarea?.focus?.();
          textarea?.select?.();
        }
      });
      dialog.render(true);
      const markDialog = () => dialog.element?.addClass("tom-theme-code-dialog-host");
      markDialog();
      scheduleTheatreDialogTheme(dialog, MODULE_ID, "520px", TheatreStore.getThemeState());
      requestAnimationFrame(markDialog);
      window.setTimeout(markDialog, 50);
    });
  }

  async _promptThemePresetImportCode(presetName) {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr("Import theme preset"),
        content: `
          <div class="tom-theme-root tom-theme-default tom-theme-code-dialog">
            <p class="notes">${escapeHtml(tr("Paste a Footlights theme code. The selected preset will be replaced and applied."))}</p>
            <label>
              <span>${escapeHtml(presetName)}</span>
              <textarea rows="8" data-theme-preset-import-code></textarea>
            </label>
          </div>
        `,
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: tr("Import"),
            callback: (html) => resolve(String(html?.find?.("[data-theme-preset-import-code]")?.val?.() || "").trim())
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "import",
        close: () => resolve(null)
      });
      dialog.render(true);
      const markDialog = () => dialog.element?.addClass("tom-theme-code-dialog-host");
      markDialog();
      scheduleTheatreDialogTheme(dialog, MODULE_ID, "520px", TheatreStore.getThemeState());
      requestAnimationFrame(markDialog);
      window.setTimeout(markDialog, 50);
    });
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
      const thumbnail = getAvatarLibraryThumbnail(avatar, actor);
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
        frameImage: sceneActor.imageOverride ? sceneActor.frameImage : avatar.frameImage,
        useCircularCrop: sceneActor.imageOverride ? sceneActor.useCircularCrop : avatar.useCircularCrop,
        showBackdrop: sceneActor.imageOverride ? sceneActor.showBackdrop : avatar.showBackdrop,
        thumbnailStyle: sceneActor.imageOverride
          ? this._buildAvatarThumbnailStyle(sceneActor)
          : avatar.thumbnailStyle,
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
        boxed: Boolean(expanded.settings?.boxed),
        backgroundFullscreenFit: ["width", "height"].includes(expanded.settings?.backgroundFullscreenFit)
          ? expanded.settings.backgroundFullscreenFit
          : "width",
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
    const boxedInput = this.form?.querySelector?.("[name='sceneEditor.settings.boxed']");
    const fullscreenFitField = this.form?.querySelector?.(".tom-scene-config-fullscreen-fit");
    fullscreenFitField?.classList?.toggle("is-hidden", boxedInput?.checked !== false);
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
      circularCropScale: Math.max(0.7, Math.min(3, Number(expanded.circularCropScale) || 1)),
      cropOffsetX: Math.max(-160, Math.min(160, Number(expanded.cropOffsetX) || 0)),
      cropOffsetY: Math.max(-160, Math.min(160, Number(expanded.cropOffsetY) || 0)),
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
    const circularCropScale = Math.max(0.7, Math.min(3, Number(this.form.querySelector("[name='avatarEditor.circularCropScale']")?.value) || 1));
    const frameFitScale = Math.max(0.6, Math.min(1.2, Number(this.form.querySelector("[name='avatarEditor.frameFitScale']")?.value) || 1));
    const cropOffsetX = Math.max(-160, Math.min(160, Number(this.form.querySelector("[name='avatarEditor.cropOffsetX']")?.value) || 0));
    const cropOffsetY = Math.max(-160, Math.min(160, Number(this.form.querySelector("[name='avatarEditor.cropOffsetY']")?.value) || 0));

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
    portrait.style.setProperty("--tom-avatar-preview-crop-offset-x", cropOffsetToPercent(cropOffsetX));
    portrait.style.setProperty("--tom-avatar-preview-crop-offset-y", cropOffsetToPercent(cropOffsetY));
    portrait.style.setProperty("--tom-avatar-thumb-crop-scale", String(circularCropScale));
    portrait.style.setProperty("--tom-avatar-thumb-frame-fit-scale", String(frameFitScale));
    portrait.style.setProperty("--tom-avatar-thumb-crop-offset-x", cropOffsetToPercent(cropOffsetX));
    portrait.style.setProperty("--tom-avatar-thumb-crop-offset-y", cropOffsetToPercent(cropOffsetY));

    const stack = portrait.querySelector("[data-avatar-preview-stack]");
    let image = portrait.querySelector("[data-avatar-preview-image]");
    let placeholder = portrait.querySelector("[data-avatar-preview-placeholder]");
    if (defaultImage) {
      if (!image && stack) {
        image = document.createElement("img");
        image.className = "tom-avatar-thumb__image";
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
        frame.className = "tom-avatar-thumb__frame";
        frame.setAttribute("data-avatar-preview-frame", "");
        frame.alt = "";
        portrait.appendChild(frame);
      }
      frame.setAttribute("src", frameImage);
    } else {
      frame?.remove();
    }
  }

  _onAvatarPreviewCropPointerDown(event) {
    if (!this.form) return;
    const portrait = this.form.querySelector("[data-avatar-preview-portrait]");
    if (!portrait?.querySelector?.("[data-avatar-preview-image]")) return;
    const offsetXInput = this.form.querySelector("[name='avatarEditor.cropOffsetX']");
    const offsetYInput = this.form.querySelector("[name='avatarEditor.cropOffsetY']");
    if (!offsetXInput || !offsetYInput) return;

    event.preventDefault();
    const stack = event.currentTarget;
    stack.classList.add("is-dragging");
    stack.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = Number(offsetXInput.value) || 0;
    const initialY = Number(offsetYInput.value) || 0;
    const rect = portrait.getBoundingClientRect();
    const offsetUnitsPerPixelX = AVATAR_CROP_OFFSET_BASE / Math.max(1, rect.width);
    const offsetUnitsPerPixelY = AVATAR_CROP_OFFSET_BASE / Math.max(1, rect.height);
    let pendingX = initialX;
    let pendingY = initialY;
    let frameRequest = null;

    const applyCropOffset = () => {
      frameRequest = null;
      offsetXInput.value = pendingX.toFixed(0);
      offsetYInput.value = pendingY.toFixed(0);
      portrait.style.setProperty("--tom-avatar-preview-crop-offset-x", cropOffsetToPercent(pendingX));
      portrait.style.setProperty("--tom-avatar-preview-crop-offset-y", cropOffsetToPercent(pendingY));
      portrait.style.setProperty("--tom-avatar-thumb-crop-offset-x", cropOffsetToPercent(pendingX));
      portrait.style.setProperty("--tom-avatar-thumb-crop-offset-y", cropOffsetToPercent(pendingY));
    };

    const onMove = (moveEvent) => {
      pendingX = Math.max(-160, Math.min(160, initialX + ((moveEvent.clientX - startX) * offsetUnitsPerPixelX)));
      pendingY = Math.max(-160, Math.min(160, initialY + ((moveEvent.clientY - startY) * offsetUnitsPerPixelY)));
      if (!frameRequest) frameRequest = window.requestAnimationFrame(applyCropOffset);
    };

    const onUp = (upEvent) => {
      if (frameRequest) {
        window.cancelAnimationFrame(frameRequest);
        applyCropOffset();
      }
      stack.classList.remove("is-dragging");
      stack.releasePointerCapture?.(upEvent.pointerId);
      stack.removeEventListener("pointermove", onMove);
      stack.removeEventListener("pointerup", onUp);
      stack.removeEventListener("pointercancel", onUp);
      this._syncAvatarEditorPreview();
    };

    stack.addEventListener("pointermove", onMove);
    stack.addEventListener("pointerup", onUp);
    stack.addEventListener("pointercancel", onUp);
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

  async _onAddStageGoblinEntry(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const payload = this._getStageGoblinLibraryPayload(button);
    if (!payload) return;

    const bars = this._getVisibleStageGoblinBars();
    if (bars.length > 1) {
      this._openStageGoblinTargetMenu(button, payload, bars);
      return;
    }

    await this._addStageGoblinLibraryPayload(payload, bars[0]?.id || "bar-1");
  }

  _getVisibleStageGoblinBars() {
    const state = TheatreStore.getStageGoblinState();
    return (state.bars ?? []).slice(0, Math.max(1, Number(state.barCount) || 1));
  }

  _getStageGoblinLibraryPayload(element) {
    const source = element?.closest?.("[data-stage-goblin-type][data-stage-goblin-id]") ?? element;
    const documentType = String(source?.dataset?.stageGoblinType || "").trim();
    const documentId = String(source?.dataset?.stageGoblinId || "").trim();
    const label = String(source?.dataset?.stageGoblinLabel || "").trim() || tr("Entry");
    if (!documentType || !documentId) return null;
    return { sourceType: "document", documentType, documentId, label };
  }

  async _addStageGoblinLibraryPayload(payload, barId = "bar-1") {
    if (!payload?.documentType || !payload?.documentId) return;
    const targetBarId = String(barId || "bar-1").trim() || "bar-1";
    await TheatreStore.addStageGoblinItem({
      ...payload,
      barId: targetBarId
    });
    const api = game.modules.get(MODULE_ID)?.api;
    api?.openStageGoblin?.();
    api?.renderStageGoblin?.();
    const bar = this._getVisibleStageGoblinBars().find((entry) => entry.id === targetBarId);
    const targetLabel = bar?.label ? ` (${bar.label})` : "";
    ui.notifications?.info(`${tr("\"{name}\" added to StageGoblin.", { name: payload.label || tr("Entry") })}${targetLabel}`);
  }

  _openStageGoblinTargetMenu(anchor, payload, bars = this._getVisibleStageGoblinBars()) {
    this._closeStageGoblinTargetMenu();
    const menu = document.createElement("div");
    menu.className = "tom-stage-goblin-target-menu tom-theme-root tom-theme-default";
    menu.style.cssText = buildThemeInlineStyle(TheatreStore.getThemeState());
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <span class="tom-stage-goblin-target-menu__title">${escapeHtml(tr("Choose StageGoblin bar"))}</span>
      ${bars.map((bar, index) => `
        <button type="button" class="tom-stage-goblin-target-menu__item" data-stage-goblin-target-bar-id="${escapeHtml(bar.id)}" role="menuitem">
          <i class="fas fa-hat-wizard" aria-hidden="true"></i>
          <span>${escapeHtml(bar.label || tr("Stage Goblin Bar {number}", { number: index + 1 }))}</span>
        </button>
      `).join("")}
    `;
    document.body.appendChild(menu);

    const rect = anchor?.getBoundingClientRect?.();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, (rect?.left ?? 8)));
    const top = Math.max(8, Math.min(window.innerHeight - menuRect.height - 8, (rect?.bottom ?? 8) + 6));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.querySelectorAll("[data-stage-goblin-target-bar-id]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const barId = event.currentTarget?.dataset?.stageGoblinTargetBarId || "bar-1";
        this._closeStageGoblinTargetMenu();
        await this._addStageGoblinLibraryPayload(payload, barId);
      });
    });

    this._stageGoblinTargetMenu = menu;
    document.addEventListener("pointerdown", this._onStageGoblinTargetMenuPointerDown, true);
  }

  _onStageGoblinTargetMenuPointerDown(event) {
    if (this._stageGoblinTargetMenu?.contains?.(event.target)) return;
    this._closeStageGoblinTargetMenu();
  }

  _closeStageGoblinTargetMenu() {
    document.removeEventListener("pointerdown", this._onStageGoblinTargetMenuPointerDown, true);
    this._stageGoblinTargetMenu?.remove?.();
    this._stageGoblinTargetMenu = null;
  }

  _onStageGoblinLibraryDragStart(event) {
    const payload = this._getStageGoblinLibraryPayload(event.currentTarget);
    if (!payload) return;
    const nativeEvent = event?.originalEvent ?? event;
    const transfer = nativeEvent?.dataTransfer;
    if (!transfer) return;
    transfer.setData("text/plain", JSON.stringify({
      type: "FootlightsStageGoblinDocument",
      ...payload
    }));
    transfer.effectAllowed = "copy";
  }

  _onMapLibraryDragStart(event) {
    const mapId = String(event.currentTarget?.dataset?.stageGoblinId || "").trim();
    if (!mapId) return;
    const label = String(event.currentTarget?.dataset?.stageGoblinLabel || "").trim();
    setWorldMapDragData(event, mapId, { type: "WorldMap", mapId, name: label });
  }

  _onPortalLibraryDragStart(event) {
    const portalId = String(event.currentTarget?.dataset?.stageGoblinId || "").trim();
    if (!portalId) return;
    const label = String(event.currentTarget?.dataset?.stageGoblinLabel || "").trim();
    setPortalDragData(event, portalId, { type: "Portal", portalId, name: label });
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
      globalPlayer: Boolean(expanded.globalPlayer),
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
    event.stopPropagation();
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
    event.stopPropagation();
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
    event.stopPropagation();
    event.stopImmediatePropagation();
    await this.manager.deactivateScene();
    ui.notifications?.info(tr("Footlights Scene ended."));
    this._renderLibrary();
  }

  async _onCreateSceneMacro(event) {
    event.preventDefault();
    const sceneId = String(event.currentTarget.dataset.sceneId || "").trim();
    const scene = TheatreStore.getSceneById(sceneId);
    if (!scene) return;
    const macro = await Macro.create({
      name: tr("Scene: {name}", { name: scene.name }),
      type: "script",
      scope: "global",
      img: FOOTLIGHTS_MACRO_ICON,
      command: `game.modules.get("${MODULE_ID}")?.api?.activateScene?.("${scene.id}");`
    });
    if (macro) ui.notifications?.info(tr("Scene macro created."));
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
    const expandedForm = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    const selectedLanguage = String(this.form?.querySelector("[name='settings.language']")?.value || TheatreStore.getLanguage()).trim();
    const moods = this.draftMoods ?? [];
    const theme = this.draftTheme ?? TheatreStore.getThemeState();
    this._patchStageGoblinCheckboxState(expandedForm);
    const stageGoblinState = this._getStageGoblinSetupFromForm(expandedForm.stageGoblin ?? {});
    await TheatreStore.saveLanguage(selectedLanguage);
    await setActiveLanguage(selectedLanguage);
    await TheatreStore.saveMoodPresets(moods);
    await TheatreStore.saveThemeState(theme);
    await TheatreStore.saveStageGoblinState(stageGoblinState);
    this.draftMoods = null;
    this.draftTheme = null;
    ui.notifications?.info(tr("Settings saved."));
    Object.values(ui.windows ?? {}).forEach((app) => app?.render?.(false));
    game.modules.get(MODULE_ID)?.api?.renderStageGoblin?.();
    ui.controls?.render?.(false);
    this._renderLibrary();
  }

  _getStageGoblinSetupFromForm(formState = {}) {
    const current = TheatreStore.getStageGoblinState();
    const requestedCount = Number(formState.barCount);
    const barCount = Math.max(1, Math.min(5, Number.isFinite(requestedCount) ? Math.round(requestedCount) : current.barCount));
    const submittedBars = Array.isArray(formState.bars)
      ? formState.bars
      : (formState.bars && typeof formState.bars === "object" ? Object.values(formState.bars) : []);
    const colors = ["#8db4db", "#86d18f", "#f2c778", "#b298ff", "#ff85b6"];
    const tagPositions = new Set(["left", "top-left", "bottom-left", "right", "top-right", "bottom-right"]);
    const bars = Array.from({ length: barCount }, (_entry, index) => {
      const existing = current.bars[index] ?? {};
      const submitted = submittedBars[index] ?? {};
      const tagColor = /^#[0-9a-f]{6}$/i.test(String(submitted.tagColor || "").trim())
        ? String(submitted.tagColor).trim().toLowerCase()
        : (existing.tagColor || colors[index] || "#8db4db");
      const tagTextColor = /^#[0-9a-f]{6}$/i.test(String(submitted.tagTextColor || "").trim())
        ? String(submitted.tagTextColor).trim().toLowerCase()
        : (existing.tagTextColor || "#0d1722");
      const tagPosition = String(submitted.tagPosition || existing.tagPosition || "left").trim();
      const orientation = String(submitted.orientation || existing.orientation || "horizontal").trim();
      const normalizedOrientation = orientation === "vertical" ? "vertical" : "horizontal";
      const previousOrientation = String(existing.orientation || "horizontal") === "vertical" ? "vertical" : "horizontal";
      const hexOrExisting = (value, existingValue, fallback = "") => /^#[0-9a-f]{6}$/i.test(String(value || "").trim())
        ? String(value).trim().toLowerCase()
        : (existingValue || fallback);
      const numberOrExisting = (value, existingValue, fallback, min, max) => {
        const numeric = Number(value);
        const resolved = Number.isFinite(numeric) ? numeric : (Number.isFinite(Number(existingValue)) ? Number(existingValue) : fallback);
        return Math.max(min, Math.min(max, resolved));
      };
      const alphaOrExisting = (value, existingValue, fallback = 1) => {
        const numeric = Number(value);
        const existingNumeric = Number(existingValue);
        const resolved = Number.isFinite(numeric) ? numeric : (Number.isFinite(existingNumeric) ? existingNumeric : fallback);
        const alpha = resolved > 1 ? resolved / 100 : resolved;
        return Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : fallback));
      };
      return {
        ...existing,
        id: existing.id || `bar-${index + 1}`,
        label: String(submitted.label || existing.label || tr("Stage Goblin Bar {number}", { number: index + 1 })).trim(),
        tagColor,
        tagAlpha: alphaOrExisting(submitted.tagAlpha, existing.tagAlpha, 1),
        tagTextColor,
        tagTextAlpha: alphaOrExisting(submitted.tagTextAlpha, existing.tagTextAlpha, 1),
        tagPosition: tagPositions.has(tagPosition) ? tagPosition : "left",
        orientation: normalizedOrientation,
        showLabel: "showLabel" in submitted ? Boolean(submitted.showLabel) : (existing.showLabel !== false),
        surfaceColor: hexOrExisting(submitted.surfaceColor, existing.surfaceColor),
        surfaceAlpha: alphaOrExisting(submitted.surfaceAlpha, existing.surfaceAlpha, 1),
        borderColor: hexOrExisting(submitted.borderColor, existing.borderColor),
        borderAlpha: alphaOrExisting(submitted.borderAlpha, existing.borderAlpha, 1),
        iconColor: hexOrExisting(submitted.iconColor, existing.iconColor),
        iconAlpha: alphaOrExisting(submitted.iconAlpha, existing.iconAlpha, 1),
        textColor: hexOrExisting(submitted.textColor, existing.textColor),
        textAlpha: alphaOrExisting(submitted.textAlpha, existing.textAlpha, 1),
        borderWidth: numberOrExisting(submitted.borderWidth, existing.borderWidth, 1, 0, 6),
        radius: numberOrExisting(submitted.radius, existing.radius, 11, 0, 40),
        fontSize: numberOrExisting(submitted.fontSize, existing.fontSize, 0.82, 0.4, 1.6),
        iconSize: numberOrExisting(submitted.iconSize, existing.iconSize, 0.92, 0.62, 2.4),
        tagFontSize: numberOrExisting(submitted.tagFontSize, existing.tagFontSize, 0.62, 0.2, 1.2),
        tagHeight: numberOrExisting(submitted.tagHeight, existing.tagHeight, 26, 10, 52),
        tagWidth: numberOrExisting(submitted.tagWidth, existing.tagWidth, 92, 36, 180),
        tagRadius: numberOrExisting(submitted.tagRadius, existing.tagRadius, 4, 0, 16),
        tagGlowEnabled: "tagGlowEnabled" in submitted ? Boolean(submitted.tagGlowEnabled) : (existing.tagGlowEnabled !== false),
        tagGlowBlur: numberOrExisting(submitted.tagGlowBlur, existing.tagGlowBlur, 14, 0, 32),
        verticalItemHeight: numberOrExisting(submitted.verticalItemHeight, existing.verticalItemHeight, 38, 18, 72),
        position: this._getStageGoblinOrientationPosition(existing.position, normalizedOrientation, previousOrientation, index),
        collapsed: Boolean(existing.collapsed),
        selectedPlannerId: existing.selectedPlannerId ?? null
      };
    });
    return {
      ...current,
      barCount,
      showLabels: Boolean(formState.showLabels),
      bars,
      items: current.items.map((item) => bars.some((bar) => bar.id === item.barId) ? item : { ...item, barId: "bar-1" })
    };
  }

  _getStageGoblinOrientationPosition(position = null, orientation = "horizontal", previousOrientation = "horizontal", index = 0) {
    const fallback = {
      left: 96,
      top: 84 + (index * 76),
      width: 720,
      height: 64
    };
    const currentPosition = position ?? fallback;
    const left = Math.max(0, Number(currentPosition.left) || fallback.left);
    const top = Math.max(0, Number(currentPosition.top) || fallback.top);
    const width = Math.max(240, Number(currentPosition.width) || fallback.width);
    const height = Math.max(30, Number(currentPosition.height) || fallback.height);
    if (orientation === previousOrientation) {
      return { left, top, width, height };
    }
    if (orientation === "vertical") {
      return {
        left,
        top,
        width: Math.max(168, Math.min(width, 210)),
        height: Math.max(320, height)
      };
    }
    return {
      left,
      top,
      width: Math.max(420, width),
      height: Math.max(48, Math.min(height, 72))
    };
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

  async _onAvatarLibraryDefaultsChanged(event) {
    if (!this.form) return;
    const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
    await TheatreStore.saveAvatarLibraryState(formData.avatarLibrary ?? {});
    this._renderLibrary();
  }

  async _onAvatarDefaultsSwitchChanged(event) {
    const input = event.currentTarget;
    const checked = Boolean(input?.checked);
    const switchEl = input?.closest?.(".tom-toggle-switch");
    if (switchEl) switchEl.classList.toggle("is-checked", !checked);
    animateFootlightsToggleSwitch(input, checked);

    window.setTimeout(async () => {
      if (!this.form) return;
      const formData = foundry.utils.expandObject(new FormDataExtended(this.form).object);
      await TheatreStore.saveAvatarLibraryState(formData.avatarLibrary ?? {});
    }, 240);
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
      cropOffsetX: avatar.cropOffsetX ?? 0,
      cropOffsetY: avatar.cropOffsetY ?? 0,
      frameFitScale: avatar.frameFitScale,
      frameImage: avatar.frameImage,
      showBackdrop: avatar.showBackdrop,
      moodImages: avatar.moodImages
    });

    this._closeAvatarEditor();
    await this.manager?.onSettingsChanged?.();
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

  async _promptWorldMapMode(title = tr("Open world map")) {
    const content = `
      <div class="tom-world-map-open-mode-dialog">
        <p class="notes">${tr("Choose how this map should be opened.")}</p>
      </div>
    `;

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title,
        content,
        buttons: {
          windowed: {
            icon: '<i class="fas fa-window-restore"></i>',
            label: tr("Windowed"),
            callback: () => resolve("window")
          },
          fullscreen: {
            icon: '<i class="fas fa-display"></i>',
            label: tr("Fullscreen"),
            callback: () => resolve("stage")
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "windowed",
        close: () => resolve(null)
      });
      dialog.render(true);
      const markDialog = () => dialog.element?.addClass("tom-world-map-open-mode-dialog-host");
      markDialog();
      scheduleTheatreDialogTheme(dialog, MODULE_ID, "360px", TheatreStore.getThemeState());
      requestAnimationFrame(markDialog);
      window.setTimeout(markDialog, 50);
    });
  }

  async _onOpenWorldMap(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    if (!mapId) return;
    const worldMap = TheatreStore.getWorldMapById(mapId);
    if (!worldMap) {
      ui.notifications?.warn(tr("No world map available."));
      return;
    }
    const mode = await this._promptWorldMapMode(tr("Open world map"));
    if (!mode) return;
    await TheatreStore.setActiveWorldMap(mapId);
    const api = game.modules.get(MODULE_ID)?.api;
    if (mode === "stage") api?.openWorldMapStage?.(mapId);
    else api?.openWorldMap?.(mapId);
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

  async _onExportMapPackage(event) {
    event.preventDefault();
    const mapId = String(event.currentTarget.dataset.mapId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(mapId);
    if (!worldMap) return;
    const confirmed = await this._confirmWorldMapPackageExport(worldMap);
    if (!confirmed) return;
    const progress = this._createWorldMapPackageProgressDialog(tr("Exporting map package"));
    try {
      progress.open();
      progress.update(1, tr("Collecting map assets..."));
      const packageData = await this._createWorldMapPackageData(worldMap, { progress });
      progress.update(96, tr("Preparing download..."));
      const fileName = `${sanitizePackageFileName(worldMap.name)}.footlights-map.json`;
      this._saveWorldMapPackageData(packageData, fileName);
      progress.update(100, tr("Export complete."));
      window.setTimeout(() => progress.close(), 650);
      ui.notifications?.info(tr("Map package exported."));
    } catch (error) {
      progress.close();
      console.warn(`${MODULE_ID} | World map export failed`, error);
      ui.notifications?.error(error?.message || tr("Map package could not be exported."));
    }
  }

  async _confirmWorldMapPackageExport(worldMap) {
    return await new Promise((resolve) => {
      const content = `
        <div class="tom-theme-root tom-map-package-confirm">
          <p>${escapeHtml(tr("Export map \"{name}\" as a Footlights map package?", { name: worldMap.name || tr("World Map") }))}</p>
          <p class="notes">${escapeHtml(tr("The package includes the map layout and all map assets used by this map."))}</p>
        </div>
      `;
      const dialog = new Dialog({
        title: tr("Export Map?"),
        content,
        buttons: {
          export: {
            icon: '<i class="fas fa-file-export"></i>',
            label: tr("Export"),
            callback: () => resolve(true)
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "export",
        close: () => resolve(false)
      }, { width: 420, height: "auto" });
      dialog.render(true);
      window.setTimeout(() => {
        scheduleTheatreDialogTheme(dialog, MODULE_ID, "420px", TheatreStore.getThemeState());
        dialog.element?.addClass("tom-map-package-confirm-dialog");
      }, 30);
    });
  }

  async _onImportMapPackage(event) {
    event.preventDefault();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.footlights-map.json,.zip,.footlights-map.zip,application/json,application/zip";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const progress = this._createWorldMapPackageProgressDialog(tr("Importing map package"));
      try {
        progress.open();
        progress.update(1, tr("Reading package..."));
        const importedMap = await this._importWorldMapPackage(file, { progress });
        progress.update(100, tr("Import complete."));
        window.setTimeout(() => progress.close(), 650);
        ui.notifications?.info(tr("World map \"{name}\" was imported.", { name: importedMap.name }));
        this._renderLibrary();
      } catch (error) {
        progress.close();
        console.warn(`${MODULE_ID} | World map import failed`, error);
        ui.notifications?.error(error?.message || tr("Map package could not be imported."));
      }
    }, { once: true });
    input.click();
  }

  async _createWorldMapPackageData(worldMap, { progress = null } = {}) {
    const mapData = duplicateData(worldMap);
    const { files: assetPaths, directories: assetDirectories } = await this._collectWorldMapAssetPaths(mapData);
    const assetManifest = {};
    const assetPayloads = {};
    const usedPackagePaths = new Set();
    const totalAssets = assetPaths.length;
    let exportedAssetCount = 0;

    for (const assetPath of assetPaths) {
      const normalizedPath = this._normalizeWorldMapPackagePath(assetPath);
      if (!normalizedPath) continue;
      try {
        const bytes = await this._fetchWorldMapPackageAsset(normalizedPath);
        let packagePath = `assets/${normalizedPath}`;
        let suffix = 1;
        while (usedPackagePaths.has(packagePath)) {
          const dotIndex = packagePath.lastIndexOf(".");
          packagePath = dotIndex > -1
            ? `${packagePath.slice(0, dotIndex)}-${suffix}${packagePath.slice(dotIndex)}`
            : `${packagePath}-${suffix}`;
          suffix += 1;
        }
        usedPackagePaths.add(packagePath);
        assetManifest[normalizedPath] = packagePath;
        assetPayloads[packagePath] = {
          data: bytesToBase64(bytes)
        };
        exportedAssetCount += 1;
        const percent = totalAssets > 0 ? 8 + Math.round((exportedAssetCount / totalAssets) * 84) : 92;
        progress?.update(percent, tr("Packing asset {current} of {total}...", { current: exportedAssetCount, total: totalAssets }));
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not include map asset`, normalizedPath, error);
      }
    }

    return {
      type: WORLD_MAP_PACKAGE_TYPE,
      version: 1,
      exportedAt: new Date().toISOString(),
      moduleId: MODULE_ID,
      map: mapData,
      assets: assetManifest,
      directories: Object.fromEntries(assetDirectories.map((directory) => [directory, `assets/${directory}`])),
      files: assetPayloads,
      stats: {
        fileCount: Object.keys(assetPayloads).length,
        byteSize: Object.values(assetPayloads).reduce((sum, payload) => sum + Math.ceil(String(payload?.data || "").length * 0.75), 0)
      }
    };
  }

  async _importWorldMapPackage(file, { progress = null } = {}) {
    const manifest = await this._readWorldMapPackageManifest(file);
    if (manifest?.type !== WORLD_MAP_PACKAGE_TYPE || !manifest.map) {
      throw new Error(tr("Map package does not contain a valid Footlights map."));
    }
    const assets = manifest.assets && typeof manifest.assets === "object" ? manifest.assets : {};
    const assetEntries = Object.entries(assets);
    const totalAssets = assetEntries.length;
    progress?.update(6, tr("Preparing import..."));

    const originalMap = duplicateData(manifest.map);
    const importId = randomId();
    const importBasePath = `worlds/${game.world?.id || "world"}/footlights/imports/maps/${importId}`;
    await this._ensureWorldMapDataDirectory(importBasePath);

    const pathRewrites = {};
    const directories = manifest.directories && typeof manifest.directories === "object" ? manifest.directories : {};
    const files = manifest.files && typeof manifest.files === "object" ? manifest.files : {};
    for (const [originalPath, packagePath] of Object.entries(directories)) {
      const normalizedOriginal = this._normalizeWorldMapPackagePath(originalPath);
      const normalizedPackage = this._normalizeWorldMapPackagePath(packagePath);
      if (!normalizedOriginal || !normalizedPackage) continue;
      pathRewrites[normalizedOriginal] = `${importBasePath}/${normalizedPackage}`;
    }
    let importedAssetCount = 0;
    for (const [originalPath, packagePath] of assetEntries) {
      const normalizedOriginal = this._normalizeWorldMapPackagePath(originalPath);
      const normalizedPackage = this._normalizeWorldMapPackagePath(packagePath);
      const filePayload = files[normalizedPackage];
      const bytes = filePayload?.data ? base64ToBytes(filePayload.data) : manifest._zipEntries?.get(normalizedPackage);
      if (!normalizedOriginal || !normalizedPackage || !bytes) continue;
      const targetPath = `${importBasePath}/${normalizedPackage}`;
      const targetDirectory = targetPath.split("/").slice(0, -1).join("/");
      const fileName = targetPath.split("/").pop() || "asset.bin";
      await this._ensureWorldMapDataDirectory(targetDirectory);
      await this._uploadWorldMapPackageAsset(targetDirectory, new File([bytes], fileName));
      pathRewrites[normalizedOriginal] = targetPath;
      importedAssetCount += 1;
      const percent = totalAssets > 0 ? 8 + Math.round((importedAssetCount / totalAssets) * 84) : 92;
      progress?.update(percent, tr("Importing asset {current} of {total}...", { current: importedAssetCount, total: totalAssets }));
    }

    progress?.update(94, tr("Saving map..."));
    const importedMap = this._rewriteWorldMapPackagePaths(originalMap, pathRewrites);
    importedMap.id = importId;
    importedMap.name = this._getImportedWorldMapName(importedMap.name);
    importedMap.updatedAt = Date.now();
    const savedMap = await TheatreStore.upsertWorldMap(importedMap);
    return savedMap;
  }

  _createWorldMapPackageProgressDialog(title) {
    let dialog = null;
    const content = `
      <div class="tom-map-package-progress tom-theme-root">
        <div class="tom-map-package-progress__row">
          <span data-map-package-progress-message>${escapeHtml(tr("Preparing..."))}</span>
          <strong data-map-package-progress-percent>0%</strong>
        </div>
        <div class="tom-map-package-progress__bar" aria-hidden="true">
          <span data-map-package-progress-bar style="width:0%;"></span>
        </div>
      </div>
    `;
    const api = {
      open: () => {
        dialog = new Dialog({
          title,
          content,
          buttons: {},
          close: () => {}
        }, { width: 420 });
        dialog.render(true);
        window.setTimeout(() => {
          scheduleTheatreDialogTheme(dialog, MODULE_ID, "420px", TheatreStore.getThemeState());
          const root = dialog?.element?.[0];
          if (root) applyThemeInlineStyleToHost(root, TheatreStore.getThemeState());
        }, 30);
      },
      update: (percent, message) => {
        const clampedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        const root = dialog?.element?.[0];
        root?.querySelector?.("[data-map-package-progress-message]")?.replaceChildren(document.createTextNode(String(message || "")));
        root?.querySelector?.("[data-map-package-progress-percent]")?.replaceChildren(document.createTextNode(`${clampedPercent}%`));
        root?.querySelector?.("[data-map-package-progress-bar]")?.style?.setProperty("width", `${clampedPercent}%`);
      },
      close: () => {
        dialog?.close?.();
        dialog = null;
      }
    };
    return api;
  }

  async _readWorldMapPackageManifest(file) {
    const text = await file.text();
    const trimmedText = text.trim();
    if (trimmedText.startsWith("{")) return JSON.parse(trimmedText);

    const entries = readStoredZip(await file.arrayBuffer());
    const manifestBytes = entries.get(WORLD_MAP_PACKAGE_FILE);
    if (!manifestBytes) throw new Error(tr("Map package does not contain a Footlights map manifest."));
    const manifest = JSON.parse(bytesToString(manifestBytes));
    manifest._zipEntries = entries;
    return manifest;
  }

  _getImportedWorldMapName(name) {
    const baseName = String(name || tr("World Map")).trim() || tr("World Map");
    const existingNames = new Set(TheatreStore.getWorldMaps().map((entry) => String(entry.name || "").trim()));
    if (!existingNames.has(baseName)) return baseName;
    let index = 2;
    let nextName = `${baseName} ${index}`;
    while (existingNames.has(nextName)) {
      index += 1;
      nextName = `${baseName} ${index}`;
    }
    return nextName;
  }

  _rewriteWorldMapPackagePaths(value, pathRewrites) {
    if (Array.isArray(value)) return value.map((entry) => this._rewriteWorldMapPackagePaths(entry, pathRewrites));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, this._rewriteWorldMapPackagePaths(entry, pathRewrites)]));
    }
    if (typeof value !== "string") return value;
    const normalizedValue = this._normalizeWorldMapPackagePath(value);
    if (!normalizedValue) return value;
    const exact = pathRewrites[normalizedValue];
    if (exact) return exact;
    const prefix = Object.keys(pathRewrites)
      .filter((path) => normalizedValue.startsWith(`${path}/`))
      .sort((a, b) => b.length - a.length)[0];
    return prefix ? `${pathRewrites[prefix]}${normalizedValue.slice(prefix.length)}` : value;
  }

  async _collectWorldMapAssetPaths(worldMap) {
    const paths = new Set();
    const directories = new Set();
    const addPath = (path) => {
      const normalizedPath = this._normalizeWorldMapPackagePath(path);
      if (normalizedPath && !normalizedPath.includes("{")) paths.add(normalizedPath);
    };
    const addDirectory = async (path) => {
      const normalizedPath = this._normalizeWorldMapPackagePath(path);
      if (!normalizedPath) return;
      directories.add(normalizedPath);
      for (const filePath of await this._collectWorldMapDirectoryFiles(normalizedPath)) paths.add(filePath);
    };

    addPath(worldMap.sourceImage);
    addPath(worldMap.thumbnail);
    addPath(worldMap.manifestPath);
    addPath(worldMap.fogSettings?.imagePath);
    await addDirectory(worldMap.tileRootPath);
    for (const overlay of Array.isArray(worldMap.overlays) ? worldMap.overlays : []) {
      addPath(overlay.sourceImage);
      addPath(overlay.manifestPath);
      await addDirectory(overlay.tileRootPath);
    }
    for (const objectOverlay of Array.isArray(worldMap.objectOverlays) ? worldMap.objectOverlays : []) {
      addPath(objectOverlay.imagePath);
    }
    return {
      files: Array.from(paths).sort(),
      directories: Array.from(directories).sort()
    };
  }

  async _collectWorldMapDirectoryFiles(directoryPath) {
    const files = [];
    const normalizedDirectory = this._normalizeWorldMapPackagePath(directoryPath);
    if (!normalizedDirectory || normalizedDirectory.startsWith("modules/")) return files;
    try {
      const result = await FilePicker.browse("data", normalizedDirectory);
      for (const filePath of result.files || []) {
        const normalizedFile = this._normalizeWorldMapPackagePath(filePath);
        if (normalizedFile) files.push(normalizedFile);
      }
      for (const subDirectory of result.dirs || []) {
        files.push(...await this._collectWorldMapDirectoryFiles(subDirectory));
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not browse map asset directory`, normalizedDirectory, error);
    }
    return files;
  }

  async _fetchWorldMapPackageAsset(assetPath) {
    const response = await fetch(this._worldMapAssetUrl(assetPath), { cache: "no-store" });
    if (!response.ok) throw new Error(tr("Asset could not be read: {path}", { path: assetPath }));
    return new Uint8Array(await response.arrayBuffer());
  }

  async _uploadWorldMapPackageAsset(targetDirectory, file) {
    return this._withSuppressedFoundryFileNotifications(async () => (
      FilePicker.upload("data", targetDirectory, file, { notify: false })
    ));
  }

  async _withSuppressedFoundryFileNotifications(callback) {
    const notifications = ui?.notifications;
    if (!notifications?.info) return callback();
    const originalInfo = notifications.info.bind(notifications);
    notifications.info = (message, ...args) => {
      const normalizedMessage = String(message || "").toLowerCase();
      const fileUploadMessage = normalizedMessage.includes("uploaded")
        || normalizedMessage.includes("saved to")
        || normalizedMessage.includes("hochgeladen")
        || normalizedMessage.includes("gespeichert");
      if (fileUploadMessage) return null;
      return originalInfo(message, ...args);
    };
    try {
      return await callback();
    } finally {
      notifications.info = originalInfo;
    }
  }

  _worldMapAssetUrl(assetPath) {
    const normalizedPath = this._normalizeWorldMapPackagePath(assetPath);
    if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
    return new URL(normalizedPath, window.location.href).href;
  }

  _normalizeWorldMapPackagePath(path) {
    const rawPath = String(path || "").trim().replaceAll("\\", "/");
    if (!rawPath || rawPath.startsWith("data:")) return "";
    if (/^https?:\/\//i.test(rawPath)) return rawPath;
    return rawPath.replace(/^\/+/, "").replace(/^\.\/+/, "");
  }

  async _ensureWorldMapDataDirectory(path) {
    const normalizedPath = this._normalizeWorldMapPackagePath(path);
    const segments = normalizedPath.split("/").map((segment) => segment.trim()).filter(Boolean);
    let cursor = "";
    for (const segment of segments) {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      try {
        await FilePicker.createDirectory("data", cursor);
      } catch (error) {
        const message = String(error?.message || error || "").toLowerCase();
        if (!message.includes("eexist") && !message.includes("already") && !message.includes("exists")) {
          throw error;
        }
      }
    }
  }

  _saveWorldMapPackageData(packageData, fileName) {
    const text = JSON.stringify(packageData, null, 2);
    if (typeof saveDataToFile === "function") {
      saveDataToFile(text, "application/json", fileName);
      return;
    }
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      img: FOOTLIGHTS_MACRO_ICON,
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
      img: FOOTLIGHTS_MACRO_ICON,
      command: `game.modules.get("${MODULE_ID}")?.api?.openWorldMapStage("${worldMap.id}");`
    });
    if (macro) ui.notifications?.info(tr("Fullscreen map macro created."));
  }

  async _onCreatePortal(event) {
    event.preventDefault();
    const portal = await TheatreStore.upsertPortal({
      name: tr("New Portal"),
      description: tr("Interactive landing page"),
      elements: []
    });
    if (portal) {
      ui.notifications?.info(tr("Portal \"{name}\" was created.", { name: portal.name }));
      this.portalEditor = portal;
      this._portalContentLayerDrafts.clear();
      this._collapsePortalEditorElementPanels();
      this.portalEditorSelectedElementId = null;
      this.portalEditorSidebarTab = "general";
      this.portalEditorContextMenu = null;
      this._portalEditorOpenFieldsets = new Set(["general-elements"]);
      this._portalEditorSkipNextDisclosureCapture = true;
      this._resetPortalEditorViewport();
      this._renderLibrary();
    }
  }

  async _onEditPortal(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    const portal = TheatreStore.getPortalById(portalId);
    if (!portal) return;
    this.portalEditor = duplicateData(portal);
    this._portalContentLayerDrafts.clear();
    this._collapsePortalEditorElementPanels();
    this.portalEditorSelectedElementId = this.portalEditor.elements?.[0]?.id ?? null;
    this.portalEditorSidebarTab = "general";
    this.portalEditorContextMenu = null;
    this._portalEditorOpenFieldsets = new Set(["general-elements"]);
    this._portalEditorSkipNextDisclosureCapture = true;
    this._resetPortalEditorViewport();
    this._renderLibrary();
  }

  _onCancelPortalEditor(event) {
    event.preventDefault();
    this.portalEditor = null;
    this.portalEditorSelectedElementId = null;
    this.portalEditorSidebarTab = "general";
    this.portalEditorContextMenu = null;
    this.portalEditorCropMode = false;
    this._portalContentLayerDrafts.clear();
    this._resetPortalEditorViewport();
    this._clearPortalEditorStageState();
    this._renderLibrary();
  }

  _collapsePortalEditorElementPanels() {
    const elements = Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : [];
    for (const element of elements) {
      if (Array.isArray(element.contentLayers)) {
        for (const layer of element.contentLayers) layer.expanded = false;
      }
      if (Array.isArray(element.effects)) {
        for (const effect of element.effects) effect.expanded = false;
      }
    }
  }

  _syncPortalEditorFromForm() {
    if (!this.portalEditor || !this.form) return;
    this._syncPortalContentLayerFieldsFromForm();
    const form = this.form;
    const readValue = (name, fallback = "") => String(form.querySelector(`[name="${name}"]`)?.value ?? fallback ?? "").trim();
    const readRawValue = (name, fallback = "") => String(form.querySelector(`[name="${name}"]`)?.value ?? fallback ?? "");
    const readChecked = (name, fallback = false) => {
      const input = form.querySelector(`[name="${name}"]`);
      return input ? Boolean(input.checked) : Boolean(fallback);
    };
    const currentSettings = this.portalEditor.settings ?? {};
    const backdropMode = readValue("portalEditor.settings.fullscreenBackdropMode", currentSettings.fullscreenBackdropMode);
    const backgroundRepeat = readChecked("portalEditor.settings.backgroundRepeatEnabled", normalizePortalBackgroundRepeat(currentSettings.backgroundRepeat) !== "no-repeat") ? "repeat" : "no-repeat";
    const fitHeight = readChecked("portalEditor.settings.fullscreenFitHeight", currentSettings.fullscreenFitMode === "height");
    const fitWidth = readChecked("portalEditor.settings.fullscreenFitWidth", currentSettings.fullscreenFitMode === "width");
    const fullscreenFitMode = fitHeight && !fitWidth
      ? "height"
      : (fitWidth && !fitHeight ? "width" : "none");
    this.portalEditor = {
      ...this.portalEditor,
      name: readValue("portalEditor.name") || this.portalEditor.name || tr("New Portal"),
      description: readRawValue("portalEditor.description", this.portalEditor.description),
      backgroundType: readValue("portalEditor.backgroundType", this.portalEditor.backgroundType) === "video" ? "video" : "image",
      background: readValue("portalEditor.background", this.portalEditor.background),
      thumbnail: readValue("portalEditor.thumbnail", this.portalEditor.thumbnail),
      settings: {
        ...currentSettings,
        hideFoundryUiInFullscreen: readChecked("portalEditor.settings.hideFoundryUiInFullscreen", currentSettings.hideFoundryUiInFullscreen),
        allowPlayerFullscreenToggle: readChecked("portalEditor.settings.allowPlayerFullscreenToggle", currentSettings.allowPlayerFullscreenToggle),
        showGridByDefault: readChecked("portalEditor.settings.showGridByDefault", currentSettings.showGridByDefault !== false),
        snapToGrid: readChecked("portalEditor.settings.snapToGrid", currentSettings.snapToGrid !== false),
        gridSize: Math.max(4, Math.min(200, Number(readValue("portalEditor.settings.gridSize", currentSettings.gridSize)) || 24)),
        surfaceOverrideEnabled: readChecked("portalEditor.settings.surfaceOverrideEnabled", currentSettings.surfaceOverrideEnabled),
        surfaceAspectWidth: Math.max(1, Math.min(64, Number(readValue("portalEditor.settings.surfaceAspectWidth", currentSettings.surfaceAspectWidth)) || 16)),
        surfaceAspectHeight: Math.max(1, Math.min(64, Number(readValue("portalEditor.settings.surfaceAspectHeight", currentSettings.surfaceAspectHeight)) || 9)),
        backgroundFit: "contain",
        backgroundPositionMode: "center",
        backgroundPositionX: 50,
        backgroundPositionY: 50,
        backgroundCropWidthRatio: Math.max(0, Math.min(20, Number(currentSettings.backgroundCropWidthRatio) || 0)),
        backgroundCropHeightRatio: Math.max(0, Math.min(20, Number(currentSettings.backgroundCropHeightRatio) || 0)),
        backgroundCropOffsetX: Math.max(-200, Math.min(200, Number(currentSettings.backgroundCropOffsetX) || 0)),
        backgroundCropOffsetY: Math.max(-200, Math.min(200, Number(currentSettings.backgroundCropOffsetY) || 0)),
        backgroundRepeat,
        fullscreenRoundedBorders: readChecked("portalEditor.settings.fullscreenRoundedBorders", currentSettings.fullscreenRoundedBorders),
        fullscreenBorderRadius: Math.max(0, Math.min(80, Number(readValue("portalEditor.settings.fullscreenBorderRadius", currentSettings.fullscreenBorderRadius)) || 12)),
        fullscreenFitMode,
        fullscreenBackdropMode: ["blur", "image"].includes(backdropMode) ? backdropMode : "color",
        fullscreenBackdropColor: this._normalizePortalColorInput(readValue("portalEditor.settings.fullscreenBackdropColor", currentSettings.fullscreenBackdropColor), "#050910"),
        fullscreenBackdropImage: readValue("portalEditor.settings.fullscreenBackdropImage", currentSettings.fullscreenBackdropImage),
        fullscreenBackdropBlur: Math.max(0, Math.min(40, Number(readValue("portalEditor.settings.fullscreenBackdropBlur", currentSettings.fullscreenBackdropBlur)) || 0)),
        portalAvatarIds: Array.isArray(currentSettings.portalAvatarIds)
          ? currentSettings.portalAvatarIds
          : [],
        autoplayPlaylistId: readValue("portalEditor.settings.autoplayPlaylistId", currentSettings.autoplayPlaylistId),
        autoplayPlaylist: readChecked("portalEditor.settings.autoplayPlaylist", currentSettings.autoplayPlaylist),
        autoplayPlaylistLoop: readChecked("portalEditor.settings.autoplayPlaylistLoop", currentSettings.autoplayPlaylistLoop !== false)
      },
      elements: Array.isArray(this.portalEditor.elements) ? this.portalEditor.elements : []
    };
  }

  _syncPortalContentLayerFieldsFromForm() {
    if (!this.portalEditor || !this.form) return;
    this._syncPortalContentLayerRawFieldsFromForm();
    for (const input of Array.from(this.form.querySelectorAll("[name^='portalContentLayer.']"))) {
      const parts = String(input.name || "").split(".");
      if (parts.length < 3) continue;
      const [, layerId, ...pathParts] = parts;
      const field = pathParts.join(".");
      const element = (Array.isArray(this.portalEditor.elements) ? this.portalEditor.elements : [])
        .find((candidate) => Array.isArray(candidate.contentLayers)
          && candidate.contentLayers.some((layer) => String(layer.id) === String(layerId)));
      const layer = element?.contentLayers?.find?.((entry) => String(entry.id) === String(layerId));
      if (!layer) continue;
      const value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
      if (field === "html") {
        const previousValue = layer.html;
        layer.html = String(value ?? "");
        layer.html = this._rememberPortalContentLayerDraft(layerId, "html", layer.html, previousValue) ?? layer.html;
      }
      else if (field === "css") {
        const previousValue = layer.css;
        layer.css = String(value ?? "");
        layer.css = this._rememberPortalContentLayerDraft(layerId, "css", layer.css, previousValue) ?? layer.css;
      }
      else if (field === "text") {
        const previousValue = layer.text;
        layer.text = String(value ?? "");
        layer.text = this._rememberPortalContentLayerDraft(layerId, "text", layer.text, previousValue) ?? layer.text;
      }
      else if (field === "name") {
        const previousValue = layer.name;
        layer.name = String(value ?? "");
        layer.name = this._rememberPortalContentLayerDraft(layerId, "name", layer.name, previousValue) ?? layer.name;
      }
      else if (field === "media.src") layer.media = { ...(layer.media ?? {}), src: String(value ?? "").trim() };
      else if (field === "media.avatarId") layer.media = { ...(layer.media ?? {}), avatarId: String(value ?? "").trim() };
      else if (field === "media.openActorSheetOnClick") layer.media = { ...(layer.media ?? {}), openActorSheetOnClick: Boolean(value) };
      else if (field === "media.dataPath") layer.media = { ...(layer.media ?? {}), dataPath: String(value ?? "").trim() };
      else if (field === "media.dataFormat") layer.media = { ...(layer.media ?? {}), dataFormat: String(value ?? "{value}") };
      else if (field === "media.fit") layer.media = { ...(layer.media ?? {}), fit: String(value || "contain") };
      else if (field === "media.repeat") layer.media = { ...(layer.media ?? {}), repeat: String(value || "no-repeat") };
      else if (field.startsWith("textStyle.")) {
        const key = field.replace(/^textStyle\./, "");
        const numericFields = new Set(["fontSize", "shadowOpacity", "shadowBlur", "shadowX", "shadowY"]);
        layer.textStyle = {
          ...(layer.textStyle ?? {}),
          [key]: input.type === "checkbox" ? Boolean(value) : (numericFields.has(key) ? Number(value) : String(value ?? ""))
        };
      } else if (field.startsWith("layout.")) {
        const key = field.replace(/^layout\./, "");
        const numericFields = new Set(["scale", "offsetX", "offsetY"]);
        layer.layout = {
          ...(layer.layout ?? {}),
          [key]: numericFields.has(key) ? Number(value) : String(value ?? "")
        };
      }
    }
  }

  _collectPortalEditorData() {
    this._syncPortalEditorFromForm();
    this._applyPortalContentLayerDraftsToElements(this.portalEditor?.elements);
    return {
      ...this.portalEditor,
      elements: Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : []
    };
  }

  async _onSavePortalEditor(event) {
    event.preventDefault();
    if (!this.portalEditor) return;
    const portal = await TheatreStore.upsertPortal(this._collectPortalEditorData());
    this.portalEditor = null;
    this.portalEditorSelectedElementId = null;
    this.portalEditorSidebarTab = "general";
    this.portalEditorContextMenu = null;
    this.portalEditorCropMode = false;
    this._portalContentLayerDrafts.clear();
    this._resetPortalEditorViewport();
    this._clearPortalEditorStageState();
    if (portal) ui.notifications?.info(tr("Portal \"{name}\" was saved.", { name: portal.name }));
    this._renderLibrary();
  }

  _getDefaultPortalElement(type = "object", x = 18, y = 18) {
    const normalizedType = ["object", "image", "video", "text", "shape"].includes(type) ? type : "object";
    const isMedia = ["image", "video"].includes(normalizedType);
    const contentLayers = this._normalizePortalContentLayers({
      type: normalizedType,
      name: tr("Portal object"),
      text: normalizedType === "text" ? tr("Portal text") : "",
      media: {
        src: "",
        type: normalizedType === "video" ? "video" : "image",
        fit: "contain",
        hoverSrc: "",
        hoverType: normalizedType === "video" ? "video" : "image"
      }
    });
    return {
      id: randomId(),
      type: normalizedType,
      name: normalizedType === "object"
        ? tr("Portal object")
        : tr("{type} element", { type: tr(normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)) }),
      text: normalizedType === "text" ? tr("Portal text") : "",
      x: this._clampPortalNumber(x, 0, 96, 18),
      y: this._clampPortalNumber(y, 0, 96, 18),
      width: normalizedType === "text" ? 22 : (isMedia ? 18 : 16),
      height: normalizedType === "text" ? 10 : (isMedia ? 16 : 10),
      zIndex: 1,
      locked: false,
      visible: true,
      visibleToPlayers: true,
      clickableForPlayers: true,
      clickable: true,
      media: {
        src: "",
        type: normalizedType === "video" ? "video" : "image",
        fit: "cover",
        hoverSrc: "",
        hoverType: normalizedType === "video" ? "video" : "image"
      },
      contentLayers,
      action: { type: "none", documentUuid: "", documentId: "", targetMode: "window" },
      style: {
        backgroundColor: "#14202a",
        textColor: "#ffffff",
        borderColor: "#dce6f2",
        borderWidth: 0,
        borderRadius: 6,
        opacity: 1,
        backgroundOpacity: normalizedType === "text" ? 0.35 : (normalizedType === "object" ? 0 : 1),
        textOpacity: 1,
        shapeType: normalizedType === "shape" ? "rounded" : "rectangle",
        keepAspectRatio: false,
        shadow: false,
        hoverScale: 1,
        hoverOpacity: 1
      },
      effects: [],
      clickSound: { src: "", volume: 0.7 },
      hoverSound: { src: "", volume: 0.45 }
    };
  }

  _getPortalEditorElement(elementId = this.portalEditorSelectedElementId) {
    if (!this.portalEditor || !Array.isArray(this.portalEditor.elements)) return null;
    return this.portalEditor.elements.find((element) => element.id === elementId) ?? null;
  }

  _onPortalEditorFieldChanged(event) {
    const name = String(event.currentTarget?.name || "");
    if (event.currentTarget?.checked && name === "portalEditor.settings.fullscreenFitHeight") {
      const widthToggle = this.form?.querySelector?.('[name="portalEditor.settings.fullscreenFitWidth"]');
      if (widthToggle) widthToggle.checked = false;
    } else if (event.currentTarget?.checked && name === "portalEditor.settings.fullscreenFitWidth") {
      const heightToggle = this.form?.querySelector?.('[name="portalEditor.settings.fullscreenFitHeight"]');
      if (heightToggle) heightToggle.checked = false;
    }
    this._syncPortalEditorFromForm();
    if (event.type === "change" && [
      "portalEditor.background",
      "portalEditor.backgroundType",
      "portalEditor.settings.surfaceOverrideEnabled",
      "portalEditor.settings.surfaceAspectWidth",
      "portalEditor.settings.surfaceAspectHeight",
      "portalEditor.settings.backgroundRepeatEnabled",
      "portalEditor.settings.backgroundRepeat",
      "portalEditor.settings.fullscreenRoundedBorders",
      "portalEditor.settings.fullscreenFitHeight",
      "portalEditor.settings.fullscreenFitWidth",
      "portalEditor.settings.showGridByDefault",
      "portalEditor.settings.gridSize",
      "portalEditor.settings.fullscreenBackdropMode"
    ].includes(name)) {
      this._renderLibrary();
    }
  }

  _snapPortalPercentValue(value, axis = "x") {
    const snap = this.portalEditor?.settings?.snapToGrid !== false;
    if (!snap) return value;
    const gridSize = Math.max(4, Math.min(200, Number(this.portalEditor?.settings?.gridSize) || 24));
    const surface = this.form?.querySelector("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect();
    const pixels = axis === "y" ? rect?.height : rect?.width;
    if (!pixels || pixels <= 0) return value;
    const percentStep = (gridSize / pixels) * 100;
    if (!Number.isFinite(percentStep) || percentStep <= 0) return value;
    return Math.round(value / percentStep) * percentStep;
  }

  _onPortalCanvasContextMenu(event) {
    if (!this.portalEditor) return;
    event.preventDefault();
    this._syncPortalEditorFromForm();
    const surface = event.currentTarget;
    const rect = surface.getBoundingClientRect();
    const x = this._clampPortalNumber(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100, 18);
    const y = this._clampPortalNumber(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100, 18);
    const menuPosition = this._getPortalContextMenuPosition(event);
    this.portalEditorContextMenu = {
      x: menuPosition.x,
      y: menuPosition.y,
      inverseScale: menuPosition.inverseScale,
      clientX: event.clientX,
      clientY: event.clientY,
      percentX: x,
      percentY: y,
      elementId: null
    };
    this._renderLibrary();
  }

  _onPortalCanvasClick(event) {
    if (event.target?.closest?.("[data-portal-editor-element-id], .tom-portal-editor-context-menu")) return;
    if (this._portalEditorSuppressNextCanvasClick) {
      this._portalEditorSuppressNextCanvasClick = false;
      return;
    }
    const needsRender = Boolean(this.portalEditorContextMenu)
      || Boolean(this.portalEditorSelectedElementId)
      || this.portalEditorSidebarTab !== "general";
    if (!needsRender) return;
    this._syncPortalEditorFromForm();
    this.portalEditorContextMenu = null;
    this.portalEditorSelectedElementId = null;
    this.portalEditorSidebarTab = "general";
    this._renderLibrary();
  }

  _onPortalElementContextMenu(event) {
    if (!this.portalEditor) return;
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    const elementId = String(event.currentTarget.dataset.portalEditorElementId || "").trim();
    const surface = event.currentTarget.closest("[data-portal-editor-surface]");
    if (!surface) return;
    const menuPosition = this._getPortalContextMenuPosition(event);
    this.portalEditorSelectedElementId = elementId;
    this.portalEditorSidebarTab = "inspector";
    this.portalEditorContextMenu = {
      x: menuPosition.x,
      y: menuPosition.y,
      inverseScale: menuPosition.inverseScale,
      clientX: event.clientX,
      clientY: event.clientY,
      percentX: 0,
      percentY: 0,
      elementId
    };
    this._renderLibrary();
  }

  _onPortalContextMenuAction(event) {
    event.preventDefault();
    const action = String(event.currentTarget.dataset.portalMenuAction || "").trim();
    const menu = this.portalEditorContextMenu;
    if (!this.portalEditor || !menu) return;
    this._syncPortalEditorFromForm();
    if (action === "create-object" || action.startsWith("create-")) {
      const type = action === "create-object" ? "object" : action.replace("create-", "");
      const element = this._getDefaultPortalElement(type, menu.percentX, menu.percentY);
      this.portalEditor.elements = [...(this.portalEditor.elements ?? []), element];
      this.portalEditorSelectedElementId = element.id;
      this.portalEditorSidebarTab = "inspector";
    } else if (action === "edit" && menu.elementId) {
      this.portalEditorSelectedElementId = menu.elementId;
      this.portalEditorSidebarTab = "inspector";
    } else if (action === "duplicate" && menu.elementId) {
      this._duplicatePortalElementById(menu.elementId);
    } else if (action === "delete" && menu.elementId) {
      this._deletePortalElementById(menu.elementId);
    } else if (["front", "back", "up", "down"].includes(action) && menu.elementId) {
      this._setPortalElementLayer(menu.elementId, action);
    } else if (action === "toggle-lock" && menu.elementId) {
      const element = this._getPortalEditorElement(menu.elementId);
      if (element) element.locked = !element.locked;
    }
    this.portalEditorContextMenu = null;
    this._renderLibrary();
  }

  _onClosePortalContextMenu(event) {
    event.preventDefault();
    this.portalEditorContextMenu = null;
    this._renderLibrary();
  }

  _onSetPortalSidebarTab(event) {
    event.preventDefault();
    this._syncPortalEditorFromForm();
    const tab = String(event.currentTarget.dataset.portalSidebarTab || "general").trim();
    this.portalEditorSidebarTab = tab === "inspector" ? "inspector" : "general";
    this._renderLibrary();
  }

  _onTogglePortalEditorObjectFrames(event) {
    event.preventDefault();
    this._syncPortalEditorFromForm();
    this.portalEditorShowObjectFrames = !this.portalEditorShowObjectFrames;
    this._renderLibrary();
  }

  _onTogglePortalCropMode(event) {
    event.preventDefault();
    if (!this.portalEditor) return;
    this._syncPortalEditorFromForm();
    this.portalEditor.settings = {
      ...(this.portalEditor.settings ?? {}),
      surfaceOverrideEnabled: true,
      backgroundFit: "contain",
      backgroundPositionMode: "center",
      backgroundPositionX: 50,
      backgroundPositionY: 50
    };
    this.portalEditorCropMode = !this.portalEditorCropMode;
    this._renderLibrary();
  }

  _onPortalCropHandlePointerDown(event) {
    if (event.button !== 0 || !this.portalEditor) return;
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    this.portalEditor.settings = {
      ...(this.portalEditor.settings ?? {}),
      surfaceOverrideEnabled: true,
      backgroundFit: "contain",
      backgroundPositionMode: "center",
      backgroundPositionX: 50,
      backgroundPositionY: 50
    };
    const surface = event.currentTarget.closest("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect?.();
    if (!rect) return;
    const zoom = Math.max(0.1, Number(this.portalEditorZoom) || 1);
    this._updatePortalEditorBackgroundOverrideSizing(surface, rect.width / Math.max(1, rect.height));
    const frame = event.currentTarget.closest("[data-portal-crop-frame]");
    const backgroundNode = surface.querySelector(".tom-portal-editor-canvas__background");
    const backgroundRect = backgroundNode?.getBoundingClientRect?.();
    this._portalEditorDragState = {
      mode: "surface-resize",
      edge: String(event.currentTarget.dataset.portalCropHandle || ""),
      surface,
      frame,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: frame?.offsetWidth || surface.offsetWidth || (rect.width / zoom),
      startHeight: frame?.offsetHeight || surface.offsetHeight || (rect.height / zoom),
      startBackgroundWidth: backgroundNode?.offsetWidth || ((backgroundRect?.width || rect.width) / zoom),
      startBackgroundHeight: backgroundNode?.offsetHeight || ((backgroundRect?.height || rect.height) / zoom),
      startOffsetX: Number(this.portalEditor.settings?.backgroundCropOffsetX) || 0,
      startOffsetY: Number(this.portalEditor.settings?.backgroundCropOffsetY) || 0,
      startPanX: Number(this.portalEditorPanX) || 0,
      startPanY: Number(this.portalEditorPanY) || 0,
      startZoom: zoom,
      minSize: 96
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this._onPortalEditorPointerMove);
    document.addEventListener("pointerup", this._onPortalEditorPointerUp, { once: true });
  }

  _applyPortalSurfaceAspectFromPixels(width, height) {
    if (!this.portalEditor) return;
    const aspect = Math.max(1 / 64, Math.min(64, Number(width) / Math.max(1, Number(height))));
    const next = aspect >= 1
      ? { width: Math.min(64, aspect * 9), height: 9 }
      : { width: 9, height: Math.min(64, 9 / aspect) };
    this.portalEditor.settings = {
      ...(this.portalEditor.settings ?? {}),
      surfaceOverrideEnabled: true,
      surfaceAspectWidth: Number(next.width.toFixed(2)),
      surfaceAspectHeight: Number(next.height.toFixed(2)),
      backgroundFit: "contain",
      backgroundPositionMode: "center",
      backgroundPositionX: 50,
      backgroundPositionY: 50
    };
  }

  _onTogglePortalEditorFoundryRightSidebar(event) {
    event.preventDefault();
    document.body?.classList?.toggle("tom-shared-right-sidebar-open");
    this._renderLibrary();
  }

  _onPortalElementSelect(event) {
    event.preventDefault();
    event.stopPropagation();
    const elementId = String(event.currentTarget.dataset.portalEditorElementId || "").trim();
    if (!elementId) return;
    const needsRender = this.portalEditorSelectedElementId !== elementId || this.portalEditorSidebarTab !== "inspector" || this.portalEditorContextMenu;
    if (!needsRender) return;
    this._syncPortalEditorFromForm();
    this.portalEditorSelectedElementId = elementId;
    this.portalEditorSidebarTab = "inspector";
    this.portalEditorContextMenu = null;
    this._renderLibrary();
  }

  _onSelectPortalElementFromList(event) {
    event.preventDefault();
    const elementId = String(event.currentTarget.dataset.portalElementId || "").trim();
    if (!elementId) return;
    this._syncPortalEditorFromForm();
    this.portalEditorSelectedElementId = elementId;
    this.portalEditorSidebarTab = "inspector";
    this.portalEditorContextMenu = null;
    this._renderLibrary();
  }

  _onPortalElementPointerDown(event) {
    if (event.button !== 0 || !this.portalEditor) return;
    if (event.target?.closest?.("[data-portal-resize-handle]")) return;
    const elementId = String(event.currentTarget.dataset.portalEditorElementId || "").trim();
    const element = this._getPortalEditorElement(elementId);
    if (!element || element.locked) return;
    const elementRect = event.currentTarget.getBoundingClientRect?.();
    if (this.portalEditorShowObjectFrames && elementRect
      && event.clientX >= elementRect.right - 24
      && event.clientY >= elementRect.bottom - 24) {
      this._startPortalElementResize(event, event.currentTarget);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    const needsInspectorRender = this.portalEditorSelectedElementId !== elementId || this.portalEditorSidebarTab !== "inspector";
    this.portalEditorSelectedElementId = elementId;
    this.portalEditorSidebarTab = "inspector";
    const surface = event.currentTarget.closest("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect();
    if (!rect) return;
    this._portalEditorDragState = {
      mode: "move",
      elementId,
      rect,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(element.x) || 0,
      startY: Number(element.y) || 0,
      needsInspectorRender
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this._onPortalEditorPointerMove);
    document.addEventListener("pointerup", this._onPortalEditorPointerUp, { once: true });
  }

  _onPortalElementResizePointerDown(event) {
    if (event.button !== 0 || !this.portalEditor) return;
    this._startPortalElementResize(event, event.currentTarget.closest("[data-portal-editor-element-id]"));
  }

  _startPortalElementResize(event, elementNode) {
    if (!elementNode || !this.portalEditor) return;
    event.preventDefault();
    event.stopPropagation();
    const elementId = String(elementNode?.dataset.portalEditorElementId || "").trim();
    const element = this._getPortalEditorElement(elementId);
    if (!element || element.locked) return;
    this._syncPortalEditorFromForm();
    const needsInspectorRender = this.portalEditorSelectedElementId !== elementId || this.portalEditorSidebarTab !== "inspector";
    this.portalEditorSelectedElementId = elementId;
    this.portalEditorSidebarTab = "inspector";
    const surface = elementNode.closest("[data-portal-editor-surface]");
    const rect = surface?.getBoundingClientRect();
    if (!rect) return;
    this._portalEditorDragState = {
      mode: "resize",
      elementId,
      rect,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: Number(element.width) || 8,
      startHeight: Number(element.height) || 8,
      startX: Number(element.x) || 0,
      startY: Number(element.y) || 0,
      needsInspectorRender
    };
    elementNode.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this._onPortalEditorPointerMove);
    document.addEventListener("pointerup", this._onPortalEditorPointerUp, { once: true });
  }

  _onPortalEditorPointerMove(event) {
    const drag = this._portalEditorDragState;
    if (!drag || !this.portalEditor) return;
    if (drag.mode === "pan") {
      const distance = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      if (distance > 3) this._portalEditorSuppressNextCanvasClick = true;
      drag.pendingPanX = (Number(drag.startPanX) || 0) + event.clientX - drag.startClientX;
      drag.pendingPanY = (Number(drag.startPanY) || 0) + event.clientY - drag.startClientY;
      if (!drag.panFrameRequest) {
        drag.panFrameRequest = window.requestAnimationFrame(() => {
          drag.panFrameRequest = null;
          this._setPortalEditorPan(drag.pendingPanX, drag.pendingPanY);
        });
      }
      return;
    }
    if (drag.mode === "surface-resize") {
      event.preventDefault();
      const zoom = Math.max(0.1, Number(drag.startZoom) || 1);
      const deltaX = (event.clientX - drag.startClientX) / zoom;
      const deltaY = (event.clientY - drag.startClientY) / zoom;
      let nextWidth = Number(drag.startWidth) || 1;
      let nextHeight = Number(drag.startHeight) || 1;
      if (drag.edge === "e") nextWidth += deltaX;
      if (drag.edge === "w") nextWidth -= deltaX;
      if (drag.edge === "s") nextHeight += deltaY;
      if (drag.edge === "n") nextHeight -= deltaY;
      nextWidth = Math.max(Number(drag.minSize) || 96, nextWidth);
      nextHeight = Math.max(Number(drag.minSize) || 96, nextHeight);
      const centerDeltaX = drag.edge === "e"
        ? (nextWidth - (Number(drag.startWidth) || nextWidth)) / 2
        : (drag.edge === "w" ? ((Number(drag.startWidth) || nextWidth) - nextWidth) / 2 : 0);
      const centerDeltaY = drag.edge === "s"
        ? (nextHeight - (Number(drag.startHeight) || nextHeight)) / 2
        : (drag.edge === "n" ? ((Number(drag.startHeight) || nextHeight) - nextHeight) / 2 : 0);
      this._applyPortalSurfaceAspectFromPixels(nextWidth, nextHeight);
      this.portalEditor.settings.backgroundCropWidthRatio = Math.max(0.05, Math.min(20, (Number(drag.startBackgroundWidth) || nextWidth) / Math.max(1, nextWidth)));
      this.portalEditor.settings.backgroundCropHeightRatio = Math.max(0.05, Math.min(20, (Number(drag.startBackgroundHeight) || nextHeight) / Math.max(1, nextHeight)));
      const startOffsetPxX = ((Number(drag.startOffsetX) || 0) / 100) * (Number(drag.startWidth) || nextWidth);
      const startOffsetPxY = ((Number(drag.startOffsetY) || 0) / 100) * (Number(drag.startHeight) || nextHeight);
      this.portalEditor.settings.backgroundCropOffsetX = Math.max(-200, Math.min(200, ((startOffsetPxX - centerDeltaX) / Math.max(1, nextWidth)) * 100));
      this.portalEditor.settings.backgroundCropOffsetY = Math.max(-200, Math.min(200, ((startOffsetPxY - centerDeltaY) / Math.max(1, nextHeight)) * 100));
      if (drag.frame) {
        drag.frame.style.width = `${nextWidth}px`;
        drag.frame.style.height = `${nextHeight}px`;
        drag.frame.style.left = `calc(50% + ${centerDeltaX.toFixed(2)}px)`;
        drag.frame.style.top = `calc(50% + ${centerDeltaY.toFixed(2)}px)`;
      }
      return;
    }
    const element = this._getPortalEditorElement(drag.elementId);
    if (!element) return;
    const deltaX = ((event.clientX - drag.startClientX) / Math.max(1, drag.rect.width)) * 100;
    const deltaY = ((event.clientY - drag.startClientY) / Math.max(1, drag.rect.height)) * 100;
    if (drag.mode === "resize") {
      let nextWidth = this._clampPortalNumber(this._snapPortalPercentValue((drag.startWidth || 8) + deltaX, "x"), PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, drag.startWidth || 8);
      let nextHeight = this._clampPortalNumber(this._snapPortalPercentValue((drag.startHeight || 8) + deltaY, "y"), PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, drag.startHeight || 8);
      if (element.media?.avatarId || element.style?.keepAspectRatio) {
        const aspect = this._getPortalElementLockedPixelAspect(element, drag);
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          nextHeight = (nextWidth * drag.rect.width) / Math.max(1, aspect * drag.rect.height);
        } else {
          nextWidth = (nextHeight * aspect * drag.rect.height) / Math.max(1, drag.rect.width);
        }
        nextWidth = this._clampPortalNumber(nextWidth, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, drag.startWidth || 8);
        nextHeight = this._clampPortalNumber(nextHeight, PORTAL_ELEMENT_SIZE_MIN, PORTAL_ELEMENT_SIZE_MAX, drag.startHeight || 8);
      }
      element.width = nextWidth;
      element.height = nextHeight;
    } else {
      element.x = this._clampPortalNumber(this._snapPortalPercentValue(drag.startX + deltaX, "x"), PORTAL_ELEMENT_POSITION_MIN, PORTAL_ELEMENT_POSITION_MAX, drag.startX);
      element.y = this._clampPortalNumber(this._snapPortalPercentValue(drag.startY + deltaY, "y"), PORTAL_ELEMENT_POSITION_MIN, PORTAL_ELEMENT_POSITION_MAX, drag.startY);
    }
    const node = this.form?.querySelector(`[data-portal-editor-element-id="${drag.elementId}"]`);
    if (node) node.style.cssText = this._buildPortalEditorElementStyle(element);
  }

  _onPortalEditorPointerUp() {
    const drag = this._portalEditorDragState;
    if (!drag) return;
    if (drag.mode === "pan" && drag.panFrameRequest) {
      window.cancelAnimationFrame(drag.panFrameRequest);
      drag.panFrameRequest = null;
      this._setPortalEditorPan(drag.pendingPanX, drag.pendingPanY);
    }
    drag.canvas?.classList?.remove("is-panning");
    this._portalEditorDragState = null;
    document.removeEventListener("pointermove", this._onPortalEditorPointerMove);
    if (drag.mode === "surface-resize") {
      this._renderLibrary();
      return;
    }
    if (drag.mode !== "pan") {
      if (drag.needsInspectorRender) {
        this._renderLibrary();
        return;
      }
      const element = this._getPortalEditorElement(drag.elementId);
      if (element) this._refreshPortalElementGeometryControls(element);
    }
  }

  _refreshPortalElementGeometryControls(element = {}) {
    if (!this.form) return;
    const geometryFields = {
      "portalElement.x": element.x,
      "portalElement.y": element.y,
      "portalElement.width": element.width,
      "portalElement.height": element.height
    };
    for (const [name, value] of Object.entries(geometryFields)) {
      const input = this.form.querySelector(`[name="${name}"]`);
      if (!input) continue;
      input.value = Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, "") : "";
    }
  }

  _onPortalElementFieldChanged(event) {
    if (!this.portalEditor) return;
    const element = this._getPortalEditorElement();
    if (!element) return;
    const input = event.currentTarget;
    const field = String(input.name || "").replace(/^portalElement\./, "");
    const value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
    this._setPortalElementField(element, field, value);
    if (["text", "media.src", "media.fit", "type"].includes(field)) {
      element.contentLayers = this._normalizePortalContentLayers(element);
    }
    if (field === "type") {
      element.media = {
        ...(element.media ?? {}),
        type: value === "video" ? "video" : "image",
        hoverType: value === "video" ? "video" : "image"
      };
      this._renderLibrary();
      return;
    }
    if (field === "action.type") {
      this._renderLibrary();
      return;
    }
    if (field === "style.shapeType") {
      if (["circle", "diamond", "triangle"].includes(String(value))) {
        element.style = { ...(element.style ?? {}), keepAspectRatio: element.style?.keepAspectRatio ?? true };
        if (element.style.keepAspectRatio) {
          this._applyPortalElementPixelAspect(element, 1);
        }
      } else {
        element.style = { ...(element.style ?? {}), keepAspectRatio: false };
      }
      this._renderLibrary();
      return;
    }
    if (field === "style.keepAspectRatio" && value) {
      this._applyPortalElementPixelAspect(element, this._getPortalElementLockedPixelAspect(element));
      this._renderLibrary();
      return;
    }
    if (element.media?.avatarId) {
      element.style = { ...(element.style ?? {}), keepAspectRatio: true };
    }
    const node = this.form?.querySelector(`[data-portal-editor-element-id="${element.id}"]`);
    if (node) {
      node.style.cssText = this._buildPortalEditorElementStyle(element);
      const visual = node.querySelector(".tom-portal-editor-element__visual");
      if (visual) visual.style.cssText = this._buildPortalEditorElementVisualStyle(element);
    }
  }

  _syncPortalLegacyEffectFields(element) {
    if (!element) return;
    const effects = this._normalizePortalEffects(element);
    element.effects = effects;
    const shadow = effects.find((effect) => effect.type === "shadow" && effect.targetMode !== "layer");
    element.style = {
      ...(element.style ?? {}),
      hoverScale: 1,
      hoverOpacity: 1,
      shadow: Boolean(shadow?.enabled)
    };
  }

  _refreshPortalEditorElementNode(element) {
    if (!element) return;
    const node = this.form?.querySelector(`[data-portal-editor-element-id="${element.id}"]`);
    if (!node) return;
    node.style.cssText = this._buildPortalEditorElementStyle(element);
    node.classList.toggle("is-layer-hidden", element.visible === false);
    node.classList.toggle("is-previewing-effects", this._normalizePortalEffects(element).some((effect) => effect.enabled !== false && effect.hover && effect.preview));
    const visual = node.querySelector(".tom-portal-editor-element__visual");
    if (visual) visual.style.cssText = this._buildPortalEditorElementVisualStyle(element);
    for (const row of this._getPortalContentLayerRows(element)) {
      const layerNode = node.querySelector(`[data-portal-content-layer-id="${row.id}"]`);
      if (layerNode) layerNode.style.cssText = row.layerStyle;
    }
  }

  _getPortalEffect(element, effectId) {
    if (!element) return null;
    element.effects = this._normalizePortalEffects(element);
    return element.effects.find((effect) => String(effect.id) === String(effectId)) ?? null;
  }

  _getPortalContentLayer(element, layerId) {
    if (!element) return null;
    element.contentLayers = this._normalizePortalContentLayers(element);
    return element.contentLayers.find((layer) => String(layer.id) === String(layerId)) ?? null;
  }

  _syncPortalLegacyContentFields(element) {
    if (!element) return;
    element.contentLayers = this._normalizePortalContentLayers(element);
    const primary = element.contentLayers.find((layer) => layer.visible !== false) || element.contentLayers[0];
    if (!primary || primary.type === "portalAvatar" || element.type === "object" || element.media?.avatarId) return;
    element.type = primary.type;
    element.text = primary.type === "text" ? String(primary.text || "") : "";
    element.media = {
      ...(element.media ?? {}),
      ...(primary.media ?? {}),
      type: primary.type === "video" ? "video" : "image",
      hoverType: primary.type === "video" ? "video" : "image"
    };
  }

  _onAddPortalContentLayer(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    if (!element) return;
    const type = String(event.currentTarget?.dataset?.layerType || "").trim();
    if (!type) return;
    element.type = element.type || "object";
    element.contentLayers = this._normalizePortalContentLayers(element);
    const overrides = { zIndex: element.contentLayers.length + 1 };
    if (["portalAvatar", "dataText"].includes(type)) {
      const firstAvatarId = String(TheatreStore.getAvatars()?.[0]?.id || "").trim();
      overrides.media = { avatarId: firstAvatarId };
    }
    element.contentLayers.push(this._createPortalContentLayer(type, overrides));
    this._syncPortalLegacyContentFields(element);
    this._renderLibrary();
  }

  _onDeletePortalContentLayer(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const layerId = String(event.currentTarget?.dataset?.layerId || "").trim();
    if (!element || !layerId) return;
    element.contentLayers = this._normalizePortalContentLayers(element).filter((layer) => String(layer.id) !== layerId);
    this._syncPortalLegacyContentFields(element);
    this._renderLibrary();
  }

  _onTogglePortalContentLayer(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const layer = this._getPortalContentLayer(element, event.currentTarget?.dataset?.layerId);
    if (!layer) return;
    layer.visible = layer.visible === false;
    this._syncPortalLegacyContentFields(element);
    this._renderLibrary();
  }

  _onTogglePortalContentLayerExpanded(event) {
    event.preventDefault();
    event.stopPropagation();
    const element = this._getPortalEditorElement();
    const layer = this._getPortalContentLayer(element, event.currentTarget?.dataset?.layerId);
    if (!layer) return;
    layer.expanded = layer.expanded === false;
    this._renderLibrary();
  }

  _onMovePortalContentLayer(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const layerId = String(event.currentTarget?.dataset?.layerId || "").trim();
    const direction = String(event.currentTarget?.dataset?.layerDirection || "").trim();
    if (!element || !layerId) return;
    this._movePortalContentLayer(element, layerId, direction === "up" ? -1 : 1);
    this._renderLibrary();
  }

  _movePortalContentLayer(element, layerId, delta = 0) {
    const layers = this._normalizePortalContentLayers(element)
      .sort((a, b) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1));
    const index = layers.findIndex((layer) => String(layer.id) === String(layerId));
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return false;
    const [layer] = layers.splice(index, 1);
    layers.splice(nextIndex, 0, layer);
    this._renumberPortalContentLayerStack(element, layers);
    return true;
  }

  _renumberPortalContentLayerStack(element, layers = null) {
    const orderedLayers = Array.isArray(layers)
      ? layers
      : this._normalizePortalContentLayers(element).sort((a, b) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1));
    const count = orderedLayers.length;
    element.contentLayers = orderedLayers.map((layer, index) => ({
      ...layer,
      zIndex: count - index
    }));
    this._syncPortalLegacyContentFields(element);
  }

  _onPortalContentLayerDragStart(event) {
    const layerId = String(event.currentTarget?.dataset?.layerId || "").trim();
    if (!layerId) return;
    this._portalContentLayerDragId = layerId;
    event.originalEvent?.dataTransfer?.setData?.("text/plain", layerId);
    if (event.originalEvent?.dataTransfer) event.originalEvent.dataTransfer.effectAllowed = "move";
    event.currentTarget.closest?.("[data-portal-content-layer-card-id]")?.classList.add("is-dragging");
  }

  _onPortalContentLayerDragOver(event) {
    if (!this._portalContentLayerDragId) return;
    event.preventDefault();
    const card = event.currentTarget?.closest?.("[data-portal-content-layer-card-id]");
    if (!card || card.dataset.portalContentLayerCardId === this._portalContentLayerDragId) return;
    const rect = card.getBoundingClientRect();
    const isAfter = event.originalEvent.clientY > rect.top + rect.height / 2;
    card.classList.toggle("is-drop-before", !isAfter);
    card.classList.toggle("is-drop-after", isAfter);
  }

  _onPortalContentLayerDragLeave(event) {
    event.currentTarget?.classList?.remove("is-drop-before", "is-drop-after");
  }

  _onPortalContentLayerDrop(event) {
    if (!this._portalContentLayerDragId) return;
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const targetId = String(event.currentTarget?.dataset?.portalContentLayerCardId || "").trim();
    const sourceId = this._portalContentLayerDragId;
    this._clearPortalContentLayerDragClasses();
    this._portalContentLayerDragId = null;
    if (!element || !targetId || !sourceId || targetId === sourceId) return;
    const layers = this._normalizePortalContentLayers(element)
      .sort((a, b) => (Number(b.zIndex) || 1) - (Number(a.zIndex) || 1));
    const sourceIndex = layers.findIndex((layer) => String(layer.id) === sourceId);
    const targetIndex = layers.findIndex((layer) => String(layer.id) === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const targetCard = event.currentTarget;
    const rect = targetCard.getBoundingClientRect();
    const isAfter = event.originalEvent.clientY > rect.top + rect.height / 2;
    const [layer] = layers.splice(sourceIndex, 1);
    let insertIndex = layers.findIndex((entry) => String(entry.id) === targetId);
    if (insertIndex < 0) insertIndex = layers.length;
    if (isAfter) insertIndex += 1;
    layers.splice(insertIndex, 0, layer);
    this._renumberPortalContentLayerStack(element, layers);
    this._renderLibrary();
  }

  _onPortalContentLayerDragEnd() {
    this._portalContentLayerDragId = null;
    this._clearPortalContentLayerDragClasses();
  }

  _clearPortalContentLayerDragClasses() {
    this.form?.querySelectorAll?.("[data-portal-content-layer-card-id]").forEach((card) => {
      card.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
  }

  _onPortalContentLayerFieldChanged(event) {
    const element = this._getPortalEditorElement();
    if (!element) return;
    const input = event.currentTarget;
    const parts = String(input.name || "").split(".");
    if (parts.length < 3) return;
    const [, layerId, ...pathParts] = parts;
    const layer = this._getPortalContentLayer(element, layerId);
    if (!layer) return;
    const field = pathParts.join(".");
    const value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
    if (field === "text") {
      const previousValue = layer.text;
      layer.text = String(value ?? "");
      layer.text = this._rememberPortalContentLayerDraft(layerId, "text", layer.text, previousValue) ?? layer.text;
    }
    else if (field === "html") {
      const previousValue = layer.html;
      layer.html = String(value ?? "");
      layer.html = this._rememberPortalContentLayerDraft(layerId, "html", layer.html, previousValue) ?? layer.html;
    }
    else if (field === "css") {
      const previousValue = layer.css;
      layer.css = String(value ?? "");
      layer.css = this._rememberPortalContentLayerDraft(layerId, "css", layer.css, previousValue) ?? layer.css;
    }
    else if (field === "name") {
      const previousValue = layer.name;
      layer.name = String(value ?? "");
      layer.name = this._rememberPortalContentLayerDraft(layerId, "name", layer.name, previousValue) ?? layer.name;
    }
    else if (field === "visible") layer.visible = Boolean(value);
    else if (field === "media.src") layer.media = { ...(layer.media ?? {}), src: String(value || "").trim() };
    else if (field === "media.avatarId") layer.media = { ...(layer.media ?? {}), avatarId: String(value || "").trim() };
    else if (field === "media.openActorSheetOnClick") layer.media = { ...(layer.media ?? {}), openActorSheetOnClick: Boolean(value) };
    else if (field === "media.dataPath") layer.media = { ...(layer.media ?? {}), dataPath: String(value || "").trim() };
    else if (field === "media.dataPathPicker" && String(value || "").trim()) layer.media = { ...(layer.media ?? {}), dataPath: String(value || "").trim() };
    else if (field === "media.dataFormat") layer.media = { ...(layer.media ?? {}), dataFormat: String(value || "{value}") };
    else if (field === "media.fit") layer.media = { ...(layer.media ?? {}), fit: String(value || "contain") };
    else if (field === "media.repeat") layer.media = { ...(layer.media ?? {}), repeat: String(value || "no-repeat") };
    else if (field.startsWith("textStyle.")) {
      const key = field.replace(/^textStyle\./, "");
      const numericFields = new Set(["fontSize", "shadowOpacity", "shadowBlur", "shadowX", "shadowY"]);
      layer.textStyle = {
        ...(layer.textStyle ?? {}),
        [key]: input.type === "checkbox" ? Boolean(value) : (numericFields.has(key) ? Number(value) : String(value || ""))
      };
    }
    else if (field.startsWith("layout.")) {
      const key = field.replace(/^layout\./, "");
      const numericFields = new Set(["scale", "offsetX", "offsetY"]);
      layer.layout = {
        ...(layer.layout ?? {}),
        [key]: numericFields.has(key) ? Number(value) : String(value || "")
      };
    }
    this._syncPortalLegacyContentFields(element);
    const liveFields = new Set([
      "text",
      "html",
      "css",
      "layout.scale",
      "layout.offsetX",
      "layout.offsetY",
      "layout.alignX",
      "layout.alignY",
      "layout.textAlign",
      "textStyle.fontFamily",
      "textStyle.fontSize",
      "textStyle.color",
      "textStyle.shadow",
      "textStyle.shadowColor",
      "textStyle.shadowOpacity",
      "textStyle.shadowBlur",
      "textStyle.shadowX",
      "textStyle.shadowY",
      "media.dataPath",
      "media.dataFormat",
      "media.fit",
      "media.repeat"
    ]);
    if (liveFields.has(field)) {
      this._refreshPortalLayerControlState(input);
      this._refreshPortalEditorContentLayerNode(element, layer);
      return;
    }
    this._renderLibrary();
  }

  _onPortalContentLayerRawFieldChanged(event) {
    const textarea = event.currentTarget;
    const layer = this._findPortalContentLayerById(textarea?.dataset?.portalContentLayerRawId);
    const field = String(textarea?.dataset?.portalContentLayerRawField || "").trim();
    if (!(textarea instanceof HTMLTextAreaElement) || !layer || !["html", "css"].includes(field)) return;
    const element = (Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : [])
      .find((candidate) => Array.isArray(candidate.contentLayers)
        && candidate.contentLayers.some((entry) => String(entry.id) === String(layer.id)));
    const previousValue = layer[field];
    layer[field] = this._rememberPortalContentLayerDraft(layer.id, field, textarea.value, previousValue) ?? layer[field];
    if (element) {
      this._syncPortalLegacyContentFields(element);
      this._refreshPortalEditorContentLayerNode(element, layer);
    }
  }

  _refreshPortalLayerControlState(input) {
    const controlGroup = input?.closest?.(".tom-portal-layer-controls__group");
    if (!controlGroup || input.type !== "radio") return;
    controlGroup.querySelectorAll(".tom-portal-layer-icon-option").forEach((option) => {
      const radio = option.querySelector("input[type='radio']");
      option.classList.toggle("is-selected", Boolean(radio?.checked));
    });
  }

  _refreshPortalEditorContentLayerNode(element, layer) {
    if (!element || !layer) return;
    const node = this.form?.querySelector(`[data-portal-editor-element-id="${element.id}"] [data-portal-content-layer-id="${layer.id}"]`);
    if (!node) return;
    const rows = this._getPortalContentLayerRows(element);
    const row = rows.find((entry) => String(entry.id) === String(layer.id));
    if (!row) return;
    node.style.cssText = row.layerStyle;
    const text = node.querySelector(".tom-portal-content-layer__text");
    if (text) text.textContent = row.renderedText || "";
    const html = node.querySelector(".tom-portal-content-layer__html");
    if (html) html.innerHTML = row.customHtml || "";
    const style = node.querySelector("style[data-portal-custom-css]");
    if (style) style.textContent = row.scopedCss || "";
  }

  _onAddPortalEffect(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    if (!element) return;
    const type = String(event.currentTarget?.dataset?.effectType || "").trim();
    if (!type) return;
    element.effects = this._normalizePortalEffects(element);
    const firstContentLayer = this._normalizePortalContentLayers(element).find((layer) => layer.visible !== false);
    const targetDefaults = firstContentLayer
      ? { targetMode: "layer", targetLayerId: firstContentLayer.id }
      : {};
    element.effects.push(this._createPortalEffect(type, { expanded: false, ...targetDefaults }));
    this._syncPortalLegacyEffectFields(element);
    this._renderLibrary();
  }

  _onDeletePortalEffect(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const effectId = String(event.currentTarget?.dataset?.effectId || "").trim();
    if (!element || !effectId) return;
    element.effects = this._normalizePortalEffects(element).filter((effect) => String(effect.id) !== effectId);
    this._syncPortalLegacyEffectFields(element);
    this._renderLibrary();
  }

  _onTogglePortalEffectExpanded(event) {
    event.preventDefault();
    event.stopPropagation();
    const element = this._getPortalEditorElement();
    const effect = this._getPortalEffect(element, event.currentTarget?.dataset?.effectId);
    if (!effect) return;
    effect.expanded = !effect.expanded;
    this._renderLibrary();
  }

  _onMovePortalEffect(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const effectId = String(event.currentTarget?.dataset?.effectId || "").trim();
    const direction = String(event.currentTarget?.dataset?.effectDirection || "").trim();
    if (!element || !effectId) return;
    const effects = this._normalizePortalEffects(element);
    const index = effects.findIndex((effect) => String(effect.id) === effectId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= effects.length) return;
    const [effect] = effects.splice(index, 1);
    effects.splice(nextIndex, 0, effect);
    element.effects = effects;
    this._syncPortalLegacyEffectFields(element);
    this._renderLibrary();
  }

  _onPortalEffectDragStart(event) {
    const effectId = String(event.currentTarget?.dataset?.effectId || "").trim();
    if (!effectId) return;
    this._portalEffectDragId = effectId;
    event.originalEvent?.dataTransfer?.setData?.("text/plain", effectId);
    if (event.originalEvent?.dataTransfer) event.originalEvent.dataTransfer.effectAllowed = "move";
    event.currentTarget.closest?.("[data-portal-effect-id]")?.classList.add("is-dragging");
  }

  _onPortalEffectDragOver(event) {
    if (!this._portalEffectDragId) return;
    event.preventDefault();
    const card = event.currentTarget?.closest?.("[data-portal-effect-id]");
    if (!card || card.dataset.portalEffectId === this._portalEffectDragId) return;
    const rect = card.getBoundingClientRect();
    const isAfter = event.originalEvent.clientY > rect.top + rect.height / 2;
    card.classList.toggle("is-drop-before", !isAfter);
    card.classList.toggle("is-drop-after", isAfter);
  }

  _onPortalEffectDragLeave(event) {
    event.currentTarget?.classList?.remove("is-drop-before", "is-drop-after");
  }

  _onPortalEffectDrop(event) {
    if (!this._portalEffectDragId) return;
    event.preventDefault();
    const element = this._getPortalEditorElement();
    const targetId = String(event.currentTarget?.dataset?.portalEffectId || "").trim();
    const sourceId = this._portalEffectDragId;
    this._clearPortalEffectDragClasses();
    this._portalEffectDragId = null;
    if (!element || !targetId || !sourceId || targetId === sourceId) return;
    const effects = this._normalizePortalEffects(element);
    const sourceIndex = effects.findIndex((effect) => String(effect.id) === sourceId);
    const targetIndex = effects.findIndex((effect) => String(effect.id) === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const targetCard = event.currentTarget;
    const rect = targetCard.getBoundingClientRect();
    const isAfter = event.originalEvent.clientY > rect.top + rect.height / 2;
    const [effect] = effects.splice(sourceIndex, 1);
    let insertIndex = effects.findIndex((entry) => String(entry.id) === targetId);
    if (insertIndex < 0) insertIndex = effects.length;
    if (isAfter) insertIndex += 1;
    effects.splice(insertIndex, 0, effect);
    element.effects = effects;
    this._syncPortalLegacyEffectFields(element);
    this._renderLibrary();
  }

  _onPortalEffectDragEnd() {
    this._portalEffectDragId = null;
    this._clearPortalEffectDragClasses();
  }

  _clearPortalEffectDragClasses() {
    this.form?.querySelectorAll?.("[data-portal-effect-id]").forEach((card) => {
      card.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
  }

  _onPortalEffectFieldChanged(event) {
    if (!this.portalEditor) return;
    const element = this._getPortalEditorElement();
    if (!element) return;
    const input = event.currentTarget;
    const parts = String(input.name || "").split(".");
    if (parts.length < 3) return;
    const [, effectId, field] = parts;
    const effect = this._getPortalEffect(element, effectId);
    if (!effect) return;
    const value = input.type === "checkbox" ? Boolean(input.checked) : input.value;
    if (field === "enabled") {
      effect.enabled = Boolean(value);
    } else if (field === "hover") {
      effect.hover = Boolean(value);
      if (effect.hover) {
        effect.disableOnHover = false;
      }
    } else if (field === "disableOnHover") {
      effect.disableOnHover = Boolean(value);
      if (effect.disableOnHover) {
        effect.hover = false;
        effect.preview = false;
      }
    } else if (field === "preview") {
      effect.preview = Boolean(value);
    } else if (field === "targetMode") {
      effect.targetMode = String(value || "") === "layer" ? "layer" : "object";
      effect.targetLocked = true;
      if (effect.targetMode !== "layer") effect.targetLayerId = "";
      else if (!effect.targetLayerId) {
        const firstLayer = this._normalizePortalContentLayers(element)[0];
        effect.targetLayerId = firstLayer?.id || "";
      }
    } else if (field === "targetLayerId") {
      effect.targetLayerId = String(value || "").trim();
      effect.targetMode = effect.targetLayerId ? "layer" : "object";
      effect.targetLocked = true;
    } else if (field === "hoverDuration") {
      effect.transition = { ...(effect.transition ?? {}), duration: Number(value) };
    } else if (field === "hoverEasing") {
      effect.transition = { ...(effect.transition ?? {}), easing: String(value || "ease") };
    } else {
      const numericFields = new Set(["scale", "opacity", "blur", "spread", "amount", "angle", "x", "y", "perspective", "duration", "saturation", "shine", "spacing", "thickness", "speed", "distance", "rotation", "volume"]);
      effect.settings = {
        ...(effect.settings ?? {}),
        [field]: numericFields.has(field) ? Number(value) : value
      };
    }
    this._syncPortalLegacyEffectFields(element);
    this._refreshPortalEditorElementNode(element);
    const needsRender = ["enabled", "hover", "disableOnHover", "preview", "targetMode", "targetLayerId", "mediaSrc", "soundSrc"].includes(field);
    if (needsRender && event.type === "change") this._renderLibrary();
  }

  _setPortalElementField(element, field, value) {
    const numericFields = new Set([
      "x",
      "y",
      "width",
      "height",
      "zIndex",
      "style.borderWidth",
      "style.borderRadius",
      "style.opacity",
      "style.backgroundOpacity",
      "style.textOpacity",
      "style.hoverScale",
      "style.hoverOpacity",
      "clickSound.volume",
      "hoverSound.volume"
    ]);
    const finalValue = numericFields.has(field) ? Number(value) : value;
    if (element.media?.avatarId && field === "style.keepAspectRatio") {
      element.style = { ...(element.style ?? {}), keepAspectRatio: true };
      return;
    }
    if (field === "action.type") {
      element.action = {
        type: String(value || "none"),
        documentUuid: "",
        documentId: "",
        theatreSceneId: "",
        worldMapId: "",
        portalId: "",
        openMode: "window",
        closeCurrentPortal: false
      };
      return;
    }
    if (field === "type") {
      const nextType = ["object", "image", "video", "text", "shape"].includes(String(value || "")) ? String(value) : "object";
      element.type = nextType;
      if (nextType === "object") return;
      element.contentLayers = this._normalizePortalContentLayers({ ...element, type: nextType });
      return;
    }
    if (field === "action.targetId") {
      const actionType = String(element.action?.type || "none");
      element.action = { ...(element.action ?? {}) };
      if (actionType === "scene") element.action.documentId = String(value || "").trim();
      if (actionType === "theatreScene") element.action.theatreSceneId = String(value || "").trim();
      if (actionType === "worldMap") element.action.worldMapId = String(value || "").trim();
      if (actionType === "portal") element.action.portalId = String(value || "").trim();
      const option = this._getPortalActionTargetOptions(element.action).find((entry) => String(entry.value) === String(value || ""));
      element.action.label = option?.label || "";
      return;
    }
    if (field.includes(".")) {
      const [group, key] = field.split(".");
      element[group] = { ...(element[group] ?? {}), [key]: finalValue };
      return;
    }
    element[field] = finalValue;
  }

  _onPortalLayerAction(event) {
    event.preventDefault();
    event.stopPropagation();
    const action = String(event.currentTarget.dataset.layerAction || "").trim();
    const elementId = event.currentTarget.dataset.portalElementId || this.portalEditorSelectedElementId;
    this._setPortalElementLayer(elementId, action);
    this._renderLibrary();
  }

  _setPortalElementLayer(elementId, action) {
    const element = this._getPortalEditorElement(elementId);
    if (!element) return;
    const elements = Array.isArray(this.portalEditor?.elements) ? this.portalEditor.elements : [];
    const maxLayer = elements.reduce((max, entry) => Math.max(max, Number(entry.zIndex) || 1), 1);
    const minLayer = elements.reduce((min, entry) => Math.min(min, Number(entry.zIndex) || 1), 1);
    if (action === "front") element.zIndex = maxLayer + 1;
    else if (action === "back") element.zIndex = Math.max(1, minLayer - 1);
    else if (action === "up") element.zIndex = (Number(element.zIndex) || 1) + 1;
    else if (action === "down") element.zIndex = Math.max(1, (Number(element.zIndex) || 1) - 1);
  }

  _onDuplicatePortalElement(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    this._duplicatePortalElementById(event.currentTarget.dataset.portalElementId || this.portalEditorSelectedElementId);
    this._renderLibrary();
  }

  _duplicatePortalElementById(elementId) {
    const element = this._getPortalEditorElement(String(elementId || ""));
    if (!element || !this.portalEditor) return;
    const copy = duplicateData(element);
    copy.id = randomId();
    copy.name = tr("{name} Copy", { name: element.name || tr("Portal element") });
    copy.x = this._clampPortalNumber((Number(element.x) || 0) + 3, 0, 96, Number(element.x) || 0);
    copy.y = this._clampPortalNumber((Number(element.y) || 0) + 3, 0, 96, Number(element.y) || 0);
    this.portalEditor.elements = [...(this.portalEditor.elements ?? []), copy];
    this.portalEditorSelectedElementId = copy.id;
    this.portalEditorSidebarTab = "inspector";
  }

  _onDeletePortalElement(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    this._deletePortalElementById(event.currentTarget.dataset.portalElementId || this.portalEditorSelectedElementId);
    this._renderLibrary();
  }

  _deletePortalElementById(elementId) {
    if (!this.portalEditor) return;
    const id = String(elementId || "").trim();
    this.portalEditor.elements = (this.portalEditor.elements ?? []).filter((element) => element.id !== id);
    if (this.portalEditorSelectedElementId === id) {
      this.portalEditorSelectedElementId = this.portalEditor.elements[0]?.id ?? null;
      this.portalEditorSidebarTab = this.portalEditorSelectedElementId ? "inspector" : "general";
    }
  }

  _onTogglePortalElementVisibility(event) {
    event.preventDefault();
    event.stopPropagation();
    this._syncPortalEditorFromForm();
    const element = this._getPortalEditorElement(event.currentTarget.dataset.portalElementId || this.portalEditorSelectedElementId);
    if (!element) return;
    element.visible = element.visible === false;
    this._refreshPortalEditorElementNode(element);
    this._renderLibrary();
  }

  _onPortalDocumentDragOver(event) {
    event.preventDefault();
    const transfer = event.originalEvent?.dataTransfer ?? event.dataTransfer;
    if (transfer) transfer.dropEffect = "copy";
    event.currentTarget.classList.add("is-drag-over");
  }

  _onPortalDocumentDragLeave(event) {
    event.currentTarget.classList.remove("is-drag-over");
  }

  async _onPortalDocumentDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-drag-over");
    const element = this._getPortalEditorElement();
    if (!element) return;
    const data = extractFoundryDocumentDropData(event);
    if (!data) {
      ui.notifications?.warn(tr("Drop a Foundry document here."));
      return;
    }
    const uuid = String(data.uuid || data.tokenUuid || "").trim();
    const type = String(data.type || "").trim();
    if (!uuid) {
      ui.notifications?.warn(tr("This document cannot be linked."));
      return;
    }
    const actionType = type === "Actor" ? "actor" : (type === "JournalEntry" || type === "JournalEntryPage" ? "journal" : (type === "Scene" ? "scene" : "none"));
    if (actionType === "none") {
      ui.notifications?.warn(tr("Portals currently support Actors, Journals, Journal Pages, and Scenes as dropped documents."));
      return;
    }
    element.action = {
      ...(element.action ?? {}),
      type: actionType,
      documentUuid: uuid,
      documentId: String(data.id || data.sceneId || "").trim(),
      label: String(data.name || "").trim()
    };
    const document = await fromUuid?.(uuid);
    const documentName = String(document?.name || data.name || "").trim();
    element.action.label = documentName || element.action.label;
    if (!element.name || element.name === tr("Portal element")) {
      element.name = documentName || element.name || tr("Portal element");
    }
    this.portalEditorSelectedElementId = element.id;
    this._renderLibrary();
  }

  _onClearPortalDocument(event) {
    event.preventDefault();
    const element = this._getPortalEditorElement();
    if (!element) return;
    element.action = { ...(element.action ?? {}), type: "none", documentUuid: "", documentId: "" };
    this._renderLibrary();
  }

  _onPortalPlayMenuToggle(event) {
    const openedMenu = event.currentTarget;
    if (!openedMenu?.open) return;
    const root = this.element?.[0];
    for (const menu of root?.querySelectorAll?.(".tom-portal-library-play-menu[open]") ?? []) {
      if (menu !== openedMenu) menu.removeAttribute("open");
    }
  }

  async _onOpenPortal(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    if (!portalId) return;
    await TheatreStore.setActivePortal(portalId);
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.openPortal === "function") api.openPortal(portalId);
    else ui.notifications?.info(tr("Portal viewer is prepared next. The portal data is ready."));
    this._renderLibrary();
  }

  async _onOpenPortalStage(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    if (!portalId) return;
    await TheatreStore.setActivePortal(portalId);
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.openPortalStage === "function") api.openPortalStage(portalId);
    else ui.notifications?.info(tr("Portal fullscreen viewer is prepared next. The portal data is ready."));
    this._renderLibrary();
  }

  async _onClosePortal(event) {
    event.preventDefault();
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.closePortalWindow === "function") {
      await api.closePortalWindow();
      this._renderLibrary();
    }
  }

  async _onClosePortalStage(event) {
    event.preventDefault();
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.closePortalStage === "function") {
      await api.closePortalStage();
      this._renderLibrary();
    }
  }

  async _onForcePortal(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    if (!portalId || !game.user?.isGM) return;
    await TheatreStore.setActivePortal(portalId);
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.forcePortalWindow === "function") {
      api.forcePortalWindow(portalId);
      ui.notifications?.info(tr("Portal opened for players."));
    }
  }

  async _onForcePortalStage(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    if (!portalId || !game.user?.isGM) return;
    await TheatreStore.setActivePortal(portalId);
    const api = game.modules.get(MODULE_ID)?.api;
    if (typeof api?.forcePortalStage === "function") {
      api.forcePortalStage(portalId);
      ui.notifications?.info(tr("Fullscreen portal opened for players."));
    }
  }

  async _onDuplicatePortal(event) {
    event.preventDefault();
    const portal = await TheatreStore.duplicatePortal(event.currentTarget.dataset.portalId);
    if (portal) {
      ui.notifications?.info(tr("Portal \"{name}\" was duplicated.", { name: portal.name }));
      this._renderLibrary();
    }
  }

  async _onDeletePortal(event) {
    event.preventDefault();
    await TheatreStore.deletePortal(event.currentTarget.dataset.portalId);
    this._renderLibrary();
  }

  async _onCreatePortalMacro(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    const portal = TheatreStore.getPortalById(portalId);
    if (!portal) return;
    const macro = await Macro.create({
      name: tr("Portal: {name}", { name: portal.name }),
      type: "script",
      scope: "global",
      img: FOOTLIGHTS_MACRO_ICON,
      command: `game.modules.get("${MODULE_ID}")?.api?.openPortal?.("${portal.id}");`
    });
    if (macro) ui.notifications?.info(tr("Portal macro created."));
  }

  async _onCreatePortalStageMacro(event) {
    event.preventDefault();
    const portalId = String(event.currentTarget.dataset.portalId || "").trim();
    const portal = TheatreStore.getPortalById(portalId);
    if (!portal) return;
    const macro = await Macro.create({
      name: tr("Fullscreen portal: {name}", { name: portal.name }),
      type: "script",
      scope: "global",
      img: FOOTLIGHTS_MACRO_ICON,
      command: `game.modules.get("${MODULE_ID}")?.api?.openPortalStage?.("${portal.id}");`
    });
    if (macro) ui.notifications?.info(tr("Fullscreen portal macro created."));
  }

  async close(options) {
    clearTimeout(this._windowResizeClassTimeout);
    this._windowResizeClassTimeout = null;
    clearTimeout(this._stageGoblinSetupSaveTimeout);
    this._stageGoblinSetupSaveTimeout = null;
    document.removeEventListener("pointermove", this._onPortalEditorPointerMove);
    document.removeEventListener("pointerup", this._onPortalEditorPointerUp);
    this._portalEditorDragState = null;
    this._portalEditorResizeObserver?.disconnect?.();
    this._portalEditorResizeObserver = null;
    this._closeStageGoblinTargetMenu();
    if (this._onPortalEditorWindowResize) {
      window.removeEventListener("resize", this._onPortalEditorWindowResize);
      this._onPortalEditorWindowResize = null;
    }
    this._clearPortalEditorStageState();
    this.inlinePlannerApp?._setResizeVisualState?.(false);
    this._teardownThemeLayoutObservers();
    return super.close(options);
  }

  async _updateObject() {}
}
