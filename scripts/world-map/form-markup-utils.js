import { escapeHtml } from "../helpers.js";
import { translate as tr } from "../localization.js";

export function buildTextInputGroup(name, label, value = "", { autofocus = false, wrapperClass = "" } = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <input type="text" name="${escapeHtml(name)}" value="${escapeHtml(String(value || ""))}" ${autofocus ? "autofocus" : ""} />
    </div>
  `;
}

export function buildNumberInputGroup(name, label, value, {
  min = null,
  max = null,
  step = null,
  wrapperClass = ""
} = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  const attributes = [
    min !== null ? `min="${escapeHtml(String(min))}"` : "",
    max !== null ? `max="${escapeHtml(String(max))}"` : "",
    step !== null ? `step="${escapeHtml(String(step))}"` : ""
  ].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <input type="number" ${attributes} name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" />
    </div>
  `;
}

export function buildRangeInputGroup(name, label, value, {
  min = null,
  max = null,
  step = null,
  wrapperClass = ""
} = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  const attributes = [
    min !== null ? `min="${escapeHtml(String(min))}"` : "",
    max !== null ? `max="${escapeHtml(String(max))}"` : "",
    step !== null ? `step="${escapeHtml(String(step))}"` : ""
  ].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <input type="range" ${attributes} name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" />
    </div>
  `;
}

export function buildColorInputGroup(name, label, value, fallback, { wrapperClass = "" } = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  const safeValue = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <input type="color" name="${escapeHtml(name)}" value="${escapeHtml(safeValue)}" />
    </div>
  `;
}

export function buildTextareaGroup(name, label, value = "", { rows = 4, wrapperClass = "" } = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <textarea name="${escapeHtml(name)}" rows="${escapeHtml(String(rows))}">${escapeHtml(String(value || ""))}</textarea>
    </div>
  `;
}

export function buildSelectGroup(name, label, optionsMarkup, { wrapperClass = "" } = {}) {
  const classes = ["form-group", wrapperClass].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <label>${tr(label)}</label>
      <select name="${escapeHtml(name)}">${optionsMarkup}</select>
    </div>
  `;
}

export function buildCheckboxMarkup(name, label, checked = false, { wrapperClass = "" } = {}) {
  const classes = ["checkbox", wrapperClass].filter(Boolean).join(" ");
  return `<label class="${classes}"><input type="checkbox" name="${escapeHtml(name)}" ${checked ? "checked" : ""} /> <span>${tr(label)}</span></label>`;
}

export function buildSwitchMarkup(name, label, checked = false, { wrapperClass = "" } = {}) {
  const classes = ["tom-world-map-line-clean-dialog__switch", wrapperClass].filter(Boolean).join(" ");
  return `
    <label class="${classes}">
      <span>${tr(label)}</span>
      <input type="checkbox" name="${escapeHtml(name)}" ${checked ? "checked" : ""} />
      <span class="tom-world-map-line-clean-dialog__switch-track" aria-hidden="true">
        <span class="tom-world-map-line-clean-dialog__switch-knob"></span>
      </span>
    </label>
  `;
}

export function buildButtonSwitchMarkup(name, label, checked = false, { wrapperClass = "" } = {}) {
  const classes = ["tom-world-map-line-clean-dialog__switch", wrapperClass].filter(Boolean).join(" ");
  const safeName = escapeHtml(name);
  const isChecked = Boolean(checked);
  return `
    <div class="${classes}">
      <span>${tr(label)}</span>
      <input type="hidden" name="${safeName}" value="${isChecked ? "1" : "0"}" />
      <button
        type="button"
        class="tom-world-map-button-switch${isChecked ? " is-active" : ""}"
        data-world-map-button-switch="${safeName}"
        aria-pressed="${isChecked ? "true" : "false"}"
        aria-label="${tr(label)}"
      >
        <span class="tom-world-map-line-clean-dialog__switch-track" aria-hidden="true">
          <span class="tom-world-map-line-clean-dialog__switch-knob"></span>
        </span>
      </button>
    </div>
  `;
}

export function buildSelectOptions(entries = [], selectedValue = "") {
  const selected = String(selectedValue ?? "").trim();
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const value = String(entry?.value ?? entry?.id ?? "").trim();
      const label = String(entry?.label ?? value).trim();
      return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function optionEntries(definitions = []) {
  return definitions.map(([value, label]) => ({ value, label: tr(label) }));
}

export function buildOutlineModeOptions(selectedValue = "outer") {
  return buildSelectOptions(optionEntries([
    ["outer", "Outer"],
    ["center", "Center"]
  ]), selectedValue);
}

export function buildRegionFillStyleOptions(selectedValue = "solid") {
  return buildSelectOptions(optionEntries([
    ["solid", "Solid"],
    ["hatch", "Hatch"],
    ["crosshatch", "Crosshatch"],
    ["dots", "Dots"]
  ]), selectedValue);
}

export function buildStrokeStyleOptions(selectedValue = "solid") {
  return buildSelectOptions(optionEntries([
    ["solid", "Solid"],
    ["dashed", "Dashed"],
    ["dotted", "Dotted"],
    ["dashdot", "Dash dot"]
  ]), selectedValue);
}

export function buildLineCapOptions(selectedValue = "round") {
  return buildSelectOptions(optionEntries([
    ["round", "Rounded"],
    ["butt", "Flat"],
    ["square", "Square"]
  ]), selectedValue);
}

export function buildLinePointStyleOptions(selectedValue = "none") {
  return buildSelectOptions(optionEntries([
    ["none", "None"],
    ["circle", "Circle"],
    ["square", "Square"]
  ]), selectedValue);
}
