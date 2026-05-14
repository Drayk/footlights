import { DEFAULT_RUNTIME_STATE } from "./constants.js";
import { translateDomSubtree } from "./localization.js";

const DRAGGED_AVATAR_KEY = "__theatreOfMindDraggedAvatarId";

export function duplicateData(data) {
  return foundry.utils.deepClone(data);
}

// Shared Footlights switch behavior. Use the .tom-toggle-switch markup for new toggles
// so Foundry reflows cannot swallow the slide animation.
export function animateFootlightsToggleSwitch(inputOrSwitch, checkedOverride = null) {
  const switchEl = inputOrSwitch?.matches?.(".tom-toggle-switch")
    ? inputOrSwitch
    : inputOrSwitch?.closest?.(".tom-toggle-switch");
  const input = switchEl?.querySelector?.("input[type='checkbox']");
  const knob = switchEl?.querySelector?.(".tom-toggle-switch__knob");
  if (!switchEl || !input || !knob) return;

  const checked = checkedOverride === null ? Boolean(input.checked) : Boolean(checkedOverride);
  const wasChecked = switchEl.classList.contains("is-checked");
  if (wasChecked === checked) return;

  if (knob._tomSwitchAnimationFrame) window.cancelAnimationFrame(knob._tomSwitchAnimationFrame);
  switchEl.classList.toggle("is-checked", checked);

  const fromX = wasChecked ? 1.56 : 0;
  const toX = checked ? 1.56 : 0;
  const duration = 220;
  const startedAt = performance.now();
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

  const tick = (time) => {
    const progress = Math.min(1, (time - startedAt) / duration);
    const eased = easeOutCubic(progress);
    const x = fromX + ((toX - fromX) * eased);
    knob.style.transform = `translate3d(${x.toFixed(3)}rem, -50%, 0)`;

    if (progress < 1) {
      knob._tomSwitchAnimationFrame = window.requestAnimationFrame(tick);
      return;
    }

    knob.style.transform = "";
    knob._tomSwitchAnimationFrame = null;
  };

  knob.style.transform = `translate3d(${fromX}rem, -50%, 0)`;
  knob._tomSwitchAnimationFrame = window.requestAnimationFrame(tick);
}

export function bindFootlightsToggleSwitches(root) {
  const host = root?.jquery ? root[0] : root;
  if (!host?.querySelectorAll) return;

  host.querySelectorAll(".tom-toggle-switch:not([data-manual-toggle='true']) input[type='checkbox']").forEach((input) => {
    if (input.dataset.tomToggleBound === "true") return;
    input.dataset.tomToggleBound = "true";
    input.addEventListener("change", () => animateFootlightsToggleSwitch(input));
  });
}

export function normalizeProfiles(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeSceneTags(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )).slice(0, 12);
  }

  return Array.from(new Set(
    String(value ?? "")
      .split(",")
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
  )).slice(0, 12);
}

export function normalizeScenes(value) {
  return Array.isArray(value)
    ? value.map((scene) => ({
        ...scene,
        description: String(scene?.description || "").trim(),
        location: String(scene?.location || "").trim(),
        tags: normalizeSceneTags(scene?.tags)
      }))
    : [];
}

export function normalizeRuntimeState(value) {
  const runtime = foundry.utils.mergeObject(
    duplicateData(DEFAULT_RUNTIME_STATE),
    value ?? {},
    { inplace: false }
  );

  runtime.highlightedSceneActorIds = Array.isArray(runtime.highlightedSceneActorIds)
    ? runtime.highlightedSceneActorIds.filter(Boolean)
    : [];

  runtime.sceneActorMoods = runtime.sceneActorMoods && typeof runtime.sceneActorMoods === "object"
    ? runtime.sceneActorMoods
    : {};

  runtime.sceneActorTransforms = runtime.sceneActorTransforms && typeof runtime.sceneActorTransforms === "object"
    ? Object.fromEntries(
      Object.entries(runtime.sceneActorTransforms)
        .filter(([key, entry]) => Boolean(key) && entry && typeof entry === "object")
        .map(([key, entry]) => [
          key,
          {
            ...(Number.isFinite(Number(entry.anchorX))
              ? { anchorX: Math.max(0, Math.min(100, Number(entry.anchorX))) }
              : {}),
            ...(Number.isFinite(Number(entry.anchorY))
              ? { anchorY: Math.max(0, Math.min(100, Number(entry.anchorY))) }
              : {}),
            ...(Number.isFinite(Number(entry.referencePlaneWidth)) && Number(entry.referencePlaneWidth) > 0
              ? { referencePlaneWidth: Math.max(1, Number(entry.referencePlaneWidth)) }
              : {}),
            ...(Number.isFinite(Number(entry.referencePlaneHeight)) && Number(entry.referencePlaneHeight) > 0
              ? { referencePlaneHeight: Math.max(1, Number(entry.referencePlaneHeight)) }
              : {}),
            offsetX: Number.isFinite(Number(entry.offsetX)) ? Number(entry.offsetX) : 0,
            offsetY: Number.isFinite(Number(entry.offsetY)) ? Number(entry.offsetY) : 0,
            zIndex: Number.isFinite(Number(entry.zIndex)) ? Number(entry.zIndex) : 1,
            scale: Number.isFinite(Number(entry.scale)) && Number(entry.scale) > 0 ? Number(entry.scale) : 1,
            activeScale: Number.isFinite(Number(entry.activeScale)) && Number(entry.activeScale) > 0
              ? Number(entry.activeScale)
              : (
                Number.isFinite(Number(entry.scale)) && Number(entry.scale) > 0
                  ? Number(entry.scale) * 1.4
                  : 1.4
              )
          }
        ])
    )
    : {};

  runtime.backgroundDim = Number.isFinite(Number(runtime.backgroundDim))
    ? Math.max(0, Math.min(0.92, Number(runtime.backgroundDim)))
    : 0;

  runtime.sceneAudio = runtime.sceneAudio && typeof runtime.sceneAudio === "object"
    ? {
        sceneId: String(runtime.sceneAudio.sceneId || "").trim() || null,
        trackId: String(runtime.sceneAudio.trackId || "").trim() || null,
        src: String(runtime.sceneAudio.src || "").trim(),
        label: String(runtime.sceneAudio.label || "").trim(),
        volume: Number.isFinite(Number(runtime.sceneAudio.volume))
          ? Math.max(0, Math.min(1, Number(runtime.sceneAudio.volume)))
          : 0.7,
        loop: Boolean(runtime.sceneAudio.loop),
        playbackState: ["playing", "paused", "stopped"].includes(String(runtime.sceneAudio.playbackState || "").trim())
          ? String(runtime.sceneAudio.playbackState).trim()
          : "stopped",
        position: Number.isFinite(Number(runtime.sceneAudio.position))
          ? Math.max(0, Number(runtime.sceneAudio.position))
          : 0
      }
    : {
        sceneId: null,
        trackId: null,
        src: "",
        label: "",
        volume: 0.7,
        loop: false,
        playbackState: "stopped",
        position: 0
      };

  runtime.soundboardTrigger = runtime.soundboardTrigger && typeof runtime.soundboardTrigger === "object"
    ? {
        id: String(runtime.soundboardTrigger.id || "").trim() || null,
        sceneId: String(runtime.soundboardTrigger.sceneId || "").trim() || null,
        src: String(runtime.soundboardTrigger.src || "").trim(),
        label: String(runtime.soundboardTrigger.label || "").trim(),
        volume: Number.isFinite(Number(runtime.soundboardTrigger.volume))
          ? Math.max(0, Math.min(1, Number(runtime.soundboardTrigger.volume)))
          : 1
      }
    : {
        id: null,
        sceneId: null,
        src: "",
        label: "",
        volume: 1
      };

  runtime.sharedLeftSidebarVisible = Boolean(runtime.sharedLeftSidebarVisible);
  runtime.sharedRightSidebarVisible = Boolean(runtime.sharedRightSidebarVisible);

  return runtime;
}

