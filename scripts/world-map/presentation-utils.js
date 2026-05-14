import { getLineDashArray, hexToRgba, normalizeHexColor, normalizePinSize } from "./style-utils.js";

export function buildPinShadowStyle(pin = {}) {
  const opacity = Number.isFinite(Number(pin?.shadowOpacity)) ? Math.max(0, Math.min(1, Number(pin.shadowOpacity))) : 0.55;
  const distance = Number.isFinite(Number(pin?.shadowDistance)) ? Math.max(0, Math.min(32, Number(pin.shadowDistance))) : 2;
  const blur = Number.isFinite(Number(pin?.shadowBlur)) ? Math.max(0, Math.min(32, Number(pin.shadowBlur))) : 4;
  if (opacity <= 0 || (distance <= 0 && blur <= 0)) return "";
  const color = normalizeHexColor(pin?.shadowColor, "#000000");
  return `filter:drop-shadow(${distance}px ${distance}px ${blur}px ${hexToRgba(color, opacity)});`;
}

export function buildPinIconPresentation(pin = {}, typeDefinition = {}) {
  const size = normalizePinSize(pin?.size);
  const borderWidth = Math.max(0, Math.min(8, Number(pin?.borderWidth) || 0));
  const borderColor = normalizeHexColor(pin?.borderColor, "#101722");
  return {
    color: normalizeHexColor(pin?.color, "#7ebaec"),
    iconClass: String(typeDefinition.iconClass || "fa-location-dot").trim() || "fa-location-dot",
    size,
    iconFontSize: (1.35 * size).toFixed(2),
    iconSize: Math.round(30 * size),
    iconAnchor: Math.round(15 * size),
    strokeStyle: borderWidth > 0
      ? ` -webkit-text-stroke:${borderWidth}px ${borderColor}; paint-order:stroke fill;`
      : "",
    shadowStyle: buildPinShadowStyle(pin)
  };
}

export function getLineBasePresentation(line = {}, colorFallback = "#9fd2ff", opacityFallback = 0.95) {
  const width = Number(line.width) || 3;
  const opacity = Number.isFinite(Number(line.opacity)) ? Math.max(0, Math.min(1, Number(line.opacity))) : opacityFallback;
  const lineCap = String(line.lineCap || "round").trim().toLowerCase();
  return {
    color: normalizeHexColor(line.color, colorFallback),
    width,
    opacity,
    lineCap,
    lineJoin: "round",
    dashArray: getLineDashArray(line.lineStyle, width)
  };
}

export function getLineOutlinePresentation(line = {}, base = getLineBasePresentation(line)) {
  const outlineWidth = Math.max(0, Number(line.outlineWidth) || 0);
  if (outlineWidth <= 0) return null;
  return {
    color: normalizeHexColor(line.outlineColor, "#101722"),
    weight: base.width + (outlineWidth * 2),
    opacity: base.opacity,
    lineCap: base.lineCap,
    lineJoin: base.lineJoin,
    dashArray: base.dashArray,
    interactive: false
  };
}

export function getLineShadowFilter(line = {}) {
  const shadowOpacity = Math.max(0, Math.min(1, Number(line?.shadowOpacity) || 0));
  const shadowBlur = Math.max(0, Math.min(48, Number(line?.shadowBlur) || 0));
  const shadowDistance = Math.max(0, Math.min(64, Number(line?.shadowDistance) || 0));
  const shadowColor = normalizeHexColor(line?.shadowColor, "#000000");
  const shadowDirection = Number.isFinite(Number(line?.shadowDirection)) ? Number(line.shadowDirection) : 135;
  const radians = (shadowDirection * Math.PI) / 180;
  const offsetX = Math.cos(radians) * shadowDistance;
  const offsetY = Math.sin(radians) * shadowDistance;
  const formatOffset = (value) => Number(value.toFixed(2));
  return shadowOpacity > 0 && (shadowBlur > 0 || shadowDistance > 0)
    ? `drop-shadow(${formatOffset(offsetX)}px ${formatOffset(offsetY)}px ${shadowBlur}px ${hexToRgba(shadowColor, shadowOpacity)})`
    : "";
}

export function getLinePointPresentation(line = {}) {
  const pointStyle = String(line?.pointStyle || "none").trim().toLowerCase();
  if (pointStyle === "none") return null;
  const size = Math.max(2, Math.min(32, Number(line?.pointSize) || 7));
  return {
    pointStyle,
    size,
    color: normalizeHexColor(line?.pointColor, line?.color || "#d7e8ff"),
    opacity: Number.isFinite(Number(line?.pointOpacity)) ? Math.max(0, Math.min(1, Number(line.pointOpacity))) : 0.95,
    outlineColor: normalizeHexColor(line?.pointOutlineColor, "#101722"),
    outlineWidth: Math.max(0, Math.min(12, Number(line?.pointOutlineWidth) || 0))
  };
}

export function getRegionPresentation(region = {}) {
  const strokeWidth = Number(region.strokeWidth) || 2;
  const strokeOpacity = Number.isFinite(Number(region.strokeOpacity)) ? Math.max(0, Math.min(1, Number(region.strokeOpacity))) : 0.95;
  const fillOpacity = Number.isFinite(Number(region.fillOpacity)) ? Math.max(0, Math.min(1, Number(region.fillOpacity))) : 0.28;
  return {
    color: normalizeHexColor(region.strokeColor, "#d7e8ff"),
    weight: strokeWidth,
    opacity: strokeOpacity,
    fillColor: normalizeHexColor(region.fillColor, "#7ebaec"),
    fillOpacity,
    dashArray: getLineDashArray(region.strokeStyle, strokeWidth)
  };
}

export function getRegionPatternPresentation(region = {}) {
  return {
    fillStyle: String(region.fillStyle || "solid").trim().toLowerCase(),
    scale: Math.max(4, Math.min(64, Number(region.fillPatternScale) || 14)),
    patternSize: Math.max(1, Math.min(24, Number(region.fillPatternSize) || 2)),
    color: normalizeHexColor(region.fillColor, "#7ebaec"),
    opacity: Number.isFinite(Number(region.fillOpacity)) ? Math.max(0, Math.min(1, Number(region.fillOpacity))) : 0.28
  };
}
