import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { TheatreWorldMapApplication } from "./theatre-world-map.js";

export class TheatreWorldMapStageApplication extends TheatreWorldMapApplication {
  constructor(options = {}) {
    super(options);
    this._stageLeftSidebarVisible = null;
    this._stageRightSidebarVisible = null;
    this._boundStageResize = this._onStageResize.bind(this);
    this._isStageResizeBound = false;
    this._stageResizeObserver = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-world-map-stage`,
      title: tr("World Map Stage"),
      classes: [MODULE_ID, "theatre-overlay-app", "theatre-world-map-stage-app"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-world-map-stage.hbs`,
      popOut: false,
      minimizable: false,
      resizable: false,
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  async getData() {
    const data = await super.getData();
    const worldMap = data.map ?? TheatreStore.getWorldMapById(this.mapId);
    const fullscreenSettings = worldMap?.fullscreenSettings ?? TheatreStore._getDefaultWorldMapFullscreenSettings();
    const hideFoundryUiOnOpen = Boolean(fullscreenSettings.uiHidden);
    const isLeftSidebarVisible = this._stageLeftSidebarVisible ?? (hideFoundryUiOnOpen ? false : Boolean(fullscreenSettings.sharedLeftSidebarVisible));
    const isRightSidebarVisible = this._stageRightSidebarVisible ?? (hideFoundryUiOnOpen ? false : Boolean(fullscreenSettings.sharedRightSidebarVisible));
    this._stageLeftSidebarVisible = isLeftSidebarVisible;
    this._stageRightSidebarVisible = isRightSidebarVisible;

    return {
      ...data,
      isLeftSidebarVisible,
      isRightSidebarVisible,
      backdropBlurEnabled: fullscreenSettings.backdropBlurEnabled !== false,
      hasBackdropMedia: Boolean(String(fullscreenSettings.backdropImage || "").trim()),
      backdropMediaStyle: this._buildBackdropMediaStyle(fullscreenSettings),
      backdropDimStyle: `opacity:${Number(fullscreenSettings.backdropDarkness || 0)};`,
      themeInlineStyle: data.themeInlineStyle || buildThemeInlineStyle(TheatreStore.getThemeState())
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    html.find("[data-action='toggle-stage-left-sidebar']").on("click", this._onToggleStageLeftSidebar.bind(this));
    html.find("[data-action='toggle-stage-right-sidebar']").on("click", this._onToggleStageRightSidebar.bind(this));
    html.find("[data-action='close-stage-world-map']").on("click", this._onCloseStageWorldMap.bind(this));
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
    this._updateStageShellLayout();
    this._bindStageResizeListener();
    this._bindStageResizeObserver();
  }

  async close(options) {
    this._unbindStageResizeListener();
    this._unbindStageResizeObserver();
    this._clearSharedFoundrySidebarInlineState();
    this._clearStageBodyState();
    return super.close(options);
  }

  _onStageResize() {
    this._updateStageShellLayout();
  }

  _onToggleRightSidebar(event) {
    event.preventDefault();
    this._isRightSidebarCollapsed = !this._isRightSidebarCollapsed;
    const root = this.element?.[0];
    const layout = root?.querySelector(".tom-world-map__layout");
    const sidebar = root?.querySelector(".tom-world-map__sidebar--right");
    const button = root?.querySelector("[data-action='toggle-map-right-sidebar']");
    const icon = button?.querySelector("i");
    if (layout) {
      layout.classList.toggle("is-right-collapsed", Boolean(this._isRightSidebarCollapsed));
    }
    if (sidebar) {
      sidebar.toggleAttribute("hidden", Boolean(this._isRightSidebarCollapsed));
      sidebar.setAttribute("aria-hidden", this._isRightSidebarCollapsed ? "true" : "false");
    }
    if (icon) {
      icon.classList.toggle("fa-chevron-left", Boolean(this._isRightSidebarCollapsed));
      icon.classList.toggle("fa-chevron-right", !this._isRightSidebarCollapsed);
    }
    if (button) {
      const label = this._isRightSidebarCollapsed ? tr("Show pins") : tr("Hide pins");
      button.setAttribute("title", label);
      button.setAttribute("aria-label", label);
    }
    window.setTimeout(() => {
      this._leafletMap?.invalidateSize?.(false);
    }, 40);
  }

  _bindStageResizeListener() {
    if (this._isStageResizeBound) return;
    window.addEventListener("resize", this._boundStageResize);
    this._isStageResizeBound = true;
  }

  _unbindStageResizeListener() {
    if (!this._isStageResizeBound) return;
    window.removeEventListener("resize", this._boundStageResize);
    this._isStageResizeBound = false;
  }

  _unbindStageResizeObserver() {
    this._stageResizeObserver?.disconnect?.();
    this._stageResizeObserver = null;
  }

  _bindStageResizeObserver() {
    this._unbindStageResizeObserver();
    if (typeof ResizeObserver === "undefined") return;
    const root = this.element?.[0];
    const doc = root?.ownerDocument;
    const body = doc?.body;
    this._stageResizeObserver = new ResizeObserver(() => {
      this._updateStageShellLayout();
    });
    if (root instanceof HTMLElement) {
      this._stageResizeObserver.observe(root);
    }
    if (body instanceof HTMLElement) {
      this._stageResizeObserver.observe(body);
    }
  }

  _getFullscreenSettings() {
    return TheatreStore.getWorldMapById(this.mapId)?.fullscreenSettings ?? TheatreStore._getDefaultWorldMapFullscreenSettings();
  }

  _applyStageBodyState() {
    const body = document.body;
    if (!body) return;
    const settings = this._getFullscreenSettings();
    body.classList.add("tom-world-map-stage-active");
    body.classList.toggle("tom-world-map-stage-ui-hidden", Boolean(settings.uiHidden));
    body.classList.toggle("tom-world-map-stage-shared-left-sidebar-open", Boolean(this._stageLeftSidebarVisible));
    body.classList.toggle("tom-world-map-stage-shared-right-sidebar-open", Boolean(this._stageRightSidebarVisible));
    this._syncSharedFoundrySidebarState();
  }

  _clearStageBodyState() {
    const body = document.body;
    if (!body) return;
    body.classList.remove(
      "tom-world-map-stage-active",
      "tom-world-map-stage-ui-hidden",
      "tom-world-map-stage-shared-left-sidebar-open",
      "tom-world-map-stage-shared-right-sidebar-open"
    );
  }

  _updateStageSidebarButtons() {
    const root = this.element?.[0];
    if (!root) return;
    const leftButton = root.querySelector("[data-action='toggle-stage-left-sidebar']");
    const leftIcon = leftButton?.querySelector("i");
    if (leftIcon) {
      leftIcon.classList.toggle("fa-chevron-left", Boolean(this._stageLeftSidebarVisible));
      leftIcon.classList.toggle("fa-chevron-right", !this._stageLeftSidebarVisible);
    }
    if (leftButton) {
      const label = this._stageLeftSidebarVisible ? tr("Hide left sidebar") : tr("Show left sidebar");
      leftButton.setAttribute("title", label);
      leftButton.setAttribute("aria-label", label);
    }

    const rightButton = root.querySelector("[data-action='toggle-stage-right-sidebar']");
    const rightIcon = rightButton?.querySelector("i");
    if (rightIcon) {
      rightIcon.classList.toggle("fa-chevron-right", Boolean(this._stageRightSidebarVisible));
      rightIcon.classList.toggle("fa-chevron-left", !this._stageRightSidebarVisible);
    }
    if (rightButton) {
      const label = this._stageRightSidebarVisible ? tr("Hide right sidebar") : tr("Show right sidebar");
      rightButton.setAttribute("title", label);
      rightButton.setAttribute("aria-label", label);
    }
  }

  _onToggleStageLeftSidebar(event) {
    event.preventDefault();
    this._stageLeftSidebarVisible = !this._stageLeftSidebarVisible;
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
    window.requestAnimationFrame(() => this._updateStageShellLayout());
  }

  _onToggleStageRightSidebar(event) {
    event.preventDefault();
    this._stageRightSidebarVisible = !this._stageRightSidebarVisible;
    this._applyStageBodyState();
    this._updateStageSidebarButtons();
    window.requestAnimationFrame(() => this._updateStageShellLayout());
  }

  _onCloseStageWorldMap(event) {
    event.preventDefault();
    void this.close();
  }

  _buildBackdropMediaStyle(settings) {
    const imagePath = String(settings?.backdropImage || "").trim();
    if (!imagePath) return "";
    const scaleValue = Number(settings?.backdropImageScale);
    const scale = Number.isFinite(scaleValue) ? Math.max(0.1, Math.min(4, scaleValue)) : 1;
    const repeat = ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(settings?.backdropImageRepeat || "").trim())
      ? String(settings.backdropImageRepeat).trim()
      : "repeat";
    const escapedPath = imagePath.replaceAll("\\", "/").replaceAll("\"", "\\\"");
    return [
      "display:block",
      `background-image:url(\"${escapedPath}\")`,
      "background-position:center center",
      `background-repeat:${repeat}`,
      `background-size:${(scale * 100).toFixed(0)}% auto`
    ].join(";");
  }

  _syncSharedFoundrySidebarState() {
    const doc = this.element?.[0]?.ownerDocument ?? document;
    const settings = this._getFullscreenSettings();
    const showRightSidebar = Boolean(this._stageRightSidebarVisible);
    const showLeftSidebar = Boolean(this._stageLeftSidebarVisible);

    const rightTargets = [
      doc.querySelector("#ui-right"),
      doc.querySelector("#sidebar"),
      doc.querySelector("#sidebar-tabs"),
      doc.querySelector("#sidebar-content"),
      ...Array.from(doc.querySelectorAll(".sidebar-tab.active"))
    ].filter(Boolean);

    const leftTargets = [
      doc.querySelector("#ui-left"),
      doc.querySelector("#navigation"),
      doc.querySelector("#controls"),
      doc.querySelector("#players")
    ].filter(Boolean);

    for (const element of rightTargets) {
      if (!(element instanceof HTMLElement)) continue;
      if (showRightSidebar) {
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("pointer-events", "auto", "important");
        element.style.setProperty("transform", "translateX(0)", "important");
      } else if (Boolean(settings.uiHidden)) {
        element.style.removeProperty("visibility");
        element.style.removeProperty("opacity");
        element.style.removeProperty("pointer-events");
        element.style.removeProperty("transform");
      }
    }

    for (const element of leftTargets) {
      if (!(element instanceof HTMLElement)) continue;
      if (showLeftSidebar) {
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("pointer-events", "auto", "important");
        element.style.setProperty("transform", "translateX(0)", "important");
      } else if (Boolean(settings.uiHidden)) {
        element.style.removeProperty("visibility");
        element.style.removeProperty("opacity");
        element.style.removeProperty("pointer-events");
        element.style.removeProperty("transform");
      }
    }
  }

  _clearSharedFoundrySidebarInlineState() {
    const doc = this.element?.[0]?.ownerDocument ?? document;
    const targets = [
      doc.querySelector("#ui-right"),
      doc.querySelector("#sidebar"),
      doc.querySelector("#sidebar-tabs"),
      doc.querySelector("#sidebar-content"),
      doc.querySelector("#ui-left"),
      doc.querySelector("#navigation"),
      doc.querySelector("#controls"),
      doc.querySelector("#players"),
      ...Array.from(doc.querySelectorAll(".sidebar-tab.active"))
    ].filter(Boolean);

    for (const element of targets) {
      if (!(element instanceof HTMLElement)) continue;
      element.style.removeProperty("visibility");
      element.style.removeProperty("opacity");
      element.style.removeProperty("pointer-events");
      element.style.removeProperty("transform");
    }
  }

  _updateStageShellLayout() {
    const root = this.element?.[0];
    const stageShell = root?.querySelector(".tom-stage-shell");
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!(stageShell instanceof HTMLElement) || !worldMap) return;

    const baseInsets = {
      top: 24,
      right: this._stageRightSidebarVisible ? 408 : 24,
      bottom: 28,
      left: this._stageLeftSidebarVisible ? 286 : 24
    };

    stageShell.style.left = `${baseInsets.left}px`;
    stageShell.style.top = `${baseInsets.top}px`;
    stageShell.style.right = `${baseInsets.right}px`;
    stageShell.style.bottom = `${baseInsets.bottom}px`;
    stageShell.style.width = "";
    stageShell.style.height = "";
  }
}
