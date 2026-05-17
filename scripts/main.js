import { MODULE_ID, SETTINGS } from "./constants.js";
import { applyTheatreDialogTheme, escapeHtml } from "./helpers.js";
import { initializeLocalization, registerLocalizationHelpers, setActiveLanguage, translate as tr } from "./localization.js";
import { TheatreStore } from "./store.js";
import { TheatreManager } from "./theatre-manager.js";
import { TheatreOverlayApplication } from "./apps/theatre-overlay.js";
import { TheatreSceneLibraryApplication } from "./apps/theatre-scene-library.js";
import { TheatreSceneConfigApplication } from "./apps/theatre-scene-config.js";
import { TheatreActorProfileConfigApplication } from "./apps/theatre-actor-profile-config.js";
import { TheatreAvatarConfigApplication } from "./apps/theatre-avatar-config.js";
import { TheatreAdventurePlannerConfigApplication } from "./apps/theatre-adventure-planner-config.js";
import { TheatreMindmapApplication } from "./apps/theatre-mindmap.js";
import { TheatreStageGoblinApplication } from "./apps/theatre-stage-goblin.js";
import { TheatreGlobalSoundPlayerApplication } from "./apps/theatre-global-sound-player.js";
import { TheatreWorldMapApplication } from "./apps/theatre-world-map.js";
import { TheatreWorldMapStageApplication } from "./apps/theatre-world-map-stage.js";
import { TheatreWorldMapConfigApplication } from "./apps/theatre-world-map-config.js";
import { TheatrePortalApplication, TheatrePortalStageApplication } from "./apps/theatre-portal.js";
import { getWorldMapElementOperation } from "./world-map/element-utils.js";

const manager = new TheatreManager();
let stageGoblinApp = null;
let globalSoundPlayerApp = null;
let footlightsSocketRegistered = false;
let footlightsHooksRegistered = false;
const FOOTLIGHTS_SOCKET_EVENT = `module.${MODULE_ID}`;
const REFRESHABLE_APP_NAMES = new Set([
  "TheatreSceneLibraryApplication",
  "TheatreSceneConfigApplication",
  "TheatreAvatarConfigApplication",
  "TheatreAdventurePlannerConfigApplication",
  "TheatreMindmapApplication",
  "TheatreStageGoblinApplication",
  "TheatreGlobalSoundPlayerApplication",
  "TheatreWorldMapApplication",
  "TheatreWorldMapStageApplication",
  "TheatreWorldMapConfigApplication",
  "TheatrePortalApplication",
  "TheatrePortalStageApplication"
]);
const MINDMAP_SETTING_SKIP_REFRESH_APP_NAMES = new Set([
  "TheatreMindmapApplication",
  "TheatreSceneLibraryApplication"
]);
const WORLD_MAP_APP_NAMES = new Set([
  "TheatreWorldMapApplication",
  "TheatreWorldMapStageApplication"
]);
const PORTAL_APP_NAMES = new Set([
  "TheatrePortalApplication",
  "TheatrePortalStageApplication"
]);
const MAP_LIBRARY_REFRESH_SKIP_APP_NAMES = new Set([
  ...WORLD_MAP_APP_NAMES,
  "TheatreWorldMapConfigApplication"
]);
const FOOTLIGHTS_SCENE_CONTROL_LAYER = "controls";
const FOUNDRY_CONTROL_TITLE_GUARD = "\u2060";

function sceneControlTitle(sourceText) {
  // Foundry localizes Scene Control titles again with the core language.
  // The invisible guard keeps Footlights' own language setting authoritative.
  return `${tr(sourceText)}${FOUNDRY_CONTROL_TITLE_GUARD}`;
}

function findOpenApp(constructorName) {
  return Object.values(ui.windows ?? {}).find((app) => app.constructor?.name === constructorName) ?? null;
}

function openOrFocusApp(constructorName, createApp, prepareExisting = null) {
  const existing = findOpenApp(constructorName);
  if (existing) {
    prepareExisting?.(existing);
    existing.render(true);
    return existing;
  }

  return createApp().render(true);
}

