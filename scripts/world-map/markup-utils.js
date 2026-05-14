import { escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { buildButtonSwitchMarkup, buildSelectOptions } from "./form-markup-utils.js";

export {
  buildCheckboxMarkup,
  buildColorInputGroup,
  buildLineCapOptions,
  buildLinePointStyleOptions,
  buildNumberInputGroup,
  buildOutlineModeOptions,
  buildRangeInputGroup,
  buildRegionFillStyleOptions,
  buildSelectGroup,
  buildSelectOptions,
  buildStrokeStyleOptions,
  buildTextareaGroup,
  buildTextInputGroup
} from "./form-markup-utils.js";

export function getLinkedDocumentFallbackText() {
  return tr("Drag a journal or token here");
}

export function getLinkedDocumentHelpText() {
  return tr("Clicking this map element opens the linked journal or token.");
}

function getTravelTargetFallbackText() {
  return tr("Choose or drop a scene, portal, or map");
}

function getTravelTargetHelpText() {
  return tr("Clicking this map element changes to the selected destination.");
}

function getTravelTargetTypeLabel(type = "") {
  const normalizedType = String(type || "").trim();
  if (normalizedType === "foundryScene") return tr("Foundry Scene");
  if (normalizedType === "theatreScene") return tr("Foodlights Theater Scene");
  if (normalizedType === "portal") return tr("Portal Scene");
  if (normalizedType === "worldMap") return tr("Map");
  return getTravelTargetHelpText();
}

function getTravelTargetKey(target = {}) {
  return [
    String(target.type || "").trim(),
    String(target.id || "").trim(),
    String(target.uuid || "").trim()
  ].join("::");
}

function getTravelTargetPreviewImage(target = {}) {
  const type = String(target.type || target.travelTargetType || "").trim();
  const id = String(target.id || target.travelTargetId || "").trim();
  if (type === "theatreScene") {
    const scene = TheatreStore.getSceneById(id);
    return String(scene?.thumbnail || scene?.background || "").trim();
  }
  if (type === "portal") {
    const portal = TheatreStore.getPortalById(id);
    return String(portal?.thumbnail || (portal?.backgroundType === "image" ? portal?.background : "") || "").trim();
  }
  if (type === "worldMap") {
    const map = TheatreStore.getWorldMapById(id);
    return String(map?.thumbnail || "").trim();
  }
  return String(target.previewImage || "").trim();
}

function buildTravelTargetValue(target = {}) {
  return JSON.stringify({
    type: String(target.type || "").trim(),
    id: String(target.id || "").trim(),
    uuid: String(target.uuid || "").trim(),
    previewImage: getTravelTargetPreviewImage(target)
  });
}

function buildTravelTargetOptions(initialData = {}) {
  const selectedKey = getTravelTargetKey({
    type: initialData.travelTargetType,
    id: initialData.travelTargetId,
    uuid: initialData.travelTargetUuid
  });
  const groups = [];
  const theatreScenes = TheatreStore.getScenes().map((scene) => ({
    value: buildTravelTargetValue({ type: "theatreScene", id: scene.id, name: scene.name }),
    selectedKey: getTravelTargetKey({ type: "theatreScene", id: scene.id }),
    label: scene.name || tr("Scene")
  }));
  if (theatreScenes.length) groups.push({ label: tr("Foodlights Theater Scenes"), options: theatreScenes });

  const portals = TheatreStore.getPortals().map((portal) => ({
    value: buildTravelTargetValue({ type: "portal", id: portal.id, name: portal.name }),
    selectedKey: getTravelTargetKey({ type: "portal", id: portal.id }),
    label: portal.name || tr("Portal")
  }));
  if (portals.length) groups.push({ label: tr("Portal Scenes"), options: portals });

  const maps = TheatreStore.getWorldMaps().map((map) => ({
    value: buildTravelTargetValue({ type: "worldMap", id: map.id, name: map.name }),
    selectedKey: getTravelTargetKey({ type: "worldMap", id: map.id }),
    label: map.name || tr("World Map")
  }));
  if (maps.length) groups.push({ label: tr("Maps"), options: maps });

  const optionMarkup = [
    `<option value="">${tr("No travel target")}</option>`,
    ...groups.map((group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${group.options.map((option) => `
          <option value="${escapeHtml(option.value)}" ${option.selectedKey === selectedKey ? "selected" : ""}>${escapeHtml(option.label)}</option>
        `).join("")}
      </optgroup>
    `)
  ].join("");
  return optionMarkup;
}

export function buildTravelPlayerAccessSwitch(prefix, checked = false, { label = "Player access" } = {}) {
  const safePrefix = String(prefix || "travel").trim();
  const escapedPrefix = escapeHtml(safePrefix);
  const isChecked = Boolean(checked);
  const switchLabel = tr(label);
  return `
    <div class="tom-world-map-line-clean-dialog__switch tom-world-map-travel-target__switch">
      <span>${switchLabel}</span>
      <input type="hidden" name="${escapedPrefix}TravelPlayerAccess" value="${isChecked ? "1" : "0"}" />
      <button
        type="button"
        class="tom-world-map-travel-target__toggle${isChecked ? " is-active" : ""}"
        data-travel-player-access-toggle="${escapedPrefix}"
        aria-pressed="${isChecked ? "true" : "false"}"
        aria-label="${switchLabel}"
      >
        <span class="tom-world-map-line-clean-dialog__switch-track" aria-hidden="true">
          <span class="tom-world-map-line-clean-dialog__switch-knob"></span>
        </span>
      </button>
    </div>
  `;
}

export function buildTravelTargetMarkup(prefix, initialData = {}, { showAccess = true } = {}) {
  const safePrefix = String(prefix || "travel").trim();
  const escapedPrefix = escapeHtml(safePrefix);
  const targetName = escapeHtml(String(initialData.travelTargetName || "").trim());
  const targetType = escapeHtml(String(initialData.travelTargetType || "").trim());
  const targetPreview = getTravelTargetPreviewImage({
    type: initialData.travelTargetType,
    id: initialData.travelTargetId,
    uuid: initialData.travelTargetUuid,
    previewImage: initialData.travelTargetPreviewImage
  });
  return `
    <section class="tom-world-map-destination-card tom-world-map-destination-card--travel">
      <div class="tom-world-map-destination-card__eyebrow">${tr("Travel target")}</div>
      <div class="tom-world-map-destination-card__control">
        <label>${tr("Destination")}</label>
        <select name="${escapedPrefix}TravelSelect" data-travel-target-select="${escapedPrefix}">
          ${buildTravelTargetOptions(initialData)}
        </select>
      </div>
      ${showAccess ? `
        <div class="tom-world-map-destination-card__access">
          ${buildTravelPlayerAccessSwitch(safePrefix, Boolean(initialData.travelPlayerAccess))}
        </div>
      ` : ""}
      <div class="tom-world-map-destination-card__drop" data-travel-target-drop="${escapedPrefix}" tabindex="0">
        <div class="tom-world-map-travel-target__preview" data-travel-target-preview-wrap="${escapedPrefix}" ${targetPreview ? "" : "hidden"}>
          <img src="${escapeHtml(targetPreview)}" alt="" data-travel-target-preview="${escapedPrefix}" />
        </div>
        <div class="tom-world-map-destination-card__icon" aria-hidden="true"><i class="fas fa-route"></i></div>
        <div class="tom-world-map-destination-card__title" data-travel-target-name="${escapedPrefix}">${targetName || getTravelTargetFallbackText()}</div>
        <div class="tom-world-map-destination-card__meta" data-travel-target-type="${escapedPrefix}">${targetType ? getTravelTargetTypeLabel(targetType) : getTravelTargetHelpText()}</div>
        <button type="button" class="tom-world-map-destination-card__clear-button" data-action="clear-travel-target" data-travel-target-prefix="${escapedPrefix}">${tr("Clear target")}</button>
      </div>
        <input type="hidden" name="${escapedPrefix}TravelTargetType" value="${escapeHtml(String(initialData.travelTargetType || ""))}" />
        <input type="hidden" name="${escapedPrefix}TravelTargetId" value="${escapeHtml(String(initialData.travelTargetId || ""))}" />
        <input type="hidden" name="${escapedPrefix}TravelTargetUuid" value="${escapeHtml(String(initialData.travelTargetUuid || ""))}" />
        <input type="hidden" name="${escapedPrefix}TravelTargetName" value="${escapeHtml(String(initialData.travelTargetName || ""))}" />
        <input type="hidden" name="${escapedPrefix}TravelTargetPreviewImage" value="${escapeHtml(targetPreview)}" />
    </section>
  `;
}

export function buildWorldMapDestinationLinksMarkup(prefix, initialData = {}, options = {}) {
  return `
    <div class="tom-world-map-destination-links">
      ${buildTravelTargetMarkup(prefix, initialData, options)}
      ${buildLinkedDocumentDropMarkup(prefix, initialData, options)}
    </div>
  `;
}

export function buildLinkedDocumentDropMarkup(prefix, initialData = {}, { showAccess = true } = {}) {
  const safePrefix = String(prefix || "linked").trim();
  const escapedPrefix = escapeHtml(safePrefix);
  const documentName = escapeHtml(String(initialData.documentName || "").trim());
  const documentType = escapeHtml(String(initialData.documentType || "").trim());
  const playerAccess = initialData.documentPlayerAccess !== false;
  return `
    <section class="tom-world-map-destination-card tom-world-map-destination-card--document">
      <div class="tom-world-map-destination-card__eyebrow">${tr("Linked document")}</div>
      <div class="tom-world-map-destination-card__control tom-world-map-destination-card__control--spacer" aria-hidden="true">
        <label>${tr("Destination")}</label>
        <div class="tom-world-map-destination-card__fake-select"></div>
      </div>
      ${showAccess ? `
        <div class="tom-world-map-destination-card__access">
          ${buildButtonSwitchMarkup(`${safePrefix}DocumentPlayerAccess`, "Player access", playerAccess, { wrapperClass: "tom-world-map-linked-document__access-switch tom-world-map-destination-card__switch" })}
        </div>
      ` : ""}
      <div class="tom-world-map-destination-card__drop" data-linked-document-drop="${escapedPrefix}" tabindex="0">
        <div class="tom-world-map-destination-card__icon" aria-hidden="true"><i class="fas fa-link"></i></div>
        <div class="tom-world-map-destination-card__title" data-linked-document-name="${escapedPrefix}">${documentName || getLinkedDocumentFallbackText()}</div>
        <div class="tom-world-map-destination-card__meta" data-linked-document-type="${escapedPrefix}">${documentType || getLinkedDocumentHelpText()}</div>
        <button type="button" class="tom-world-map-destination-card__clear-button" data-action="clear-linked-document" data-linked-document-prefix="${escapedPrefix}">${tr("Clear link")}</button>
      </div>
        <input type="hidden" name="${escapedPrefix}DocumentUuid" value="${escapeHtml(String(initialData.documentUuid || ""))}" />
        <input type="hidden" name="${escapedPrefix}DocumentType" value="${escapeHtml(String(initialData.documentType || ""))}" />
        <input type="hidden" name="${escapedPrefix}DocumentName" value="${escapeHtml(String(initialData.documentName || ""))}" />
    </section>
  `;
}

function buildTooltipAccessIcon({ type, access }) {
  const safeType = String(type || "").trim();
  const hasAccess = access === true;
  const iconClass = safeType === "document" ? "fa-book-open" : "fa-route";
  const label = safeType === "document"
    ? (hasAccess ? tr("Info access") : tr("Info locked"))
    : (hasAccess ? tr("Travel access") : tr("Travel locked"));
  return `
    <span class="tom-world-map__tooltip-access-icon tom-world-map__tooltip-access-icon--${escapeHtml(safeType)} ${hasAccess ? "is-unlocked" : "is-locked"}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <i class="fas ${iconClass}" aria-hidden="true"></i>
    </span>
  `;
}

export function buildWorldMapTooltipContent({ heading = "", body = "", documentName = "", travelAccess = null, access = null } = {}) {
  const safeHeading = escapeHtml(String(heading || "").trim());
  const safeBody = escapeHtml(String(body || "").trim()).replace(/\n/g, "<br />");
  const safeDocumentName = escapeHtml(String(documentName || "").trim());
  const accessState = access && typeof access === "object" ? access : null;
  const indicators = [];
  if (accessState?.travel === true || accessState?.travel === false) {
    indicators.push(buildTooltipAccessIcon({ type: "travel", access: accessState.travel }));
  }
  if (accessState?.document === true || accessState?.document === false) {
    indicators.push(buildTooltipAccessIcon({ type: "document", access: accessState.document }));
  }
  if (!indicators.length && (travelAccess === true || travelAccess === false)) {
    indicators.push(buildTooltipAccessIcon({ type: "travel", access: travelAccess }));
  }
  const hasAccessIndicators = indicators.length > 0;
  return `
    <div class="tom-world-map__tooltip-content">
      ${safeHeading || hasAccessIndicators ? `
        <div class="tom-world-map__tooltip-heading-row">
          ${safeHeading ? `<div class="tom-world-map__tooltip-heading">${safeHeading}</div>` : ""}
          ${hasAccessIndicators ? `<div class="tom-world-map__tooltip-access">${indicators.join("")}</div>` : ""}
        </div>
      ` : ""}
      ${safeBody ? `<div class="tom-world-map__tooltip-text">${safeBody}</div>` : ""}
      ${safeDocumentName ? `<div class="tom-world-map__tooltip-info">${tr("Linked document")}: ${safeDocumentName}</div>` : ""}
    </div>
  `;
}

export function buildWorldMapSidebarTooltip(lines = [], { documentName = "" } = {}) {
  const tooltipLines = Array.isArray(lines) ? lines : [lines];
  const safeDocumentName = String(documentName || "").trim();
  if (safeDocumentName) tooltipLines.push(`${tr("Linked document")}: ${safeDocumentName}`);
  return tooltipLines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function readLinkedDocumentDataFromDialog(html, prefix) {
  const safePrefix = String(prefix || "linked").trim();
  const accessField = html?.find?.(`[name='${safePrefix}DocumentPlayerAccess']`);
  const accessValue = String(accessField?.val?.() || "").trim().toLowerCase();
  const hasAccessField = Number(accessField?.length || 0) > 0;
  const documentPlayerAccess = hasAccessField
    ? Boolean(accessField?.prop?.("checked")) || ["1", "true", "on", "yes"].includes(accessValue)
    : true;
  return {
    documentUuid: String(html?.find?.(`[name='${safePrefix}DocumentUuid']`).val?.() || "").trim(),
    documentType: String(html?.find?.(`[name='${safePrefix}DocumentType']`).val?.() || "").trim(),
    documentName: String(html?.find?.(`[name='${safePrefix}DocumentName']`).val?.() || "").trim(),
    documentPlayerAccess
  };
}

export function readTravelTargetDataFromDialog(html, prefix) {
  const safePrefix = String(prefix || "travel").trim();
  const accessField = html?.find?.(`[name='${safePrefix}TravelPlayerAccess']`);
  const accessValue = String(accessField?.val?.() || "").trim().toLowerCase();
  const playerAccess = Boolean(accessField?.prop?.("checked")) || ["1", "true", "on", "yes"].includes(accessValue);
  return {
    travelTargetType: String(html?.find?.(`[name='${safePrefix}TravelTargetType']`).val?.() || "").trim(),
    travelTargetId: String(html?.find?.(`[name='${safePrefix}TravelTargetId']`).val?.() || "").trim(),
    travelTargetUuid: String(html?.find?.(`[name='${safePrefix}TravelTargetUuid']`).val?.() || "").trim(),
    travelTargetName: String(html?.find?.(`[name='${safePrefix}TravelTargetName']`).val?.() || "").trim(),
    travelPlayerAccess: playerAccess,
    travelCloseWorldMap: true
  };
}

export function activateTravelTargetControls(root, prefix, { resolveTarget } = {}) {
  const safePrefix = String(prefix || "travel").trim();
  const drop = root?.querySelector?.(`[data-travel-target-drop='${safePrefix}']`);
  const dropCard = drop?.closest?.(".tom-world-map-destination-card");
  const select = root?.querySelector?.(`[data-travel-target-select='${safePrefix}']`);
  const typeField = root?.querySelector?.(`[name='${safePrefix}TravelTargetType']`);
  const idField = root?.querySelector?.(`[name='${safePrefix}TravelTargetId']`);
  const uuidField = root?.querySelector?.(`[name='${safePrefix}TravelTargetUuid']`);
  const nameField = root?.querySelector?.(`[name='${safePrefix}TravelTargetName']`);
  const previewField = root?.querySelector?.(`[name='${safePrefix}TravelTargetPreviewImage']`);
  const nameText = root?.querySelector?.(`[data-travel-target-name='${safePrefix}']`);
  const typeText = root?.querySelector?.(`[data-travel-target-type='${safePrefix}']`);
  const previewWrap = root?.querySelector?.(`[data-travel-target-preview-wrap='${safePrefix}']`);
  const previewImage = root?.querySelector?.(`[data-travel-target-preview='${safePrefix}']`);
  const playerAccessField = root?.querySelector?.(`[name='${safePrefix}TravelPlayerAccess']`);
  const playerAccessToggle = root?.querySelector?.(`[data-travel-player-access-toggle='${safePrefix}']`);

  const syncPlayerAccessToggle = () => {
    const active = String(playerAccessField?.value || "").trim() === "1";
    playerAccessToggle?.classList?.toggle?.("is-active", active);
    playerAccessToggle?.setAttribute?.("aria-pressed", active ? "true" : "false");
  };
  if (playerAccessToggle instanceof HTMLButtonElement && playerAccessToggle.dataset.travelPlayerAccessBound !== safePrefix) {
    playerAccessToggle.dataset.travelPlayerAccessBound = safePrefix;
    playerAccessToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (playerAccessField instanceof HTMLInputElement) {
        playerAccessField.value = playerAccessField.value === "1" ? "0" : "1";
      }
      syncPlayerAccessToggle();
    });
  }

  const updatePreview = () => {
    const name = String(nameField?.value || "").trim();
    const type = String(typeField?.value || "").trim();
    const preview = getTravelTargetPreviewImage({
      type,
      id: String(idField?.value || "").trim(),
      uuid: String(uuidField?.value || "").trim(),
      previewImage: String(previewField?.value || "").trim()
    });
    if (nameText instanceof HTMLElement) nameText.textContent = name || getTravelTargetFallbackText();
    if (typeText instanceof HTMLElement) typeText.textContent = type ? getTravelTargetTypeLabel(type) : getTravelTargetHelpText();
    if (previewWrap instanceof HTMLElement) previewWrap.hidden = !preview;
    if (previewImage instanceof HTMLImageElement) {
      if (preview) previewImage.src = preview;
      else previewImage.removeAttribute("src");
    }
  };
  const applyTarget = (target = {}) => {
    if (!(typeField instanceof HTMLInputElement) || !(idField instanceof HTMLInputElement) || !(uuidField instanceof HTMLInputElement) || !(nameField instanceof HTMLInputElement)) return;
    typeField.value = String(target.type || "").trim();
    idField.value = String(target.id || "").trim();
    uuidField.value = String(target.uuid || "").trim();
    nameField.value = String(target.name || "").trim();
    if (previewField instanceof HTMLInputElement) previewField.value = String(target.previewImage || "").trim();
    updatePreview();
  };
  const parseSelectedTarget = () => {
    const rawValue = String(select?.value || "").trim();
    if (!rawValue) return { type: "", id: "", uuid: "", name: "" };
    try {
      const parsed = JSON.parse(rawValue);
      return {
        type: String(parsed?.type || "").trim(),
        id: String(parsed?.id || "").trim(),
        uuid: String(parsed?.uuid || "").trim(),
        name: String(select?.selectedOptions?.[0]?.textContent || "").trim(),
        previewImage: String(parsed?.previewImage || "").trim()
      };
    } catch (_error) {
      return { type: "", id: "", uuid: "", name: "" };
    }
  };
  if (select instanceof HTMLSelectElement && select.dataset.travelTargetSelectBound !== safePrefix) {
    select.dataset.travelTargetSelectBound = safePrefix;
    select.addEventListener("change", () => applyTarget(parseSelectedTarget()));
  }
  const dropTargets = [...new Set([drop, dropCard].filter((element) => element instanceof HTMLElement))];
  const setDropTargetState = (isActive) => {
    for (const target of dropTargets) target.classList.toggle("is-drop-target", isActive);
  };
  const onDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDropTargetState(true);
  };
  const onDragLeave = (event) => {
    event.preventDefault();
    setDropTargetState(false);
  };
  const onDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetState(false);
    if (typeof resolveTarget !== "function") return;
    const target = await resolveTarget(event);
    if (target) applyTarget(target);
  };
  for (const target of dropTargets) {
    if (target.dataset.travelTargetDropBound === safePrefix) continue;
    target.dataset.travelTargetDropBound = safePrefix;
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("dragleave", onDragLeave);
    target.addEventListener("drop", onDrop);
  }
  const clearButton = root?.querySelector?.(`[data-action='clear-travel-target'][data-travel-target-prefix='${safePrefix}']`);
  if (clearButton instanceof HTMLElement && clearButton.dataset.travelTargetClearBound !== safePrefix) {
    clearButton.dataset.travelTargetClearBound = safePrefix;
    clearButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (select instanceof HTMLSelectElement) select.value = "";
      applyTarget({ type: "", id: "", uuid: "", name: "" });
    });
  }
  syncPlayerAccessToggle();
  updatePreview();
}

export function activateLinkedDocumentDrop(root, prefix, { resolveDocument } = {}) {
  const safePrefix = String(prefix || "linked").trim();
  const drop = root?.querySelector?.(`[data-linked-document-drop='${safePrefix}']`);
  const dropCard = drop?.closest?.(".tom-world-map-destination-card");
  const nameField = root?.querySelector?.(`[name='${safePrefix}DocumentName']`);
  const typeField = root?.querySelector?.(`[name='${safePrefix}DocumentType']`);
  const uuidField = root?.querySelector?.(`[name='${safePrefix}DocumentUuid']`);
  const nameText = root?.querySelector?.(`[data-linked-document-name='${safePrefix}']`);
  const typeText = root?.querySelector?.(`[data-linked-document-type='${safePrefix}']`);
  const updatePreview = () => {
    const name = String(nameField?.value || "").trim();
    const type = String(typeField?.value || "").trim();
    if (nameText instanceof HTMLElement) nameText.textContent = name || getLinkedDocumentFallbackText();
    if (typeText instanceof HTMLElement) typeText.textContent = type || getLinkedDocumentHelpText();
  };
  const applyDocument = (document) => {
    if (!document || !(uuidField instanceof HTMLInputElement) || !(typeField instanceof HTMLInputElement) || !(nameField instanceof HTMLInputElement)) return;
    uuidField.value = String(document.uuid || "").trim();
    typeField.value = String(document.documentName || "").trim();
    nameField.value = String(document.name || "").trim();
    updatePreview();
  };
  const dropTargets = [...new Set([drop, dropCard].filter((element) => element instanceof HTMLElement))];
  const setDropTargetState = (isActive) => {
    for (const target of dropTargets) target.classList.toggle("is-drop-target", isActive);
  };
  const onDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDropTargetState(true);
  };
  const onDragLeave = (event) => {
    event.preventDefault();
    setDropTargetState(false);
  };
  const onDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetState(false);
    if (typeof resolveDocument !== "function") return;
    const document = await resolveDocument(event);
    applyDocument(document);
  };
  for (const target of dropTargets) {
    if (target.dataset.linkedDocumentDropBound === safePrefix) continue;
    target.dataset.linkedDocumentDropBound = safePrefix;
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("dragleave", onDragLeave);
    target.addEventListener("drop", onDrop);
  }
  const clearButton = root?.querySelector?.(`[data-action='clear-linked-document'][data-linked-document-prefix='${safePrefix}']`);
  if (clearButton instanceof HTMLElement && clearButton.dataset.linkedDocumentClearBound !== safePrefix) {
    clearButton.dataset.linkedDocumentClearBound = safePrefix;
    clearButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (uuidField instanceof HTMLInputElement) uuidField.value = "";
      if (typeField instanceof HTMLInputElement) typeField.value = "";
      if (nameField instanceof HTMLInputElement) nameField.value = "";
      updatePreview();
    });
  }
  updatePreview();
}
