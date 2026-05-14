import { translate as tr } from "../localization.js";
import { escapeHtml } from "../helpers.js";
import {
  buildLineCapOptions,
  buildLinePointStyleOptions,
  buildButtonSwitchMarkup,
  buildNumberInputGroup,
  buildSelectOptions,
  buildSelectGroup,
  buildStrokeStyleOptions,
  buildTextInputGroup
} from "./form-markup-utils.js";
import { buildWorldMapDestinationLinksMarkup } from "./markup-utils.js";
import { normalizeHexColor } from "./style-utils.js";

function buildLineShadowDirectionOptions(selectedValue = 135) {
  return buildSelectOptions([
    { value: "0", label: tr("Right") },
    { value: "45", label: tr("Down right") },
    { value: "90", label: tr("Down") },
    { value: "135", label: tr("Down left") },
    { value: "180", label: tr("Left") },
    { value: "225", label: tr("Up left") },
    { value: "270", label: tr("Up") },
    { value: "315", label: tr("Up right") }
  ], String(selectedValue));
}

function buildLineSwitch(name, label, checked = false) {
  return `
    <label class="tom-world-map-line-clean-dialog__switch">
      <span>${tr(label)}</span>
      <input type="checkbox" name="${escapeHtml(name)}" ${checked ? "checked" : ""} />
      <span class="tom-world-map-line-clean-dialog__switch-track" aria-hidden="true">
        <span class="tom-world-map-line-clean-dialog__switch-knob"></span>
      </span>
    </label>
  `;
}

function buildLineColorField(name, label, value, fallback = "#d7e8ff") {
  const safeName = escapeHtml(name);
  const safeValue = normalizeHexColor(value, fallback);
  return `
    <div class="form-group tom-world-map-line-clean-dialog__color-field">
      <label>${tr(label)}</label>
      <div class="tom-world-map-line-clean-dialog__color-control" data-line-color-control>
        <span class="tom-world-map-line-clean-dialog__color-swatch" style="--tom-world-map-line-swatch-color: ${escapeHtml(safeValue)};">
          <input type="color" name="${safeName}" value="${escapeHtml(safeValue)}" data-line-color-input />
        </span>
        <input type="text" value="${escapeHtml(safeValue.toUpperCase())}" class="tom-world-map-line-clean-dialog__color-hex" data-line-color-hex aria-label="${tr(label)} ${tr("Hex")}" />
      </div>
    </div>
  `;
}

function buildLinePanel(label, content, { className = "", showEyebrow = true } = {}) {
  return `
    <section class="tom-world-map-line-clean-dialog__panel ${className}">
      ${showEyebrow && label ? `<div class="tom-world-map-line-clean-dialog__eyebrow">${tr(label)}</div>` : ""}
      <div class="tom-world-map-line-clean-dialog__panel-body">
        ${content}
      </div>
    </section>
  `;
}

function buildLineGroup(title, content) {
  return `
    <section class="tom-world-map-line-clean-dialog__group tom-world-map-edit-dialog__card tom-theme-content-surface">
      <h4>${tr(title)}</h4>
      <div class="tom-world-map-line-clean-dialog__grid">
        ${content}
      </div>
    </section>
  `;
}

function buildLineBehaviorBox(initialData = {}) {
  const documentPlayerAccess = initialData.documentPlayerAccess !== false;
  return `
    <section class="tom-world-map-line-clean-dialog__behavior tom-world-map-line-clean-dialog__group tom-theme-content-surface">
      <h4>${tr("Behavior")}</h4>
      <div class="tom-world-map-line-clean-dialog__behavior-grid">
        ${buildLineSwitch("lineMovableForPlayers", "Movable for players", initialData.movableForPlayers)}
        ${buildLineSwitch("lineTooltipEnabled", "Show hover info", initialData.tooltipEnabled !== false)}
        ${buildButtonSwitchMarkup("lineTravelPlayerAccess", "Travel Access", Boolean(initialData.travelPlayerAccess), { wrapperClass: "tom-world-map-line-clean-dialog__behavior-access tom-world-map-travel-target__switch tom-world-map-destination-card__switch" })}
        ${buildButtonSwitchMarkup("lineDocumentPlayerAccess", "Info Access", documentPlayerAccess, { wrapperClass: "tom-world-map-line-clean-dialog__behavior-access tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
      </div>
    </section>
  `;
}

function buildLineLinkedActionsBox(initialData = {}) {
  return `
    <section class="tom-world-map-line-clean-dialog__linked-actions tom-world-map-line-clean-dialog__group tom-theme-content-surface">
      <h4>${tr("Linked Actions")}</h4>
      ${buildWorldMapDestinationLinksMarkup("line", initialData, { showAccess: false })}
    </section>
  `;
}