function openOrFocusSceneLibrary(initialTab = "scenes") {
  return openOrFocusApp(
    "TheatreSceneLibraryApplication",
    () => new TheatreSceneLibraryApplication(manager, { initialTab }),
    (existing) => {
      existing.activeTab = initialTab;
    }
  );
}

function openOrFocusSoundPlaylist(playlistId = null) {
  const app = openOrFocusSceneLibrary("sounds");
  if (playlistId) {
    window.setTimeout(() => app?._openSoundPlaylistEditor?.(playlistId), 0);
  }
  return app;
}

function openOrFocusMindmap(plannerId = null) {
  return openOrFocusApp(
    "TheatreMindmapApplication",
    () => new TheatreMindmapApplication({ plannerId }),
    (existing) => {
      existing.plannerId = plannerId ?? TheatreStore.getActiveAdventurePlanner()?.id ?? existing.plannerId;
    }
  );
}

function openOrFocusWorldMap(mapId = null) {
  if (mapId) {
    void TheatreStore.setActiveWorldMap(mapId);
  }
  return openOrFocusApp(
    "TheatreWorldMapApplication",
    () => new TheatreWorldMapApplication({ mapId }),
    (existing) => {
      existing.mapId = mapId ?? TheatreStore.getActiveWorldMap()?.id ?? existing.mapId;
    }
  );
}

function openOrFocusWorldMapStage(mapId = null) {
  if (mapId) {
    void TheatreStore.setActiveWorldMap(mapId);
  }
  return openOrFocusApp(
    "TheatreWorldMapStageApplication",
    () => new TheatreWorldMapStageApplication({ mapId }),
    (existing) => {
      existing.mapId = mapId ?? TheatreStore.getActiveWorldMap()?.id ?? existing.mapId;
    }
  );
}

function openOrFocusPortal(portalId = null) {
  if (portalId) {
    void TheatreStore.setActivePortal(portalId);
  }
  return openOrFocusApp(
    "TheatrePortalApplication",
    () => new TheatrePortalApplication({ portalId }),
    (existing) => {
      existing.portalId = portalId ?? TheatreStore.getActivePortal()?.id ?? existing.portalId;
    }
  );
}

function openOrFocusPortalStage(portalId = null) {
  if (portalId) {
    void TheatreStore.setActivePortal(portalId);
  }
  return openOrFocusApp(
    "TheatrePortalStageApplication",
    () => new TheatrePortalStageApplication({ portalId }),
    (existing) => {
      existing.portalId = portalId ?? TheatreStore.getActivePortal()?.id ?? existing.portalId;
    }
  );
}

function openOrFocusStageGoblin() {
  if (stageGoblinApp) {
    stageGoblinApp.render(true);
    ui.controls?.render?.(false);
    return stageGoblinApp;
  }

  stageGoblinApp = new TheatreStageGoblinApplication(manager);
  stageGoblinApp.render(true);
  ui.controls?.render?.(false);
  return stageGoblinApp;
}

function isStageGoblinOpen() {
  return Boolean(stageGoblinApp?._getRootElement?.());
}

function isStageGoblinBarOpen(barId = "bar-1") {
  if (!isStageGoblinOpen()) return false;
  const bar = TheatreStore.getStageGoblinState().bars.find((entry) => entry.id === String(barId || "bar-1"));
  return bar?.visible !== false;
}

function openOrFocusGlobalSoundPlayer() {
  if (globalSoundPlayerApp) {
    globalSoundPlayerApp.render(true);
    ui.controls?.render?.(false);
    return globalSoundPlayerApp;
  }

  globalSoundPlayerApp = new TheatreGlobalSoundPlayerApplication();
  globalSoundPlayerApp.render(true);
  ui.controls?.render?.(false);
  return globalSoundPlayerApp;
}

function isGlobalSoundPlayerOpen() {
  return Boolean(globalSoundPlayerApp?._getRootElement?.());
}