export function safeJsonParse(input, fallback, label) {
  if (!input?.trim()) return duplicateData(fallback);

  try {
    return JSON.parse(input);
  } catch (_error) {
    throw new Error(`${label} ist kein gueltiges JSON.`);
  }
}

export function randomId() {
  return foundry.utils.randomID();
}

export function getActorById(actorId) {
  return game.actors?.get(actorId) ?? null;
}

export function hasActorOwnerPermission(actor) {
  if (!actor || game.user?.isGM) return Boolean(actor);
  return actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

export function clampScale(scale, fallback = 1) {
  const numericScale = Number(scale);
  if (!Number.isFinite(numericScale) || numericScale <= 0) return fallback;
  return numericScale;
}

export function setDraggedAvatarId(avatarId) {
  globalThis[DRAGGED_AVATAR_KEY] = avatarId || null;
}

export function getDraggedAvatarId() {
  return globalThis[DRAGGED_AVATAR_KEY] || null;
}

export function clearDraggedAvatarId() {
  delete globalThis[DRAGGED_AVATAR_KEY];
}

export function getNativeDragEvent(event) {
  return event?.originalEvent ?? event ?? null;
}

export function readTransferJson(event, mimeType) {
  const nativeEvent = getNativeDragEvent(event);
  const payload = nativeEvent?.dataTransfer?.getData(mimeType);
  if (!payload) return null;

  try {
    return JSON.parse(payload);
  } catch (_error) {
    return null;
  }
}

export function setAvatarDragData(event, avatarId, plainPayload = { type: "TheatreAvatar", avatarId }) {
  if (!avatarId) return;

  const nativeEvent = getNativeDragEvent(event);
  const transfer = nativeEvent?.dataTransfer;
  setDraggedAvatarId(avatarId);
  if (!transfer) return;

  transfer.setData("application/x-theatre-avatar", JSON.stringify({ avatarId }));
  transfer.setData(
    "text/plain",
    typeof plainPayload === "string" ? plainPayload : JSON.stringify(plainPayload)
  );
  transfer.effectAllowed = "copy";
}

export function extractAvatarDropData(event) {
  const payload = readTransferJson(event, "application/x-theatre-avatar");
  if (payload?.avatarId) return payload;

  const nativeEvent = getNativeDragEvent(event);
  const plain = nativeEvent?.dataTransfer?.getData("text/plain");
  if (plain) {
    try {
      const parsed = JSON.parse(plain);
      if (parsed?.avatarId) return { avatarId: parsed.avatarId };
    } catch (_error) {
      return { avatarId: plain };
    }
  }

  const fallbackAvatarId = getDraggedAvatarId();
  return fallbackAvatarId ? { avatarId: fallbackAvatarId } : null;
}

export function extractFoundryDocumentDropData(event) {
  const nativeEvent = getNativeDragEvent(event);
  const foundryPayload = globalThis.TextEditor?.getDragEventData?.(nativeEvent);
  if (
    foundryPayload
    && typeof foundryPayload === "object"
    && (foundryPayload.type || foundryPayload.uuid || foundryPayload.tokenId || foundryPayload.tokenUuid || foundryPayload.actorId)
  ) {
    return foundryPayload;
  }

  const applicationJson = nativeEvent?.dataTransfer?.getData("application/json");
  if (applicationJson) {
    try {
      return JSON.parse(applicationJson);
    } catch (_error) {
      // fall back to text/plain parsing
    }
  }

  const plain = nativeEvent?.dataTransfer?.getData("text/plain");
  if (!plain) return null;

  try {
    return JSON.parse(plain);
  } catch (_error) {
    return null;
  }
}

export async function resolveFoundryDocumentDrop(event) {
  const data = extractFoundryDocumentDropData(event);
  if (!data || typeof data !== "object") return null;

  const resolveUuidDocument = async (uuid) => {
    if (!uuid || typeof fromUuid !== "function") return null;
    try {
      return await fromUuid(uuid);
    } catch (_error) {
      return null;
    }
  };

  let document = null;
  document = await resolveUuidDocument(data.uuid);
  if (!document) document = await resolveUuidDocument(data.tokenUuid);

  if (!document && (data.tokenId || data.token?.id)) {
    const tokenId = String(data.tokenId || data.token?.id || "").trim();
    const sceneId = String(data.sceneId || data.scene?.id || globalThis.canvas?.scene?.id || "").trim();
    const scene = (sceneId ? game.scenes?.get(sceneId) : null) ?? globalThis.canvas?.scene ?? null;
    document = scene?.tokens?.get(tokenId) ?? null;
  }

  if (!document && data.actorId) {
    document = game.actors?.get(data.actorId) ?? null;
  }

  if (!document) return null;

  const effectiveDocument = document?.document ?? document;
  const documentName = String(effectiveDocument?.documentName || effectiveDocument?.constructor?.name || data.type || "").trim();
  const isTokenDocument = ["Token", "TokenDocument"].includes(documentName);
  const actor = isTokenDocument
    ? (effectiveDocument.actor ?? document.actor ?? null)
    : (documentName === "Actor" ? effectiveDocument : effectiveDocument.actor ?? document.actor ?? null);

  if (!actor) return null;

  const tokenImage = isTokenDocument
    ? String(effectiveDocument.texture?.src || document.texture?.src || actor.img || "").trim()
    : String(actor.img || "").trim();
  const displayName = String(effectiveDocument.name || document.name || actor.name || "").trim();

  return {
    data,
    document: effectiveDocument,
    actor,
    isToken: isTokenDocument,
    imagePath: tokenImage,
    name: displayName || actor.name || "Unnamed actor"
  };
}

export function setTheatreSceneDragData(event, sceneId, plainPayload = { type: "TheatreScene", sceneId }) {
  if (!sceneId) return;

  const nativeEvent = getNativeDragEvent(event);
  const transfer = nativeEvent?.dataTransfer;
  if (!transfer) return;

  transfer.setData("application/x-theatre-scene", JSON.stringify({ sceneId }));
  transfer.setData(
    "text/plain",
    typeof plainPayload === "string" ? plainPayload : JSON.stringify(plainPayload)
  );
  transfer.effectAllowed = "copy";
}

export function setWorldMapDragData(event, mapId, plainPayload = { type: "WorldMap", mapId }) {
  if (!mapId) return;

  const nativeEvent = getNativeDragEvent(event);
  const transfer = nativeEvent?.dataTransfer;
  if (!transfer) return;

  transfer.setData("application/x-footlights-world-map", JSON.stringify({ mapId }));
  transfer.setData(
    "text/plain",
    typeof plainPayload === "string" ? plainPayload : JSON.stringify(plainPayload)
  );
  transfer.effectAllowed = "copy";
}

export function setPortalDragData(event, portalId, plainPayload = { type: "Portal", portalId }) {
  if (!portalId) return;

  const nativeEvent = getNativeDragEvent(event);
  const transfer = nativeEvent?.dataTransfer;
  if (!transfer) return;

  transfer.setData("application/x-footlights-portal", JSON.stringify({ portalId }));
  transfer.setData(
    "text/plain",
    typeof plainPayload === "string" ? plainPayload : JSON.stringify(plainPayload)
  );
  transfer.effectAllowed = "copy";
}

export function openImagePickerForInput(form, targetSelector, pickerType = "image") {
  if (!form || !targetSelector) return;

  const input = form.querySelector(targetSelector);
  if (!input) return;

  const picker = new FilePicker({
    type: pickerType || "image",
    current: input.value || "",
    callback: (path) => {
      input.value = path;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const fieldName = String(input.name || "").trim();
      if (/^themeEditor\..+Image$/u.test(fieldName)) {
        const alphaField = fieldName.replace(/Image$/u, "ImageAlpha");
        const alphaInput = form.querySelector(`[name='${alphaField}']`);
        if (alphaInput && (!Number.isFinite(Number(alphaInput.value)) || Number(alphaInput.value) <= 0)) {
          alphaInput.value = "1";
          alphaInput.dispatchEvent(new Event("input", { bubbles: true }));
          alphaInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  });
  picker.render(true);

  const liftPickerToFront = () => {
    picker.bringToTop?.();
    const pickerElement = picker.element?.[0] ?? picker.element;
    if (!(pickerElement instanceof HTMLElement)) return;
    pickerElement.classList.add("tom-footlights-filepicker-front");
    const highestZIndex = Array.from(document.querySelectorAll(".app.window-app"))
      .reduce((highest, element) => {
        const value = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
        return Number.isFinite(value) ? Math.max(highest, value) : highest;
      }, 100);
    pickerElement.style.setProperty("z-index", String(Math.max(5000, highestZIndex + 100)), "important");
    pickerElement.style.setProperty("visibility", "visible", "important");
    pickerElement.style.setProperty("opacity", "1", "important");
    pickerElement.style.setProperty("pointer-events", "auto", "important");
  };

  window.requestAnimationFrame(liftPickerToFront);
  window.setTimeout(liftPickerToFront, 50);
  window.setTimeout(liftPickerToFront, 180);
}

export function isVideoMediaPath(value) {
  const path = String(value ?? "").trim().toLowerCase();
  return [".webm", ".mp4", ".m4v", ".mov"].some((extension) => path.endsWith(extension));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function themeStopToCss(stop) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(stop?.color ?? ""));
  if (!match) return "rgba(255,255,255,1)";
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, Number(stop?.alpha)));
  return `rgba(${r}, ${g}, ${b}, ${Number.isFinite(alpha) ? alpha : 1})`;
}

export function themeStopToOpaqueCss(stop) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(stop?.color ?? ""));
  if (!match) return "rgba(255,255,255,1)";
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

