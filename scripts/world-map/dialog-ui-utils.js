import { applyThemeInlineStyleToHost } from "../helpers.js";
import { MODULE_ID, SETTINGS } from "../constants.js";

function getSavedDialogLayout(storageKey) {
  if (!storageKey || !globalThis.game?.settings) return null;
  try {
    const state = game.settings.get(MODULE_ID, SETTINGS.DIALOG_LAYOUT) || {};
    const entry = state?.[storageKey];
    const width = Number(entry?.width);
    const height = Number(entry?.height);
    const left = Number(entry?.left);
    const top = Number(entry?.top);
    if (!Number.isFinite(width) && !Number.isFinite(height) && !Number.isFinite(left) && !Number.isFinite(top)) return null;
    return {
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : null
    };
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not read dialog layout state`, error);
    return null;
  }
}

async function saveDialogLayout(storageKey, { width, height, left, top } = {}) {
  if (!storageKey || !globalThis.game?.settings) return;
  const safeWidth = Math.round(Number(width));
  const safeHeight = Math.round(Number(height));
  const safeLeft = Math.round(Number(left));
  const safeTop = Math.round(Number(top));
  if (!Number.isFinite(safeWidth) && !Number.isFinite(safeHeight) && !Number.isFinite(safeLeft) && !Number.isFinite(safeTop)) return;
  try {
    const state = { ...(game.settings.get(MODULE_ID, SETTINGS.DIALOG_LAYOUT) || {}) };
    state[storageKey] = {
      ...(state[storageKey] || {}),
      ...(Number.isFinite(safeWidth) ? { width: safeWidth } : {}),
      ...(Number.isFinite(safeHeight) ? { height: safeHeight } : {}),
      ...(Number.isFinite(safeLeft) ? { left: safeLeft } : {}),
      ...(Number.isFinite(safeTop) ? { top: safeTop } : {})
    };
    await game.settings.set(MODULE_ID, SETTINGS.DIALOG_LAYOUT, state);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not save dialog layout state`, error);
  }
}

function saveDialogLayoutFromRoot(storageKey, root) {
  if (!storageKey || !(root instanceof HTMLElement)) return;
  const rect = root.getBoundingClientRect();
  void saveDialogLayout(storageKey, {
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top
  });
}

function isWorldMapEditorDialog(root) {
  return root instanceof HTMLElement && (
    root.classList.contains("tom-world-map-pin-dialog-host")
    || root.classList.contains("tom-world-map-object-overlay-host")
    || root.classList.contains("tom-world-map-region-clean-dialog-host")
    || root.classList.contains("tom-world-map-line-clean-dialog-host")
  );
}

function applyWorldMapDialogBaseTheme(dialog, moduleId, width = "24rem", theme = null) {
  const root = dialog?.element?.[0];
  if (!(root instanceof HTMLElement)) return null;

  if (theme) applyThemeInlineStyleToHost(root, theme);

  root.classList.add(
    moduleId,
    "theatre-canvas-drop-dialog",
    "tom-theme-root",
    "tom-theme-area--content",
    "footlights-themed-window",
    "footlights-themed-host"
  );
  root.classList.remove("tom-themed-window");
  root.style.setProperty("width", width || "24rem");
  root.style.setProperty("max-width", "calc(100vw - 2rem)");
  root.style.setProperty("min-width", "28rem");
  root.style.setProperty("background", "var(--tom-app-background, var(--tom-app-background-solid, #08121f))");
  root.style.setProperty("color", "var(--tom-content-text, var(--tom-color-text))");

  root.querySelectorAll(".window-header, .dialog-buttons").forEach((element) => {
    element.classList.add("tom-theme-area--navigation");
  });
  root.querySelectorAll(".window-content, .dialog-content, form").forEach((element) => {
    element.classList.add("tom-theme-area--content");
  });

  return root;
}

function applyWorldMapEditorDialogShell(root, {
  contentPadding = "0.85rem",
  minWidth = "28rem",
  width = null
} = {}) {
  if (!(root instanceof HTMLElement)) return;

  root.classList.add("tom-world-map-editor-dialog-host");
  root.style.setProperty("--tom-world-map-dialog-content-padding", contentPadding);
  root.style.setProperty("--tom-world-map-dialog-min-width", minWidth);
  if (width) root.style.setProperty("width", width, "important");
}