function ensureGlobalSoundPlayerForRemote() {
  if (globalSoundPlayerApp) return globalSoundPlayerApp;
  globalSoundPlayerApp = new TheatreGlobalSoundPlayerApplication({ remoteOnly: true });
  globalSoundPlayerApp.render(true);
  return globalSoundPlayerApp;
}

async function closeGlobalSoundPlayer() {
  if (!globalSoundPlayerApp) return;
  const app = globalSoundPlayerApp;
  await app.close();
  if (globalSoundPlayerApp === app) globalSoundPlayerApp = null;
  ui.controls?.render?.(false);
}

async function closeStageGoblin() {
  if (!stageGoblinApp) return;
  const app = stageGoblinApp;
  await app.close();
  if (stageGoblinApp === app) stageGoblinApp = null;
  ui.controls?.render?.(false);
}

async function toggleStageGoblin(force = null) {
  const shouldOpen = typeof force === "boolean" ? force : !isStageGoblinOpen();
  if (shouldOpen) {
    const state = TheatreStore.getStageGoblinState();
    if (!state.bars.some((bar) => bar.visible !== false)) {
      state.bars.forEach((bar) => { bar.visible = true; });
      await TheatreStore.saveStageGoblinState(state);
    }
    openOrFocusStageGoblin();
    return;
  }

  await closeStageGoblin();
}

async function toggleStageGoblinBar(barId = "bar-1", force = null) {
  const normalizedBarId = String(barId || "bar-1").trim() || "bar-1";
  const state = TheatreStore.getStageGoblinState();
  const bar = state.bars.find((entry) => entry.id === normalizedBarId);
  if (!bar) return;

  const shouldShow = typeof force === "boolean" ? force : bar.visible === false;
  await TheatreStore.saveStageGoblinBarVisible(shouldShow, normalizedBarId);

  const nextState = TheatreStore.getStageGoblinState();
  if (shouldShow) {
    openOrFocusStageGoblin();
  } else if (stageGoblinApp && !nextState.bars.some((entry) => entry.visible !== false)) {
    await closeStageGoblin();
  } else {
    stageGoblinApp?.render(false);
    ui.controls?.render?.(false);
  }
}

async function toggleGlobalSoundPlayer(force = null) {
  const shouldOpen = typeof force === "boolean" ? force : !isGlobalSoundPlayerOpen();
  if (shouldOpen) {
    openOrFocusGlobalSoundPlayer();
    return;
  }

  await closeGlobalSoundPlayer();
}

function refreshOpenApps({ skipNames = [] } = {}) {
  const skippedAppNames = skipNames instanceof Set ? skipNames : new Set(skipNames);
  for (const app of Object.values(ui.windows ?? {})) {
    const appName = app.constructor?.name;
    if (skippedAppNames.has(appName)) continue;
    if (REFRESHABLE_APP_NAMES.has(appName)) {
      app.render(false);
    }
  }
}

function getOpenWorldMapApplications() {
  return Object.values(ui.windows ?? {}).filter((app) => WORLD_MAP_APP_NAMES.has(app.constructor?.name));
}

function getActiveGmId() {
  return game.users?.activeGM?.id ?? game.users?.find?.((user) => user.isGM && user.active)?.id ?? null;
}

function handleForceOpenWorldMapSocket(payload = {}) {
  if (game.user?.isGM) return;
  const mapId = String(payload.mapId || "").trim();
  const mode = String(payload.mode || "window").trim();
  if (!mapId) return;
  if (mode === "stage" || mode === "fullscreen") {
    openOrFocusWorldMapStage(mapId);
    return;
  }
  openOrFocusWorldMap(mapId);
}

function openPortalForMode(portalId, mode = "window") {
  const id = String(portalId || "").trim();
  if (!id) return null;
  if (mode === "stage" || mode === "fullscreen") {
    return openOrFocusPortalStage(id);
  }
  return openOrFocusPortal(id);
}

function handleForceOpenPortalSocket(payload = {}) {
  if (game.user?.isGM) return;
  const portalId = String(payload.portalId || "").trim();
  const mode = String(payload.mode || "window").trim();
  openPortalForMode(portalId, mode);
}