export function themeStopToAlphaCss(stop, alphaMultiplier = 1) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(stop?.color ?? ""));
  if (!match) return "rgba(255,255,255,1)";
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, Number(stop?.alpha)));
  const resolvedAlpha = Number.isFinite(alpha) ? alpha : 1;
  const multiplier = Math.max(0, Math.min(1, Number(alphaMultiplier)));
  return `rgba(${r}, ${g}, ${b}, ${resolvedAlpha * (Number.isFinite(multiplier) ? multiplier : 1)})`;
}

export function themeLinearGradientCss(start, end) {
  return `linear-gradient(180deg, ${themeStopToCss(start)}, ${themeStopToCss(end)})`;
}

export function themeSizeToCss(size, fallback = 1) {
  const numericValue = Number(size);
  const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;
  return `${safeValue}rem`;
}

export function themeNumberToCss(value, fallback = 1, unit = "px") {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;
  return `${safeValue}${unit}`;
}

export function themeFontFamilyToCss(value, fallback = "inherit") {
  const family = String(value ?? "").trim();
  return family ? JSON.stringify(family) : fallback;
}

export function themeImageUrlToCss(value, fallback = "none") {
  const path = String(value ?? "").trim();
  if (!path) return fallback;
  const escapedPath = path.replaceAll("\\", "/").replaceAll("\"", "\\\"");
  return `url("${escapedPath}")`;
}

function buildThemeMediaLayerStyle(pathValue, alphaValue, scaleValue, repeatValue, blurValue = 0) {
  const path = String(pathValue ?? "").trim();
  if (!path) return "";
  const alpha = Math.max(0, Math.min(1, Number(alphaValue) || 0));
  if (alpha <= 0) return "";
  const scale = Math.max(0.1, Math.min(4, Number(scaleValue) || 1));
  const blur = Math.max(0, Math.min(32, Number(blurValue) || 0));
  const repeat = String(repeatValue ?? "repeat").trim() || "repeat";
  const escapedPath = path.replaceAll("\\", "/").replaceAll("\"", "\\\"");
  return [
    `background-image:url("${escapedPath}")`,
    "background-position:center center",
    `background-repeat:${repeat}`,
    `background-size:${(scale * 100).toFixed(0)}% auto`,
    `filter:${blur > 0 ? `blur(${blur}px)` : "none"}`,
    `opacity:${alpha}`
  ].join(";");
}

function syncThemeMediaLayer(element, styleValue) {
  if (!element) return;
  const existingLayer = Array.from(element.children).find((child) => child.classList?.contains("tom-theme-media-layer"));
  if (!styleValue) {
    existingLayer?.remove?.();
    element.classList.remove("tom-theme-has-media-layer");
    return;
  }

  const layer = existingLayer ?? document.createElement("div");
  if (!existingLayer) {
    layer.className = "tom-theme-media-layer";
    element.prepend(layer);
  }
  layer.setAttribute("style", styleValue);
  element.classList.add("tom-theme-has-media-layer");
}