export function applyWorldMapDialogTheme(dialog, {
  moduleId,
  width = null,
  widthCss = null,
  hostClasses = [],
  themeState = null,
  manualResize = null
} = {}) {
  const savedLayout = getSavedDialogLayout(manualResize?.storageKey);
  const effectiveWidth = savedLayout?.width ?? width;
  const effectiveWidthCss = savedLayout?.width ? `${savedLayout.width}px` : (widthCss ?? (effectiveWidth ? `${effectiveWidth}px` : undefined));
  const root = applyWorldMapDialogBaseTheme(dialog, moduleId, effectiveWidthCss, themeState);
  if (!root) return null;
  for (const className of hostClasses) {
    if (className) root.classList.add(className);
  }
  if (isWorldMapEditorDialog(root)) applyWorldMapEditorDialogShell(root);
  if ((effectiveWidth || savedLayout?.height || savedLayout?.left != null || savedLayout?.top != null) && typeof dialog.setPosition === "function" && root.dataset.tomManualResizing !== "true") {
    const nextPosition = {};
    if (effectiveWidth) nextPosition.width = effectiveWidth;
    if (savedLayout?.height) nextPosition.height = savedLayout.height;
    if (savedLayout?.left != null) nextPosition.left = savedLayout.left;
    if (savedLayout?.top != null) nextPosition.top = savedLayout.top;
    dialog.setPosition(nextPosition);
    if (effectiveWidth) root.style.setProperty("width", `${effectiveWidth}px`, "important");
    if (savedLayout?.height) root.style.setProperty("height", `${savedLayout.height}px`, "important");
    if (savedLayout?.left != null) root.style.setProperty("left", `${savedLayout.left}px`, "important");
    if (savedLayout?.top != null) root.style.setProperty("top", `${savedLayout.top}px`, "important");
  }
  if (manualResize) bindWorldMapManualDialogResize(dialog, root, manualResize);
  if (manualResize?.storageKey && !root.dataset.tomDialogLayoutCloseBound) {
    root.dataset.tomDialogLayoutCloseBound = "true";
    const originalClose = dialog.close?.bind(dialog);
    if (typeof originalClose === "function") {
      dialog.close = (...args) => {
        saveDialogLayoutFromRoot(manualResize.storageKey, root);
        return originalClose(...args);
      };
    }
  }
  if (isWorldMapEditorDialog(root)) {
    bindWorldMapColorControls(root);
    bindWorldMapButtonSwitches(root);
    applyWorldMapEditorSurfaceStyles(root);
  }
  return root;
}

function detachFoundryWindowContentClass(root) {
  const content = root?.querySelector?.(".window-content");
  if (!(content instanceof HTMLElement)) return null;
  content.classList.add("tom-world-map-dialog-content-shell");
  content.classList.remove("window-content");
  return content;
}

function bindWorldMapColorControls(root) {
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll("[data-line-color-control]").forEach((control) => {
    if (control.dataset.tomLineColorBound) return;
    control.dataset.tomLineColorBound = "true";
    const colorInput = control.querySelector("[data-line-color-input]");
    const hexInput = control.querySelector("[data-line-color-hex]");
    const swatch = control.querySelector(".tom-world-map-line-clean-dialog__color-swatch");
    if (!(colorInput instanceof HTMLInputElement) || !(hexInput instanceof HTMLInputElement)) return;
    const applyHexChrome = () => {
      hexInput.style.setProperty("background", "transparent", "important");
      hexInput.style.setProperty("background-image", "none", "important");
      hexInput.style.setProperty("border", "0", "important");
      hexInput.style.setProperty("border-radius", "0", "important");
      hexInput.style.setProperty("box-shadow", "none", "important");
      hexInput.style.setProperty("outline", "0", "important");
      hexInput.style.setProperty("padding", "0", "important");
      hexInput.style.setProperty("min-height", "0", "important");
      hexInput.style.setProperty("height", "auto", "important");
    };
    const syncHex = () => {
      hexInput.value = String(colorInput.value || "").toUpperCase();
      applyHexChrome();
      if (swatch instanceof HTMLElement) {
        swatch.style.setProperty("--tom-world-map-line-swatch-color", colorInput.value || "transparent");
      }
    };
    colorInput.addEventListener("input", syncHex);
    colorInput.addEventListener("change", syncHex);
    hexInput.addEventListener("change", () => {
      const nextValue = String(hexInput.value || "").trim();
      if (/^#[0-9a-f]{6}$/i.test(nextValue)) {
        colorInput.value = nextValue;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
        colorInput.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        syncHex();
      }
    });
    syncHex();
  });
}