async function closeOpenPortalStage() {
  const app = findOpenApp("TheatrePortalStageApplication");
  if (app?.close) {
    await app.close();
  }
}

async function closeOpenPortalWindow() {
  const app = findOpenApp("TheatrePortalApplication");
  if (app?.close) {
    await app.close();
  }
}

function forceOpenPortal(portalId, mode = "window") {
  if (!game.user?.isGM) return null;
  const id = String(portalId || "").trim();
  if (!id) return null;
  const normalizedMode = ["stage", "fullscreen"].includes(String(mode || "").trim()) ? "stage" : "window";
  game.socket?.emit?.(FOOTLIGHTS_SOCKET_EVENT, {
    action: "forceOpenPortal",
    portalId: id,
    mode: normalizedMode
  });
  return null;
}

async function forceClosePortalStage() {
  if (!game.user?.isGM) return;
  game.socket?.emit?.(FOOTLIGHTS_SOCKET_EVENT, {
    action: "forceClosePortalStage"
  });
}

function handleGlobalSoundPlayerSocket(payload = {}) {
  if (game.user?.isGM) return;
  const app = ensureGlobalSoundPlayerForRemote();
  window.setTimeout(() => app.applyRemoteControl?.(payload), 0);
}

async function handleWorldMapElementMoveRequest(payload = {}, socket = game.socket) {
  const activeGmId = getActiveGmId();
  if (!game.user?.isGM || (activeGmId && activeGmId !== game.user.id)) return;

  const mapId = String(payload.mapId || "").trim();
  const elementId = String(payload.elementId || "").trim();
  const elementType = String(payload.elementType || "").trim();
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!mapId || !elementId || !Number.isFinite(x) || !Number.isFinite(y)) return;

  const operation = getWorldMapElementOperation(elementType);
  if (!["pin", "objectOverlay"].includes(elementType) || !operation?.upsertMethod || typeof TheatreStore[operation.upsertMethod] !== "function") return;
  await TheatreStore[operation.upsertMethod](mapId, { id: elementId, x, y });

  socket?.emit?.(FOOTLIGHTS_SOCKET_EVENT, {
    action: "worldMapElementMoved",
    elementType,
    mapId,
    elementId,
    x,
    y
  });
}

function handleWorldMapElementMoved(payload = {}) {
  for (const app of getOpenWorldMapApplications()) {
    app.applyRemoteElementMove?.(payload);
  }
}

async function onFootlightsSocketMessage(payload = {}, socket = game.socket) {
  const action = String(payload?.action || "").trim();
  if (!action) return;

  if (action === "forceOpenWorldMap") {
    handleForceOpenWorldMapSocket(payload);
    return;
  }

  if (action === "forceOpenPortal") {
    handleForceOpenPortalSocket(payload);
    return;
  }

  if (action === "forceClosePortalStage") {
    if (!game.user?.isGM) {
      await closeOpenPortalStage();
    }
    return;
  }

  if (action === "globalSoundPlayerControl") {
    handleGlobalSoundPlayerSocket(payload);
    return;
  }

  if (action === "requestWorldMapElementMove") {
    await handleWorldMapElementMoveRequest(payload, socket);
    return;
  }

  if (action === "worldMapElementMoved") {
    handleWorldMapElementMoved(payload);
  }
}

function handleFootlightsSocketMessage(payload = {}) {
  void onFootlightsSocketMessage(payload, game.socket);
}

function registerFootlightsSocket() {
  if (footlightsSocketRegistered) return;
  const socket = game.socket;
  if (!socket) return;

  socket.on(FOOTLIGHTS_SOCKET_EVENT, handleFootlightsSocketMessage);

  footlightsSocketRegistered = true;
}