function applyThemeMediaLayers(rootElement, theme) {
  const root = rootElement instanceof HTMLElement ? rootElement : rootElement?.[0];
  if (!(root instanceof HTMLElement) || !theme) return;
  const managedElements = new Set();

  const applyToElements = (selector, styleValue) => {
    const candidates = [
      root,
      root.closest?.(".window-content"),
      root.closest?.(".window-app")
    ].filter((element, index, list) => element instanceof HTMLElement && list.indexOf(element) === index);
    candidates.forEach((element) => {
      if (!element.matches?.(selector)) return;
      managedElements.add(element);
      syncThemeMediaLayer(element, styleValue);
    });
    root.querySelectorAll(selector).forEach((element) => {
      managedElements.add(element);
      syncThemeMediaLayer(element, styleValue);
    });
  };

  const appStyle = buildThemeMediaLayerStyle(
    theme?.content?.appBackgroundImage,
    theme?.content?.appBackgroundImageAlpha,
    theme?.content?.appBackgroundImageScale,
    theme?.content?.appBackgroundImageRepeat,
    theme?.content?.appBackgroundImageBlur
  );
  const surfaceStyle = buildThemeMediaLayerStyle(
    theme?.content?.surfaceImage,
    theme?.content?.surfaceImageAlpha,
    theme?.content?.surfaceImageScale,
    theme?.content?.surfaceImageRepeat,
    theme?.content?.surfaceImageBlur
  );
  const containerStyle = buildThemeMediaLayerStyle(
    theme?.content?.containerImage,
    theme?.content?.containerImageAlpha,
    theme?.content?.containerImageScale,
    theme?.content?.containerImageRepeat
  );
  const cardStyle = buildThemeMediaLayerStyle(
    theme?.content?.cardImage,
    theme?.content?.cardImageAlpha,
    theme?.content?.cardImageScale,
    theme?.content?.cardImageRepeat
  );
  const gmBarStyle = buildThemeMediaLayerStyle(
    theme?.theatre?.gmBarImage,
    theme?.theatre?.gmBarImageAlpha,
    theme?.theatre?.gmBarImageScale,
    theme?.theatre?.gmBarImageRepeat
  );

  applyToElements([
    ".tom-scene-library",
    ".theatre-scene-config .window-content",
    ".theatre-actor-profile-config .window-content",
    ".theatre-mindmap .window-content",
    ".theatre-adventure-planner-config .window-content",
    ".theatre-avatar-config .window-content",
    ".theatre-world-map .window-content",
    ".theatre-world-map-config .window-content"
  ].join(", "), appStyle);
  applyToElements(".tom-theme-content-surface", surfaceStyle);
  applyToElements(".tom-theme-container", containerStyle);
  applyToElements(".tom-theme-card:not(.tom-mindmap-node):not(.tom-mindmap-source-item):not(.tom-mindmap-create-menu__item):not(.tom-theme-preset)", cardStyle);
  applyToElements(".tom-gm-bar", gmBarStyle);

  root.querySelectorAll(".tom-theme-has-media-layer").forEach((element) => {
    if (managedElements.has(element)) return;
    syncThemeMediaLayer(element, "");
  });
}

function resolveThemeFontPresetSize(theme, preset) {
  const fallbackPreset = "subText";
  const safePreset = typeof preset === "string" && preset in (theme?.typography ?? {})
    ? preset
    : fallbackPreset;
  return theme?.typography?.[safePreset] ?? theme?.typography?.[fallbackPreset] ?? 0.82;
}

