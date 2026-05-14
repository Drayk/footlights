import { escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";
import {
  buildColorInputGroup,
  buildButtonSwitchMarkup,
  buildNumberInputGroup,
  buildOutlineModeOptions,
  buildSelectGroup,
  buildTextareaGroup,
  buildTextInputGroup
} from "./form-markup-utils.js";
import { buildWorldMapDestinationLinksMarkup } from "./markup-utils.js";
import { normalizeHexColor } from "./style-utils.js";

function buildObjectLinkedActionsBox(initialData = {}) {
  return `
    <section class="tom-world-map-edit-dialog__card tom-world-map-object-overlay-dialog__linked-actions tom-theme-content-surface">
      <h4>${tr("Linked Actions")}</h4>
      ${buildWorldMapDestinationLinksMarkup("overlay", initialData, { showAccess: false })}
    </section>
  `;
}

export function buildObjectOverlayDialogContent(initialData = {}, {
  isImage = false,
  categoryOptions = "",
  fontOptions = ""
} = {}) {
  const selectedOutlineMode = ["outer", "center"].includes(String(initialData.outlineMode || "").trim().toLowerCase())
    ? String(initialData.outlineMode).trim().toLowerCase()
    : "outer";
  const outlineModeOptions = buildOutlineModeOptions(selectedOutlineMode);
  const initialLineHeight = Number.isFinite(Number(initialData.lineHeight)) ? Number(initialData.lineHeight) : 0.95;
  const documentPlayerAccess = initialData.documentPlayerAccess !== false;
  return `
    <div class="tom-theme-root tom-world-map-config__dialog tom-world-map-edit-dialog tom-world-map-object-overlay-dialog">
      ${!isImage ? `
      <section class="tom-world-map-edit-dialog__card tom-world-map-edit-dialog__card--preview tom-theme-content-surface">
        <div class="tom-world-map-object-overlay-dialog__preview-stage">
          <div class="tom-world-map-object-overlay-dialog__preview-text" data-overlay-text-preview="true">${escapeHtml(String(initialData.text || initialData.name || tr("Text object")))}</div>
        </div>
      </section>
      ` : ""}
      <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
        <h4>${tr("Identity")}</h4>
        <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--two">
          ${buildTextInputGroup("overlayName", "Name", initialData.name || "", { autofocus: true })}
          ${buildSelectGroup("overlayCategory", "Category", categoryOptions)}
        </div>
      </section>
      ${isImage ? `
      <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
        <h4>${tr("Image")}</h4>
        <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--two">
          <div class="form-group tom-world-map-edit-dialog__span-2">
            <label>${tr("Image path")}</label>
            <div class="tom-input-with-button">
              <input type="text" name="overlayImagePath" value="${escapeHtml(String(initialData.imagePath || ""))}" />
              <button type="button" class="tom-button tom-button-ghost tom-button-compact" data-action="pick-image-object" data-target="[name='overlayImagePath']">${tr("Choose file")}</button>
            </div>
          </div>
          ${buildNumberInputGroup("overlayWidth", "Display width", Number(initialData.width) || 160, { min: 16, max: 4096, step: 1 })}
        </div>
      </section>
      ${buildObjectLinkedActionsBox(initialData)}
      ` : `
      <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
        <h4>${tr("Text")}</h4>
        ${buildTextareaGroup("overlayText", "Text", initialData.text || "", { rows: 4 })}
      </section>
      <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--two">
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr("General")}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${buildSelectGroup("overlayFontFamily", "Font Type", fontOptions, { wrapperClass: "tom-world-map-object-overlay-dialog__span-2" })}
            ${buildNumberInputGroup("overlayFontSize", "Font size", Number(initialData.fontSize) || 24, { min: 8, max: 256, step: 1 })}
            ${buildColorInputGroup("overlayColor", "Text color", normalizeHexColor(initialData.color, "#f2f5f8"), "#f2f5f8")}
            ${buildNumberInputGroup("overlayLineHeight", "Line height", initialLineHeight, { min: 0.6, max: 2.4, step: 0.05 })}
            ${buildNumberInputGroup("overlayOpacity", "Opacity", Number.isFinite(Number(initialData.opacity)) ? Number(initialData.opacity) : 1, { min: 0, max: 1, step: 0.05 })}
          </div>
        </section>
        ${buildObjectLinkedActionsBox(initialData)}
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr("Font border")}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${buildColorInputGroup("overlayOutlineColor", "Border color", normalizeHexColor(initialData.outlineColor, "#101722"), "#101722")}
            ${buildNumberInputGroup("overlayOutlineWidth", "Thickness", Number(initialData.outlineWidth) || 0, { min: 0, max: 12, step: 0.5, wrapperClass: "tom-world-map-object-overlay-dialog__field--compact" })}
            ${buildSelectGroup("overlayOutlineMode", "Border mode", outlineModeOptions)}
          </div>
        </section>
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr("Font shadow")}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${buildColorInputGroup("overlayShadowColor", "Shadow color", normalizeHexColor(initialData.shadowColor, "#000000"), "#000000")}
            ${buildNumberInputGroup("overlayShadowDistance", "Shadow distance", Number(initialData.shadowDistance) || 2, { min: 0, max: 64, step: 1 })}
            ${buildNumberInputGroup("overlayShadowOpacity", "Shadow opacity", Number.isFinite(Number(initialData.shadowOpacity)) ? Number(initialData.shadowOpacity) : 0.7, { min: 0, max: 1, step: 0.05 })}
            ${buildNumberInputGroup("overlayShadowBlur", "Shadow blur", Number(initialData.shadowBlur) || 8, { min: 0, max: 64, step: 1 })}
          </div>
        </section>
      </div>
      `}
      <section class="tom-world-map-edit-dialog__card tom-world-map-edit-dialog__card--compact tom-theme-content-surface">
        <h4>${tr("Behavior")}</h4>
        <div class="tom-world-map-edit-dialog__toggles tom-world-map-dialog__behavior-grid">
          ${buildButtonSwitchMarkup("overlayScaleWithZoom", "Scale with zoom", initialData.scaleWithZoom !== false)}
          ${buildButtonSwitchMarkup("overlayMovableForPlayers", "Movable for players", initialData.movableForPlayers)}
          ${buildButtonSwitchMarkup("overlayTravelPlayerAccess", "Travel Access", Boolean(initialData.travelPlayerAccess), { wrapperClass: "tom-world-map-travel-target__switch tom-world-map-destination-card__switch" })}
          ${buildButtonSwitchMarkup("overlayDocumentPlayerAccess", "Info Access", documentPlayerAccess, { wrapperClass: "tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
        </div>
      </section>
    </div>
  `;
}