async function chooseActorSceneDropMode(actor) {
  const actorName = escapeHtml(actor?.name || tr("this actor"));
  const content = `
    <div class="tom-theme-root tom-theme-default tom-avatar-drop-mode-dialog">
      <p>${tr("How should <strong>{actorName}</strong> be placed in the scene?", { actorName })}</p>
      <p class="notes">${tr("A token is always created on the canvas for technical reasons. You can decide whether it should be linked to the actor.")}</p>
    </div>
  `;

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: tr("Place actor in scene"),
      content,
      buttons: {
        linked: {
          label: tr("Linked"),
          callback: () => resolve("linked")
        },
        token: {
          label: tr("Copy"),
          callback: () => resolve("token")
        },
        cancel: {
          label: tr("Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "token",
      close: () => resolve(null)
    });
    dialog.render(true);
    const applyDropDialogTheme = () => {
      dialog.element?.addClass?.("tom-avatar-drop-mode-dialog-host");
      applyTheatreDialogTheme(dialog, MODULE_ID, "26rem");
      dialog.element?.css?.({
        height: "auto",
        maxHeight: "none",
        overflow: "visible"
      });
      dialog.element?.find?.(".window-content, .dialog-content").css({
        height: "auto",
        maxHeight: "none",
        overflow: "visible"
      });
      dialog.setPosition?.({ height: "auto" });
    };
    window.requestAnimationFrame(applyDropDialogTheme);
    window.setTimeout(applyDropDialogTheme, 30);
  });
}

function buildModuleApi() {
  return {
    manager,
    openSceneLibrary: () => openOrFocusSceneLibrary("scenes"),
    openMapLibrary: () => openOrFocusSceneLibrary("maps"),
    openPortalLibrary: () => openOrFocusSceneLibrary("portals"),
    openSceneConfig: (sceneId = null) => new TheatreSceneConfigApplication(manager, { sceneId }).render(true),
    openActorProfileConfig: (actor) => new TheatreActorProfileConfigApplication(actor).render(true),
    openAvatarLibrary: () => openOrFocusSceneLibrary("avatars"),
    openSoundLibrary: () => openOrFocusSceneLibrary("sounds"),
    openSoundPlaylist: (playlistId = null) => openOrFocusSoundPlaylist(playlistId),
    openWorldMap: (mapId = null) => openOrFocusWorldMap(mapId),
    openWorldMapStage: (mapId = null) => openOrFocusWorldMapStage(mapId),
    openPortal: (portalId = null) => openOrFocusPortal(portalId),
    openPortalStage: (portalId = null) => openOrFocusPortalStage(portalId),
    forcePortal: (portalId, mode = "window") => forceOpenPortal(portalId, mode),
    forcePortalWindow: (portalId) => forceOpenPortal(portalId, "window"),
    forcePortalStage: (portalId) => forceOpenPortal(portalId, "stage"),
    closePortalWindow: () => closeOpenPortalWindow(),
    closePortalStage: () => closeOpenPortalStage(),
    closePortalStageForPlayers: () => forceClosePortalStage(),
    activateScene: (sceneId, options = {}) => manager.activateScene(sceneId, options),
    openWorldMapConfig: (mapId = null) => new TheatreWorldMapConfigApplication(mapId ? { mapId } : {}).render(true),
    openAvatarConfig: (avatarId = null) => new TheatreAvatarConfigApplication({ avatarId }).render(true),
    openMindmap: (plannerId = null) => openOrFocusMindmap(plannerId),
    openAdventurePlanner: (plannerId = null) => openOrFocusMindmap(plannerId),
    openAdventurePlannerConfig: (plannerId = null) => new TheatreAdventurePlannerConfigApplication({ plannerId }).render(true),
    openStageGoblin: () => openOrFocusStageGoblin(),
    closeStageGoblin: () => closeStageGoblin(),
    toggleStageGoblin: (force = null) => toggleStageGoblin(force),
    toggleStageGoblinBar: (barId = "bar-1", force = null) => toggleStageGoblinBar(barId, force),
    isStageGoblinOpen: () => isStageGoblinOpen(),
    isStageGoblinBarOpen: (barId = "bar-1") => isStageGoblinBarOpen(barId),
    renderStageGoblin: () => stageGoblinApp?.render(false),
    openGlobalSoundPlayer: () => openOrFocusGlobalSoundPlayer(),
    closeGlobalSoundPlayer: () => closeGlobalSoundPlayer(),
    toggleGlobalSoundPlayer: (force = null) => toggleGlobalSoundPlayer(force),
    isGlobalSoundPlayerOpen: () => isGlobalSoundPlayerOpen(),
    renderGlobalSoundPlayer: () => globalSoundPlayerApp?.render(false)
  };
}

