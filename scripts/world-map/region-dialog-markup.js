import { translate as tr } from "../localization.js";
import { escapeHtml } from "../helpers.js";
import {
  buildButtonSwitchMarkup,
  buildNumberInputGroup,
  buildRegionFillStyleOptions,
  buildRichTextGroup,
  buildSelectGroup,
  buildSelectOptions,
  buildStrokeStyleOptions,
  buildTextInputGroup
} from "./form-markup-utils.js";
import { buildWorldMapDestinationLinksMarkup } from "./markup-utils.js";
import { normalizeHexColor } from "./style-utils.js";

function buildRegionSwitch(name, label, checked = false) {
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

function buildRegionColorField(name, label, value, fallback = "#7ebaec") {
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

function buildRegionPanel(label, content) {
  return `
    <section class="tom-world-map-line-clean-dialog__panel">
      <div class="tom-world-map-line-clean-dialog__eyebrow">${tr(label)}</div>
      <div class="tom-world-map-line-clean-dialog__panel-body">
        ${content}
      </div>
    </section>
  `;
}

function buildRegionGroup(title, content) {
  return `
    <section class="tom-world-map-line-clean-dialog__group tom-world-map-region-clean-dialog__style-card tom-theme-content-surface">
      <h4>${tr(title)}</h4>
      <div class="tom-world-map-line-clean-dialog__grid">
        ${content}
      </div>
    </section>
  `;
}

function buildRegionBehaviorBox(initialData = {}) {
  const documentPlayerAccess = initialData.documentPlayerAccess !== false;
  return `
    <section class="tom-world-map-region-clean-dialog__behavior tom-world-map-line-clean-dialog__behavior tom-world-map-line-clean-dialog__group tom-theme-content-surface">
      <h4>${tr("Behavior")}</h4>
      <div class="tom-world-map-line-clean-dialog__behavior-grid tom-world-map-region-clean-dialog__behavior-grid">
        ${buildRegionSwitch("regionTooltipEnabled", "Show hover info", initialData.tooltipEnabled !== false)}
        ${buildButtonSwitchMarkup("regionVisibleForPlayers", "Visible for players", initialData.visibleForPlayers !== false)}
        ${buildButtonSwitchMarkup("regionTravelPlayerAccess", "Travel Access", Boolean(initialData.travelPlayerAccess), { wrapperClass: "tom-world-map-region-clean-dialog__behavior-access tom-world-map-travel-target__switch tom-world-map-destination-card__switch" })}
        ${buildButtonSwitchMarkup("regionDocumentPlayerAccess", "Info Access", documentPlayerAccess, { wrapperClass: "tom-world-map-region-clean-dialog__behavior-access tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
      </div>
    </section>
  `;
}

function buildRegionLinkedActionsBox(initialData = {}) {
  return `
    <section class="tom-world-map-region-clean-dialog__linked-actions tom-world-map-line-clean-dialog__linked-actions tom-world-map-line-clean-dialog__group tom-theme-content-surface">
      <h4>${tr("Linked Actions")}</h4>
      ${buildWorldMapDestinationLinksMarkup("region", initialData, { showAccess: false })}
    </section>
  `;
}

function buildRegionLayerBox(initialData = {}) {
  return buildRegionGroup("Layer", `
    ${buildNumberInputGroup("regionZIndex", "Z-axis", Number.isFinite(Number(initialData.zIndex)) ? Number(initialData.zIndex) : 0, { min: -100, max: 100, step: 1 })}
  `);
}

export function buildRegionDialogContent(initialData = {}, { categoryOptions = [], fallbackCategory = "general" } = {}) {
  const selectedCategory = String(initialData.category || fallbackCategory).trim().toLowerCase() || fallbackCategory;
  const regionCategoryOptionsMarkup = buildSelectOptions(categoryOptions, selectedCategory);
  const fillStyleOptions = buildRegionFillStyleOptions(String(initialData.fillStyle || "solid").trim().toLowerCase());
  const strokeStyleOptions = buildStrokeStyleOptions(String(initialData.strokeStyle || "solid").trim().toLowerCase());
  const fillOpacity = Number.isFinite(Number(initialData.fillOpacity)) ? Number(initialData.fillOpacity) : 0.28;
  const strokeOpacity = Number.isFinite(Number(initialData.strokeOpacity)) ? Number(initialData.strokeOpacity) : 0.95;
  return `
    <div class="tom-theme-root tom-world-map-edit-dialog tom-world-map-pin-dialog tom-world-map-line-clean-dialog tom-world-map-region-clean-dialog">
      <section class="tom-world-map-line-clean-dialog__identity tom-world-map-region-clean-dialog__card tom-theme-content-surface">
        <div class="tom-world-map-line-clean-dialog__grid tom-world-map-line-clean-dialog__grid--two">
          ${buildTextInputGroup("regionName", "Name", initialData.name || tr("Region"), { autofocus: true })}
          ${buildSelectGroup("regionCategory", "Category", regionCategoryOptionsMarkup)}
          ${buildRichTextGroup("regionDescription", "Description", initialData.description || "", { wrapperClass: "tom-world-map-edit-dialog__span-2", minHeight: 112 })}
        </div>
      </section>
      ${buildRegionBehaviorBox(initialData)}
      ${buildRegionLayerBox(initialData)}
      <div class="tom-world-map-line-clean-dialog__columns">
        ${buildRegionPanel("Region style", `
          <div class="tom-world-map-line-clean-dialog__stack">
            ${buildRegionGroup("Fill", `
              ${buildRegionColorField("regionFillColor", "Color", initialData.fillColor, "#7ebaec")}
              ${buildNumberInputGroup("regionFillOpacity", "Opacity", fillOpacity, { min: 0, max: 1, step: 0.05 })}
              ${buildSelectGroup("regionFillStyle", "Style", fillStyleOptions)}
              ${buildNumberInputGroup("regionFillPatternScale", "Spacing", Number(initialData.fillPatternScale) || 14, { min: 4, max: 64, step: 1 })}
              ${buildNumberInputGroup("regionFillPatternSize", "Size", Number(initialData.fillPatternSize) || 2, { min: 1, max: 24, step: 1 })}
            `)}
            ${buildRegionGroup("Border", `
              ${buildRegionColorField("regionStrokeColor", "Color", initialData.strokeColor, "#d7e8ff")}
              ${buildNumberInputGroup("regionStrokeOpacity", "Opacity", strokeOpacity, { min: 0, max: 1, step: 0.05 })}
              ${buildNumberInputGroup("regionStrokeWidth", "Thickness", Number(initialData.strokeWidth) || 2, { min: 1, max: 12, step: 1 })}
              ${buildSelectGroup("regionStrokeStyle", "Style", strokeStyleOptions)}
            `)}
          </div>
        `)}
      </div>
      ${buildRegionLinkedActionsBox(initialData)}
    </div>
  `;
}
