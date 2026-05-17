import { MODULE_ID } from "../constants.js";
import { applyTheatreDialogTheme, applyThemeInlineStyleToHost, buildThemeInlineStyle, openImagePickerForInput, randomId } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { WORLD_MAP_CATEGORY_SEPARATOR_TYPE, collectWorldMapCategorySource, getDefaultWorldMapCategories, getWorldMapCategories, isWorldMapCategorySeparator, normalizeWorldMapCategoryList } from "../world-map/category-utils.js";
import { FOG_DEFAULTS, normalizeFogImageTileSize, normalizeFogMode, normalizeFogOpacity } from "../world-map/fog-utils.js";

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizePublicAssetPath(path) {
  const normalized = String(path || "").trim().replaceAll("\\", "/");
  if (!normalized) return "";
  if (/^(?:https?:)?\/\//i.test(normalized)) return normalized;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

const MAP_PIN_ICON_OPTIONS = [
  "fa-location-dot",
  "fa-house",
  "fa-shield-halved",
  "fa-star",
  "fa-book-open",
  "fa-anchor",
  "fa-bell",
  "fa-binoculars",
  "fa-bridge",
  "fa-building",
  "fa-bullseye",
  "fa-burst",
  "fa-castle",
  "fa-city",
  "fa-campground",
  "fa-church",
  "fa-circle-exclamation",
  "fa-compass",
  "fa-crown",
  "fa-diamond",
  "fa-dungeon",
  "fa-fire",
  "fa-flag",
  "fa-flask",
  "fa-fort-awesome",
  "fa-gem",
  "fa-gopuram",
  "fa-heart",
  "fa-landmark",
  "fa-masks-theater",
  "fa-map-pin",
  "fa-mountain-city",
  "fa-mountain-sun",
  "fa-person-shelter",
  "fa-place-of-worship",
  "fa-circle-question",
  "fa-road",
  "fa-route",
  "fa-skull",
  "fa-tents",
  "fa-tree-city",
  "fa-tree",
  "fa-tower-observation",
  "fa-triangle-exclamation",
  "fa-water",
  "fa-warehouse",
  "fa-door-open",
  "fa-key",
  "fa-lock",
  "fa-lock-open",
  "fa-skull-crossbones",
  "fa-crosshairs",
  "fa-radiation",
  "fa-biohazard",
  "fa-hospital",
  "fa-wrench",
  "fa-gears",
  "fa-screwdriver-wrench",
  "fa-store",
  "fa-shop",
  "fa-car",
  "fa-truck",
  "fa-helicopter",
  "fa-plane",
  "fa-train",
  "fa-ship",
  "fa-bridge-water",
  "fa-person-hiking",
  "fa-person-running",
  "fa-users",
  "fa-user-secret",
  "fa-id-card",
  "fa-sack-dollar",
  "fa-coins",
  "fa-scroll",
  "fa-wand-magic-sparkles",
  "fa-dragon",
  "fa-khanda",
  "fa-cross",
  "fa-ankh",
  "fa-dice-d20",
  "fa-dice",
  "fa-utensils",
  "fa-martini-glass",
  "fa-bed",
  "fa-torii-gate",
  "fa-monument",
  "fa-industry",
  "fa-tower-cell",
  "fa-satellite-dish",
  "fa-wifi",
  "fa-bolt",
  "fa-bomb",
  "fa-eye",
  "fa-eye-slash",
  "fa-circle-info"
];

export class TheatreWorldMapConfigApplication extends FormApplication {
  constructor(options = {}) {
    super({}, options);
    this.mapId = options.mapId ?? null;
    this._mapDraftOverride = null;
    this._collapsedSections = new Set(["fog", "fullscreen", "categories", "styling", "advanced"]);
    this._tileProgress = {
      running: false,
      percent: 0,
      message: ""
    };
    this._lastProgressRenderAt = 0;
    this._inlineHost = null;
    this._inlineForm = null;
    this._categoryDragState = null;
    this._categoryAutoSaveTimeout = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-world-map-config`,
      title: tr("World Map Config"),
      classes: [MODULE_ID, "theatre-world-map-config"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-world-map-config.hbs`,
      width: 980,
      height: 780,
      resizable: true,
      closeOnSubmit: true,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  _getDefaultWorldMapData() {
    return {
      id: "",
      name: "",
      description: "",
      sourceImage: "",
      thumbnail: "",
      tileSize: 256,
      tileRootPath: "",
      tileUrlTemplate: "",
      manifestPath: "",
      width: 1024,
      height: 1024,
      minZoom: 0,
      maxZoom: 4,
      zoomStep: 0.25,
      maxNativeZoom: 2,
      initialView: {
        x: 512,
        y: 512,
        zoom: 1
      },
      categories: getDefaultWorldMapCategories(),
      overlays: [],
      fogSettings: TheatreStore._normalizeWorldMapFogSettings(),
      styling: TheatreStore._getDefaultWorldMapStyling(),
      fullscreenSettings: TheatreStore._getDefaultWorldMapFullscreenSettings(),
      sidebarCollapsedDefault: false,
      pinSidebarCollapsedDefault: false
    };
  }

  _createDefaultOverlayData() {
    return {
      id: randomId(),
      name: tr("Overlay"),
      sourceImage: "",
      tileRootPath: "",
      tileUrlTemplate: "",
      manifestPath: "",
      opacity: 1,
      visibleByDefault: false
    };
  }

  _createDefaultCategoryData() {
    return {
      id: randomId(),
      type: "category",
      name: tr("Category"),
      iconClass: "fa-location-dot",
      color: "#33475f"
    };
  }

  _createDefaultCategorySeparatorData() {
    return {
      id: randomId(),
      type: WORLD_MAP_CATEGORY_SEPARATOR_TYPE,
      name: tr("Divider"),
      iconClass: "fa-minus",
      color: "#7a93ad"
    };
  }

  _getMapDraft() {
    if (this._mapDraftOverride) {
      return foundry.utils.mergeObject(
        this._getDefaultWorldMapData(),
        foundry.utils.deepClone(this._mapDraftOverride),
        { inplace: false }
      );
    }
    const existing = this.mapId ? TheatreStore.getWorldMapById(this.mapId) : null;
    return foundry.utils.mergeObject(
      this._getDefaultWorldMapData(),
      foundry.utils.deepClone(existing ?? {}),
      { inplace: false }
    );
  }

  setInlineHost(host) {
    this._inlineHost = host ?? null;
    return this;
  }

  setInlineForm(form) {
    this._inlineForm = form ?? null;
    return this;
  }

  _getFormElement() {
    return this._inlineForm ?? this.form ?? null;
  }

  _syncSharedCategoryAliases(draft) {
    const categories = Array.isArray(draft?.categories) && draft.categories.length
      ? draft.categories
      : getDefaultWorldMapCategories();
    draft.categories = categories;
    // Preserve legacy fields for maps created before categories became shared.
    draft.pinCategories = categories;
    draft.objectCategories = categories;
    draft.regionCategories = categories;
    return draft;
  }

  _readWorldMapDataFromForm() {
    const fallback = this._getMapDraft();
    const form = this._getFormElement();
    if (!form) return fallback;
    const expanded = foundry.utils.expandObject(new FormDataExtended(form).object).worldMap ?? {};
    const tileSize = [256, 512].includes(Number(expanded.tileSize)) ? Number(expanded.tileSize) : fallback.tileSize;
    const overlaysInput = Array.isArray(expanded.overlays)
      ? expanded.overlays
      : Object.values(expanded.overlays ?? {});
    const overlays = overlaysInput
      .map((overlay, index) => ({
        ...this._createDefaultOverlayData(),
        ...(fallback.overlays?.[index] ?? {}),
        id: String(overlay?.id || fallback.overlays?.[index]?.id || randomId()).trim() || randomId(),
        name: String(overlay?.name || "").trim(),
        sourceImage: String(overlay?.sourceImage || "").trim(),
        tileRootPath: String(overlay?.tileRootPath || fallback.overlays?.[index]?.tileRootPath || "").trim(),
        tileUrlTemplate: String(overlay?.tileUrlTemplate || fallback.overlays?.[index]?.tileUrlTemplate || "").trim(),
        manifestPath: String(overlay?.manifestPath || fallback.overlays?.[index]?.manifestPath || "").trim(),
        opacity: clampNumber(overlay?.opacity, fallback.overlays?.[index]?.opacity ?? 1, 0, 1),
        visibleByDefault: Boolean(overlay?.visibleByDefault)
      }))
      .filter((overlay) => overlay.name || overlay.sourceImage || overlay.tileUrlTemplate);
    const categoriesInput = Array.isArray(expanded.categories)
      ? expanded.categories
      : Object.values(expanded.categories ?? {});
    const legacyCategoryInput = categoriesInput.length ? [] : [
      ...(Array.isArray(expanded.pinCategories) ? expanded.pinCategories : Object.values(expanded.pinCategories ?? {})),
      ...(Array.isArray(expanded.objectCategories) ? expanded.objectCategories : Object.values(expanded.objectCategories ?? {})),
      ...(Array.isArray(expanded.regionCategories) ? expanded.regionCategories : Object.values(expanded.regionCategories ?? {}))
    ];
    const fallbackCategories = collectWorldMapCategorySource(fallback);
    const categories = normalizeWorldMapCategoryList((categoriesInput.length ? categoriesInput : legacyCategoryInput)
      .map((entry, index) => ({
        ...this._createDefaultCategoryData(),
        ...(fallbackCategories?.[index] ?? {}),
        id: String(entry?.id || fallbackCategories?.[index]?.id || randomId()).trim() || randomId(),
        type: String(entry?.type || fallbackCategories?.[index]?.type || "category").trim().toLowerCase() === WORLD_MAP_CATEGORY_SEPARATOR_TYPE
          ? WORLD_MAP_CATEGORY_SEPARATOR_TYPE
          : "category",
        name: String(entry?.name || "").trim(),
        iconClass: String(entry?.iconClass || fallbackCategories?.[index]?.iconClass || "fa-location-dot").trim() || "fa-location-dot",
        color: /^#[0-9a-f]{6}$/i.test(String(entry?.color || "").trim()) ? String(entry.color).trim().toLowerCase() : String(fallbackCategories?.[index]?.color || "#33475f").trim().toLowerCase()
      }))
      .filter((entry) => entry.type === WORLD_MAP_CATEGORY_SEPARATOR_TYPE || entry.name));
    return this._syncSharedCategoryAliases({
      ...fallback,
      id: String(expanded.id || fallback.id || "").trim(),
      name: String(expanded.name || "").trim(),
      description: String(expanded.description || "").trim(),
      sourceImage: String(expanded.sourceImage || "").trim(),
      thumbnail: String(expanded.thumbnail || "").trim(),
      tileSize,
      tileRootPath: String(expanded.tileRootPath || fallback.tileRootPath || "").trim(),
      tileUrlTemplate: String(expanded.tileUrlTemplate || fallback.tileUrlTemplate || "").trim(),
      manifestPath: String(expanded.manifestPath || fallback.manifestPath || "").trim(),
      width: clampNumber(expanded.width, fallback.width, tileSize, 262144),
      height: clampNumber(expanded.height, fallback.height, tileSize, 262144),
      minZoom: clampNumber(expanded.minZoom, fallback.minZoom, -8, 24),
      maxZoom: clampNumber(expanded.maxZoom, fallback.maxZoom, -8, 24),
      zoomStep: clampNumber(expanded.zoomStep, fallback.zoomStep, 0.1, 2),
      maxNativeZoom: clampNumber(expanded.maxNativeZoom, fallback.maxNativeZoom, 0, 24),
      initialView: {
        x: clampNumber(expanded?.initialView?.x, fallback.initialView.x, 0, Math.max(tileSize, Number(expanded.width) || fallback.width)),
        y: clampNumber(expanded?.initialView?.y, fallback.initialView.y, 0, Math.max(tileSize, Number(expanded.height) || fallback.height)),
        zoom: clampNumber(expanded?.initialView?.zoom, fallback.initialView.zoom, -8, 24)
      },
      categories: categories.length ? categories : getDefaultWorldMapCategories(),
      overlays,
      fogSettings: {
        ...TheatreStore._normalizeWorldMapFogSettings(fallback.fogSettings),
        enabled: Boolean(expanded?.fogSettings?.enabled),
        mode: normalizeFogMode(expanded?.fogSettings?.mode || fallback?.fogSettings?.mode),
        color: /^#[0-9a-f]{6}$/i.test(String(expanded?.fogSettings?.color || "").trim())
          ? String(expanded.fogSettings.color).trim().toLowerCase()
          : String(fallback?.fogSettings?.color || FOG_DEFAULTS.color).trim().toLowerCase(),
        opacity: normalizeFogOpacity(expanded?.fogSettings?.opacity, fallback?.fogSettings?.opacity ?? FOG_DEFAULTS.opacity),
        imagePath: String(expanded?.fogSettings?.imagePath || "").trim(),
        imageTileSize: normalizeFogImageTileSize(expanded?.fogSettings?.imageTileSize, fallback?.fogSettings?.imageTileSize ?? FOG_DEFAULTS.imageTileSize),
        imageTileFixedOnZoom: Boolean(expanded?.fogSettings?.imageTileFixedOnZoom),
        imageTileViewportLocked: Boolean(expanded?.fogSettings?.imageTileViewportLocked),
        operations: Array.isArray(fallback?.fogSettings?.operations) ? fallback.fogSettings.operations : []
      },
      styling: {
        ...TheatreStore._getDefaultWorldMapStyling(),
        ...(fallback.styling ?? {}),
        tooltip: {
          ...TheatreStore._getDefaultWorldMapStyling().tooltip,
          ...(fallback.styling?.tooltip ?? {}),
          backgroundColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.tooltip?.backgroundColor || "").trim())
            ? String(expanded.styling.tooltip.backgroundColor).trim().toLowerCase()
            : String(fallback?.styling?.tooltip?.backgroundColor || TheatreStore._getDefaultWorldMapStyling().tooltip.backgroundColor).trim().toLowerCase(),
          backgroundOpacity: clampNumber(expanded?.styling?.tooltip?.backgroundOpacity, fallback?.styling?.tooltip?.backgroundOpacity ?? TheatreStore._getDefaultWorldMapStyling().tooltip.backgroundOpacity, 0, 1),
          blurEnabled: Boolean(expanded?.styling?.tooltip?.blurEnabled),
          headingFont: String(expanded?.styling?.tooltip?.headingFont || "").trim(),
          headingColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.tooltip?.headingColor || "").trim())
            ? String(expanded.styling.tooltip.headingColor).trim().toLowerCase()
            : String(fallback?.styling?.tooltip?.headingColor || TheatreStore._getDefaultWorldMapStyling().tooltip.headingColor).trim().toLowerCase(),
          headingSize: clampNumber(expanded?.styling?.tooltip?.headingSize, fallback?.styling?.tooltip?.headingSize ?? TheatreStore._getDefaultWorldMapStyling().tooltip.headingSize, 0.5, 2.4),
          textFont: String(expanded?.styling?.tooltip?.textFont || "").trim(),
          textColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.tooltip?.textColor || "").trim())
            ? String(expanded.styling.tooltip.textColor).trim().toLowerCase()
            : String(fallback?.styling?.tooltip?.textColor || TheatreStore._getDefaultWorldMapStyling().tooltip.textColor).trim().toLowerCase(),
          textSize: clampNumber(expanded?.styling?.tooltip?.textSize, fallback?.styling?.tooltip?.textSize ?? TheatreStore._getDefaultWorldMapStyling().tooltip.textSize, 0.5, 2.4),
          infoFont: String(expanded?.styling?.tooltip?.infoFont || "").trim(),
          infoColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.tooltip?.infoColor || "").trim())
            ? String(expanded.styling.tooltip.infoColor).trim().toLowerCase()
            : String(fallback?.styling?.tooltip?.infoColor || TheatreStore._getDefaultWorldMapStyling().tooltip.infoColor).trim().toLowerCase(),
          infoSize: clampNumber(expanded?.styling?.tooltip?.infoSize, fallback?.styling?.tooltip?.infoSize ?? TheatreStore._getDefaultWorldMapStyling().tooltip.infoSize, 0.5, 2.4)
        },
        general: {
          ...TheatreStore._getDefaultWorldMapStyling().general,
          ...(fallback.styling?.general ?? {}),
          legendFont: String(expanded?.styling?.general?.legendFont || "").trim(),
          legendColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.general?.legendColor || "").trim())
            ? String(expanded.styling.general.legendColor).trim().toLowerCase()
            : String(fallback?.styling?.general?.legendColor || TheatreStore._getDefaultWorldMapStyling().general.legendColor).trim().toLowerCase(),
          legendSize: clampNumber(expanded?.styling?.general?.legendSize, fallback?.styling?.general?.legendSize ?? TheatreStore._getDefaultWorldMapStyling().general.legendSize, 0.45, 1.6),
          pinListHeadingFont: String(expanded?.styling?.general?.pinListHeadingFont || "").trim(),
          pinListHeadingColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.general?.pinListHeadingColor || "").trim())
            ? String(expanded.styling.general.pinListHeadingColor).trim().toLowerCase()
            : String(fallback?.styling?.general?.pinListHeadingColor || TheatreStore._getDefaultWorldMapStyling().general.pinListHeadingColor).trim().toLowerCase(),
          pinListHeadingSize: clampNumber(expanded?.styling?.general?.pinListHeadingSize, fallback?.styling?.general?.pinListHeadingSize ?? TheatreStore._getDefaultWorldMapStyling().general.pinListHeadingSize, 0.5, 2.4),
          pinListTextFont: String(expanded?.styling?.general?.pinListTextFont || "").trim(),
          pinListTextColor: /^#[0-9a-f]{6}$/i.test(String(expanded?.styling?.general?.pinListTextColor || "").trim())
            ? String(expanded.styling.general.pinListTextColor).trim().toLowerCase()
            : String(fallback?.styling?.general?.pinListTextColor || TheatreStore._getDefaultWorldMapStyling().general.pinListTextColor).trim().toLowerCase(),
          pinListTextSize: clampNumber(expanded?.styling?.general?.pinListTextSize, fallback?.styling?.general?.pinListTextSize ?? TheatreStore._getDefaultWorldMapStyling().general.pinListTextSize, 0.5, 2.4)
        }
      },
      fullscreenSettings: {
        ...TheatreStore._getDefaultWorldMapFullscreenSettings(),
        ...(fallback.fullscreenSettings ?? {}),
        preserveAspect: Boolean(expanded?.fullscreenSettings?.preserveAspect),
        uiHidden: Boolean(expanded?.fullscreenSettings?.uiHidden),
        sharedLeftSidebarVisible: Boolean(expanded?.fullscreenSettings?.sharedLeftSidebarVisible),
        sharedRightSidebarVisible: Boolean(expanded?.fullscreenSettings?.sharedRightSidebarVisible),
        backdropBlurEnabled: Boolean(expanded?.fullscreenSettings?.backdropBlurEnabled),
        backdropImage: String(expanded?.fullscreenSettings?.backdropImage || "").trim(),
        backdropImageScale: clampNumber(expanded?.fullscreenSettings?.backdropImageScale, fallback?.fullscreenSettings?.backdropImageScale ?? 1, 0.1, 4),
        backdropImageRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(String(expanded?.fullscreenSettings?.backdropImageRepeat || "").trim())
          ? String(expanded.fullscreenSettings.backdropImageRepeat).trim()
          : String(fallback?.fullscreenSettings?.backdropImageRepeat || "repeat"),
        backdropDarkness: clampNumber(expanded?.fullscreenSettings?.backdropDarkness, fallback?.fullscreenSettings?.backdropDarkness ?? 0.2, 0, 0.92)
      },
      sidebarCollapsedDefault: Boolean(expanded.sidebarCollapsedDefault),
      pinSidebarCollapsedDefault: Boolean(expanded.pinSidebarCollapsedDefault)
    });
  }

  async getData() {
    const worldMap = this._getMapDraft();
    this.options.title = worldMap?.name || tr("World Map Config");
    const hasTiles = Boolean(worldMap.tileUrlTemplate);
    const manifestData = await this._loadWorldMapManifestData(worldMap.manifestPath);
    const systemCritical = this._getSystemCriticalMapValues(worldMap, manifestData);
    return {
      map: worldMap,
      isExistingMap: Boolean(this.mapId),
      sectionSetupCollapsed: this._collapsedSections.has("setup"),
      sectionFogCollapsed: this._collapsedSections.has("fog"),
      sectionFullscreenCollapsed: this._collapsedSections.has("fullscreen"),
      sectionCategoriesCollapsed: this._collapsedSections.has("categories"),
      sectionStylingCollapsed: this._collapsedSections.has("styling"),
      sectionAdvancedCollapsed: this._collapsedSections.has("advanced"),
      hasTiles,
      canOpenMap: hasTiles,
      systemCritical,
      fogModeOptions: [
        { value: "color", label: tr("Color") },
        { value: "image", label: tr("Image") }
      ],
      overlays: Array.isArray(worldMap.overlays)
        ? worldMap.overlays.map((overlay, index) => ({
            ...this._createDefaultOverlayData(),
            ...overlay,
            index,
            opacity: clampNumber(overlay.opacity, 1, 0, 1)
          }))
        : [],
      categories: getWorldMapCategories(worldMap)
        .map((entry, index) => ({
          ...this._createDefaultCategoryData(),
          ...entry,
          index,
          isSeparator: isWorldMapCategorySeparator(entry)
        })),
      tileSizeOptions: [
        { value: "256", label: "256 px", selected: Number(worldMap.tileSize) === 256 },
        { value: "512", label: "512 px", selected: Number(worldMap.tileSize) === 512 }
      ],
      backdropRepeatOptions: [
        { value: "no-repeat", label: tr("No tiling") },
        { value: "repeat", label: tr("Repeat") },
        { value: "repeat-x", label: tr("Repeat X") },
        { value: "repeat-y", label: tr("Repeat Y") }
      ],
      fontOptions: this._getFontTypeOptions(),
      tileProgress: this._tileProgress,
      themeInlineStyle: buildThemeInlineStyle(TheatreStore.getThemeState()),
      inline: Boolean(this._inlineHost)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    applyThemeInlineStyleToHost(html[0], TheatreStore.getThemeState());
    this.setInlineForm(html[0]?.closest?.("form") ?? this._inlineForm);
    this._bindConfigListeners(html);
  }

  activateInlineListeners(html, form) {
    this.setInlineForm(form ?? html?.[0]?.closest?.("form") ?? this._inlineForm);
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    this._bindConfigListeners(html);
  }

  _bindConfigListeners(html) {
    this._syncColorSwatchVariables(html?.[0]);
    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
    html.find("[data-action='add-map-overlay']").on("click", this._onAddOverlay.bind(this));
    html.find("[data-action='remove-map-overlay']").on("click", this._onRemoveOverlay.bind(this));
    html.find("[data-action='add-map-category']").on("click", this._onAddCategory.bind(this));
    html.find("[data-action='add-map-category-separator']").on("click", this._onAddCategorySeparator.bind(this));
    html.find("[data-action='remove-map-category']").on("click", this._onRemoveCategory.bind(this));
    html.find("[data-action='pick-map-category-icon']").on("click", this._onPickCategoryIcon.bind(this));
    html.find("[data-action='drag-map-category']")
      .on("dragstart", this._onCategoryDragStart.bind(this))
      .on("dragend", this._onCategoryDragEnd.bind(this));
    html.find(".tom-map-editmode__category-row")
      .on("dragover", this._onCategoryDragOver.bind(this))
      .on("dragleave", this._onCategoryDragLeave.bind(this))
      .on("drop", this._onCategoryDrop.bind(this));
    html.find("[name^='worldMap.categories.']").on("input change", this._onCategoryInputChange.bind(this));
    html.find("[data-action='generate-map-tiles']").on("click", this._onGenerateMapTiles.bind(this));
    html.find("[data-action='toggle-map-config-section']").on("click", this._onToggleSection.bind(this));
    html.find("[data-action='open-world-map']").on("click", this._onOpenWorldMap.bind(this));
    html.find("[data-action='create-world-map-macro']").on("click", this._onCreateWorldMapMacro.bind(this));
    html.find("[name^='worldMap.styling.']").on("input change", this._onLiveStylePreviewInput.bind(this));
    html.find("[data-fog-image-tile-size]").on("input change", this._onFogImageTileSizeInput.bind(this));
    html.find("input[type='color']").on("input change", this._onColorSwatchInput.bind(this));
  }

  _normalizeColorSwatchValue(value, fallback = "#ffffff") {
    const normalized = String(value ?? "").trim();
    return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
  }

  _syncColorSwatchVariables(root) {
    const element = root?.jquery ? root[0] : root;
    element?.querySelectorAll?.("input[type='color']")?.forEach((input) => {
      const color = this._normalizeColorSwatchValue(input.value);
      input.style.setProperty("--tom-color-swatch-value", color);
    });
  }

  _formatSystemCriticalValue(value, suffix = "") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    return `${numeric}${suffix}`;
  }

  async _loadWorldMapManifestData(manifestPath) {
    const path = String(manifestPath || "").trim();
    if (!path) return null;
    try {
      const url = normalizePublicAssetPath(path);
      const separator = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${separator}v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      return data && typeof data === "object" ? data : null;
    } catch (_error) {
      return null;
    }
  }

  _getSystemCriticalMapValues(worldMap, manifestData) {
    const hasGeneratedTiles = Boolean(worldMap?.tileUrlTemplate || worldMap?.manifestPath);
    if (!hasGeneratedTiles) return {};
    const manifest = manifestData && typeof manifestData === "object" ? manifestData : {};
    const getValue = (key) => {
      const manifestValue = Number(manifest[key]);
      if (Number.isFinite(manifestValue)) return manifestValue;
      const mapValue = Number(worldMap?.[key]);
      return Number.isFinite(mapValue) ? mapValue : null;
    };
    return {
      tileSize: this._formatSystemCriticalValue(getValue("tileSize"), " px"),
      width: this._formatSystemCriticalValue(getValue("width"), " px"),
      height: this._formatSystemCriticalValue(getValue("height"), " px"),
      minZoom: this._formatSystemCriticalValue(getValue("minZoom")),
      maxNativeZoom: this._formatSystemCriticalValue(getValue("maxNativeZoom"))
    };
  }

  _onColorSwatchInput(event) {
    const input = event.currentTarget;
    const color = this._normalizeColorSwatchValue(input?.value);
    input?.style?.setProperty?.("--tom-color-swatch-value", color);
  }

  _onFogImageTileSizeInput(event) {
    const input = event.currentTarget;
    const display = input?.closest?.(".tom-range-with-value")?.querySelector?.("[data-fog-image-tile-size-value]");
    if (display) display.textContent = `${Math.round(Number(input.value) || 256)} px`;
  }

  _onPickImage(event) {
    event.preventDefault();
    const target = event.currentTarget?.dataset?.target;
    const pickerType = event.currentTarget?.dataset?.pickerType || "image";
    openImagePickerForInput(this._getFormElement(), target, pickerType);
  }

  _onToggleSection(event) {
    event.preventDefault();
    const toggle = event.currentTarget;
    const sectionKey = String(toggle?.dataset?.worldMapConfigSectionKey || "").trim();
    if (!sectionKey) return;
    if (this._collapsedSections.has(sectionKey)) this._collapsedSections.delete(sectionKey);
    else this._collapsedSections.add(sectionKey);
    const section = toggle.closest("[data-world-map-config-section]");
    const isExpanded = !this._collapsedSections.has(sectionKey);
    if (section) {
      section.classList.toggle("is-collapsed", !isExpanded);
      section.classList.toggle("is-expanded", isExpanded);
    }
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  }

  _onAddOverlay(event) {
    event.preventDefault();
    const draft = this._readWorldMapDataFromForm();
    draft.overlays = Array.isArray(draft.overlays) ? draft.overlays : [];
    draft.overlays.push(this._createDefaultOverlayData());
    this.mapId = draft.id || this.mapId;
    this._replaceMapDraft(draft);
  }

  _onRemoveOverlay(event) {
    event.preventDefault();
    const overlayId = String(event.currentTarget?.dataset?.overlayId || "").trim();
    const draft = this._readWorldMapDataFromForm();
    draft.overlays = (Array.isArray(draft.overlays) ? draft.overlays : []).filter((overlay) => overlay.id !== overlayId);
    this._replaceMapDraft(draft);
  }

  _onAddCategory(event) {
    event.preventDefault();
    const draft = this._readWorldMapDataFromForm();
    draft.categories = Array.isArray(draft.categories) ? draft.categories : [];
    const category = this._createDefaultCategoryData();
    draft.categories.push(category);
    this._syncSharedCategoryAliases(draft);
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this._queueCategoryAutoSave(draft, { immediate: true });
    if (this._appendCategoryRowInPlace(category, draft.categories)) {
      this._applyLiveStylePreview();
      return;
    }
    this._replaceMapDraft(draft, { preserveScroll: true });
  }

  _onAddCategorySeparator(event) {
    event.preventDefault();
    const draft = this._readWorldMapDataFromForm();
    draft.categories = Array.isArray(draft.categories) ? draft.categories : [];
    const separator = this._createDefaultCategorySeparatorData();
    draft.categories.push(separator);
    this._syncSharedCategoryAliases(draft);
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this._queueCategoryAutoSave(draft, { immediate: true });
    if (this._appendCategoryRowInPlace(separator, draft.categories)) {
      this._applyLiveStylePreview();
      return;
    }
    this._replaceMapDraft(draft, { preserveScroll: true });
  }

  _onRemoveCategory(event) {
    event.preventDefault();
    const categoryId = String(event.currentTarget?.dataset?.categoryId || "").trim();
    const draft = this._readWorldMapDataFromForm();
    draft.categories = (Array.isArray(draft.categories) ? draft.categories : []).filter((entry) => entry.id !== categoryId);
    this._syncSharedCategoryAliases(draft);
    this._queueCategoryAutoSave(draft, { immediate: true });
    this._replaceMapDraft(draft);
  }

  async _onPickCategoryIcon(event) {
    event.preventDefault();
    const categoryId = String(event.currentTarget?.dataset?.categoryId || "").trim();
    if (!categoryId) return;
    const iconClass = await this._promptForCategoryIcon();
    if (!iconClass) return;
    const draft = this._readWorldMapDataFromForm();
    draft.categories = (Array.isArray(draft.categories) ? draft.categories : []).map((entry) => (
      entry.id === categoryId ? { ...entry, iconClass } : entry
    ));
    this._syncSharedCategoryAliases(draft);
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this._queueCategoryAutoSave(draft, { immediate: true });
    if (this._updateCategoryIconInPlace(categoryId, iconClass, draft.categories)) {
      this._applyLiveStylePreview();
      return;
    }
    this._replaceMapDraft(draft, { preserveScroll: true, anchorCategoryId: categoryId });
  }

  _onCategoryDragStart(event) {
    const handle = event.currentTarget;
    const row = handle?.closest?.(".tom-map-editmode__category-row");
    const categoryId = String(handle?.dataset?.categoryId || row?.dataset?.categoryId || "").trim();
    if (!categoryId) return;
    this._categoryDragState = { categoryId };
    row?.classList?.add("is-dragging");
    const nativeEvent = event.originalEvent ?? event;
    const dataTransfer = nativeEvent?.dataTransfer;
    if (dataTransfer) {
      dataTransfer.effectAllowed = "move";
      dataTransfer.setData("text/plain", categoryId);
    }
  }

  _onCategoryDragOver(event) {
    const row = event.currentTarget;
    const targetId = String(row?.dataset?.categoryId || "").trim();
    const nativeEvent = event.originalEvent ?? event;
    const draggedId = String(this._categoryDragState?.categoryId || nativeEvent?.dataTransfer?.getData("text/plain") || "").trim();
    if (!draggedId || !targetId || draggedId === targetId) return;
    event.preventDefault();
    this._markCategoryDropTarget(row, nativeEvent?.clientY ?? event.clientY);
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
  }

  _onCategoryDragLeave(event) {
    const row = event.currentTarget;
    if (row?.contains?.(event.relatedTarget)) return;
    row?.classList?.remove("is-drop-before", "is-drop-after");
  }

  _onCategoryDrop(event) {
    const row = event.currentTarget;
    const targetId = String(row?.dataset?.categoryId || "").trim();
    const nativeEvent = event.originalEvent ?? event;
    const draggedId = String(this._categoryDragState?.categoryId || nativeEvent?.dataTransfer?.getData("text/plain") || "").trim();
    if (!draggedId || !targetId || draggedId === targetId) {
      this._clearCategoryDragClasses();
      return;
    }
    event.preventDefault();
    const beforeTarget = this._isBeforeCategoryDropTarget(row, nativeEvent?.clientY ?? event.clientY);
    const draft = this._readWorldMapDataFromForm();
    const categories = Array.isArray(draft.categories) ? [...draft.categories] : [];
    const fromIndex = categories.findIndex((entry) => String(entry?.id || "") === draggedId);
    const targetIndex = categories.findIndex((entry) => String(entry?.id || "") === targetId);
    if (fromIndex < 0 || targetIndex < 0) {
      this._clearCategoryDragClasses();
      return;
    }
    const [moved] = categories.splice(fromIndex, 1);
    const currentTargetIndex = categories.findIndex((entry) => String(entry?.id || "") === targetId);
    const insertIndex = beforeTarget ? currentTargetIndex : currentTargetIndex + 1;
    categories.splice(Math.max(0, Math.min(categories.length, insertIndex)), 0, moved);
    draft.categories = categories;
    this._syncSharedCategoryAliases(draft);
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this._queueCategoryAutoSave(draft, { immediate: true });
    const reorderedInPlace = this._reorderCategoryRowsInPlace(draggedId, targetId, beforeTarget, categories);
    this._clearCategoryDragClasses();
    this._categoryDragState = null;
    if (reorderedInPlace) {
      this._applyLiveStylePreview();
      return;
    }
    this._replaceMapDraft(draft, { preserveScroll: true, anchorCategoryId: draggedId });
  }

  _onCategoryDragEnd() {
    this._categoryDragState = null;
    this._clearCategoryDragClasses();
  }

  _onCategoryInputChange(event) {
    if (event?.currentTarget?.type === "color") this._onColorSwatchInput(event);
    const draft = this._readWorldMapDataFromForm();
    this._syncSharedCategoryAliases(draft);
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this._applyLiveStylePreview();
    this._queueCategoryAutoSave(draft);
  }

  _queueCategoryAutoSave(draft = null, { immediate = false } = {}) {
    const nextDraft = draft ?? this._readWorldMapDataFromForm();
    const targetMapId = String(nextDraft?.id || this.mapId || "").trim();
    if (!targetMapId) return;
    if (this._categoryAutoSaveTimeout) {
      window.clearTimeout(this._categoryAutoSaveTimeout);
      this._categoryAutoSaveTimeout = null;
    }
    const save = async () => {
      try {
        const latestDraft = immediate && draft ? nextDraft : this._readWorldMapDataFromForm();
        const latestMapId = String(latestDraft?.id || this.mapId || targetMapId).trim();
        if (!latestMapId) return;
        globalThis.__TOM_SUPPRESS_MAP_LIBRARY_REFRESH_UNTIL = Date.now() + 1200;
        const savedMap = await TheatreStore.upsertWorldMap({
          ...latestDraft,
          id: latestMapId
        });
        this.mapId = savedMap.id;
        this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), savedMap, { inplace: false });
        this._applyLiveStylePreview();
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not auto-save world map categories`, error);
      }
    };
    if (immediate) {
      void save();
      return;
    }
    this._categoryAutoSaveTimeout = window.setTimeout(save, 350);
  }

  _markCategoryDropTarget(row, clientY) {
    this._clearCategoryDropClasses();
    if (!row) return;
    const beforeTarget = this._isBeforeCategoryDropTarget(row, clientY);
    row.classList.toggle("is-drop-before", beforeTarget);
    row.classList.toggle("is-drop-after", !beforeTarget);
  }

  _isBeforeCategoryDropTarget(row, clientY) {
    const rect = row?.getBoundingClientRect?.();
    if (!rect) return true;
    return Number(clientY) < rect.top + (rect.height / 2);
  }

  _clearCategoryDropClasses() {
    const root = this.element?.[0] ?? this._inlineHost?.element?.[0] ?? this._inlineHost;
    root?.querySelectorAll?.(".tom-map-editmode__category-row.is-drop-before, .tom-map-editmode__category-row.is-drop-after")
      ?.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
  }

  _clearCategoryDragClasses() {
    const root = this.element?.[0] ?? this._inlineHost?.element?.[0] ?? this._inlineHost;
    root?.querySelectorAll?.(".tom-map-editmode__category-row.is-dragging, .tom-map-editmode__category-row.is-drop-before, .tom-map-editmode__category-row.is-drop-after")
      ?.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _sanitizeIconClass(value, fallback = "fa-location-dot") {
    const iconClass = String(value || "").trim();
    return /^fa[srldb]?\s+fa-[a-z0-9-]+$/i.test(iconClass) || /^fa-[a-z0-9-]+$/i.test(iconClass)
      ? iconClass
      : fallback;
  }

  _sanitizeHexColor(value, fallback = "#33475f") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  _ensureCategoryHiddenFields(categories = []) {
    const root = this._getMapConfigRoot();
    if (!root) return;
    const fields = ["id", "type", "iconClass"];
    const hiddenValue = (entry, field) => {
      if (field === "id") return String(entry?.id || "").trim();
      if (field === "type") return isWorldMapCategorySeparator(entry) ? WORLD_MAP_CATEGORY_SEPARATOR_TYPE : "category";
      if (field === "iconClass") return this._sanitizeIconClass(entry?.iconClass || "fa-location-dot");
      return "";
    };
    for (const field of fields) {
      const selector = `input[type="hidden"][name^="worldMap.categories."][name$=".${field}"]`;
      const existing = Array.from(root.querySelectorAll(selector));
      while (existing.length < categories.length) {
        const input = document.createElement("input");
        input.type = "hidden";
        root.appendChild(input);
        existing.push(input);
      }
      while (existing.length > categories.length) existing.pop()?.remove?.();
      categories.forEach((entry, index) => {
        const input = existing[index];
        input.name = `worldMap.categories.${index}.${field}`;
        input.value = hiddenValue(entry, field);
      });
    }
  }

  _buildCategoryRowMarkup(entry, index) {
    const id = this._escapeHtml(entry?.id || randomId());
    const color = this._sanitizeHexColor(entry?.color, isWorldMapCategorySeparator(entry) ? "#7a93ad" : "#33475f");
    if (isWorldMapCategorySeparator(entry)) {
      return `
        <section class="tom-map-editmode__category-row tom-map-editmode__category-row--separator" data-category-id="${id}">
          <button type="button" class="tom-map-editmode__category-drag-handle" draggable="true" data-action="drag-map-category" data-category-id="${id}" title="${this._escapeHtml(tr("Reorder divider"))}" aria-label="${this._escapeHtml(tr("Reorder divider"))}">
            <i class="fas fa-grip-vertical" aria-hidden="true"></i>
          </button>
          <span class="tom-map-editmode__category-separator-preview" style="--tom-map-category-separator-color: ${color};" aria-hidden="true"></span>
          <input type="hidden" name="worldMap.categories.${index}.name" value="${this._escapeHtml(entry?.name || tr("Divider"))}" />
          <input class="tom-world-map-config__color-swatch" type="color" name="worldMap.categories.${index}.color" value="${color}" aria-label="${this._escapeHtml(tr("Divider color"))}" title="${this._escapeHtml(tr("Divider color"))}" />
          <button type="button" class="tom-map-editmode__delete-icon" data-action="remove-map-category" data-category-id="${id}" title="${this._escapeHtml(tr("Delete"))}" aria-label="${this._escapeHtml(tr("Delete"))}">
            <i class="fas fa-trash-can" aria-hidden="true"></i>
          </button>
        </section>
      `;
    }
    const iconClass = this._escapeHtml(this._sanitizeIconClass(entry?.iconClass || "fa-location-dot"));
    return `
      <section class="tom-map-editmode__category-row" data-category-id="${id}">
        <button type="button" class="tom-map-editmode__category-drag-handle" draggable="true" data-action="drag-map-category" data-category-id="${id}" title="${this._escapeHtml(tr("Reorder category"))}" aria-label="${this._escapeHtml(tr("Reorder category"))}">
          <i class="fas fa-grip-vertical" aria-hidden="true"></i>
        </button>
        <button type="button" class="tom-map-editmode__icon-button tom-map-editmode__category-icon" data-action="pick-map-category-icon" data-category-id="${id}" title="${this._escapeHtml(tr("Choose icon"))}" aria-label="${this._escapeHtml(tr("Choose icon"))}">
          <i class="fas ${iconClass}" aria-hidden="true"></i>
        </button>
        <input type="text" name="worldMap.categories.${index}.name" value="${this._escapeHtml(entry?.name || tr("Category"))}" aria-label="${this._escapeHtml(tr("Category"))}" />
        <input class="tom-world-map-config__color-swatch" type="color" name="worldMap.categories.${index}.color" value="${color}" aria-label="${this._escapeHtml(tr("Color"))}" title="${this._escapeHtml(tr("Color"))}" />
        <button type="button" class="tom-map-editmode__delete-icon" data-action="remove-map-category" data-category-id="${id}" title="${this._escapeHtml(tr("Delete"))}" aria-label="${this._escapeHtml(tr("Delete"))}">
          <i class="fas fa-trash-can" aria-hidden="true"></i>
        </button>
      </section>
    `;
  }

  _bindCategoryRowListeners(row) {
    if (!row) return;
    row.querySelector?.("[data-action='drag-map-category']")
      ?.addEventListener("dragstart", this._onCategoryDragStart.bind(this));
    row.querySelector?.("[data-action='drag-map-category']")
      ?.addEventListener("dragend", this._onCategoryDragEnd.bind(this));
    row.addEventListener("dragover", this._onCategoryDragOver.bind(this));
    row.addEventListener("dragleave", this._onCategoryDragLeave.bind(this));
    row.addEventListener("drop", this._onCategoryDrop.bind(this));
    row.querySelector?.("[data-action='pick-map-category-icon']")
      ?.addEventListener("click", this._onPickCategoryIcon.bind(this));
    row.querySelector?.("[data-action='remove-map-category']")
      ?.addEventListener("click", this._onRemoveCategory.bind(this));
    row.querySelectorAll?.("input[type='color']").forEach((input) => {
      input.addEventListener("input", this._onColorSwatchInput.bind(this));
    });
    row.querySelectorAll?.("[name^='worldMap.categories.']").forEach((input) => {
      input.addEventListener("input", this._onCategoryInputChange.bind(this));
      input.addEventListener("change", this._onCategoryInputChange.bind(this));
    });
  }

  _appendCategoryRowInPlace(entry, categories = []) {
    const root = this._getMapConfigRoot();
    const list = root?.querySelector?.(".tom-map-editmode__category-list");
    if (!root || !list) return false;
    this._ensureCategoryHiddenFields(categories);
    const template = document.createElement("template");
    template.innerHTML = this._buildCategoryRowMarkup(entry, categories.length - 1).trim();
    const row = template.content.firstElementChild;
    if (!row) return false;
    list.appendChild(row);
    this._bindCategoryRowListeners(row);
    this._syncCategoryFormIndexes(categories);
    return true;
  }

  _updateCategoryIconInPlace(categoryId, iconClass, categories = []) {
    const row = this._getCategoryRowElement(categoryId);
    const icon = row?.querySelector?.(".tom-map-editmode__category-icon i");
    if (!icon) return false;
    const nextIconClass = this._sanitizeIconClass(iconClass);
    icon.className = `fas ${nextIconClass}`;
    this._ensureCategoryHiddenFields(categories);
    this._syncCategoryFormIndexes(categories);
    return true;
  }

  _reorderCategoryRowsInPlace(draggedId, targetId, beforeTarget, categories = []) {
    const root = this._getMapConfigRoot();
    const list = root?.querySelector?.(".tom-map-editmode__category-list");
    if (!list) return false;
    const draggedRow = root.querySelector?.(`.tom-map-editmode__category-row[data-category-id="${this._escapeAttributeValue(draggedId)}"]`);
    const targetRow = root.querySelector?.(`.tom-map-editmode__category-row[data-category-id="${this._escapeAttributeValue(targetId)}"]`);
    if (!draggedRow || !targetRow || draggedRow === targetRow) return false;
    list.insertBefore(draggedRow, beforeTarget ? targetRow : targetRow.nextElementSibling);
    this._ensureCategoryHiddenFields(categories);
    this._syncCategoryFormIndexes(categories);
    return true;
  }

  _syncCategoryFormIndexes(categories = []) {
    const root = this._getMapConfigRoot();
    if (!root) return;
    this._ensureCategoryHiddenFields(categories);

    const rows = Array.from(root.querySelectorAll(".tom-map-editmode__category-list > .tom-map-editmode__category-row"));
    rows.forEach((row, index) => {
      row.querySelectorAll?.("[name^='worldMap.categories.']")?.forEach((input) => {
        const match = String(input.name || "").match(/^worldMap\.categories\.\d+\.(.+)$/);
        if (!match?.[1]) return;
        input.name = `worldMap.categories.${index}.${match[1]}`;
      });
    });
  }

  async _promptForCategoryIcon() {
    return await new Promise((resolve) => {
      const content = `
        <div class="tom-theme-root tom-theme-default tom-world-map-config__icon-picker">
          ${MAP_PIN_ICON_OPTIONS.map((iconClass) => `
            <button type="button" class="tom-world-map-config__icon-choice" data-icon-class="${iconClass}">
              <i class="fas ${iconClass}" aria-hidden="true"></i>
            </button>
          `).join("")}
        </div>
      `;
      const dialog = new Dialog({
        title: tr("Choose icon"),
        content,
        buttons: {
          cancel: { label: tr("Cancel"), callback: () => resolve(null) }
        },
        close: () => resolve(null)
      });
      dialog.render(true);
      window.setTimeout(() => {
        const root = dialog.element?.[0];
        applyTheatreDialogTheme(dialog, MODULE_ID, "26rem");
        root?.classList?.add("tom-world-map-icon-picker-host");
        if (root) applyThemeInlineStyleToHost(root, TheatreStore.getThemeState());
        root?.querySelectorAll?.("[data-icon-class]")?.forEach((button) => {
          button.addEventListener("click", (clickEvent) => {
            clickEvent.preventDefault();
            resolve(String(clickEvent.currentTarget?.dataset?.iconClass || "").trim() || null);
            dialog.close();
          }, { once: true });
        });
      }, 30);
    });
  }

  _escapeAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  _getMapConfigRoot() {
    return this._getFormElement?.()
      ?? this.element?.[0]?.querySelector?.(".tom-world-map-config")
      ?? this._inlineHost?.form?.querySelector?.(".tom-world-map-config")
      ?? this._inlineHost?.element?.[0]?.querySelector?.(".tom-world-map-config")
      ?? this.element?.[0]
      ?? this._inlineHost?.form
      ?? this._inlineHost?.element?.[0]
      ?? null;
  }

  _getCategoryRowElement(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id) return null;
    return this._getMapConfigRoot()?.querySelector?.(`.tom-map-editmode__category-row[data-category-id="${this._escapeAttributeValue(id)}"]`) ?? null;
  }

  _getNearestScrollContainer(element) {
    const ElementCtor = globalThis.Element;
    if (!ElementCtor || !(element instanceof ElementCtor)) return document?.scrollingElement ?? null;
    let current = element.parentElement;
    while (current) {
      const style = globalThis.getComputedStyle?.(current);
      const overflow = `${style?.overflow || ""} ${style?.overflowX || ""} ${style?.overflowY || ""}`;
      const canScroll = /\b(auto|scroll|overlay)\b/i.test(overflow);
      const hasScrollRoom = current.scrollHeight > current.clientHeight + 1 || current.scrollWidth > current.clientWidth + 1;
      if (canScroll && hasScrollRoom) return current;
      current = current.parentElement;
    }
    return document?.scrollingElement ?? null;
  }

  _captureScrollState({ anchorCategoryId = "" } = {}) {
    const ElementCtor = globalThis.Element;
    if (!ElementCtor) return [];
    const anchorElement = this._getCategoryRowElement(anchorCategoryId);
    const anchor = anchorElement
      ? {
        categoryId: String(anchorCategoryId || "").trim(),
        top: anchorElement.getBoundingClientRect?.().top ?? 0
      }
      : null;
    const roots = [
      this._getMapConfigRoot(),
      this.element?.[0],
      this._inlineHost?.form,
      this._inlineHost?.element?.[0],
      document?.scrollingElement
    ].filter(Boolean);
    const seen = new Set();
    const scrollTargets = [];
    const addTarget = (element) => {
      if (!(element instanceof ElementCtor) || seen.has(element)) return;
      const isDocumentScroller = element === document?.scrollingElement;
      const style = isDocumentScroller ? null : globalThis.getComputedStyle?.(element);
      const overflow = `${style?.overflow || ""} ${style?.overflowX || ""} ${style?.overflowY || ""}`;
      const canScroll = isDocumentScroller || /\b(auto|scroll|overlay)\b/i.test(overflow);
      const hasScrollRoom = isDocumentScroller || element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
      if (!canScroll || !hasScrollRoom) return;
      seen.add(element);
      scrollTargets.push({
        element,
        scrollTop: element.scrollTop ?? 0,
        scrollLeft: element.scrollLeft ?? 0
      });
    };

    for (const root of roots) {
      let element = root instanceof ElementCtor ? root : null;
      while (element) {
        addTarget(element);
        element = element.parentElement;
      }
    }
    return { scrollTargets, anchor };
  }

  _restoreScrollState(scrollState = {}) {
    const scrollTargets = Array.isArray(scrollState) ? scrollState : (scrollState.scrollTargets ?? []);
    const anchor = Array.isArray(scrollState) ? null : scrollState.anchor;
    const restore = () => {
      for (const target of scrollTargets) {
        const element = target?.element;
        if (!element || (!element.isConnected && element !== document?.scrollingElement)) continue;
        element.scrollTop = target.scrollTop;
        element.scrollLeft = target.scrollLeft;
      }
      if (anchor?.categoryId) {
        const anchorElement = this._getCategoryRowElement(anchor.categoryId);
        const scrollContainer = this._getNearestScrollContainer(anchorElement);
        const currentTop = anchorElement?.getBoundingClientRect?.().top;
        if (anchorElement && scrollContainer && Number.isFinite(currentTop)) {
          const delta = currentTop - anchor.top;
          if (Math.abs(delta) > 0.5) scrollContainer.scrollTop += delta;
        }
      }
    };
    restore();
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 80);
  }

  _replaceMapDraft(draft, { preserveScroll = false, anchorCategoryId = "" } = {}) {
    const scrollState = preserveScroll ? this._captureScrollState({ anchorCategoryId }) : null;
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    const renderResult = this.render(false);
    if (preserveScroll) {
      if (renderResult?.then instanceof Function) {
        renderResult.then(() => this._restoreScrollState(scrollState));
      } else {
        this._restoreScrollState(scrollState);
      }
    }
    return renderResult;
  }

  render(force = false, options = {}) {
    if (this._inlineHost && typeof this._inlineHost.renderInlineMapEditor === "function") {
      return this._inlineHost.renderInlineMapEditor(force, options);
    }
    return super.render(force, options);
  }

  _onLiveStylePreviewInput() {
    this._applyLiveStylePreview();
  }

  _applyLiveStylePreview() {
    const previewMap = this._readWorldMapDataFromForm();
    const targetMapId = String(previewMap?.id || this.mapId || "").trim();
    if (!targetMapId) return;
    const registryApps = Array.from(globalThis.__TOM_WORLD_MAP_APP_INSTANCES ?? []);
    const uiWindowApps = Object.values(ui.windows ?? {});
    const apps = Array.from(new Set([...registryApps, ...uiWindowApps])).filter((app) => {
      if (!app) return false;
      const ctorName = String(app.constructor?.name || "").trim();
      if (!["TheatreWorldMapApplication", "TheatreWorldMapStageApplication"].includes(ctorName)) return false;
      return String(app.mapId || "").trim() === targetMapId;
    });
    for (const app of apps) {
      if (typeof app.applyLivePreviewMapData === "function") {
        app.applyLivePreviewMapData(previewMap);
        continue;
      }
      const host = app.element?.[0];
      if (!(host instanceof HTMLElement)) continue;
      const root = host.matches?.(".tom-world-map, .tom-world-map-stage")
        ? host
        : host.querySelector(".tom-world-map, .tom-world-map-stage");
      const styleString = typeof app._buildMapThemeInlineStyle === "function"
        ? app._buildMapThemeInlineStyle(previewMap)
        : buildThemeInlineStyle(TheatreStore.getThemeState());
      if (root instanceof HTMLElement) {
        root.setAttribute("style", styleString);
      }
      applyThemeInlineStyleToHost(host, TheatreStore.getThemeState());
    }
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

  _setTileProgress(progressPatch = {}, { forceRender = false } = {}) {
    this._tileProgress = {
      ...this._tileProgress,
      ...progressPatch
    };
    const now = Date.now();
    if (!forceRender && now - this._lastProgressRenderAt < 180) return;
    this._lastProgressRenderAt = now;
    this.render(false);
  }

  async _ensureDataDirectory(path) {
    const segments = String(path || "").split("/").map((segment) => segment.trim()).filter(Boolean);
    let cursor = "";
    for (const segment of segments) {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      try {
        await FilePicker.createDirectory("data", cursor);
      } catch (_error) {
        // directory can already exist
      }
    }
  }

  async _loadImageElement(path) {
    const source = String(path || "").trim();
    if (!source) throw new Error("Missing source image.");
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Image could not be loaded: ${source}`));
      image.src = `${source}${source.includes("?") ? "&" : "?"}v=${Date.now()}`;
    });
  }

  async _fetchAssetByteSize(path) {
    const source = String(path || "").trim();
    if (!source) return null;
    try {
      const response = await fetch(`${source}${source.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return null;
      const blob = await response.blob();
      return Number(blob.size) || null;
    } catch (_error) {
      return null;
    }
  }

  _formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return tr("Unknown");
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  async _buildTileGenerationPreview(worldMapDraft) {
    const sourceImage = String(worldMapDraft.sourceImage || "").trim();
    if (!sourceImage) throw new Error(tr("Please choose a source image first."));
    const source = await this._loadImageElement(sourceImage);
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) throw new Error(tr("The source image could not be read."));
    const tileSize = Math.max(128, Math.min(1024, Number(worldMapDraft.tileSize) || 256));
    const maxNativeZoom = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
    let tilesPerLayer = 0;
    for (let z = 0; z <= maxNativeZoom; z += 1) {
      const scale = Math.pow(2, maxNativeZoom - z);
      const levelWidth = Math.ceil(width / scale);
      const levelHeight = Math.ceil(height / scale);
      tilesPerLayer += Math.ceil(levelWidth / tileSize) * Math.ceil(levelHeight / tileSize);
    }

    const overlays = Array.isArray(worldMapDraft.overlays) ? worldMapDraft.overlays : [];
    const totalLayers = 1 + overlays.filter((entry) => String(entry?.sourceImage || "").trim()).length;
    const totalTiles = tilesPerLayer * totalLayers;
    const sourceSizes = [];
    sourceSizes.push(await this._fetchAssetByteSize(sourceImage));
    for (const overlay of overlays) {
      const overlayPath = String(overlay?.sourceImage || "").trim();
      if (!overlayPath) continue;
      sourceSizes.push(await this._fetchAssetByteSize(overlayPath));
    }
    const knownSourceBytes = sourceSizes.filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + value, 0);

    return {
      width,
      height,
      tileSize,
      maxNativeZoom,
      totalLayers,
      totalTiles,
      knownSourceBytes: knownSourceBytes || null
    };
  }

  async _confirmTileGeneration(worldMapDraft) {
    const preview = await this._buildTileGenerationPreview(worldMapDraft);
    const sourceSizeText = preview.knownSourceBytes
      ? this._formatBytes(preview.knownSourceBytes)
      : tr("Unknown");
    return await new Promise((resolve) => {
      const dialog = new Dialog({
        title: tr("Confirm tile generation"),
        content: `
          <div class="tom-theme-root tom-theme-default">
            <p>${tr("Tile generation runs locally in your browser. If your Foundry data directory is hosted remotely, the generated tile files will then be uploaded to that server.")}</p>
            <p class="notes">${tr("Large maps can therefore create noticeable upload traffic on hosted setups. A precise bandwidth estimate is not reliable because the final WebP compression depends heavily on image content.")}</p>
            <div class="tom-world-map-config__warning-list">
              <p><strong>${tr("Map size")}:</strong> ${preview.width} x ${preview.height}</p>
              <p><strong>${tr("Tile size")}:</strong> ${preview.tileSize} px</p>
              <p><strong>${tr("Zoom levels")}:</strong> ${preview.maxNativeZoom + 1}</p>
              <p><strong>${tr("Layers")}:</strong> ${preview.totalLayers}</p>
              <p><strong>${tr("Generated tiles")}:</strong> ${preview.totalTiles}</p>
              <p><strong>${tr("Combined source asset size")}:</strong> ${sourceSizeText}</p>
            </div>
          </div>
        `,
        buttons: {
          continue: { label: tr("Generate tiles from image"), callback: () => resolve(true) },
          cancel: { label: tr("Cancel"), callback: () => resolve(false) }
        },
        default: "continue",
        close: () => resolve(false)
      });
      dialog.render(true);
      window.setTimeout(() => applyTheatreDialogTheme(dialog, MODULE_ID, "34rem"), 30);
    });
  }

  async _canvasToWebpBlob(canvas, quality = 0.9) {
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Failed to encode tile blob."));
      }, "image/webp", quality);
    });
  }

  async _withSuppressedUploadNotifications(callback) {
    const notifications = ui?.notifications;
    if (!notifications || typeof callback !== "function") return await callback();

    const originalInfo = typeof notifications.info === "function" ? notifications.info.bind(notifications) : null;
    const originalNotify = typeof notifications.notify === "function" ? notifications.notify.bind(notifications) : null;
    const shouldSuppress = (message) => {
      const normalized = String(message ?? "").trim().toLowerCase();
      if (!normalized) return false;
      return normalized.includes(" saved to ") || normalized.includes(" uploaded to ");
    };

    if (originalInfo) {
      notifications.info = (message, ...args) => {
        if (shouldSuppress(message)) return null;
        return originalInfo(message, ...args);
      };
    }

    if (originalNotify) {
      notifications.notify = (message, type, ...args) => {
        if ((type === "info" || !type) && shouldSuppress(message)) return null;
        return originalNotify(message, type, ...args);
      };
    }

    try {
      return await callback();
    } finally {
      if (originalInfo) notifications.info = originalInfo;
      if (originalNotify) notifications.notify = originalNotify;
    }
  }

  async _generateTileSet({
    source,
    width,
    height,
    tileSize,
    tileRootPath,
    levelInfo,
    progressPrefix,
    processedTilesRef,
    totalTiles
  }) {
    await this._ensureDataDirectory(tileRootPath);
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileSize;
    tileCanvas.height = tileSize;
    const tileContext = tileCanvas.getContext("2d", { alpha: true });
    if (!tileContext) throw new Error("Could not initialize tile canvas context.");
    tileContext.imageSmoothingEnabled = true;
    tileContext.imageSmoothingQuality = "high";

    const levelCanvas = document.createElement("canvas");
    const levelContext = levelCanvas.getContext("2d", { alpha: true });
    if (!levelContext) throw new Error("Could not initialize level canvas context.");
    levelContext.imageSmoothingEnabled = true;
    levelContext.imageSmoothingQuality = "high";

    for (const level of levelInfo) {
      const zDirectory = `${tileRootPath}/${level.z}`;
      await this._ensureDataDirectory(zDirectory);
      let levelSource = source;
      if (level.scale !== 1) {
        levelCanvas.width = level.levelWidth;
        levelCanvas.height = level.levelHeight;
        levelContext.clearRect(0, 0, level.levelWidth, level.levelHeight);
        levelContext.drawImage(source, 0, 0, width, height, 0, 0, level.levelWidth, level.levelHeight);
        levelSource = levelCanvas;
      }
      for (let x = 0; x < level.tilesX; x += 1) {
        const xDirectory = `${zDirectory}/${x}`;
        await this._ensureDataDirectory(xDirectory);
        for (let y = 0; y < level.tilesY; y += 1) {
          const sourceX = x * tileSize;
          const sourceY = y * tileSize;
          const sourceWidth = Math.max(0, Math.min(tileSize, level.levelWidth - sourceX));
          const sourceHeight = Math.max(0, Math.min(tileSize, level.levelHeight - sourceY));
          if (sourceWidth <= 0 || sourceHeight <= 0) continue;
          tileContext.clearRect(0, 0, tileSize, tileSize);
          tileContext.drawImage(levelSource, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
          const tileBlob = await this._canvasToWebpBlob(tileCanvas, 0.9);
          const tileFile = new File([tileBlob], `${y}.webp`, { type: "image/webp" });
          await FilePicker.upload("data", xDirectory, tileFile, { notify: false });
          processedTilesRef.count += 1;
          const progressPercent = totalTiles > 0 ? Math.round((processedTilesRef.count / totalTiles) * 100) : 100;
          this._setTileProgress({
            running: true,
            percent: progressPercent,
            message: tr("{name}: generated {processed}/{total} tile(s)", {
              name: progressPrefix,
              processed: processedTilesRef.count,
              total: totalTiles
            })
          });
        }
      }
    }
  }

  async _buildTilesFromSource(worldMapDraft) {
    const mapId = worldMapDraft.id || randomId();
    const sourceImage = String(worldMapDraft.sourceImage || "").trim();
    if (!sourceImage) throw new Error(tr("Please choose a source image first."));
    const source = await this._loadImageElement(sourceImage);
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(tr("The selected image has invalid dimensions."));
    }

    const tileSize = [256, 512].includes(Number(worldMapDraft.tileSize)) ? Number(worldMapDraft.tileSize) : 256;
    const maxNativeZoom = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
    const maxZoom = Math.min(24, maxNativeZoom + 2);
    const generationId = Date.now();
    const basePath = `worlds/${game.world?.id || "world"}/footlights/maps/${mapId}`;
    const tileRootPath = `${basePath}/tiles/${generationId}`;
    const tileUrlTemplate = normalizePublicAssetPath(`${tileRootPath}/{z}/{x}/{y}.webp`);
    const manifestPath = normalizePublicAssetPath(`${basePath}/manifest.json`);

    const overlays = Array.isArray(worldMapDraft.overlays)
      ? worldMapDraft.overlays
          .map((overlay) => ({
            ...this._createDefaultOverlayData(),
            ...overlay,
            id: String(overlay.id || randomId()).trim() || randomId(),
            name: String(overlay.name || "").trim(),
            sourceImage: String(overlay.sourceImage || "").trim()
          }))
          .filter((overlay) => overlay.name || overlay.sourceImage)
      : [];
    const overlaySources = [];
    for (const overlay of overlays) {
      if (!overlay.sourceImage) throw new Error(tr("Please choose an image for every overlay or remove the empty overlay entry."));
      const overlayImage = await this._loadImageElement(overlay.sourceImage);
      const overlayWidth = overlayImage.naturalWidth || overlayImage.width;
      const overlayHeight = overlayImage.naturalHeight || overlayImage.height;
      if (overlayWidth !== width || overlayHeight !== height) {
        throw new Error(tr('Overlay "{name}" must match the base map dimensions exactly.', { name: overlay.name || tr("Overlay") }));
      }
      overlaySources.push({
        ...overlay,
        image: overlayImage,
        tileRootPath: `${basePath}/overlays/${overlay.id}/tiles/${generationId}`,
        tileUrlTemplate: normalizePublicAssetPath(`${basePath}/overlays/${overlay.id}/tiles/${generationId}/{z}/{x}/{y}.webp`),
        manifestPath: normalizePublicAssetPath(`${basePath}/overlays/${overlay.id}/manifest.json`)
      });
    }

    const levelInfo = [];
    for (let z = 0; z <= maxNativeZoom; z += 1) {
      const scale = Math.pow(2, maxNativeZoom - z);
      const levelWidth = Math.ceil(width / scale);
      const levelHeight = Math.ceil(height / scale);
      levelInfo.push({
        z,
        scale,
        levelWidth,
        levelHeight,
        tilesX: Math.ceil(levelWidth / tileSize),
        tilesY: Math.ceil(levelHeight / tileSize)
      });
    }
    const minZoomFillThreshold = 0.68;
    const minZoomCandidate = levelInfo.find((level) => {
      const fillX = level.levelWidth / Math.max(tileSize, level.tilesX * tileSize);
      const fillY = level.levelHeight / Math.max(tileSize, level.tilesY * tileSize);
      return Math.min(fillX, fillY) >= minZoomFillThreshold;
    });
    const minZoom = minZoomCandidate?.z ?? Math.min(maxNativeZoom, 0);
    const tilesPerLayer = levelInfo.reduce((sum, level) => sum + (level.tilesX * level.tilesY), 0);
    const totalTiles = tilesPerLayer * (1 + overlaySources.length);
    const processedTilesRef = { count: 0 };

    this._setTileProgress({
      running: true,
      percent: 0,
      message: tr("Preparing tile generation...")
    }, { forceRender: true });

    await this._generateTileSet({
      source,
      width,
      height,
      tileSize,
      tileRootPath,
      levelInfo,
      progressPrefix: worldMapDraft.name || tr("Base map"),
      processedTilesRef,
      totalTiles
    });
    for (const overlay of overlaySources) {
      await this._generateTileSet({
        source: overlay.image,
        width,
        height,
        tileSize,
        tileRootPath: overlay.tileRootPath,
        levelInfo,
        progressPrefix: overlay.name || tr("Overlay"),
        processedTilesRef,
        totalTiles
      });
      const overlayManifestFile = new File([JSON.stringify({
        version: 1,
        type: "image-tiles-overlay",
        name: overlay.name || tr("Overlay"),
        id: overlay.id,
        tileUrlTemplate: overlay.tileUrlTemplate,
        width,
        height,
        tileSize,
        minZoom,
        maxZoom,
        maxNativeZoom
      }, null, 2)], "manifest.json", { type: "application/json" });
      await FilePicker.upload("data", `${basePath}/overlays/${overlay.id}`, overlayManifestFile, { notify: false });
    }

    const manifestData = {
      version: 1,
      type: "image-tiles",
      name: worldMapDraft.name || tr("World Map"),
      id: mapId,
      tileUrlTemplate,
      width,
      height,
      tileSize,
      minZoom,
      maxZoom,
      maxNativeZoom,
      overlays: overlaySources.map((overlay) => ({
        id: overlay.id,
        name: overlay.name || tr("Overlay"),
        sourceImage: overlay.sourceImage,
        tileRootPath: normalizePublicAssetPath(overlay.tileRootPath),
        tileUrlTemplate: overlay.tileUrlTemplate,
        manifestPath: overlay.manifestPath,
        opacity: clampNumber(overlay.opacity, 1, 0, 1),
        visibleByDefault: Boolean(overlay.visibleByDefault)
      })),
      initialView: {
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        zoom: Math.max(minZoom, Math.min(maxNativeZoom, minZoom + 1))
      }
    };
    const manifestFile = new File([JSON.stringify(manifestData, null, 2)], "manifest.json", {
      type: "application/json"
    });
    await FilePicker.upload("data", basePath, manifestFile, { notify: false });

    this._setTileProgress({
      running: false,
      percent: 100,
      message: tr("Tile generation completed.")
    }, { forceRender: true });

    return {
      id: mapId,
      sourceImage,
      thumbnail: worldMapDraft.thumbnail || sourceImage,
      tileRootPath: normalizePublicAssetPath(tileRootPath),
      tileUrlTemplate,
      manifestPath,
      width,
      height,
      tileSize,
      minZoom,
      maxZoom,
      maxNativeZoom,
      initialView: {
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        zoom: Math.max(minZoom, Math.min(maxNativeZoom, minZoom + 1))
      }
    };
  }

  async _onGenerateMapTiles(event) {
    event.preventDefault();
    if (this._tileProgress.running) return;
    try {
      const draft = this._readWorldMapDataFromForm();
      const confirmed = await this._confirmTileGeneration(draft);
      if (!confirmed) return;
      const generatedPatch = await this._withSuppressedUploadNotifications(() => this._buildTilesFromSource({
        ...draft,
        id: draft.id || randomId()
      }));
      const savedMap = await TheatreStore.upsertWorldMap({
        ...draft,
        ...generatedPatch,
        id: generatedPatch.id
      });
      this.mapId = savedMap.id;
      this._mapDraftOverride = null;
      ui.notifications?.info(tr("World map tiles generated."));
      this.render(false);
    } catch (error) {
      console.error(`${MODULE_ID} | World map tile generation failed`, error);
      this._setTileProgress({
        running: false,
        message: tr("Tile generation failed. Please check the browser console.")
      }, { forceRender: true });
      ui.notifications?.error(tr("Tile generation failed. Please check the browser console."));
    }
  }

  async _onOpenWorldMap(event) {
    event.preventDefault();
    const targetMapId = String(event.currentTarget?.dataset?.mapId || this.mapId || "").trim();
    if (!targetMapId) return;
    await TheatreStore.setActiveWorldMap(targetMapId);
    game.modules.get(MODULE_ID)?.api?.openWorldMap?.(targetMapId);
  }

  async _onCreateWorldMapMacro(event) {
    event.preventDefault();
    const targetMapId = String(event.currentTarget?.dataset?.mapId || this.mapId || "").trim();
    if (!targetMapId) return;
    const worldMap = TheatreStore.getWorldMapById(targetMapId);
    if (!worldMap) return;
    const macro = await Macro.create({
      name: tr("Map: {name}", { name: worldMap.name }),
      type: "script",
      scope: "global",
      img: "icons/svg/map.svg",
      command: `game.modules.get("${MODULE_ID}")?.api?.openWorldMap("${worldMap.id}");`
    });
    if (macro) ui.notifications?.info(tr("Map macro created."));
  }

  async _updateObject(_event, _formData) {
    const nextMap = this._readWorldMapDataFromForm();
    const savedMap = await TheatreStore.upsertWorldMap({
      ...nextMap,
      id: nextMap.id || this.mapId || randomId()
    });
    this.mapId = savedMap.id;
    this._mapDraftOverride = null;
    ui.notifications?.info(tr("World map saved."));
  }

  async saveInline() {
    await this._updateObject(null, null);
    return this.mapId;
  }
}