async function onFootlightsInit() {
  registerLocalizationHelpers();
  await initializeLocalization();

  const moduleEntry = game.modules.get(MODULE_ID);
  if (moduleEntry) {
    moduleEntry.api = buildModuleApi();
  }

  TheatreStore.registerSettings();
}

function onFootlightsReady() {
  registerFootlightsSocket();
  const overlay = new TheatreOverlayApplication(manager);
  manager.initialize(overlay);
  openOrFocusStageGoblin();
}

function onFootlightsSettingUpdate(setting) {
  if (setting.key?.startsWith(`${MODULE_ID}.`)) {
    const isLanguageSetting = setting.key === `${MODULE_ID}.${SETTINGS.LANGUAGE}`;
    const isMindmapSetting = setting.key === `${MODULE_ID}.${SETTINGS.MINDMAP}`;
    const isStageGoblinSetting = setting.key === `${MODULE_ID}.${SETTINGS.STAGE_GOBLIN}`;
    const isMapLibrarySetting = setting.key === `${MODULE_ID}.${SETTINGS.MAP_LIBRARY}`;
    const isPortalLibrarySetting = setting.key === `${MODULE_ID}.${SETTINGS.PORTAL_LIBRARY}`;
    const isSoundLibrarySetting = setting.key === `${MODULE_ID}.${SETTINGS.SOUND_LIBRARY}`;
    const shouldSuppressMapLibraryRefresh = isMapLibrarySetting
      && Number(globalThis.__TOM_SUPPRESS_MAP_LIBRARY_REFRESH_UNTIL || 0) > Date.now();
    if (isLanguageSetting) {
      void setActiveLanguage(setting.value ?? TheatreStore.getLanguage()).then(() => {
        stageGoblinApp?.render(false);
        globalSoundPlayerApp?.render(false);
        refreshOpenApps();
        ui.controls?.render?.(false);
      });
      return;
    }
    if (!isStageGoblinSetting && !isMapLibrarySetting && !isPortalLibrarySetting && !manager.shouldSkipSettingRefresh(setting.key)) {
      manager.onSettingsChanged();
    }

    if (isStageGoblinSetting) {
      stageGoblinApp?.render(false);
      return;
    }

    if (isSoundLibrarySetting) {
      globalSoundPlayerApp?.render(false);
    }

    if (setting.key === `${MODULE_ID}.${SETTINGS.THEME}`) {
      stageGoblinApp?.render(false);
      globalSoundPlayerApp?.render(false);
    }

    if (isMindmapSetting) {
      stageGoblinApp?.render(false);
    }

    refreshOpenApps({
      skipNames: [
        ...(isMindmapSetting ? MINDMAP_SETTING_SKIP_REFRESH_APP_NAMES : []),
        ...(isMapLibrarySetting ? MAP_LIBRARY_REFRESH_SKIP_APP_NAMES : []),
        ...(shouldSuppressMapLibraryRefresh ? ["TheatreSceneLibraryApplication"] : [])
      ]
    });
  }
}

function onActorSheetHeaderButtons(app, buttons) {
  const actor = app.actor;
  if (!actor || !game.user?.isGM) return;

  buttons.unshift({
    class: "theatre-profile",
    icon: "fas fa-theater-masks",
    label: tr("Footlights"),
    onclick: () => new TheatreActorProfileConfigApplication(actor).render(true)
  });
}

