import { escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";
import {
  buildColorInputGroup,
  buildButtonSwitchMarkup,
  buildNumberInputGroup,
  buildOutlineModeOptions,
  buildRegionFillStyleOptions,
  buildRichTextGroup,
  buildSelectGroup,
  buildStrokeStyleOptions,
  buildTextareaGroup,
  buildTextInputGroup
} from "./form-markup-utils.js";
import { buildWorldMapDestinationLinksMarkup } from "./markup-utils.js";
import { normalizeHexColor } from "./style-utils.js";

const OBJECT_OVERLAY_MAX_SIZE = 65536;

function buildObjectLinkedActionsBox(initialData = {}) {
  return `
    <section class="tom-world-map-edit-dialog__card tom-world-map-object-overlay-dialog__linked-actions tom-theme-content-surface">
      <h4>${tr("Linked Actions")}</h4>
      ${buildWorldMapDestinationLinksMarkup("overlay", initialData, { showAccess: false })}
    </section>
  `;
}

function buildObjectLayerBox(initialData = {}) {
  const zIndex = Number.isFinite(Number(initialData.zIndex)) ? Number(initialData.zIndex) : 0;
  return `
    <section class="tom-world-map-edit-dialog__card tom-world-map-edit-dialog__card--compact tom-theme-content-surface">
      <h4>${tr("Layer")}</h4>
      <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
        ${buildNumberInputGroup("overlayZIndex", "Z-axis", zIndex, { min: -100, max: 100, step: 1 })}
      </div>
    </section>
  `;
}

export function buildObjectOverlayDialogContent(initialData = {}, {
  isImage = false,
  isShape = false,
  shapeType = "",
  categoryOptions = "",
  fontOptions = ""
} = {}) {
  const selectedOutlineMode = ["outer", "center"].includes(String(initialData.outlineMode || "").trim().toLowerCase())
    ? String(initialData.outlineMode).trim().toLowerCase()
    : "outer";
  const outlineModeOptions = buildOutlineModeOptions(selectedOutlineMode);
  const initialLineHeight = Number.isFinite(Number(initialData.lineHeight)) ? Number(initialData.lineHeight) : 0.95;
  const documentPlayerAccess = initialData.documentPlayerAccess !== false;
  const fillStyleOptions = buildRegionFillStyleOptions(String(initialData.fillStyle || "solid").trim().toLowerCase());
  const strokeStyleOptions = buildStrokeStyleOptions(String(initialData.strokeStyle || "solid").trim().toLowerCase());
  const shapeLabel = shapeType === "circle" ? tr("Circle") : tr("Rectangle");
  return `
    <div class="tom-theme-root tom-world-map-config__dialog tom-world-map-edit-dialog tom-world-map-object-overlay-dialog">
      ${!isImage && !isShape ? `
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
          ${buildRichTextGroup("overlayDescription", "Description", initialData.description || "", { wrapperClass: "tom-world-map-edit-dialog__span-2", minHeight: 112 })}
        </div>
      </section>
      ${buildObjectLayerBox(initialData)}
      ${isImage ? `
      <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
        <h4>${tr("Image")}</h4>
        <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--two">
          <div class="form-group tom-world-map-edit-dialog__span-2">
            <label>${tr("Image path")}</label>
            <div class="tom-input-with-button">
              <input type="text" name="overlayImagePath" value="${escapeHtml(String(initialData.imagePath || ""))}" />
              <button type="button" class="tom-button tom-button-compact tom-world-map-file-button" data-action="pick-image-object" data-target="[name='overlayImagePath']">${tr("Choose file")}</button>
            </div>
          </div>
          ${buildNumberInputGroup("overlayWidth", "Display width", Number(initialData.width) || 160, { min: 16, max: OBJECT_OVERLAY_MAX_SIZE, step: 1 })}
        </div>
      </section>
      ${buildObjectLinkedActionsBox(initialData)}
      ` : isShape ? `
      <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--two">
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr("Geometry")}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${shapeType === "circle"
              ? buildNumberInputGroup("overlayRadius", "Radius", Number(initialData.radius) || 80, { min: 8, max: OBJECT_OVERLAY_MAX_SIZE, step: 1, wrapperClass: "tom-world-map-object-overlay-dialog__span-2" })
              : `
                ${buildNumberInputGroup("overlayWidth", "Width", Number(initialData.width) || 180, { min: 16, max: OBJECT_OVERLAY_MAX_SIZE, step: 1 })}
                ${buildNumberInputGroup("overlayHeight", "Height", Number(initialData.height) || 120, { min: 16, max: OBJECT_OVERLAY_MAX_SIZE, step: 1 })}
                ${buildNumberInputGroup("overlayCornerRadius", "Rounded corners", Number(initialData.cornerRadius) || 0, { min: 0, max: 512, step: 1, wrapperClass: "tom-world-map-object-overlay-dialog__span-2" })}
              `}
          </div>
        </section>
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr(`${shapeLabel} fill`)}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${buildColorInputGroup("overlayFillColor", "Color", normalizeHexColor(initialData.fillColor, "#7ebaec"), "#7ebaec")}
            ${buildNumberInputGroup("overlayFillOpacity", "Opacity", Number.isFinite(Number(initialData.fillOpacity)) ? Number(initialData.fillOpacity) : 0.28, { min: 0, max: 1, step: 0.05 })}
            ${buildSelectGroup("overlayFillStyle", "Style", fillStyleOptions)}
            ${buildNumberInputGroup("overlayFillPatternScale", "Spacing", Number(initialData.fillPatternScale) || 14, { min: 4, max: 64, step: 1 })}
            ${buildNumberInputGroup("overlayFillPatternSize", "Size", Number(initialData.fillPatternSize) || 2, { min: 1, max: 24, step: 1 })}
          </div>
        </section>
        <section class="tom-world-map-edit-dialog__card tom-theme-content-surface">
          <h4>${tr("Border")}</h4>
          <div class="tom-world-map-edit-dialog__grid tom-world-map-edit-dialog__grid--compact">
            ${buildColorInputGroup("overlayStrokeColor", "Color", normalizeHexColor(initialData.strokeColor, "#d7e8ff"), "#d7e8ff")}
            ${buildNumberInputGroup("overlayStrokeOpacity", "Opacity", Number.isFinite(Number(initialData.strokeOpacity)) ? Number(initialData.strokeOpacity) : 0.95, { min: 0, max: 1, step: 0.05 })}
            ${buildNumberInputGroup("overlayStrokeWidth", "Thickness", Number(initialData.strokeWidth) || 2, { min: 0, max: 32, step: 1 })}
            ${buildSelectGroup("overlayStrokeStyle", "Style", strokeStyleOptions)}
          </div>
        </section>
        ${buildObjectLinkedActionsBox(initialData)}
      </div>
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
            ${buildNumberInputGroup("overlayWidth", "Text box width", Number(initialData.width) || 220, { min: 24, max: OBJECT_OVERLAY_MAX_SIZE, step: 1 })}
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
          ${buildButtonSwitchMarkup("overlayVisibleForPlayers", "Visible for players", initialData.visibleForPlayers !== false)}
          ${buildButtonSwitchMarkup("overlayTravelPlayerAccess", "Travel Access", Boolean(initialData.travelPlayerAccess), { wrapperClass: "tom-world-map-travel-target__switch tom-world-map-destination-card__switch" })}
          ${buildButtonSwitchMarkup("overlayDocumentPlayerAccess", "Info Access", documentPlayerAccess, { wrapperClass: "tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
        </div>
      </section>
    </div>
  `;
}
