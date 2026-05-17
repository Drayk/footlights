import { translate as tr } from "../localization.js";
import { readLinkedDocumentDataFromDialog, readTravelTargetDataFromDialog } from "./markup-utils.js";
import { normalizeHexColor, normalizePinSize } from "./style-utils.js";

function readDialogValue(html, selector) {
  const nameMatch = String(selector || "").match(/\[name=['"]([^'"]+)['"]\]/);
  const fieldName = nameMatch?.[1] || "";
  if (fieldName) {
    const richContent = html?.find?.(`[data-world-map-rich-text-content='${fieldName}']`);
    if (Number(richContent?.length || 0) > 0) return richContent.html?.();
  }
  return html?.find?.(selector).val?.();
}

function readDialogNumber(html, selector, fallback) {
  const value = Number(readDialogValue(html, selector));
  return Number.isFinite(value) ? value : fallback;
}

function readDialogString(html, selector, fallback = "") {
  const value = readDialogValue(html, selector);
  return String(value ?? fallback ?? "").trim();
}

function readDialogChecked(html, selector) {
  const field = html?.find?.(selector);
  const inputType = String(field?.prop?.("type") || "").trim().toLowerCase();
  if (inputType === "hidden") {
    return ["1", "true", "on", "yes"].includes(String(field?.val?.() || "").trim().toLowerCase());
  }
  return Boolean(field?.prop?.("checked"));
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safeValue));
}