function onSceneControlButtons(controls) {
  if (!game.user?.isGM || !Array.isArray(controls)) return;

  const stageGoblinBars = TheatreStore.getStageGoblinState().bars;
  const stageGoblinBarTools = stageGoblinBars.length > 1
    ? stageGoblinBars.map((bar, index) => ({
      name: `toggle-stage-goblin-bar-${index + 1}`,
      title: sceneControlTitle(bar.label || tr("Stage Goblin Bar {number}", { number: index + 1 })),
      icon: `fas fa-${Math.max(1, Math.min(5, index + 1))}`,
      visible: true,
      toggle: true,
      active: isStageGoblinBarOpen(bar.id),
      onClick: (toggled) => game.modules.get(MODULE_ID)?.api?.toggleStageGoblinBar?.(bar.id, toggled)
    }))
    : [];

  controls.push({
    name: "footlights",
    title: sceneControlTitle("Footlights"),
    icon: "fas fa-theater-masks",
    layer: FOOTLIGHTS_SCENE_CONTROL_LAYER,
    visible: true,
    tools: [
      {
        name: "open-library",
        title: sceneControlTitle("Open Footlights Library"),
        icon: "fas fa-photo-film",
        visible: true,
        button: true,
        onClick: () => {
          try {
            openOrFocusSceneLibrary("scenes");
          } catch (error) {
            console.error(`${MODULE_ID} | Failed to open Footlights Library`, error);
            ui.notifications?.error(tr("Footlights Library could not be opened. Please check the console."));
          }
        }
      },
      {
        name: "toggle-stage-goblin",
        title: sceneControlTitle("Toggle StageGoblin bar"),
        icon: "fas fa-grip-lines",
        visible: true,
        toggle: true,
        active: isStageGoblinOpen(),
        onClick: (toggled) => game.modules.get(MODULE_ID)?.api?.toggleStageGoblin?.(toggled)
      },
      ...stageGoblinBarTools,
      {
        name: "toggle-global-player",
        title: sceneControlTitle("Toggle Player"),
        icon: "fas fa-headphones",
        visible: true,
        toggle: true,
        active: isGlobalSoundPlayerOpen(),
        onClick: (toggled) => game.modules.get(MODULE_ID)?.api?.toggleGlobalSoundPlayer?.(toggled)
      }
    ]
  });
}

function isTheatreOverlayActorDrop(data) {
  const theatreOverlayActive = Boolean(document.body.classList.contains("tom-overlay-active") && manager.getActiveScene());
  return (
    theatreOverlayActive &&
    (
      ["Token", "TokenDocument", "Actor"].includes(String(data?.type || "").trim())
      || Boolean(data?.tokenUuid || data?.tokenId)
    )
  );
}

async function resolveDroppedTheatreDocument(canvas, data) {
  let document = data?.uuid ? await fromUuid?.(data.uuid) : null;
  if (!document && data?.tokenUuid) {
    document = await fromUuid?.(data.tokenUuid);
  }
  if (!document && data?.tokenId) {
    const tokenId = String(data.tokenId || "").trim();
    const sceneId = String(data.sceneId || canvas.scene?.id || "").trim();
    const scene = (sceneId ? game.scenes?.get(sceneId) : null) ?? canvas.scene ?? null;
    document = scene?.tokens?.get(tokenId) ?? null;
  }
  if (!document && data?.actorId) {
    document = game.actors?.get(data.actorId) ?? null;
  }
  return document;
}

async function handleTheatreOverlayActorDrop(canvas, data) {
  if (!isTheatreOverlayActorDrop(data)) return undefined;

  const document = await resolveDroppedTheatreDocument(canvas, data);
  const effectiveDocument = document?.document ?? document;
  const actor = effectiveDocument?.documentName === "Actor"
    ? effectiveDocument
    : (effectiveDocument?.actor ?? document?.actor ?? null);

  if (!actor) return undefined;

  await manager.addDroppedActorToActiveScene({
    data,
    document: effectiveDocument,
    actor,
    isToken: ["Token", "TokenDocument"].includes(String(effectiveDocument?.documentName || "")),
    imagePath: String(effectiveDocument?.texture?.src || actor.img || "").trim(),
    name: String(effectiveDocument?.name || actor.name || tr("Unnamed actor")).trim()
  });
  return false;
}