function bindWorldMapButtonSwitches(root) {
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll("[data-world-map-button-switch]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement) || button.dataset.tomButtonSwitchBound) return;
    const fieldName = String(button.dataset.worldMapButtonSwitch || "").trim();
    const field = fieldName && globalThis.CSS?.escape
      ? root.querySelector(`input[type="hidden"][name="${CSS.escape(fieldName)}"]`)
      : button.parentElement?.querySelector?.("input[type='hidden']");
    const sync = () => {
      const active = String(field?.value || "").trim() === "1";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    };
    button.dataset.tomButtonSwitchBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (field instanceof HTMLInputElement) {
        field.value = field.value === "1" ? "0" : "1";
      }
      sync();
    });
    sync();
  });
}

function applyWorldMapEditorSurfaceStyles(root) {
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll([
    ".tom-theme-content-surface",
    ".tom-world-map-pin-dialog__style-card",
    ".tom-world-map-edit-dialog__card",
    ".tom-world-map-region-clean-dialog__card",
    ".tom-world-map-region-clean-dialog__style-card",
    ".tom-world-map-line-clean-dialog__identity"
  ].join(",")).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.style.setProperty("background", "var(--tom-content-surface-bg, var(--tom-content-container-bg, rgba(16, 29, 43, 0.94)))", "important");
    element.style.setProperty("color", "var(--tom-content-text, var(--tom-color-text))", "important");
    element.style.setProperty("border", "var(--tom-content-border-2-width, 1px) solid var(--tom-content-border-2, rgba(126, 186, 236, 0.24))", "important");
    element.style.setProperty("border-radius", "var(--tom-content-surface-radius, 12px)", "important");
    element.style.setProperty("box-shadow", "var(--tom-content-surface-shadow, none)", "important");
  });
}

export function applyWorldMapRegionEditorTheme(root) {
  if (!(root instanceof HTMLElement)) return;
  root.classList.add(
    "dialog",
    "footlights-themed-window",
    "theatre-canvas-drop-dialog",
    "tom-theme-root",
    "tom-theme-area--content",
    "tom-world-map-editor-dialog-host",
    "tom-world-map-pin-dialog-host",
    "tom-world-map-region-clean-dialog-host"
  );
  detachFoundryWindowContentClass(root);

  const currentWidth = root.style.getPropertyValue("width") || "760px";
  applyWorldMapEditorDialogShell(root, {
    width: currentWidth,
    minWidth: "28rem",
    contentPadding: "0.85rem"
  });

  bindWorldMapColorControls(root);
  bindWorldMapButtonSwitches(root);
  applyWorldMapEditorSurfaceStyles(root);
}

export function applyWorldMapLineEditorTheme(root) {
  if (!(root instanceof HTMLElement)) return;
  root.classList.add(
    "dialog",
    "footlights-themed-window",
    "theatre-canvas-drop-dialog",
    "tom-theme-root",
    "tom-theme-area--content",
    "tom-world-map-editor-dialog-host",
    "tom-world-map-pin-dialog-host",
    "tom-world-map-line-clean-dialog-host"
  );
  detachFoundryWindowContentClass(root);

  applyWorldMapEditorDialogShell(root, {
    minWidth: "36rem",
    contentPadding: "1.35rem"
  });

  bindWorldMapColorControls(root);
  bindWorldMapButtonSwitches(root);
  applyWorldMapEditorSurfaceStyles(root);
}

