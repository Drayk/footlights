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

const manager = new TheatreManager();
let stageGoblinApp = null;
let globalSoundPlayerApp = null;
let footlightsSocketRegistered = false;
const REFRESHABLE_APP_NAMES = [
  "TheatreSceneLibraryApplication",
  "TheatreSceneConfigApplication",
  "TheatreAvatarConfigApplication",
  "TheatreAdventurePlannerConfigApplication",
  "TheatreMindmapApplication",
  "TheatreStageGoblinApplication",
  "TheatreGlobalSoundPlayerApplication",
  "TheatreWorldMapApplication",
  "TheatreWorldMapStageApplication",
  "TheatreWorldMapConfigApplication"
];
const MINDMAP_SETTING_SKIP_REFRESH_APP_NAMES = [
  "TheatreMindmapApplication",
  "TheatreSceneLibraryApplication"
];
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
  await globalSoundPlayerApp.close();
  ui.controls?.render?.(false);
}

async function closeStageGoblin() {
  if (!stageGoblinApp) return;
  await stageGoblinApp.close();
  ui.controls?.render?.(false);
}

async function toggleStageGoblin(force = null) {
  const shouldOpen = typeof force === "boolean" ? force : !isStageGoblinOpen();
  if (shouldOpen) {
    openOrFocusStageGoblin();
    return;
  }

  await closeStageGoblin();
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
  for (const app of Object.values(ui.windows ?? {})) {
    const appName = app.constructor?.name;
    if (skipNames.includes(appName)) continue;
    if (REFRESHABLE_APP_NAMES.includes(appName)) {
      app.render(false);
    }
  }
}

function getOpenWorldMapApplications() {
  return Object.values(ui.windows ?? {}).filter((app) => ["TheatreWorldMapApplication", "TheatreWorldMapStageApplication"].includes(app.constructor?.name));
}

function registerFootlightsSocket() {
  if (footlightsSocketRegistered) return;
  const socket = game.socket;
  if (!socket) return;

  socket.on(`module.${MODULE_ID}`, async (payload = {}) => {
    const action = String(payload?.action || "").trim();
    if (!action) return;

    if (action === "forceOpenWorldMap") {
      if (game.user?.isGM) return;
      const mapId = String(payload.mapId || "").trim();
      const mode = String(payload.mode || "window").trim();
      if (!mapId) return;
      if (mode === "stage" || mode === "fullscreen") {
        openOrFocusWorldMapStage(mapId);
      } else {
        openOrFocusWorldMap(mapId);
      }
      return;
    }

    if (action === "globalSoundPlayerControl") {
      if (game.user?.isGM) return;
      const app = ensureGlobalSoundPlayerForRemote();
      window.setTimeout(() => app.applyRemoteControl?.(payload), 0);
      return;
    }

    if (action === "requestWorldMapElementMove") {
      const activeGmId = game.users?.activeGM?.id ?? game.users?.find?.((user) => user.isGM && user.active)?.id ?? null;
      if (!game.user?.isGM || (activeGmId && activeGmId !== game.user.id)) return;

      const mapId = String(payload.mapId || "").trim();
      const elementId = String(payload.elementId || "").trim();
      const elementType = String(payload.elementType || "").trim();
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!mapId || !elementId || !Number.isFinite(x) || !Number.isFinite(y)) return;

      if (elementType === "pin") {
        await TheatreStore.upsertWorldMapPin(mapId, { id: elementId, x, y });
      } else if (elementType === "objectOverlay") {
        await TheatreStore.upsertWorldMapObjectOverlay(mapId, { id: elementId, x, y });
      } else {
        return;
      }

      socket.emit(`module.${MODULE_ID}`, {
        action: "worldMapElementMoved",
        elementType,
        mapId,
        elementId,
        x,
        y
      });
      return;
    }

    if (action === "worldMapElementMoved") {
      for (const app of getOpenWorldMapApplications()) {
        app.applyRemoteElementMove?.(payload);
      }
    }
  });

  footlightsSocketRegistered = true;
}

