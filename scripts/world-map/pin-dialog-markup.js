import { escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";
import {
  buildButtonSwitchMarkup,
  buildNumberInputGroup,
  buildRangeInputGroup,
  buildRichTextGroup,
  buildSelectGroup,
  buildTextInputGroup
} from "./form-markup-utils.js";
import { buildWorldMapDestinationLinksMarkup } from "./markup-utils.js";
import { normalizeHexColor, normalizePinSize } from "./style-utils.js";

function buildPinColorField(name, label, value, fallback = "#7ebaec") {
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

export function buildPinDialogContent(initialData = {}, { typeOptions = "" } = {}) {
  const safeColor = normalizeHexColor(initialData.color, "#7ebaec");
  const safeBorderColor = normalizeHexColor(initialData.borderColor, "#101722");
  const safeBorderWidth = Math.max(0, Math.min(8, Number(initialData.borderWidth) || 0));
  const safeShadowColor = normalizeHexColor(initialData.shadowColor, "#000000");
  const safeShadowDistance = Number.isFinite(Number(initialData.shadowDistance)) ? Math.max(0, Math.min(32, Number(initialData.shadowDistance))) : 2;
  const safeShadowOpacity = Math.max(0, Math.min(1, Number(initialData.shadowOpacity ?? 0.55)));
  const safeShadowBlur = Number.isFinite(Number(initialData.shadowBlur)) ? Math.max(0, Math.min(32, Number(initialData.shadowBlur))) : 4;
  const safeSize = normalizePinSize(initialData.size);
  const documentPlayerAccess = initialData.documentPlayerAccess !== false;
  return `
    <div class="tom-theme-root tom-world-map-edit-dialog tom-world-map-pin-dialog">
      <section class="tom-world-map-pin-dialog__style-card tom-theme-content-surface">
        <h4>${tr("Identity")}</h4>
        <div class="tom-world-map-pin-dialog__style-grid tom-world-map-pin-dialog__style-grid--two">
          ${buildTextInputGroup("pinLabel", "Pin label", initialData.label || "", { autofocus: true })}
          ${buildSelectGroup("pinType", "Pin type", typeOptions)}
          ${buildRichTextGroup("pinNote", "Pin description", initialData.note || "", { wrapperClass: "tom-world-map-edit-dialog__span-2", minHeight: 120 })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-theme-content-surface">
        <h4>${tr("Appearance")}</h4>
        <div class="tom-world-map-pin-dialog__style-grid tom-world-map-pin-dialog__style-grid--two">
          ${buildPinColorField("pinColor", "Pin color", safeColor, "#7ebaec")}
          ${buildRangeInputGroup("pinSize", "Pin size", safeSize, { min: 0.7, max: 2.4, step: 0.1 })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-theme-content-surface">
        <h4>${tr("Layer")}</h4>
        <div class="tom-world-map-pin-dialog__style-grid tom-world-map-pin-dialog__style-grid--two">
          ${buildNumberInputGroup("pinZIndex", "Z-axis", Number.isFinite(Number(initialData.zIndex)) ? Number(initialData.zIndex) : 0, { min: -100, max: 100, step: 1 })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-theme-content-surface">
        <h4>${tr("Pin icon border")}</h4>
        <div class="tom-world-map-pin-dialog__style-grid">
          ${buildPinColorField("pinBorderColor", "Border color", safeBorderColor, "#101722")}
          ${buildRangeInputGroup("pinBorderWidth", "Border thickness", safeBorderWidth, { min: 0, max: 8, step: 0.25 })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-theme-content-surface">
        <h4>${tr("Pin shadow")}</h4>
        <div class="tom-world-map-pin-dialog__style-grid tom-world-map-pin-dialog__style-grid--shadow">
          ${buildPinColorField("pinShadowColor", "Shadow color", safeShadowColor, "#000000")}
          ${buildNumberInputGroup("pinShadowDistance", "Shadow distance", safeShadowDistance, { min: 0, max: 32, step: 0.5 })}
          ${buildNumberInputGroup("pinShadowOpacity", "Shadow opacity", safeShadowOpacity, { min: 0, max: 1, step: 0.05 })}
          ${buildNumberInputGroup("pinShadowBlur", "Shadow blur", safeShadowBlur, { min: 0, max: 32, step: 0.5 })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-world-map-pin-dialog__behavior tom-theme-content-surface">
        <h4>${tr("Behavior")}</h4>
        <div class="tom-world-map-dialog__behavior-grid">
          ${buildButtonSwitchMarkup("pinMovableForPlayers", "Movable for players", initialData.movableForPlayers)}
          ${buildButtonSwitchMarkup("pinVisibleForPlayers", "Visible for players", initialData.visibleForPlayers !== false)}
          ${buildButtonSwitchMarkup("pinTooltipEnabled", "Show hover info", initialData.tooltipEnabled !== false)}
          ${buildButtonSwitchMarkup("pinTravelPlayerAccess", "Travel Access", Boolean(initialData.travelPlayerAccess), { wrapperClass: "tom-world-map-travel-target__switch tom-world-map-destination-card__switch" })}
          ${buildButtonSwitchMarkup("pinDocumentPlayerAccess", "Info Access", documentPlayerAccess, { wrapperClass: "tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
        </div>
      </section>
      <section class="tom-world-map-pin-dialog__style-card tom-world-map-pin-dialog__linked-actions tom-theme-content-surface">
        <h4>${tr("Linked Actions")}</h4>
        ${buildWorldMapDestinationLinksMarkup("pin", initialData, { showAccess: false })}
      </section>
    </div>
  `;
}
