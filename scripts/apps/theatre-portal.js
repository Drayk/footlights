import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { sanitizePortalCustomHtml, scopePortalCustomCss } from "../portal-content-utils.js";
import { TheatreStore } from "../store.js";

function normalizeOpenMode(value) {
  const mode = String(value || "").trim();
  return ["stage", "fullscreen"].includes(mode) ? "stage" : "window";
}

function hexToRgbString(hex, fallback = "20, 32, 42") {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return fallback;
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ].join(", ");
}

function clampPortalNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, resolved));
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
  return clampPortalNumber(value, 0, 100, fallback);
}

function escapePortalStyleUrl(path = "") {
  return String(path || "").trim().replaceAll("\\", "/").replaceAll("\"", "\\\"");
}

function getPortalBackgroundLayout(settings = {}) {
  const mode = normalizePortalBackgroundPositionMode(settings.backgroundPositionMode);
  return {
    fit: normalizePortalBackgroundFit(settings.backgroundFit),
    repeat: normalizePortalBackgroundRepeat(settings.backgroundRepeat),
    positionMode: mode,
    x: mode === "custom" ? clampPortalPercent(settings.backgroundPositionX) : 50,
    y: mode === "custom" ? clampPortalPercent(settings.backgroundPositionY) : 50
  };
}

