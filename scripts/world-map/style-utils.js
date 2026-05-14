import { escapeHtml } from "../helpers.js";

export function normalizeHexColor(value, fallback = "#7ebaec") {
  const normalized = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

export function normalizePinSize(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.7, Math.min(2.4, numeric));
}

export function hexToRgba(value, alpha = 1) {
  const normalized = String(value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return `rgba(13, 23, 38, ${alpha})`;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1;
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

export function buildTextShadowCss({ color = "#000000", distance = 2, blur = 8, opacity = 0.7 } = {}) {
  const normalizedColor = normalizeHexColor(color, "#000000");
  const safeDistance = Number.isFinite(Number(distance)) ? Math.max(0, Math.min(64, Number(distance))) : 2;
  const safeBlur = Number.isFinite(Number(blur)) ? Math.max(0, Math.min(64, Number(blur))) : 8;
  const safeOpacity = Number.isFinite(Number(opacity)) ? Math.max(0, Math.min(1, Number(opacity))) : 0.7;
  return `${safeDistance}px ${safeDistance}px ${safeBlur.toFixed(2)}px ${hexToRgba(normalizedColor, safeOpacity)}`;
}

export function buildTextOutlineShadowLayers({ color = "#101722", width = 0, mode = "outer" } = {}) {
  const normalizedColor = normalizeHexColor(color, "#101722");
  const safeWidth = Number.isFinite(Number(width)) ? Math.max(0, Math.min(12, Number(width))) : 0;
  if (safeWidth <= 0 || mode !== "outer") return "";
  const offsets = [
    [safeWidth, 0],
    [-safeWidth, 0],
    [0, safeWidth],
    [0, -safeWidth],
    [safeWidth, safeWidth],
    [safeWidth, -safeWidth],
    [-safeWidth, safeWidth],
    [-safeWidth, -safeWidth]
  ];
  return offsets.map(([x, y]) => `${x}px ${y}px 0 ${normalizedColor}`).join(", ");
}

export function buildTextPresentationStyle(entry = {}, scale = 1) {
  const fontSize = Math.max(8, Number(entry.fontSize) || 24);
  const lineHeight = Number.isFinite(Number(entry.lineHeight)) ? Math.max(0.6, Math.min(2.4, Number(entry.lineHeight))) : 0.95;
  const fontFamily = escapeHtml(String(entry.fontFamily || "").trim());
  const outlineWidth = Math.max(0, Number(entry.outlineWidth) || 0);
  const outlineColor = normalizeHexColor(entry.outlineColor, "#101722");
  const outlineMode = ["outer", "center"].includes(String(entry.outlineMode || "").trim().toLowerCase())
    ? String(entry.outlineMode).trim().toLowerCase()
    : "outer";
  const outlineShadow = buildTextOutlineShadowLayers({
    color: outlineColor,
    width: outlineWidth,
    mode: outlineMode
  });
  const shadowCss = buildTextShadowCss({
    color: entry.shadowColor,
    distance: entry.shadowDistance,
    blur: entry.shadowBlur,
    opacity: entry.shadowOpacity
  });
  const textShadow = [outlineShadow, shadowCss].filter(Boolean).join(", ");
  return {
    fontSizePx: fontSize * scale,
    lineHeight,
    fontFamily,
    color: normalizeHexColor(entry.color, "#f2f5f8"),
    outlineColor,
    outlineWidth,
    outlineMode,
    webkitTextStroke: outlineWidth > 0 && outlineMode === "center" ? `${outlineWidth}px ${outlineColor}` : "",
    textShadow
  };
}

export function getLineDashArray(style, width = 3) {
  const safeWidth = Math.max(1, Number(width) || 3);
  switch (String(style || "solid").trim().toLowerCase()) {
    case "dashed":
      return `${safeWidth * 4} ${safeWidth * 2.2}`;
    case "dotted":
      return `1 ${safeWidth * 2.4}`;
    case "dashdot":
      return `${safeWidth * 4} ${safeWidth * 1.8} 1 ${safeWidth * 1.8}`;
    default:
      return null;
  }
}
