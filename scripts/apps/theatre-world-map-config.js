import { MODULE_ID } from "../constants.js";
import { applyTheatreDialogTheme, applyThemeInlineStyleToHost, buildThemeInlineStyle, openImagePickerForInput, randomId } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";
import { collectWorldMapCategorySource, getDefaultWorldMapCategories, getWorldMapCategories, normalizeWorldMapCategoryList } from "../world-map/category-utils.js";
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
  "fa-warehouse"
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
      name: tr("Category"),
      iconClass: "fa-location-dot",
      color: "#33475f"
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
        name: String(entry?.name || "").trim(),
        iconClass: String(entry?.iconClass || fallbackCategories?.[index]?.iconClass || "fa-location-dot").trim() || "fa-location-dot",
        color: /^#[0-9a-f]{6}$/i.test(String(entry?.color || "").trim()) ? String(entry.color).trim().toLowerCase() : String(fallbackCategories?.[index]?.color || "#33475f").trim().toLowerCase()
      }))
      .filter((entry) => entry.name));
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
          index
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
    html.find("[data-action='remove-map-category']").on("click", this._onRemoveCategory.bind(this));
    html.find("[data-action='pick-map-category-icon']").on("click", this._onPickCategoryIcon.bind(this));
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
    draft.categories.push(this._createDefaultCategoryData());
    this._syncSharedCategoryAliases(draft);
    this._replaceMapDraft(draft);
  }

  _onRemoveCategory(event) {
    event.preventDefault();
    const categoryId = String(event.currentTarget?.dataset?.categoryId || "").trim();
    const draft = this._readWorldMapDataFromForm();
    draft.categories = (Array.isArray(draft.categories) ? draft.categories : []).filter((entry) => entry.id !== categoryId);
    this._syncSharedCategoryAliases(draft);
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
    this._replaceMapDraft(draft);
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

  _replaceMapDraft(draft) {
    this._mapDraftOverride = foundry.utils.mergeObject(this._getDefaultWorldMapData(), draft, { inplace: false });
    this.render(false);
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