function buildPortalBackgroundMediaStyle(portal = {}) {
  const background = String(portal.background || "").trim();
  const settings = portal.settings ?? {};
  const layout = getPortalBackgroundLayout(portal.settings);
  const position = `${layout.x}% ${layout.y}%`;
  const fit = layout.fit === "fill" ? "fill" : layout.fit;
  const isOverride = Boolean(settings.surfaceOverrideEnabled);
  if (portal.backgroundType !== "video" && background && layout.repeat !== "no-repeat") {
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

function getPortalSurfaceAspectOverride(portal = {}) {
  const settings = portal.settings ?? {};
  if (!settings.surfaceOverrideEnabled) return "";
  const width = clampPortalNumber(settings.surfaceAspectWidth, 1, 64, 16);
  const height = clampPortalNumber(settings.surfaceAspectHeight, 1, 64, 9);
  return (width / height).toFixed(6);
}

function clampPortalElementPosition(value, fallback = 0) {
  return clampPortalNumber(value, -100, 200, fallback);
}

function clampPortalElementSize(value, fallback = 8) {
  return clampPortalNumber(value, 1, 200, fallback);
}

function normalizePortalColor(value, fallback = "#ffffff") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizePortalContentLayers(element = {}) {
  const sourceLayers = Array.isArray(element.contentLayers) ? element.contentLayers : [];
  const normalized = sourceLayers
    .map((layer) => preparePortalContentLayer(layer, element))
    .filter(Boolean);
  if (normalized.length) return normalized;

  const type = String(element.type || "");
  if (!["image", "video", "text", "html", "portalAvatar", "dataText"].includes(type)) return [];
  return [
    preparePortalContentLayer({
      id: "legacy-content",
      type,
      name: element.name || tr("Content layer"),
      text: element.text || "",
      media: element.media || {},
      visible: true,
      zIndex: 1
    }, element)
  ].filter(Boolean);
}

function portalElementHasClickInteraction(element = {}) {
  const action = element?.action ?? {};
  const actionType = String(action?.type || "none");
  if (actionType !== "none") return true;
  if (String(action?.documentUuid || action?.documentId || action?.theatreSceneId || action?.worldMapId || action?.portalId || "").trim()) return true;
  if (String(element?.clickSound?.src || "").trim()) return true;
  return normalizePortalEffects(element).some((effect) =>
    effect.enabled !== false
    && effect.type === "sound"
    && !effect.hover
    && String(effect.settings?.src || "").trim()
  );
}

function getFirstVisiblePortalContentLayerId(element = {}) {
  const allowedTypes = new Set(["image", "video", "text", "html", "portalAvatar", "dataText"]);
  const sourceLayers = Array.isArray(element.contentLayers) ? element.contentLayers : [];
  const layer = sourceLayers.find((entry) => allowedTypes.has(String(entry?.type || "")) && entry?.visible !== false);
  if (layer) return String(layer.id || "").trim();
  return allowedTypes.has(String(element.type || "")) ? "legacy-content" : "";
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

function renderPortalDataTextLayer(layer = {}) {
  const avatar = TheatreStore.getAvatarById(layer.media?.avatarId);
  const actor = avatar?.actorId ? game.actors?.get?.(avatar.actorId) : null;
  const path = String(layer.media?.dataPath || "").trim();
  if (!actor || !path) return "";
  const source = path.startsWith("system.") ? actor : actor.system;
  const resolvedPath = path.startsWith("system.") ? path : path.replace(/^system\./, "");
  const value = formatPortalDataTextValue(foundry.utils.getProperty(source, resolvedPath));
  const format = String(layer.media?.dataFormat || "{value}").trim() || "{value}";
  return format.replaceAll("{value}", value).replaceAll("{path}", path);
}

function normalizePortalContentLayerLayout(layout = {}) {
  const alignX = ["left", "center", "right"].includes(String(layout.alignX || "")) ? String(layout.alignX) : "center";
  const alignY = ["top", "center", "bottom"].includes(String(layout.alignY || "")) ? String(layout.alignY) : "center";
  const textAlign = ["left", "center", "right"].includes(String(layout.textAlign || "")) ? String(layout.textAlign) : alignX;
  return {
    alignX,
    alignY,
    textAlign,
    scale: clampPortalNumber(layout.scale, 0.1, 4, 1),
    offsetX: clampPortalNumber(layout.offsetX, -100, 100, 0),
    offsetY: clampPortalNumber(layout.offsetY, -100, 100, 0)
  };
}

function normalizePortalContentLayerTextStyle(textStyle = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(String(textStyle.color || "")) ? String(textStyle.color) : "#ffffff";
  return {
    fontFamily: String(textStyle.fontFamily || "").trim(),
    fontSize: clampPortalNumber(textStyle.fontSize, 6, 160, 24),
    color,
    shadow: Boolean(textStyle.shadow),
    shadowColor: normalizePortalColor(textStyle.shadowColor, "#000000"),
    shadowOpacity: clampPortalNumber(textStyle.shadowOpacity, 0, 1, 0.45),
    shadowBlur: clampPortalNumber(textStyle.shadowBlur, 0, 40, 4),
    shadowX: clampPortalNumber(textStyle.shadowX, -80, 80, 0),
    shadowY: clampPortalNumber(textStyle.shadowY, -80, 80, 2)
  };
}

function buildPortalContentLayerStyle(layer = {}, element = {}) {
  const layout = normalizePortalContentLayerLayout(layer.layout);
  const textStyle = normalizePortalContentLayerTextStyle(layer.textStyle);
  const isHtmlLayer = String(layer.type || "") === "html";
  const anchorX = isHtmlLayer ? "center" : layout.alignX;
  const anchorY = isHtmlLayer ? "center" : layout.alignY;
  const alignX = { left: "flex-start", center: "center", right: "flex-end" }[anchorX] || "center";
  const alignY = { top: "flex-start", center: "center", bottom: "flex-end" }[anchorY] || "center";
  const objectPositionX = { left: "left", center: "center", right: "right" }[anchorX] || "center";
  const objectPositionY = { top: "top", center: "center", bottom: "bottom" }[anchorY] || "center";
  const media = layer.media ?? {};
  const shadowRgb = hexToRgbString(textStyle.shadowColor, "0, 0, 0");
  const textShadow = textStyle.shadow
    ? `${textStyle.shadowX}px ${textStyle.shadowY}px ${textStyle.shadowBlur}px rgba(${shadowRgb}, ${textStyle.shadowOpacity})`
    : "none";
  const repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(media.repeat || "")) ? String(media.repeat) : "no-repeat";
  const mediaSrc = String(media.src || "").trim().replaceAll("\\", "/").replaceAll("\"", "\\\"");
  const baseEffects = buildPortalEffectStyleState(element, false, { mode: "layer", layerId: layer.id });
  const hoverEffects = buildPortalEffectStyleState(element, true, { mode: "layer", layerId: layer.id });
  const hasHoverEffectControls = portalElementHasHoverEffectControls(element, { mode: "layer", layerId: layer.id });
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

function preparePortalContentLayer(layer = {}, element = {}) {
  const type = String(layer.type || "");
  if (!["image", "video", "text", "html", "portalAvatar", "dataText"].includes(type)) return null;
  const media = {
    ...(layer.media ?? {}),
    type: type === "video" ? "video" : "image"
  };
  media.repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(media.repeat || "")) ? String(media.repeat) : "no-repeat";
  const mediaFit = ["contain", "cover", "fill", "none"].includes(media.fit) ? media.fit : "contain";
  const layout = normalizePortalContentLayerLayout(layer.layout);
  const textStyle = normalizePortalContentLayerTextStyle(layer.textStyle);
  const avatar = type === "portalAvatar" ? preparePortalAvatarElement(layer.media?.avatarId, layer.media?.src, { baked: true }) : null;
  return {
    ...layer,
    type,
    media,
    layout,
    textStyle,
    visible: layer.visible !== false,
    zIndex: Number.isFinite(Number(layer.zIndex)) ? Number(layer.zIndex) : 1,
    isText: type === "text",
    isDataText: type === "dataText",
    isImage: type === "image",
    isVideo: type === "video",
    isHtml: type === "html",
    isPortalAvatar: type === "portalAvatar",
    avatar,
    openActorSheetOnClick: Boolean(media.openActorSheetOnClick),
    canOpenActorSheetOnClick: Boolean(media.openActorSheetOnClick && avatar?.actorId),
    isMediaVideo: type === "video",
    hasMedia: Boolean(media.src),
    mediaFit,
    isRepeatedImage: type === "image" && media.repeat !== "no-repeat" && Boolean(media.src),
    layerStyle: buildPortalContentLayerStyle({ ...layer, layout, textStyle, media }, element),
    escapedText: escapeHtml(type === "dataText" ? renderPortalDataTextLayer({ ...layer, media }) : (layer.text || layer.name || "")),
    customHtml: sanitizePortalCustomHtml(layer.html || ""),
    scopedCss: scopePortalCustomCss(layer.css || "", layer.id)
  };
}

function getPortalEffectDefinitions() {
  return {
    shadow: {
      defaults: { color: "#000000", opacity: 0.28, blur: 16, x: 0, y: 12 }
    },
    glow: {
      defaults: { color: "#cfe8ff", opacity: 0.55, blur: 18, spread: 0 }
    },
    blur: {
      defaults: { amount: 2, backdrop: false }
    },
    glass: {
      defaults: { color: "#dceeff", opacity: 0.22, blur: 10, saturation: 1.25, shine: 0.28 }
    },
    scanlines: {
      defaults: { color: "#ffffff", opacity: 0.18, spacing: 7, thickness: 1, speed: 0 }
    },
    chroma: {
      defaults: { amount: 2, opacity: 0.55 }
    },
    rotate: {
      defaults: { angle: 0 }
    },
    tilt: {
      defaults: { x: 0, y: 0, perspective: 700 }
    },
    pulse: {
      defaults: { scale: 1.04, opacity: 0.82, duration: 1.8 }
    },
    float: {
      defaults: { distance: 5, rotation: 1.2, duration: 3.6 }
    },
    perspectiveHover: {
      defaults: { x: 8, y: -8, perspective: 800, scale: 1.03 },
      hover: true
    },
    sound: {
      defaults: { src: "", volume: 0.7 }
    }
  };
}

function createPortalEffect(type = "glow", overrides = {}) {
  const definitions = getPortalEffectDefinitions();
  const effectType = definitions[type] ? type : "glow";
  return {
    id: overrides.id || effectType,
    type: effectType,
    enabled: overrides.enabled !== false,
    expanded: overrides.expanded !== false,
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

function normalizePortalEffects(element = {}) {
  const definitions = getPortalEffectDefinitions();
  const sourceEffects = Array.isArray(element.effects) ? element.effects : [];
  const firstContentLayerId = getFirstVisiblePortalContentLayerId(element);
  const normalized = sourceEffects
    .filter((effect) => definitions[String(effect?.type || "")])
    .map((effect) => {
      const shouldPreferContentLayer = firstContentLayerId && effect?.targetLocked !== true;
      const targetDefaults = shouldPreferContentLayer
        ? {
            targetMode: "layer",
            targetLayerId: effect?.targetMode === "layer" && effect?.targetLayerId
              ? String(effect.targetLayerId)
              : firstContentLayerId
          }
        : {};
      return createPortalEffect(String(effect.type), { ...effect, ...targetDefaults });
    });

  if (!normalized.length && element.style?.shadow) {
    const targetDefaults = firstContentLayerId
      ? { targetMode: "layer", targetLayerId: firstContentLayerId }
      : {};
    normalized.push(createPortalEffect("shadow", {
      id: "legacy-shadow",
      enabled: true,
      expanded: false,
      ...targetDefaults,
      settings: { color: "#000000", opacity: 0.28, blur: 16, x: 0, y: 12 }
    }));
  }

  return normalized.map((effect) => {
    const definition = definitions[effect.type] ?? definitions.glow;
    const settings = {
      ...definition.defaults,
      ...(effect.settings ?? {})
    };
    if ("color" in settings) {
      settings.color = normalizePortalColor(settings.color, definition.defaults.color || "#ffffff");
    }
    return { ...effect, settings };
  });
}

function buildPortalEffectStyleState(element = {}, includeHoverEffects = false, target = {}) {
  const targetMode = target.mode === "layer" ? "layer" : "object";
  const targetLayerId = String(target.layerId || "").trim();
  const effects = normalizePortalEffects(element).filter((effect) => effect.enabled !== false);
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
    transitionDuration = Math.max(transitionDuration, clampPortalNumber(effect.transition?.duration, 0.01, 5, 0.22));
    transitionEasing = String(effect.transition?.easing || transitionEasing);
  }

  for (const effect of activeEffects) {
    const settings = effect.settings ?? {};
    if (effect.type === "shadow" || effect.type === "glow") {
      const color = hexToRgbString(settings.color || (effect.type === "glow" ? "#cfe8ff" : "#000000"), effect.type === "glow" ? "207, 232, 255" : "0, 0, 0");
      const opacity = clampPortalNumber(settings.opacity, 0, 1, effect.type === "glow" ? 0.55 : 0.28);
      const blur = clampPortalNumber(settings.blur, 0, 80, effect.type === "glow" ? 18 : 16);
      if (targetMode === "layer") {
        const offsetX = effect.type === "glow" ? 0 : clampPortalNumber(settings.x, -80, 80, 0);
        const offsetY = effect.type === "glow" ? 0 : clampPortalNumber(settings.y, -80, 80, 12);
        filters.push(`drop-shadow(${offsetX}px ${offsetY}px ${blur}px rgba(${color}, ${opacity}))`);
      } else if (effect.type === "glow") {
        const spread = clampPortalNumber(settings.spread, -20, 40, 0);
        boxShadows.push(`0 0 ${blur}px ${spread}px rgba(${color}, ${opacity})`);
      } else {
        const offsetX = clampPortalNumber(settings.x, -80, 80, 0);
        const offsetY = clampPortalNumber(settings.y, -80, 80, 12);
        boxShadows.push(`${offsetX}px ${offsetY}px ${blur}px rgba(${color}, ${opacity})`);
      }
    }
    if (effect.type === "blur") {
      const amount = clampPortalNumber(settings.amount, 0, 30, 2);
      if (settings.backdrop) backdrops.push(`blur(${amount}px)`);
      else filters.push(`blur(${amount}px)`);
    }
    if (effect.type === "glass") {
      const amount = clampPortalNumber(settings.blur, 0, 30, 10);
      const saturation = clampPortalNumber(settings.saturation, 0.2, 3, 1.25);
      backdrops.push(`blur(${amount}px) saturate(${saturation})`);
      glassOpacity = Math.max(glassOpacity, clampPortalNumber(settings.opacity, 0, 1, 0.22));
      glassColor = hexToRgbString(settings.color, "220, 238, 255");
    }
    if (effect.type === "scanlines") {
      scanlineOpacity = Math.max(scanlineOpacity, clampPortalNumber(settings.opacity, 0, 1, 0.18));
      scanlineColor = hexToRgbString(settings.color, "255, 255, 255");
      scanlineSpacing = clampPortalNumber(settings.spacing, 2, 40, 7);
      scanlineThickness = clampPortalNumber(settings.thickness, 1, 12, 1);
      scanlineDuration = clampPortalNumber(settings.speed, 0, 12, 0);
    }
    if (effect.type === "chroma") {
      const amount = clampPortalNumber(settings.amount, 0, 20, 2);
      const opacity = clampPortalNumber(settings.opacity, 0, 1, 0.55);
      filters.push(`drop-shadow(${amount}px 0 0 rgba(255, 36, 92, ${opacity})) drop-shadow(${-amount}px 0 0 rgba(0, 232, 255, ${opacity}))`);
    }
    if (effect.type === "rotate") transforms.push(`rotate(${clampPortalNumber(settings.angle, -360, 360, 0)}deg)`);
    if (effect.type === "tilt") {
      const perspective = clampPortalNumber(settings.perspective, 250, 1600, 700);
      const tiltX = clampPortalNumber(settings.x, -75, 75, 0);
      const tiltY = clampPortalNumber(settings.y, -75, 75, 0);
      transforms.push(`perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`);
    }
    if (effect.type === "perspectiveHover") {
      const perspective = clampPortalNumber(settings.perspective, 250, 1800, 800);
      const tiltX = clampPortalNumber(settings.x, -75, 75, 8);
      const tiltY = clampPortalNumber(settings.y, -75, 75, -8);
      const scale = clampPortalNumber(settings.scale, 0.5, 2, 1.03);
      transforms.push(`perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${scale})`);
    }
    if (effect.type === "pulse") {
      pulseScale = clampPortalNumber(settings.scale, 0.7, 1.6, 1.04);
      pulseOpacity = clampPortalNumber(settings.opacity, 0, 1, 0.82);
      animation = `tom-portal-effect-pulse ${clampPortalNumber(settings.duration, 0.2, 12, 1.8)}s ease-in-out infinite`;
      transforms.push("scale(var(--tom-portal-pulse-scale-current, 1))");
    }
    if (effect.type === "float") {
      floatDistance = clampPortalNumber(settings.distance, 0, 40, 5);
      floatRotation = clampPortalNumber(settings.rotation, -12, 12, 1.2);
      animation = `tom-portal-effect-float ${clampPortalNumber(settings.duration, 0.4, 20, 3.6)}s ease-in-out infinite`;
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

function portalElementHasHoverEffectControls(element = {}, target = {}) {
  const targetMode = target.mode === "layer" ? "layer" : "object";
  const targetLayerId = String(target.layerId || "").trim();
  return normalizePortalEffects(element)
    .filter((effect) => {
      const effectTargetMode = effect.targetMode === "layer" ? "layer" : "object";
      if (targetMode === "object") return effectTargetMode !== "layer";
      return effectTargetMode === "layer" && String(effect.targetLayerId || "") === targetLayerId;
    })
    .some((effect) => effect.enabled !== false && (effect.hover || effect.disableOnHover));
}

function portalCropOffsetToPercent(value) {
  const offset = Math.max(-160, Math.min(160, Number(value) || 0));
  return `${((offset / 220) * 100).toFixed(3)}%`;
}

function buildPortalAvatarThumbnailStyle(avatar = {}) {
  return [
    `--tom-avatar-thumb-crop-scale:${Math.max(0.7, Math.min(3, Number(avatar.circularCropScale ?? 1) || 1))}`,
    `--tom-avatar-thumb-crop-offset-x:${portalCropOffsetToPercent(avatar.cropOffsetX)}`,
    `--tom-avatar-thumb-crop-offset-y:${portalCropOffsetToPercent(avatar.cropOffsetY)}`,
    `--tom-avatar-thumb-frame-fit-scale:${Math.max(0.6, Math.min(1.2, Number(avatar.frameFitScale ?? 1) || 1))}`
  ].join(";");
}

function getFirstPortalAvatarImagePath(values = []) {
  return values
    .flat()
    .map((path) => String(path || "").trim())
    .find(Boolean) || "";
}

function getPortalAvatarMoodImageFallback(avatar = {}) {
  return Object.values(avatar?.moodImages ?? {})
    .map((path) => String(path || "").trim())
    .find(Boolean) || "";
}

function getPortalAvatarPrimaryImage(avatar = {}, actor = null, mood = "", fallbackImage = "") {
  return getFirstPortalAvatarImagePath([
    avatar?.moodImages?.[mood],
    avatar?.defaultImage,
    avatar?.image,
    avatar?.thumbnail,
    avatar?.img,
    avatar?.imagePath,
    avatar?.texture?.src,
    avatar?.prototypeToken?.texture?.src,
    getPortalAvatarMoodImageFallback(avatar),
    actor?.img,
    fallbackImage
  ]);
}

function getPortalAvatarLibraryThumbnail(avatar = {}, actor = null, fallbackImage = "") {
  return getFirstPortalAvatarImagePath([
    avatar?.defaultImage,
    avatar?.image,
    avatar?.thumbnail,
    avatar?.img,
    avatar?.imagePath,
    avatar?.texture?.src,
    avatar?.prototypeToken?.texture?.src,
    actor?.img,
    getPortalAvatarMoodImageFallback(avatar),
    fallbackImage
  ]);
}

function buildPortalAvatarImageStackStyle(imagePath = "") {
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

function preparePortalAvatarElement(avatarId, fallbackImage = "", { baked = false } = {}) {
  const avatar = TheatreStore.getAvatarById(avatarId);
  if (!avatar) return null;
  const actor = avatar.actorId ? game.actors?.get?.(avatar.actorId) : null;
  const bakedImage = String(avatar.tokenImage || "").trim();
  const useBakedImage = Boolean(baked && bakedImage);
  const thumbnail = useBakedImage ? bakedImage : getPortalAvatarLibraryThumbnail(avatar, actor, fallbackImage);
  return {
    id: avatar.id,
    name: avatar.name || actor?.name || tr("Avatar"),
    thumbnail,
    image: thumbnail,
    frameImage: useBakedImage ? "" : avatar.frameImage || "",
    actorId: avatar.actorId || "",
    useCircularCrop: useBakedImage ? false : Boolean(avatar.useCircularCrop),
    showBackdrop: useBakedImage ? false : avatar.showBackdrop !== false,
    thumbnailStyle: useBakedImage ? "" : buildPortalAvatarThumbnailStyle(avatar),
    imageStackStyle: useBakedImage ? "" : buildPortalAvatarImageStackStyle(thumbnail),
    isBaked: useBakedImage,
    hasImage: Boolean(thumbnail),
    hasAvatarThumbnail: Boolean(thumbnail)
  };
}

export class TheatrePortalApplication extends Application {
  constructor(options = {}) {
    super(options);
    this.portalId = options.portalId ?? TheatreStore.getActivePortal()?.id ?? null;
    this._portalSurfaceResizeObserver = null;
    this._onPortalSurfaceWindowResize = null;
    this._portalAutoplayAudio = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-portal`,
      title: tr("Portal"),
      classes: [MODULE_ID, "theatre-portal-app", "footlights-themed-window"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-portal.hbs`,
      width: 960,
      height: 640,
      resizable: true
    });
  }

  async getData() {
    const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
    return {
      themeInlineStyle: buildThemeInlineStyle(TheatreStore.getThemeState()),
      hasPortal: Boolean(portal),
      portal: portal ? this._preparePortalData(portal) : null,
      canOpenStage: Boolean(portal && (game.user?.isGM || portal.settings?.allowPlayerFullscreenToggle))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    html.find("[data-action='open-portal-stage']").on("click", this._onOpenStage.bind(this));
    html.find("[data-portal-element-id]").on("click", this._onElementClick.bind(this));
    html.find("[data-portal-element-id]").on("mouseenter focusin", this._onElementHover.bind(this));
    this._activatePortalHoverMediaState(html?.[0]);
    this._activatePortalSurfaceSizing(html?.[0]);
    this._startPortalAutoplay();
  }

  _activatePortalHoverMediaState(root) {
    root?.querySelectorAll?.(".tom-portal-element.has-hover-media").forEach((element) => {
      const hoverMedia = element.querySelector(".tom-portal-element__media--hover");
      if (!hoverMedia) return;
      const markReady = () => element.classList.add("is-hover-media-ready");
      const markUnavailable = () => element.classList.remove("is-hover-media-ready");
      const tag = String(hoverMedia.tagName || "").toLowerCase();
      if (tag === "img") {
        if (hoverMedia.complete && hoverMedia.naturalWidth > 0) markReady();
        else if (hoverMedia.complete) markUnavailable();
        hoverMedia.addEventListener("load", markReady, { once: true });
        hoverMedia.addEventListener("error", markUnavailable, { once: true });
        return;
      }
      if (tag === "video") {
        if (hoverMedia.readyState >= 2) markReady();
        hoverMedia.addEventListener("loadeddata", markReady, { once: true });
        hoverMedia.addEventListener("error", markUnavailable, { once: true });
      }
    });
  }

  async close(options) {
    this._stopPortalAutoplay();
    this._portalSurfaceResizeObserver?.disconnect?.();
    this._portalSurfaceResizeObserver = null;
    if (this._onPortalSurfaceWindowResize) {
      window.removeEventListener("resize", this._onPortalSurfaceWindowResize);
      this._onPortalSurfaceWindowResize = null;
    }
    return super.close(options);
  }

  _activatePortalSurfaceSizing(root) {
    this._portalSurfaceResizeObserver?.disconnect?.();
    this._portalSurfaceResizeObserver = null;
    if (this._onPortalSurfaceWindowResize) {
      window.removeEventListener("resize", this._onPortalSurfaceWindowResize);
      this._onPortalSurfaceWindowResize = null;
    }
    const stage = root?.querySelector?.(".tom-portal__stage");
    const surface = root?.querySelector?.("[data-portal-surface]");
    if (!stage || !surface) return;
    const update = () => this._updatePortalSurfaceSize(stage, surface);
    const scheduleUpdate = () => window.requestAnimationFrame(update);
    const media = surface.querySelector(".tom-portal__background-probe, .tom-portal__background-media");
    if (media) {
      media.addEventListener("load", scheduleUpdate, { once: true });
      media.addEventListener("loadedmetadata", scheduleUpdate, { once: true });
      media.addEventListener("loadeddata", scheduleUpdate, { once: true });
      if ((media instanceof HTMLImageElement && media.complete) || Number(media.readyState) >= 1) {
        scheduleUpdate();
      }
      if (media instanceof HTMLImageElement && typeof media.decode === "function") {
        media.decode().then(scheduleUpdate).catch(() => {});
      }
    }
    if ("ResizeObserver" in window) {
      this._portalSurfaceResizeObserver = new ResizeObserver(update);
      this._portalSurfaceResizeObserver.observe(stage);
    } else {
      this._onPortalSurfaceWindowResize = update;
      window.addEventListener("resize", this._onPortalSurfaceWindowResize, { passive: true });
    }
    requestAnimationFrame(update);
    window.setTimeout(update, 60);
    window.setTimeout(update, 240);
  }

  _getPortalSurfaceAspect(surface) {
    const overrideAspect = Number(surface?.dataset?.portalSurfaceAspect || 0);
    if (Number.isFinite(overrideAspect) && overrideAspect > 0) return overrideAspect;
    return this._getPortalBackgroundMediaAspect(surface) || 16 / 9;
  }

  _getPortalBackgroundMediaAspect(surface) {
    const media = surface?.querySelector?.(".tom-portal__background-probe, .tom-portal__background-media");
    const width = Number(media?.naturalWidth || media?.videoWidth || 0);
    const height = Number(media?.naturalHeight || media?.videoHeight || 0);
    return width > 0 && height > 0 ? width / height : null;
  }

  _updatePortalBackgroundOverrideSizing(surface, surfaceAspect) {
    const isOverride = surface?.dataset?.portalSurfaceOverride === "true";
    const fit = normalizePortalBackgroundFit(surface?.dataset?.portalBackgroundFit);
    if (!isOverride || fit !== "contain") {
      surface.style.removeProperty("--tom-portal-background-width-ratio");
      surface.style.removeProperty("--tom-portal-background-height-ratio");
      return;
    }
    const storedWidthRatio = Number(surface?.dataset?.portalBackgroundCropWidthRatio);
    const storedHeightRatio = Number(surface?.dataset?.portalBackgroundCropHeightRatio);
    if (Number.isFinite(storedWidthRatio) && storedWidthRatio > 0 && Number.isFinite(storedHeightRatio) && storedHeightRatio > 0) {
      surface.style.setProperty("--tom-portal-background-width-ratio", String(Math.max(0.05, Math.min(20, storedWidthRatio))));
      surface.style.setProperty("--tom-portal-background-height-ratio", String(Math.max(0.05, Math.min(20, storedHeightRatio))));
      surface.style.setProperty("--tom-portal-background-offset-x", `${Math.max(-200, Math.min(200, Number(surface?.dataset?.portalBackgroundCropOffsetX) || 0))}%`);
      surface.style.setProperty("--tom-portal-background-offset-y", `${Math.max(-200, Math.min(200, Number(surface?.dataset?.portalBackgroundCropOffsetY) || 0))}%`);
      return;
    }
    const mediaAspect = this._getPortalBackgroundMediaAspect(surface);
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

  _updatePortalSurfaceSize(stage, surface) {
    const stageRect = stage.getBoundingClientRect();
    const aspect = this._getPortalSurfaceAspect(surface);
    if (!stageRect.width || !stageRect.height || !Number.isFinite(aspect) || aspect <= 0) return;
    const stageAspect = stageRect.width / stageRect.height;
    const fullscreenFitMode = String(surface?.dataset?.portalFullscreenFit || "none");
    const width = fullscreenFitMode === "height"
      ? stageRect.height * aspect
      : (fullscreenFitMode === "width"
        ? stageRect.width
        : (stageAspect > aspect ? stageRect.height * aspect : stageRect.width));
    const height = fullscreenFitMode === "height"
      ? stageRect.height
      : (fullscreenFitMode === "width"
        ? stageRect.width / aspect
        : (stageAspect > aspect ? stageRect.height : stageRect.width / aspect));
    surface.style.setProperty("--tom-portal-surface-aspect", String(aspect));
    surface.style.width = `${Math.max(1, width)}px`;
    surface.style.height = `${Math.max(1, height)}px`;
    this._updatePortalBackgroundOverrideSizing(surface, aspect);
  }

  _onOpenStage(event) {
    event.preventDefault();
    const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
    if (!portal || (!game.user?.isGM && !portal.settings?.allowPlayerFullscreenToggle)) return;
    game.modules.get(MODULE_ID)?.api?.openPortalStage?.(portal.id);
  }

  _preparePortalData(portal) {
    const backdropImage = String(portal.settings?.fullscreenBackdropImage || "").trim();
    const backgroundLayout = getPortalBackgroundLayout(portal.settings);
    return {
      ...portal,
      isVideoBackground: portal.backgroundType === "video",
      isBackgroundRepeated: portal.backgroundType !== "video" && backgroundLayout.repeat !== "no-repeat",
      surfaceAspect: getPortalSurfaceAspectOverride(portal),
      backgroundMediaStyle: buildPortalBackgroundMediaStyle(portal),
      isFullscreenRounded: Boolean(portal.settings?.fullscreenRoundedBorders),
      fullscreenFitMode: ["height", "width"].includes(String(portal.settings?.fullscreenFitMode || "")) ? String(portal.settings.fullscreenFitMode) : "none",
      isFullscreenBlur: portal.settings?.fullscreenBackdropMode === "blur",
      isFullscreenImage: portal.settings?.fullscreenBackdropMode === "image" && Boolean(backdropImage),
      fullscreenBackdropStyle: [
        `--tom-portal-stage-backdrop:${portal.settings?.fullscreenBackdropColor || "#050910"}`,
        `--tom-portal-stage-blur:${Math.max(0, Math.min(40, Number(portal.settings?.fullscreenBackdropBlur) || 0))}px`,
        `--tom-portal-stage-radius:${Math.max(0, Math.min(80, Number(portal.settings?.fullscreenBorderRadius) || 12))}px`
      ].join(";"),
      fullscreenBackdropMediaStyle: backdropImage ? [
        `background-image:url("${backdropImage.replaceAll("\\", "/").replaceAll("\"", "\\\"")}")`,
        "background-position:center center",
        "background-repeat:no-repeat",
        "background-size:cover"
      ].join(";") : "",
      avatars: this._preparePortalAvatars(portal),
      elements: (portal.elements ?? [])
        .filter((element) => element.visible !== false && (game.user?.isGM || element.visibleToPlayers !== false))
        .map((element) => this._prepareElementData(element))
    };
  }

  _prepareElementData(element) {
    const media = element.media ?? {};
    const style = element.style ?? {};
    const avatar = media.avatarId ? this._preparePortalAvatarElement(media.avatarId, media.src) : null;
    const baseEffects = buildPortalEffectStyleState(element, false, { mode: "object" });
    const hoverEffects = buildPortalEffectStyleState(element, true, { mode: "object" });
    const hasHoverEffectControls = portalElementHasHoverEffectControls(element, { mode: "object" });
    const hoverFallback = (value, fallback) => value || (hasHoverEffectControls ? "none" : fallback);
    const hoverNumberFallback = (value, fallback) => hasHoverEffectControls ? value : fallback;
    const shapeType = String(style.shapeType || "rounded");
    const clipPath = shapeType === "diamond"
      ? "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"
      : (shapeType === "triangle" ? "polygon(50% 0, 100% 100%, 0 100%)" : "none");
    const backgroundColor = style.backgroundColor || "#14202a";
    const textColor = style.textColor || "#ffffff";
    const borderWidth = Math.max(0, Number(style.borderWidth) || 0);
    const radius = Math.min(6, Math.max(0, Number(style.borderRadius) || 0));
    const hasBackdropBlur = baseEffects.backdrops.length > 0 || hoverEffects.backdrops.length > 0;
    const isMediaElement = ["image", "video"].includes(String(element.type || ""));
    const mediaSrc = String(media.src || "").trim();
    const hoverMediaSrc = String(media.hoverSrc || "").trim();
    const hasHoverMediaSwap = Boolean(hoverMediaSrc && hoverMediaSrc !== mediaSrc);
    const contentLayers = normalizePortalContentLayers(element);
    const elementBackground = avatar || (isMediaElement && hasBackdropBlur)
      ? "rgba(255, 255, 255, 0.001)"
      : `rgba(${hexToRgbString(backgroundColor)}, ${Math.max(0, Math.min(1, Number(style.backgroundOpacity ?? style.opacity ?? 1)))})`;
    const visualRadius = shapeType === "circle"
      ? "999px"
      : (shapeType === "rectangle" || shapeType === "diamond" || shapeType === "triangle" ? "0" : `${radius + borderWidth}px`);
    return {
      ...element,
      isImage: element.type === "image",
      isVideo: element.type === "video",
      isText: element.type === "text",
      isShape: element.type === "shape",
      isPortalAvatar: Boolean(avatar),
      hasClickInteraction: portalElementHasClickInteraction(element),
      contentLayers,
      avatar,
      hasMedia: Boolean(media.src),
      isMediaVideo: media.type === "video",
      escapedText: escapeHtml(element.text || element.name || ""),
      visible: element.visible !== false,
      elementStyle: [
        `left:${clampPortalElementPosition(element.x, 0)}%`,
        `top:${clampPortalElementPosition(element.y, 0)}%`,
        `width:${clampPortalElementSize(element.width, 8)}%`,
        `height:${clampPortalElementSize(element.height, 8)}%`,
        `z-index:${Number(element.zIndex) || 1}`,
        `opacity:${Math.max(0, Math.min(1, Number(style.opacity ?? 1)))}`
      ].filter(Boolean).join(";"),
      visualStyle: [
        `color:rgba(${hexToRgbString(textColor, "255, 255, 255")}, ${Math.max(0, Math.min(1, Number(style.textOpacity ?? 1)))})`,
        "background:transparent",
        `--tom-portal-element-bg:${elementBackground}`,
        avatar ? "border:0" : `border:${borderWidth}px solid ${style.borderColor || "transparent"}`,
        avatar ? "border-radius:0" : `border-radius:${visualRadius}`,
        avatar ? "clip-path:none" : `clip-path:${clipPath}`,
        `--tom-portal-shadow:${baseEffects.boxShadows.length && !avatar ? baseEffects.boxShadows.join(", ") : "none"}`,
        `--tom-portal-hover-shadow:${hoverEffects.boxShadows.length && !avatar ? hoverEffects.boxShadows.join(", ") : (hasHoverEffectControls ? "none" : "var(--tom-portal-shadow)")}`,
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
      ].filter(Boolean).join(";"),
      hoverVars: "",
      mediaFit: ["contain", "cover", "fill", "none"].includes(media.fit) ? media.fit : "contain",
      hasHoverMedia: Boolean(hoverMediaSrc),
      hasHoverMediaSwap,
      isHoverVideo: media.hoverType === "video",
      media
    };
  }

  _preparePortalAvatarElement(avatarId, fallbackImage = "") {
    return preparePortalAvatarElement(avatarId, fallbackImage);
  }

  _preparePortalAvatars(portal) {
    const avatarIds = Array.isArray(portal?.settings?.portalAvatarIds)
      ? portal.settings.portalAvatarIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!avatarIds.length) return [];
    return avatarIds.map((avatarId) => {
      const avatar = TheatreStore.getAvatarById(avatarId);
      if (!avatar) return null;
      const actor = avatar.actorId ? game.actors?.get?.(avatar.actorId) : null;
      const image = getPortalAvatarLibraryThumbnail(avatar, actor);
      return {
        id: avatar.id,
        name: avatar.name || actor?.name || tr("Avatar"),
        image,
        frameImage: avatar.frameImage || ""
      };
    }).filter(Boolean);
  }

  _resolveSoundEntry(entry = {}, playlistName = "", index = 0) {
    if (!entry || typeof entry !== "object") return null;
    if (entry.sourceType === "playlistSound") {
      const playlist = game.playlists?.get?.(entry.playlistId) ?? null;
      const sound = playlist?.sounds?.get?.(entry.soundId) ?? null;
      const src = String(sound?.path || "").trim();
      if (!src) return null;
      return { src, label: String(entry.label || sound?.name || playlistName || tr("Sound")).trim() };
    }
    const src = String(entry.path || "").trim();
    if (!src) return null;
    return { src, label: String(entry.label || playlistName || src.split("/").pop() || tr("Sound")).trim(), index };
  }

  _getAmbientVolume() {
    for (const key of ["globalAmbientVolume", "ambientVolume"]) {
      try {
        const value = game.settings?.get?.("core", key);
        if (Number.isFinite(Number(value))) return Math.max(0, Math.min(1, Number(value)));
      } catch (_error) {
        // Some Foundry installs may not expose both candidate keys.
      }
    }
    return 0.7;
  }

  async _startPortalAutoplay() {
    this._stopPortalAutoplay();
    const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
    if (!portal?.settings?.autoplayPlaylist) return;
    const playlist = TheatreStore.getSoundPlaylistById(portal.settings.autoplayPlaylistId);
    const tracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
    const track = tracks.map((entry, index) => this._resolveSoundEntry(entry, playlist?.name || "", index)).find(Boolean);
    if (!track?.src) return;
    try {
      if (typeof globalThis.AudioHelper?.play !== "function") throw new Error("AudioHelper unavailable");
      const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
      const audio = await globalThis.AudioHelper.play({ src: track.src, volume: this._getAmbientVolume(), loop: portal?.settings?.autoplayPlaylistLoop !== false }, false);
      this._portalAutoplayAudio = audio ?? null;
    } catch (_error) {
      const audio = new Audio(track.src);
      const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
      audio.loop = portal?.settings?.autoplayPlaylistLoop !== false;
      audio.volume = this._getAmbientVolume();
      this._portalAutoplayAudio = audio;
      void audio.play().catch(() => {});
    }
  }

  _stopPortalAutoplay() {
    const audio = this._portalAutoplayAudio;
    this._portalAutoplayAudio = null;
    try {
      audio?.pause?.();
      if (audio && "currentTime" in audio) audio.currentTime = 0;
    } catch (_error) {
      // Best-effort cleanup for AudioHelper/native audio handles.
    }
  }

  async _onElementClick(event) {
    const elementId = String(event.currentTarget?.dataset?.portalElementId || "").trim();
    const portal = TheatreStore.getPortalById(this.portalId);
    const element = portal?.elements?.find((entry) => entry.id === elementId);
    if (!element || (!game.user?.isGM && element.clickableForPlayers === false)) return;
    const avatarLayerAction = event.target?.closest?.("[data-portal-avatar-layer-action='open-actor-sheet']");
    if (avatarLayerAction) {
      event.preventDefault();
      event.stopPropagation();
      const layerId = String(avatarLayerAction.dataset.portalContentLayerId || "").trim();
      const layer = Array.isArray(element.contentLayers)
        ? element.contentLayers.find((entry) => String(entry.id) === layerId)
        : null;
      if (!layer?.media?.openActorSheetOnClick) return;
      const avatar = TheatreStore.getAvatarById(layer.media.avatarId);
      const actor = avatar?.actorId ? game.actors?.get?.(avatar.actorId) : null;
      this._renderDocumentSheetAbovePortal(actor);
      return;
    }
    await this._playElementSound(element.clickSound);
    await this._playElementEffectSounds(element, false);
    await this._runElementAction(element.action);
  }

  async _onElementHover(event) {
    const elementId = String(event.currentTarget?.dataset?.portalElementId || "").trim();
    const portal = TheatreStore.getPortalById(this.portalId);
    const element = portal?.elements?.find((entry) => entry.id === elementId);
    if (!element || (!game.user?.isGM && element.clickableForPlayers === false)) return;
    await this._playElementSound(element.hoverSound);
    await this._playElementEffectSounds(element, true);
  }

  async _playElementEffectSounds(element = {}, hover = false) {
    const effects = normalizePortalEffects(element).filter((effect) => effect.enabled !== false && effect.type === "sound" && Boolean(effect.hover) === Boolean(hover));
    for (const effect of effects) {
      await this._playElementSound(effect.settings);
    }
  }

  async _playElementSound(sound = {}) {
    const src = String(sound?.src || "").trim();
    if (!src) return;
    await AudioHelper.play({ src, volume: Math.max(0, Math.min(1, Number(sound.volume ?? 0.7))), autoplay: true, loop: false }, false);
  }

  async _runElementAction(action = {}) {
    const type = String(action?.type || "none");
    if (type === "none") return;

    if (type === "scene" && action.documentId) {
      game.scenes?.get(action.documentId)?.activate?.();
      if (action.closeCurrentPortal) await this.close();
      return;
    }

    if (type === "scene" && action.documentUuid) {
      const document = await fromUuid(action.documentUuid);
      const scene = document?.documentName === "Scene" ? document : null;
      if (scene?.activate) scene.activate();
      else this._renderDocumentSheetAbovePortal(document);
      if (scene?.activate && action.closeCurrentPortal) await this.close();
      return;
    }

    if ((type === "actor" || type === "journal") && action.documentUuid) {
      const document = await fromUuid(action.documentUuid);
      this._renderDocumentSheetAbovePortal(document);
      return;
    }

    if (type === "theatreScene" && action.theatreSceneId) {
      await game.modules.get(MODULE_ID)?.api?.activateScene?.(action.theatreSceneId);
      if (action.closeCurrentPortal) await this.close();
      return;
    }

    if (type === "worldMap" && action.worldMapId) {
      const mode = normalizeOpenMode(action.openMode);
      if (mode === "stage") game.modules.get(MODULE_ID)?.api?.openWorldMapStage?.(action.worldMapId);
      else game.modules.get(MODULE_ID)?.api?.openWorldMap?.(action.worldMapId);
      if (action.closeCurrentPortal) await this.close();
      return;
    }

    if (type === "portal" && action.portalId) {
      const portalId = String(action.portalId || "").trim();
      if (!portalId) return;
      const mode = normalizeOpenMode(action.openMode);
      await TheatreStore.setActivePortal(portalId);
      const api = game.modules.get(MODULE_ID)?.api;
      const openedPortalApp = mode === "stage"
        ? api?.openPortalStage?.(portalId)
        : api?.openPortal?.(portalId);
      if (!openedPortalApp) {
        this.portalId = portalId;
        this.render(true);
        return;
      }
      if (action.closeCurrentPortal && openedPortalApp !== this) {
        await this.close();
      }
      return;
    }

    if (action.documentUuid) {
      const document = await fromUuid(action.documentUuid);
      this._renderDocumentSheetAbovePortal(document);
    }
  }

  _renderDocumentSheetAbovePortal(document) {
    const sheet = document?.sheet;
    if (!sheet?.render) return;
    sheet.render(true);
    window.setTimeout(() => {
      sheet.bringToTop?.();
      const element = sheet.element?.[0];
      if (element instanceof HTMLElement) {
        element.style.zIndex = String(Math.max(Number(element.style.zIndex) || 0, 1000));
      }
    }, 40);
  }
}

export class TheatrePortalStageApplication extends TheatrePortalApplication {
  constructor(options = {}) {
    super(options);
    this._stageLeftSidebarVisible = false;
    this._stageRightSidebarVisible = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-portal-stage`,
      title: tr("Portal Stage"),
      classes: [MODULE_ID, "theatre-overlay-app", "theatre-portal-stage-app"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-portal-stage.hbs`,
      popOut: false,
      minimizable: false,
      resizable: false,
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  async getData() {
    const data = await super.getData();
    return {
      ...data,
      isGM: Boolean(game.user?.isGM),
      isLeftSidebarVisible: Boolean(this._stageLeftSidebarVisible),
      isRightSidebarVisible: Boolean(this._stageRightSidebarVisible)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='close-portal-stage']").on("click", this._onCloseStage.bind(this));
    html.find("[data-action='force-portal-stage']").on("click", this._onForcePortalStage.bind(this));
    html.find("[data-action='close-player-portal-stage']").on("click", this._onClosePlayerPortalStage.bind(this));
    html.find("[data-action='toggle-portal-left-sidebar']").on("click", this._onTogglePortalLeftSidebar.bind(this));
    html.find("[data-action='toggle-portal-right-sidebar']").on("click", this._onTogglePortalRightSidebar.bind(this));
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
  }

  async close(options) {
    this._clearSharedFoundrySidebarInlineState();
    this._clearStageBodyState();
    return super.close(options);
  }

  _onCloseStage(event) {
    event.preventDefault();
    void this.close();
  }

  _onForcePortalStage(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const portal = TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal();
    if (!portal?.id) return;
    game.modules.get(MODULE_ID)?.api?.forcePortalStage?.(portal.id);
  }

  _onClosePlayerPortalStage(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    game.modules.get(MODULE_ID)?.api?.closePortalStageForPlayers?.();
  }

  _onTogglePortalLeftSidebar(event) {
    event.preventDefault();
    this._stageLeftSidebarVisible = !this._stageLeftSidebarVisible;
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
    window.requestAnimationFrame(() => this._activatePortalSurfaceSizing(this.element?.[0]));
  }

  _onTogglePortalRightSidebar(event) {
    event.preventDefault();
    this._stageRightSidebarVisible = !this._stageRightSidebarVisible;
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
    window.requestAnimationFrame(() => this._activatePortalSurfaceSizing(this.element?.[0]));
  }

  _getStagePortalSettings() {
    return (TheatreStore.getPortalById(this.portalId) ?? TheatreStore.getActivePortal())?.settings ?? {};
  }

  _applyStageBodyState() {
    const body = document.body;
    if (!body) return;
    const settings = this._getStagePortalSettings();
    const hideUi = settings.hideFoundryUiInFullscreen !== false;
    body.classList.add("tom-overlay-active", "tom-portal-stage-active");
    body.classList.toggle("tom-ui-hidden", hideUi);
    body.classList.toggle("tom-shared-left-sidebar-open", Boolean(this._stageLeftSidebarVisible));
    body.classList.toggle("tom-shared-right-sidebar-open", Boolean(this._stageRightSidebarVisible));
    this._syncSharedFoundrySidebarState();
  }

  _clearStageBodyState() {
    const body = document.body;
    if (!body) return;
    body.classList.remove(
      "tom-overlay-active",
      "tom-ui-hidden",
      "tom-shared-left-sidebar-open",
      "tom-shared-right-sidebar-open",
      "tom-portal-stage-active"
    );
  }

  _updateStageSidebarButtons() {
    const root = this.element?.[0];
    if (!root) return;
    const leftButton = root.querySelector("[data-action='toggle-portal-left-sidebar']");
    const leftIcon = leftButton?.querySelector("i");
    if (leftIcon) {
      leftIcon.classList.toggle("fa-chevron-left", Boolean(this._stageLeftSidebarVisible));
      leftIcon.classList.toggle("fa-chevron-right", !this._stageLeftSidebarVisible);
    }
    if (leftButton) {
      const label = this._stageLeftSidebarVisible ? tr("Hide left sidebar") : tr("Show left sidebar");
      leftButton.setAttribute("title", label);
      leftButton.setAttribute("aria-label", label);
    }

    const rightButton = root.querySelector("[data-action='toggle-portal-right-sidebar']");
    const rightIcon = rightButton?.querySelector("i");
    if (rightIcon) {
      rightIcon.classList.toggle("fa-chevron-right", Boolean(this._stageRightSidebarVisible));
      rightIcon.classList.toggle("fa-chevron-left", !this._stageRightSidebarVisible);
    }
    if (rightButton) {
      const label = this._stageRightSidebarVisible ? tr("Hide right sidebar") : tr("Show right sidebar");
      rightButton.setAttribute("title", label);
      rightButton.setAttribute("aria-label", label);
    }
  }

  _syncSharedFoundrySidebarState() {
    const doc = this.element?.[0]?.ownerDocument ?? document;
    const showRightSidebar = Boolean(this._stageRightSidebarVisible);
    const showLeftSidebar = Boolean(this._stageLeftSidebarVisible);
    const rightTargets = [
      doc.querySelector("#ui-right"),
      doc.querySelector("#sidebar"),
      doc.querySelector("#sidebar-tabs"),
      doc.querySelector("#sidebar-content"),
      ...Array.from(doc.querySelectorAll(".sidebar-tab.active"))
    ].filter(Boolean);
    const leftTargets = [
      doc.querySelector("#ui-left"),
      doc.querySelector("#navigation"),
      doc.querySelector("#controls"),
      doc.querySelector("#players")
    ].filter(Boolean);

    for (const element of [...rightTargets, ...leftTargets]) {
      if (!(element instanceof HTMLElement)) continue;
      const shouldShow = rightTargets.includes(element) ? showRightSidebar : showLeftSidebar;
      if (shouldShow) {
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("pointer-events", "auto", "important");
        element.style.setProperty("transform", "translateX(0)", "important");
      } else {
        element.style.removeProperty("visibility");
        element.style.removeProperty("opacity");
        element.style.removeProperty("pointer-events");
        element.style.removeProperty("transform");
      }
    }
  }

  _clearSharedFoundrySidebarInlineState() {
    const doc = this.element?.[0]?.ownerDocument ?? document;
    const targets = [
      doc.querySelector("#ui-right"),
      doc.querySelector("#sidebar"),
      doc.querySelector("#sidebar-tabs"),
      doc.querySelector("#sidebar-content"),
      doc.querySelector("#ui-left"),
      doc.querySelector("#navigation"),
      doc.querySelector("#controls"),
      doc.querySelector("#players"),
      ...Array.from(doc.querySelectorAll(".sidebar-tab.active"))
    ].filter(Boolean);

    for (const element of targets) {
      if (!(element instanceof HTMLElement)) continue;
      element.style.removeProperty("visibility");
      element.style.removeProperty("opacity");
      element.style.removeProperty("pointer-events");
      element.style.removeProperty("transform");
    }
  }
}