async function chooseActorSceneDropMode(actor) {
  const actorName = escapeHtml(actor?.name || tr("this actor"));
  const content = `
    <div class="tom-theme-root tom-theme-default">
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
    window.setTimeout(() => applyTheatreDialogTheme(dialog, MODULE_ID, "30rem"), 30);
  });
}

Hooks.once("init", async () => {
  registerLocalizationHelpers();
  await initializeLocalization();

  const moduleApi = {
    manager,
    openSceneLibrary: () => openOrFocusSceneLibrary("scenes"),
    openMapLibrary: () => openOrFocusSceneLibrary("maps"),
    openSceneConfig: (sceneId = null) => new TheatreSceneConfigApplication(manager, { sceneId }).render(true),
    openActorProfileConfig: (actor) => new TheatreActorProfileConfigApplication(actor).render(true),
    openAvatarLibrary: () => openOrFocusSceneLibrary("avatars"),
    openSoundLibrary: () => openOrFocusSceneLibrary("sounds"),
    openWorldMap: (mapId = null) => openOrFocusWorldMap(mapId),
    openWorldMapStage: (mapId = null) => openOrFocusWorldMapStage(mapId),
    openWorldMapConfig: (mapId = null) => new TheatreWorldMapConfigApplication(mapId ? { mapId } : {}).render(true),
    openAvatarConfig: (avatarId = null) => new TheatreAvatarConfigApplication({ avatarId }).render(true),
    openMindmap: (plannerId = null) => openOrFocusMindmap(plannerId),
    openAdventurePlanner: (plannerId = null) => openOrFocusMindmap(plannerId),
    openAdventurePlannerConfig: (plannerId = null) => new TheatreAdventurePlannerConfigApplication({ plannerId }).render(true),
    openStageGoblin: () => openOrFocusStageGoblin(),
    closeStageGoblin: () => closeStageGoblin(),
    toggleStageGoblin: (force = null) => toggleStageGoblin(force),
    isStageGoblinOpen: () => isStageGoblinOpen(),
    renderStageGoblin: () => stageGoblinApp?.render(false),
    openGlobalSoundPlayer: () => openOrFocusGlobalSoundPlayer(),
    closeGlobalSoundPlayer: () => closeGlobalSoundPlayer(),
    toggleGlobalSoundPlayer: (force = null) => toggleGlobalSoundPlayer(force),
    isGlobalSoundPlayerOpen: () => isGlobalSoundPlayerOpen(),
    renderGlobalSoundPlayer: () => globalSoundPlayerApp?.render(false)
  };

  const moduleEntry = game.modules.get(MODULE_ID);
  if (moduleEntry) {
    moduleEntry.api = moduleApi;
  }

  TheatreStore.registerSettings({
    sceneLibrary: class extends TheatreSceneLibraryApplication {
      constructor(options = {}) {
        super(manager, options);
      }
    }
  });
});

Hooks.once("ready", () => {
  registerFootlightsSocket();
  const overlay = new TheatreOverlayApplication(manager);
  manager.initialize(overlay);
  openOrFocusStageGoblin();
});

Hooks.on("updateSetting", (setting) => {
  if (setting.key?.startsWith(`${MODULE_ID}.`)) {
    const isLanguageSetting = setting.key === `${MODULE_ID}.${SETTINGS.LANGUAGE}`;
    const isMindmapSetting = setting.key === `${MODULE_ID}.${SETTINGS.MINDMAP}`;
    const isStageGoblinSetting = setting.key === `${MODULE_ID}.${SETTINGS.STAGE_GOBLIN}`;
    const isMapLibrarySetting = setting.key === `${MODULE_ID}.${SETTINGS.MAP_LIBRARY}`;
    const isSoundLibrarySetting = setting.key === `${MODULE_ID}.${SETTINGS.SOUND_LIBRARY}`;
    if (isLanguageSetting) {
      void setActiveLanguage(setting.value ?? TheatreStore.getLanguage()).then(() => {
        stageGoblinApp?.render(false);
        globalSoundPlayerApp?.render(false);
        refreshOpenApps();
        ui.controls?.render?.(false);
      });
      return;
    }
    if (!isStageGoblinSetting && !isMapLibrarySetting && !manager.shouldSkipSettingRefresh(setting.key)) {
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
        ...(isMapLibrarySetting ? ["TheatreWorldMapApplication", "TheatreWorldMapStageApplication", "TheatreWorldMapConfigApplication"] : [])
      ]
    });
  }
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  const actor = app.actor;
  if (!actor || !game.user?.isGM) return;

  buttons.unshift({
    class: "theatre-profile",
    icon: "fas fa-theater-masks",
    label: tr("Footlights"),
    onclick: () => new TheatreActorProfileConfigApplication(actor).render(true)
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

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
});

Hooks.on("renderSidebarTab", (_app, html) => {
  if (!game.user?.isGM) return;
  if (html.attr("id") !== "settings") return;
  if (html.find(".tom-open-scene-library").length) return;

  const button = $(
    `<button type="button" class="tom-open-scene-library">
      <i class="fas fa-theater-masks"></i> ${tr("Footlights Library")}
    </button>`
  );

  button.on("click", () => openOrFocusSceneLibrary("scenes"));
  html.find(".settings-list, #settings-game").first().prepend(button);
});

Hooks.on("dropCanvasData", async (canvas, data) => {
  const theatreOverlayActive = Boolean(document.body.classList.contains("tom-overlay-active") && manager.getActiveScene());
  const looksLikeTheatreTokenDrop =
    theatreOverlayActive &&
    (
      ["Token", "TokenDocument", "Actor"].includes(String(data?.type || "").trim())
      || Boolean(data?.tokenUuid || data?.tokenId)
    );

  if (looksLikeTheatreTokenDrop) {
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

    const effectiveDocument = document?.document ?? document;
    const actor = effectiveDocument?.documentName === "Actor"
      ? effectiveDocument
      : (effectiveDocument?.actor ?? document?.actor ?? null);

    if (actor) {
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
  }

  if (data?.type !== "AdventurePlannerActorNode") return;

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
});

Hooks.on("closeTheatreStageGoblinApplication", () => {
  stageGoblinApp = null;
  ui.controls?.render?.(false);
});

Hooks.on("closeTheatreGlobalSoundPlayerApplication", () => {
  globalSoundPlayerApp = null;
  ui.controls?.render?.(false);
});