export function bindWorldMapManualDialogResize(dialog, root, {
  minWidth = 420,
  minHeight = 300,
  storageKey = ""
} = {}) {
  if (!(root instanceof HTMLElement)) return;
  const foundryResizeHandle = root.querySelector(".window-resizable-handle");
  if (foundryResizeHandle instanceof HTMLElement) {
    foundryResizeHandle.dataset.tomManualResizeBound = "true";
    foundryResizeHandle.style.setProperty("pointer-events", "none", "important");
    foundryResizeHandle.style.setProperty("display", "none", "important");
  }
  let resizeHandle = root.querySelector(".tom-world-map-manual-resize-handle");
  if (!(resizeHandle instanceof HTMLElement)) {
    resizeHandle = document.createElement("div");
    resizeHandle.className = "tom-world-map-manual-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");
    resizeHandle.innerHTML = '<i class="fas fa-up-right-and-down-left-from-center" aria-hidden="true"></i>';
    root.appendChild(resizeHandle);
  }
  root.style.setProperty("position", root.style.position || "absolute", "important");
  resizeHandle.style.setProperty("pointer-events", "auto", "important");
  resizeHandle.style.setProperty("cursor", "nwse-resize", "important");
  if (resizeHandle.dataset.tomManualResizeBound) return;
  resizeHandle.dataset.tomManualResizeBound = "true";
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startLeft = 0;
  let startTop = 0;
  const applyDialogSize = (width, height) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    root.style.setProperty("width", `${width}px`, "important");
    root.style.setProperty("height", `${height}px`, "important");
    root.style.setProperty("min-width", `${minWidth}px`, "important");
    root.style.setProperty("min-height", `${minHeight}px`, "important");
    root.style.setProperty("max-width", "calc(100vw - 2rem)", "important");
    root.style.setProperty("max-height", "calc(100vh - 2rem)", "important");
    if (dialog.position) {
      dialog.position.left = startLeft;
      dialog.position.top = startTop;
      dialog.position.width = nextWidth;
      dialog.position.height = nextHeight;
    }
    if (dialog.options) {
      dialog.options.width = nextWidth;
      dialog.options.height = nextHeight;
    }
    const content = root.querySelector(".tom-world-map-dialog-content-shell, .window-content");
    if (content instanceof HTMLElement) {
      content.style.setProperty("min-width", "0", "important");
      content.style.setProperty("width", "100%", "important");
    }
  };
  const onMouseMove = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const clientX = Number(event.clientX ?? event.pageX ?? startX);
    const clientY = Number(event.clientY ?? event.pageY ?? startY);
    const nextWidth = Math.max(minWidth, startWidth + (clientX - startX));
    const nextHeight = Math.max(minHeight, startHeight + (clientY - startY));
    applyDialogSize(nextWidth, nextHeight);
  };
  const onMouseUp = (event) => {
    resizeHandle.releasePointerCapture?.(event?.pointerId);
    root.dataset.tomManualResizing = "false";
    const rect = root.getBoundingClientRect();
    void saveDialogLayout(storageKey, {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
    window.removeEventListener("pointermove", onMouseMove, true);
    window.removeEventListener("pointerup", onMouseUp, true);
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
  };
  const onMouseDown = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const rect = root.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startWidth = rect.width;
    startHeight = rect.height;
    startLeft = Number(dialog.position?.left ?? rect.left);
    startTop = Number(dialog.position?.top ?? rect.top);
    root.dataset.tomManualResizing = "true";
    applyDialogSize(startWidth, startHeight);
    resizeHandle.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onMouseMove, true);
    window.addEventListener("pointerup", onMouseUp, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
  };
  resizeHandle.addEventListener("pointerdown", onMouseDown, { capture: true });
  resizeHandle.addEventListener("mousedown", onMouseDown, { capture: true });
}

export function bindDialogLiveChange(root, selector, onChange) {
  if (!(root instanceof HTMLElement) || typeof onChange !== "function") return;
  root.querySelectorAll?.(selector).forEach((field) => {
    field.addEventListener("input", onChange);
    field.addEventListener("change", onChange);
  });
  onChange();
}
