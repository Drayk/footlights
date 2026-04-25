import { MODULE_ID } from "../constants.js";
import { applyTheatreDialogTheme, applyThemeInlineStyleToHost, buildThemeInlineStyle, escapeHtml, openImagePickerForInput, randomId, themeFontFamilyToCss, themeSizeToCss, themeStopToCss } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { ensureLeaflet } from "../vendor/leaflet-loader.js";

function normalizeHexColor(value, fallback = "#7ebaec") {
  const normalized = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizePinSize(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.7, Math.min(2.4, numeric));
}

function hexToRgba(value, alpha = 1) {
  const normalized = String(value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return `rgba(13, 23, 38, ${alpha})`;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const safeAlpha = Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1;
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function buildTextShadowCss({ color = "#000000", distance = 2, blur = 8, opacity = 0.7 } = {}) {
  const normalizedColor = normalizeHexColor(color, "#000000");
  const safeDistance = Number.isFinite(Number(distance)) ? Math.max(0, Math.min(64, Number(distance))) : 2;
  const safeBlur = Number.isFinite(Number(blur)) ? Math.max(0, Math.min(64, Number(blur))) : 8;
  const safeOpacity = Number.isFinite(Number(opacity)) ? Math.max(0, Math.min(1, Number(opacity))) : 0.7;
  return `${safeDistance}px ${safeDistance}px ${safeBlur.toFixed(2)}px ${hexToRgba(normalizedColor, safeOpacity)}`;
}

function buildTextOutlineShadowLayers({ color = "#101722", width = 0, mode = "outer" } = {}) {
  const normalizedColor = normalizeHexColor(color, "#101722");
  const safeWidth = Number.isFinite(Number(width)) ? Math.max(0, Math.min(12, Number(width))) : 0;
  if (safeWidth <= 0 || mode !== "outer") return "";
  const offsets = [
    [safeWidth, 0],
    [-safeWidth, 0],
    [0, safeWidth],
    [0, -safeWidth],
    [safeWidth, safeWidth],
    [safeWidth, -safeWidth],
    [-safeWidth, safeWidth],
    [-safeWidth, -safeWidth]
  ];
  return offsets.map(([x, y]) => `${x}px ${y}px 0 ${normalizedColor}`).join(", ");
}

function buildTextPresentationStyle(entry = {}, scale = 1) {
  const fontSize = Math.max(8, Number(entry.fontSize) || 24);
  const lineHeight = Number.isFinite(Number(entry.lineHeight)) ? Math.max(0.6, Math.min(2.4, Number(entry.lineHeight))) : 0.95;
  const fontFamily = escapeHtml(String(entry.fontFamily || "").trim());
  const outlineWidth = Math.max(0, Number(entry.outlineWidth) || 0);
  const outlineColor = normalizeHexColor(entry.outlineColor, "#101722");
  const outlineMode = ["outer", "center"].includes(String(entry.outlineMode || "").trim().toLowerCase())
    ? String(entry.outlineMode).trim().toLowerCase()
    : "outer";
  const outlineShadow = buildTextOutlineShadowLayers({
    color: outlineColor,
    width: outlineWidth,
    mode: outlineMode
  });
  const shadowCss = buildTextShadowCss({
    color: entry.shadowColor,
    distance: entry.shadowDistance,
    blur: entry.shadowBlur,
    opacity: entry.shadowOpacity
  });
  const textShadow = [outlineShadow, shadowCss].filter(Boolean).join(", ");
  return {
    fontSizePx: fontSize * scale,
    lineHeight,
    fontFamily,
    color: normalizeHexColor(entry.color, "#f2f5f8"),
    outlineColor,
    outlineWidth,
    outlineMode,
    webkitTextStroke: outlineWidth > 0 && outlineMode === "center" ? `${outlineWidth}px ${outlineColor}` : "",
    textShadow
  };
}

function getLineDashArray(style, width = 3) {
  const safeWidth = Math.max(1, Number(width) || 3);
  switch (String(style || "solid").trim().toLowerCase()) {
    case "dashed":
      return `${safeWidth * 4} ${safeWidth * 2.2}`;
    case "dotted":
      return `1 ${safeWidth * 2.4}`;
    case "dashdot":
      return `${safeWidth * 4} ${safeWidth * 1.8} 1 ${safeWidth * 1.8}`;
    default:
      return null;
  }
}

export class TheatreWorldMapApplication extends Application {
  constructor(options = {}) {
    super(options);
    const registry = globalThis.__TOM_WORLD_MAP_APP_INSTANCES instanceof Set
      ? globalThis.__TOM_WORLD_MAP_APP_INSTANCES
      : new Set();
    registry.add(this);
    globalThis.__TOM_WORLD_MAP_APP_INSTANCES = registry;
    this.mapId = options.mapId ?? TheatreStore.getActiveWorldMap()?.id ?? null;
    this._leafletMap = null;
    this._leafletLayer = null;
    this._leafletOverlayLayers = new Map();
    this._leafletObjectOverlayMarkers = new Map();
    this._objectOverlayImageRatioCache = new Map();
    this._leafletRegionLayers = new Map();
    this._leafletRegionVertexMarkers = [];
    this._leafletDraftRegionLayer = null;
    this._leafletLineLayers = new Map();
    this._leafletLinePointMarkers = [];
    this._leafletDraftLineLayer = null;
    this._leafletDraftLineOutlineLayer = null;
    this._leafletLineVertexMarkers = [];
    this._leafletMarkers = new Map();
    this._leafletBounds = null;
    this._isRightSidebarCollapsed = null;
    this._hasForcedPlayerMapOpen = false;
    this._preservedView = null;
    this._resizeInvalidateTimeout = null;
    this._viewportResizeObserver = null;
    this._sidebarTooltipElement = null;
    this._selectedPinId = null;
    this._arePinsVisible = true;
    this._hiddenCategories = new Set();
    this._hiddenPinTypes = this._hiddenCategories;
    this._hiddenObjectCategories = this._hiddenCategories;
    this._hiddenRegionCategories = this._hiddenCategories;
    this._activeOverlayIds = new Set();
    this._overlayStateMapId = null;
    this._areObjectOverlaysVisible = true;
    this._areRegionsVisible = true;
    this._isRegionDrawMode = false;
    this._isLineDrawMode = false;
    this._editingRegionId = null;
    this._editingRegionName = "";
    this._editingRegionStyle = null;
    this._editingLineId = null;
    this._editingLineName = "";
    this._editingLineStyle = null;
    this._draftRegionInspectorOpen = false;
    this._draftLineInspectorOpen = false;
    this._pendingRegionPoints = [];
    this._pendingLinePoints = [];
    this._regionSnapEnabled = false;
    this._lineSnapEnabled = false;
    this._fogCanvas = null;
    this._fogImage = null;
    this._fogImagePath = "";
    this._fogToolbarOpen = false;
    this._fogTool = "brush";
    this._fogAction = "reveal";
    this._fogBrushSize = 72;
    this._fogFeather = 18;
    this._fogIsPainting = false;
    this._fogActiveBrushPoints = [];
    this._fogBrushPreviewPoint = null;
    this._fogPolygonPoints = [];
    this._fogPolygonVertexMarkers = [];
    this._fogDraggedPolygonPointIndex = null;
    this._fogGmPreviewTransparent = false;
    this._fogZoomAnimation = null;
    this._fogTileViewportLockDuringZoom = false;
    this._fogTileZoomPhase = null;
    this._fogTileZoomOrigin = null;
    this._fogAnimationFrame = null;
    this._fogZoomRenderFrame = null;
    this._fogSaveTimeout = null;
    this._fogCanvasPadding = 0;
    this._contextMenuState = {
      isOpen: false,
      x: 0,
      y: 0,
      latlng: null,
      mode: "create",
      targetType: "",
      targetId: ""
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-world-map`,
      title: tr("World Map"),
      classes: [MODULE_ID, "theatre-world-map"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-world-map.hbs`,
      width: 1320,
      height: 860,
      resizable: true,
      minimizable: true
    });
  }

  render(force = false, options = {}) {
    if (this._leafletMap) {
      this._preservedView = this._captureCurrentView();
    }
    return super.render(force, options);
  }

  setPosition(...args) {
    const result = super.setPosition(...args);
    if (this._leafletMap) {
      clearTimeout(this._resizeInvalidateTimeout);
      this._resizeInvalidateTimeout = window.setTimeout(() => {
        this._resizeInvalidateTimeout = null;
        this._leafletMap?.invalidateSize?.(false);
      }, 80);
    }
    return result;
  }

  async getData() {
    const worldMap = this.mapId
      ? TheatreStore.getWorldMapById(this.mapId)
      : TheatreStore.getActiveWorldMap();
    if (worldMap?.id) {
      this.mapId = worldMap.id;
    }
    this.options.title = worldMap?.name || tr("World Map");

    const hasMap = Boolean(worldMap?.tileUrlTemplate);
    const isRightSidebarCollapsed = this._isRightSidebarCollapsed ?? worldMap?.pinSidebarCollapsedDefault ?? false;
    this._isRightSidebarCollapsed = isRightSidebarCollapsed;

    const pins = Array.isArray(worldMap?.pins)
      ? worldMap.pins.map((pin, index) => ({
          ...pin,
          index: index + 1,
          note: String(pin.note || "").trim(),
          sidebarTooltip: [
            String(pin.note || "").trim(),
            String(pin.documentName || "").trim() ? `${tr("Linked document")}: ${String(pin.documentName || "").trim()}` : ""
          ].filter(Boolean).join("\n"),
          color: normalizeHexColor(pin.color),
          size: normalizePinSize(pin.size),
          borderColor: normalizeHexColor(pin.borderColor, "#101722"),
          borderWidth: Math.max(0, Math.min(8, Number(pin.borderWidth) || 0)),
          iconBorderStyle: Number(pin.borderWidth) > 0
            ? `-webkit-text-stroke:${Math.max(0, Math.min(8, Number(pin.borderWidth) || 0))}px ${normalizeHexColor(pin.borderColor, "#101722")}; paint-order:stroke fill;`
            : "",
          iconShadowStyle: this._buildPinShadowStyle(pin),
          iconClass: this._getPinTypeDefinition(pin.type, worldMap).iconClass,
          categoryLabel: this._getPinTypeDefinition(pin.type, worldMap).label,
          iconSizeRem: (1 * normalizePinSize(pin.size)).toFixed(2),
          hasDocumentLink: Boolean(pin.documentUuid),
          isSelected: pin.id === this._selectedPinId
        }))
      : [];
    const categoryLegend = this._getCategoryOptions(worldMap).map((entry) => ({
      id: entry.id,
      type: entry.id,
      label: entry.label,
      iconClass: entry.iconClass,
      color: String(entry.color || "#33475f").trim().toLowerCase(),
      isHidden: this._hiddenCategories.has(entry.id),
      isLocked: this._isCategoryLocked("categories", entry.id)
    }));
    const overlays = Array.isArray(worldMap?.overlays)
      ? worldMap.overlays
          .filter((overlay) => overlay.tileUrlTemplate)
          .map((overlay) => ({
            ...overlay,
            isActive: this._activeOverlayIds.has(overlay.id) || (this._overlayStateMapId !== worldMap?.id && overlay.visibleByDefault)
          }))
      : [];
    const objectOverlays = Array.isArray(worldMap?.objectOverlays)
      ? worldMap.objectOverlays.map((entry) => ({
          ...entry,
          categoryLabel: this._getObjectCategoryLabel(entry.category, worldMap),
          tooltip: [
            this._getObjectCategoryLabel(entry.category, worldMap),
            entry.type === "image" ? tr("Image object") : tr("Text object"),
            entry.type === "text" ? String(entry.text || "").trim() : "",
            String(entry.documentName || "").trim() ? `${tr("Linked document")}: ${String(entry.documentName || "").trim()}` : "",
            entry.scaleWithZoom ? tr("Scale with zoom") : ""
          ].filter(Boolean).join("\n"),
          isImage: entry.type === "image",
          isText: entry.type === "text"
        }))
      : [];
    const regions = Array.isArray(worldMap?.regions)
      ? worldMap.regions.map((entry) => ({
          ...entry,
          categoryLabel: this._getRegionCategoryLabel(entry.category, worldMap),
          tooltip: [
            `${this._getRegionCategoryLabel(entry.category, worldMap)} - ${entry.points?.length ?? 0} ${tr("point(s)")}`,
            String(entry.documentName || "").trim() ? `${tr("Linked document")}: ${String(entry.documentName || "").trim()}` : ""
          ].filter(Boolean).join("\n")
        }))
      : [];
    const lines = Array.isArray(worldMap?.lines)
      ? worldMap.lines.map((entry) => ({
          ...entry,
          categoryLabel: this._getPinTypeDefinition(entry.category, worldMap).label,
          tooltip: [
            `${this._getPinTypeDefinition(entry.category, worldMap).label} - ${tr("Line")} - ${entry.points?.length ?? 0} ${tr("point(s)")}`,
            String(entry.documentName || "").trim() ? `${tr("Linked document")}: ${String(entry.documentName || "").trim()}` : ""
          ].filter(Boolean).join("\n")
        }))
      : [];

    return {
      hasMap,
      map: worldMap,
      pins,
      overlays,
      objectOverlays,
      regions,
      lines,
      categoryLegend,
      pinTypeLegend: categoryLegend,
      objectCategoryLegend: [],
      regionCategoryLegend: [],
      canEditPins: Boolean(game.user?.isGM),
      canLockCategories: Boolean(game.user?.isGM),
      hasForcedPlayerMapOpen: this._hasForcedPlayerMapOpen,
      arePinsVisible: this._arePinsVisible,
      areObjectOverlaysVisible: this._areObjectOverlaysVisible,
      areRegionsVisible: this._areRegionsVisible,
      isRegionDrawMode: this._isRegionDrawMode,
      isLineDrawMode: this._isLineDrawMode,
      isRegionEditMode: Boolean(this._editingRegionId),
      isLineEditMode: Boolean(this._editingLineId),
      editingRegionName: this._editingRegionName,
      editingLineName: this._editingLineName,
      canFinishRegion: this._pendingRegionPoints.length >= 3,
      pendingRegionPointCount: this._pendingRegionPoints.length,
      canFinishLine: this._pendingLinePoints.length >= 2,
      pendingLinePointCount: this._pendingLinePoints.length,
      isRegionSnapEnabled: this._regionSnapEnabled,
      isLineSnapEnabled: this._lineSnapEnabled,
      fogEnabled: Boolean(worldMap?.fogSettings?.enabled),
      isFogToolbarOpen: Boolean(this._fogToolbarOpen && game.user?.isGM),
      fogTool: this._fogTool,
      fogAction: this._fogAction,
      fogBrushSize: this._fogBrushSize,
      fogFeather: this._fogFeather,
      fogPolygonPointCount: this._fogPolygonPoints.length,
      canFinishFogPolygon: this._fogPolygonPoints.length >= 3,
      isFogBrushTool: this._fogTool === "brush",
      isFogPolygonTool: this._fogTool === "polygon",
      isFogRevealAction: this._fogAction === "reveal",
      isFogRestoreAction: this._fogAction === "restore",
      isFogGmPreviewTransparent: Boolean(this._fogGmPreviewTransparent),
      isRightSidebarCollapsed,
      isContextMenuOpen: this._contextMenuState.isOpen,
      contextMenuX: this._contextMenuState.x,
      contextMenuY: this._contextMenuState.y,
      themeInlineStyle: this._buildMapThemeInlineStyle(worldMap)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(html[0], TheatreStore.getThemeState());
    this._contextMenuElement = html[0]?.querySelector?.(".tom-world-map__context-menu") ?? null;
    this._sidebarTooltipElement = html[0]?.querySelector?.(".tom-world-map__sidebar-tooltip") ?? null;
    this._updateContextMenuElement();
    html.find("[data-action='toggle-map-right-sidebar']").on("click", this._onToggleRightSidebar.bind(this));
    html.find("[data-action='fit-world-map']").on("click", this._onFitMap.bind(this));
    html.find("[data-action='save-world-map-view']").on("click", this._onSaveCurrentView.bind(this));
    html.find("[data-action='force-world-map-window']").on("click", this._onForceWorldMapWindow.bind(this));
    html.find("[data-action='force-world-map-stage']").on("click", this._onForceWorldMapStage.bind(this));
    html.find("[data-action='jump-to-pin']").on("click", this._onJumpToPin.bind(this));
    html.find("[data-action='jump-to-pin']").on("dblclick", this._onEditPinFromList.bind(this));
    html.find("[data-world-map-pin-filter]").on("input change", this._onPinSidebarFilterInput.bind(this));
    this._applyPinSidebarFilters();
    html.find("[data-action='remove-map-pin']").on("click", this._onRemovePin.bind(this));
    html.find("[data-action='toggle-map-pin-visibility']").on("click", this._onTogglePinVisibility.bind(this));
    html.find("[data-action='toggle-map-object-overlay-visibility']").on("click", this._onToggleObjectOverlayVisibility.bind(this));
    html.find("[data-action='toggle-map-region-visibility']").on("click", this._onToggleRegionVisibility.bind(this));
    html.find("[data-action='toggle-map-fog-toolbar']").on("click", this._onToggleFogToolbar.bind(this));
    html.find("[data-action='set-map-fog-tool']").on("click", this._onSetFogTool.bind(this));
    html.find("[data-action='set-map-fog-action']").on("click", this._onSetFogAction.bind(this));
    html.find("[data-action='finish-map-fog-polygon']").on("click", this._onFinishFogPolygon.bind(this));
    html.find("[data-action='cancel-map-fog-polygon']").on("click", this._onCancelFogPolygon.bind(this));
    html.find("[data-action='clear-map-fog']").on("click", this._onClearFogOperations.bind(this));
    html.find("[data-action='toggle-map-fog-gm-preview']").on("click", this._onToggleFogGmPreview.bind(this));
    html.find("[data-fog-control='brush-size']").on("input change", this._onFogBrushSizeInput.bind(this));
    html.find("[data-fog-control='feather']").on("input change", this._onFogFeatherInput.bind(this));
    html.find("[data-action='toggle-category-visibility']").on("click", this._onToggleCategoryVisibility.bind(this));
    html.find("[data-action='toggle-category-lock']").on("click", this._onToggleCategoryLock.bind(this));
    html.find("[data-action='toggle-map-overlay']").on("click", this._onToggleOverlay.bind(this));
    html.find("[data-action='toggle-region-draw-mode']").on("click", this._onToggleRegionDrawMode.bind(this));
    html.find("[data-action='finish-region-draw']").on("click", this._onFinishRegionDraw.bind(this));
    html.find("[data-action='cancel-region-draw']").on("click", this._onCancelRegionDraw.bind(this));
    html.find("[data-action='toggle-region-snap']").on("click", this._onToggleRegionSnap.bind(this));
    html.find("[data-action='finish-line-draw']").on("click", this._onFinishLineDraw.bind(this));
    html.find("[data-action='cancel-line-draw']").on("click", this._onCancelLineDraw.bind(this));
    html.find("[data-action='toggle-line-snap']").on("click", this._onToggleLineSnap.bind(this));
    html.find("[data-action='save-line-edit']").on("click", this._onSaveLineEdit.bind(this));
    html.find("[data-action='cancel-line-edit']").on("click", this._onCancelLineEdit.bind(this));
    html.find("[data-action='style-line-edit']").on("click", this._onStyleLineEdit.bind(this));
    html.find("[data-action='save-region-edit']").on("click", this._onSaveRegionEdit.bind(this));
    html.find("[data-action='cancel-region-edit']").on("click", this._onCancelRegionEdit.bind(this));
    html.find("[data-action='style-region-edit']").on("click", this._onStyleRegionEdit.bind(this));
    html.find("[data-action='create-map-image-object']").on("click", this._onCreateImageObjectAtCenter.bind(this));
    html.find("[data-action='create-map-text-object']").on("click", this._onCreateTextObjectAtCenter.bind(this));
    html.find("[data-action='edit-map-object-overlay']").on("click", this._onEditObjectOverlayFromList.bind(this));
    html.find("[data-action='remove-map-object-overlay']").on("click", this._onRemoveObjectOverlay.bind(this));
    html.find("[data-action='edit-map-region']").on("click", this._onEditRegionFromList.bind(this));
    html.find("[data-action='remove-map-region']").on("click", this._onRemoveRegion.bind(this));
    html.find("[data-action='edit-map-line']").on("click", this._onEditLineFromList.bind(this));
    html.find("[data-action='remove-map-line']").on("click", this._onRemoveLine.bind(this));
    html.find("[data-action='create-map-pin-at-context']").on("click", this._onCreatePinAtContextMenu.bind(this));
    html.find("[data-action='create-map-image-at-context']").on("click", this._onCreateImageAtContextMenu.bind(this));
    html.find("[data-action='create-map-text-at-context']").on("click", this._onCreateTextAtContextMenu.bind(this));
    html.find("[data-action='start-map-region-at-context']").on("click", this._onStartRegionAtContextMenu.bind(this));
    html.find("[data-action='start-map-line-at-context']").on("click", this._onStartLineAtContextMenu.bind(this));
    html.find("[data-action='edit-map-context-target']").on("click", this._onEditContextTarget.bind(this));
    html.find(".tom-world-map__viewport").on("mousedown", this._onViewportMouseDown.bind(this));
    html.find("[data-world-map-canvas]").on("dragenter dragover", this._onCanvasDragOver.bind(this));
    html.find("[data-world-map-canvas]").on("dragleave", this._onCanvasDragLeave.bind(this));
    html.find("[data-world-map-canvas]").on("drop", this._onCanvasDrop.bind(this));
    html.find("[data-world-map-sidebar-tooltip]")
      .on("mouseenter focusin", this._onSidebarTooltipEnter.bind(this))
      .on("mousemove", this._onSidebarTooltipMove.bind(this))
      .on("mouseleave focusout click", this._onSidebarTooltipLeave.bind(this));
    void this._initializeLeafletMap();
  }

  _onSidebarTooltipEnter(event) {
    const tooltip = this._sidebarTooltipElement;
    const text = String(event.currentTarget?.dataset?.worldMapSidebarTooltip || "").trim();
    if (!tooltip || !text) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.classList.add("is-visible");
    this._positionSidebarTooltip(event);
  }

  _onSidebarTooltipMove(event) {
    this._positionSidebarTooltip(event);
  }

  _onSidebarTooltipLeave() {
    const tooltip = this._sidebarTooltipElement;
    if (!tooltip) return;
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
    tooltip.textContent = "";
  }

  _positionSidebarTooltip(event) {
    const tooltip = this._sidebarTooltipElement;
    const root = this.element?.[0]?.querySelector?.(".tom-world-map__layout") ?? this.element?.[0];
    if (!tooltip || tooltip.hidden || !(root instanceof HTMLElement)) return;
    const rootRect = root.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const targetRect = event.currentTarget?.getBoundingClientRect?.() ?? null;
    const hasPointerPosition = Number.isFinite(Number(event.clientX)) && Number.isFinite(Number(event.clientY));
    const pointerX = hasPointerPosition ? Number(event.clientX) : (targetRect ? targetRect.left + (targetRect.width / 2) : rootRect.left);
    const pointerY = hasPointerPosition ? Number(event.clientY) : (targetRect ? targetRect.top + (targetRect.height / 2) : rootRect.top);
    const preferredClientX = pointerX + 14;
    const preferredClientY = pointerY + 14;
    const minX = rootRect.left + 8;
    const maxX = rootRect.right - tooltipRect.width - 8;
    const minY = rootRect.top + 8;
    const maxY = rootRect.bottom - tooltipRect.height - 8;
    const left = Math.max(minX, Math.min(maxX, preferredClientX)) - rootRect.left;
    const top = Math.max(minY, Math.min(maxY, preferredClientY)) - rootRect.top;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  async _initializeLeafletMap() {
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const container = this.element?.[0]?.querySelector("[data-world-map-canvas]");
    if (!worldMap || !worldMap.tileUrlTemplate || !container) {
      this._destroyLeafletMap();
      return;
    }

    let L;
    try {
      L = await ensureLeaflet();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to load Leaflet`, error);
      ui.notifications?.error(tr("Leaflet could not be loaded. Please check the browser console."));
      return;
    }

    this._destroyLeafletMap();
    if (this._overlayStateMapId !== worldMap.id) {
      this._activeOverlayIds = new Set(
        (Array.isArray(worldMap.overlays) ? worldMap.overlays : [])
          .filter((overlay) => overlay.visibleByDefault && overlay.tileUrlTemplate)
          .map((overlay) => overlay.id)
      );
      this._overlayStateMapId = worldMap.id;
    }

    const wheelStep = Number(worldMap.zoomStep) || 0.25;
    const wheelPxPerZoomLevel = Math.max(30, Math.min(480, Math.round(60 / Math.max(0.05, wheelStep))));

    const map = L.map(container, {
      crs: L.CRS.Simple,
      minZoom: worldMap.minZoom,
      maxZoom: worldMap.maxZoom,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel,
      zoomControl: true,
      attributionControl: false,
      doubleClickZoom: false,
      scrollWheelZoom: true,
      dragging: true,
      keyboard: true
    });
    const editPane = map.createPane?.("tom-world-map-edit-pane");
    if (editPane) {
      editPane.style.zIndex = "920";
      editPane.style.pointerEvents = "auto";
    }

    const bounds = this._buildLeafletBounds(map, worldMap);
    this._leafletBounds = bounds;
    map.setMaxBounds(bounds);
    map.options.maxBoundsViscosity = 1;

    this._leafletLayer = L.tileLayer(worldMap.tileUrlTemplate, {
      tileSize: worldMap.tileSize,
      minZoom: worldMap.minZoom,
      maxZoom: worldMap.maxZoom,
      maxNativeZoom: worldMap.maxNativeZoom,
      noWrap: true,
      bounds
    }).addTo(map);
    this._leafletLayer.on("tileerror", (event) => {
      const failedUrl = String(event?.tile?.src || worldMap.tileUrlTemplate || "").trim();
      console.warn(`${MODULE_ID} | World map tile failed to load`, failedUrl);
      ui.notifications?.warn(tr("World map tiles could not be loaded. Please verify the generated tile path."));
    });

    map.on("click", this._onLeafletMapClick.bind(this));
    map.on("dblclick", this._onLeafletMapDoubleClick.bind(this));
    map.on("contextmenu", this._onLeafletMapContextMenu.bind(this));
    map.on("zoomstart", this._onLeafletZoomStart.bind(this));
    map.on("zoomanim", this._onLeafletZoomAnimating.bind(this));
    map.on("zoom", this._onLeafletZoomFrame.bind(this));
    map.on("move resize moveend", () => this._renderFogCanvasAfterViewportChange());
    this._leafletMap = map;
    this._applyMapView(worldMap);
    this._syncLeafletOverlays(worldMap);
    this._syncLeafletObjectOverlays(worldMap);
    this._syncLeafletRegions(worldMap);
    this._syncLeafletLines(worldMap);
    this._syncLeafletPins();
    this._syncFogCanvas(worldMap);
    map.on("zoomend", this._onLeafletZoomChanged.bind(this));
    this._observeViewportResize(container);
    window.setTimeout(() => {
      map.invalidateSize(false);
    }, 120);
  }

  _applyMapView(worldMap) {
    if (!this._leafletMap) return;
    const preservedView = this._consumePreservedView();
    if (preservedView) {
      this._leafletMap.setView(
        preservedView.center,
        this._normalizeRasterTileZoom(preservedView.zoom, worldMap),
        { animate: false }
      );
      return;
    }
    const centerY = Number(worldMap?.initialView?.y);
    const centerX = Number(worldMap?.initialView?.x);
    const zoom = Number(worldMap?.initialView?.zoom);
    if (Number.isFinite(centerY) && Number.isFinite(centerX) && Number.isFinite(zoom)) {
      this._leafletMap.setView(
        this._mapPixelsToLatLng(centerX, centerY, worldMap),
        this._normalizeRasterTileZoom(zoom, worldMap)
      );
      return;
    }
    this._fitLeafletBounds();
  }

  _destroyLeafletMap() {
    this._viewportResizeObserver?.disconnect?.();
    this._viewportResizeObserver = null;
    this._clearRegionVertexMarkers();
    this._clearDraftLineLayer();
    this._clearLinePointMarkers();
    this._clearLineVertexMarkers();
    this._destroyFogCanvas();
    if (this._leafletMap) {
      this._leafletMap.remove();
      this._leafletMap = null;
    }
    this._leafletLayer = null;
    this._leafletOverlayLayers = new Map();
    this._leafletObjectOverlayMarkers = new Map();
    this._leafletRegionLayers = new Map();
    this._leafletRegionVertexMarkers = [];
    this._leafletDraftRegionLayer = null;
    this._leafletLineLayers = new Map();
    this._leafletLinePointMarkers = [];
    this._leafletDraftLineLayer = null;
    this._leafletDraftLineOutlineLayer = null;
    this._leafletLineVertexMarkers = [];
    this._leafletMarkers = new Map();
    this._leafletBounds = null;
  }

  _observeViewportResize(container) {
    this._viewportResizeObserver?.disconnect?.();
    if (!(container instanceof HTMLElement) || typeof ResizeObserver !== "function") return;
    this._viewportResizeObserver = new ResizeObserver(() => {
      if (!this._leafletMap) return;
      clearTimeout(this._resizeInvalidateTimeout);
      this._resizeInvalidateTimeout = window.setTimeout(() => {
        this._resizeInvalidateTimeout = null;
        this._leafletMap?.invalidateSize?.(false);
      }, 60);
    });
    this._viewportResizeObserver.observe(container);
  }

  _destroyFogCanvas() {
    if (this._fogSaveTimeout) {
      window.clearTimeout(this._fogSaveTimeout);
      this._fogSaveTimeout = null;
    }
    if (this._fogAnimationFrame) {
      window.cancelAnimationFrame(this._fogAnimationFrame);
      this._fogAnimationFrame = null;
    }
    this._stopFogZoomRenderLoop();
    this._clearFogPolygonVertexMarkers();
    this._fogCanvas?.remove?.();
    this._fogCanvas = null;
    this._fogIsPainting = false;
    this._fogActiveBrushPoints = [];
    this._fogBrushPreviewPoint = null;
    this._fogZoomAnimation = null;
    this._fogTileViewportLockDuringZoom = false;
    this._fogTileZoomPhase = null;
    this._fogTileZoomOrigin = null;
  }

  _syncFogCanvas(worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    this._destroyFogCanvas();
    if (!this._leafletMap || !targetMap?.fogSettings?.enabled) return;
    const container = this._leafletMap.getContainer?.();
    if (!(container instanceof HTMLElement)) return;
    const canvas = document.createElement("canvas");
    canvas.className = "tom-world-map__fog-canvas leaflet-zoom-animated";
    canvas.dataset.fogCanvas = "true";
    canvas.style.pointerEvents = this._fogToolbarOpen && game.user?.isGM ? "auto" : "none";
    container.appendChild(canvas);
    this._fogCanvas = canvas;
    if (this._fogToolbarOpen && game.user?.isGM) this._leafletMap.dragging?.disable?.();
    canvas.addEventListener("pointerdown", this._onFogPointerDown.bind(this));
    canvas.addEventListener("pointermove", this._onFogPointerMove.bind(this));
    canvas.addEventListener("pointerup", this._onFogPointerUp.bind(this));
    canvas.addEventListener("pointerleave", this._onFogPointerLeave.bind(this));
    canvas.addEventListener("pointerenter", this._onFogPointerMove.bind(this));
    canvas.addEventListener("contextmenu", (event) => {
      if (!this._fogToolbarOpen || this._fogTool !== "polygon") return;
      event.preventDefault();
      const index = this._getFogPolygonHandleIndexFromEvent(event);
      if (index >= 0) {
        this._fogPolygonPoints.splice(index, 1);
        this._fogDraggedPolygonPointIndex = null;
        this._renderFogCanvas();
        this._syncFogPolygonVertexMarkers(targetMap);
        this._updateFogToolbarState();
        return;
      }
      this._onCancelFogPolygon(event);
    });
    this._loadFogImage(targetMap.fogSettings);
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers(targetMap);
  }

  _clearFogPolygonVertexMarkers() {
    for (const marker of this._fogPolygonVertexMarkers) {
      marker?.remove?.();
    }
    this._fogPolygonVertexMarkers = [];
  }

  _syncFogPolygonVertexMarkers(worldMap = null) {
    this._clearFogPolygonVertexMarkers();
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!this._leafletMap || !globalThis.L || !targetMap || !game.user?.isGM || !this._fogToolbarOpen || this._fogTool !== "polygon") return;
    this._fogPolygonPoints.forEach((point, index) => {
      const marker = globalThis.L.marker(this._mapPixelsToLatLng(point.x, point.y, targetMap), {
        icon: globalThis.L.divIcon({
          className: "tom-world-map-fog-vertex",
          html: `<span class="tom-world-map-fog-vertex__dot"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        }),
        draggable: true,
        keyboard: false,
        pane: "tom-world-map-edit-pane",
        zIndexOffset: 1600
      });
      marker.on("drag", (event) => {
        const latlng = event.target?.getLatLng?.();
        if (!latlng) return;
        this._fogPolygonPoints[index] = this._latLngToMapPixels(latlng, targetMap);
        this._renderFogCanvas();
      });
      marker.on("dragstart", (event) => {
        globalThis.L.DomEvent.stop(event);
      });
      marker.on("mousedown", (event) => {
        globalThis.L.DomEvent.stop(event);
      });
      marker.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        this._fogPolygonPoints.splice(index, 1);
        this._renderFogCanvas();
        this._syncFogPolygonVertexMarkers(targetMap);
        this._updateFogToolbarState();
      });
      marker.addTo(this._leafletMap);
      this._fogPolygonVertexMarkers.push(marker);
    });
  }

  _loadFogImage(fogSettings = {}) {
    const imagePath = String(fogSettings.imagePath || "").trim();
    if (String(fogSettings.mode || "color") !== "image" || !imagePath) {
      this._fogImage = null;
      this._fogImagePath = "";
      return;
    }
    if (this._fogImagePath === imagePath && this._fogImage) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => this._renderFogCanvas();
    image.src = imagePath;
    this._fogImage = image;
    this._fogImagePath = imagePath;
  }

  _resizeFogCanvasToMap() {
    if (!this._fogCanvas || !this._leafletMap) return null;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const size = this._leafletMap.getSize();
    const viewportWidth = Math.max(1, Math.ceil(size.x));
    const viewportHeight = Math.max(1, Math.ceil(size.y));
    const zoomStep = Number.isFinite(Number(worldMap?.zoomStep)) ? Math.max(0.1, Math.min(2, Number(worldMap.zoomStep))) : 0.25;
    const zoomReserve = 1.05 + (zoomStep * 0.28);
    const padding = Math.max(480, Math.min(1792, Math.ceil(Math.max(viewportWidth, viewportHeight) * zoomReserve)));
    const width = viewportWidth + (padding * 2);
    const height = viewportHeight + (padding * 2);
    const pixelArea = width * height;
    const ratioCap = pixelArea > 12000000 ? 1 : (pixelArea > 8000000 ? 1.25 : 1.5);
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, ratioCap));
    this._fogCanvasPadding = padding;
    if (this._fogCanvas.width !== Math.round(width * ratio) || this._fogCanvas.height !== Math.round(height * ratio)) {
      this._fogCanvas.width = Math.round(width * ratio);
      this._fogCanvas.height = Math.round(height * ratio);
    }
    this._fogCanvas.style.left = `${-padding}px`;
    this._fogCanvas.style.top = `${-padding}px`;
    this._fogCanvas.style.width = `${width}px`;
    this._fogCanvas.style.height = `${height}px`;
    const context = this._fogCanvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  _mapPointToContainerPoint(point, worldMap) {
    if (!this._leafletMap || !worldMap) return null;
    const latlng = this._mapPixelsToLatLng(point.x, point.y, worldMap);
    const padding = Number(this._fogCanvasPadding) || 0;
    const addPadding = (canvasPoint) => {
      if (!canvasPoint) return null;
      if (typeof canvasPoint.add === "function" && globalThis.L?.point) return canvasPoint.add(globalThis.L.point(padding, padding));
      return { x: Number(canvasPoint.x || 0) + padding, y: Number(canvasPoint.y || 0) + padding };
    };
    if (this._fogZoomAnimation && typeof this._leafletMap._latLngToNewLayerPoint === "function") {
      const layerPoint = this._leafletMap._latLngToNewLayerPoint(
        latlng,
        this._fogZoomAnimation.zoom,
        this._fogZoomAnimation.center
      );
      const panePos = typeof this._leafletMap._getMapPanePos === "function"
        ? this._leafletMap._getMapPanePos()
        : globalThis.L.point(0, 0);
      return addPadding(layerPoint.add(panePos));
    }
    return addPadding(this._leafletMap.latLngToContainerPoint(latlng));
  }

  _getFogMapToContainerScale(worldMap) {
    if (!this._leafletMap || !worldMap) return 1;
    const sampleSize = Math.max(1, Math.min(256, Number(worldMap.width) || 256));
    const start = this._mapPointToContainerPoint({ x: 0, y: 0 }, worldMap);
    const end = this._mapPointToContainerPoint({ x: sampleSize, y: 0 }, worldMap);
    if (!start || !end) return 1;
    const scale = Math.hypot(end.x - start.x, end.y - start.y) / sampleSize;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  _fogMapRadiusToContainerRadius(value, worldMap, fallback = 1) {
    const numeric = Number(value);
    const radius = Number.isFinite(numeric) ? numeric : fallback;
    return Math.max(0, radius * this._getFogMapToContainerScale(worldMap));
  }

  _fogScreenRadiusToMapRadius(value, worldMap, fallback = 1) {
    const numeric = Number(value);
    const radius = Number.isFinite(numeric) ? numeric : fallback;
    const scale = this._getFogMapToContainerScale(worldMap);
    return Math.max(0, radius / Math.max(0.0001, scale));
  }

  _positiveModulo(value, divisor) {
    const numericDivisor = Number(divisor);
    if (!Number.isFinite(numericDivisor) || numericDivisor <= 0) return 0;
    return ((value % numericDivisor) + numericDivisor) % numericDivisor;
  }

  _getFogImageTileContainerSize(fogSettings, worldMap) {
    const configuredSize = Number.isFinite(Number(fogSettings?.imageTileSize))
      ? Math.max(16, Math.min(2048, Number(fogSettings.imageTileSize)))
      : 256;
    if (fogSettings?.imageTileFixedOnZoom) return configuredSize;
    const scaledSize = configuredSize * this._getFogMapToContainerScale(worldMap);
    return Math.max(4, Math.min(8192, scaledSize));
  }

  _drawFogImageTiles(context, worldMap, fogSettings, width, height, opacity) {
    if (!this._fogImage?.complete || this._fogImage.naturalWidth <= 0) return false;
    const tileSize = this._getFogImageTileContainerSize(fogSettings, worldMap);
    const padding = Number(this._fogCanvasPadding) || 0;
    const origin = this._fogTileZoomOrigin
      ?? (fogSettings?.imageTileFixedOnZoom && (fogSettings?.imageTileViewportLocked || this._fogTileViewportLockDuringZoom)
        ? { x: padding, y: padding }
        : (this._mapPointToContainerPoint({ x: 0, y: 0 }, worldMap) ?? { x: 0, y: 0 }));
    const offsetX = this._positiveModulo(origin.x, tileSize);
    const offsetY = this._positiveModulo(origin.y, tileSize);
    const drawSize = Math.ceil(tileSize) + 1;
    const startX = offsetX - tileSize;
    const startY = offsetY - tileSize;
    context.save();
    context.globalAlpha = opacity;
    context.imageSmoothingEnabled = true;
    for (let y = startY; y < height + tileSize; y += tileSize) {
      for (let x = startX; x < width + tileSize; x += tileSize) {
        context.drawImage(this._fogImage, Math.floor(x), Math.floor(y), drawSize, drawSize);
      }
    }
    context.restore();
    return true;
  }

  _drawFogBase(context, worldMap, fogSettings, width, height) {
    context.clearRect(0, 0, width, height);
    const configuredOpacity = Number.isFinite(Number(fogSettings.opacity)) ? Math.max(0, Math.min(1, Number(fogSettings.opacity))) : 0.88;
    const opacity = game.user?.isGM && this._fogGmPreviewTransparent
      ? Math.min(configuredOpacity, 0.38)
      : configuredOpacity;
    if (String(fogSettings.mode || "color") === "image" && this._fogImage?.complete && this._fogImage.naturalWidth > 0) {
      if (this._drawFogImageTiles(context, worldMap, fogSettings, width, height, opacity)) return;
    }
    context.fillStyle = hexToRgba(fogSettings.color || "#07111f", opacity);
    context.fillRect(0, 0, width, height);
  }

  _drawFogBrushMask(context, operation, worldMap) {
    const points = Array.isArray(operation.points) ? operation.points : [];
    if (!points.length) return false;
    const radius = Math.max(1, this._fogMapRadiusToContainerRadius(operation.radius, worldMap, 64));
    const feather = Math.max(0, this._fogMapRadiusToContainerRadius(operation.feather, worldMap, 0));
    const outerRadius = radius + feather;
    for (const point of points) {
      const canvasPoint = this._mapPointToContainerPoint(point, worldMap);
      if (!canvasPoint) continue;
      if (feather > 0) {
        const gradient = context.createRadialGradient(canvasPoint.x, canvasPoint.y, radius, canvasPoint.x, canvasPoint.y, outerRadius);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
      } else {
        context.fillStyle = "rgba(0,0,0,1)";
      }
      context.beginPath();
      context.arc(canvasPoint.x, canvasPoint.y, outerRadius, 0, Math.PI * 2);
      context.fill();
    }
    return true;
  }

  _drawFogBrushOperation(context, operation, worldMap, fogSettings, width, height) {
    const maskContext = document.createElement("canvas").getContext("2d");
    if (!maskContext) return;
    maskContext.canvas.width = context.canvas.width;
    maskContext.canvas.height = context.canvas.height;
    maskContext.setTransform(context.getTransform());
    if (!this._drawFogBrushMask(maskContext, operation, worldMap)) return;
    this._applyFogMaskOperation(context, maskContext.canvas, operation, worldMap, fogSettings, width, height);
  }

  _drawFogPolygonMask(context, operation, worldMap) {
    const points = Array.isArray(operation.points) ? operation.points : [];
    if (points.length < 3) return false;
    const canvasPoints = points.map((point) => this._mapPointToContainerPoint(point, worldMap)).filter(Boolean);
    if (canvasPoints.length < 3) return false;
    const feather = Math.max(0, this._fogMapRadiusToContainerRadius(operation.feather, worldMap, 0));
    const targetContext = feather > 0 ? document.createElement("canvas").getContext("2d") : context;
    if (!targetContext) return false;
    if (targetContext.canvas !== context.canvas) {
      targetContext.canvas.width = context.canvas.width;
      targetContext.canvas.height = context.canvas.height;
      targetContext.setTransform(context.getTransform());
    }
    targetContext.save();
    targetContext.beginPath();
    targetContext.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    canvasPoints.slice(1).forEach((point) => targetContext.lineTo(point.x, point.y));
    targetContext.closePath();
    targetContext.fillStyle = "rgba(0,0,0,1)";
    targetContext.fill();
    targetContext.restore();
    if (feather > 0 && targetContext.canvas !== context.canvas) {
      context.save();
      context.filter = `blur(${feather}px)`;
      context.drawImage(targetContext.canvas, 0, 0, context.canvas.width / (window.devicePixelRatio || 1), context.canvas.height / (window.devicePixelRatio || 1));
      context.filter = "none";
      context.restore();
    }
    return true;
  }

  _drawFogPolygonOperation(context, operation, worldMap, fogSettings, width, height) {
    const maskContext = document.createElement("canvas").getContext("2d");
    if (!maskContext) return;
    maskContext.canvas.width = context.canvas.width;
    maskContext.canvas.height = context.canvas.height;
    maskContext.setTransform(context.getTransform());
    if (!this._drawFogPolygonMask(maskContext, operation, worldMap)) return;
    this._applyFogMaskOperation(context, maskContext.canvas, operation, worldMap, fogSettings, width, height);
  }

  _applyFogMaskOperation(context, maskCanvas, operation, worldMap, fogSettings, width, height) {
    context.save();
    if (operation.action !== "restore") {
      context.globalCompositeOperation = "destination-out";
      context.drawImage(maskCanvas, 0, 0, width, height);
      context.restore();
      return;
    }

    const restoreContext = document.createElement("canvas").getContext("2d");
    if (!restoreContext) {
      context.restore();
      return;
    }
    restoreContext.canvas.width = context.canvas.width;
    restoreContext.canvas.height = context.canvas.height;
    restoreContext.setTransform(context.getTransform());
    this._drawFogBase(restoreContext, worldMap, fogSettings, width, height);
    restoreContext.globalCompositeOperation = "destination-in";
    restoreContext.drawImage(maskCanvas, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.drawImage(restoreContext.canvas, 0, 0, width, height);
    context.restore();
  }

  _drawFogOperation(context, operation, worldMap, fogSettings, width, height) {
    if (operation.tool === "polygon") this._drawFogPolygonOperation(context, operation, worldMap, fogSettings, width, height);
    else this._drawFogBrushOperation(context, operation, worldMap, fogSettings, width, height);
  }

  _shouldRenderFogDuringZoom(worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    const fogSettings = targetMap?.fogSettings ?? {};
    const mode = String(fogSettings.mode || "color");
    return Boolean(
      this._fogToolbarOpen
      || mode === "color"
      || (
        mode === "image"
        && fogSettings.imageTileFixedOnZoom
      )
    );
  }

  _renderFogCanvas() {
    if (!this._fogCanvas || !this._leafletMap || !this.mapId) return;
    if (this._fogZoomAnimation?.transforming) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap?.fogSettings?.enabled) return;
    const resized = this._resizeFogCanvasToMap();
    if (!resized) return;
    const { context, width, height } = resized;
    const fogSettings = worldMap.fogSettings;
    this._drawFogBase(context, worldMap, fogSettings, width, height);
    for (const operation of fogSettings.operations ?? []) {
      this._drawFogOperation(context, operation, worldMap, fogSettings, width, height);
    }
    if (this._fogActiveBrushPoints.length) {
      this._drawFogOperation(context, {
        tool: "brush",
        action: this._fogAction,
        points: this._fogActiveBrushPoints,
        radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, 72),
        feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, 18)
      }, worldMap, fogSettings, width, height);
    }
    if (game.user?.isGM && this._fogToolbarOpen && this._fogTool === "brush" && this._fogBrushPreviewPoint) {
      this._drawFogBrushPreview(context, this._fogBrushPreviewPoint, worldMap);
    }
    if (this._fogPolygonPoints.length) {
      const canvasPoints = this._fogPolygonPoints.map((point) => this._mapPointToContainerPoint(point, worldMap)).filter(Boolean);
      context.save();
      context.strokeStyle = "#d7f0ff";
      context.fillStyle = "rgba(126, 186, 236, 0.18)";
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.beginPath();
      canvasPoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
      for (const point of canvasPoints) {
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  _renderFogCanvasAfterViewportChange() {
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if ((this._leafletMap?._animatingZoom || this._fogZoomRenderFrame) && this._shouldRenderFogDuringZoom(worldMap)) return;
    this._renderFogCanvas();
  }

  _drawFogBrushPreview(context, point, worldMap) {
    const canvasPoint = this._mapPointToContainerPoint(point, worldMap);
    if (!canvasPoint) return;
    const radius = Math.max(1, Number(this._fogBrushSize) || 72);
    const feather = Math.max(0, Number(this._fogFeather) || 0);
    const featherRadius = radius + feather;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.setLineDash([5, 4]);
    context.lineWidth = 1.5;
    context.strokeStyle = "rgba(245, 250, 255, 0.92)";
    context.fillStyle = "rgba(245, 250, 255, 0.05)";
    context.beginPath();
    context.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (feather > 0) {
      context.setLineDash([2, 5]);
      context.lineWidth = 1.25;
      context.strokeStyle = "rgba(126, 186, 236, 0.82)";
      context.fillStyle = "rgba(126, 186, 236, 0.035)";
      context.beginPath();
      context.arc(canvasPoint.x, canvasPoint.y, featherRadius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  _stopFogZoomRenderLoop() {
    if (this._fogZoomRenderFrame) {
      window.cancelAnimationFrame(this._fogZoomRenderFrame);
      this._fogZoomRenderFrame = null;
    }
  }

  _interpolateFogZoomCenter(startCenter, targetCenter, progress) {
    const startLat = Number(startCenter?.lat);
    const startLng = Number(startCenter?.lng);
    const targetLat = Number(targetCenter?.lat);
    const targetLng = Number(targetCenter?.lng);
    if (![startLat, startLng, targetLat, targetLng].every(Number.isFinite)) return targetCenter;
    return globalThis.L?.latLng?.(
      startLat + ((targetLat - startLat) * progress),
      startLng + ((targetLng - startLng) * progress)
    ) ?? targetCenter;
  }

  _getFogTilePhase(worldMap, zoomAnimation = null) {
    const fogSettings = worldMap?.fogSettings ?? {};
    const tileSize = this._getFogImageTileContainerSize(fogSettings, worldMap);
    const previousZoomAnimation = this._fogZoomAnimation;
    this._fogZoomAnimation = zoomAnimation;
    const origin = this._mapPointToContainerPoint({ x: 0, y: 0 }, worldMap) ?? { x: 0, y: 0 };
    this._fogZoomAnimation = previousZoomAnimation;
    return {
      x: this._positiveModulo(Number(origin.x) || 0, tileSize),
      y: this._positiveModulo(Number(origin.y) || 0, tileSize),
      tileSize
    };
  }

  _prepareFogTileZoomPhase(event, worldMap) {
    const fogSettings = worldMap?.fogSettings ?? {};
    if (
      String(fogSettings.mode || "color") !== "image"
      || !fogSettings.imageTileFixedOnZoom
      || fogSettings.imageTileViewportLocked
      || !Number.isFinite(Number(event?.zoom))
      || !event?.center
    ) {
      this._fogTileZoomPhase = null;
      this._fogTileZoomOrigin = null;
      return;
    }

    const start = this._getFogTilePhase(worldMap, null);
    const target = this._getFogTilePhase(worldMap, { zoom: Number(event.zoom), center: event.center });
    this._fogTileZoomPhase = {
      startX: start.x,
      startY: start.y,
      deltaX: this._positiveModulo(target.x - start.x + (start.tileSize / 2), start.tileSize) - (start.tileSize / 2),
      deltaY: this._positiveModulo(target.y - start.y + (start.tileSize / 2), start.tileSize) - (start.tileSize / 2),
      tileSize: start.tileSize
    };
    this._fogTileZoomOrigin = { x: start.x, y: start.y };
  }

  _updateFogTileZoomOrigin(progress) {
    if (!this._fogTileZoomPhase) return;
    const releaseStart = 0.68;
    const rawBlend = progress <= releaseStart ? 0 : Math.min(1, (progress - releaseStart) / (1 - releaseStart));
    const blend = rawBlend * rawBlend * (3 - (2 * rawBlend));
    this._fogTileZoomOrigin = {
      x: this._fogTileZoomPhase.startX + (this._fogTileZoomPhase.deltaX * blend),
      y: this._fogTileZoomPhase.startY + (this._fogTileZoomPhase.deltaY * blend)
    };
  }

  _startFogZoomRenderLoop(event) {
    if (!this._leafletMap || !event || !Number.isFinite(Number(event.zoom)) || !event.center) return false;
    this._clearFogCanvasZoomTransform();
    this._stopFogZoomRenderLoop();
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._prepareFogTileZoomPhase(event, worldMap);
    const startZoom = Number(this._leafletMap.getZoom?.());
    const targetZoom = Number(event.zoom);
    const startCenter = this._leafletMap.getCenter?.();
    const targetCenter = event.center;
    if (!Number.isFinite(startZoom) || !startCenter) return false;
    const startedAt = performance.now();
    const duration = 260;
    const renderFrame = (now) => {
      const rawProgress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      const progress = 1 - Math.pow(1 - rawProgress, 3);
      this._fogZoomAnimation = {
        zoom: startZoom + ((targetZoom - startZoom) * progress),
        center: this._interpolateFogZoomCenter(startCenter, targetCenter, progress)
      };
      this._updateFogTileZoomOrigin(progress);
      this._renderFogCanvas();
      if (rawProgress < 1) {
        this._fogZoomRenderFrame = window.requestAnimationFrame(renderFrame);
      } else {
        this._fogZoomRenderFrame = null;
        this._fogTileZoomPhase = null;
        this._fogTileZoomOrigin = null;
      }
    };
    this._fogZoomRenderFrame = window.requestAnimationFrame(renderFrame);
    return true;
  }

  _applyFogCanvasZoomTransform(event) {
    if (!this._fogCanvas || !this._leafletMap || !event || !Number.isFinite(Number(event.zoom)) || !event.center) return false;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (this._shouldRenderFogDuringZoom(worldMap)) return false;
    const L = globalThis.L;
    if (!L?.DomUtil?.setTransform || typeof this._leafletMap._latLngToNewLayerPoint !== "function") return false;
    const scale = this._leafletMap.getZoomScale(event.zoom);
    const currentTopLeftLatLng = this._leafletMap.containerPointToLatLng(L.point(0, 0));
    const targetTopLeft = this._leafletMap._latLngToNewLayerPoint(currentTopLeftLatLng, event.zoom, event.center);
    const panePos = typeof this._leafletMap._getMapPanePos === "function"
      ? this._leafletMap._getMapPanePos()
      : L.point(0, 0);
    const padding = Number(this._fogCanvasPadding) || 0;
    const offset = targetTopLeft.add(panePos);
    const translate = offset.add(L.point(padding - (scale * padding), padding - (scale * padding)));
    this._fogCanvas.style.transformOrigin = "0 0";
    this._fogCanvas.style.willChange = "transform";
    L.DomUtil.setTransform(this._fogCanvas, translate, scale);
    return true;
  }

  _clearFogCanvasZoomTransform() {
    if (!this._fogCanvas) return;
    this._fogCanvas.style.transform = "";
    this._fogCanvas.style.transformOrigin = "";
    this._fogCanvas.style.willChange = "";
  }

  _getCategoryOptions(worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    const entries = Array.isArray(targetMap?.categories) && targetMap.categories.length
      ? targetMap.categories
      : (Array.isArray(targetMap?.pinCategories) && targetMap.pinCategories.length
        ? targetMap.pinCategories
        : TheatreStore._getDefaultWorldMapCategories());
    return entries.map((entry) => ({
      id: String(entry.id || "").trim().toLowerCase(),
      value: String(entry.id || "").trim().toLowerCase(),
      label: String(entry.name || tr("Category")).trim() || tr("Category"),
      iconClass: String(entry.iconClass || "fa-location-dot").trim() || "fa-location-dot",
      color: String(entry.color || "#33475f").trim().toLowerCase()
    }));
  }

  _getPinTypeDefinitions(worldMap = null) {
    return Object.fromEntries(this._getCategoryOptions(worldMap).map((entry) => [entry.id, entry]));
  }

  _getPinTypeDefinition(type, worldMap = null) {
    const definitions = this._getPinTypeDefinitions(worldMap);
    const fallback = Object.values(definitions)[0] ?? { value: "location", label: tr("Location"), iconClass: "fa-location-dot" };
    return definitions[String(type || fallback.value).trim().toLowerCase()] ?? fallback;
  }

  _getObjectCategoryOptions(worldMap = null) {
    return this._getCategoryOptions(worldMap);
  }

  _getRegionCategoryOptions(worldMap = null) {
    return this._getCategoryOptions(worldMap);
  }

  _getObjectCategoryLabel(categoryId, worldMap = null) {
    const normalizedId = String(categoryId || "").trim().toLowerCase();
    const match = this._getObjectCategoryOptions(worldMap).find((entry) => entry.id === normalizedId);
    return match?.label || String(categoryId || tr("General")).trim() || tr("General");
  }

  _getRegionCategoryLabel(categoryId, worldMap = null) {
    const normalizedId = String(categoryId || "").trim().toLowerCase();
    const match = this._getRegionCategoryOptions(worldMap).find((entry) => entry.id === normalizedId);
    return match?.label || String(categoryId || tr("General")).trim() || tr("General");
  }

  _buildMapThemeInlineStyle(worldMap = null) {
    const themeInlineStyle = buildThemeInlineStyle(TheatreStore.getThemeState());
    const styling = foundry.utils.mergeObject(
      TheatreStore._getDefaultWorldMapStyling(),
      foundry.utils.deepClone(worldMap?.styling ?? {}),
      { inplace: false }
    );
    const tooltipBackground = hexToRgba(styling.tooltip.backgroundColor, styling.tooltip.backgroundOpacity);
    const declarations = [
      `--tom-world-map-tooltip-bg:${tooltipBackground}`,
      `--tom-world-map-tooltip-border:${themeStopToCss({ color: styling.tooltip.backgroundColor, alpha: Math.max(0.35, styling.tooltip.backgroundOpacity) })}`,
      `--tom-world-map-tooltip-blur:${styling.tooltip.blurEnabled ? "8px" : "0px"}`,
      `--tom-world-map-tooltip-heading-font:${themeFontFamilyToCss(styling.tooltip.headingFont, "var(--tom-font-family-heading-3, inherit)")}`,
      `--tom-world-map-tooltip-heading-color:${themeStopToCss({ color: styling.tooltip.headingColor, alpha: 1 })}`,
      `--tom-world-map-tooltip-heading-size:${themeSizeToCss(styling.tooltip.headingSize, 1)}`,
      `--tom-world-map-tooltip-text-font:${themeFontFamilyToCss(styling.tooltip.textFont, "var(--tom-font-family-body, inherit)")}`,
      `--tom-world-map-tooltip-text-color:${themeStopToCss({ color: styling.tooltip.textColor, alpha: 1 })}`,
      `--tom-world-map-tooltip-text-size:${themeSizeToCss(styling.tooltip.textSize, 0.82)}`,
      `--tom-world-map-tooltip-info-font:${themeFontFamilyToCss(styling.tooltip.infoFont, "var(--tom-font-family-sub-text, inherit)")}`,
      `--tom-world-map-tooltip-info-color:${themeStopToCss({ color: styling.tooltip.infoColor, alpha: 1 })}`,
      `--tom-world-map-tooltip-info-size:${themeSizeToCss(styling.tooltip.infoSize, 0.76)}`,
      `--tom-world-map-legend-font:${themeFontFamilyToCss(styling.general.legendFont, "inherit")}`,
      `--tom-world-map-legend-color:${themeStopToCss({ color: styling.general.legendColor, alpha: 1 })}`,
      `--tom-world-map-legend-size:${themeSizeToCss(styling.general.legendSize, 0.56)}`,
      `--tom-world-map-pinlist-heading-font:${themeFontFamilyToCss(styling.general.pinListHeadingFont, "var(--tom-font-family-heading-3, inherit)")}`,
      `--tom-world-map-pinlist-heading-color:${themeStopToCss({ color: styling.general.pinListHeadingColor, alpha: 1 })}`,
      `--tom-world-map-pinlist-heading-size:${themeSizeToCss(styling.general.pinListHeadingSize, 1.02)}`,
      `--tom-world-map-pinlist-text-font:${themeFontFamilyToCss(styling.general.pinListTextFont, "var(--tom-font-family-sub-text, inherit)")}`,
      `--tom-world-map-pinlist-text-color:${themeStopToCss({ color: styling.general.pinListTextColor, alpha: 1 })}`,
      `--tom-world-map-pinlist-text-size:${themeSizeToCss(styling.general.pinListTextSize, 0.82)}`
    ];
    return `${themeInlineStyle};${declarations.join(";")}`;
  }

  _getMapThemeRootElement(host = this.element?.[0]) {
    if (!(host instanceof HTMLElement)) return null;
    if (host.matches?.(".tom-world-map, .tom-world-map-stage")) return host;
    return host.querySelector(".tom-world-map, .tom-world-map-stage");
  }

  applyLivePreviewMapData(worldMap = null) {
    const host = this.element?.[0];
    if (!(host instanceof HTMLElement)) return;
    const root = this._getMapThemeRootElement(host);
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    const styleString = this._buildMapThemeInlineStyle(targetMap);
    if (root instanceof HTMLElement) {
      root.setAttribute("style", styleString);
    }
    applyThemeInlineStyleToHost(host, TheatreStore.getThemeState());
  }

  _canCurrentUserMoveElement(entry) {
    if (game.user?.isGM) return true;
    return Boolean(entry?.movableForPlayers);
  }

  _getLockedCategorySet(kind, worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    const key = String(kind || "").trim();
    const values = [
      ...(Array.isArray(targetMap?.lockedCategories?.categories) ? targetMap.lockedCategories.categories : []),
      ...(Array.isArray(targetMap?.lockedCategories?.[key]) ? targetMap.lockedCategories[key] : [])
    ];
    return new Set(values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean));
  }

  _isCategoryLocked(kind, categoryId, worldMap = null) {
    const normalizedCategoryId = String(categoryId || "").trim().toLowerCase();
    return Boolean(normalizedCategoryId && this._getLockedCategorySet(kind, worldMap).has(normalizedCategoryId));
  }

  _canCurrentUserMoveCategorizedElement(entry, kind, categoryId, worldMap = null) {
    if (this._isCategoryLocked(kind, categoryId, worldMap)) return false;
    return this._canCurrentUserMoveElement(entry);
  }

  _closeContextMenu({ rerender = true } = {}) {
    if (!this._contextMenuState.isOpen) return;
    this._contextMenuState = {
      isOpen: false,
      x: 0,
      y: 0,
      latlng: null,
      mode: "create",
      targetType: "",
      targetId: ""
    };
    this._updateContextMenuElement();
    if (rerender && !this._contextMenuElement) this.render(false);
  }

  _updateContextMenuElement() {
    const element = this._contextMenuElement ?? this.element?.[0]?.querySelector?.(".tom-world-map__context-menu");
    if (!element) return;
    this._contextMenuElement = element;
    if (!this._contextMenuState.isOpen) {
      element.classList.remove("is-visible");
      element.classList.remove("is-edit-menu");
      element.style.left = "0px";
      element.style.top = "0px";
      return;
    }
    element.style.left = `${Math.round(this._contextMenuState.x)}px`;
    element.style.top = `${Math.round(this._contextMenuState.y)}px`;
    element.classList.toggle("is-edit-menu", this._contextMenuState.mode === "edit");
    element.classList.add("is-visible");
  }

  _openElementContextMenu(event, targetType, targetId) {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    if (!game.user?.isGM) return;
    const nativeEvent = event?.originalEvent ?? event;
    const containerPoint = this._leafletMap?.mouseEventToContainerPoint?.(nativeEvent);
    this._contextMenuState = {
      isOpen: true,
      x: Math.max(12, Number(containerPoint?.x) || 0),
      y: Math.max(12, Number(containerPoint?.y) || 0),
      latlng: event?.latlng ?? null,
      mode: "edit",
      targetType: String(targetType || "").trim(),
      targetId: String(targetId || "").trim()
    };
    this._updateContextMenuElement();
  }

  async _persistMapElementMove(elementType, mapId, elementId, point) {
    if (!mapId || !elementId || !point) return null;
    if (game.user?.isGM) {
      if (elementType === "pin") {
        return TheatreStore.upsertWorldMapPin(mapId, { id: elementId, x: point.x, y: point.y });
      }
      if (elementType === "objectOverlay") {
        return TheatreStore.upsertWorldMapObjectOverlay(mapId, { id: elementId, x: point.x, y: point.y });
      }
      return null;
    }

    game.socket?.emit?.(`module.${MODULE_ID}`, {
      action: "requestWorldMapElementMove",
      elementType,
      mapId,
      elementId,
      x: point.x,
      y: point.y
    });

    return { id: elementId, x: point.x, y: point.y };
  }

  _buildLeafletBounds(map, worldMap) {
    const zoom = Number(worldMap?.maxNativeZoom) || 0;
    const southWest = map.unproject([0, worldMap.height], zoom);
    const northEast = map.unproject([worldMap.width, 0], zoom);
    return new globalThis.L.LatLngBounds(southWest, northEast);
  }

  _mapPixelsToLatLng(x, y, worldMap) {
    if (!this._leafletMap) return null;
    return this._leafletMap.unproject([x, y], Number(worldMap?.maxNativeZoom) || 0);
  }

  _latLngToMapPixels(latlng, worldMap) {
    if (!this._leafletMap || !latlng) return { x: 0, y: 0 };
    const projected = this._leafletMap.project(latlng, Number(worldMap?.maxNativeZoom) || 0);
    return {
      x: projected.x,
      y: projected.y
    };
  }

  _getClosestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (!dx && !dy) return { x: start.x, y: start.y };
    const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
    return {
      x: start.x + (dx * t),
      y: start.y + (dy * t)
    };
  }

  _getSnappedLatLng(latlng, worldMap, {
    includeRegions = true,
    includeLines = true,
    excludeRegionId = null,
    excludeLineId = null,
    radius = 5
  } = {}) {
    if (!this._leafletMap || !latlng || !worldMap) return latlng;
    const pointer = this._leafletMap.latLngToContainerPoint(latlng);
    let bestPoint = null;
    let bestDistance = Number(radius) || 5;

    const considerLatLng = (candidateLatLng) => {
      if (!candidateLatLng) return;
      const candidate = this._leafletMap.latLngToContainerPoint(candidateLatLng);
      const distance = pointer.distanceTo(candidate);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestPoint = candidateLatLng;
      }
    };

    const considerSegment = (startLatLng, endLatLng) => {
      if (!startLatLng || !endLatLng) return;
      const start = this._leafletMap.latLngToContainerPoint(startLatLng);
      const end = this._leafletMap.latLngToContainerPoint(endLatLng);
      const closest = this._getClosestPointOnSegment(pointer, start, end);
      const distance = pointer.distanceTo(closest);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestPoint = this._leafletMap.containerPointToLatLng(closest);
      }
    };

    if (includeRegions) {
      for (const region of worldMap.regions ?? []) {
        if (excludeRegionId && String(region.id) === String(excludeRegionId)) continue;
        const latlngs = this._buildRegionLatLngs(region, worldMap);
        latlngs.forEach(considerLatLng);
        for (let index = 0; index < latlngs.length; index += 1) {
          considerSegment(latlngs[index], latlngs[(index + 1) % latlngs.length]);
        }
      }
    }

    if (includeLines) {
      for (const line of worldMap.lines ?? []) {
        if (excludeLineId && String(line.id) === String(excludeLineId)) continue;
        const latlngs = this._buildLineLatLngs(line, worldMap);
        latlngs.forEach(considerLatLng);
        for (let index = 0; index < latlngs.length - 1; index += 1) {
          considerSegment(latlngs[index], latlngs[index + 1]);
        }
      }
    }

    return bestPoint ?? latlng;
  }

  _createMarkerIcon(pin) {
    const color = normalizeHexColor(pin?.color, "#7ebaec");
    const typeDefinition = this._getPinTypeDefinition(pin?.type);
    const size = normalizePinSize(pin?.size);
    const iconFontSize = (1.35 * size).toFixed(2);
    const borderWidth = Math.max(0, Math.min(8, Number(pin?.borderWidth) || 0));
    const borderColor = normalizeHexColor(pin?.borderColor, "#101722");
    const strokeStyle = borderWidth > 0
      ? ` -webkit-text-stroke:${borderWidth}px ${borderColor}; paint-order:stroke fill;`
      : "";
    const shadowStyle = this._buildPinShadowStyle(pin);
    return globalThis.L.divIcon({
      className: "tom-world-map-marker",
      html: `<span class="tom-world-map-marker__icon"><i class="fas ${typeDefinition.iconClass}" aria-hidden="true" style="color:${color}; font-size:${iconFontSize}rem;${strokeStyle}${shadowStyle ? ` ${shadowStyle}` : ""}"></i></span>`,
      iconSize: [Math.round(30 * size), Math.round(30 * size)],
      iconAnchor: [Math.round(15 * size), Math.round(15 * size)]
    });
  }

  _buildPinShadowStyle(pin) {
    const opacity = Number.isFinite(Number(pin?.shadowOpacity)) ? Math.max(0, Math.min(1, Number(pin.shadowOpacity))) : 0.55;
    const distance = Number.isFinite(Number(pin?.shadowDistance)) ? Math.max(0, Math.min(32, Number(pin.shadowDistance))) : 2;
    const blur = Number.isFinite(Number(pin?.shadowBlur)) ? Math.max(0, Math.min(32, Number(pin.shadowBlur))) : 4;
    if (opacity <= 0 || (distance <= 0 && blur <= 0)) return "";
    const color = normalizeHexColor(pin?.shadowColor, "#000000");
    return `filter:drop-shadow(${distance}px ${distance}px ${blur}px ${hexToRgba(color, opacity)});`;
  }

  _getObjectOverlayScale(entry, zoom = null) {
    if (!entry?.scaleWithZoom) return 1;
    if (!this._leafletMap) return 1;
    const currentZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : this._leafletMap.getZoom();
    const referenceZoom = Number.isFinite(Number(this.mapId ? TheatreStore.getWorldMapById(this.mapId)?.initialView?.zoom : null))
      ? Number(TheatreStore.getWorldMapById(this.mapId)?.initialView?.zoom)
      : 0;
    const scale = Math.pow(2, currentZoom - referenceZoom);
    return Math.max(0.2, Math.min(6, scale));
  }

  _getFontTypeOptions(selectedValue = "") {
    const options = [{ value: "", label: "Standard" }];
    const seen = new Set([""]);
    const appendOption = (value, label = value) => {
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue || seen.has(normalizedValue)) return;
      seen.add(normalizedValue);
      options.push({
        value: normalizedValue,
        label: String(label ?? normalizedValue).trim() || normalizedValue
      });
    };
    const appendFontEntry = (key, value) => {
      if (typeof value === "string") {
        appendOption(key, value);
        return;
      }
      if (value && typeof value === "object") {
        const explicitValue = String(value.family ?? value.value ?? key ?? "").trim();
        const explicitLabel = String(value.label ?? value.name ?? value.family ?? explicitValue).trim();
        if (explicitValue) {
          appendOption(explicitValue, explicitLabel);
          return;
        }
      }
      appendOption(key, key);
    };
    const consumeFontSource = (source) => {
      if (!source) return;
      if (source instanceof Map) {
        for (const [value, label] of source.entries()) appendFontEntry(value, label);
        return;
      }
      if (source instanceof Set) {
        for (const value of source.values()) appendFontEntry(value, value);
        return;
      }
      if (Array.isArray(source)) {
        for (const entry of source) {
          if (typeof entry === "string") appendFontEntry(entry, entry);
          else if (entry && typeof entry === "object") consumeFontSource(entry);
        }
        return;
      }
      if (typeof source === "object") {
        for (const [key, value] of Object.entries(source)) appendFontEntry(key, value);
      }
    };
    const fontConfig = globalThis.FontConfig;
    const resolveFontSource = (source) => {
      try {
        return typeof source === "function" ? source.call(fontConfig) : source;
      } catch (_error) {
        return null;
      }
    };
    let coreFonts = null;
    try {
      coreFonts = globalThis.game?.settings?.get?.("core", "fonts");
    } catch (_error) {
      coreFonts = null;
    }
    consumeFontSource(resolveFontSource(fontConfig?.getAvailableFontChoices));
    consumeFontSource(resolveFontSource(fontConfig?.getAvailableFonts));
    consumeFontSource(resolveFontSource(fontConfig?._collectDefinitions));
    consumeFontSource(globalThis.CONFIG?.fontDefinitions);
    consumeFontSource(coreFonts);
    options.sort((left, right) => {
      if (!left.value) return -1;
      if (!right.value) return 1;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
    const selected = String(selectedValue || "").trim();
    if (selected && !options.some((option) => option.value === selected)) {
      options.push({ value: selected, label: selected });
    }
    return options;
  }

  _getObjectOverlayImageRatio(entry, marker = null) {
    const cacheKey = String(entry?.id || entry?.imagePath || "").trim();
    if (cacheKey && this._objectOverlayImageRatioCache.has(cacheKey)) {
      return this._objectOverlayImageRatioCache.get(cacheKey);
    }

    const imageElement = marker?.getElement?.()?.querySelector?.(".tom-world-map-object--image img");
    const naturalWidth = Number(imageElement?.naturalWidth) || 0;
    const naturalHeight = Number(imageElement?.naturalHeight) || 0;
    if (naturalWidth > 0 && naturalHeight > 0) {
      const ratio = naturalWidth / naturalHeight;
      if (cacheKey) this._objectOverlayImageRatioCache.set(cacheKey, ratio);
      return ratio;
    }

    return 1;
  }

  _getObjectOverlayDimensions(entry, zoom = null, marker = null) {
    const scale = this._getObjectOverlayScale(entry, zoom);
    const { width, height } = this._getObjectOverlayBaseDimensions(entry, marker);
    return { width: width * scale, height: height * scale, scale };
  }

  _getObjectOverlayBaseDimensions(entry, marker = null) {
    if (entry?.type === "text") {
      const width = Math.max(24, ((Number(entry?.text?.length) || Number(entry?.name?.length) || 8) * (Number(entry?.fontSize) || 24) * 0.58));
      const height = Math.max(12, (Number(entry?.fontSize) || 24) * 1.25);
      return { width, height };
    }

    const width = Math.max(16, Number(entry?.width) || 160);
    const ratio = Math.max(0.05, this._getObjectOverlayImageRatio(entry, marker));
    const height = Math.max(16, width / ratio);
    return { width, height };
  }

  _buildObjectOverlayIconHtml(entry, zoom = null) {
    const { width } = this._getObjectOverlayBaseDimensions(entry);
    if (entry.type === "text") {
      const textStyle = buildTextPresentationStyle(entry, 1);
      return `<div class="tom-world-map-object tom-world-map-object--text" style="opacity:${Number(entry.opacity) || 1}; color:${escapeHtml(textStyle.color)}; font-size:${textStyle.fontSizePx.toFixed(2)}px; line-height:${textStyle.lineHeight};${textStyle.fontFamily ? `font-family:${textStyle.fontFamily};` : ""}${textStyle.webkitTextStroke ? `-webkit-text-stroke:${textStyle.webkitTextStroke};paint-order:stroke fill;` : ""}${textStyle.textShadow ? `text-shadow:${textStyle.textShadow};` : ""}">${escapeHtml(entry.text || entry.name || tr("Text object"))}</div>`;
    }
    return `<div class="tom-world-map-object tom-world-map-object--image" style="opacity:${Number(entry.opacity) || 1}; width:${width.toFixed(2)}px;"><img src="${escapeHtml(entry.imagePath || "")}" alt="${escapeHtml(entry.name || tr("Image object"))}" /></div>`;
  }

  _createObjectOverlayIcon(entry, zoom = null, marker = null) {
    return globalThis.L.divIcon({
      className: "tom-world-map-object-marker",
      html: this._buildObjectOverlayIconHtml(entry, zoom),
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  _queueObjectOverlayMarkerPresentation(marker, entry, zoom = null) {
    const apply = () => this._applyObjectOverlayMarkerPresentation(marker, entry, zoom);
    apply();
    window.requestAnimationFrame?.(() => apply());
    window.setTimeout?.(() => apply(), 0);
    window.setTimeout?.(() => apply(), 40);
  }

  _refreshObjectOverlayMarker(marker, entry, zoom = null) {
    if (!marker || !entry) return;
    marker._tomObjectEntry = entry;
    marker.setIcon(this._createObjectOverlayIcon(entry, zoom, marker));
    this._queueObjectOverlayMarkerPresentation(marker, entry, zoom);
  }

  _applyObjectOverlayMarkerPresentation(marker, entry, zoom = null) {
    const element = marker?.getElement?.();
    if (!element) return;
    const { width, height } = this._getObjectOverlayBaseDimensions(entry, marker);
    const scale = this._getObjectOverlayScale(entry, zoom);

    element.style.width = "0";
    element.style.height = "0";
    element.style.marginLeft = "0";
    element.style.marginTop = "0";
    element.style.overflow = "visible";

    const objectRoot = element.querySelector(".tom-world-map-object");
    if (!objectRoot) return;
    objectRoot.style.opacity = `${Number.isFinite(Number(entry.opacity)) ? Number(entry.opacity) : 1}`;
    objectRoot.style.transformOrigin = "center center";
    objectRoot.style.transform = `translate(-50%, -50%) scale(${scale})`;

    if (entry.type === "image") {
      objectRoot.style.width = `${width.toFixed(2)}px`;
      objectRoot.style.height = `${height.toFixed(2)}px`;
      const image = objectRoot.querySelector("img");
      if (image) {
        image.style.width = `${width.toFixed(2)}px`;
        image.style.height = `${height.toFixed(2)}px`;
        image.style.maxWidth = "none";
        image.style.objectFit = "contain";
      }
      return;
    }

    const textStyle = buildTextPresentationStyle(entry, 1);
    objectRoot.style.fontSize = `${textStyle.fontSizePx.toFixed(2)}px`;
    objectRoot.style.lineHeight = `${textStyle.lineHeight}`;
    objectRoot.style.color = textStyle.color;
    objectRoot.style.fontFamily = String(entry.fontFamily || "").trim();
    objectRoot.style.webkitTextStroke = textStyle.webkitTextStroke;
    objectRoot.style.paintOrder = textStyle.webkitTextStroke ? "stroke fill" : "";
    objectRoot.style.textShadow = textStyle.textShadow;
  }

  _applyObjectOverlayAnimatedScale(targetZoom, animate = true) {
    if (!this._leafletMap) return;
    this._leafletObjectOverlayMarkers.forEach((marker) => {
      const entry = marker?._tomObjectEntry;
      const element = marker?.getElement?.();
      const objectRoot = element?.querySelector?.(".tom-world-map-object");
      if (!entry || !objectRoot) return;
      const targetScale = this._getObjectOverlayScale(entry, targetZoom);
      objectRoot.classList.toggle("is-zoom-animating", Boolean(animate));
      objectRoot.style.transformOrigin = "center center";
      objectRoot.style.transform = `translate(-50%, -50%) scale(${targetScale})`;
    });
  }

  _clearObjectOverlayAnimatedScale() {
    this._leafletObjectOverlayMarkers.forEach((marker) => {
      const objectRoot = marker?.getElement?.()?.querySelector?.(".tom-world-map-object");
      if (!objectRoot) return;
      objectRoot.classList.remove("is-zoom-animating");
    });
  }

  _syncLeafletOverlays(worldMap = null) {
    if (!this._leafletMap || !globalThis.L) return;
    this._leafletOverlayLayers.forEach((layer) => layer.remove());
    this._leafletOverlayLayers.clear();
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;
    for (const overlay of targetMap.overlays ?? []) {
      if (!overlay?.tileUrlTemplate || !this._activeOverlayIds.has(overlay.id)) continue;
      const overlayLayer = globalThis.L.tileLayer(overlay.tileUrlTemplate, {
        tileSize: targetMap.tileSize,
        minZoom: targetMap.minZoom,
        maxZoom: targetMap.maxZoom,
        maxNativeZoom: targetMap.maxNativeZoom,
        noWrap: true,
        bounds: this._leafletBounds,
        opacity: Number.isFinite(Number(overlay.opacity)) ? Number(overlay.opacity) : 1,
        zIndex: 240
      }).addTo(this._leafletMap);
      overlayLayer.on("tileerror", (event) => {
        const failedUrl = String(event?.tile?.src || overlay.tileUrlTemplate || "").trim();
        console.warn(`${MODULE_ID} | World map overlay tile failed to load`, failedUrl);
      });
      this._leafletOverlayLayers.set(overlay.id, overlayLayer);
    }
  }

  _syncLeafletObjectOverlays(worldMap = null) {
    if (!this._leafletMap || !globalThis.L) return;
    this._leafletObjectOverlayMarkers.forEach((marker) => marker.remove());
    this._leafletObjectOverlayMarkers.clear();
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap || !this._areObjectOverlaysVisible) return;
    for (const entry of targetMap.objectOverlays ?? []) {
      if (entry.visible === false) continue;
      if (this._hiddenCategories.has(String(entry.category || "").trim().toLowerCase())) continue;
      const categoryId = String(entry.category || "").trim().toLowerCase();
      const canDrag = this._canCurrentUserMoveCategorizedElement(entry, "objects", categoryId, targetMap);
      const marker = globalThis.L.marker(this._mapPixelsToLatLng(entry.x, entry.y, targetMap), {
        icon: this._createObjectOverlayIcon(entry),
        draggable: canDrag,
        keyboard: true,
        zIndexOffset: 800
      });
      marker.on("dblclick", async (event) => {
        if (marker._tomOpenDocumentTimer) {
          window.clearTimeout(marker._tomOpenDocumentTimer);
          marker._tomOpenDocumentTimer = null;
        }
        event?.originalEvent?.preventDefault?.();
        event?.originalEvent?.stopPropagation?.();
        globalThis.L.DomEvent.stop(event?.originalEvent ?? event);
        await this._editObjectOverlay(entry);
      });
      marker.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        this._openElementContextMenu(event, "objectOverlay", entry.id);
      });
      if (entry.documentUuid) {
        marker.on("click", (event) => {
          globalThis.L.DomEvent.stop(event?.originalEvent ?? event);
          if (marker._tomOpenDocumentTimer) window.clearTimeout(marker._tomOpenDocumentTimer);
          marker._tomOpenDocumentTimer = window.setTimeout(async () => {
            marker._tomOpenDocumentTimer = null;
            await this._openObjectOverlayDocument(marker._tomObjectEntry ?? entry);
          }, 220);
        });
      }
      if (canDrag) {
        marker.on("dragend", async (event) => {
          const latlng = event.target?.getLatLng?.();
          if (!latlng) return;
          const point = this._latLngToMapPixels(latlng, targetMap);
          const updatedEntry = await this._persistMapElementMove("objectOverlay", targetMap.id, entry.id, point);
          if (!updatedEntry) return;
          marker._tomObjectEntry = updatedEntry;
          this._refreshObjectOverlayMarker(marker, updatedEntry, this._leafletMap?.getZoom?.());
        });
      }
      marker.on("add", () => {
        this._refreshObjectOverlayMarker(marker, entry, this._leafletMap?.getZoom?.());
        const image = marker.getElement?.()?.querySelector?.(".tom-world-map-object--image img");
        if (image && !image.dataset.tomRatioBound) {
          image.dataset.tomRatioBound = "true";
          image.addEventListener("load", () => {
            const cacheKey = String(entry?.id || entry?.imagePath || "").trim();
            if (image.naturalWidth > 0 && image.naturalHeight > 0 && cacheKey) {
              this._objectOverlayImageRatioCache.set(cacheKey, image.naturalWidth / image.naturalHeight);
            }
            this._refreshObjectOverlayMarker(marker, marker._tomObjectEntry, this._leafletMap?.getZoom?.());
          });
        }
      });
      marker.addTo(this._leafletMap);
      marker._tomObjectEntry = entry;
      this._refreshObjectOverlayMarker(marker, entry, this._leafletMap?.getZoom?.());
      this._leafletObjectOverlayMarkers.set(entry.id, marker);
    }
  }

  _buildRegionLatLngs(region, worldMap) {
    return (region?.points ?? []).map((point) => this._mapPixelsToLatLng(point.x, point.y, worldMap)).filter(Boolean);
  }

  _buildLineLatLngs(line, worldMap) {
    return (line?.points ?? []).map((point) => this._mapPixelsToLatLng(point.x, point.y, worldMap)).filter(Boolean);
  }

  _clearDraftRegionLayer() {
    this._leafletDraftRegionLayer?.remove?.();
    this._leafletDraftRegionLayer = null;
  }

  _clearRegionVertexMarkers() {
    for (const marker of this._leafletRegionVertexMarkers) {
      marker?.remove?.();
    }
    this._leafletRegionVertexMarkers = [];
  }

  _syncDraftRegionLayer(worldMap = null) {
    this._clearDraftRegionLayer();
    if (!this._leafletMap || !globalThis.L || (!this._isRegionDrawMode && !this._editingRegionId) || this._pendingRegionPoints.length < 2) return;
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;
    const latlngs = this._pendingRegionPoints.map((point) => this._mapPixelsToLatLng(point.x, point.y, targetMap)).filter(Boolean);
    if (latlngs.length < 2) return;
    const style = this._editingRegionStyle ?? {};
    const hasLiveStyle = Boolean(this._editingRegionId || this._editingRegionStyle);
    const strokeOpacity = Number.isFinite(Number(style.strokeOpacity)) ? Math.max(0, Math.min(1, Number(style.strokeOpacity))) : 0.92;
    const fillOpacity = Number.isFinite(Number(style.fillOpacity)) ? Math.max(0, Math.min(1, Number(style.fillOpacity))) : 0.16;
    const strokeWidth = hasLiveStyle ? (Number(style.strokeWidth) || 3) : 2;
    this._leafletDraftRegionLayer = globalThis.L.polygon(latlngs, {
      color: hasLiveStyle ? normalizeHexColor(style.strokeColor, "#9fd2ff") : "#f3d38e",
      weight: strokeWidth,
      opacity: hasLiveStyle ? strokeOpacity : 0.92,
      fillColor: hasLiveStyle ? normalizeHexColor(style.fillColor, "#7ebaec") : "#f3d38e",
      fillOpacity: hasLiveStyle ? fillOpacity : 0.12,
      dashArray: hasLiveStyle ? getLineDashArray(style.strokeStyle, strokeWidth) : "6 4",
      interactive: Boolean(this._editingRegionId)
    }).addTo(this._leafletMap);
    if (hasLiveStyle) this._applyRegionPresentation(this._leafletDraftRegionLayer, style);
    if (this._editingRegionId) {
      this._leafletDraftRegionLayer.on("click", (event) => {
        globalThis.L.DomEvent.stop(event);
        const snappedLatLng = this._regionSnapEnabled
          ? this._getSnappedLatLng(event?.latlng, targetMap, { excludeRegionId: this._editingRegionId })
          : event?.latlng;
        this._insertRegionPointAtLatLng(snappedLatLng, targetMap);
      });
    }
  }

  _insertRegionPointAtLatLng(latlng, worldMap) {
    if (!latlng || !worldMap || this._pendingRegionPoints.length < 2) return;
    const clickedPoint = this._latLngToMapPixels(latlng, worldMap);
    let insertAfterIndex = this._pendingRegionPoints.length - 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    const distanceToSegmentSquared = (point, start, end) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (!dx && !dy) {
        const px = point.x - start.x;
        const py = point.y - start.y;
        return px * px + py * py;
      }
      const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
      const closestX = start.x + (dx * t);
      const closestY = start.y + (dy * t);
      const distX = point.x - closestX;
      const distY = point.y - closestY;
      return (distX * distX) + (distY * distY);
    };

    for (let index = 0; index < this._pendingRegionPoints.length; index += 1) {
      const start = this._pendingRegionPoints[index];
      const end = this._pendingRegionPoints[(index + 1) % this._pendingRegionPoints.length];
      const distance = distanceToSegmentSquared(clickedPoint, start, end);
      if (distance < bestDistance) {
        bestDistance = distance;
        insertAfterIndex = index;
      }
    }

    this._pendingRegionPoints.splice(insertAfterIndex + 1, 0, clickedPoint);
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    this.render(false);
  }

  _syncRegionVertexMarkers(worldMap = null) {
    this._clearRegionVertexMarkers();
    if (!this._leafletMap || !globalThis.L || (!this._editingRegionId && !this._isRegionDrawMode) || !game.user?.isGM) return;
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;

    this._pendingRegionPoints.forEach((point, index) => {
      const marker = globalThis.L.marker(this._mapPixelsToLatLng(point.x, point.y, targetMap), {
        icon: globalThis.L.divIcon({
          className: "tom-world-map-region-vertex",
          html: `<span class="tom-world-map-region-vertex__dot"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        }),
        draggable: true,
        keyboard: false,
        pane: "tom-world-map-edit-pane",
        zIndexOffset: 1400
      });
      marker.on("drag", (event) => {
        const latlng = event.target?.getLatLng?.();
        if (!latlng) return;
        const snappedLatLng = this._regionSnapEnabled
          ? this._getSnappedLatLng(latlng, targetMap, { excludeRegionId: this._editingRegionId })
          : latlng;
        if (this._regionSnapEnabled && snappedLatLng) marker.setLatLng(snappedLatLng);
        const nextPoint = this._latLngToMapPixels(snappedLatLng, targetMap);
        this._pendingRegionPoints[index] = nextPoint;
        this._syncDraftRegionLayer(targetMap);
      });
      marker.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        const minimumPoints = this._editingRegionId ? 3 : 1;
        if (this._pendingRegionPoints.length <= minimumPoints) return;
        this._pendingRegionPoints.splice(index, 1);
        this._syncDraftRegionLayer(targetMap);
        this._syncRegionVertexMarkers(targetMap);
        this.render(false);
      });
      marker.addTo(this._leafletMap);
      this._leafletRegionVertexMarkers.push(marker);
    });
  }

  _insertLinePointAtLatLng(latlng, worldMap) {
    if (!latlng || !worldMap || this._pendingLinePoints.length < 2) return;
    const clickedPoint = this._latLngToMapPixels(latlng, worldMap);
    let insertAfterIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    const distanceToSegmentSquared = (point, start, end) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (!dx && !dy) {
        const px = point.x - start.x;
        const py = point.y - start.y;
        return px * px + py * py;
      }
      const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
      const closestX = start.x + (dx * t);
      const closestY = start.y + (dy * t);
      const distX = point.x - closestX;
      const distY = point.y - closestY;
      return (distX * distX) + (distY * distY);
    };

    for (let index = 0; index < this._pendingLinePoints.length - 1; index += 1) {
      const distance = distanceToSegmentSquared(clickedPoint, this._pendingLinePoints[index], this._pendingLinePoints[index + 1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        insertAfterIndex = index;
      }
    }

    this._pendingLinePoints.splice(insertAfterIndex + 1, 0, clickedPoint);
    this._syncDraftLineLayer(worldMap);
    this._syncLineVertexMarkers(worldMap);
    this.render(false);
  }

  _ensureRegionPattern(region = {}, layer = null) {
    if (!this._leafletMap || !globalThis.L) return "";
    const fillStyle = String(region.fillStyle || "solid").trim().toLowerCase();
    if (fillStyle === "solid") return "";
    const renderer = this._leafletMap.getRenderer?.(layer ?? this._leafletDraftRegionLayer ?? undefined);
    const svg = renderer?._container ?? this._leafletMap.getPanes?.()?.overlayPane?.querySelector?.("svg");
    if (!svg) return "";
    const safeId = `tom-map-region-pattern-${this.mapId || "map"}-${region.id || "draft"}-${fillStyle}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    const escapedPatternId = globalThis.CSS?.escape ? globalThis.CSS.escape(safeId) : safeId;
    let pattern = defs.querySelector(`#${escapedPatternId}`);
    if (!pattern) {
      pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
      pattern.setAttribute("id", safeId);
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      defs.appendChild(pattern);
    }
    const scale = Math.max(4, Math.min(64, Number(region.fillPatternScale) || 14));
    const patternSize = Math.max(1, Math.min(24, Number(region.fillPatternSize) || 2));
    const color = normalizeHexColor(region.fillColor, "#7ebaec");
    const opacity = Number.isFinite(Number(region.fillOpacity)) ? Math.max(0, Math.min(1, Number(region.fillOpacity))) : 0.28;
    pattern.setAttribute("width", String(scale));
    pattern.setAttribute("height", String(scale));
    pattern.setAttribute("overflow", "visible");
    pattern.replaceChildren();

    const overflow = Math.max(patternSize * 2, scale * 0.75);
    const appendLine = (attrs) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      Object.entries(attrs).forEach(([key, value]) => line.setAttribute(key, String(value)));
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-opacity", String(opacity));
      line.setAttribute("stroke-width", String(patternSize));
      line.setAttribute("stroke-linecap", "butt");
      line.setAttribute("shape-rendering", "geometricPrecision");
      pattern.appendChild(line);
    };
    const appendDiagonalSet = (direction = "forward") => {
      const repeatCount = Math.max(2, Math.ceil(patternSize / Math.max(1, scale)) + 2);
      for (let offsetIndex = -repeatCount; offsetIndex <= repeatCount; offsetIndex += 1) {
        const offset = offsetIndex * scale;
        if (direction === "backward") {
          appendLine({
            x1: -overflow + offset,
            y1: -overflow,
            x2: scale + overflow + offset,
            y2: scale + overflow
          });
        } else {
          appendLine({
            x1: -overflow + offset,
            y1: scale + overflow,
            x2: scale + overflow + offset,
            y2: -overflow
          });
        }
      }
    };
    if (fillStyle === "dots") {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(scale / 2));
      circle.setAttribute("cy", String(scale / 2));
      circle.setAttribute("r", String(patternSize));
      circle.setAttribute("fill", color);
      circle.setAttribute("fill-opacity", String(opacity));
      pattern.appendChild(circle);
    } else {
      appendDiagonalSet("forward");
      if (fillStyle === "crosshatch") appendDiagonalSet("backward");
    }
    return safeId;
  }

  _applyRegionPresentation(layer, region = {}) {
    const element = layer?.getElement?.();
    if (!element) return;
    const patternId = this._ensureRegionPattern(region, layer);
    if (patternId) element.style.fill = `url(#${patternId})`;
  }

  _syncLeafletRegions(worldMap = null) {
    this._leafletRegionLayers.forEach((layer) => layer.remove());
    this._leafletRegionLayers.clear();
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!this._leafletMap || !globalThis.L || !targetMap || !this._areRegionsVisible) {
      this._syncDraftRegionLayer(targetMap);
      this._syncRegionVertexMarkers(targetMap);
      return;
    }
    for (const region of targetMap.regions ?? []) {
      if (region.visible === false || (region.points?.length ?? 0) < 3) continue;
      if (this._hiddenCategories.has(String(region.category || "").trim().toLowerCase())) continue;
      if (this._editingRegionId && region.id === this._editingRegionId) continue;
      const latlngs = this._buildRegionLatLngs(region, targetMap);
      const strokeOpacity = Number.isFinite(Number(region.strokeOpacity)) ? Math.max(0, Math.min(1, Number(region.strokeOpacity))) : 0.95;
      const fillOpacity = Number.isFinite(Number(region.fillOpacity)) ? Math.max(0, Math.min(1, Number(region.fillOpacity))) : 0.28;
      const strokeWidth = Number(region.strokeWidth) || 2;
      const polygon = globalThis.L.polygon(latlngs, {
        color: region.strokeColor,
        weight: strokeWidth,
        opacity: strokeOpacity,
        fillColor: region.fillColor,
        fillOpacity,
        dashArray: getLineDashArray(region.strokeStyle, strokeWidth)
      }).addTo(this._leafletMap);
      this._applyRegionPresentation(polygon, region);
      polygon.bindTooltip(`<div class="tom-world-map__tooltip-content"><div class="tom-world-map__tooltip-heading">${escapeHtml(region.name || tr("Region"))}</div>${region.documentName ? `<div class="tom-world-map__tooltip-info">${tr("Linked document")}: ${escapeHtml(region.documentName)}</div>` : ""}</div>`, {
        direction: "center",
        sticky: true,
        className: "tom-world-map__tooltip",
        opacity: 0.96
      });
      polygon.on("dblclick", async (event) => {
        if (polygon._tomOpenDocumentTimer) {
          window.clearTimeout(polygon._tomOpenDocumentTimer);
          polygon._tomOpenDocumentTimer = null;
        }
        globalThis.L.DomEvent.stop(event);
        await this._editRegion(region);
      });
      polygon.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        this._openElementContextMenu(event, "region", region.id);
      });
      if (region.documentUuid) {
        polygon.on("click", (event) => {
          globalThis.L.DomEvent.stop(event);
          if (polygon._tomOpenDocumentTimer) window.clearTimeout(polygon._tomOpenDocumentTimer);
          polygon._tomOpenDocumentTimer = window.setTimeout(async () => {
            polygon._tomOpenDocumentTimer = null;
            await this._openLinkedMapDocument(region);
          }, 220);
        });
      }
      this._leafletRegionLayers.set(region.id, polygon);
    }
    this._syncDraftRegionLayer(targetMap);
    this._syncRegionVertexMarkers(targetMap);
  }

  _clearDraftLineLayer() {
    this._leafletDraftLineOutlineLayer?.remove?.();
    this._leafletDraftLineOutlineLayer = null;
    this._leafletDraftLineLayer?.remove?.();
    this._leafletDraftLineLayer = null;
  }

  _clearLinePointMarkers() {
    for (const marker of this._leafletLinePointMarkers) {
      marker?.remove?.();
    }
    this._leafletLinePointMarkers = [];
  }

  _clearLineVertexMarkers() {
    for (const marker of this._leafletLineVertexMarkers) {
      marker?.remove?.();
    }
    this._leafletLineVertexMarkers = [];
  }

  _syncDraftLineLayer(worldMap = null) {
    this._clearDraftLineLayer();
    if (!this._leafletMap || !globalThis.L || (!this._isLineDrawMode && !this._editingLineId) || this._pendingLinePoints.length < 2) return;
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;
    const latlngs = this._pendingLinePoints.map((point) => this._mapPixelsToLatLng(point.x, point.y, targetMap)).filter(Boolean);
    if (latlngs.length < 2) return;
    const style = this._editingLineStyle ?? {};
    const outlineWidth = Math.max(0, Number(style.outlineWidth) || 0);
    const lineWidth = Number(style.width) || 3;
    const dashArray = this._editingLineId ? getLineDashArray(style.lineStyle, lineWidth) : "6 4";
    if (outlineWidth > 0) {
      this._leafletDraftLineOutlineLayer = globalThis.L.polyline(latlngs, {
        color: normalizeHexColor(style.outlineColor, "#101722"),
        weight: lineWidth + (outlineWidth * 2),
        opacity: Number.isFinite(Number(style.opacity)) ? Math.max(0, Math.min(1, Number(style.opacity))) : 0.95,
        lineCap: String(style.lineCap || "round").trim().toLowerCase(),
        lineJoin: "round",
        dashArray,
        interactive: false
      }).addTo(this._leafletMap);
    }
    this._leafletDraftLineLayer = globalThis.L.polyline(latlngs, {
      color: normalizeHexColor(style.color, this._editingLineId ? "#9fd2ff" : "#f3d38e"),
      weight: lineWidth,
      opacity: Number.isFinite(Number(style.opacity)) ? Math.max(0, Math.min(1, Number(style.opacity))) : 0.94,
      dashArray,
      lineCap: String(style.lineCap || "round").trim().toLowerCase(),
      lineJoin: "round",
      interactive: Boolean(this._editingLineId)
    }).addTo(this._leafletMap);
    this._applyLinePresentation(this._leafletDraftLineLayer, style);
    if (this._editingLineId) {
      this._leafletDraftLineLayer.on("click", (event) => {
        globalThis.L.DomEvent.stop(event);
        const snappedLatLng = this._lineSnapEnabled
          ? this._getSnappedLatLng(event?.latlng, targetMap, { excludeLineId: this._editingLineId })
          : event?.latlng;
        this._insertLinePointAtLatLng(snappedLatLng, targetMap);
      });
    }
  }

  _createLinePointIcon(line) {
    const pointStyle = String(line?.pointStyle || "none").trim().toLowerCase();
    if (pointStyle === "none") return null;
    const size = Math.max(2, Math.min(32, Number(line?.pointSize) || 7));
    const color = normalizeHexColor(line?.pointColor, line?.color || "#d7e8ff");
    const opacity = Number.isFinite(Number(line?.pointOpacity)) ? Math.max(0, Math.min(1, Number(line.pointOpacity))) : 0.95;
    const outlineColor = normalizeHexColor(line?.pointOutlineColor, "#101722");
    const outlineWidth = Math.max(0, Math.min(12, Number(line?.pointOutlineWidth) || 0));
    return globalThis.L.divIcon({
      className: `tom-world-map-line-point tom-world-map-line-point--${pointStyle}`,
      html: `<span style="width:${size}px;height:${size}px;background:${color};opacity:${opacity};border:${outlineWidth}px solid ${outlineColor};"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  _applyLinePresentation(layer, line) {
    const element = layer?.getElement?.();
    if (!element) return;
    const shadowOpacity = Math.max(0, Math.min(1, Number(line?.shadowOpacity) || 0));
    const shadowBlur = Math.max(0, Math.min(48, Number(line?.shadowBlur) || 0));
    const shadowColor = normalizeHexColor(line?.shadowColor, "#000000");
    element.style.filter = shadowOpacity > 0 && shadowBlur > 0
      ? `drop-shadow(0 0 ${shadowBlur}px ${hexToRgba(shadowColor, shadowOpacity)})`
      : "";
  }

  _syncLeafletLines(worldMap = null) {
    this._leafletLineLayers.forEach((layer) => layer.remove());
    this._leafletLineLayers.clear();
    this._clearLinePointMarkers();
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!this._leafletMap || !globalThis.L || !targetMap) {
      this._syncDraftLineLayer(targetMap);
      return;
    }
    for (const line of targetMap.lines ?? []) {
      if (line.visible === false || (line.points?.length ?? 0) < 2) continue;
      const lineCategory = this._getPinTypeDefinition(line.category, targetMap).value;
      if (this._hiddenCategories.has(lineCategory)) continue;
      if (this._editingLineId && line.id === this._editingLineId) continue;
      const latlngs = this._buildLineLatLngs(line, targetMap);
      const outlineWidth = Math.max(0, Number(line.outlineWidth) || 0);
      const lineOpacity = Number.isFinite(Number(line.opacity)) ? Math.max(0, Math.min(1, Number(line.opacity))) : 0.95;
      const lineWidth = Number(line.width) || 3;
      const dashArray = getLineDashArray(line.lineStyle, lineWidth);
      if (outlineWidth > 0) {
        const outline = globalThis.L.polyline(latlngs, {
          color: normalizeHexColor(line.outlineColor, "#101722"),
          weight: lineWidth + (outlineWidth * 2),
          opacity: lineOpacity,
          lineCap: String(line.lineCap || "round").trim().toLowerCase(),
          lineJoin: "round",
          dashArray,
          interactive: false
        }).addTo(this._leafletMap);
        this._leafletLineLayers.set(`${line.id}:outline`, outline);
      }
      const polyline = globalThis.L.polyline(latlngs, {
        color: line.color,
        weight: lineWidth,
        opacity: lineOpacity,
        lineCap: String(line.lineCap || "round").trim().toLowerCase(),
        lineJoin: "round",
        dashArray
      }).addTo(this._leafletMap);
      polyline.on("add", () => this._applyLinePresentation(polyline, line));
      this._applyLinePresentation(polyline, line);
      polyline.bindTooltip(`<div class="tom-world-map__tooltip-content"><div class="tom-world-map__tooltip-heading">${escapeHtml(line.name || tr("Line"))}</div>${line.documentName ? `<div class="tom-world-map__tooltip-info">${tr("Linked document")}: ${escapeHtml(line.documentName)}</div>` : ""}</div>`, {
        direction: "center",
        sticky: true,
        className: "tom-world-map__tooltip",
        opacity: 0.96
      });
      polyline.on("dblclick", async (event) => {
        if (polyline._tomOpenDocumentTimer) {
          window.clearTimeout(polyline._tomOpenDocumentTimer);
          polyline._tomOpenDocumentTimer = null;
        }
        globalThis.L.DomEvent.stop(event);
        await this._editLine(line);
      });
      polyline.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        this._openElementContextMenu(event, "line", line.id);
      });
      if (line.documentUuid) {
        polyline.on("click", (event) => {
          globalThis.L.DomEvent.stop(event);
          if (polyline._tomOpenDocumentTimer) window.clearTimeout(polyline._tomOpenDocumentTimer);
          polyline._tomOpenDocumentTimer = window.setTimeout(async () => {
            polyline._tomOpenDocumentTimer = null;
            await this._openLinkedMapDocument(line);
          }, 220);
        });
      }
      this._leafletLineLayers.set(line.id, polyline);

      const pointIcon = this._createLinePointIcon(line);
      if (pointIcon) {
        for (const latlng of latlngs) {
          const marker = globalThis.L.marker(latlng, {
            icon: pointIcon,
            keyboard: false,
            interactive: false,
            zIndexOffset: 520
          }).addTo(this._leafletMap);
          this._leafletLinePointMarkers.push(marker);
        }
      }
    }
    this._syncDraftLineLayer(targetMap);
    this._syncLineVertexMarkers(targetMap);
    this._syncRegionVertexMarkers(targetMap);
  }

  _syncLineVertexMarkers(worldMap = null) {
    this._clearLineVertexMarkers();
    if (!this._leafletMap || !globalThis.L || (!this._editingLineId && !this._isLineDrawMode) || !game.user?.isGM) return;
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;
    const style = this._editingLineStyle ?? {};
    const pointStyle = String(style.pointStyle || "none").trim().toLowerCase();
    const pointSize = pointStyle === "none" ? 12 : Math.max(2, Math.min(32, Number(style.pointSize) || 7));
    const pointColor = pointStyle === "none" ? "#7ebaec" : normalizeHexColor(style.pointColor, style.color || "#d7e8ff");
    const pointOpacity = pointStyle === "none"
      ? 1
      : (Number.isFinite(Number(style.pointOpacity)) ? Math.max(0, Math.min(1, Number(style.pointOpacity))) : 0.95);
    const pointOutlineWidth = pointStyle === "none" ? 2 : Math.max(0, Math.min(12, Number(style.pointOutlineWidth) || 0));
    const pointOutlineColor = pointStyle === "none" ? "#d7f0ff" : normalizeHexColor(style.pointOutlineColor, "#101722");
    const pointRadiusClass = pointStyle === "square" ? "tom-world-map-region-vertex__dot--square" : "";
    const iconSize = Math.max(14, pointSize);

    this._pendingLinePoints.forEach((point, index) => {
      const marker = globalThis.L.marker(this._mapPixelsToLatLng(point.x, point.y, targetMap), {
        icon: globalThis.L.divIcon({
          className: "tom-world-map-region-vertex tom-world-map-line-vertex",
          html: `<span class="tom-world-map-region-vertex__dot ${pointRadiusClass}" style="width:${pointSize}px;height:${pointSize}px;background:${pointColor};opacity:${pointOpacity};border:${pointOutlineWidth}px solid ${pointOutlineColor};"></span>`,
          iconSize: [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2]
        }),
        draggable: true,
        keyboard: false,
        pane: "tom-world-map-edit-pane",
        zIndexOffset: 1400
      });
      marker.on("drag", (event) => {
        const latlng = event.target?.getLatLng?.();
        if (!latlng) return;
        const snappedLatLng = this._lineSnapEnabled
          ? this._getSnappedLatLng(latlng, targetMap, { excludeLineId: this._editingLineId })
          : latlng;
        if (this._lineSnapEnabled && snappedLatLng) marker.setLatLng(snappedLatLng);
        this._pendingLinePoints[index] = this._latLngToMapPixels(snappedLatLng, targetMap);
        this._syncDraftLineLayer(targetMap);
      });
      marker.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        const minimumPoints = this._editingLineId ? 2 : 1;
        if (this._pendingLinePoints.length <= minimumPoints) return;
        this._pendingLinePoints.splice(index, 1);
        this._syncDraftLineLayer(targetMap);
        this._syncLineVertexMarkers(targetMap);
        this.render(false);
      });
      marker.addTo(this._leafletMap);
      this._leafletLineVertexMarkers.push(marker);
    });
  }

  _syncLeafletPins() {
    if (!this._leafletMap || !globalThis.L) return;
    this._leafletMarkers.forEach((marker) => marker.remove());
    this._leafletMarkers.clear();
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!worldMap || !this._arePinsVisible) return;

    for (const pin of worldMap.pins ?? []) {
      const pinType = String(pin?.type || "location").trim().toLowerCase();
      if (this._hiddenCategories.has(pinType)) continue;
      const canDragPins = this._canCurrentUserMoveCategorizedElement(pin, "pins", pinType, worldMap);
      const marker = globalThis.L.marker(this._mapPixelsToLatLng(pin.x, pin.y, worldMap), {
        icon: this._createMarkerIcon(pin),
        draggable: canDragPins,
        keyboard: true
      });
      marker.bindTooltip(this._buildPinTooltipContent(pin), {
        direction: "top",
        className: "tom-world-map__tooltip",
        opacity: 0.98
      });
      marker.on("click", () => {
        this._selectedPinId = pin.id;
        if (Date.now() < Number(marker._tomSkipClickUntil || 0)) return;
        if (pin.documentUuid) {
          if (marker._tomOpenDocumentTimer) window.clearTimeout(marker._tomOpenDocumentTimer);
          marker._tomOpenDocumentTimer = window.setTimeout(async () => {
            marker._tomOpenDocumentTimer = null;
            await this._openPinDocument(pin);
          }, 220);
        }
      });
      marker.on("dblclick", async (event) => {
        if (marker._tomOpenDocumentTimer) {
          window.clearTimeout(marker._tomOpenDocumentTimer);
          marker._tomOpenDocumentTimer = null;
        }
        event?.originalEvent?.preventDefault?.();
        event?.originalEvent?.stopPropagation?.();
        globalThis.L.DomEvent.stopPropagation(event);
        globalThis.L.DomEvent.stop(event?.originalEvent ?? event);
        await this._editPin(pin);
      });
      marker.on("contextmenu", (event) => {
        globalThis.L.DomEvent.stop(event);
        this._openElementContextMenu(event, "pin", pin.id);
      });
      if (canDragPins) {
        marker.on("dragstart", () => {
          marker._tomSkipClickUntil = Date.now() + 300;
        });
        marker.on("dragend", async (event) => {
          const latlng = event.target?.getLatLng?.();
          if (!latlng) return;
          const point = this._latLngToMapPixels(latlng, worldMap);
          marker._tomSkipClickUntil = Date.now() + 300;
          const updatedPin = await this._persistMapElementMove("pin", worldMap.id, pin.id, point);
          if (!updatedPin) return;
          marker.setIcon(this._createMarkerIcon(updatedPin));
          marker.bindTooltip(this._buildPinTooltipContent(updatedPin), {
            direction: "top",
            className: "tom-world-map__tooltip",
            opacity: 0.98
          });
        });
      }
      marker.addTo(this._leafletMap);
      this._leafletMarkers.set(pin.id, marker);
    }
  }

  async _createPinFromLatLng(latlng) {
    if (!game.user?.isGM) return;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!worldMap || !latlng) return;
    const fallbackLabel = tr("Pin {index}", { index: (worldMap.pins?.length ?? 0) + 1 });
    const pinData = await this._promptForPinData({
      label: fallbackLabel,
      note: "",
      type: this._getPinTypeDefinition(null, worldMap).value,
      color: "#7ebaec",
      size: 1,
      borderColor: "#101722",
      borderWidth: 0,
      shadowColor: "#000000",
      shadowDistance: 2,
      shadowOpacity: 0.55,
      shadowBlur: 4,
      movableForPlayers: false
    });
    if (!pinData) return;
    const point = this._latLngToMapPixels(latlng, worldMap);
    const pin = await TheatreStore.upsertWorldMapPin(worldMap.id, {
      id: randomId(),
      label: String(pinData.label || "").trim() || fallbackLabel,
      note: String(pinData.note || "").trim(),
      type: pinData.type,
      color: pinData.color,
      size: pinData.size,
      borderColor: pinData.borderColor,
      borderWidth: pinData.borderWidth,
      shadowColor: pinData.shadowColor,
      shadowDistance: pinData.shadowDistance,
      shadowOpacity: pinData.shadowOpacity,
      shadowBlur: pinData.shadowBlur,
      documentUuid: pinData.documentUuid,
      documentType: pinData.documentType,
      documentName: pinData.documentName,
      movableForPlayers: pinData.movableForPlayers,
      x: point.x,
      y: point.y
    });
    this._selectedPinId = pin?.id ?? null;
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  _getLinkedDocumentFallbackText() {
    return tr("Drag a journal or token here");
  }

  _getLinkedDocumentHelpText() {
    return tr("Clicking this map element opens the linked journal or token.");
  }

  _isSupportedLinkedWorldMapDocument(document) {
    const documentName = String(document?.documentName || "").trim();
    return ["JournalEntry", "JournalEntryPage", "Token", "TokenDocument", "Actor"].includes(documentName);
  }

  _buildLinkedDocumentDropMarkup(prefix, initialData = {}) {
    const safePrefix = String(prefix || "linked").trim();
    const documentName = escapeHtml(String(initialData.documentName || "").trim());
    const documentType = escapeHtml(String(initialData.documentType || "").trim());
    return `
      <section class="tom-world-map-config__styling-subcard tom-theme-card tom-world-map-linked-document">
        <h4>${tr("Linked document")}</h4>
        <div class="tom-world-map-object-overlay-dialog__journal-drop tom-world-map-linked-document__drop" data-linked-document-drop="${escapeHtml(safePrefix)}" tabindex="0">
          <div class="tom-world-map-object-overlay-dialog__journal-title" data-linked-document-name="${escapeHtml(safePrefix)}">${documentName || this._getLinkedDocumentFallbackText()}</div>
          <div class="tom-world-map-object-overlay-dialog__journal-meta" data-linked-document-type="${escapeHtml(safePrefix)}">${documentType || this._getLinkedDocumentHelpText()}</div>
        </div>
        <input type="hidden" name="${escapeHtml(safePrefix)}DocumentUuid" value="${escapeHtml(String(initialData.documentUuid || ""))}" />
        <input type="hidden" name="${escapeHtml(safePrefix)}DocumentType" value="${escapeHtml(String(initialData.documentType || ""))}" />
        <input type="hidden" name="${escapeHtml(safePrefix)}DocumentName" value="${escapeHtml(String(initialData.documentName || ""))}" />
        <div class="tom-world-map-object-overlay-dialog__journal-actions">
          <button type="button" class="tom-button tom-button-ghost tom-button-compact" data-action="clear-linked-document" data-linked-document-prefix="${escapeHtml(safePrefix)}">${tr("Clear link")}</button>
        </div>
      </section>
    `;
  }

  _readLinkedDocumentDataFromDialog(html, prefix) {
    const safePrefix = String(prefix || "linked").trim();
    return {
      documentUuid: String(html?.find?.(`[name='${safePrefix}DocumentUuid']`).val?.() || "").trim(),
      documentType: String(html?.find?.(`[name='${safePrefix}DocumentType']`).val?.() || "").trim(),
      documentName: String(html?.find?.(`[name='${safePrefix}DocumentName']`).val?.() || "").trim()
    };
  }

  async _resolveDroppedLinkedWorldMapDocument(event) {
    const nativeEvent = event?.originalEvent ?? event;
    const itemCount = nativeEvent?.dataTransfer?.items?.length ?? 0;
    if (itemCount > 1) {
      ui.notifications?.info(tr("Only one journal or token can be linked."));
      return null;
    }
    const document = await this._resolveDroppedWorldMapDocument(event);
    if (!document) return null;
    if (!this._isSupportedLinkedWorldMapDocument(document)) {
      ui.notifications?.warn(tr("Drop a journal entry, journal page, token, or actor."));
      return null;
    }
    return document;
  }

  _activateLinkedDocumentDrop(root, prefix) {
    const safePrefix = String(prefix || "linked").trim();
    const drop = root?.querySelector?.(`[data-linked-document-drop='${safePrefix}']`);
    const nameField = root?.querySelector?.(`[name='${safePrefix}DocumentName']`);
    const typeField = root?.querySelector?.(`[name='${safePrefix}DocumentType']`);
    const uuidField = root?.querySelector?.(`[name='${safePrefix}DocumentUuid']`);
    const nameText = root?.querySelector?.(`[data-linked-document-name='${safePrefix}']`);
    const typeText = root?.querySelector?.(`[data-linked-document-type='${safePrefix}']`);
    const updatePreview = () => {
      const name = String(nameField?.value || "").trim();
      const type = String(typeField?.value || "").trim();
      if (nameText instanceof HTMLElement) nameText.textContent = name || this._getLinkedDocumentFallbackText();
      if (typeText instanceof HTMLElement) typeText.textContent = type || this._getLinkedDocumentHelpText();
    };
    const applyDocument = (document) => {
      if (!document || !(uuidField instanceof HTMLInputElement) || !(typeField instanceof HTMLInputElement) || !(nameField instanceof HTMLInputElement)) return;
      uuidField.value = String(document.uuid || "").trim();
      typeField.value = String(document.documentName || "").trim();
      nameField.value = String(document.name || "").trim();
      updatePreview();
    };
    drop?.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("is-drop-target");
    });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-drop-target"));
    drop?.addEventListener("drop", async (event) => {
      event.preventDefault();
      drop.classList.remove("is-drop-target");
      const document = await this._resolveDroppedLinkedWorldMapDocument(event);
      applyDocument(document);
    });
    root?.querySelector?.(`[data-action='clear-linked-document'][data-linked-document-prefix='${safePrefix}']`)?.addEventListener("click", (event) => {
      event.preventDefault();
      if (uuidField instanceof HTMLInputElement) uuidField.value = "";
      if (typeField instanceof HTMLInputElement) typeField.value = "";
      if (nameField instanceof HTMLInputElement) nameField.value = "";
      updatePreview();
    });
    updatePreview();
  }

  async _promptForObjectOverlayData(initialData = {}, { isEditing = false, forcedType = null } = {}) {
    const type = forcedType || initialData.type || "image";
    const isImage = type === "image";
    const title = tr(isEditing ? "Edit object overlay" : (isImage ? "Create image overlay" : "Create text overlay"));
    const categoryOptions = this._getObjectCategoryOptions();
    const selectedFontFamily = String(initialData.fontFamily || "").trim();
    const fontOptionsMarkup = this._getFontTypeOptions(selectedFontFamily)
      .map((entry) => `<option value="${escapeHtml(entry.value)}" ${entry.value === selectedFontFamily ? "selected" : ""}>${escapeHtml(entry.label)}</option>`)
      .join("");
    const fallbackCategory = categoryOptions[0]?.id || "general";
    const categorySelectOptions = categoryOptions
      .map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === String(initialData.category || fallbackCategory).trim().toLowerCase() ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("");
    const selectedOutlineMode = ["outer", "center"].includes(String(initialData.outlineMode || "").trim().toLowerCase())
      ? String(initialData.outlineMode).trim().toLowerCase()
      : "outer";
    const initialLineHeight = Number.isFinite(Number(initialData.lineHeight)) ? Number(initialData.lineHeight) : 0.95;
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title,
        content: `
          <div class="tom-theme-root tom-world-map-config__dialog tom-world-map-object-overlay-dialog">
            ${!isImage ? `
            <section class="tom-world-map-object-overlay-dialog__preview tom-theme-card">
              <div class="tom-world-map-object-overlay-dialog__preview-stage">
                <div class="tom-world-map-object-overlay-dialog__preview-text" data-overlay-text-preview="true">${escapeHtml(String(initialData.text || initialData.name || tr("Text object")))}</div>
              </div>
            </section>
            ` : ""}
            <div class="tom-world-map-object-overlay-dialog__grid tom-world-map-object-overlay-dialog__grid--double">
              <div class="form-group">
                <label>${tr("Name")}</label>
                <input type="text" name="overlayName" value="${escapeHtml(String(initialData.name || ""))}" autofocus />
              </div>
              <div class="form-group">
                <label>${tr("Category")}</label>
                <select name="overlayCategory">${categorySelectOptions}</select>
              </div>
            </div>
            ${isImage ? `
            <div class="form-group">
              <label>${tr("Image path")}</label>
              <div class="tom-input-with-button">
                <input type="text" name="overlayImagePath" value="${escapeHtml(String(initialData.imagePath || ""))}" />
                <button type="button" class="tom-button tom-button-ghost tom-button-compact" data-action="pick-image-object" data-target="[name='overlayImagePath']">${tr("Choose file")}</button>
              </div>
            </div>
            <div class="form-group">
              <label>${tr("Display width")}</label>
              <input type="number" name="overlayWidth" min="16" max="4096" step="1" value="${Number(initialData.width) || 160}" />
            </div>
            ${this._buildLinkedDocumentDropMarkup("overlay", initialData)}
            ` : `
            <div class="form-group">
              <label>${tr("Text")}</label>
              <textarea name="overlayText" rows="4">${escapeHtml(String(initialData.text || ""))}</textarea>
            </div>
            <div class="tom-world-map-config__styling-grid tom-world-map-config__styling-grid--double">
              <section class="tom-world-map-config__styling-subcard tom-theme-card">
                <h4>${tr("General")}</h4>
                <div class="tom-world-map-object-overlay-dialog__grid tom-world-map-object-overlay-dialog__grid--general">
                  <div class="form-group tom-world-map-object-overlay-dialog__span-2">
                    <label>${tr("Font Type")}</label>
                    <select name="overlayFontFamily">${fontOptionsMarkup}</select>
                  </div>
                  <div class="form-group">
                    <label>${tr("Font size")}</label>
                    <input type="number" name="overlayFontSize" min="8" max="256" step="1" value="${Number(initialData.fontSize) || 24}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Text color")}</label>
                    <input type="color" name="overlayColor" value="${normalizeHexColor(initialData.color, "#f2f5f8")}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Line height")}</label>
                    <input type="number" name="overlayLineHeight" min="0.6" max="2.4" step="0.05" value="${initialLineHeight}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Opacity")}</label>
                    <input type="number" name="overlayOpacity" min="0" max="1" step="0.05" value="${Number.isFinite(Number(initialData.opacity)) ? Number(initialData.opacity) : 1}" />
                  </div>
                </div>
              </section>
              ${this._buildLinkedDocumentDropMarkup("overlay", initialData)}
              <section class="tom-world-map-config__styling-subcard tom-theme-card">
                <h4>${tr("Font border")}</h4>
                <div class="tom-world-map-object-overlay-dialog__grid tom-world-map-object-overlay-dialog__grid--border">
                  <div class="form-group">
                    <label>${tr("Border color")}</label>
                    <input type="color" name="overlayOutlineColor" value="${normalizeHexColor(initialData.outlineColor, "#101722")}" />
                  </div>
                  <div class="form-group tom-world-map-object-overlay-dialog__field--compact">
                    <label>${tr("Thickness")}</label>
                    <input type="number" name="overlayOutlineWidth" min="0" max="12" step="0.5" value="${Number(initialData.outlineWidth) || 0}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Border mode")}</label>
                    <select name="overlayOutlineMode">
                      <option value="outer" ${selectedOutlineMode === "outer" ? "selected" : ""}>${tr("Outer")}</option>
                      <option value="center" ${selectedOutlineMode === "center" ? "selected" : ""}>${tr("Center")}</option>
                    </select>
                  </div>
                </div>
              </section>
              <section class="tom-world-map-config__styling-subcard tom-theme-card">
                <h4>${tr("Font shadow")}</h4>
                <div class="tom-world-map-object-overlay-dialog__grid tom-world-map-object-overlay-dialog__grid--double-compact">
                  <div class="form-group">
                    <label>${tr("Shadow color")}</label>
                    <input type="color" name="overlayShadowColor" value="${normalizeHexColor(initialData.shadowColor, "#000000")}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Shadow distance")}</label>
                    <input type="number" name="overlayShadowDistance" min="0" max="64" step="1" value="${Number(initialData.shadowDistance) || 2}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Shadow opacity")}</label>
                    <input type="number" name="overlayShadowOpacity" min="0" max="1" step="0.05" value="${Number.isFinite(Number(initialData.shadowOpacity)) ? Number(initialData.shadowOpacity) : 0.7}" />
                  </div>
                  <div class="form-group">
                    <label>${tr("Shadow blur")}</label>
                    <input type="number" name="overlayShadowBlur" min="0" max="64" step="1" value="${Number(initialData.shadowBlur) || 8}" />
                  </div>
                </div>
              </section>
            </div>
            `}
            <div class="tom-world-map-object-overlay-dialog__toggles">
              <label class="checkbox"><input type="checkbox" name="overlayScaleWithZoom" ${initialData.scaleWithZoom !== false ? "checked" : ""} /> <span>${tr("Scale with zoom")}</span></label>
              <label class="checkbox"><input type="checkbox" name="overlayMovableForPlayers" ${initialData.movableForPlayers ? "checked" : ""} /> <span>${tr("Movable for players")}</span></label>
            </div>
          </div>
        `,
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve({
              type,
              name: String(html?.find?.("[name='overlayName']").val?.() || "").trim(),
              category: String(html?.find?.("[name='overlayCategory']").val?.() || fallbackCategory).trim().toLowerCase() || fallbackCategory,
              imagePath: String(html?.find?.("[name='overlayImagePath']").val?.() || "").trim(),
              width: Number(html?.find?.("[name='overlayWidth']").val?.() || initialData.width || 160),
              text: String(html?.find?.("[name='overlayText']").val?.() || "").trim(),
              documentUuid: String(html?.find?.("[name='overlayDocumentUuid']").val?.() || "").trim(),
              documentType: String(html?.find?.("[name='overlayDocumentType']").val?.() || "").trim(),
              documentName: String(html?.find?.("[name='overlayDocumentName']").val?.() || "").trim(),
              fontSize: Number(html?.find?.("[name='overlayFontSize']").val?.() || initialData.fontSize || 24),
              lineHeight: Math.max(0.6, Math.min(2.4, Number(html?.find?.("[name='overlayLineHeight']").val?.() || initialData.lineHeight || 0.95))),
              fontFamily: String(html?.find?.("[name='overlayFontFamily']").val?.() || "").trim(),
              color: normalizeHexColor(String(html?.find?.("[name='overlayColor']").val?.() || "").trim(), "#f2f5f8"),
              outlineColor: normalizeHexColor(String(html?.find?.("[name='overlayOutlineColor']").val?.() || "").trim(), "#101722"),
              outlineMode: ["outer", "center"].includes(String(html?.find?.("[name='overlayOutlineMode']").val?.() || "").trim().toLowerCase())
                ? String(html?.find?.("[name='overlayOutlineMode']").val?.() || "").trim().toLowerCase()
                : "outer",
              outlineWidth: Math.max(0, Math.min(12, Number(html?.find?.("[name='overlayOutlineWidth']").val?.() || initialData.outlineWidth || 0))),
              shadowColor: normalizeHexColor(String(html?.find?.("[name='overlayShadowColor']").val?.() || "").trim(), "#000000"),
              shadowDistance: Math.max(0, Math.min(64, Number(html?.find?.("[name='overlayShadowDistance']").val?.() || initialData.shadowDistance || 2))),
              shadowOpacity: Math.max(0, Math.min(1, Number(html?.find?.("[name='overlayShadowOpacity']").val?.() || initialData.shadowOpacity || 0.7))),
              shadowBlur: Math.max(0, Math.min(64, Number(html?.find?.("[name='overlayShadowBlur']").val?.() || initialData.shadowBlur || 8))),
              opacity: Math.max(0, Math.min(1, Number(html?.find?.("[name='overlayOpacity']").val?.() || initialData.opacity || 1))),
              scaleWithZoom: Boolean(html?.find?.("[name='overlayScaleWithZoom']").prop?.("checked")),
              movableForPlayers: Boolean(html?.find?.("[name='overlayMovableForPlayers']").prop?.("checked"))
            })
          },
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        default: "create",
        close: () => resolve(null)
      }, {
        width: isImage ? 700 : 920,
        resizable: true
      });
      dialog.options.resizable = true;
      dialog.options.width = isImage ? 700 : 920;
      dialog.render(true);
      window.setTimeout(() => {
        applyTheatreDialogTheme(dialog, MODULE_ID, isImage ? "44rem" : "58rem");
        const root = dialog.element?.[0];
        if (root) {
          root.classList.add("tom-world-map-object-overlay-host");
          const themeState = TheatreStore.getThemeState();
          applyThemeInlineStyleToHost(root, themeState);
          root.querySelectorAll?.(".tom-theme-root").forEach((element) => applyThemeInlineStyleToHost(element, themeState));
        }
        if (typeof dialog.setPosition === "function") {
          dialog.setPosition({
            width: isImage ? 700 : 920
          });
        }
        const resizeHandle = root?.querySelector?.(".window-resizable-handle");
        if (root instanceof HTMLElement && resizeHandle instanceof HTMLElement && !resizeHandle.dataset.tomManualResizeBound) {
          resizeHandle.dataset.tomManualResizeBound = "true";
          resizeHandle.style.pointerEvents = "auto";
          resizeHandle.style.cursor = "nwse-resize";
          const minimumWidth = isImage ? 420 : 560;
          const minimumHeight = isImage ? 240 : 300;
          let startX = 0;
          let startY = 0;
          let startWidth = 0;
          let startHeight = 0;
          let startLeft = 0;
          let startTop = 0;
          const onMouseMove = (event) => {
            event.preventDefault();
            const nextWidth = Math.max(minimumWidth, startWidth + (event.clientX - startX));
            const nextHeight = Math.max(minimumHeight, startHeight + (event.clientY - startY));
            dialog.setPosition({
              left: startLeft,
              top: startTop,
              width: nextWidth,
              height: nextHeight
            });
          };
          const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          };
          resizeHandle.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = root.getBoundingClientRect();
            startX = event.clientX;
            startY = event.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = Number(dialog.position?.left ?? rect.left);
            startTop = Number(dialog.position?.top ?? rect.top);
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
          });
        }
        root?.querySelector?.("[data-action='pick-image-object']")?.addEventListener("click", (event) => {
          event.preventDefault();
          const targetSelector = event.currentTarget?.dataset?.target;
          openImagePickerForInput(root, targetSelector, "image");
        });
        this._activateLinkedDocumentDrop(root, "overlay");
        const preview = root?.querySelector?.("[data-overlay-text-preview='true']");
        const updateTextPreview = () => {
          if (!(preview instanceof HTMLElement)) return;
          const text = String(root?.querySelector?.("[name='overlayText']")?.value || root?.querySelector?.("[name='overlayName']")?.value || tr("Text object")).trim() || tr("Text object");
          const fontSize = Number(root?.querySelector?.("[name='overlayFontSize']")?.value || initialData.fontSize || 24);
          const fontFamily = String(root?.querySelector?.("[name='overlayFontFamily']")?.value || "").trim();
          const color = normalizeHexColor(String(root?.querySelector?.("[name='overlayColor']")?.value || "").trim(), "#f2f5f8");
          const outlineColor = normalizeHexColor(String(root?.querySelector?.("[name='overlayOutlineColor']")?.value || "").trim(), "#101722");
          const outlineMode = ["outer", "center"].includes(String(root?.querySelector?.("[name='overlayOutlineMode']")?.value || "").trim().toLowerCase())
            ? String(root?.querySelector?.("[name='overlayOutlineMode']")?.value || "").trim().toLowerCase()
            : "outer";
          const outlineWidth = Math.max(0, Math.min(12, Number(root?.querySelector?.("[name='overlayOutlineWidth']")?.value || initialData.outlineWidth || 0)));
          const shadowColor = normalizeHexColor(String(root?.querySelector?.("[name='overlayShadowColor']")?.value || "").trim(), "#000000");
          const shadowDistance = Math.max(0, Math.min(64, Number(root?.querySelector?.("[name='overlayShadowDistance']")?.value || initialData.shadowDistance || 2)));
          const shadowOpacity = Math.max(0, Math.min(1, Number(root?.querySelector?.("[name='overlayShadowOpacity']")?.value || initialData.shadowOpacity || 0.7)));
          const shadowBlur = Math.max(0, Math.min(64, Number(root?.querySelector?.("[name='overlayShadowBlur']")?.value || initialData.shadowBlur || 8)));
          const lineHeight = Math.max(0.6, Math.min(2.4, Number(root?.querySelector?.("[name='overlayLineHeight']")?.value || initialData.lineHeight || 0.95)));
          const textStyle = buildTextPresentationStyle({
            fontSize,
            lineHeight,
            fontFamily,
            color,
            outlineColor,
            outlineMode,
            outlineWidth,
            shadowColor,
            shadowDistance,
            shadowOpacity,
            shadowBlur
          });
          preview.textContent = text;
          preview.style.fontSize = `${textStyle.fontSizePx.toFixed(2)}px`;
          preview.style.lineHeight = `${textStyle.lineHeight}`;
          preview.style.color = textStyle.color;
          preview.style.fontFamily = fontFamily;
          preview.style.webkitTextStroke = textStyle.webkitTextStroke;
          preview.style.paintOrder = textStyle.webkitTextStroke ? "stroke fill" : "";
          preview.style.textShadow = textStyle.textShadow;
        };
        root?.querySelectorAll?.("[name^='overlay']").forEach((field) => {
          field.addEventListener("input", updateTextPreview);
          field.addEventListener("change", updateTextPreview);
        });
        updateTextPreview();
      }, 30);
    });
  }

  _readRegionDataFromDialog(html, fallbackCategory = "general") {
    const readNumber = (selector, fallback) => {
      const value = Number(html?.find?.(selector).val?.());
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      name: String(html?.find?.("[name='regionName']").val?.() || "").trim() || tr("Region"),
      category: String(html?.find?.("[name='regionCategory']").val?.() || fallbackCategory).trim().toLowerCase() || fallbackCategory,
      fillColor: normalizeHexColor(String(html?.find?.("[name='regionFillColor']").val?.() || "").trim(), "#7ebaec"),
      strokeColor: normalizeHexColor(String(html?.find?.("[name='regionStrokeColor']").val?.() || "").trim(), "#d7e8ff"),
      fillOpacity: Math.max(0, Math.min(1, readNumber("[name='regionFillOpacity']", 0.28))),
      strokeOpacity: Math.max(0, Math.min(1, readNumber("[name='regionStrokeOpacity']", 0.95))),
      strokeWidth: Math.max(1, Math.min(12, readNumber("[name='regionStrokeWidth']", 2))),
      fillStyle: String(html?.find?.("[name='regionFillStyle']").val?.() || "solid").trim().toLowerCase(),
      fillPatternScale: Math.max(4, Math.min(64, readNumber("[name='regionFillPatternScale']", 14))),
      fillPatternSize: Math.max(1, Math.min(24, readNumber("[name='regionFillPatternSize']", 2))),
      strokeStyle: String(html?.find?.("[name='regionStrokeStyle']").val?.() || "solid").trim().toLowerCase(),
      ...this._readLinkedDocumentDataFromDialog(html, "region")
    };
  }

  async _promptForRegionData(initialData = {}, { isEditing = false, onLiveChange = null } = {}) {
    const regionCategoryOptions = this._getRegionCategoryOptions();
    const fallbackCategory = regionCategoryOptions[0]?.id || "general";
    const selectedCategory = String(initialData.category || fallbackCategory).trim().toLowerCase() || fallbackCategory;
    const regionCategoryOptionsMarkup = regionCategoryOptions.map((entry) => `
      <option value="${escapeHtml(entry.id)}" ${entry.id === selectedCategory ? "selected" : ""}>${escapeHtml(entry.label)}</option>
    `).join("");
    const selectedFillStyle = String(initialData.fillStyle || "solid").trim().toLowerCase();
    const selectedStrokeStyle = String(initialData.strokeStyle || "solid").trim().toLowerCase();
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit region" : "Create region"),
        content: `
          <div class="tom-theme-root tom-world-map-shape-dialog tom-world-map-shape-dialog--region">
            <section class="tom-world-map-shape-dialog__card tom-world-map-shape-dialog__card--wide">
              <h3>${tr("Region")}</h3>
              <div class="tom-world-map-shape-dialog__grid tom-world-map-shape-dialog__grid--two">
                <div class="form-group">
                  <label>${tr("Name")}</label>
                  <input type="text" name="regionName" value="${escapeHtml(String(initialData.name || ""))}" autofocus />
                </div>
                <div class="form-group">
                  <label>${tr("Category")}</label>
                  <select name="regionCategory">${regionCategoryOptionsMarkup}</select>
                </div>
              </div>
            </section>
            <section class="tom-world-map-shape-dialog__card">
              <h3>${tr("Fill")}</h3>
              <div class="tom-world-map-shape-dialog__grid">
                <div class="form-group">
                  <label>${tr("Color")}</label>
                  <input type="color" name="regionFillColor" value="${normalizeHexColor(initialData.fillColor, "#7ebaec")}" />
                </div>
                <div class="form-group">
                  <label>${tr("Opacity")}</label>
                  <input type="number" min="0" max="1" step="0.05" name="regionFillOpacity" value="${Number.isFinite(Number(initialData.fillOpacity)) ? Number(initialData.fillOpacity) : 0.28}" />
                </div>
                <div class="form-group">
                  <label>${tr("Style")}</label>
                  <select name="regionFillStyle">
                    <option value="solid" ${selectedFillStyle === "solid" ? "selected" : ""}>${tr("Solid")}</option>
                    <option value="hatch" ${selectedFillStyle === "hatch" ? "selected" : ""}>${tr("Hatch")}</option>
                    <option value="crosshatch" ${selectedFillStyle === "crosshatch" ? "selected" : ""}>${tr("Crosshatch")}</option>
                    <option value="dots" ${selectedFillStyle === "dots" ? "selected" : ""}>${tr("Dots")}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>${tr("Spacing")}</label>
                  <input type="number" min="4" max="64" step="1" name="regionFillPatternScale" value="${Number(initialData.fillPatternScale) || 14}" />
                </div>
                <div class="form-group">
                  <label>${tr("Size")}</label>
                  <input type="number" min="1" max="24" step="1" name="regionFillPatternSize" value="${Number(initialData.fillPatternSize) || 2}" />
                </div>
              </div>
            </section>
            <section class="tom-world-map-shape-dialog__card">
              <h3>${tr("Border")}</h3>
              <div class="tom-world-map-shape-dialog__grid">
                <div class="form-group">
                  <label>${tr("Color")}</label>
                  <input type="color" name="regionStrokeColor" value="${normalizeHexColor(initialData.strokeColor, "#d7e8ff")}" />
                </div>
                <div class="form-group">
                  <label>${tr("Opacity")}</label>
                  <input type="number" min="0" max="1" step="0.05" name="regionStrokeOpacity" value="${Number.isFinite(Number(initialData.strokeOpacity)) ? Number(initialData.strokeOpacity) : 0.95}" />
                </div>
                <div class="form-group">
                  <label>${tr("Thickness")}</label>
                  <input type="number" min="1" max="12" step="1" name="regionStrokeWidth" value="${Number(initialData.strokeWidth) || 2}" />
                </div>
                <div class="form-group">
                  <label>${tr("Style")}</label>
                  <select name="regionStrokeStyle">
                    <option value="solid" ${selectedStrokeStyle === "solid" ? "selected" : ""}>${tr("Solid")}</option>
                    <option value="dashed" ${selectedStrokeStyle === "dashed" ? "selected" : ""}>${tr("Dashed")}</option>
                    <option value="dotted" ${selectedStrokeStyle === "dotted" ? "selected" : ""}>${tr("Dotted")}</option>
                    <option value="dashdot" ${selectedStrokeStyle === "dashdot" ? "selected" : ""}>${tr("Dash dot")}</option>
                  </select>
                </div>
              </div>
            </section>
            ${this._buildLinkedDocumentDropMarkup("region", initialData)}
          </div>
        `,
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve(this._readRegionDataFromDialog(html, fallbackCategory))
          },
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        default: "create",
        close: () => resolve(null)
      }, { width: 630, resizable: true });
      dialog.options.width = 630;
      dialog.position.width = 630;
      dialog.render(true);
      window.setTimeout(() => {
        applyTheatreDialogTheme(dialog, MODULE_ID, "630px");
        const root = dialog.element?.[0];
        if (!root) return;
        root.classList.add("tom-world-map-shape-dialog-host", "tom-world-map-region-dialog-host");
        const themeState = TheatreStore.getThemeState();
        applyThemeInlineStyleToHost(root, themeState);
        root.querySelectorAll?.(".tom-theme-root").forEach((element) => applyThemeInlineStyleToHost(element, themeState));
        if (typeof dialog.setPosition === "function") {
          dialog.setPosition({ width: 630 });
        }
        this._activateLinkedDocumentDrop(root, "region");
        if (typeof onLiveChange === "function") {
          const updateLiveRegion = () => onLiveChange(this._readRegionDataFromDialog(dialog.element, fallbackCategory));
          root.querySelectorAll?.("[name^='region']").forEach((field) => {
            field.addEventListener("input", updateLiveRegion);
            field.addEventListener("change", updateLiveRegion);
          });
          updateLiveRegion();
        }
      }, 30);
    });
  }

  _readLineDataFromDialog(html, fallbackCategory = "location") {
    const readNumber = (selector, fallback) => {
      const value = Number(html?.find?.(selector).val?.());
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      name: String(html?.find?.("[name='lineName']").val?.() || "").trim() || tr("Line"),
      category: String(html?.find?.("[name='lineCategory']").val?.() || fallbackCategory).trim().toLowerCase() || fallbackCategory,
      color: normalizeHexColor(String(html?.find?.("[name='lineColor']").val?.() || "").trim(), "#d7e8ff"),
      opacity: Math.max(0, Math.min(1, readNumber("[name='lineOpacity']", 0.95))),
      width: Math.max(1, Math.min(32, readNumber("[name='lineWidth']", 3))),
      outlineColor: normalizeHexColor(String(html?.find?.("[name='lineOutlineColor']").val?.() || "").trim(), "#101722"),
      outlineWidth: Math.max(0, Math.min(32, readNumber("[name='lineOutlineWidth']", 0))),
      shadowColor: normalizeHexColor(String(html?.find?.("[name='lineShadowColor']").val?.() || "").trim(), "#000000"),
      shadowOpacity: Math.max(0, Math.min(1, readNumber("[name='lineShadowOpacity']", 0.35))),
      shadowBlur: Math.max(0, Math.min(48, readNumber("[name='lineShadowBlur']", 6))),
      lineStyle: String(html?.find?.("[name='lineStyle']").val?.() || "solid").trim().toLowerCase(),
      lineCap: String(html?.find?.("[name='lineCap']").val?.() || "round").trim().toLowerCase(),
      pointStyle: String(html?.find?.("[name='linePointStyle']").val?.() || "none").trim().toLowerCase(),
      pointSize: Math.max(2, Math.min(32, readNumber("[name='linePointSize']", 7))),
      pointColor: normalizeHexColor(String(html?.find?.("[name='linePointColor']").val?.() || "").trim(), "#d7e8ff"),
      pointOpacity: Math.max(0, Math.min(1, readNumber("[name='linePointOpacity']", 0.95))),
      pointOutlineColor: normalizeHexColor(String(html?.find?.("[name='linePointOutlineColor']").val?.() || "").trim(), "#101722"),
      pointOutlineWidth: Math.max(0, Math.min(12, readNumber("[name='linePointOutlineWidth']", 1))),
      movableForPlayers: Boolean(html?.find?.("[name='lineMovableForPlayers']").prop?.("checked")),
      ...this._readLinkedDocumentDataFromDialog(html, "line")
    };
  }

  async _promptForLineData(initialData = {}, { isEditing = false, onLiveChange = null } = {}) {
    const pointStyle = String(initialData.pointStyle || "none").trim().toLowerCase();
    const pinTypeDefinitions = Object.values(this._getPinTypeDefinitions());
    const fallbackCategory = this._getPinTypeDefinition(initialData.category).value;
    const categoryOptions = pinTypeDefinitions
      .map((definition) => `<option value="${escapeHtml(definition.value)}" ${definition.value === fallbackCategory ? "selected" : ""}>${escapeHtml(definition.label)}</option>`)
      .join("");
    const selectedLineStyle = String(initialData.lineStyle || "solid").trim().toLowerCase();
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit line" : "Create line"),
        content: `
          <div class="tom-theme-root tom-world-map-shape-dialog tom-world-map-shape-dialog--line tom-world-map-line-dialog">
            <section class="tom-world-map-shape-dialog__card tom-world-map-shape-dialog__card--wide">
              <h3>${tr("Line")}</h3>
              <div class="tom-world-map-shape-dialog__grid tom-world-map-shape-dialog__grid--two">
                <div class="form-group">
                  <label>${tr("Name")}</label>
                  <input type="text" name="lineName" value="${escapeHtml(String(initialData.name || tr("Line")))}" autofocus />
                </div>
                <div class="form-group">
                  <label>${tr("Category")}</label>
                  <select name="lineCategory">${categoryOptions}</select>
                </div>
              </div>
            </section>
            <section class="tom-world-map-shape-dialog__card tom-world-map-shape-dialog__card--line-style">
              <h3>${tr("Line style")}</h3>
              <div class="tom-world-map-shape-dialog__grid">
              <div class="form-group">
                <label>${tr("Color")}</label>
                <input type="color" name="lineColor" value="${normalizeHexColor(initialData.color, "#d7e8ff")}" />
              </div>
              <div class="form-group">
                <label>${tr("Opacity")}</label>
                <input type="number" min="0" max="1" step="0.05" name="lineOpacity" value="${Number.isFinite(Number(initialData.opacity)) ? Number(initialData.opacity) : 0.95}" />
              </div>
              <div class="form-group">
                <label>${tr("Thickness")}</label>
                <input type="number" min="1" max="32" step="1" name="lineWidth" value="${Number(initialData.width) || 3}" />
              </div>
              <div class="form-group">
                <label>${tr("Style")}</label>
                <select name="lineStyle">
                  <option value="solid" ${selectedLineStyle === "solid" ? "selected" : ""}>${tr("Solid")}</option>
                  <option value="dashed" ${selectedLineStyle === "dashed" ? "selected" : ""}>${tr("Dashed")}</option>
                  <option value="dotted" ${selectedLineStyle === "dotted" ? "selected" : ""}>${tr("Dotted")}</option>
                  <option value="dashdot" ${selectedLineStyle === "dashdot" ? "selected" : ""}>${tr("Dash dot")}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${tr("Border color")}</label>
                <input type="color" name="lineOutlineColor" value="${normalizeHexColor(initialData.outlineColor, "#101722")}" />
              </div>
              <div class="form-group">
                <label>${tr("Border thickness")}</label>
                <input type="number" min="0" max="32" step="1" name="lineOutlineWidth" value="${Number(initialData.outlineWidth) || 0}" />
              </div>
              <div class="form-group">
                <label>${tr("Line ends")}</label>
                <select name="lineCap">
                  <option value="round" ${String(initialData.lineCap || "round").trim().toLowerCase() === "round" ? "selected" : ""}>${tr("Rounded")}</option>
                  <option value="butt" ${String(initialData.lineCap || "").trim().toLowerCase() === "butt" ? "selected" : ""}>${tr("Flat")}</option>
                  <option value="square" ${String(initialData.lineCap || "").trim().toLowerCase() === "square" ? "selected" : ""}>${tr("Square")}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${tr("Shadow color")}</label>
                <input type="color" name="lineShadowColor" value="${normalizeHexColor(initialData.shadowColor, "#000000")}" />
              </div>
              <div class="form-group">
                <label>${tr("Shadow opacity")}</label>
                <input type="number" min="0" max="1" step="0.05" name="lineShadowOpacity" value="${Number.isFinite(Number(initialData.shadowOpacity)) ? Number(initialData.shadowOpacity) : 0.35}" />
              </div>
              <div class="form-group">
                <label>${tr("Shadow blur")}</label>
                <input type="number" min="0" max="48" step="1" name="lineShadowBlur" value="${Number.isFinite(Number(initialData.shadowBlur)) ? Number(initialData.shadowBlur) : 6}" />
              </div>
              </div>
            </section>
            <section class="tom-world-map-shape-dialog__card">
              <h3>${tr("Connection points")}</h3>
              <div class="tom-world-map-shape-dialog__grid">
              <div class="form-group">
                <label>${tr("Connection points")}</label>
                <select name="linePointStyle">
                  <option value="none" ${pointStyle === "none" ? "selected" : ""}>${tr("None")}</option>
                  <option value="circle" ${pointStyle === "circle" ? "selected" : ""}>${tr("Circle")}</option>
                  <option value="square" ${pointStyle === "square" ? "selected" : ""}>${tr("Square")}</option>
                </select>
              </div>
              <div class="form-group">
                <label>${tr("Point size")}</label>
                <input type="number" min="2" max="32" step="1" name="linePointSize" value="${Number(initialData.pointSize) || 7}" />
              </div>
              <div class="form-group">
                <label>${tr("Point color")}</label>
                <input type="color" name="linePointColor" value="${normalizeHexColor(initialData.pointColor, initialData.color || "#d7e8ff")}" />
              </div>
              <div class="form-group">
                <label>${tr("Point opacity")}</label>
                <input type="number" min="0" max="1" step="0.05" name="linePointOpacity" value="${Number.isFinite(Number(initialData.pointOpacity)) ? Number(initialData.pointOpacity) : 0.95}" />
              </div>
              <div class="form-group">
                <label>${tr("Border color")}</label>
                <input type="color" name="linePointOutlineColor" value="${normalizeHexColor(initialData.pointOutlineColor, "#101722")}" />
              </div>
              <div class="form-group">
                <label>${tr("Border thickness")}</label>
                <input type="number" min="0" max="12" step="1" name="linePointOutlineWidth" value="${Number.isFinite(Number(initialData.pointOutlineWidth)) ? Number(initialData.pointOutlineWidth) : 1}" />
              </div>
              </div>
            </section>
            ${this._buildLinkedDocumentDropMarkup("line", initialData)}
            <section class="tom-world-map-shape-dialog__card tom-world-map-shape-dialog__card--compact">
              <label class="checkbox"><input type="checkbox" name="lineMovableForPlayers" ${initialData.movableForPlayers ? "checked" : ""} /> <span>${tr("Movable for players")}</span></label>
            </section>
          </div>
        `,
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve(this._readLineDataFromDialog(html, fallbackCategory))
          },
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        default: "create",
        close: () => resolve(null)
      }, { width: 890, resizable: true });
      dialog.options.width = 890;
      dialog.position.width = 890;
      dialog.render(true);
      window.setTimeout(() => {
        applyTheatreDialogTheme(dialog, MODULE_ID, "890px");
        const root = dialog.element?.[0];
        if (!root) return;
        root.classList.add("tom-world-map-shape-dialog-host", "tom-world-map-line-dialog-host");
        const themeState = TheatreStore.getThemeState();
        applyThemeInlineStyleToHost(root, themeState);
        root.querySelectorAll?.(".tom-theme-root").forEach((element) => applyThemeInlineStyleToHost(element, themeState));
        if (typeof dialog.setPosition === "function") {
          dialog.setPosition({ width: 890 });
        }
        this._activateLinkedDocumentDrop(root, "line");
        if (typeof onLiveChange === "function") {
          const updateLiveLine = () => onLiveChange(this._readLineDataFromDialog(dialog.element, fallbackCategory));
          root.querySelectorAll?.("[name^='line']").forEach((field) => {
            field.addEventListener("input", updateLiveLine);
            field.addEventListener("change", updateLiveLine);
          });
          updateLiveLine();
        }
      }, 30);
    });
  }

  async _editRegion(region) {
    if (!game.user?.isGM || !this.mapId || !region?.id) return;
    this._startRegionEdit(region);
    const data = await this._promptForRegionData(region, {
      isEditing: true,
      onLiveChange: (nextData) => {
        this._editingRegionStyle = { ...(this._editingRegionStyle ?? region), ...nextData };
        const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
        this._syncDraftRegionLayer(worldMap);
        this._syncRegionVertexMarkers(worldMap);
      }
    });
    if (!data) {
      this._stopRegionEdit();
      return;
    }
    await TheatreStore.upsertWorldMapRegion(this.mapId, { id: region.id, ...data, points: this._pendingRegionPoints });
    this._stopRegionEdit({ rerender: false });
    this._renderPreservingView();
  }

  async _editLine(line) {
    if (!game.user?.isGM || !this.mapId || !line?.id) return;
    this._startLineEdit(line);
    const data = await this._promptForLineData(line, {
      isEditing: true,
      onLiveChange: (nextData) => {
        this._editingLineStyle = { ...(this._editingLineStyle ?? line), ...nextData };
        const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
        this._syncDraftLineLayer(worldMap);
        this._syncLineVertexMarkers(worldMap);
      }
    });
    if (!data) {
      this._stopLineEdit();
      return;
    }
    await TheatreStore.upsertWorldMapLine(this.mapId, { id: line.id, ...data, points: this._pendingLinePoints });
    this._stopLineEdit({ rerender: false });
    this._renderPreservingView();
  }

  async _openDraftRegionInspector(draftRegion) {
    if (this._draftRegionInspectorOpen || !this.mapId) return;
    this._draftRegionInspectorOpen = true;
    this._editingRegionStyle = { ...draftRegion };
    const data = await this._promptForRegionData(draftRegion, {
      isEditing: false,
      onLiveChange: (nextData) => {
        this._editingRegionStyle = { ...(this._editingRegionStyle ?? draftRegion), ...nextData };
        const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
        this._syncDraftRegionLayer(worldMap);
      }
    });
    this._draftRegionInspectorOpen = false;
    if (!this._isRegionDrawMode) return;
    if (!data) return;
    this._editingRegionStyle = { ...(this._editingRegionStyle ?? draftRegion), ...data };
    if (this._pendingRegionPoints.length < 3) {
      ui.notifications?.info(tr("Set at least three points before saving the region."));
      return;
    }
    await TheatreStore.upsertWorldMapRegion(this.mapId, {
      id: randomId(),
      ...this._editingRegionStyle,
      points: this._pendingRegionPoints,
      visible: true
    });
    this._isRegionDrawMode = false;
    this._editingRegionStyle = null;
    this._pendingRegionPoints = [];
    this._renderPreservingView();
  }

  async _openDraftLineInspector(draftLine) {
    if (this._draftLineInspectorOpen || !this.mapId) return;
    this._draftLineInspectorOpen = true;
    this._editingLineStyle = { ...draftLine };
    const data = await this._promptForLineData(draftLine, {
      isEditing: false,
      onLiveChange: (nextData) => {
        this._editingLineStyle = { ...(this._editingLineStyle ?? draftLine), ...nextData };
        const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
        this._syncDraftLineLayer(worldMap);
      }
    });
    this._draftLineInspectorOpen = false;
    if (!this._isLineDrawMode) return;
    if (!data) return;
    this._editingLineStyle = { ...(this._editingLineStyle ?? draftLine), ...data };
    if (this._pendingLinePoints.length < 2) {
      ui.notifications?.info(tr("Set at least two points before saving the line."));
      return;
    }
    await TheatreStore.upsertWorldMapLine(this.mapId, {
      id: randomId(),
      ...this._editingLineStyle,
      points: this._pendingLinePoints,
      visible: true
    });
    this._isLineDrawMode = false;
    this._editingLineStyle = null;
    this._pendingLinePoints = [];
    this._renderPreservingView();
  }

  _createDefaultRegionDraft(worldMap = null) {
    const category = this._getRegionCategoryOptions(worldMap)[0]?.id || "general";
    return {
      name: tr("Region"),
      category,
      documentUuid: "",
      documentType: "",
      documentName: "",
      visible: true,
      fillColor: "#7ebaec",
      strokeColor: "#d7e8ff",
      fillOpacity: 0.28,
      strokeOpacity: 0.95,
      strokeWidth: 2,
      fillStyle: "solid",
      fillPatternScale: 14,
      fillPatternSize: 2,
      strokeStyle: "solid"
    };
  }

  _createDefaultLineDraft(worldMap = null) {
    return {
      name: tr("Line"),
      category: this._getPinTypeDefinition(null, worldMap).value,
      documentUuid: "",
      documentType: "",
      documentName: "",
      visible: true,
      color: "#d7e8ff",
      opacity: 0.95,
      width: 3,
      outlineColor: "#101722",
      outlineWidth: 0,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowBlur: 6,
      lineStyle: "solid",
      lineCap: "round",
      pointStyle: "none",
      pointSize: 7,
      pointColor: "#d7e8ff",
      pointOpacity: 0.95,
      pointOutlineColor: "#101722",
      pointOutlineWidth: 1,
      movableForPlayers: false
    };
  }

  _startRegionEdit(region) {
    if (!game.user?.isGM || !region?.id) return;
    this._editingRegionId = region.id;
    this._editingRegionName = String(region.name || tr("Region")).trim();
    this._editingRegionStyle = { ...region };
    this._isRegionDrawMode = false;
    this._stopLineEdit({ rerender: false });
    this._pendingRegionPoints = Array.isArray(region.points)
      ? region.points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
      : [];
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    this.render(false);
  }

  _stopRegionEdit({ rerender = true } = {}) {
    this._editingRegionId = null;
    this._editingRegionName = "";
    this._editingRegionStyle = null;
    this._pendingRegionPoints = [];
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    if (rerender) this.render(false);
  }

  _startLineEdit(line) {
    if (!game.user?.isGM || !line?.id) return;
    this._editingLineId = line.id;
    this._editingLineName = String(line.name || tr("Line")).trim();
    this._editingLineStyle = { ...line };
    this._isLineDrawMode = false;
    this._pendingLinePoints = Array.isArray(line.points)
      ? line.points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
      : [];
    this._stopRegionEdit({ rerender: false });
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncLeafletLines(worldMap);
    this._syncDraftLineLayer(worldMap);
    this._syncLineVertexMarkers(worldMap);
    this.render(false);
  }

  _stopLineEdit({ rerender = true } = {}) {
    this._editingLineId = null;
    this._editingLineName = "";
    this._editingLineStyle = null;
    this._pendingLinePoints = [];
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftLineLayer(worldMap);
    this._syncLineVertexMarkers(worldMap);
    this._syncLeafletLines(worldMap);
    if (rerender) this.render(false);
  }

  async _createObjectOverlayAtLatLng(type, latlng) {
    if (!game.user?.isGM || !this.mapId || !latlng) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    const point = this._latLngToMapPixels(latlng, worldMap);
    const defaultObjectCategory = this._getObjectCategoryOptions(worldMap)[0]?.id || "general";
    const defaults = type === "text"
      ? { type, name: tr("Text object"), category: defaultObjectCategory, text: tr("Text object"), documentUuid: "", documentType: "", documentName: "", fontSize: 24, lineHeight: 0.95, fontFamily: "", color: "#f2f5f8", outlineColor: "#101722", outlineMode: "outer", outlineWidth: 0, shadowColor: "#000000", shadowDistance: 2, shadowOpacity: 0.7, shadowBlur: 8, opacity: 1, scaleWithZoom: true, movableForPlayers: false }
      : { type, name: tr("Image object"), category: defaultObjectCategory, imagePath: "", width: 160, opacity: 1, scaleWithZoom: true, movableForPlayers: false };
    const data = await this._promptForObjectOverlayData(defaults, { forcedType: type });
    if (!data) return;
    if (type === "image" && !data.imagePath) {
      ui.notifications?.warn(tr("Please choose an image path for the object overlay."));
      return;
    }
    await TheatreStore.upsertWorldMapObjectOverlay(this.mapId, { id: randomId(), x: point.x, y: point.y, visible: true, ...data });
    this._syncLeafletObjectOverlays(TheatreStore.getWorldMapById(this.mapId));
    this._renderPreservingView();
  }

  async _editObjectOverlay(entry) {
    if (!game.user?.isGM || !this.mapId || !entry?.id) return;
    const data = await this._promptForObjectOverlayData(entry, { isEditing: true, forcedType: entry.type });
    if (!data) return;
    if (entry.type === "image" && !data.imagePath) {
      ui.notifications?.warn(tr("Please choose an image path for the object overlay."));
      return;
    }
    await TheatreStore.upsertWorldMapObjectOverlay(this.mapId, { id: entry.id, ...data });
    this._syncLeafletObjectOverlays(TheatreStore.getWorldMapById(this.mapId));
    this._renderPreservingView();
  }

  async _editPin(pin) {
    if (!game.user?.isGM || !pin?.id || !this.mapId) return;
    const pinData = await this._promptForPinData({
      id: pin.id,
      label: pin.label || tr("Pin"),
      note: String(pin.note || "").trim(),
      type: pin.type || "location",
      color: normalizeHexColor(pin.color),
      size: normalizePinSize(pin.size),
      borderColor: normalizeHexColor(pin.borderColor, "#101722"),
      borderWidth: Math.max(0, Math.min(8, Number(pin.borderWidth) || 0)),
      shadowColor: normalizeHexColor(pin.shadowColor, "#000000"),
      shadowDistance: Number.isFinite(Number(pin.shadowDistance)) ? Math.max(0, Math.min(32, Number(pin.shadowDistance))) : 2,
      shadowOpacity: Math.max(0, Math.min(1, Number(pin.shadowOpacity ?? 0.55))),
      shadowBlur: Number.isFinite(Number(pin.shadowBlur)) ? Math.max(0, Math.min(32, Number(pin.shadowBlur))) : 4,
      movableForPlayers: Boolean(pin.movableForPlayers),
      documentUuid: String(pin.documentUuid || "").trim(),
      documentName: String(pin.documentName || "").trim(),
      documentType: String(pin.documentType || "").trim(),
      isEditing: true
    }, { isEditing: true });
    if (!pinData) return;
    await TheatreStore.upsertWorldMapPin(this.mapId, {
      id: pin.id,
      label: pinData.label,
      note: pinData.note,
      type: pinData.type,
      color: pinData.color,
      size: pinData.size,
      borderColor: pinData.borderColor,
      borderWidth: pinData.borderWidth,
      shadowColor: pinData.shadowColor,
      shadowDistance: pinData.shadowDistance,
      shadowOpacity: pinData.shadowOpacity,
      shadowBlur: pinData.shadowBlur,
      documentUuid: pinData.documentUuid,
      documentType: pinData.documentType,
      documentName: pinData.documentName,
      movableForPlayers: pinData.movableForPlayers
    });
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  _onPinSidebarFilterInput(event) {
    event.preventDefault();
    this._applyPinSidebarFilters();
  }

  _applyPinSidebarFilters() {
    const root = this.element?.[0];
    if (!root) return;
    const search = String(root.querySelector("[data-world-map-pin-filter='search']")?.value || "").trim().toLowerCase();
    const category = String(root.querySelector("[data-world-map-pin-filter='category']")?.value || "").trim().toLowerCase();
    root.querySelectorAll(".tom-world-map__pin-item").forEach((item) => {
      const label = String(item.getAttribute("data-pin-label") || "").toLowerCase();
      const itemCategory = String(item.getAttribute("data-pin-category") || "").toLowerCase();
      const matchesSearch = !search || label.includes(search);
      const matchesCategory = !category || itemCategory === category;
      const isVisible = matchesSearch && matchesCategory;
      item.toggleAttribute("hidden", !isVisible);
      item.classList.toggle("is-filtered-out", !isVisible);
      item.style.display = isVisible ? "" : "none";
    });
  }

  _readPinDataFromDialog(html, initialData = {}) {
    const label = String(html?.find?.("[name='pinLabel']").val?.() || "").trim() || initialData.label;
    const type = String(html?.find?.("[name='pinType']").val?.() || "location").trim();
    const note = String(html?.find?.("[name='pinNote']").val?.() || "").trim();
    const color = normalizeHexColor(String(html?.find?.("[name='pinColor']").val?.() || "").trim(), "#7ebaec");
    const size = normalizePinSize(html?.find?.("[name='pinSize']").val?.(), normalizePinSize(initialData.size));
    const borderColor = normalizeHexColor(String(html?.find?.("[name='pinBorderColor']").val?.() || "").trim(), "#101722");
    const borderWidth = Math.max(0, Math.min(8, Number(html?.find?.("[name='pinBorderWidth']").val?.()) || 0));
    const shadowColor = normalizeHexColor(String(html?.find?.("[name='pinShadowColor']").val?.() || "").trim(), "#000000");
    const shadowDistance = Math.max(0, Math.min(32, Number(html?.find?.("[name='pinShadowDistance']").val?.()) || 0));
    const shadowOpacity = Math.max(0, Math.min(1, Number(html?.find?.("[name='pinShadowOpacity']").val?.()) || 0));
    const shadowBlur = Math.max(0, Math.min(32, Number(html?.find?.("[name='pinShadowBlur']").val?.()) || 0));
    const movableForPlayers = Boolean(html?.find?.("[name='pinMovableForPlayers']").prop?.("checked"));
    return {
      label,
      note,
      type,
      color,
      size,
      borderColor,
      borderWidth,
      shadowColor,
      shadowDistance,
      shadowOpacity,
      shadowBlur,
      movableForPlayers,
      ...this._readLinkedDocumentDataFromDialog(html, "pin")
    };
  }

  _syncPinDialogPreview(pinId, pinData) {
    if (!pinId || !this._leafletMarkers?.has(pinId)) return;
    const marker = this._leafletMarkers.get(pinId);
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const existingPin = worldMap?.pins?.find((entry) => entry.id === pinId) ?? {};
    const nextPin = { ...existingPin, ...pinData, id: pinId };
    marker.setIcon(this._createMarkerIcon(nextPin));
    marker.bindTooltip(this._buildPinTooltipContent(nextPin), {
      direction: "top",
      className: "tom-world-map__tooltip",
      opacity: 0.98
    });
  }

  async _promptForPinData(initialData, { isEditing = false } = {}) {
    const pinTypeDefinitions = Object.values(this._getPinTypeDefinitions());
    const selectOptions = pinTypeDefinitions
      .map((definition) => `<option value="${definition.value}" ${definition.value === initialData.type ? "selected" : ""}>${escapeHtml(definition.label)}</option>`)
      .join("");
    const safeColor = normalizeHexColor(initialData.color, "#7ebaec");
    const safeSize = normalizePinSize(initialData.size);
    const safeBorderColor = normalizeHexColor(initialData.borderColor, "#101722");
    const safeBorderWidth = Math.max(0, Math.min(8, Number(initialData.borderWidth) || 0));
    const safeShadowColor = normalizeHexColor(initialData.shadowColor, "#000000");
    const safeShadowDistance = Number.isFinite(Number(initialData.shadowDistance)) ? Math.max(0, Math.min(32, Number(initialData.shadowDistance))) : 2;
    const safeShadowOpacity = Math.max(0, Math.min(1, Number(initialData.shadowOpacity ?? 0.55)));
    const safeShadowBlur = Number.isFinite(Number(initialData.shadowBlur)) ? Math.max(0, Math.min(32, Number(initialData.shadowBlur))) : 4;
    const safeNote = escapeHtml(String(initialData.note || ""));
    return await new Promise((resolve) => {
      let didResolve = false;
      const resolveOnce = (value) => {
        didResolve = true;
        resolve(value);
      };
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit pin" : "Create pin"),
        content: `
          <div class="tom-theme-root tom-world-map-pin-dialog">
            <div class="form-group">
              <label>${tr("Pin label")}</label>
              <input type="text" name="pinLabel" value="${escapeHtml(String(initialData.label || ""))}" autofocus />
            </div>
            <div class="form-group">
              <label>${tr("Pin type")}</label>
              <select name="pinType">${selectOptions}</select>
            </div>
            <div class="form-group">
              <label>${tr("Pin description")}</label>
              <textarea name="pinNote" rows="4">${safeNote}</textarea>
            </div>
            <div class="form-group">
              <label>${tr("Pin color")}</label>
              <input type="color" name="pinColor" value="${safeColor}" />
            </div>
            <div class="form-group">
              <label>${tr("Pin size")}</label>
              <input type="range" name="pinSize" min="0.7" max="2.4" step="0.1" value="${safeSize}" />
            </div>
            <section class="tom-world-map-pin-dialog__style-card tom-theme-card">
              <h4>${tr("Pin icon border")}</h4>
              <div class="tom-world-map-pin-dialog__style-grid">
                <div class="form-group">
                  <label>${tr("Border color")}</label>
                  <input type="color" name="pinBorderColor" value="${safeBorderColor}" />
                </div>
                <div class="form-group">
                  <label>${tr("Border thickness")}</label>
                  <input type="range" name="pinBorderWidth" min="0" max="8" step="0.25" value="${safeBorderWidth}" />
                </div>
              </div>
            </section>
            <section class="tom-world-map-pin-dialog__style-card tom-theme-card">
              <h4>${tr("Pin shadow")}</h4>
              <div class="tom-world-map-pin-dialog__style-grid tom-world-map-pin-dialog__style-grid--shadow">
                <div class="form-group">
                  <label>${tr("Shadow color")}</label>
                  <input type="color" name="pinShadowColor" value="${safeShadowColor}" />
                </div>
                <div class="form-group">
                  <label>${tr("Shadow distance")}</label>
                  <input type="number" name="pinShadowDistance" min="0" max="32" step="0.5" value="${safeShadowDistance}" />
                </div>
                <div class="form-group">
                  <label>${tr("Shadow opacity")}</label>
                  <input type="number" name="pinShadowOpacity" min="0" max="1" step="0.05" value="${safeShadowOpacity}" />
                </div>
                <div class="form-group">
                  <label>${tr("Shadow blur")}</label>
                  <input type="number" name="pinShadowBlur" min="0" max="32" step="0.5" value="${safeShadowBlur}" />
                </div>
              </div>
            </section>
            <label class="checkbox"><input type="checkbox" name="pinMovableForPlayers" ${initialData.movableForPlayers ? "checked" : ""} /> <span>${tr("Movable for players")}</span></label>
            ${this._buildLinkedDocumentDropMarkup("pin", initialData)}
          </div>
        `,
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => {
              resolveOnce(this._readPinDataFromDialog(html, initialData));
            }
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => {
              this._syncPinDialogPreview(initialData.id, initialData);
              resolveOnce(null);
            }
          }
        },
        default: "create",
        close: () => {
          if (!didResolve) {
            this._syncPinDialogPreview(initialData.id, initialData);
            resolveOnce(null);
          }
        }
      });
      dialog.render(true);
      window.setTimeout(() => {
        applyTheatreDialogTheme(dialog, MODULE_ID, "24rem");
        const root = dialog.element?.[0];
        if (!root) return;
        const themeState = TheatreStore.getThemeState();
        root.classList.add("tom-world-map-pin-dialog-host");
        applyThemeInlineStyleToHost(root, themeState);
        root.querySelectorAll?.(".tom-theme-root").forEach((element) => applyThemeInlineStyleToHost(element, themeState));
        this._activateLinkedDocumentDrop(root, "pin");
        const syncPreview = () => this._syncPinDialogPreview(initialData.id, this._readPinDataFromDialog(dialog.element, initialData));
        root.querySelectorAll?.("[name='pinLabel'], [name='pinType'], [name='pinNote'], [name='pinColor'], [name='pinSize'], [name='pinBorderColor'], [name='pinBorderWidth'], [name='pinShadowColor'], [name='pinShadowDistance'], [name='pinShadowOpacity'], [name='pinShadowBlur']")
          ?.forEach((input) => input.addEventListener("input", syncPreview));
        root.querySelectorAll?.("[name='pinType'], [name='pinMovableForPlayers']")
          ?.forEach((input) => input.addEventListener("change", syncPreview));
      }, 30);
    });
  }

  _onToggleRightSidebar(event) {
    event.preventDefault();
    this._isRightSidebarCollapsed = !this._isRightSidebarCollapsed;
    this._renderPreservingView();
  }

  async _onLeafletMapDoubleClick(event) {
    this._closeContextMenu({ rerender: false });
    if (!game.user?.isGM || this._isRegionDrawMode || this._isLineDrawMode || this._editingRegionId || this._editingLineId) return;
    await this._createPinFromLatLng(event?.latlng);
  }

  _onLeafletMapClick(event) {
    this._closeContextMenu({ rerender: false });
    if (!game.user?.isGM) return;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!worldMap || !event?.latlng) return;
    if (this._isRegionDrawMode && !this._editingRegionId) {
      const latlng = this._regionSnapEnabled
        ? this._getSnappedLatLng(event.latlng, worldMap)
        : event.latlng;
      const point = this._latLngToMapPixels(latlng, worldMap);
      this._pendingRegionPoints = [...this._pendingRegionPoints, point];
      this._syncDraftRegionLayer(worldMap);
      this._syncRegionVertexMarkers(worldMap);
      this.render(false);
      return;
    }
    if (this._isLineDrawMode) {
      const latlng = this._lineSnapEnabled
        ? this._getSnappedLatLng(event.latlng, worldMap)
        : event.latlng;
      const point = this._latLngToMapPixels(latlng, worldMap);
      this._pendingLinePoints = [...this._pendingLinePoints, point];
      this._syncDraftLineLayer(worldMap);
      this._syncLineVertexMarkers(worldMap);
      this.render(false);
    }
  }

  _onLeafletMapContextMenu(event) {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    if (!game.user?.isGM) return;
    const containerPoint = this._leafletMap?.mouseEventToContainerPoint?.(event?.originalEvent);
    this._contextMenuState = {
      isOpen: true,
      x: Math.max(12, Number(containerPoint?.x) || 0),
      y: Math.max(12, Number(containerPoint?.y) || 0),
      latlng: event?.latlng ?? null,
      mode: "create",
      targetType: "",
      targetId: ""
    };
    this._updateContextMenuElement();
  }

  _onTogglePinVisibility(event) {
    event.preventDefault();
    this._arePinsVisible = !this._arePinsVisible;
    this._syncLeafletPins();
    this._refreshVisibilityControlUi();
  }

  _onToggleObjectOverlayVisibility(event) {
    event.preventDefault();
    this._areObjectOverlaysVisible = !this._areObjectOverlaysVisible;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncLeafletObjectOverlays(worldMap);
    this._refreshVisibilityControlUi();
  }

  _onToggleRegionVisibility(event) {
    event.preventDefault();
    this._areRegionsVisible = !this._areRegionsVisible;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncLeafletRegions(worldMap);
    this._refreshVisibilityControlUi();
  }

  _onToggleFogToolbar(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    this._fogToolbarOpen = !this._fogToolbarOpen;
    if (!this._fogToolbarOpen) {
      this._fogIsPainting = false;
      this._fogActiveBrushPoints = [];
      this._fogBrushPreviewPoint = null;
      this._fogPolygonPoints = [];
      this._clearFogPolygonVertexMarkers();
    }
    if (this._fogCanvas) this._fogCanvas.style.pointerEvents = this._fogToolbarOpen ? "auto" : "none";
    if (this._fogCanvas && this._fogToolbarOpen && this._fogTool === "polygon") this._fogCanvas.style.pointerEvents = "auto";
    this._leafletMap?.dragging?.[this._fogToolbarOpen ? "disable" : "enable"]?.();
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers();
    this.render(false);
  }

  _onSetFogTool(event) {
    event.preventDefault();
    this._fogTool = String(event.currentTarget?.dataset?.fogTool || "brush").trim() === "polygon" ? "polygon" : "brush";
    this._fogActiveBrushPoints = [];
    this._fogBrushPreviewPoint = null;
    this._fogPolygonPoints = [];
    this._syncFogPolygonVertexMarkers();
    if (this._fogCanvas) this._fogCanvas.style.pointerEvents = this._fogToolbarOpen ? "auto" : "none";
    if (this._fogCanvas) this._fogCanvas.style.cursor = "crosshair";
    this._renderFogCanvas();
    this.render(false);
  }

  _onSetFogAction(event) {
    event.preventDefault();
    this._fogAction = String(event.currentTarget?.dataset?.fogAction || "reveal").trim() === "restore" ? "restore" : "reveal";
    this.render(false);
  }

  _onToggleFogGmPreview(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    this._fogGmPreviewTransparent = !this._fogGmPreviewTransparent;
    this._renderFogCanvas();
    this.render(false);
  }

  _updateFogToolbarState() {
    const root = this.element?.[0];
    if (!(root instanceof HTMLElement)) return;
    root.querySelectorAll("[data-action='finish-map-fog-polygon']").forEach((button) => {
      button.disabled = this._fogPolygonPoints.length < 3;
    });
  }

  _onFogBrushSizeInput(event) {
    this._fogBrushSize = Math.max(1, Math.min(512, Number(event.currentTarget?.value) || 72));
    const valueLabel = event.currentTarget?.closest?.(".tom-world-map__fog-field")?.querySelector?.("strong");
    if (valueLabel) valueLabel.textContent = String(this._fogBrushSize);
    this._renderFogCanvas();
  }

  _onFogFeatherInput(event) {
    this._fogFeather = Math.max(0, Math.min(256, Number(event.currentTarget?.value) || 0));
    const valueLabel = event.currentTarget?.closest?.(".tom-world-map__fog-field")?.querySelector?.("strong");
    if (valueLabel) valueLabel.textContent = String(this._fogFeather);
    this._renderFogCanvas();
  }

  _fogEventToMapPoint(event) {
    if (!this._leafletMap || !this.mapId) return null;
    const canvas = this._fogCanvas;
    if (!(canvas instanceof HTMLElement)) return null;
    const rect = canvas.getBoundingClientRect();
    const padding = Number(this._fogCanvasPadding) || 0;
    const point = globalThis.L?.point?.(event.clientX - rect.left - padding, event.clientY - rect.top - padding);
    if (!point) return null;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return null;
    return this._latLngToMapPixels(this._leafletMap.containerPointToLatLng(point), worldMap);
  }

  _getFogCanvasPointFromEvent(event) {
    const canvas = this._fogCanvas;
    if (!(canvas instanceof HTMLElement)) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  _getFogPolygonHandleIndexFromEvent(event) {
    if (!this._leafletMap || !this.mapId || !this._fogPolygonPoints.length) return -1;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const eventPoint = this._getFogCanvasPointFromEvent(event);
    if (!worldMap || !eventPoint) return -1;
    const hitRadius = 12;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    this._fogPolygonPoints.forEach((point, index) => {
      const canvasPoint = this._mapPointToContainerPoint(point, worldMap);
      if (!canvasPoint) return;
      const distance = Math.hypot(canvasPoint.x - eventPoint.x, canvasPoint.y - eventPoint.y);
      if (distance <= hitRadius && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  _onFogPointerDown(event) {
    if (!this._fogToolbarOpen || !game.user?.isGM) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this._fogEventToMapPoint(event);
    if (!point) return;
    if (this._fogTool === "polygon") {
      const handleIndex = this._getFogPolygonHandleIndexFromEvent(event);
      if (handleIndex >= 0) {
        this._fogDraggedPolygonPointIndex = handleIndex;
        if (this._fogCanvas) this._fogCanvas.style.cursor = "grabbing";
        this._fogCanvas?.setPointerCapture?.(event.pointerId);
        return;
      }
      this._fogPolygonPoints = [...this._fogPolygonPoints, point];
      this._renderFogCanvas();
      this._syncFogPolygonVertexMarkers();
      this._updateFogToolbarState();
      return;
    }
    this._fogIsPainting = true;
    this._fogActiveBrushPoints = [point];
    this._fogBrushPreviewPoint = point;
    this._fogCanvas?.setPointerCapture?.(event.pointerId);
    this._renderFogCanvas();
  }

  _onFogPointerLeave(event) {
    if (!this._fogToolbarOpen || !game.user?.isGM) return;
    if (Number.isInteger(this._fogDraggedPolygonPointIndex)) {
      this._fogDraggedPolygonPointIndex = null;
      if (this._fogCanvas) this._fogCanvas.style.cursor = "crosshair";
      this._fogCanvas?.releasePointerCapture?.(event.pointerId);
      this._syncFogPolygonVertexMarkers();
      return;
    }
    if (this._fogTool !== "brush") return;
    if (this._fogIsPainting) {
      void this._onFogPointerUp(event);
      return;
    }
    this._fogBrushPreviewPoint = null;
    this._renderFogCanvas();
  }

  _onFogPointerMove(event) {
    if (!this._fogToolbarOpen || !game.user?.isGM) return;
    event.preventDefault();
    const point = this._fogEventToMapPoint(event);
    if (!point) return;
    if (this._fogTool === "polygon") {
      if (Number.isInteger(this._fogDraggedPolygonPointIndex)) {
        this._fogPolygonPoints[this._fogDraggedPolygonPointIndex] = point;
        this._renderFogCanvas();
        this._syncFogPolygonVertexMarkers();
        if (this._fogCanvas) this._fogCanvas.style.cursor = "grabbing";
      } else if (this._fogCanvas) {
        this._fogCanvas.style.cursor = this._getFogPolygonHandleIndexFromEvent(event) >= 0 ? "grab" : "crosshair";
      }
      return;
    }
    if (this._fogTool !== "brush") return;
    this._fogBrushPreviewPoint = point;
    if (!this._fogIsPainting) {
      this._renderFogCanvas();
      return;
    }
    const previous = this._fogActiveBrushPoints.at(-1);
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : Number.POSITIVE_INFINITY;
    if (distance < Math.max(4, this._fogBrushSize / 4)) return;
    this._fogActiveBrushPoints.push(point);
    this._renderFogCanvas();
  }

  async _onFogPointerUp(event) {
    if (Number.isInteger(this._fogDraggedPolygonPointIndex)) {
      event?.preventDefault?.();
      this._fogDraggedPolygonPointIndex = null;
      if (this._fogCanvas) this._fogCanvas.style.cursor = "crosshair";
      this._fogCanvas?.releasePointerCapture?.(event.pointerId);
      this._syncFogPolygonVertexMarkers();
      return;
    }
    if (!this._fogIsPainting || this._fogTool !== "brush") return;
    event?.preventDefault?.();
    this._fogIsPainting = false;
    this._fogCanvas?.releasePointerCapture?.(event.pointerId);
    if (this._fogActiveBrushPoints.length) {
      const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
      await this._appendFogOperation({
        tool: "brush",
        action: this._fogAction,
        points: this._fogActiveBrushPoints,
        radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, 72),
        feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, 18)
      });
    }
    this._fogActiveBrushPoints = [];
    this._fogBrushPreviewPoint = this._fogEventToMapPoint(event) ?? this._fogBrushPreviewPoint;
    this._renderFogCanvas();
  }

  async _onFinishFogPolygon(event) {
    event.preventDefault();
    if (this._fogPolygonPoints.length < 3) return;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    await this._appendFogOperation({
      tool: "polygon",
      action: this._fogAction,
      points: this._fogPolygonPoints,
      radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, 72),
      feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, 18)
    });
    this._fogPolygonPoints = [];
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers();
    this._updateFogToolbarState();
    this.render(false);
  }

  _onCancelFogPolygon(event) {
    event?.preventDefault?.();
    this._fogPolygonPoints = [];
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers();
    this._updateFogToolbarState();
    this.render(false);
  }

  async _appendFogOperation(operation) {
    if (!this.mapId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    await TheatreStore.upsertWorldMap({
      id: worldMap.id,
      fogSettings: {
        ...(worldMap.fogSettings ?? {}),
        operations: [
          ...(Array.isArray(worldMap.fogSettings?.operations) ? worldMap.fogSettings.operations : []),
          { id: randomId(), createdAt: Date.now(), space: "map", ...operation }
        ]
      }
    });
  }

  async _onClearFogOperations(event) {
    event.preventDefault();
    if (!this.mapId || !game.user?.isGM) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    await TheatreStore.upsertWorldMap({
      id: worldMap.id,
      fogSettings: {
        ...(worldMap.fogSettings ?? {}),
        operations: []
      }
    });
    this._fogActiveBrushPoints = [];
    this._fogPolygonPoints = [];
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers();
  }

  _onToggleCategoryVisibility(event) {
    event.preventDefault();
    if (event.target?.closest?.("[data-action='toggle-category-lock']")) return;
    const categoryId = String(event.currentTarget?.dataset?.categoryId || "").trim().toLowerCase();
    if (!categoryId) return;
    if (this._hiddenCategories.has(categoryId)) this._hiddenCategories.delete(categoryId);
    else this._hiddenCategories.add(categoryId);
    this._syncLeafletPins();
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncLeafletLines(worldMap);
    this._syncLeafletObjectOverlays(worldMap);
    this._syncLeafletRegions(worldMap);
    this._refreshLegendButtonUi(event.currentTarget, !this._hiddenCategories.has(categoryId));
  }

  async _toggleCategoryLock(kind, categoryId, lockElement = null) {
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const normalizedKind = String(kind || "").trim();
    const normalizedCategoryId = String(categoryId || "").trim().toLowerCase();
    if (!game.user?.isGM || !worldMap || !normalizedKind || !normalizedCategoryId) return;
    const current = {
      categories: Array.isArray(worldMap.lockedCategories?.categories) ? [...worldMap.lockedCategories.categories] : [],
      pins: [],
      objects: [],
      regions: []
    };
    const storageKind = normalizedKind === "pins" || normalizedKind === "objects" || normalizedKind === "regions" ? "categories" : normalizedKind;
    const values = new Set(current[storageKind] ?? []);
    if (values.has(normalizedCategoryId)) values.delete(normalizedCategoryId);
    else values.add(normalizedCategoryId);
    current[storageKind] = Array.from(values);
    const updatedMap = await TheatreStore.upsertWorldMap({
      id: worldMap.id,
      lockedCategories: current
    });
    this._syncLeafletObjectOverlays(updatedMap);
    this._syncLeafletPins();
    this._syncLeafletRegions(updatedMap);
    this._syncLeafletLines(updatedMap);
    const isLocked = this._isCategoryLocked(normalizedKind, normalizedCategoryId, updatedMap);
    if (lockElement instanceof HTMLElement) {
      lockElement.classList.toggle("is-locked", isLocked);
      const icon = lockElement.querySelector("i");
      icon?.classList.toggle("fa-lock", isLocked);
      icon?.classList.toggle("fa-lock-open", !isLocked);
      const label = tr(isLocked ? "Unlock category movement" : "Lock category movement");
      lockElement.setAttribute("title", label);
      lockElement.setAttribute("aria-label", label);
    }
  }

  async _onToggleCategoryLock(event) {
    event.preventDefault();
    event.stopPropagation();
    await this._toggleCategoryLock("categories", event.currentTarget?.dataset?.categoryId, event.currentTarget);
  }

  _refreshVisibilityControlUi() {
    const root = this.element?.[0];
    if (!root) return;

    const pinToggle = root.querySelector("[data-action='toggle-map-pin-visibility']");
    const pinIcon = pinToggle?.querySelector("i");
    if (pinToggle) {
      pinToggle.classList.toggle("is-active", Boolean(this._arePinsVisible));
      const label = tr("Pins");
      pinToggle.setAttribute("title", label);
      pinToggle.setAttribute("aria-label", label);
    }
    if (pinIcon) {
      pinIcon.classList.toggle("fa-eye", Boolean(this._arePinsVisible));
      pinIcon.classList.toggle("fa-eye-slash", !this._arePinsVisible);
    }

    const objectToggle = root.querySelector("[data-action='toggle-map-object-overlay-visibility']");
    if (objectToggle) {
      objectToggle.classList.toggle("is-active", Boolean(this._areObjectOverlaysVisible));
    }

    const regionToggle = root.querySelector("[data-action='toggle-map-region-visibility']");
    if (regionToggle) {
      regionToggle.classList.toggle("is-active", Boolean(this._areRegionsVisible));
    }
  }

  _refreshLegendButtonUi(button, isVisible) {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle("is-active", Boolean(isVisible));
  }

  _onToggleOverlay(event) {
    event.preventDefault();
    const overlayId = String(event.currentTarget?.dataset?.overlayId || "").trim();
    if (!overlayId) return;
    if (this._activeOverlayIds.has(overlayId)) this._activeOverlayIds.delete(overlayId);
    else this._activeOverlayIds.add(overlayId);
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncLeafletOverlays(worldMap);
    this.render(false);
  }

  async _onCreateImageObjectAtCenter(event) {
    event.preventDefault();
    if (!this._leafletMap) return;
    await this._createObjectOverlayAtLatLng("image", this._leafletMap.getCenter());
  }

  async _onCreateTextObjectAtCenter(event) {
    event.preventDefault();
    if (!this._leafletMap) return;
    await this._createObjectOverlayAtLatLng("text", this._leafletMap.getCenter());
  }

  _onViewportMouseDown(event) {
    if (!this._contextMenuState.isOpen) return;
    if (event.target?.closest?.(".tom-world-map__context-menu")) return;
    this._closeContextMenu();
  }

  async _onCreatePinAtContextMenu(event) {
    event.preventDefault();
    const latlng = this._contextMenuState.latlng;
    this._closeContextMenu();
    await this._createPinFromLatLng(latlng);
  }

  async _onEditContextTarget(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const { targetType, targetId } = this._contextMenuState;
    this._closeContextMenu({ rerender: false });
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap || !targetId) return;
    if (targetType === "pin") {
      const pin = worldMap.pins?.find((entry) => entry.id === targetId);
      if (pin) await this._editPin(pin);
      return;
    }
    if (targetType === "objectOverlay") {
      const entry = worldMap.objectOverlays?.find((item) => item.id === targetId);
      if (entry) await this._editObjectOverlay(entry);
      return;
    }
    if (targetType === "region") {
      const region = worldMap.regions?.find((entry) => entry.id === targetId);
      if (region) await this._editRegion(region);
      return;
    }
    if (targetType === "line") {
      const line = worldMap.lines?.find((entry) => entry.id === targetId);
      if (line) await this._editLine(line);
    }
  }

  async _onCreateImageAtContextMenu(event) {
    event.preventDefault();
    const latlng = this._contextMenuState.latlng;
    this._closeContextMenu();
    await this._createObjectOverlayAtLatLng("image", latlng);
  }

  async _onCreateTextAtContextMenu(event) {
    event.preventDefault();
    const latlng = this._contextMenuState.latlng;
    this._closeContextMenu();
    await this._createObjectOverlayAtLatLng("text", latlng);
  }

  async _onStartRegionAtContextMenu(event) {
    event.preventDefault();
    const latlng = this._contextMenuState.latlng;
    this._closeContextMenu({ rerender: false });
    if (!game.user?.isGM || !this.mapId || !latlng) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    this._stopRegionEdit({ rerender: false });
    this._stopLineEdit({ rerender: false });
    this._stopLineDraw({ rerender: false });
    this._isRegionDrawMode = true;
    this._editingRegionStyle = this._createDefaultRegionDraft(worldMap);
    const snappedLatLng = this._regionSnapEnabled ? this._getSnappedLatLng(latlng, worldMap) : latlng;
    this._pendingRegionPoints = [this._latLngToMapPixels(snappedLatLng, worldMap)];
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    this.render(false);
    await this._openDraftRegionInspector(this._editingRegionStyle);
  }

  async _onStartLineAtContextMenu(event) {
    event.preventDefault();
    const latlng = this._contextMenuState.latlng;
    this._closeContextMenu({ rerender: false });
    if (!game.user?.isGM || !this.mapId || !latlng) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    this._stopRegionEdit({ rerender: false });
    this._stopLineEdit({ rerender: false });
    this._isRegionDrawMode = false;
    this._pendingRegionPoints = [];
    this._isLineDrawMode = true;
    this._editingLineStyle = this._createDefaultLineDraft(worldMap);
    const snappedLatLng = this._lineSnapEnabled ? this._getSnappedLatLng(latlng, worldMap) : latlng;
    this._pendingLinePoints = [this._latLngToMapPixels(snappedLatLng, worldMap)];
    this._syncDraftRegionLayer(worldMap);
    this._syncDraftLineLayer(worldMap);
    this._syncLineVertexMarkers(worldMap);
    this.render(false);
    await this._openDraftLineInspector(this._editingLineStyle);
  }

  async _onSaveRegionEdit(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId || !this._editingRegionId || this._pendingRegionPoints.length < 3) return;
    await TheatreStore.upsertWorldMapRegion(this.mapId, {
      id: this._editingRegionId,
      ...(this._editingRegionStyle ?? {}),
      points: this._pendingRegionPoints
    });
    this._stopRegionEdit({ rerender: false });
    this._renderPreservingView();
  }

  async _onSaveLineEdit(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId || !this._editingLineId || this._pendingLinePoints.length < 2) return;
    await TheatreStore.upsertWorldMapLine(this.mapId, {
      id: this._editingLineId,
      ...(this._editingLineStyle ?? {}),
      points: this._pendingLinePoints
    });
    this._stopLineEdit({ rerender: false });
    this._renderPreservingView();
  }

  _onCancelLineEdit(event) {
    event.preventDefault();
    this._stopLineEdit();
  }

  async _onStyleLineEdit(event) {
    event.preventDefault();
    if (!this.mapId || !this._editingLineId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const line = worldMap?.lines?.find((entry) => entry.id === this._editingLineId);
    if (!line) return;
    await this._editLine({ ...line, ...(this._editingLineStyle ?? {}), points: this._pendingLinePoints });
  }

  _onCancelRegionEdit(event) {
    event.preventDefault();
    this._stopRegionEdit();
  }

  async _onStyleRegionEdit(event) {
    event.preventDefault();
    if (!this.mapId || !this._editingRegionId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const region = worldMap?.regions?.find((entry) => entry.id === this._editingRegionId);
    if (!region) return;
    await this._editRegion({ ...region, ...(this._editingRegionStyle ?? {}), points: this._pendingRegionPoints });
  }

  _onToggleRegionDrawMode(event) {
    event.preventDefault();
    this._stopRegionEdit({ rerender: false });
    this._stopLineEdit({ rerender: false });
    this._stopLineDraw({ rerender: false });
    this._isRegionDrawMode = !this._isRegionDrawMode;
    if (!this._isRegionDrawMode) {
      this._pendingRegionPoints = [];
      this._editingRegionStyle = null;
    }
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftRegionLayer(worldMap);
    this.render(false);
  }

  async _onFinishRegionDraw(event) {
    event.preventDefault();
    if (!this.mapId || this._pendingRegionPoints.length < 3) return;
    const draftRegion = { id: randomId(), ...this._createDefaultRegionDraft(TheatreStore.getWorldMapById(this.mapId)), ...(this._editingRegionStyle ?? {}), points: this._pendingRegionPoints };
    this._isRegionDrawMode = false;
    await this._editRegion(draftRegion);
  }

  _onCancelRegionDraw(event) {
    event.preventDefault();
    this._isRegionDrawMode = false;
    this._pendingRegionPoints = [];
    this._editingRegionStyle = null;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftRegionLayer(worldMap);
    this.render(false);
  }

  _onToggleRegionSnap(event) {
    event.preventDefault();
    this._regionSnapEnabled = !this._regionSnapEnabled;
    event.currentTarget?.classList?.toggle("is-active", this._regionSnapEnabled);
  }

  _onToggleLineSnap(event) {
    event.preventDefault();
    this._lineSnapEnabled = !this._lineSnapEnabled;
    event.currentTarget?.classList?.toggle("is-active", this._lineSnapEnabled);
  }

  async _onFinishLineDraw(event) {
    event.preventDefault();
    if (!this.mapId || this._pendingLinePoints.length < 2) return;
    const draftLine = { id: randomId(), ...this._createDefaultLineDraft(TheatreStore.getWorldMapById(this.mapId)), ...(this._editingLineStyle ?? {}), points: this._pendingLinePoints };
    this._isLineDrawMode = false;
    await this._editLine(draftLine);
  }

  _stopLineDraw({ rerender = true } = {}) {
    this._isLineDrawMode = false;
    this._pendingLinePoints = [];
    this._editingLineStyle = null;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftLineLayer(worldMap);
    if (rerender) this.render(false);
  }

  _onCancelLineDraw(event) {
    event.preventDefault();
    this._stopLineDraw();
  }

  async _onEditObjectOverlayFromList(event) {
    event.preventDefault();
    if (!this.mapId) return;
    const objectId = String(event.currentTarget?.dataset?.objectId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const entry = worldMap?.objectOverlays?.find((item) => item.id === objectId);
    if (!entry) return;
    await this._editObjectOverlay(entry);
  }

  async _onRemoveObjectOverlay(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const objectId = String(event.currentTarget?.dataset?.objectId || "").trim();
    if (!objectId) return;
    await TheatreStore.deleteWorldMapObjectOverlay(this.mapId, objectId);
    this._syncLeafletObjectOverlays(TheatreStore.getWorldMapById(this.mapId));
    this._renderPreservingView();
  }

  async _onEditRegionFromList(event) {
    event.preventDefault();
    if (!this.mapId) return;
    const regionId = String(event.currentTarget?.dataset?.regionId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const region = worldMap?.regions?.find((item) => item.id === regionId);
    if (!region) return;
    await this._editRegion(region);
  }

  async _onEditLineFromList(event) {
    event.preventDefault();
    if (!this.mapId) return;
    const lineId = String(event.currentTarget?.dataset?.lineId || "").trim();
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const line = worldMap?.lines?.find((item) => item.id === lineId);
    if (!line) return;
    await this._editLine(line);
  }

  async _onRemoveRegion(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const regionId = String(event.currentTarget?.dataset?.regionId || "").trim();
    if (!regionId) return;
    await TheatreStore.deleteWorldMapRegion(this.mapId, regionId);
    this._renderPreservingView();
  }

  async _onRemoveLine(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const lineId = String(event.currentTarget?.dataset?.lineId || "").trim();
    if (!lineId) return;
    await TheatreStore.deleteWorldMapLine(this.mapId, lineId);
    this._renderPreservingView();
  }

  _onCanvasDragOver(event) {
    event.preventDefault();
    event.currentTarget?.classList?.add("is-drop-target");
    event.originalEvent?.dataTransfer && (event.originalEvent.dataTransfer.dropEffect = "copy");
  }

  _onCanvasDragLeave(event) {
    event.currentTarget?.classList?.remove("is-drop-target");
  }

  async _onCanvasDrop(event) {
    event.preventDefault();
    event.currentTarget?.classList?.remove("is-drop-target");
    if (!game.user?.isGM || !this._leafletMap) return;
    const droppedDocument = await this._resolveDroppedWorldMapDocument(event);
    const documentType = String(droppedDocument?.documentName || "").trim();
    if (!["JournalEntry", "JournalEntryPage"].includes(documentType)) {
      if (droppedDocument) ui.notifications?.warn(tr("Only journal entries can be dropped onto the world map."));
      return;
    }
    const nativeEvent = event.originalEvent ?? event;
    const latlng = this._leafletMap.mouseEventToLatLng(nativeEvent);
    await this._createPinFromDroppedDocument(latlng, droppedDocument);
  }

  _onFitMap(event) {
    event.preventDefault();
    this._fitLeafletBounds();
  }

  async _onSaveCurrentView(event) {
    event.preventDefault();
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!this._leafletMap || !worldMap) return;
    const center = this._leafletMap.getCenter();
    const zoom = this._normalizeRasterTileZoom(this._leafletMap.getZoom(), worldMap);
    const point = this._latLngToMapPixels(center, worldMap);
    await TheatreStore.upsertWorldMap({
      id: worldMap.id,
      initialView: {
        x: point.x,
        y: point.y,
        zoom
      }
    });
    ui.notifications?.info(tr("World map start view saved."));
    this._renderPreservingView();
  }

  _onForceWorldMapWindow(event) {
    event.preventDefault();
    this._broadcastForcedWorldMapOpen("window");
  }

  _onForceWorldMapStage(event) {
    event.preventDefault();
    this._broadcastForcedWorldMapOpen("stage");
  }

  _broadcastForcedWorldMapOpen(mode) {
    if (!game.user?.isGM || !this.mapId) return;
    const normalizedMode = mode === "stage" ? "stage" : "window";
    this._hasForcedPlayerMapOpen = true;
    this._syncForcedMapButtons();
    game.socket?.emit?.(`module.${MODULE_ID}`, {
      action: "forceOpenWorldMap",
      mapId: this.mapId,
      mode: normalizedMode
    });
    ui.notifications?.info(tr(normalizedMode === "stage" ? "Players will open the fullscreen world map." : "Players will open the world map window."));
  }

  _syncForcedMapButtons() {
    const root = this.element?.[0];
    root?.querySelectorAll?.("[data-action='force-world-map-window'], [data-action='force-world-map-stage']").forEach((button) => {
      button.classList.toggle("is-awaiting-share", !this._hasForcedPlayerMapOpen);
    });
  }

  _onJumpToPin(event) {
    event.preventDefault();
    const pinId = String(event.currentTarget?.dataset?.pinId || "").trim();
    const marker = this._leafletMarkers.get(pinId);
    if (!marker || !this._leafletMap) return;
    const latlng = marker.getLatLng();
    this._leafletMap.setView(latlng, Math.max(this._leafletMap.getZoom(), 2));
    this._selectedPinId = pinId;
    marker.openTooltip();
  }

  async _onEditPinFromList(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const pinId = String(event.currentTarget?.dataset?.pinId || "").trim();
    if (!pinId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const pin = worldMap?.pins?.find((entry) => entry.id === pinId);
    if (!pin) return;
    await this._editPin(pin);
  }

  async _onRemovePin(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const pinId = String(event.currentTarget?.dataset?.pinId || "").trim();
    if (!pinId || !this.mapId) return;
    await TheatreStore.deleteWorldMapPin(this.mapId, pinId);
    if (this._selectedPinId === pinId) this._selectedPinId = null;
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  async close(options) {
    clearTimeout(this._resizeInvalidateTimeout);
    this._resizeInvalidateTimeout = null;
    this._destroyLeafletMap();
    globalThis.__TOM_WORLD_MAP_APP_INSTANCES?.delete?.(this);
    return super.close(options);
  }

  _fitLeafletBounds() {
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!this._leafletMap || !this._leafletBounds || !worldMap) return;
    this._leafletMap.invalidateSize(false);
    this._leafletMap.fitBounds(this._leafletBounds, {
      animate: false,
      padding: [24, 24]
    });
    const snappedZoom = this._normalizeRasterTileZoom(this._leafletMap.getZoom(), worldMap);
    if (snappedZoom !== this._leafletMap.getZoom()) {
      this._leafletMap.setZoom(snappedZoom, { animate: false });
    }
  }

  _onLeafletZoomChanged() {
    this._stopFogZoomRenderLoop();
    this._clearFogCanvasZoomTransform();
    this._fogZoomAnimation = null;
    this._fogTileViewportLockDuringZoom = false;
    this._fogTileZoomPhase = null;
    this._fogTileZoomOrigin = null;
    const zoom = this._leafletMap?.getZoom?.();
    this._leafletObjectOverlayMarkers.forEach((marker) => {
      this._applyObjectOverlayMarkerPresentation(marker, marker?._tomObjectEntry, zoom);
    });
    this._clearObjectOverlayAnimatedScale();
    this._renderFogCanvas();
  }

  _onLeafletZoomStart() {
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (!this._fogCanvas || !worldMap?.fogSettings?.enabled || this._shouldRenderFogDuringZoom(worldMap)) return;
    this._stopFogZoomRenderLoop();
    this._clearFogCanvasZoomTransform();
    this._fogZoomAnimation = null;
    this._renderFogCanvas();
    this._fogZoomAnimation = { transforming: true };
  }

  _onLeafletZoomAnimating(event) {
    this._applyObjectOverlayAnimatedScale(event?.zoom, true);
    if (this._fogAnimationFrame) {
      window.cancelAnimationFrame(this._fogAnimationFrame);
      this._fogAnimationFrame = null;
    }
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    if (this._shouldRenderFogDuringZoom(worldMap)) {
      this._fogTileViewportLockDuringZoom = Boolean(
        String(worldMap?.fogSettings?.mode || "color") === "image"
        && worldMap?.fogSettings?.imageTileFixedOnZoom
        && !worldMap?.fogSettings?.imageTileViewportLocked
      );
      this._startFogZoomRenderLoop(event);
      return;
    }
    const transformed = this._applyFogCanvasZoomTransform(event);
    this._fogZoomAnimation = transformed
      ? { transforming: true }
      : (Number.isFinite(Number(event?.zoom)) && event?.center ? { zoom: event.zoom, center: event.center } : null);
    if (transformed) return;
    this._fogAnimationFrame = window.requestAnimationFrame(() => {
      this._fogAnimationFrame = null;
      this._renderFogCanvas();
    });
  }

  _onLeafletZoomFrame() {
    this._applyObjectOverlayAnimatedScale(this._leafletMap?.getZoom?.(), false);
    if (this._fogZoomAnimation?.transforming) return;
    if (!this._fogZoomAnimation) this._renderFogCanvas();
  }

  _captureCurrentView() {
    if (!this._leafletMap) return null;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    return {
      center: this._leafletMap.getCenter(),
      zoom: this._normalizeRasterTileZoom(this._leafletMap.getZoom(), worldMap)
    };
  }

  _normalizeRasterTileZoom(zoom, worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    const numericZoom = Number(zoom);
    if (!Number.isFinite(numericZoom)) return Number(targetMap?.minZoom) || 0;
    const minZoomRaw = Number.isFinite(Number(targetMap?.minZoom)) ? Number(targetMap.minZoom) : numericZoom;
    const maxZoomRaw = Number.isFinite(Number(targetMap?.maxZoom)) ? Number(targetMap.maxZoom) : numericZoom;
    const minZoom = Math.ceil(minZoomRaw);
    const maxZoom = Math.floor(maxZoomRaw);
    if (minZoom <= maxZoom) {
      return Math.max(minZoom, Math.min(maxZoom, Math.round(numericZoom)));
    }
    return Math.max(minZoomRaw, Math.min(maxZoomRaw, numericZoom));
  }

  _consumePreservedView() {
    const preservedView = this._preservedView;
    this._preservedView = null;
    return preservedView;
  }

  _renderPreservingView() {
    this._preservedView = this._captureCurrentView();
    this.render(false);
  }

  _buildPinTooltipContent(pin) {
    const label = escapeHtml(String(pin?.label || tr("Pin")));
    const note = escapeHtml(String(pin?.note || ""));
    const linkedDocument = escapeHtml(String(pin?.documentName || ""));
    return `
      <div class="tom-world-map__tooltip-content">
        <div class="tom-world-map__tooltip-heading">${label}</div>
        ${note ? `<div class="tom-world-map__tooltip-text">${note.replace(/\n/g, "<br />")}</div>` : ""}
        ${linkedDocument ? `<div class="tom-world-map__tooltip-info">${tr("Linked document")}: ${linkedDocument}</div>` : ""}
      </div>
    `;
  }

  applyRemoteElementMove({ mapId, elementType, elementId, x, y } = {}) {
    if (!this._leafletMap || String(mapId || "") !== String(this.mapId || "")) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;

    if (elementType === "pin") {
      const marker = this._leafletMarkers.get(String(elementId || "").trim());
      if (!marker) return;
      const existingPin = worldMap.pins?.find((entry) => entry.id === elementId) ?? {};
      const nextPin = { ...existingPin, id: elementId, x, y };
      marker.setLatLng(this._mapPixelsToLatLng(x, y, worldMap));
      marker.setIcon(this._createMarkerIcon(nextPin));
      marker.bindTooltip(this._buildPinTooltipContent(nextPin), {
        direction: "top",
        className: "tom-world-map__tooltip",
        opacity: 0.98
      });
      return;
    }

    if (elementType === "objectOverlay") {
      const marker = this._leafletObjectOverlayMarkers.get(String(elementId || "").trim());
      if (!marker) return;
      const existingEntry = worldMap.objectOverlays?.find((entry) => entry.id === elementId) ?? marker._tomObjectEntry ?? {};
      const nextEntry = { ...existingEntry, id: elementId, x, y };
      marker.setLatLng(this._mapPixelsToLatLng(x, y, worldMap));
      marker._tomObjectEntry = nextEntry;
      this._refreshObjectOverlayMarker(marker, nextEntry, this._leafletMap?.getZoom?.());
    }
  }

  async _resolveDroppedWorldMapDocument(event) {
    const nativeEvent = event?.originalEvent ?? event;
    const dragData = globalThis.TextEditor?.getDragEventData?.(nativeEvent) ?? null;
    let document = null;
    if (dragData?.uuid && typeof fromUuid === "function") {
      document = await fromUuid(dragData.uuid);
    }
    if (!document) {
      const raw = nativeEvent?.dataTransfer?.getData?.("text/plain");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.uuid && typeof fromUuid === "function") {
            document = await fromUuid(parsed.uuid);
          }
        } catch (_error) {
          // ignore unsupported drops
        }
      }
    }
    return document?.document ?? document ?? null;
  }

  async _createPinFromDroppedDocument(latlng, document) {
    if (!game.user?.isGM || !this.mapId || !document || !latlng) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    const defaultPinType = this._getPinTypeDefinition("poi", worldMap).value;
    const fallbackLabel = String(document.name || tr("Pin {index}", { index: (worldMap.pins?.length ?? 0) + 1 })).trim();
    const pinData = await this._promptForPinData({
      label: fallbackLabel,
      note: "",
      type: defaultPinType,
      color: "#b298ff",
      size: 1,
      borderColor: "#101722",
      borderWidth: 0,
      shadowColor: "#000000",
      shadowDistance: 2,
      shadowOpacity: 0.55,
      shadowBlur: 4,
      movableForPlayers: false,
      documentUuid: String(document.uuid || "").trim(),
      documentName: String(document.name || "").trim(),
      documentType: String(document.documentName || "").trim()
    });
    if (!pinData) return;
    const point = this._latLngToMapPixels(latlng, worldMap);
    const pin = await TheatreStore.upsertWorldMapPin(worldMap.id, {
      id: randomId(),
      label: String(pinData.label || "").trim() || fallbackLabel,
      note: String(pinData.note || "").trim(),
      type: pinData.type,
      color: pinData.color,
      size: pinData.size,
      borderColor: pinData.borderColor,
      borderWidth: pinData.borderWidth,
      shadowColor: pinData.shadowColor,
      shadowDistance: pinData.shadowDistance,
      shadowOpacity: pinData.shadowOpacity,
      shadowBlur: pinData.shadowBlur,
      documentUuid: pinData.documentUuid,
      documentType: pinData.documentType,
      documentName: pinData.documentName,
      movableForPlayers: pinData.movableForPlayers,
      x: point.x,
      y: point.y
    });
    this._selectedPinId = pin?.id ?? null;
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  async _openPinDocument(pin) {
    await this._openLinkedMapDocument(pin);
  }

  async _openObjectOverlayDocument(entry) {
    await this._openLinkedMapDocument(entry);
  }

  async _openLinkedMapDocument(entry) {
    const documentUuid = String(entry?.documentUuid || "").trim();
    if (!documentUuid || typeof fromUuid !== "function") return;
    const document = await fromUuid(documentUuid);
    if (!document) {
      ui.notifications?.warn(tr("Linked document not found."));
      return;
    }
    if (document.sheet?.render) {
      document.sheet.render(true);
      return;
    }
    if (document.actor?.sheet?.render) {
      document.actor.sheet.render(true);
      return;
    }
    if (document.parent?.sheet?.render) {
      document.parent.sheet.render(true);
    }
  }
}