export function buildThemeInlineStyle(theme) {
  const contentSurfaceImagePath = String(theme?.content?.surfaceImage || "").trim();
  const contentContainerImagePath = String(theme?.content?.containerImage || "").trim();
  const contentCardImagePath = String(theme?.content?.cardImage || "").trim();
  const contentSurfaceImageAlpha = Math.max(0, Math.min(1, Number(theme.content?.surfaceImageAlpha) || 0));
  const contentContainerImageAlpha = Math.max(0, Math.min(1, Number(theme.content?.containerImageAlpha) || 0));
  const contentCardImageAlpha = Math.max(0, Math.min(1, Number(theme.content?.cardImageAlpha) || 0));
  const contentSurfaceImageScale = Math.max(0.1, Math.min(4, Number(theme.content?.surfaceImageScale ?? 1) || 1));
  const contentSurfaceImageBlur = Math.max(0, Math.min(32, Number(theme.content?.surfaceImageBlur ?? 0) || 0));
  const contentContainerImageScale = Math.max(0.1, Math.min(4, Number(theme.content?.containerImageScale ?? 1) || 1));
  const contentCardImageScale = Math.max(0.1, Math.min(4, Number(theme.content?.cardImageScale ?? 1) || 1));
  const appBackgroundImageBlur = Math.max(0, Math.min(32, Number(theme.content?.appBackgroundImageBlur ?? 0) || 0));
  const contentShadowBlurValue = Number(theme.content?.shadowBlur ?? 42);
  const contentShadowDistanceValue = Number(theme.content?.shadowDistance ?? 18);
  const contentShadowBlur = Number.isFinite(contentShadowBlurValue) ? Math.max(0, Math.min(96, contentShadowBlurValue)) : 42;
  const contentShadowDistance = Number.isFinite(contentShadowDistanceValue) ? Math.max(0, Math.min(96, contentShadowDistanceValue)) : 18;
  const contentShadow = `0 ${contentShadowDistance}px ${contentShadowBlur}px ${themeStopToCss(theme.content?.shadow)}`;
  const contentShadowBleedGutter = Math.max(10, Math.min(24, 10 + ((contentShadowBlur + contentShadowDistance) * 0.0733)));
  const contentFocusShadowBlurValue = Number(theme.content?.focusShadowBlur ?? 0);
  const contentFocusShadowDistanceValue = Number(theme.content?.focusShadowDistance ?? 2);
  const contentFocusShadowBlur = Number.isFinite(contentFocusShadowBlurValue) ? Math.max(0, Math.min(32, contentFocusShadowBlurValue)) : 0;
  const contentFocusShadowDistance = Number.isFinite(contentFocusShadowDistanceValue) ? Math.max(0, Math.min(32, contentFocusShadowDistanceValue)) : 2;
  const contentFocusShadow = `0 0 ${contentFocusShadowBlur}px ${contentFocusShadowDistance}px ${themeStopToCss(theme.content?.focusShadow)}`;
  const contentIconFocusShadowBlur = Math.max(contentFocusShadowBlur, contentFocusShadowDistance);
  const contentFocusShadowColor = themeStopToOpaqueCss(theme.content?.focusShadow);
  const contentFocusShadowColor70 = themeStopToAlphaCss(theme.content?.focusShadow, 0.7);
  const contentIconFocusShadow = `0 0 ${contentIconFocusShadowBlur}px ${contentFocusShadowColor}`;
  const contentHoverShadow = `${contentFocusShadow}, ${contentShadow}`;
  const stageGoblinFontSize = resolveThemeFontPresetSize(theme, theme?.stageGoblin?.fontPreset);
  return [
    `--tom-font-heading-1:${themeSizeToCss(theme.typography?.heading1, 1.42)}`,
    `--tom-font-heading-2:${themeSizeToCss(theme.typography?.heading2, 1.18)}`,
    `--tom-font-heading-2-hover:${themeSizeToCss(theme.typography?.heading2Hover, theme.typography?.heading2 ?? 1.18)}`,
    `--tom-font-heading-3:${themeSizeToCss(theme.typography?.heading3, 1.02)}`,
    `--tom-font-body:${themeSizeToCss(theme.typography?.body, 0.94)}`,
    `--tom-font-sub-text:${themeSizeToCss(theme.typography?.subText, 0.82)}`,
    `--tom-font-sub-text-hover:${themeSizeToCss(theme.typography?.subTextHover, theme.typography?.subText ?? 0.82)}`,
    `--tom-font-micro-text:${themeSizeToCss(theme.typography?.microText, 0.72)}`,
    `--tom-font-label-text:${themeSizeToCss(theme.typography?.labelText, theme.typography?.heading3 ?? 0.82)}`,
    `--tom-font-navigation-size:${themeSizeToCss(theme.typography?.navigationSize, 0.76)}`,
    `--tom-font-family-heading-1:${themeFontFamilyToCss(theme.typography?.heading1Font)}`,
    `--tom-font-family-heading-2:${themeFontFamilyToCss(theme.typography?.heading2Font)}`,
    `--tom-font-family-heading-3:${themeFontFamilyToCss(theme.typography?.heading3Font)}`,
    `--tom-font-family-body:${themeFontFamilyToCss(theme.typography?.bodyFont)}`,
    `--tom-font-family-sub-text:${themeFontFamilyToCss(theme.typography?.subTextFont)}`,
    `--tom-font-family-micro-text:${themeFontFamilyToCss(theme.typography?.microTextFont)}`,
    `--tom-font-family-label-text:${themeFontFamilyToCss(theme.typography?.labelTextFont, "var(--tom-font-family-heading-3, inherit)")}`,
    `--tom-font-family-navigation:${themeFontFamilyToCss(theme.typography?.navigationFont, "var(--tom-font-family-body, inherit)")}`,
    `--tom-typography-heading-1-color:${themeStopToCss(theme.content.heading)}`,
    `--tom-typography-heading-2-color:${themeStopToCss(theme.content.subheading)}`,
    `--tom-typography-heading-3-color:${themeStopToCss(theme.content.label)}`,
    `--tom-typography-label-text-color:${themeStopToCss(theme.content.label)}`,
    `--tom-shadow-soft:${contentShadow}`,
    `--tom-shadow-panel:${contentShadow}`,
    `--tom-shadow-glow:${contentHoverShadow}`,
    `--tom-shadow-bleed-gutter:${contentShadowBleedGutter.toFixed(1)}px`,
    `--tom-library-shadow-bleed-gutter:${contentShadowBleedGutter.toFixed(1)}px`,
    `--tom-theme-shadow-bleed-gutter:${contentShadowBleedGutter.toFixed(1)}px`,
    `--tom-content-surface-shadow:${contentShadow}`,
    `--tom-content-card-shadow:${contentShadow}`,
    `--tom-settings-surface-shadow:${contentShadow}`,
    `--tom-app-background:${themeStopToCss(theme.content.appBackground)}`,
    `--tom-app-background-solid:${String(theme.content.appBackground?.color ?? "#08121f")}`,
    `--tom-app-background-image-blur:${appBackgroundImageBlur}px`,
    `--tom-nav-surface-bg:${themeLinearGradientCss(theme.navigation.surfaceStart, theme.navigation.surfaceEnd)}`,
    `--tom-nav-surface-image:${themeImageUrlToCss(theme.navigation.surfaceImage)}`,
    `--tom-nav-surface-image-alpha:${Math.max(0, Math.min(1, Number(theme.navigation.surfaceImageAlpha) || 0))}`,
    `--tom-nav-surface-image-scale:${Number(theme.navigation?.surfaceImageScale ?? 1)}`,
    `--tom-nav-surface-image-repeat:${String(theme.navigation?.surfaceImageRepeat ?? "repeat")}`,
    `--tom-nav-card-bg:${themeLinearGradientCss(theme.navigation.cardStart, theme.navigation.cardEnd)}`,
    `--tom-nav-card-image:${themeImageUrlToCss(theme.navigation.cardImage)}`,
    `--tom-nav-card-image-alpha:${Math.max(0, Math.min(1, Number(theme.navigation.cardImageAlpha) || 0))}`,
    `--tom-nav-card-image-scale:${Number(theme.navigation?.cardImageScale ?? 1)}`,
    `--tom-nav-card-image-repeat:${String(theme.navigation?.cardImageRepeat ?? "repeat")}`,
    `--tom-nav-card-radius:${themeNumberToCss(theme.navigation.cardRadius, 20, "px")}`,
    `--tom-nav-card-blur:${theme.navigation.cardBlurEnabled ? "14px" : "0px"}`,
    `--tom-nav-titlebar-bg:${themeLinearGradientCss(theme.navigation.titleBarStart, theme.navigation.titleBarEnd)}`,
    `--tom-nav-border-1:${themeStopToCss(theme.navigation.border1)}`,
    `--tom-nav-border-2:${themeStopToCss(theme.navigation.border2)}`,
    `--tom-nav-border-1-width:${themeNumberToCss(theme.navigation.border1Width, 1, "px")}`,
    `--tom-nav-border-2-width:${themeNumberToCss(theme.navigation.border2Width, 1, "px")}`,
    `--tom-nav-button-bg:${themeLinearGradientCss(theme.navigation.buttonStart, theme.navigation.buttonEnd)}`,
    `--tom-nav-button-bg-start:${themeStopToCss(theme.navigation.buttonStart)}`,
    `--tom-nav-button-bg-end:${themeStopToCss(theme.navigation.buttonEnd)}`,
    `--tom-nav-button-border:${themeStopToCss(theme.navigation.buttonBorder)}`,
    `--tom-nav-button-border-width:${themeNumberToCss(theme.navigation.buttonBorderWidth, 1, "px")}`,
    `--tom-nav-button-hover-bg:${themeLinearGradientCss(theme.navigation.buttonHoverStart, theme.navigation.buttonHoverEnd)}`,
    `--tom-nav-button-hover-bg-start:${themeStopToCss(theme.navigation.buttonHoverStart)}`,
    `--tom-nav-button-hover-bg-end:${themeStopToCss(theme.navigation.buttonHoverEnd)}`,
    `--tom-nav-button-hover-border:${themeStopToCss(theme.navigation.buttonHoverBorder)}`,
    `--tom-nav-button-hover-border-width:${themeNumberToCss(theme.navigation.buttonHoverBorderWidth, 1, "px")}`,
    `--tom-nav-button-active-bg:${themeLinearGradientCss(theme.navigation.buttonActiveStart, theme.navigation.buttonActiveEnd)}`,
    `--tom-nav-button-active-bg-start:${themeStopToCss(theme.navigation.buttonActiveStart)}`,
    `--tom-nav-button-active-bg-end:${themeStopToCss(theme.navigation.buttonActiveEnd)}`,
    `--tom-nav-button-active-border:${themeStopToCss(theme.navigation.buttonActiveBorder)}`,
    `--tom-nav-button-active-border-width:${themeNumberToCss(theme.navigation.buttonActiveBorderWidth, 1, "px")}`,
    `--tom-nav-tab-radius:${themeNumberToCss(theme.navigation.tabRadius, 999, "px")}`,
    `--tom-nav-divider:${themeStopToCss(theme.navigation.divider)}`,
    `--tom-nav-shell-divider:${themeStopToCss(theme.navigation.shellDivider)}`,
    `--tom-nav-action-safe-bg:${themeStopToCss(theme.navigation.actionSafeBg)}`,
    `--tom-nav-action-safe-border:${themeStopToCss(theme.navigation.actionSafeBorder)}`,
    `--tom-nav-action-safe-border-width:${themeNumberToCss(theme.navigation.actionSafeBorderWidth, 1, "px")}`,
    `--tom-nav-action-safe-radius:${themeNumberToCss(theme.navigation.actionSafeRadius, 999, "px")}`,
    `--tom-nav-action-safe-icon:${themeStopToCss(theme.navigation.actionSafeIcon)}`,
    `--tom-nav-action-safe-icon-size:${themeSizeToCss(theme.navigation.actionSafeIconSize, 1)}`,
    `--tom-nav-action-settings-bg:${themeStopToCss(theme.navigation.actionSettingsBg)}`,
    `--tom-nav-action-settings-border:${themeStopToCss(theme.navigation.actionSettingsBorder)}`,
    `--tom-nav-action-settings-border-width:${themeNumberToCss(theme.navigation.actionSettingsBorderWidth, 1, "px")}`,
    `--tom-nav-action-settings-radius:${themeNumberToCss(theme.navigation.actionSettingsRadius, 999, "px")}`,
    `--tom-nav-action-settings-icon:${themeStopToCss(theme.navigation.actionSettingsIcon)}`,
    `--tom-nav-action-settings-icon-size:${themeSizeToCss(theme.navigation.actionSettingsIconSize, 1)}`,
    `--tom-nav-action-create-bg:${themeStopToCss(theme.navigation.actionCreateBg)}`,
    `--tom-nav-action-create-border:${themeStopToCss(theme.navigation.actionCreateBorder)}`,
    `--tom-nav-action-create-border-width:${themeNumberToCss(theme.navigation.actionCreateBorderWidth, 1, "px")}`,
    `--tom-nav-action-create-radius:${themeNumberToCss(theme.navigation.actionCreateRadius, 8, "px")}`,
    `--tom-nav-action-create-text:${themeStopToCss(theme.navigation.actionCreateText)}`,
    `--tom-nav-action-create-hover-bg:${themeStopToCss(theme.navigation.actionCreateHoverBg)}`,
    `--tom-nav-action-create-hover-text:${themeStopToCss(theme.navigation.actionCreateHoverText)}`,
    `--tom-nav-text:${themeStopToCss(theme.navigation.text)}`,
    `--tom-nav-muted-text:${themeStopToCss(theme.navigation.mutedText)}`,
    `--tom-nav-header-rule:${themeStopToCss(theme.navigation.headerRule)}`,
    `--tom-nav-icon-color:${themeStopToCss(theme.navigation.icon)}`,
    `--tom-nav-icon-hover-color:${themeStopToCss(theme.navigation.iconHover)}`,
    `--tom-nav-icon-active-color:${themeStopToCss(theme.navigation.iconActive)}`,
    `--tom-content-surface-bg:${themeLinearGradientCss(theme.content.surfaceStart, theme.content.surfaceEnd)}`,
    `--tom-content-surface-image:none`,
    `--tom-content-surface-image-alpha:0`,
    `--tom-content-surface-image-scale:${contentSurfaceImageScale}`,
    `--tom-content-surface-image-size:${(contentSurfaceImageScale * 100).toFixed(0)}% auto`,
    `--tom-content-surface-image-filter:${contentSurfaceImageBlur > 0 ? `blur(${contentSurfaceImageBlur}px)` : "none"}`,
    `--tom-content-surface-image-repeat:${String(theme.content?.surfaceImageRepeat ?? "repeat")}`,
    `--tom-content-surface-radius:${themeNumberToCss(theme.content.surfaceRadius, 20, "px")}`,
    `--tom-settings-surface-radius:${themeNumberToCss(theme.content.surfaceRadius, 20, "px")}`,
    `--tom-library-settings-card-radius:${themeNumberToCss(theme.content.surfaceRadius, 20, "px")}`,
    `--tom-library-settings-panel-radius:${themeNumberToCss(theme.content.surfaceRadius, 20, "px")}`,
    `--tom-content-container-bg:${themeStopToCss(theme.content.container)}`,
    `--tom-content-container-image:none`,
    `--tom-content-container-image-alpha:0`,
    `--tom-content-container-image-scale:${contentContainerImageScale}`,
    `--tom-content-container-image-size:${(contentContainerImageScale * 100).toFixed(0)}% auto`,
    `--tom-content-container-image-repeat:${String(theme.content?.containerImageRepeat ?? "repeat")}`,
    `--tom-content-container-radius:${themeNumberToCss(theme.content.containerRadius, 18, "px")}`,
    `--tom-content-card-bg:${themeStopToCss(theme.content.card)}`,
    `--tom-content-card-image:none`,
    `--tom-content-card-image-alpha:0`,
    `--tom-content-card-image-scale:${contentCardImageScale}`,
    `--tom-content-card-image-size:${(contentCardImageScale * 100).toFixed(0)}% auto`,
    `--tom-content-card-image-repeat:${String(theme.content?.cardImageRepeat ?? "repeat")}`,
    `--tom-content-card-radius:${themeNumberToCss(theme.content.cardRadius, 16, "px")}`,
    `--tom-content-card-hover-bg:${themeStopToCss(theme.content.cardHover)}`,
    `--tom-content-card-hover-radius:${themeNumberToCss(theme.content.cardHoverRadius, theme.content.cardRadius ?? 16, "px")}`,
    `--tom-content-form-bg:${themeStopToCss(theme.content.formBackground)}`,
    `--tom-content-form-radius:${themeNumberToCss(theme.content.formRadius, 12, "px")}`,
    `--tom-content-divider:${themeStopToCss(theme.content.divider)}`,
    `--tom-content-highlight:${themeStopToCss(theme.content.highlight)}`,
    `--tom-content-scrollbar:${themeStopToCss(theme.content.scrollbar)}`,
    `--tom-shadow-focus:${contentFocusShadow}`,
    `--tom-shadow-focus-color:${contentFocusShadowColor}`,
    `--tom-shadow-focus-color-70:${contentFocusShadowColor70}`,
    `--tom-shadow-focus-icon:${contentIconFocusShadow}`,
    `--tom-content-heading:${themeStopToCss(theme.content.heading)}`,
    `--tom-content-subheading:${themeStopToCss(theme.content.subheading)}`,
    `--tom-content-button-hover-heading:${themeStopToCss(theme.content.buttonHoverHeading)}`,
    `--tom-interactive-title-hover-color:${themeStopToCss(theme.content.buttonHoverHeading)}`,
    `--tom-content-label:${themeStopToCss(theme.content.label)}`,
    `--tom-content-text:${themeStopToCss(theme.content.text)}`,
    `--tom-content-muted-text:${themeStopToCss(theme.content.mutedText)}`,
    `--tom-content-button-hover-subtext:${themeStopToCss(theme.content.buttonHoverSubText)}`,
    `--tom-interactive-body-hover-color:${themeStopToCss(theme.content.buttonHoverSubText)}`,
    `--tom-interactive-title-hover-size:${themeSizeToCss(theme.typography?.heading2Hover, theme.typography?.heading2 ?? 1.18)}`,
    `--tom-interactive-body-hover-size:${themeSizeToCss(theme.typography?.subTextHover, theme.typography?.subText ?? 0.82)}`,
    `--tom-content-header-rule:${themeStopToCss(theme.content.headerRule)}`,
    `--tom-content-horizontal-2:${themeStopToCss(theme.content.horizontal2)}`,
    `--tom-content-border-1:${themeStopToCss(theme.content.border1)}`,
    `--tom-content-border-2:${themeStopToCss(theme.content.border2)}`,
    `--tom-content-border-3:${themeStopToCss(theme.content.border3)}`,
    `--tom-content-border-1-width:${themeNumberToCss(theme.content.border1Width, 1, "px")}`,
    `--tom-content-border-2-width:${themeNumberToCss(theme.content.border2Width, 1, "px")}`,
    `--tom-content-border-3-width:${themeNumberToCss(theme.content.border3Width, 1, "px")}`,
    `--tom-content-action-edit-bg:${themeStopToCss(theme.content.actionEditBg)}`,
    `--tom-content-action-edit-icon:${themeStopToCss(theme.content.actionEditIcon)}`,
    `--tom-content-action-edit-icon-size:${themeSizeToCss(theme.content.actionEditIconSize, 1)}`,
    `--tom-content-action-duplicate-bg:${themeStopToCss(theme.content.actionDuplicateBg)}`,
    `--tom-content-action-duplicate-icon:${themeStopToCss(theme.content.actionDuplicateIcon)}`,
    `--tom-content-action-duplicate-icon-size:${themeSizeToCss(theme.content.actionDuplicateIconSize, 1)}`,
    `--tom-content-action-play-bg:${themeStopToCss(theme.content.actionPlayBg)}`,
    `--tom-content-action-play-icon:${themeStopToCss(theme.content.actionPlayIcon)}`,
    `--tom-content-action-play-icon-size:${themeSizeToCss(theme.content.actionPlayIconSize, 1)}`,
    `--tom-content-action-delete-bg:${themeStopToCss(theme.content.actionDeleteBg)}`,
    `--tom-content-action-delete-icon:${themeStopToCss(theme.content.actionDeleteIcon)}`,
    `--tom-content-action-delete-icon-size:${themeSizeToCss(theme.content.actionDeleteIconSize, 1)}`,
    `--tom-content-action-sidebar-bg:${themeStopToCss(theme.content.actionSidebarBg)}`,
    `--tom-content-action-sidebar-icon:${themeStopToCss(theme.content.actionSidebarIcon)}`,
    `--tom-content-action-sidebar-icon-size:${themeSizeToCss(theme.content.actionSidebarIconSize, 1)}`,
    `--tom-content-action-generic-bg:${themeStopToCss(theme.content.actionGenericBg)}`,
    `--tom-content-action-generic-text:${themeStopToCss(theme.content.actionGenericText)}`,
    `--tom-content-action-generic-border:${themeStopToCss(theme.content.actionGenericBorder)}`,
    `--tom-content-action-generic-border-width:${themeNumberToCss(theme.content.actionGenericBorderWidth, 1, "px")}`,
    `--tom-content-action-generic-radius:${themeNumberToCss(theme.content.actionGenericRadius, 14, "px")}`,
    `--tom-planner-canvas-bg:${themeLinearGradientCss(theme.planner.canvasStart, theme.planner.canvasEnd)}`,
    `--tom-planner-grid-primary:${themeStopToCss(theme.planner.gridPrimary)}`,
    `--tom-planner-grid-secondary:${themeStopToCss(theme.planner.gridSecondary)}`,
    `--tom-planner-node-heading:${themeStopToCss(theme.planner.heading)}`,
    `--tom-planner-node-text:${themeStopToCss(theme.planner.text)}`,
    `--tom-planner-node-handle:${themeStopToCss(theme.planner.handle)}`,
    `--tom-planner-node-action-icon:${themeStopToCss(theme.planner.actionIcon)}`,
    `--tom-planner-node-heading-inverted:${themeStopToCss(theme.planner.invertedHeading)}`,
    `--tom-planner-node-text-inverted:${themeStopToCss(theme.planner.invertedText)}`,
    `--tom-planner-node-handle-inverted:${themeStopToCss(theme.planner.invertedHandle)}`,
    `--tom-planner-node-action-icon-inverted:${themeStopToCss(theme.planner.invertedActionIcon)}`,
    `--tom-planner-backdrop-bg:${themeStopToCss(theme.planner.backdrop)}`,
    `--tom-planner-backdrop-text:${themeStopToCss(theme.planner.backdropText)}`,
    `--tom-planner-separator:${themeStopToCss(theme.planner.separator)}`,
    `--tom-planner-toggle-bg:${themeStopToCss(theme.planner.toggleBg)}`,
    `--tom-planner-toggle-icon:${themeStopToCss(theme.planner.toggleIcon)}`,
    `--tom-stage-goblin-surface-bg:${themeStopToCss(theme.stageGoblin.surface)}`,
    `--tom-stage-goblin-border:${themeStopToCss(theme.stageGoblin.border)}`,
    `--tom-stage-goblin-control-icon:${themeStopToCss(theme.stageGoblin.icon)}`,
    `--tom-stage-goblin-border-width:${themeNumberToCss(theme.stageGoblin.borderWidth, 1, "px")}`,
    `--tom-stage-goblin-radius:${themeNumberToCss(theme.stageGoblin.radius, 11, "px")}`,
    `--tom-stage-goblin-font-size:${themeSizeToCss(stageGoblinFontSize, 0.82)}`,
    `--tom-stage-goblin-tag-font-size:${themeSizeToCss(theme.stageGoblin.tagFontSize, 0.62)}`,
    `--tom-stage-goblin-tag-height:${themeNumberToCss(theme.stageGoblin.tagHeight, 26, "px")}`,
    `--tom-stage-goblin-tag-width:${themeNumberToCss(theme.stageGoblin.tagWidth, 92, "px")}`,
    `--tom-stage-goblin-tag-radius:${themeNumberToCss(theme.stageGoblin.tagRadius, 4, "px")}`,
    `--tom-stage-goblin-tag-padding-x:${themeSizeToCss(theme.stageGoblin.tagPaddingX, 0.42)}`,
    `--tom-stage-goblin-tag-glow-blur:${theme.stageGoblin.tagGlowEnabled ? themeNumberToCss(theme.stageGoblin.tagGlowBlur, 14, "px") : "0px"}`,
    `--tom-stage-goblin-tag-glow-alpha:${theme.stageGoblin.tagGlowEnabled ? "34%" : "0%"}`,
    `--tom-theatre-stage-title:${themeStopToCss(theme.theatre.stageTitle)}`,
    `--tom-theatre-stage-title-size:${themeSizeToCss(theme.theatre.stageTitleSize, 1.42)}`,
    `--tom-theatre-stage-title-font:${themeFontFamilyToCss(theme.theatre.stageTitleFont, "var(--tom-font-family-heading-1, inherit)")}`,
    `--tom-theatre-stage-subtitle:${themeStopToCss(theme.theatre.stageSubtitle)}`,
    `--tom-theatre-stage-subtitle-size:${themeSizeToCss(theme.theatre.stageSubtitleSize, 0.94)}`,
    `--tom-theatre-stage-subtitle-font:${themeFontFamilyToCss(theme.theatre.stageSubtitleFont, "var(--tom-font-family-body, inherit)")}`,
    `--tom-theatre-avatar-name:${themeStopToCss(theme.theatre.avatarName)}`,
    `--tom-theatre-avatar-name-size:${themeSizeToCss(theme.theatre.avatarNameSize, 1.02)}`,
    `--tom-theatre-mood:${themeStopToCss(theme.theatre.mood)}`,
    `--tom-theatre-mood-size:${themeSizeToCss(theme.theatre.moodSize, 1.02)}`,
    `--tom-theatre-title-bg:${themeStopToCss(theme.theatre.titleBackground)}`,
    `--tom-theatre-title-bg-border:${themeStopToCss(theme.theatre.titleBackgroundBorder)}`,
    `--tom-theatre-title-bg-border-width:${themeNumberToCss(theme.theatre.titleBackgroundBorderWidth, 0, "px")}`,
    `--tom-theatre-title-bg-radius:${themeNumberToCss(theme.theatre.titleBackgroundRadius, 100, "px")}`,
    `--tom-theatre-avatar-name-bg:${themeStopToCss(theme.theatre.avatarNameBackground)}`,
    `--tom-theatre-mood-bg:${themeStopToCss(theme.theatre.moodBackground)}`,
    `--tom-theatre-gm-bar-bg:${themeStopToCss(theme.theatre.gmBarBackground)}`,
    `--tom-theatre-gm-bar-radius:${themeNumberToCss(theme.theatre.gmBarRadius, 18, "px")}`,
    `--tom-theatre-container-1-bg:${themeStopToCss(theme.theatre.container1)}`,
    `--tom-theatre-container-1-border:${themeStopToCss(theme.theatre.container1Border)}`,
    `--tom-theatre-container-1-border-width:${themeNumberToCss(theme.theatre.container1BorderWidth, 1, "px")}`,
    `--tom-theatre-container-1-radius:${themeNumberToCss(theme.theatre.container1Radius, 18, "px")}`,
    `--tom-theatre-container-1-blur:${theme.theatre.container1BlurEnabled ? "14px" : "0px"}`,
    `--tom-theatre-container-2-bg:${themeStopToCss(theme.theatre.container2)}`,
    `--tom-theatre-container-2-border:${themeStopToCss(theme.theatre.container2Border)}`,
    `--tom-theatre-container-2-border-width:${themeNumberToCss(theme.theatre.container2BorderWidth, 1, "px")}`,
    `--tom-theatre-container-2-radius:${themeNumberToCss(theme.theatre.container2Radius, 16, "px")}`,
    `--tom-theatre-container-2-blur:${theme.theatre.container2BlurEnabled ? "12px" : "0px"}`,
    `--tom-theatre-container-3-bg:${themeStopToCss(theme.theatre.container3)}`,
    `--tom-theatre-container-3-border:${themeStopToCss(theme.theatre.container3Border)}`,
    `--tom-theatre-container-3-border-width:${themeNumberToCss(theme.theatre.container3BorderWidth, 1, "px")}`,
    `--tom-theatre-container-3-radius:${themeNumberToCss(theme.theatre.container3Radius, 14, "px")}`,
    `--tom-theatre-container-3-blur:${theme.theatre.container3BlurEnabled ? "8px" : "0px"}`,
    `--tom-theatre-icon-bg:${themeStopToCss(theme.theatre.iconBackground)}`,
    `--tom-theatre-icon-border:${themeStopToCss(theme.theatre.iconBorder)}`,
    `--tom-theatre-icon:${themeStopToCss(theme.theatre.iconColor)}`,
    `--tom-theatre-icon-border-width:${themeNumberToCss(theme.theatre.iconBorderWidth, 1, "px")}`,
    `--tom-theatre-stage-frame:${themeStopToCss(theme.theatre.stageFrame)}`,
    `--tom-theatre-stage-frame-width:${themeNumberToCss(theme.theatre.stageFrameWidth, 1, "px")}`,
    `--tom-theatre-stage-frame-radius:${themeNumberToCss(theme.theatre.stageFrameRadius, 24, "px")}`,
    `--tom-content-overlay-bg:${themeStopToCss(theme.planner.backdrop)}`,
    `--tom-content-overlay-text:${themeStopToCss(theme.planner.backdropText)}`
  ].join(";");
}