function numberOrFallback(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readClampedDialogNumber(html, selector, { min, max, fallback }) {
  return clampNumber(readDialogNumber(html, selector, fallback), min, max, fallback);
}

function readDialogColor(html, selector, fallback) {
  return normalizeHexColor(readDialogString(html, selector), fallback);
}

function readDialogLowerString(html, selector, fallback = "") {
  return readDialogString(html, selector, fallback).toLowerCase();
}

function readDialogCategory(html, selector, fallbackCategory) {
  return readDialogLowerString(html, selector, fallbackCategory) || fallbackCategory;
}

export function readObjectOverlayDataFromDialog(html, {
  type = "image",
  fallbackCategory = "general",
  initialData = {}
} = {}) {
  const rawOutlineMode = readDialogLowerString(html, "[name='overlayOutlineMode']");
  return {
    type,
    name: readDialogString(html, "[name='overlayName']"),
    category: readDialogCategory(html, "[name='overlayCategory']", fallbackCategory),
    description: readDialogString(html, "[name='overlayDescription']"),
    zIndex: readClampedDialogNumber(html, "[name='overlayZIndex']", { min: -100, max: 100, fallback: numberOrFallback(initialData.zIndex, 0) }),
    imagePath: readDialogString(html, "[name='overlayImagePath']"),
    width: readDialogNumber(html, "[name='overlayWidth']", numberOrFallback(initialData.width, 160)),
    height: readDialogNumber(html, "[name='overlayHeight']", numberOrFallback(initialData.height, 120)),
    radius: readDialogNumber(html, "[name='overlayRadius']", numberOrFallback(initialData.radius, 80)),
    cornerRadius: readClampedDialogNumber(html, "[name='overlayCornerRadius']", { min: 0, max: 512, fallback: numberOrFallback(initialData.cornerRadius, 0) }),
    fillColor: readDialogColor(html, "[name='overlayFillColor']", "#7ebaec"),
    fillOpacity: readClampedDialogNumber(html, "[name='overlayFillOpacity']", { min: 0, max: 1, fallback: numberOrFallback(initialData.fillOpacity, 0.28) }),
    fillStyle: readDialogLowerString(html, "[name='overlayFillStyle']", "solid"),
    fillPatternScale: readClampedDialogNumber(html, "[name='overlayFillPatternScale']", { min: 4, max: 64, fallback: numberOrFallback(initialData.fillPatternScale, 14) }),
    fillPatternSize: readClampedDialogNumber(html, "[name='overlayFillPatternSize']", { min: 1, max: 24, fallback: numberOrFallback(initialData.fillPatternSize, 2) }),
    strokeColor: readDialogColor(html, "[name='overlayStrokeColor']", "#d7e8ff"),
    strokeOpacity: readClampedDialogNumber(html, "[name='overlayStrokeOpacity']", { min: 0, max: 1, fallback: numberOrFallback(initialData.strokeOpacity, 0.95) }),
    strokeWidth: readClampedDialogNumber(html, "[name='overlayStrokeWidth']", { min: 0, max: 32, fallback: numberOrFallback(initialData.strokeWidth, 2) }),
    strokeStyle: readDialogLowerString(html, "[name='overlayStrokeStyle']", "solid"),
    text: readDialogString(html, "[name='overlayText']"),
    ...readLinkedDocumentDataFromDialog(html, "overlay"),
    ...readTravelTargetDataFromDialog(html, "overlay"),
    fontSize: readDialogNumber(html, "[name='overlayFontSize']", numberOrFallback(initialData.fontSize, 24)),
    lineHeight: readClampedDialogNumber(html, "[name='overlayLineHeight']", { min: 0.6, max: 2.4, fallback: numberOrFallback(initialData.lineHeight, 0.95) }),
    fontFamily: readDialogString(html, "[name='overlayFontFamily']"),
    color: readDialogColor(html, "[name='overlayColor']", "#f2f5f8"),
    outlineColor: readDialogColor(html, "[name='overlayOutlineColor']", "#101722"),
    outlineMode: ["outer", "center"].includes(rawOutlineMode) ? rawOutlineMode : "outer",
    outlineWidth: readClampedDialogNumber(html, "[name='overlayOutlineWidth']", { min: 0, max: 12, fallback: numberOrFallback(initialData.outlineWidth, 0) }),
    shadowColor: readDialogColor(html, "[name='overlayShadowColor']", "#000000"),
    shadowDistance: readClampedDialogNumber(html, "[name='overlayShadowDistance']", { min: 0, max: 64, fallback: numberOrFallback(initialData.shadowDistance, 2) }),
    shadowOpacity: readClampedDialogNumber(html, "[name='overlayShadowOpacity']", { min: 0, max: 1, fallback: numberOrFallback(initialData.shadowOpacity, 0.7) }),
    shadowBlur: readClampedDialogNumber(html, "[name='overlayShadowBlur']", { min: 0, max: 64, fallback: numberOrFallback(initialData.shadowBlur, 8) }),
    opacity: readClampedDialogNumber(html, "[name='overlayOpacity']", { min: 0, max: 1, fallback: numberOrFallback(initialData.opacity, 1) }),
    scaleWithZoom: readDialogChecked(html, "[name='overlayScaleWithZoom']"),
    movableForPlayers: readDialogChecked(html, "[name='overlayMovableForPlayers']"),
    visibleForPlayers: readDialogChecked(html, "[name='overlayVisibleForPlayers']")
  };
}

export function readRegionDataFromDialog(html, fallbackCategory = "general") {
  return {
    name: readDialogString(html, "[name='regionName']") || tr("Region"),
    category: readDialogCategory(html, "[name='regionCategory']", fallbackCategory),
    description: readDialogString(html, "[name='regionDescription']"),
    zIndex: readClampedDialogNumber(html, "[name='regionZIndex']", { min: -100, max: 100, fallback: 0 }),
    fillColor: readDialogColor(html, "[name='regionFillColor']", "#7ebaec"),
    strokeColor: readDialogColor(html, "[name='regionStrokeColor']", "#d7e8ff"),
    fillOpacity: readClampedDialogNumber(html, "[name='regionFillOpacity']", { min: 0, max: 1, fallback: 0.28 }),
    strokeOpacity: readClampedDialogNumber(html, "[name='regionStrokeOpacity']", { min: 0, max: 1, fallback: 0.95 }),
    strokeWidth: readClampedDialogNumber(html, "[name='regionStrokeWidth']", { min: 1, max: 12, fallback: 2 }),
    fillStyle: readDialogLowerString(html, "[name='regionFillStyle']", "solid"),
    fillPatternScale: readClampedDialogNumber(html, "[name='regionFillPatternScale']", { min: 4, max: 64, fallback: 14 }),
    fillPatternSize: readClampedDialogNumber(html, "[name='regionFillPatternSize']", { min: 1, max: 24, fallback: 2 }),
    strokeStyle: readDialogLowerString(html, "[name='regionStrokeStyle']", "solid"),
    visibleForPlayers: readDialogChecked(html, "[name='regionVisibleForPlayers']"),
    tooltipEnabled: readDialogChecked(html, "[name='regionTooltipEnabled']"),
    ...readLinkedDocumentDataFromDialog(html, "region"),
    ...readTravelTargetDataFromDialog(html, "region")
  };
}

export function readLineDataFromDialog(html, fallbackCategory = "location") {
  return {
    name: readDialogString(html, "[name='lineName']") || tr("Line"),
    category: readDialogCategory(html, "[name='lineCategory']", fallbackCategory),
    description: readDialogString(html, "[name='lineDescription']"),
    zIndex: readClampedDialogNumber(html, "[name='lineZIndex']", { min: -100, max: 100, fallback: 0 }),
    color: readDialogColor(html, "[name='lineColor']", "#d7e8ff"),
    opacity: readClampedDialogNumber(html, "[name='lineOpacity']", { min: 0, max: 1, fallback: 0.95 }),
    width: readClampedDialogNumber(html, "[name='lineWidth']", { min: 1, max: 32, fallback: 3 }),
    outlineColor: readDialogColor(html, "[name='lineOutlineColor']", "#101722"),
    outlineWidth: readClampedDialogNumber(html, "[name='lineOutlineWidth']", { min: 0, max: 32, fallback: 0 }),
    shadowColor: readDialogColor(html, "[name='lineShadowColor']", "#000000"),
    shadowOpacity: readClampedDialogNumber(html, "[name='lineShadowOpacity']", { min: 0, max: 1, fallback: 0.35 }),
    shadowBlur: readClampedDialogNumber(html, "[name='lineShadowBlur']", { min: 0, max: 48, fallback: 6 }),
    shadowDistance: readClampedDialogNumber(html, "[name='lineShadowDistance']", { min: 0, max: 64, fallback: 0 }),
    shadowDirection: readClampedDialogNumber(html, "[name='lineShadowDirection']", { min: 0, max: 359, fallback: 135 }),
    lineStyle: readDialogLowerString(html, "[name='lineStyle']", "solid"),
    lineCap: readDialogLowerString(html, "[name='lineCap']", "round"),
    pointStyle: readDialogLowerString(html, "[name='linePointStyle']", "none"),
    pointSize: readClampedDialogNumber(html, "[name='linePointSize']", { min: 2, max: 32, fallback: 7 }),
    pointColor: readDialogColor(html, "[name='linePointColor']", "#d7e8ff"),
    pointOpacity: readClampedDialogNumber(html, "[name='linePointOpacity']", { min: 0, max: 1, fallback: 0.95 }),
    pointOutlineColor: readDialogColor(html, "[name='linePointOutlineColor']", "#101722"),
    pointOutlineWidth: readClampedDialogNumber(html, "[name='linePointOutlineWidth']", { min: 0, max: 12, fallback: 1 }),
    movableForPlayers: readDialogChecked(html, "[name='lineMovableForPlayers']"),
    visibleForPlayers: readDialogChecked(html, "[name='lineVisibleForPlayers']"),
    tooltipEnabled: readDialogChecked(html, "[name='lineTooltipEnabled']"),
    ...readLinkedDocumentDataFromDialog(html, "line"),
    ...readTravelTargetDataFromDialog(html, "line")
  };
}

export function readPinDataFromDialog(html, initialData = {}) {
  return {
    label: readDialogString(html, "[name='pinLabel']") || initialData.label,
    note: readDialogString(html, "[name='pinNote']"),
    type: readDialogString(html, "[name='pinType']", "location"),
    zIndex: readClampedDialogNumber(html, "[name='pinZIndex']", { min: -100, max: 100, fallback: numberOrFallback(initialData.zIndex, 0) }),
    color: readDialogColor(html, "[name='pinColor']", "#7ebaec"),
    size: normalizePinSize(readDialogValue(html, "[name='pinSize']"), normalizePinSize(initialData.size)),
    borderColor: readDialogColor(html, "[name='pinBorderColor']", "#101722"),
    borderWidth: readClampedDialogNumber(html, "[name='pinBorderWidth']", { min: 0, max: 8, fallback: 0 }),
    shadowColor: readDialogColor(html, "[name='pinShadowColor']", "#000000"),
    shadowDistance: readClampedDialogNumber(html, "[name='pinShadowDistance']", { min: 0, max: 32, fallback: 0 }),
    shadowOpacity: readClampedDialogNumber(html, "[name='pinShadowOpacity']", { min: 0, max: 1, fallback: 0 }),
    shadowBlur: readClampedDialogNumber(html, "[name='pinShadowBlur']", { min: 0, max: 32, fallback: 0 }),
    movableForPlayers: readDialogChecked(html, "[name='pinMovableForPlayers']"),
    visibleForPlayers: readDialogChecked(html, "[name='pinVisibleForPlayers']"),
    tooltipEnabled: readDialogChecked(html, "[name='pinTooltipEnabled']"),
    ...readLinkedDocumentDataFromDialog(html, "pin"),
    ...readTravelTargetDataFromDialog(html, "pin")
  };
}