async function resolveAdventurePlannerDropActor(data) {
  let actor = data.uuid
    ? await fromUuid?.(data.uuid)
    : game.actors?.get(data.actorId);

  if (actor?.documentName === "TokenDocument" || actor?.documentName === "Token") {
    actor = actor.actor ?? null;
  }

  if (!actor && data.tokenUuid) {
    const tokenDocument = await fromUuid?.(data.tokenUuid);
    actor = tokenDocument?.actor ?? null;
  }

  if (actor?.documentName && actor.documentName !== "Actor") {
    actor = actor.actor ?? null;
  }

  return actor;
}

async function handleAdventurePlannerActorDrop(canvas, data) {
  if (data?.type !== "AdventurePlannerActorNode") return undefined;

  const actor = await resolveAdventurePlannerDropActor(data);

  if (!actor) {
    ui.notifications?.warn(tr("The actor could not be found for the canvas drop."));
    return false;
  }

  const mode = await chooseActorSceneDropMode(actor);
  if (!mode) return false;

  const tokenDocument = await actor.getTokenDocument({
    x: Math.round(data.x ?? 0),
    y: Math.round(data.y ?? 0),
    actorLink: mode === "linked"
  });

  await canvas.scene?.createEmbeddedDocuments("Token", [tokenDocument.toObject()]);
  return false;
}

async function handleFootlightsAvatarCanvasDrop(canvas, data) {
  if (data?.type !== "TheatreAvatar") return undefined;

  const avatarId = String(data.avatarId || "").trim();
  const avatar = TheatreStore.getAvatarById(avatarId);
  if (!avatar) {
    ui.notifications?.warn(tr("Footlights avatar could not be found."));
    return false;
  }

  const actor = avatar.actorId ? game.actors?.get(avatar.actorId) : null;
  if (!actor) {
    ui.notifications?.warn(tr("This Footlights avatar needs a linked actor before it can be dropped as a native token."));
    return false;
  }

  const mode = await chooseActorSceneDropMode(actor);
  if (!mode) return false;

  const tokenDocument = await actor.getTokenDocument({
    x: Math.round(data.x ?? 0),
    y: Math.round(data.y ?? 0),
    actorLink: mode === "linked"
  });
  const tokenData = tokenDocument.toObject();
  const tokenImage = String(avatar.tokenImage || avatar.defaultImage || actor.img || "").trim();
  if (tokenImage) {
    foundry.utils.setProperty(tokenData, "texture.src", tokenImage);
  }
  tokenData.name = String(avatar.name || actor.name || tokenData.name || "").trim();

  await canvas.scene?.createEmbeddedDocuments("Token", [tokenData]);
  return false;
}

async function onDropCanvasData(canvas, data) {
  const theatreDropResult = await handleTheatreOverlayActorDrop(canvas, data);
  if (theatreDropResult === false) return false;

  const footlightsAvatarDropResult = await handleFootlightsAvatarCanvasDrop(canvas, data);
  if (footlightsAvatarDropResult === false) return false;

  return handleAdventurePlannerActorDrop(canvas, data);
}

function onStageGoblinClosed() {
  stageGoblinApp = null;
  ui.controls?.render?.(false);
}

function onGlobalSoundPlayerClosed() {
  globalSoundPlayerApp = null;
  ui.controls?.render?.(false);
}

function registerFootlightsHooks() {
  if (footlightsHooksRegistered) return;
  footlightsHooksRegistered = true;

  Hooks.once("init", onFootlightsInit);
  Hooks.once("ready", onFootlightsReady);
  Hooks.on("updateSetting", onFootlightsSettingUpdate);
  Hooks.on("getActorSheetHeaderButtons", onActorSheetHeaderButtons);
  Hooks.on("getSceneControlButtons", onSceneControlButtons);
  Hooks.on("dropCanvasData", onDropCanvasData);
  Hooks.on("closeTheatreStageGoblinApplication", onStageGoblinClosed);
  Hooks.on("closeTheatreGlobalSoundPlayerApplication", onGlobalSoundPlayerClosed);
}

registerFootlightsHooks();
