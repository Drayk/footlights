import { translate as tr } from "../localization.js";
import { buildTextPresentationStyle, normalizeHexColor } from "./style-utils.js";

function readRootValue(root, selector, fallback = "") {
  return String(root?.querySelector?.(selector)?.value || fallback || "").trim();
}

function readRootNumber(root, selector, fallback) {
  const value = Number(root?.querySelector?.(selector)?.value || fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function syncObjectOverlayTextPreview(root, initialData = {}) {
  const preview = root?.querySelector?.("[data-overlay-text-preview='true']");
  if (!(preview instanceof HTMLElement)) return;
  const text = readRootValue(root, "[name='overlayText']", readRootValue(root, "[name='overlayName']", tr("Text object"))) || tr("Text object");
  const outlineMode = readRootValue(root, "[name='overlayOutlineMode']").toLowerCase();
  const textStyle = buildTextPresentationStyle({
    fontSize: readRootNumber(root, "[name='overlayFontSize']", initialData.fontSize || 24),
    lineHeight: Math.max(0.6, Math.min(2.4, readRootNumber(root, "[name='overlayLineHeight']", initialData.lineHeight || 0.95))),
    fontFamily: readRootValue(root, "[name='overlayFontFamily']"),
    color: normalizeHexColor(readRootValue(root, "[name='overlayColor']"), "#f2f5f8"),
    outlineColor: normalizeHexColor(readRootValue(root, "[name='overlayOutlineColor']"), "#101722"),
    outlineMode: ["outer", "center"].includes(outlineMode) ? outlineMode : "outer",
    outlineWidth: Math.max(0, Math.min(12, readRootNumber(root, "[name='overlayOutlineWidth']", initialData.outlineWidth || 0))),
    shadowColor: normalizeHexColor(readRootValue(root, "[name='overlayShadowColor']"), "#000000"),
    shadowDistance: Math.max(0, Math.min(64, readRootNumber(root, "[name='overlayShadowDistance']", initialData.shadowDistance || 2))),
    shadowOpacity: Math.max(0, Math.min(1, readRootNumber(root, "[name='overlayShadowOpacity']", initialData.shadowOpacity || 0.7))),
    shadowBlur: Math.max(0, Math.min(64, readRootNumber(root, "[name='overlayShadowBlur']", initialData.shadowBlur || 8)))
  });
  preview.textContent = text;
  preview.style.fontSize = `${textStyle.fontSizePx.toFixed(2)}px`;
  preview.style.lineHeight = `${textStyle.lineHeight}`;
  preview.style.color = textStyle.color;
  preview.style.fontFamily = textStyle.fontFamily;
  preview.style.webkitTextStroke = textStyle.webkitTextStroke;
  preview.style.paintOrder = textStyle.webkitTextStroke ? "stroke fill" : "";
  preview.style.textShadow = textStyle.textShadow;
}

export function bindObjectOverlayTextPreview(root, initialData = {}) {
  const updateTextPreview = () => syncObjectOverlayTextPreview(root, initialData);
  root?.querySelectorAll?.("[name^='overlay']").forEach((field) => {
    field.addEventListener("input", updateTextPreview);
    field.addEventListener("change", updateTextPreview);
  });
  updateTextPreview();
}