export function applyThemeInlineStyleToHost(rootElement, theme) {
  if (!rootElement || !theme) return;
  const declarations = buildThemeInlineStyle(theme)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) return null;
      return [
        entry.slice(0, separatorIndex).trim(),
        entry.slice(separatorIndex + 1).trim()
      ];
    })
    .filter(Boolean);

  const targets = new Set([rootElement]);
  const windowContent = rootElement.closest?.(".window-content");
  if (windowContent) {
    targets.add(windowContent);
    const windowApp = windowContent.closest?.(".window-app");
    if (windowApp) {
      targets.add(windowApp);
      windowApp.classList.remove("tom-themed-window");
      windowApp.classList.add("footlights-themed-window");
    }
    windowContent.classList.remove("tom-themed-window-content");
    windowContent.classList.add("footlights-themed-window-content");
  }

  for (const target of targets) {
    target.classList?.remove?.("tom-themed-host");
    target.classList?.add?.("footlights-themed-host");
    for (const [property, value] of declarations) {
      target.style.setProperty(property, value);
    }
  }
  applyThemeMediaLayers(rootElement, theme);
  translateDomSubtree(rootElement);
}

export function applyTheatreDialogTheme(dialog, moduleId, width = "24rem", theme = null) {
  const root = dialog?.element;
  if (!root?.length) return;

  if (theme) {
    applyThemeInlineStyleToHost(root[0], theme);
  }

  const themeBackground = "var(--tom-app-background, var(--tom-app-background-solid, #08121f))";
  root.addClass(`${moduleId} theatre-canvas-drop-dialog tom-theme-root tom-theme-area--content`);
  root.css({
    width,
    maxWidth: "calc(100vw - 2rem)",
    minWidth: "28rem",
    background: themeBackground,
    color: "var(--tom-content-text, var(--tom-color-text, #eef6ff))"
  });
  root.find(".window-header, .dialog-buttons").addClass("tom-theme-area--navigation");
  root.find(".window-content, .dialog-content, form").addClass("tom-theme-area--content");
  root.find(".window-content, .dialog-content, form").css({
    background: themeBackground,
    color: "var(--tom-content-text, var(--tom-color-text, #eef6ff))"
  });
  root.find(".dialog-content, form").css({
    color: "var(--tom-content-text, var(--tom-color-text, #eef6ff))"
  });
  root.find(".dialog-content .notes, .dialog-content p.notes, .dialog-content small.notes, form .notes, form p.notes, form small.notes").css({
    color: "var(--tom-content-text, var(--tom-color-text, #eef6ff))"
  });
  root.find("form").css({
    margin: 0,
    padding: 0
  });
  root.find(".dialog-buttons .dialog-button").css({
    borderRadius: "var(--tom-nav-tab-radius, 12px)",
    border: "var(--tom-nav-button-border-width, 1px) solid var(--tom-nav-button-border, rgba(128, 181, 232, 0.3))",
    color: "var(--tom-nav-text, #ffffff)",
    background: "var(--tom-nav-button-bg, linear-gradient(180deg, rgba(29, 56, 86, 0.96), rgba(17, 35, 57, 0.96)))",
    boxShadow: "none",
    padding: "0.4rem 0.72rem",
    minHeight: "2.2rem",
    fontSize: "0.9rem"
  });
  root.find(".dialog-buttons .dialog-button.default").css({
    color: "var(--tom-nav-action-create-text, #07212d)",
    background: "var(--tom-nav-action-create-bg, linear-gradient(135deg, rgba(79, 198, 193, 0.96), rgba(116, 228, 224, 0.94)))",
    borderColor: "var(--tom-nav-action-create-border, rgba(131, 240, 236, 0.54))"
  });
  translateDomSubtree(root[0]);
}

export function scheduleTheatreDialogTheme(dialog, moduleId, width = "24rem", theme = null) {
  const applyTheme = () => applyTheatreDialogTheme(dialog, moduleId, width, theme);
  applyTheme();
  requestAnimationFrame(() => {
    applyTheme();
    requestAnimationFrame(applyTheme);
  });
  window.setTimeout(applyTheme, 40);
}
