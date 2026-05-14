import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, duplicateData, escapeHtml, openImagePickerForInput, randomId, readTransferJson, themeFontFamilyToCss, themeSizeToCss, themeStopToCss } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { ensureLeaflet } from "../vendor/leaflet-loader.js";
import { getWorldMapCategoryDefinition, getWorldMapCategoryDefinitions, getWorldMapCategoryLabel, getWorldMapCategoryOptions } from "../world-map/category-utils.js";
import { createClosedContextMenuState, createContextMenuStateFromLeafletEvent, getWorldMapContextTarget } from "../world-map/context-utils.js";
import { readLineDataFromDialog, readObjectOverlayDataFromDialog, readPinDataFromDialog, readRegionDataFromDialog } from "../world-map/dialog-data-utils.js";
import { buildLineDialogContent, buildObjectOverlayDialogContent, buildPinDialogContent, buildRegionDialogContent } from "../world-map/dialog-markup-utils.js";
import { bindObjectOverlayTextPreview } from "../world-map/dialog-preview-utils.js";
import { applyWorldMapDialogTheme, applyWorldMapLineEditorTheme, applyWorldMapRegionEditorTheme, bindDialogLiveChange } from "../world-map/dialog-ui-utils.js";
import { getWorldMapDragItemCount, isSupportedLinkedWorldMapDocument, openLinkedWorldMapDocument, resolveDroppedWorldMapDocument } from "../world-map/document-utils.js";
import { buildDuplicatedWorldMapElement, buildMovedWorldMapElement, createDefaultLineDraft, createDefaultObjectOverlayDraft, createDefaultRegionDraft, findWorldMapElement, getWorldMapElementOperation } from "../world-map/element-utils.js";
import { FOG_DEFAULTS, calculateFogCanvasMetrics, calculateFogImageTileContainerSize, normalizeFogAction, normalizeFogBrushSize, normalizeFogFeather, normalizeFogTool, positiveModulo } from "../world-map/fog-utils.js";
import { buildSelectOptions } from "../world-map/form-markup-utils.js";
import { getClosestPointOnSegment } from "../world-map/geometry-utils.js";
import { activateLinkedDocumentDrop, activateTravelTargetControls, buildWorldMapSidebarTooltip, buildWorldMapTooltipContent } from "../world-map/markup-utils.js";
import { buildPinIconPresentation, buildPinShadowStyle, getLineBasePresentation, getLineOutlinePresentation, getLinePointPresentation, getLineShadowFilter, getRegionPatternPresentation, getRegionPresentation } from "../world-map/presentation-utils.js";
import { buildTextPresentationStyle, getLineDashArray, hexToRgba, normalizeHexColor, normalizePinSize } from "../world-map/style-utils.js";

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
    this._initialInvalidateTimeout = null;
    this._leafletOverlayLayers = new Map();
    this._leafletObjectOverlayMarkers = new Map();
    this._objectOverlayImageRatioCache = new Map();
    this._objectOverlayPresentationFrames = new Set();
    this._objectOverlayPresentationTimeouts = new Set();
    this._leafletRegionLayers = new Map();
    this._leafletRegionVertexMarkers = [];
    this._leafletDraftRegionLayer = null;
    this._leafletLineLayers = new Map();
    this._leafletLinePointMarkers = [];
    this._leafletDraftLineLayer = null;
    this._leafletDraftLineOutlineLayer = null;
    this._leafletLineVertexMarkers = [];
    this._leafletEditGridLayer = null;
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
    this._editGridVisible = false;
    this._editGridSize = 50;
    this._fogCanvas = null;
    this._fogImage = null;
    this._fogImagePath = "";
    this._fogToolbarOpen = false;
    this._fogTool = FOG_DEFAULTS.tool;
    this._fogAction = FOG_DEFAULTS.action;
    this._fogBrushSize = FOG_DEFAULTS.brushSize;
    this._fogFeather = FOG_DEFAULTS.feather;
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
    this._dialogSetupTimeouts = new Set();
    this._leafletTileErrorWorldMap = null;
    this._actionChoiceMenuElement = null;
    this._actionChoiceMenuOutsideHandler = null;
    this._boundUiHandlers = new Map();
    this._boundFogImageLoad = this._onFogImageLoad.bind(this);
    this._boundLeafletTileError = this._onLeafletTileError.bind(this);
    this._boundLeafletMapEvents = {
      click: this._onLeafletMapClick.bind(this),
      dblclick: this._onLeafletMapDoubleClick.bind(this),
      contextmenu: this._onLeafletMapContextMenu.bind(this),
      zoomstart: this._onLeafletZoomStart.bind(this),
      zoomanim: this._onLeafletZoomAnimating.bind(this),
      zoom: this._onLeafletZoomFrame.bind(this),
      viewportchange: this._onLeafletViewportChange.bind(this),
      zoomend: this._onLeafletZoomChanged.bind(this)
    };
    this._boundFogCanvasListeners = {
      pointerdown: this._onFogPointerDown.bind(this),
      pointermove: this._onFogPointerMove.bind(this),
      pointerup: this._onFogPointerUp.bind(this),
      pointerleave: this._onFogPointerLeave.bind(this),
      pointerenter: this._onFogPointerMove.bind(this),
      contextmenu: this._onFogCanvasContextMenu.bind(this)
    };
    this._contextMenuState = createClosedContextMenuState();
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
      this._scheduleLeafletSizeInvalidation(80);
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
          sidebarTooltip: buildWorldMapSidebarTooltip([pin.note], { documentName: pin.documentName }),
          color: normalizeHexColor(pin.color),
          size: normalizePinSize(pin.size),
          borderColor: normalizeHexColor(pin.borderColor, "#101722"),
          borderWidth: Math.max(0, Math.min(8, Number(pin.borderWidth) || 0)),
          iconBorderStyle: Number(pin.borderWidth) > 0
            ? `-webkit-text-stroke:${Math.max(0, Math.min(8, Number(pin.borderWidth) || 0))}px ${normalizeHexColor(pin.borderColor, "#101722")}; paint-order:stroke fill;`
            : "",
          iconShadowStyle: buildPinShadowStyle(pin),
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
          tooltip: buildWorldMapSidebarTooltip([
            this._getObjectCategoryLabel(entry.category, worldMap),
            entry.type === "image" ? tr("Image object") : tr("Text object"),
            entry.type === "text" ? String(entry.text || "").trim() : "",
            entry.scaleWithZoom ? tr("Scale with zoom") : ""
          ], { documentName: entry.documentName }),
          isImage: entry.type === "image",
          isText: entry.type === "text"
        }))
      : [];
    const regions = Array.isArray(worldMap?.regions)
      ? worldMap.regions.map((entry) => ({
          ...entry,
          categoryLabel: this._getRegionCategoryLabel(entry.category, worldMap),
          tooltip: buildWorldMapSidebarTooltip([
            `${this._getRegionCategoryLabel(entry.category, worldMap)} - ${entry.points?.length ?? 0} ${tr("point(s)")}`
          ], { documentName: entry.documentName })
        }))
      : [];
    const lines = Array.isArray(worldMap?.lines)
      ? worldMap.lines.map((entry) => ({
          ...entry,
          categoryLabel: this._getPinTypeDefinition(entry.category, worldMap).label,
          tooltip: buildWorldMapSidebarTooltip([
            `${this._getPinTypeDefinition(entry.category, worldMap).label} - ${tr("Line")} - ${entry.points?.length ?? 0} ${tr("point(s)")}`
          ], { documentName: entry.documentName })
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
      isEditGridVisible: this._editGridVisible,
      editGridSize: this._editGridSize,
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
    this._bindMapChromeListeners(html);
    this._bindPinSidebarListeners(html);
    this._bindFogToolbarListeners(html);
    this._bindCategoryAndOverlayListeners(html);
    this._bindDrawingModeListeners(html);
    this._bindElementListListeners(html);
    this._bindContextMenuListeners(html);
    this._bindCanvasInteractionListeners(html);
    void this._initializeLeafletMap();
  }

  _bindMapChromeListeners(html) {
    this._bindUiActionMap(html, [
      ["toggle-map-right-sidebar", "_onToggleRightSidebar"],
      ["fit-world-map", "_onFitMap"],
      ["save-world-map-view", "_onSaveCurrentView"],
      ["force-world-map-window", "_onForceWorldMapWindow"],
      ["force-world-map-stage", "_onForceWorldMapStage"]
    ]);
  }

  _bindPinSidebarListeners(html) {
    this._bindUiEvent(html, "[data-action='jump-to-pin']", "click", "_onJumpToPin");
    this._bindUiEvent(html, "[data-action='jump-to-pin']", "dblclick", "_onEditPinFromList");
    this._bindUiEvent(html, "[data-world-map-pin-filter]", "input change", "_onPinSidebarFilterInput");
    this._applyPinSidebarFilters();
    this._bindUiActionMap(html, [
      ["remove-map-pin", "_onRemovePin"],
      ["toggle-map-pin-visibility", "_onTogglePinVisibility"],
      ["toggle-map-object-overlay-visibility", "_onToggleObjectOverlayVisibility"],
      ["toggle-map-region-visibility", "_onToggleRegionVisibility"]
    ]);
    this._bindSidebarTooltipListeners(html);
  }

  _bindFogToolbarListeners(html) {
    this._bindUiActionMap(html, [
      ["toggle-map-fog-toolbar", "_onToggleFogToolbar"],
      ["set-map-fog-tool", "_onSetFogTool"],
      ["set-map-fog-action", "_onSetFogAction"],
      ["finish-map-fog-polygon", "_onFinishFogPolygon"],
      ["cancel-map-fog-polygon", "_onCancelFogPolygon"],
      ["clear-map-fog", "_onClearFogOperations"],
      ["toggle-map-fog-gm-preview", "_onToggleFogGmPreview"]
    ]);
    this._bindUiEvent(html, "[data-fog-control='brush-size']", "input change", "_onFogBrushSizeInput");
    this._bindUiEvent(html, "[data-fog-control='feather']", "input change", "_onFogFeatherInput");
  }

  _bindCategoryAndOverlayListeners(html) {
    this._bindUiActionMap(html, [
      ["toggle-category-visibility", "_onToggleCategoryVisibility"],
      ["toggle-category-lock", "_onToggleCategoryLock"],
      ["toggle-map-overlay", "_onToggleOverlay"]
    ]);
  }

  _bindDrawingModeListeners(html) {
    this._bindUiActionMap(html, [
      ["toggle-region-draw-mode", "_onToggleRegionDrawMode"],
      ["finish-region-draw", "_onFinishRegionDraw"],
      ["cancel-region-draw", "_onCancelRegionDraw"],
      ["toggle-region-snap", "_onToggleRegionSnap"],
      ["finish-line-draw", "_onFinishLineDraw"],
      ["cancel-line-draw", "_onCancelLineDraw"],
      ["toggle-line-snap", "_onToggleLineSnap"],
      ["toggle-map-edit-grid", "_onToggleEditGrid"],
      ["save-line-edit", "_onSaveLineEdit"],
      ["cancel-line-edit", "_onCancelLineEdit"],
      ["style-line-edit", "_onStyleLineEdit"],
      ["save-region-edit", "_onSaveRegionEdit"],
      ["cancel-region-edit", "_onCancelRegionEdit"],
      ["style-region-edit", "_onStyleRegionEdit"]
    ]);
  }

  _bindElementListListeners(html) {
    this._bindUiActionMap(html, [
      ["create-map-image-object", "_onCreateImageObjectAtCenter"],
      ["create-map-text-object", "_onCreateTextObjectAtCenter"],
      ["edit-map-object-overlay", "_onEditObjectOverlayFromList"],
      ["remove-map-object-overlay", "_onRemoveObjectOverlay"],
      ["edit-map-region", "_onEditRegionFromList"],
      ["remove-map-region", "_onRemoveRegion"],
      ["edit-map-line", "_onEditLineFromList"],
      ["remove-map-line", "_onRemoveLine"]
    ]);
  }

  _bindContextMenuListeners(html) {
    this._bindUiActionMap(html, [
      ["create-map-pin-at-context", "_onCreatePinAtContextMenu"],
      ["create-map-image-at-context", "_onCreateImageAtContextMenu"],
      ["create-map-text-at-context", "_onCreateTextAtContextMenu"],
      ["start-map-region-at-context", "_onStartRegionAtContextMenu"],
      ["start-map-line-at-context", "_onStartLineAtContextMenu"],
      ["edit-map-context-target", "_onEditContextTarget"],
      ["edit-map-context-line-points", "_onEditContextLinePoints"],
      ["edit-map-context-region-points", "_onEditContextRegionPoints"],
      ["duplicate-map-context-target", "_onDuplicateContextTarget"],
      ["delete-map-context-target", "_onDeleteContextTarget"]
    ]);
  }

  _bindCanvasInteractionListeners(html) {
    this._bindUiEvent(html, ".tom-world-map__viewport", "mousedown", "_onViewportMouseDown");
    this._bindUiEvent(html, "[data-world-map-canvas]", "dragenter dragover", "_onCanvasDragOver");
    this._bindUiEvent(html, "[data-world-map-canvas]", "dragleave", "_onCanvasDragLeave");
    this._bindUiEvent(html, "[data-world-map-canvas]", "drop", "_onCanvasDrop");
    this._bindUiEvent(html, "[data-map-edit-grid-size]", "input change", "_onEditGridSizeInput");
  }

  _bindSidebarTooltipListeners(html) {
    html.find("[data-world-map-sidebar-tooltip]")
      .on("mouseenter focusin", this._getBoundUiHandler("_onSidebarTooltipEnter"))
      .on("mousemove", this._getBoundUiHandler("_onSidebarTooltipMove"))
      .on("mouseleave focusout click", this._getBoundUiHandler("_onSidebarTooltipLeave"));
  }

  _bindUiActionMap(html, entries, eventName = "click") {
    for (const [action, methodName] of entries) {
      this._bindUiEvent(html, `[data-action='${action}']`, eventName, methodName);
    }
  }

  _bindUiEvent(html, selector, eventName, methodName) {
    html.find(selector).on(eventName, this._getBoundUiHandler(methodName));
  }

  _getBoundUiHandler(methodName) {
    if (!this._boundUiHandlers.has(methodName)) {
      const handler = this[methodName];
      if (typeof handler !== "function") {
        throw new Error(`${MODULE_ID} | Missing world map UI handler: ${methodName}`);
      }
      this._boundUiHandlers.set(methodName, handler.bind(this));
    }
    return this._boundUiHandlers.get(methodName);
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

    const map = this._createLeafletMap(L, container, worldMap);
    this._createLeafletEditPane(map);
    this._configureLeafletBounds(map, worldMap);
    this._createLeafletTileLayer(L, map, worldMap);
    this._bindLeafletMapEvents(map);
    this._leafletMap = map;
    this._applyMapView(worldMap);
    this._syncInitialLeafletLayers(worldMap);
    this._observeViewportResize(container);
    this._scheduleLeafletInitialSizeInvalidation(map);
  }

  _getLeafletWheelPxPerZoomLevel(worldMap) {
    const wheelStep = Number(worldMap?.zoomStep) || 0.25;
    return Math.max(30, Math.min(480, Math.round(60 / Math.max(0.05, wheelStep))));
  }

  _createLeafletMap(L, container, worldMap) {
    return L.map(container, {
      crs: L.CRS.Simple,
      minZoom: worldMap.minZoom,
      maxZoom: worldMap.maxZoom,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: this._getLeafletWheelPxPerZoomLevel(worldMap),
      zoomControl: true,
      attributionControl: false,
      doubleClickZoom: false,
      scrollWheelZoom: true,
      dragging: true,
      keyboard: true
    });
  }

  _createLeafletEditPane(map) {
    const gridPane = map.createPane?.("tom-world-map-grid-pane");
    if (gridPane) {
      gridPane.style.zIndex = "610";
      gridPane.style.pointerEvents = "none";
    }
    const editPane = map.createPane?.("tom-world-map-edit-pane");
    if (!editPane) return;
    editPane.style.zIndex = "920";
    editPane.style.pointerEvents = "auto";
  }

  _configureLeafletBounds(map, worldMap) {
    const bounds = this._buildLeafletBounds(map, worldMap);
    this._leafletBounds = bounds;
    map.setMaxBounds(bounds);
    map.options.maxBoundsViscosity = 1;
    return bounds;
  }

  _createLeafletTileLayer(L, map, worldMap) {
    this._leafletTileErrorWorldMap = worldMap;
    this._leafletLayer = L.tileLayer(worldMap.tileUrlTemplate, {
      tileSize: worldMap.tileSize,
      minZoom: worldMap.minZoom,
      maxZoom: worldMap.maxZoom,
      maxNativeZoom: worldMap.maxNativeZoom,
      noWrap: true,
      bounds: this._leafletBounds
    }).addTo(map);
    this._leafletLayer.on("tileerror", this._boundLeafletTileError);
    return this._leafletLayer;
  }

  _onLeafletTileError(event) {
    const worldMap = this._leafletTileErrorWorldMap;
    const failedUrl = String(event?.tile?.src || worldMap?.tileUrlTemplate || "").trim();
    console.warn(`${MODULE_ID} | World map tile failed to load`, failedUrl);
    ui.notifications?.warn(tr("World map tiles could not be loaded. Please verify the generated tile path."));
  }

  _bindLeafletMapEvents(map) {
    map.on("click", this._boundLeafletMapEvents.click);
    map.on("dblclick", this._boundLeafletMapEvents.dblclick);
    map.on("contextmenu", this._boundLeafletMapEvents.contextmenu);
    map.on("zoomstart", this._boundLeafletMapEvents.zoomstart);
    map.on("zoomanim", this._boundLeafletMapEvents.zoomanim);
    map.on("zoom", this._boundLeafletMapEvents.zoom);
    map.on("move resize moveend", this._boundLeafletMapEvents.viewportchange);
    map.on("zoomend", this._boundLeafletMapEvents.zoomend);
  }

  _unbindLeafletMapEvents(map) {
    if (!map) return;
    map.off("click", this._boundLeafletMapEvents.click);
    map.off("dblclick", this._boundLeafletMapEvents.dblclick);
    map.off("contextmenu", this._boundLeafletMapEvents.contextmenu);
    map.off("zoomstart", this._boundLeafletMapEvents.zoomstart);
    map.off("zoomanim", this._boundLeafletMapEvents.zoomanim);
    map.off("zoom", this._boundLeafletMapEvents.zoom);
    map.off("move resize moveend", this._boundLeafletMapEvents.viewportchange);
    map.off("zoomend", this._boundLeafletMapEvents.zoomend);
  }

  _onLeafletViewportChange() {
    this._renderFogCanvasAfterViewportChange();
  }

  _syncInitialLeafletLayers(worldMap) {
    this._syncLeafletOverlays(worldMap);
    this._syncLeafletObjectOverlays(worldMap);
    this._syncLeafletRegions(worldMap);
    this._syncLeafletLines(worldMap);
    this._syncLeafletPins();
    this._syncEditGridLayer(worldMap);
    this._syncFogCanvas(worldMap);
  }

  _scheduleLeafletInitialSizeInvalidation(map) {
    this._clearLeafletInitialSizeInvalidation();
    this._initialInvalidateTimeout = window.setTimeout(() => {
      this._initialInvalidateTimeout = null;
      map?.invalidateSize?.(false);
    }, 120);
  }

  _scheduleLeafletSizeInvalidation(delay = 60) {
    this._clearLeafletSizeInvalidation();
    this._resizeInvalidateTimeout = window.setTimeout(() => {
      this._resizeInvalidateTimeout = null;
      this._leafletMap?.invalidateSize?.(false);
    }, delay);
  }

  _clearLeafletSizeInvalidation() {
    if (!this._resizeInvalidateTimeout) return;
    window.clearTimeout(this._resizeInvalidateTimeout);
    this._resizeInvalidateTimeout = null;
  }

  _clearLeafletInitialSizeInvalidation() {
    if (!this._initialInvalidateTimeout) return;
    window.clearTimeout(this._initialInvalidateTimeout);
    this._initialInvalidateTimeout = null;
  }

  _scheduleDialogSetup(callback, delay = 30) {
    if (typeof callback !== "function") return null;
    const timeoutId = window.setTimeout(() => {
      this._dialogSetupTimeouts.delete(timeoutId);
      callback();
    }, delay);
    this._dialogSetupTimeouts.add(timeoutId);
    return timeoutId;
  }

  _clearDialogSetupTimeouts() {
    for (const timeoutId of this._dialogSetupTimeouts) {
      window.clearTimeout(timeoutId);
    }
    this._dialogSetupTimeouts.clear();
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
    this._closeActionChoiceMenu();
    this._viewportResizeObserver?.disconnect?.();
    this._viewportResizeObserver = null;
    this._clearObjectOverlayPresentationQueue();
    this._clearLeafletSizeInvalidation();
    this._clearLeafletInitialSizeInvalidation();
    this._clearDialogSetupTimeouts();
    this._clearDraftRegionLayer();
    this._clearRegionVertexMarkers();
    this._clearDraftLineLayer();
    this._clearLinePointMarkers();
    this._clearLineVertexMarkers();
    this._clearEditGridLayer();
    this._destroyFogCanvas();
    this._clearFogImage();
    this._clearLeafletOverlayLayers();
    if (this._leafletMap) {
      this._leafletLayer?.off?.("tileerror", this._boundLeafletTileError);
      this._unbindLeafletMapEvents(this._leafletMap);
      this._leafletMap.remove();
      this._leafletMap = null;
    }
    this._leafletLayer = null;
    this._leafletTileErrorWorldMap = null;
    this._leafletObjectOverlayMarkers = new Map();
    this._leafletRegionLayers = new Map();
    this._leafletRegionVertexMarkers = [];
    this._leafletDraftRegionLayer = null;
    this._leafletLineLayers = new Map();
    this._leafletLinePointMarkers = [];
    this._leafletDraftLineLayer = null;
    this._leafletDraftLineOutlineLayer = null;
    this._leafletLineVertexMarkers = [];
    this._leafletEditGridLayer = null;
    this._leafletMarkers = new Map();
    this._leafletBounds = null;
  }

  _observeViewportResize(container) {
    this._viewportResizeObserver?.disconnect?.();
    if (!(container instanceof HTMLElement) || typeof ResizeObserver !== "function") return;
    this._viewportResizeObserver = new ResizeObserver(() => {
      if (!this._leafletMap) return;
      this._scheduleLeafletSizeInvalidation(60);
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
    if (this._fogCanvas) {
      for (const [eventName, listener] of Object.entries(this._boundFogCanvasListeners ?? {})) {
        this._fogCanvas.removeEventListener(eventName, listener);
      }
    }
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

  _clearFogImage() {
    if (this._fogImage) {
      this._fogImage.onload = null;
    }
    this._fogImage = null;
    this._fogImagePath = "";
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
    for (const [eventName, listener] of Object.entries(this._boundFogCanvasListeners)) {
      canvas.addEventListener(eventName, listener);
    }
    this._loadFogImage(targetMap.fogSettings);
    this._renderFogCanvas();
    this._syncFogPolygonVertexMarkers(targetMap);
  }

  _onFogCanvasContextMenu(event) {
    if (!this._fogToolbarOpen || this._fogTool !== "polygon") return;
    event.preventDefault();
    const index = this._getFogPolygonHandleIndexFromEvent(event);
    if (index >= 0) {
      this._fogPolygonPoints.splice(index, 1);
      this._fogDraggedPolygonPointIndex = null;
      this._renderFogCanvas();
      const targetMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
      this._syncFogPolygonVertexMarkers(targetMap);
      this._updateFogToolbarState();
      return;
    }
    this._onCancelFogPolygon(event);
  }

  _clearFogPolygonVertexMarkers() {
    this._clearLeafletLayerArray("_fogPolygonVertexMarkers");
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
      this._clearFogImage();
      return;
    }
    if (this._fogImagePath === imagePath && this._fogImage) return;
    this._clearFogImage();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = this._boundFogImageLoad;
    image.src = imagePath;
    this._fogImage = image;
    this._fogImagePath = imagePath;
  }

  _onFogImageLoad(event) {
    if (event?.currentTarget && event.currentTarget !== this._fogImage) return;
    this._renderFogCanvas();
  }

  _resizeFogCanvasToMap() {
    if (!this._fogCanvas || !this._leafletMap) return null;
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const size = this._leafletMap.getSize();
    const { padding, width, height, ratio, pixelWidth, pixelHeight } = calculateFogCanvasMetrics({
      viewportWidth: size.x,
      viewportHeight: size.y,
      zoomStep: worldMap?.zoomStep,
      devicePixelRatio: window.devicePixelRatio || 1
    });
    this._fogCanvasPadding = padding;
    if (this._fogCanvas.width !== pixelWidth || this._fogCanvas.height !== pixelHeight) {
      this._fogCanvas.width = pixelWidth;
      this._fogCanvas.height = pixelHeight;
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

  _getFogImageTileContainerSize(fogSettings, worldMap) {
    return calculateFogImageTileContainerSize(fogSettings, this._getFogMapToContainerScale(worldMap));
  }

  _drawFogImageTiles(context, worldMap, fogSettings, width, height, opacity) {
    if (!this._fogImage?.complete || this._fogImage.naturalWidth <= 0) return false;
    const tileSize = this._getFogImageTileContainerSize(fogSettings, worldMap);
    const padding = Number(this._fogCanvasPadding) || 0;
    const origin = this._fogTileZoomOrigin
      ?? (fogSettings?.imageTileFixedOnZoom && (fogSettings?.imageTileViewportLocked || this._fogTileViewportLockDuringZoom)
        ? { x: padding, y: padding }
        : (this._mapPointToContainerPoint({ x: 0, y: 0 }, worldMap) ?? { x: 0, y: 0 }));
    const offsetX = positiveModulo(origin.x, tileSize);
    const offsetY = positiveModulo(origin.y, tileSize);
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
        tool: FOG_DEFAULTS.tool,
        action: this._fogAction,
        points: this._fogActiveBrushPoints,
        radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, FOG_DEFAULTS.brushSize),
        feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, FOG_DEFAULTS.feather)
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
    const radius = Math.max(1, Number(this._fogBrushSize) || FOG_DEFAULTS.brushSize);
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
      x: positiveModulo(Number(origin.x) || 0, tileSize),
      y: positiveModulo(Number(origin.y) || 0, tileSize),
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
      deltaX: positiveModulo(target.x - start.x + (start.tileSize / 2), start.tileSize) - (start.tileSize / 2),
      deltaY: positiveModulo(target.y - start.y + (start.tileSize / 2), start.tileSize) - (start.tileSize / 2),
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
    return getWorldMapCategoryOptions(targetMap ?? {}, { fallbackLabel: tr("Category") });
  }

  _getPinTypeDefinitions(worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    return getWorldMapCategoryDefinitions(targetMap ?? {}, { fallbackLabel: tr("Category") });
  }

  _getPinTypeDefinition(type, worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    return getWorldMapCategoryDefinition(targetMap ?? {}, type, { fallbackLabel: tr("Location") });
  }

  _getObjectCategoryOptions(worldMap = null) {
    return this._getCategoryOptions(worldMap);
  }

  _getRegionCategoryOptions(worldMap = null) {
    return this._getCategoryOptions(worldMap);
  }

  _getObjectCategoryLabel(categoryId, worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    return getWorldMapCategoryLabel(targetMap ?? {}, categoryId, tr("General"));
  }

  _getRegionCategoryLabel(categoryId, worldMap = null) {
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    return getWorldMapCategoryLabel(targetMap ?? {}, categoryId, tr("General"));
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
    this._contextMenuState = createClosedContextMenuState();
    this._updateContextMenuElement();
    if (rerender && !this._contextMenuElement) this.render(false);
  }

  _closeActionChoiceMenu() {
    this._actionChoiceMenuElement?.remove?.();
    this._actionChoiceMenuElement = null;
    if (this._actionChoiceMenuOutsideHandler) {
      document.removeEventListener("pointerdown", this._actionChoiceMenuOutsideHandler, true);
      document.removeEventListener("keydown", this._actionChoiceMenuOutsideHandler, true);
      this._actionChoiceMenuOutsideHandler = null;
    }
  }

  _openWorldMapActionChoiceMenu(event, entry = {}) {
    this._closeActionChoiceMenu();
    const parent = this._contextMenuElement?.parentElement
      ?? this.element?.[0]?.querySelector?.(".tom-world-map__map")
      ?? this.element?.[0];
    if (!(parent instanceof HTMLElement)) return;

    const nativeEvent = event?.originalEvent ?? event;
    const containerPoint = this._leafletMap?.mouseEventToContainerPoint?.(nativeEvent);
    const x = Math.max(12, Number(containerPoint?.x) || 12);
    const y = Math.max(12, Number(containerPoint?.y) || 12);
    const menu = document.createElement("div");
    menu.className = "tom-world-map__action-choice-menu tom-theme-container";
    menu.innerHTML = `
      <button type="button" class="tom-world-map__context-action" data-action-choice="travel"><i class="fas fa-route" aria-hidden="true"></i><span>${escapeHtml(tr("Travel"))}</span></button>
      <button type="button" class="tom-world-map__context-action" data-action-choice="info"><i class="fas fa-circle-info" aria-hidden="true"></i><span>${escapeHtml(tr("Info"))}</span></button>
    `;
    parent.appendChild(menu);
    const maxX = Math.max(12, parent.clientWidth - menu.offsetWidth - 12);
    const maxY = Math.max(12, parent.clientHeight - menu.offsetHeight - 12);
    menu.style.left = `${Math.min(x, maxX)}px`;
    menu.style.top = `${Math.min(y, maxY)}px`;
    menu.addEventListener("click", async (choiceEvent) => {
      const button = choiceEvent.target?.closest?.("[data-action-choice]");
      if (!(button instanceof HTMLElement)) return;
      choiceEvent.preventDefault();
      choiceEvent.stopPropagation();
      const choice = String(button.dataset.actionChoice || "").trim();
      this._closeActionChoiceMenu();
      if (choice === "travel") {
        await this._activateWorldMapTravelTarget(entry);
        return;
      }
      if (choice === "info") await this._openLinkedMapDocument(entry);
    });
    this._actionChoiceMenuOutsideHandler = (outsideEvent) => {
      if (outsideEvent.type === "keydown" && outsideEvent.key !== "Escape") return;
      if (menu.contains(outsideEvent.target)) return;
      this._closeActionChoiceMenu();
    };
    window.setTimeout(() => {
      document.addEventListener("pointerdown", this._actionChoiceMenuOutsideHandler, true);
      document.addEventListener("keydown", this._actionChoiceMenuOutsideHandler, true);
    }, 0);
    this._actionChoiceMenuElement = menu;
  }

  _updateContextMenuElement() {
    const element = this._contextMenuElement ?? this.element?.[0]?.querySelector?.(".tom-world-map__context-menu");
    if (!element) return;
    this._contextMenuElement = element;
    if (!this._contextMenuState.isOpen) {
      element.classList.remove("is-visible");
      element.classList.remove("is-edit-menu");
      element.classList.remove("is-region-target");
      element.classList.remove("is-line-target");
      element.style.left = "0px";
      element.style.top = "0px";
      return;
    }
    element.style.left = `${Math.round(this._contextMenuState.x)}px`;
    element.style.top = `${Math.round(this._contextMenuState.y)}px`;
    element.classList.toggle("is-edit-menu", this._contextMenuState.mode === "edit");
    element.classList.toggle("is-region-target", this._contextMenuState.targetType === "region");
    element.classList.toggle("is-line-target", this._contextMenuState.targetType === "line");
    element.classList.add("is-visible");
  }

  _openElementContextMenu(event, targetType, targetId) {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    this._closeActionChoiceMenu();
    if (!game.user?.isGM) return;
    this._contextMenuState = createContextMenuStateFromLeafletEvent(event, this._leafletMap, {
      mode: "edit",
      targetType,
      targetId
    });
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
      const closest = getClosestPointOnSegment(pointer, start, end);
      const distance = pointer.distanceTo(closest);
      if (distance <= bestDistance) {
        bestDistance = distance;
        bestPoint = this._leafletMap.containerPointToLatLng(closest);
      }
    };

    if (this._editGridVisible && (this._editingRegionId || this._editingLineId)) {
      const gridSize = Math.max(8, Math.min(512, Math.round(Number(this._editGridSize) || 50)));
      const mapPoint = this._latLngToMapPixels(latlng, worldMap);
      const snappedX = Math.max(0, Math.min(Number(worldMap.width) || 0, Math.round(mapPoint.x / gridSize) * gridSize));
      const snappedY = Math.max(0, Math.min(Number(worldMap.height) || 0, Math.round(mapPoint.y / gridSize) * gridSize));
      bestPoint = this._mapPixelsToLatLng(snappedX, snappedY, worldMap);
    }

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
    const icon = buildPinIconPresentation(pin, this._getPinTypeDefinition(pin?.type));
    return globalThis.L.divIcon({
      className: "tom-world-map-marker",
      html: `<span class="tom-world-map-marker__icon"><i class="fas ${icon.iconClass}" aria-hidden="true" style="color:${icon.color}; font-size:${icon.iconFontSize}rem;${icon.strokeStyle}${icon.shadowStyle ? ` ${icon.shadowStyle}` : ""}"></i></span>`,
      iconSize: [icon.iconSize, icon.iconSize],
      iconAnchor: [icon.iconAnchor, icon.iconAnchor]
    });
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

  _clearObjectOverlayPresentationQueue() {
    this._objectOverlayPresentationFrames.forEach((frameId) => window.cancelAnimationFrame?.(frameId));
    this._objectOverlayPresentationFrames.clear();
    this._objectOverlayPresentationTimeouts.forEach((timeoutId) => window.clearTimeout?.(timeoutId));
    this._objectOverlayPresentationTimeouts.clear();
  }

  _scheduleObjectOverlayPresentationFrame(callback) {
    const frameId = window.requestAnimationFrame?.(() => {
      this._objectOverlayPresentationFrames.delete(frameId);
      callback();
    });
    if (frameId) this._objectOverlayPresentationFrames.add(frameId);
  }

  _scheduleObjectOverlayPresentationTimeout(callback, delay = 0) {
    const timeoutId = window.setTimeout?.(() => {
      this._objectOverlayPresentationTimeouts.delete(timeoutId);
      callback();
    }, delay);
    if (timeoutId) this._objectOverlayPresentationTimeouts.add(timeoutId);
  }

  _queueObjectOverlayMarkerPresentation(marker, entry, zoom = null) {
    const apply = () => {
      if (!this._leafletMap || !marker?._map) return;
      this._applyObjectOverlayMarkerPresentation(marker, entry, zoom);
    };
    apply();
    this._scheduleObjectOverlayPresentationFrame(apply);
    this._scheduleObjectOverlayPresentationTimeout(apply, 0);
    this._scheduleObjectOverlayPresentationTimeout(apply, 40);
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
    this._clearLeafletOverlayLayers();
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
      overlayLayer._tomTileErrorHandler = this._createOverlayTileErrorHandler(overlay);
      overlayLayer.on("tileerror", overlayLayer._tomTileErrorHandler);
      this._leafletOverlayLayers.set(overlay.id, overlayLayer);
    }
  }

  _createOverlayTileErrorHandler(overlay) {
    const fallbackUrl = String(overlay?.tileUrlTemplate || "").trim();
    return (event) => {
      const failedUrl = String(event?.tile?.src || fallbackUrl).trim();
      console.warn(`${MODULE_ID} | World map overlay tile failed to load`, failedUrl);
    };
  }

  _clearLeafletOpenDocumentTimer(layer) {
    if (!layer?._tomOpenDocumentTimer) return;
    window.clearTimeout(layer._tomOpenDocumentTimer);
    layer._tomOpenDocumentTimer = null;
  }

  _scheduleLinkedDocumentOpen(layer, entry, { delay = 220 } = {}) {
    if (!layer || !entry?.documentUuid) return;
    this._clearLeafletOpenDocumentTimer(layer);
    layer._tomOpenDocumentTimer = window.setTimeout(async () => {
      layer._tomOpenDocumentTimer = null;
      await this._openLinkedMapDocument(typeof entry === "function" ? entry() : entry);
    }, delay);
  }

  _hasWorldMapTravelTarget(entry = {}) {
    const type = String(entry?.travelTargetType || "").trim();
    return Boolean(type && (entry?.travelTargetId || entry?.travelTargetUuid));
  }

  _hasWorldMapLinkedDocument(entry = {}) {
    return Boolean(String(entry?.documentUuid || "").trim());
  }

  _canUseWorldMapTravelTarget(entry = {}) {
    if (!this._hasWorldMapTravelTarget(entry)) return false;
    return Boolean(game.user?.isGM || entry.travelPlayerAccess);
  }

  _canUseWorldMapLinkedDocument(entry = {}) {
    if (!this._hasWorldMapLinkedDocument(entry)) return false;
    return Boolean(game.user?.isGM || entry.documentPlayerAccess !== false);
  }

  _getTravelTooltipAccess(entry = {}) {
    if (!game.user?.isGM) return null;
    const hasTravelTarget = this._hasWorldMapTravelTarget(entry);
    const hasLinkedDocument = this._hasWorldMapLinkedDocument(entry);
    if (!hasTravelTarget && !hasLinkedDocument) return null;
    if (hasTravelTarget && !entry.travelPlayerAccess) return false;
    if (hasLinkedDocument && entry.documentPlayerAccess === false) return false;
    return true;
  }

  _getWorldMapTooltipAccess(entry = {}) {
    if (!game.user?.isGM) return null;
    const state = {};
    if (this._hasWorldMapTravelTarget(entry)) state.travel = Boolean(entry.travelPlayerAccess);
    if (this._hasWorldMapLinkedDocument(entry)) state.document = entry.documentPlayerAccess !== false;
    return Object.keys(state).length ? state : null;
  }

  async _resolveWorldMapElementAction(entry = {}, { event = null } = {}) {
    const canTravel = this._canUseWorldMapTravelTarget(entry);
    const canOpenInfo = this._canUseWorldMapLinkedDocument(entry);
    if (canTravel && canOpenInfo) {
      this._openWorldMapActionChoiceMenu(event, entry);
      return true;
    }
    if (canTravel) return this._activateWorldMapTravelTarget(entry);
    if (canOpenInfo) return this._openLinkedMapDocument(entry);
    return false;
  }

  _scheduleWorldMapElementAction(layer, entry, { delay = 220, event = null } = {}) {
    if (!layer) return;
    const getEntry = typeof entry === "function" ? entry : () => entry;
    const currentEntry = getEntry();
    if (!this._hasWorldMapTravelTarget(currentEntry) && !this._hasWorldMapLinkedDocument(currentEntry)) return;
    this._clearLeafletOpenDocumentTimer(layer);
    layer._tomOpenDocumentTimer = window.setTimeout(async () => {
      layer._tomOpenDocumentTimer = null;
      const resolvedEntry = getEntry();
      await this._resolveWorldMapElementAction(resolvedEntry, { event });
    }, delay);
  }

  async _onWorldMapElementMouseDown(event, elementType, entry) {
    const originalEvent = event?.originalEvent ?? event;
    if (Number(originalEvent?.button) !== 1) return;
    originalEvent?.preventDefault?.();
    originalEvent?.stopPropagation?.();
    globalThis.L?.DomEvent?.stop?.(event);
    await this._toggleWorldMapElementTravelAccess(elementType, typeof entry === "function" ? entry() : entry);
  }

  async _toggleWorldMapElementTravelAccess(elementType, entry = {}) {
    if (!game.user?.isGM || !this.mapId || !entry?.id || !this._hasWorldMapTravelTarget(entry)) return;
    const operation = getWorldMapElementOperation(elementType);
    const upsertMethod = operation?.upsertMethod;
    if (!upsertMethod || typeof TheatreStore[upsertMethod] !== "function") return;

    const updatedEntry = await TheatreStore[upsertMethod](this.mapId, {
      id: entry.id,
      travelPlayerAccess: !Boolean(entry.travelPlayerAccess)
    });
    if (!updatedEntry) return;

    ui.notifications?.info(updatedEntry.travelPlayerAccess
      ? tr("Player access enabled.")
      : tr("Player access disabled."));
    this._renderPreservingView();
  }

  _clearLeafletLayerCollection(collection, { beforeRemove } = {}) {
    if (!(collection instanceof Map)) return;
    collection.forEach((layer) => {
      beforeRemove?.(layer);
      this._clearLeafletOpenDocumentTimer(layer);
      layer?.remove?.();
    });
    collection.clear();
  }

  _clearLeafletLayerArray(propertyName) {
    const layers = Array.isArray(this[propertyName]) ? this[propertyName] : [];
    for (const layer of layers) {
      this._clearLeafletOpenDocumentTimer(layer);
      layer?.remove?.();
    }
    this[propertyName] = [];
  }

  _clearLeafletLayerProperty(propertyName) {
    const layer = this[propertyName];
    this._clearLeafletOpenDocumentTimer(layer);
    layer?.remove?.();
    this[propertyName] = null;
  }

  _clearEditGridLayer() {
    this._clearLeafletLayerProperty("_leafletEditGridLayer");
  }

  _syncEditGridLayer(worldMap = null) {
    this._clearEditGridLayer();
    if (!this._leafletMap || !globalThis.L || !this._editGridVisible || (!this._editingRegionId && !this._editingLineId)) return;
    const targetMap = worldMap ?? (this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
    if (!targetMap) return;
    const width = Math.max(0, Math.round(Number(targetMap.width) || 0));
    const height = Math.max(0, Math.round(Number(targetMap.height) || 0));
    const gridSize = Math.max(8, Math.min(512, Math.round(Number(this._editGridSize) || 50)));
    if (!width || !height) return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tom-world-map-edit-grid");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(group);

    const appendLine = (x1, y1, x2, y2) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("vector-effect", "non-scaling-stroke");
      group.appendChild(line);
    };

    for (let x = 0; x <= width; x += gridSize) appendLine(x, 0, x, height);
    if (width % gridSize !== 0) appendLine(width, 0, width, height);
    for (let y = 0; y <= height; y += gridSize) appendLine(0, y, width, y);
    if (height % gridSize !== 0) appendLine(0, height, width, height);

    if (typeof globalThis.L.svgOverlay === "function") {
      this._leafletEditGridLayer = globalThis.L.svgOverlay(svg, this._buildLeafletBounds(this._leafletMap, targetMap), {
        interactive: false,
        pane: "tom-world-map-grid-pane"
      }).addTo(this._leafletMap);
      return;
    }

    const layerGroup = globalThis.L.layerGroup();
    const pathOptions = {
      className: "tom-world-map-edit-grid__line",
      interactive: false,
      pane: "tom-world-map-grid-pane"
    };
    for (let x = 0; x <= width; x += gridSize) {
      layerGroup.addLayer(globalThis.L.polyline([this._mapPixelsToLatLng(x, 0, targetMap), this._mapPixelsToLatLng(x, height, targetMap)], pathOptions));
    }
    if (width % gridSize !== 0) layerGroup.addLayer(globalThis.L.polyline([this._mapPixelsToLatLng(width, 0, targetMap), this._mapPixelsToLatLng(width, height, targetMap)], pathOptions));
    for (let y = 0; y <= height; y += gridSize) {
      layerGroup.addLayer(globalThis.L.polyline([this._mapPixelsToLatLng(0, y, targetMap), this._mapPixelsToLatLng(width, y, targetMap)], pathOptions));
    }
    if (height % gridSize !== 0) layerGroup.addLayer(globalThis.L.polyline([this._mapPixelsToLatLng(0, height, targetMap), this._mapPixelsToLatLng(width, height, targetMap)], pathOptions));
    this._leafletEditGridLayer = layerGroup.addTo(this._leafletMap);
  }

  _clearLeafletOverlayLayers() {
    this._clearLeafletLayerCollection(this._leafletOverlayLayers, {
      beforeRemove: (layer) => {
        if (!layer?._tomTileErrorHandler) return;
        layer.off?.("tileerror", layer._tomTileErrorHandler);
        delete layer._tomTileErrorHandler;
      }
    });
  }

  _syncLeafletObjectOverlays(worldMap = null) {
    if (!this._leafletMap || !globalThis.L) return;
    this._clearLeafletLayerCollection(this._leafletObjectOverlayMarkers);
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
      marker.on("mousedown", (event) => {
        this._onWorldMapElementMouseDown(event, "objectOverlay", () => marker._tomObjectEntry ?? entry);
      });
      if (entry.documentUuid || this._hasWorldMapTravelTarget(entry)) {
        marker.on("click", (event) => {
          globalThis.L.DomEvent.stop(event?.originalEvent ?? event);
          this._scheduleWorldMapElementAction(marker, () => marker._tomObjectEntry ?? entry, { event });
        });
      }
      if (entry.documentUuid || this._hasWorldMapTravelTarget(entry)) {
        marker.bindTooltip(buildWorldMapTooltipContent({
          heading: entry.name || tr("Object"),
          documentName: entry.documentName,
          access: this._getWorldMapTooltipAccess(entry)
        }), {
          direction: "top",
          className: "tom-world-map__tooltip",
          opacity: 0.98
        });
        this._bindLayerTooltipToPointer(marker);
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
          }, { once: true });
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
    this._clearLeafletLayerProperty("_leafletDraftRegionLayer");
  }

  _clearRegionVertexMarkers() {
    this._clearLeafletLayerArray("_leafletRegionVertexMarkers");
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
    const { fillStyle, scale, patternSize, color, opacity } = getRegionPatternPresentation(region);
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
    this._clearLeafletLayerCollection(this._leafletRegionLayers);
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
      const polygon = globalThis.L.polygon(latlngs, getRegionPresentation(region)).addTo(this._leafletMap);
      this._applyRegionPresentation(polygon, region);
      if (region.tooltipEnabled !== false) {
        polygon.bindTooltip(buildWorldMapTooltipContent({
          heading: region.name || tr("Region"),
          documentName: region.documentName,
          access: this._getWorldMapTooltipAccess(region)
        }), {
          direction: "center",
          sticky: true,
          className: "tom-world-map__tooltip",
          opacity: 0.96
        });
        this._bindLayerTooltipToPointer(polygon);
      }
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
      polygon.on("mousedown", (event) => {
        this._onWorldMapElementMouseDown(event, "region", region);
      });
      if (region.documentUuid || this._hasWorldMapTravelTarget(region)) {
        polygon.on("click", (event) => {
          globalThis.L.DomEvent.stop(event);
          this._scheduleWorldMapElementAction(polygon, region, { event });
        });
      }
      this._leafletRegionLayers.set(region.id, polygon);
    }
    this._syncDraftRegionLayer(targetMap);
    this._syncRegionVertexMarkers(targetMap);
  }

  _clearDraftLineLayer() {
    this._clearLeafletLayerProperty("_leafletDraftLineOutlineLayer");
    this._clearLeafletLayerProperty("_leafletDraftLineLayer");
  }

  _clearLinePointMarkers() {
    this._clearLeafletLayerArray("_leafletLinePointMarkers");
  }

  _clearLineVertexMarkers() {
    this._clearLeafletLayerArray("_leafletLineVertexMarkers");
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
    const point = getLinePointPresentation(line);
    if (!point) return null;
    return globalThis.L.divIcon({
      className: `tom-world-map-line-point tom-world-map-line-point--${point.pointStyle}`,
      html: `<span style="width:${point.size}px;height:${point.size}px;background:${point.color};opacity:${point.opacity};border:${point.outlineWidth}px solid ${point.outlineColor};"></span>`,
      iconSize: [point.size, point.size],
      iconAnchor: [point.size / 2, point.size / 2]
    });
  }

  _applyLinePresentation(layer, line) {
    const element = layer?.getElement?.();
    if (!element) return;
    element.style.filter = getLineShadowFilter(line);
  }

  _syncLeafletLines(worldMap = null) {
    this._clearLeafletLayerCollection(this._leafletLineLayers);
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
      const base = getLineBasePresentation(line);
      const outlineOptions = getLineOutlinePresentation(line, base);
      if (outlineOptions) {
        const outline = globalThis.L.polyline(latlngs, outlineOptions).addTo(this._leafletMap);
        this._leafletLineLayers.set(`${line.id}:outline`, outline);
      }
      const polyline = globalThis.L.polyline(latlngs, {
        color: base.color,
        weight: base.width,
        opacity: base.opacity,
        lineCap: base.lineCap,
        lineJoin: base.lineJoin,
        dashArray: base.dashArray
      }).addTo(this._leafletMap);
      polyline.on("add", () => this._applyLinePresentation(polyline, line));
      this._applyLinePresentation(polyline, line);
      if (line.tooltipEnabled !== false) {
        polyline.bindTooltip(buildWorldMapTooltipContent({
          heading: line.name || tr("Line"),
          documentName: line.documentName,
          access: this._getWorldMapTooltipAccess(line)
        }), {
          direction: "center",
          sticky: true,
          className: "tom-world-map__tooltip",
          opacity: 0.96
        });
        this._bindLayerTooltipToPointer(polyline);
      }
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
      polyline.on("mousedown", (event) => {
        this._onWorldMapElementMouseDown(event, "line", line);
      });
      if (line.documentUuid || this._hasWorldMapTravelTarget(line)) {
        polyline.on("click", (event) => {
          globalThis.L.DomEvent.stop(event);
          this._scheduleWorldMapElementAction(polyline, line, { event });
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
    this._clearLeafletLayerCollection(this._leafletMarkers);
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
      this._bindPinTooltip(marker, pin);
      marker.on("click", (event) => {
        this._selectedPinId = pin.id;
        if (Date.now() < Number(marker._tomSkipClickUntil || 0)) return;
        if (pin.documentUuid || this._hasWorldMapTravelTarget(pin)) {
          this._scheduleWorldMapElementAction(marker, pin, { event });
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
      marker.on("mousedown", (event) => {
        this._onWorldMapElementMouseDown(event, "pin", pin);
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
          this._bindPinTooltip(marker, updatedPin);
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
      movableForPlayers: false,
      tooltipEnabled: true,
      documentPlayerAccess: true
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
      documentPlayerAccess: pinData.documentPlayerAccess,
      travelTargetType: pinData.travelTargetType,
      travelTargetId: pinData.travelTargetId,
      travelTargetUuid: pinData.travelTargetUuid,
      travelTargetName: pinData.travelTargetName,
      travelPlayerAccess: pinData.travelPlayerAccess,
      travelCloseWorldMap: pinData.travelCloseWorldMap,
      movableForPlayers: pinData.movableForPlayers,
      tooltipEnabled: pinData.tooltipEnabled,
      x: point.x,
      y: point.y
    });
    this._selectedPinId = pin?.id ?? null;
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  async _resolveDroppedLinkedWorldMapDocument(event) {
    if (getWorldMapDragItemCount(event) > 1) {
      ui.notifications?.info(tr("Only one journal or token can be linked."));
      return null;
    }
    const document = await resolveDroppedWorldMapDocument(event);
    if (!document) return null;
    if (!isSupportedLinkedWorldMapDocument(document)) {
      ui.notifications?.warn(tr("Drop a journal entry, journal page, token, or actor."));
      return null;
    }
    return document;
  }

  async _resolveDroppedWorldMapTravelTarget(event) {
    const plainPayload = readTransferJson(event, "text/plain");
    const theatreScenePayload = readTransferJson(event, "application/x-theatre-scene") ?? (plainPayload?.type === "TheatreScene" ? plainPayload : null);
    if (theatreScenePayload?.sceneId || theatreScenePayload?.id) {
      const sceneId = String(theatreScenePayload.sceneId || theatreScenePayload.id || "").trim();
      const scene = TheatreStore.getSceneById(sceneId);
      if (scene) return { type: "theatreScene", id: scene.id, uuid: "", name: scene.name || tr("Scene"), previewImage: scene.thumbnail || scene.background || "" };
    }

    const portalPayload = readTransferJson(event, "application/x-footlights-portal") ?? (plainPayload?.type === "Portal" ? plainPayload : null);
    if (portalPayload?.portalId || portalPayload?.id) {
      const portalId = String(portalPayload.portalId || portalPayload.id || "").trim();
      const portal = TheatreStore.getPortalById(portalId);
      if (portal) return { type: "portal", id: portal.id, uuid: "", name: portal.name || tr("Portal"), previewImage: portal.thumbnail || (portal.backgroundType === "image" ? portal.background : "") || "" };
    }

    const worldMapPayload = readTransferJson(event, "application/x-footlights-world-map") ?? (plainPayload?.type === "WorldMap" ? plainPayload : null);
    if (worldMapPayload?.mapId || worldMapPayload?.id) {
      const mapId = String(worldMapPayload.mapId || worldMapPayload.id || "").trim();
      const worldMap = TheatreStore.getWorldMapById(mapId);
      if (worldMap) return { type: "worldMap", id: worldMap.id, uuid: "", name: worldMap.name || tr("World Map"), previewImage: worldMap.thumbnail || "" };
    }

    const document = await resolveDroppedWorldMapDocument(event);
    if (String(document?.documentName || "").trim() === "Scene") {
      return {
        type: "foundryScene",
        id: String(document.id || "").trim(),
        uuid: String(document.uuid || "").trim(),
        name: String(document.name || tr("Scene")).trim(),
        previewImage: String(document.thumb || document.thumbnail || document.img || "").trim()
      };
    }

    ui.notifications?.warn(tr("Drop a Foundry scene, Foodlights scene, portal, or map."));
    return null;
  }

  async _promptForObjectOverlayData(initialData = {}, { isEditing = false, forcedType = null } = {}) {
    const type = forcedType || initialData.type || "image";
    const isImage = type === "image";
    const title = tr(isEditing ? "Edit object overlay" : (isImage ? "Create image overlay" : "Create text overlay"));
    const categoryOptions = this._getObjectCategoryOptions();
    const selectedFontFamily = String(initialData.fontFamily || "").trim();
    const fontOptionsMarkup = buildSelectOptions(this._getFontTypeOptions(selectedFontFamily), selectedFontFamily);
    const fallbackCategory = categoryOptions[0]?.id || "general";
    const categorySelectOptions = buildSelectOptions(categoryOptions, String(initialData.category || fallbackCategory).trim().toLowerCase());
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title,
        content: buildObjectOverlayDialogContent(initialData, {
          isImage,
          categoryOptions: categorySelectOptions,
          fontOptions: fontOptionsMarkup
        }),
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve(readObjectOverlayDataFromDialog(html, {
              type,
              fallbackCategory,
              initialData
            }))
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
      this._scheduleDialogSetup(() => {
        const root = applyWorldMapDialogTheme(dialog, {
          moduleId: MODULE_ID,
          width: isImage ? 700 : 920,
          widthCss: isImage ? "44rem" : "58rem",
          hostClasses: ["tom-world-map-object-overlay-host"],
          themeState: TheatreStore.getThemeState(),
          manualResize: {
            minWidth: isImage ? 420 : 560,
            minHeight: isImage ? 240 : 300
          }
        });
        if (!root) return;
        root?.querySelector?.("[data-action='pick-image-object']")?.addEventListener("click", (event) => {
          event.preventDefault();
          const targetSelector = event.currentTarget?.dataset?.target;
          openImagePickerForInput(root, targetSelector, "image");
        });
        activateLinkedDocumentDrop(root, "overlay", {
          resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
        });
        activateTravelTargetControls(root, "overlay", {
          resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
        });
        bindObjectOverlayTextPreview(root, initialData);
      });
    });
  }

  async _promptForRegionData(initialData = {}, { isEditing = false, onLiveChange = null } = {}) {
    const regionCategoryOptions = this._getRegionCategoryOptions();
    const fallbackCategory = regionCategoryOptions[0]?.id || "general";
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit region" : "Create region"),
        content: buildRegionDialogContent(initialData, {
          categoryOptions: regionCategoryOptions,
          fallbackCategory
        }),
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve(readRegionDataFromDialog(html, fallbackCategory))
          },
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        default: "create",
        close: () => resolve(null),
        render: () => {
          const root = applyWorldMapDialogTheme(dialog, {
            moduleId: MODULE_ID,
            width: 760,
            widthCss: "760px",
            hostClasses: [
              "dialog",
              "footlights-themed-window",
              "tom-theme-root",
              "tom-theme-area--content",
              "tom-world-map-pin-dialog-host",
              "tom-world-map-region-clean-dialog-host"
            ],
            themeState: TheatreStore.getThemeState(),
            manualResize: {
              minWidth: 560,
              minHeight: 420,
              storageKey: "worldMapRegionEditor"
            }
          });
          if (!root) return;
          applyWorldMapRegionEditorTheme(root);
          activateLinkedDocumentDrop(root, "region", {
            resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
          });
          activateTravelTargetControls(root, "region", {
            resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
          });
          window.requestAnimationFrame(() => applyWorldMapRegionEditorTheme(root));
        }
      }, {
        width: 760,
        resizable: true,
        classes: [
          "dialog",
          "footlights-themed-window",
          "tom-theme-root",
          "tom-theme-area--content",
          "theatre-canvas-drop-dialog",
          "tom-world-map-pin-dialog-host",
          "tom-world-map-region-clean-dialog-host"
        ]
      });
      dialog.options.width = 760;
      dialog.position.width = 760;
      dialog.render(true);
      this._scheduleDialogSetup(() => {
        const root = applyWorldMapDialogTheme(dialog, {
          moduleId: MODULE_ID,
          width: 760,
          widthCss: "760px",
          hostClasses: ["tom-world-map-pin-dialog-host", "tom-world-map-region-clean-dialog-host"],
          themeState: TheatreStore.getThemeState(),
          manualResize: {
            minWidth: 560,
            minHeight: 420,
            storageKey: "worldMapRegionEditor"
          }
        });
        if (!root) return;
        const refreshRegionDialogTheme = () => applyWorldMapRegionEditorTheme(root);
        refreshRegionDialogTheme();
        window.requestAnimationFrame(refreshRegionDialogTheme);
        window.setTimeout(refreshRegionDialogTheme, 80);
        window.setTimeout(refreshRegionDialogTheme, 250);
        activateLinkedDocumentDrop(root, "region", {
          resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
        });
        activateTravelTargetControls(root, "region", {
          resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
        });
        if (typeof onLiveChange === "function") {
          const updateLiveRegion = () => onLiveChange(readRegionDataFromDialog(dialog.element, fallbackCategory));
          bindDialogLiveChange(root, "[name^='region']", updateLiveRegion);
        }
      });
    });
  }

  async _promptForLineData(initialData = {}, { isEditing = false, onLiveChange = null } = {}) {
    const pinTypeDefinitions = Object.values(this._getPinTypeDefinitions());
    const fallbackCategory = this._getPinTypeDefinition(initialData.category).value;
    const categoryOptions = buildSelectOptions(pinTypeDefinitions, fallbackCategory);
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit line" : "Create line"),
        content: buildLineDialogContent(initialData, {
          categoryOptions,
          fallbackCategory
        }),
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => resolve(readLineDataFromDialog(html, fallbackCategory))
          },
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        default: "create",
        close: () => resolve(null),
        render: () => {
          const root = applyWorldMapDialogTheme(dialog, {
            moduleId: MODULE_ID,
            width: 900,
            widthCss: "900px",
            hostClasses: [
              "dialog",
              "footlights-themed-window",
              "tom-theme-root",
              "tom-theme-area--content",
              "tom-world-map-pin-dialog-host",
              "tom-world-map-line-clean-dialog-host"
            ],
            themeState: TheatreStore.getThemeState(),
            manualResize: {
              minWidth: 560,
              minHeight: 420,
              storageKey: "worldMapLineEditor"
            }
          });
          if (!root) return;
          applyWorldMapLineEditorTheme(root);
          activateLinkedDocumentDrop(root, "line", {
            resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
          });
          activateTravelTargetControls(root, "line", {
            resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
          });
          window.requestAnimationFrame(() => applyWorldMapLineEditorTheme(root));
        }
      }, {
        width: 900,
        resizable: true,
        classes: [
          "dialog",
          "footlights-themed-window",
          "tom-theme-root",
          "tom-theme-area--content",
          "theatre-canvas-drop-dialog",
          "tom-world-map-pin-dialog-host",
          "tom-world-map-line-clean-dialog-host"
        ]
      });
      dialog.options.width = 900;
      dialog.position.width = 900;
      dialog.render(true);
      this._scheduleDialogSetup(() => {
        const root = applyWorldMapDialogTheme(dialog, {
          moduleId: MODULE_ID,
          width: 900,
          widthCss: "900px",
          hostClasses: ["tom-world-map-pin-dialog-host", "tom-world-map-line-clean-dialog-host"],
          themeState: TheatreStore.getThemeState(),
          manualResize: {
            minWidth: 560,
            minHeight: 420,
            storageKey: "worldMapLineEditor"
          }
        });
        if (!root) return;
        const refreshLineDialogTheme = () => applyWorldMapLineEditorTheme(root);
        refreshLineDialogTheme();
        window.requestAnimationFrame(refreshLineDialogTheme);
        window.setTimeout(refreshLineDialogTheme, 80);
        window.setTimeout(refreshLineDialogTheme, 250);
        activateLinkedDocumentDrop(root, "line", {
          resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
        });
        activateTravelTargetControls(root, "line", {
          resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
        });
        if (typeof onLiveChange === "function") {
          const updateLiveLine = () => onLiveChange(readLineDataFromDialog(dialog.element, fallbackCategory));
          bindDialogLiveChange(root, "[name^='line']", updateLiveLine);
        }
      });
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
      this._stopRegionEdit({ rerender: false });
      return;
    }
    await TheatreStore.upsertWorldMapRegion(this.mapId, { id: region.id, ...data, points: this._pendingRegionPoints });
    this._stopRegionEdit({ rerender: false });
    this._syncLeafletRegions(TheatreStore.getWorldMapById(this.mapId));
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
      this._stopLineEdit({ rerender: false });
      return;
    }
    await TheatreStore.upsertWorldMapLine(this.mapId, { id: line.id, ...data, points: this._pendingLinePoints });
    this._stopLineEdit({ rerender: false });
    this._syncLeafletLines(TheatreStore.getWorldMapById(this.mapId));
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
    return createDefaultRegionDraft({ category, name: tr("Region") });
  }

  _createDefaultLineDraft(worldMap = null) {
    return createDefaultLineDraft({
      category: this._getPinTypeDefinition(null, worldMap).value,
      name: tr("Line")
    });
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
    this._syncLeafletRegions(worldMap);
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    this._syncEditGridLayer(worldMap);
  }

  _stopRegionEdit({ rerender = true } = {}) {
    this._editingRegionId = null;
    this._editingRegionName = "";
    this._editingRegionStyle = null;
    this._pendingRegionPoints = [];
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    this._syncDraftRegionLayer(worldMap);
    this._syncRegionVertexMarkers(worldMap);
    this._syncLeafletRegions(worldMap);
    this._syncEditGridLayer(worldMap);
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
    this._syncEditGridLayer(worldMap);
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
    this._syncEditGridLayer(worldMap);
    if (rerender) this.render(false);
  }

  async _createObjectOverlayAtLatLng(type, latlng) {
    if (!game.user?.isGM || !this.mapId || !latlng) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;
    const point = this._latLngToMapPixels(latlng, worldMap);
    const defaultObjectCategory = this._getObjectCategoryOptions(worldMap)[0]?.id || "general";
    const defaults = createDefaultObjectOverlayDraft(type, {
      category: defaultObjectCategory,
      textName: tr("Text object"),
      imageName: tr("Image object")
    });
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
      tooltipEnabled: pin.tooltipEnabled !== false,
      documentUuid: String(pin.documentUuid || "").trim(),
      documentName: String(pin.documentName || "").trim(),
      documentType: String(pin.documentType || "").trim(),
      documentPlayerAccess: pin.documentPlayerAccess !== false,
      travelTargetType: String(pin.travelTargetType || "").trim(),
      travelTargetId: String(pin.travelTargetId || "").trim(),
      travelTargetUuid: String(pin.travelTargetUuid || "").trim(),
      travelTargetName: String(pin.travelTargetName || "").trim(),
      travelPlayerAccess: Boolean(pin.travelPlayerAccess),
      travelCloseWorldMap: pin.travelCloseWorldMap !== false,
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
      documentPlayerAccess: pinData.documentPlayerAccess,
      travelTargetType: pinData.travelTargetType,
      travelTargetId: pinData.travelTargetId,
      travelTargetUuid: pinData.travelTargetUuid,
      travelTargetName: pinData.travelTargetName,
      travelPlayerAccess: pinData.travelPlayerAccess,
      travelCloseWorldMap: pinData.travelCloseWorldMap,
      movableForPlayers: pinData.movableForPlayers,
      tooltipEnabled: pinData.tooltipEnabled
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

  _syncPinDialogPreview(pinId, pinData) {
    if (!pinId || !this._leafletMarkers?.has(pinId)) return;
    const marker = this._leafletMarkers.get(pinId);
    const worldMap = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    const existingPin = worldMap?.pins?.find((entry) => entry.id === pinId) ?? {};
    const nextPin = { ...existingPin, ...pinData, id: pinId };
    marker.setIcon(this._createMarkerIcon(nextPin));
    this._bindPinTooltip(marker, nextPin);
  }

  async _promptForPinData(initialData, { isEditing = false } = {}) {
    const pinTypeDefinitions = Object.values(this._getPinTypeDefinitions());
    const selectOptions = buildSelectOptions(pinTypeDefinitions, initialData.type);
    return await new Promise((resolve) => {
      let didResolve = false;
      const resolveOnce = (value) => {
        didResolve = true;
        resolve(value);
      };
      const dialog = new Dialog({
        title: tr(isEditing ? "Edit pin" : "Create pin"),
        content: buildPinDialogContent(initialData, { typeOptions: selectOptions }),
        buttons: {
          create: {
            label: tr(isEditing ? "Save" : "Create"),
            callback: (html) => {
              resolveOnce(readPinDataFromDialog(html, initialData));
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
      }, {
        width: 700,
        resizable: true
      });
      dialog.options.resizable = true;
      dialog.options.width = 700;
      dialog.render(true);
      this._scheduleDialogSetup(() => {
        const root = applyWorldMapDialogTheme(dialog, {
          moduleId: MODULE_ID,
          width: 700,
          widthCss: "44rem",
          hostClasses: ["tom-world-map-pin-dialog-host"],
          themeState: TheatreStore.getThemeState(),
          manualResize: {
            minWidth: 520,
            minHeight: 360,
            storageKey: "worldMapPinEditor"
          }
        });
        if (!root) return;
        activateLinkedDocumentDrop(root, "pin", {
          resolveDocument: (event) => this._resolveDroppedLinkedWorldMapDocument(event)
        });
        activateTravelTargetControls(root, "pin", {
          resolveTarget: (event) => this._resolveDroppedWorldMapTravelTarget(event)
        });
        const syncPreview = () => this._syncPinDialogPreview(initialData.id, readPinDataFromDialog(dialog.element, initialData));
        root.querySelectorAll?.("[name='pinLabel'], [name='pinType'], [name='pinNote'], [name='pinColor'], [name='pinSize'], [name='pinBorderColor'], [name='pinBorderWidth'], [name='pinShadowColor'], [name='pinShadowDistance'], [name='pinShadowOpacity'], [name='pinShadowBlur']")
          ?.forEach((input) => input.addEventListener("input", syncPreview));
        root.querySelectorAll?.("[name='pinType'], [name='pinMovableForPlayers']")
          ?.forEach((input) => input.addEventListener("change", syncPreview));
      });
    });
  }

  _onToggleRightSidebar(event) {
    event.preventDefault();
    this._isRightSidebarCollapsed = !this._isRightSidebarCollapsed;
    this._renderPreservingView();
  }

  async _onLeafletMapDoubleClick(event) {
    this._closeContextMenu({ rerender: false });
    this._closeActionChoiceMenu();
    if (!game.user?.isGM || this._isRegionDrawMode || this._isLineDrawMode || this._editingRegionId || this._editingLineId) return;
    await this._createPinFromLatLng(event?.latlng);
  }

  _onLeafletMapClick(event) {
    this._closeContextMenu({ rerender: false });
    this._closeActionChoiceMenu();
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
    this._closeActionChoiceMenu();
    if (!game.user?.isGM) return;
    this._contextMenuState = createContextMenuStateFromLeafletEvent(event, this._leafletMap);
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
    this._fogTool = normalizeFogTool(event.currentTarget?.dataset?.fogTool);
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
    this._fogAction = normalizeFogAction(event.currentTarget?.dataset?.fogAction);
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
    this._fogBrushSize = normalizeFogBrushSize(event.currentTarget?.value);
    const valueLabel = event.currentTarget?.closest?.(".tom-world-map__fog-field")?.querySelector?.("strong");
    if (valueLabel) valueLabel.textContent = String(this._fogBrushSize);
    this._renderFogCanvas();
  }

  _onFogFeatherInput(event) {
    this._fogFeather = normalizeFogFeather(event.currentTarget?.value);
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
        radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, FOG_DEFAULTS.brushSize),
        feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, FOG_DEFAULTS.feather)
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
      radius: this._fogScreenRadiusToMapRadius(this._fogBrushSize, worldMap, FOG_DEFAULTS.brushSize),
      feather: this._fogScreenRadiusToMapRadius(this._fogFeather, worldMap, FOG_DEFAULTS.feather)
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
      pinToggle.setAttribute("aria-pressed", this._arePinsVisible ? "true" : "false");
    }
    if (pinIcon) {
      pinIcon.classList.toggle("fa-eye", Boolean(this._arePinsVisible));
      pinIcon.classList.toggle("fa-eye-slash", !this._arePinsVisible);
    }

    const objectToggle = root.querySelector("[data-action='toggle-map-object-overlay-visibility']");
    if (objectToggle) {
      objectToggle.classList.toggle("is-active", Boolean(this._areObjectOverlaysVisible));
      objectToggle.setAttribute("aria-pressed", this._areObjectOverlaysVisible ? "true" : "false");
    }

    const regionToggle = root.querySelector("[data-action='toggle-map-region-visibility']");
    if (regionToggle) {
      regionToggle.classList.toggle("is-active", Boolean(this._areRegionsVisible));
      regionToggle.setAttribute("aria-pressed", this._areRegionsVisible ? "true" : "false");
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
      const pin = findWorldMapElement(worldMap, "pin", targetId);
      if (pin) await this._editPin(pin);
      return;
    }
    if (targetType === "objectOverlay") {
      const entry = findWorldMapElement(worldMap, "objectOverlay", targetId);
      if (entry) await this._editObjectOverlay(entry);
      return;
    }
    if (targetType === "region") {
      const region = findWorldMapElement(worldMap, "region", targetId);
      if (region) await this._editRegion(region);
      return;
    }
    if (targetType === "line") {
      const line = findWorldMapElement(worldMap, "line", targetId);
      if (line) await this._editLine(line);
    }
  }

  _onEditContextLinePoints(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const { targetType, targetId } = this._contextMenuState;
    this._closeContextMenu({ rerender: false });
    if (targetType !== "line" || !targetId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const line = findWorldMapElement(worldMap, "line", targetId);
    if (!line) return;
    this._stopRegionEdit({ rerender: false });
    this._isRegionDrawMode = false;
    this._pendingRegionPoints = [];
    this._stopLineDraw({ rerender: false });
    this._startLineEdit(line);
    this.render(false);
  }

  _onEditContextRegionPoints(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const { targetType, targetId } = this._contextMenuState;
    this._closeContextMenu({ rerender: false });
    if (targetType !== "region" || !targetId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const region = findWorldMapElement(worldMap, "region", targetId);
    if (!region) return;
    this._stopLineEdit({ rerender: false });
    this._stopLineDraw({ rerender: false });
    this._isRegionDrawMode = false;
    this._startRegionEdit(region);
    this.render(false);
  }

  _getContextTarget(worldMap = null) {
    if (!this.mapId) return null;
    const targetMap = worldMap ?? TheatreStore.getWorldMapById(this.mapId);
    return getWorldMapContextTarget(targetMap, this._contextMenuState, {
      pin: tr("Pin"),
      objectOverlay: tr("Object overlay"),
      region: tr("Region"),
      line: tr("Line")
    });
  }

  _syncWorldMapElementGroup(syncGroup) {
    if (syncGroup === "pins") {
      this._syncLeafletPins();
      return;
    }
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (syncGroup === "objectOverlays") this._syncLeafletObjectOverlays(worldMap);
    if (syncGroup === "lines") this._syncLeafletLines(worldMap);
  }

  async _onDuplicateContextTarget(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const target = this._getContextTarget(worldMap);
    this._closeContextMenu({ rerender: false });
    if (!worldMap || !target) return;
    const duplicated = buildDuplicatedWorldMapElement(target, worldMap, {
      duplicateData,
      randomId,
      copySuffix: tr("(Copy)"),
      fallbackElementName: tr("Map element"),
      fallbackPinLabel: tr("Pin")
    });
    const operation = getWorldMapElementOperation(duplicated?.type);
    if (!operation?.upsertMethod || typeof TheatreStore[operation.upsertMethod] !== "function") return;
    await TheatreStore[operation.upsertMethod](this.mapId, duplicated.data);
    this._syncWorldMapElementGroup(operation.syncGroup);
    this._renderPreservingView();
  }

  async _confirmDeleteMapElement(label = "") {
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr("Delete map element"),
        content: `<p>${tr("Delete {name}?", { name: escapeHtml(label || tr("this map element")) })}</p>`,
        buttons: {
          delete: {
            icon: '<i class="fas fa-trash"></i>',
            label: tr("Delete"),
            callback: () => resolve(true)
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "cancel",
        close: () => resolve(false),
        render: () => {
          applyWorldMapDialogTheme(dialog, {
            moduleId: MODULE_ID,
            widthCss: "24rem",
            hostClasses: ["tom-world-map-delete-confirm-host"],
            themeState: TheatreStore.getThemeState()
          });
        }
      });
      dialog.render(true);
      requestAnimationFrame(() => {
        applyWorldMapDialogTheme(dialog, {
          moduleId: MODULE_ID,
          widthCss: "24rem",
          hostClasses: ["tom-world-map-delete-confirm-host"],
          themeState: TheatreStore.getThemeState()
        });
      });
    });
  }

  async _onDeleteContextTarget(event) {
    event.preventDefault();
    if (!game.user?.isGM || !this.mapId) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    const target = this._getContextTarget(worldMap);
    this._closeContextMenu({ rerender: false });
    if (!target) return;
    const confirmed = await this._confirmDeleteMapElement(target.label);
    if (!confirmed) return;

    const operation = getWorldMapElementOperation(target.type);
    if (!operation?.deleteMethod || typeof TheatreStore[operation.deleteMethod] !== "function") return;
    await TheatreStore[operation.deleteMethod](this.mapId, target.entry.id);
    if (target.type === "pin" && this._selectedPinId === target.entry.id) this._selectedPinId = null;
    this._syncWorldMapElementGroup(operation.syncGroup);
    this._renderPreservingView();
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
    event.currentTarget?.setAttribute?.("aria-pressed", this._regionSnapEnabled ? "true" : "false");
  }

  _onToggleLineSnap(event) {
    event.preventDefault();
    this._lineSnapEnabled = !this._lineSnapEnabled;
    event.currentTarget?.classList?.toggle("is-active", this._lineSnapEnabled);
    event.currentTarget?.setAttribute?.("aria-pressed", this._lineSnapEnabled ? "true" : "false");
  }

  _applyEditGridCanvasState() {
    const size = Math.max(8, Math.min(512, Math.round(Number(this._editGridSize) || 50)));
    const canvases = this.element?.[0]?.querySelectorAll?.("[data-world-map-canvas]") ?? [];
    for (const canvas of canvases) {
      canvas.classList.remove("has-edit-grid");
      canvas.style.setProperty("--tom-world-map-edit-grid-size", `${size}px`);
    }
    this._syncEditGridLayer(this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null);
  }

  _onToggleEditGrid(event) {
    event.preventDefault();
    this._editGridVisible = !this._editGridVisible;
    event.currentTarget?.classList?.toggle("is-active", this._editGridVisible);
    event.currentTarget?.setAttribute?.("aria-pressed", this._editGridVisible ? "true" : "false");
    this._applyEditGridCanvasState();
  }

  _onEditGridSizeInput(event) {
    const value = Math.max(8, Math.min(512, Math.round(Number(event.currentTarget?.value) || 50)));
    this._editGridSize = value;
    event.currentTarget.value = String(value);
    this._applyEditGridCanvasState();
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
    const droppedDocument = await resolveDroppedWorldMapDocument(event);
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
    this._clearLeafletSizeInvalidation();
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
    return buildWorldMapTooltipContent({
      heading: pin?.label || tr("Pin"),
      body: pin?.note || "",
      documentName: pin?.documentName || "",
      access: this._getWorldMapTooltipAccess(pin)
    });
  }

  _bindLayerTooltipToPointer(layer) {
    if (!layer?.on || layer._tomTooltipPointerBound) return;
    layer._tomTooltipPointerBound = true;
    const getPointerLatLng = (event) => {
      const sourceEvent = event?.originalEvent ?? event;
      const clientX = Number(sourceEvent?.clientX);
      const clientY = Number(sourceEvent?.clientY);
      if (this._leafletMap && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const containerPoint = this._leafletMap.mouseEventToContainerPoint(sourceEvent);
        return this._leafletMap.containerPointToLatLng(containerPoint);
      }
      return event?.latlng ?? null;
    };
    const syncTooltipPosition = (event) => {
      const tooltip = layer.getTooltip?.();
      const latlng = getPointerLatLng(event);
      if (!tooltip || !latlng) return;
      tooltip.setLatLng(latlng);
    };
    const syncTooltipPositionAfterLeaflet = (event) => {
      syncTooltipPosition(event);
      window.requestAnimationFrame?.(() => syncTooltipPosition(event));
      window.setTimeout?.(() => syncTooltipPosition(event), 0);
    };
    layer.on("mousemove", syncTooltipPosition);
    layer.on("mousedown", syncTooltipPositionAfterLeaflet);
    layer.on("mouseup", syncTooltipPositionAfterLeaflet);
    layer.on("preclick", syncTooltipPositionAfterLeaflet);
    layer.on("click", syncTooltipPositionAfterLeaflet);
    layer.on("contextmenu", syncTooltipPositionAfterLeaflet);
  }

  _bindPinTooltip(marker, pin) {
    marker?.unbindTooltip?.();
    if (!marker || pin?.tooltipEnabled === false) return;
    marker.bindTooltip(this._buildPinTooltipContent(pin), {
      direction: "top",
      className: "tom-world-map__tooltip",
      opacity: 0.98
    });
    this._bindLayerTooltipToPointer(marker);
  }

  applyRemoteElementMove({ mapId, elementType, elementId, x, y } = {}) {
    if (!this._leafletMap || String(mapId || "") !== String(this.mapId || "")) return;
    const worldMap = TheatreStore.getWorldMapById(this.mapId);
    if (!worldMap) return;

    if (elementType === "pin") {
      const marker = this._leafletMarkers.get(String(elementId || "").trim());
      if (!marker) return;
      const nextPin = buildMovedWorldMapElement(worldMap, { type: "pin", elementId, x, y });
      if (!nextPin) return;
      marker.setLatLng(this._mapPixelsToLatLng(x, y, worldMap));
      marker.setIcon(this._createMarkerIcon(nextPin));
      this._bindPinTooltip(marker, nextPin);
      return;
    }

    if (elementType === "objectOverlay") {
      const marker = this._leafletObjectOverlayMarkers.get(String(elementId || "").trim());
      if (!marker) return;
      const nextEntry = buildMovedWorldMapElement(worldMap, {
        type: "objectOverlay",
        elementId,
        x,
        y,
        fallbackEntry: marker._tomObjectEntry
      });
      if (!nextEntry) return;
      marker.setLatLng(this._mapPixelsToLatLng(x, y, worldMap));
      marker._tomObjectEntry = nextEntry;
      this._refreshObjectOverlayMarker(marker, nextEntry, this._leafletMap?.getZoom?.());
    }
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
      tooltipEnabled: true,
      documentPlayerAccess: true,
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
      documentPlayerAccess: pinData.documentPlayerAccess,
      travelTargetType: pinData.travelTargetType,
      travelTargetId: pinData.travelTargetId,
      travelTargetUuid: pinData.travelTargetUuid,
      travelTargetName: pinData.travelTargetName,
      travelPlayerAccess: pinData.travelPlayerAccess,
      travelCloseWorldMap: pinData.travelCloseWorldMap,
      movableForPlayers: pinData.movableForPlayers,
      tooltipEnabled: pinData.tooltipEnabled,
      x: point.x,
      y: point.y
    });
    this._selectedPinId = pin?.id ?? null;
    this._syncLeafletPins();
    this._renderPreservingView();
  }

  async _activateWorldMapTravelTarget(entry = {}) {
    if (!this._hasWorldMapTravelTarget(entry)) return false;
    if (!game.user?.isGM && !entry.travelPlayerAccess) {
      ui.notifications?.warn(tr("This location is locked."));
      return true;
    }

    const targetType = String(entry.travelTargetType || "").trim();
    const targetId = String(entry.travelTargetId || "").trim();
    const targetUuid = String(entry.travelTargetUuid || "").trim();
    const api = game.modules.get(MODULE_ID)?.api ?? null;
    const closeMapForTravel = async () => {
      const openMapApps = Array.from(globalThis.__TOM_WORLD_MAP_APP_INSTANCES ?? [this]).filter(Boolean);
      for (const app of openMapApps) {
        const root = app.element?.[0];
        if (root instanceof HTMLElement) root.style.visibility = "hidden";
        try {
          await app.close?.({ force: true });
        } catch (_error) {
          app.close?.();
        }
      }
      document.body?.classList?.remove?.(
        "tom-world-map-stage-active",
        "tom-world-map-stage-ui-hidden",
        "tom-world-map-stage-shared-left-sidebar-open",
        "tom-world-map-stage-shared-right-sidebar-open"
      );
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    };
    const bringFootlightsSceneToFront = async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const overlay = api?.manager?.overlay;
      overlay?.bringToTop?.();
      const overlayElement = overlay?.element?.[0];
      if (overlayElement instanceof HTMLElement) {
        overlayElement.style.zIndex = String(Math.max(Number(overlayElement.style.zIndex) || 0, 100000));
      }
    };

    if (targetType === "foundryScene") {
      const scene = (targetUuid && typeof fromUuid === "function" ? await fromUuid(targetUuid) : null)
        ?? game.scenes?.get(targetId)
        ?? null;
      if (!scene) {
        ui.notifications?.warn(tr("Linked destination not found."));
        return true;
      }
      await closeMapForTravel();
      if (globalThis.canvas?.scene?.id !== scene.id) scene.view?.();
      return true;
    }

    if (targetType === "theatreScene") {
      if (!TheatreStore.getSceneById(targetId)) {
        ui.notifications?.warn(tr("Linked destination not found."));
        return true;
      }
      await closeMapForTravel();
      if (api?.manager?.getActiveScene?.()?.id !== targetId) {
        await api?.activateScene?.(targetId, { suppressTransition: true, suppressEntrance: true });
      }
      await bringFootlightsSceneToFront();
      return true;
    }

    if (targetType === "portal") {
      if (!TheatreStore.getPortalById(targetId)) {
        ui.notifications?.warn(tr("Linked destination not found."));
        return true;
      }
      await closeMapForTravel();
      if (typeof api?.openPortalStage === "function") api.openPortalStage(targetId);
      else api?.openPortal?.(targetId);
      return true;
    }

    if (targetType === "worldMap") {
      if (!TheatreStore.getWorldMapById(targetId)) {
        ui.notifications?.warn(tr("Linked destination not found."));
        return true;
      }
      if (game.user?.isGM) await TheatreStore.setActiveWorldMap(targetId);
      this.mapId = targetId;
      this._preservedView = null;
      this.render(false);
      return true;
    }

    return false;
  }

  async _openLinkedMapDocument(entry) {
    if (!this._canUseWorldMapLinkedDocument(entry)) return false;
    return openLinkedWorldMapDocument(entry, {
      warn: () => ui.notifications?.warn(tr("Linked document not found."))
    });
  }
}