export function buildLineDialogContent(initialData = {}, { categoryOptions = "", fallbackCategory = "location" } = {}) {
  const categoryOptionsMarkup = typeof categoryOptions === "string"
    ? categoryOptions
    : buildSelectOptions(categoryOptions, fallbackCategory);
  const pointStyle = String(initialData.pointStyle || "none").trim().toLowerCase();
  const lineStyleOptions = buildStrokeStyleOptions(String(initialData.lineStyle || "solid").trim().toLowerCase());
  const lineCapOptions = buildLineCapOptions(String(initialData.lineCap || "round").trim().toLowerCase());
  const linePointStyleOptions = buildLinePointStyleOptions(pointStyle);
  const shadowDirectionOptions = buildLineShadowDirectionOptions(Number.isFinite(Number(initialData.shadowDirection)) ? Number(initialData.shadowDirection) : 135);
  return `
    <div class="tom-theme-root tom-world-map-pin-dialog tom-world-map-line-clean-dialog">
      <section class="tom-world-map-line-clean-dialog__identity tom-world-map-edit-dialog__card tom-theme-content-surface">
        <div class="tom-world-map-line-clean-dialog__grid tom-world-map-line-clean-dialog__grid--two">
          ${buildTextInputGroup("lineName", "Name", initialData.name || tr("Line"), { autofocus: true })}
          ${buildSelectGroup("lineCategory", "Category", categoryOptionsMarkup)}
        </div>
      </section>
      ${buildLineBehaviorBox(initialData)}
      <div class="tom-world-map-line-clean-dialog__columns">
        ${buildLinePanel("Line style", `
          <div class="tom-world-map-line-clean-dialog__stack">
            ${buildLineGroup("Stroke", `
              ${buildLineColorField("lineColor", "Color", initialData.color, "#d7e8ff")}
              ${buildNumberInputGroup("lineOpacity", "Opacity", Number.isFinite(Number(initialData.opacity)) ? Number(initialData.opacity) : 0.95, { min: 0, max: 1, step: 0.05 })}
              ${buildNumberInputGroup("lineWidth", "Thickness", Number(initialData.width) || 3, { min: 1, max: 32, step: 1 })}
              ${buildSelectGroup("lineStyle", "Style", lineStyleOptions)}
              ${buildSelectGroup("lineCap", "Line ends", lineCapOptions, { wrapperClass: "tom-world-map-line-clean-dialog__span-two" })}
            `)}
            ${buildLineGroup("Border", `
              ${buildLineColorField("lineOutlineColor", "Border color", initialData.outlineColor, "#101722")}
              ${buildNumberInputGroup("lineOutlineWidth", "Border thickness", Number(initialData.outlineWidth) || 0, { min: 0, max: 32, step: 1 })}
            `)}
            ${buildLineGroup("Shadow", `
              ${buildLineColorField("lineShadowColor", "Shadow color", initialData.shadowColor, "#000000")}
              ${buildNumberInputGroup("lineShadowOpacity", "Shadow opacity", Number.isFinite(Number(initialData.shadowOpacity)) ? Number(initialData.shadowOpacity) : 0.35, { min: 0, max: 1, step: 0.05 })}
              ${buildNumberInputGroup("lineShadowBlur", "Shadow blur", Number.isFinite(Number(initialData.shadowBlur)) ? Number(initialData.shadowBlur) : 6, { min: 0, max: 48, step: 1 })}
              ${buildNumberInputGroup("lineShadowDistance", "Shadow distance", Number.isFinite(Number(initialData.shadowDistance)) ? Number(initialData.shadowDistance) : 0, { min: 0, max: 64, step: 1 })}
              ${buildSelectGroup("lineShadowDirection", "Shadow direction", shadowDirectionOptions, { wrapperClass: "tom-world-map-line-clean-dialog__span-two" })}
            `)}
          </div>
        `, { showEyebrow: false })}
        ${buildLinePanel("Connection points", `
          <div class="tom-world-map-line-clean-dialog__grid">
            ${buildSelectGroup("linePointStyle", "Connection points", linePointStyleOptions)}
            ${buildNumberInputGroup("linePointSize", "Point size", Number(initialData.pointSize) || 7, { min: 2, max: 32, step: 1 })}
            ${buildLineColorField("linePointColor", "Point color", initialData.pointColor || initialData.color, "#d7e8ff")}
            ${buildNumberInputGroup("linePointOpacity", "Point opacity", Number.isFinite(Number(initialData.pointOpacity)) ? Number(initialData.pointOpacity) : 0.95, { min: 0, max: 1, step: 0.05 })}
            ${buildLineColorField("linePointOutlineColor", "Border color", initialData.pointOutlineColor, "#101722")}
            ${buildNumberInputGroup("linePointOutlineWidth", "Border thickness", Number.isFinite(Number(initialData.pointOutlineWidth)) ? Number(initialData.pointOutlineWidth) : 1, { min: 0, max: 12, step: 1 })}
          </div>
        `, { className: "tom-world-map-line-clean-dialog__connection-card tom-world-map-edit-dialog__card tom-theme-content-surface", showEyebrow: false })}
      </div>
      ${buildLineLinkedActionsBox(initialData)}
    </div>
  `;
}
