import { MODULE_ID } from "../constants.js";
import { applyTheatreDialogTheme, applyThemeInlineStyleToHost, buildThemeInlineStyle, clearDraggedAvatarId, getActorById, isVideoMediaPath, randomId, readTransferJson, scheduleTheatreDialogTheme, setAvatarDragData, setTheatreSceneDragData, setWorldMapDragData } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

export class TheatreMindmapApplication extends Application {
  constructor(options = {}) {
    super(options);
    this.plannerId = options.plannerId ?? TheatreStore.getActiveAdventurePlanner()?.id ?? null;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this._dragState = null;
    this._resizeState = null;
    this._edgeDragState = null;
    this._zoom = 1;
    this._panState = null;
    this._pendingViewportState = null;
    this._editingNodeTitleId = null;
    this._isSourceSidebarCollapsed = false;
    this._isInspectorCollapsed = true;
    this._isSourceScenesExpanded = true;
    this._isSourceAvatarsExpanded = true;
    this._isSourceMapsExpanded = true;
    this._nodeDesignSectionStates = {
      presets: false,
      background: false,
      textIcon: false,
      controls: false
    };
    this._suppressNodeClickUntil = 0;
    this._boardCreateMenu = null;
    this._windowResizeClassTimeout = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-mindmap`,
      title: tr("Adventure Planner"),
      classes: [MODULE_ID, "theatre-mindmap"],
      template: `modules/${MODULE_ID}/templates/apps/theatre-mindmap.hbs`,
      width: 1280,
      height: 820,
      resizable: true,
      minimizable: true
    });
  }

  _colorStopToCss(stop) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(stop?.color ?? ""));
    if (!match) return "rgba(255,255,255,1)";
    const hex = match[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const alpha = Math.max(0, Math.min(1, Number(stop?.alpha)));
    return `rgba(${r}, ${g}, ${b}, ${Number.isFinite(alpha) ? alpha : 1})`;
  }

  _linearGradientCss(start, end) {
    return `linear-gradient(180deg, ${this._colorStopToCss(start)}, ${this._colorStopToCss(end)})`;
  }

  _buildThemeInlineStyle(theme) {
    return buildThemeInlineStyle(theme);
  }

  _buildInspectorTextStyle({ colorVar, fontVar, fontWeight = null, lineHeight = 1.2, extraDeclarations = "" } = {}) {
    const declarations = [];
    if (colorVar) declarations.push(`color:var(${colorVar}) !important`);
    if (fontVar) declarations.push(`font-size:var(${fontVar}) !important`);
    if (fontWeight !== null && fontWeight !== undefined) declarations.push(`font-weight:${fontWeight}`);
    if (lineHeight !== null && lineHeight !== undefined) declarations.push(`line-height:${lineHeight}`);
    declarations.push("letter-spacing:0");
    declarations.push("text-transform:none");
    if (extraDeclarations) declarations.push(extraDeclarations);
    return `${declarations.join(";")};`;
  }

  _buildInlineColorStyle(colorValue, extraDeclarations = "") {
    const color = String(colorValue ?? "").trim();
    const suffix = extraDeclarations ? `${extraDeclarations};` : "";
    return `color:${color} !important;${suffix}`;
  }

  _formatRemValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0rem";
    return `${numeric.toFixed(2).replace(/\.?0+$/, "")}rem`;
  }

  _getNodeTextScale(value, fallback = 1, { min = 0.7, max = 1.8 } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  _getNodeTextBaseSize(field, node = null) {
    if (field === "typeSize") {
      return node?.type === "note" ? 0.94 : 0.72;
    }
    if (field === "titleSize") {
      return node?.type === "note" ? 1.18 : 1.02;
    }
    return 0.94;
  }

  _getNodeTextRemValue(field, node = null, fallbackScale = 1) {
    const base = this._getNodeTextBaseSize(field, node);
    const scale = this._getNodeTextScale(node?.[field], fallbackScale);
    return Math.max(base * 0.7, Math.min(base * 1.8, base * scale));
  }

  _getNodeTextScaleFromRem(field, remValue, node = null) {
    const base = this._getNodeTextBaseSize(field, node);
    const rem = Number(remValue);
    if (!Number.isFinite(rem) || base <= 0) return 1;
    return this._getNodeTextScale(rem / base, 1);
  }

  _buildNodeTextStyle(colorValue, fontSizeRem, extraDeclarations = "") {
    const declarations = [
      `color:${String(colorValue ?? "").trim()} !important`,
      `font-size:${this._formatRemValue(fontSizeRem)} !important`
    ];
    if (extraDeclarations) declarations.push(extraDeclarations);
    return `${declarations.join(";")};`;
  }

  _getNodeDisplayNoteText(node) {
    const note = String(node?.noteContent ?? "").trim();
    if (!note) return "";
    return note.length > 280 ? `${note.slice(0, 280)}...` : note;
  }

  _hasNodeDisplayNote(node) {
    return Boolean(this._getNodeDisplayNoteText(node));
  }

  _isNodeNoteExpanded(node) {
    return this._hasNodeDisplayNote(node) && Boolean(node?.noteExpanded);
  }

  _getNodeNoteExpansionHeight(node) {
    const noteText = this._getNodeDisplayNoteText(node);
    if (!noteText) return 0;

    const nodeWidth = Math.max(180, Number(node?.width) || 220);
    const usableWidth = Math.max(120, nodeWidth - (node?.type === "group" ? 48 : (node?.type === "note" ? 38 : 120)));
    const effectiveFontSize = this._getNodeTextRemValue("textSize", node) * 16;
    const charsPerLine = Math.max(14, Math.min(48, Math.floor(usableWidth / Math.max(6.2, effectiveFontSize * 0.56))));
    const lineCount = Math.max(2, Math.min(node?.type === "note" ? 8 : 6, Math.ceil(noteText.length / charsPerLine)));
    const lineHeight = Math.max(18, Math.round(effectiveFontSize * (node?.type === "note" ? 1.5 : 1.35)));
    const basePadding = node?.type === "group" ? 26 : (node?.type === "note" ? 28 : 26);
    return basePadding + (lineCount * lineHeight);
  }

  _getRenderedNodeHeight(node) {
    const baseHeight = Math.max(84, Number(node?.height) || 84);
    return baseHeight + (this._isNodeNoteExpanded(node) ? this._getNodeNoteExpansionHeight(node) : 0);
  }

  _getNodeNoteToggleLabel(node) {
    if (!this._hasNodeDisplayNote(node)) return tr("No note available");
    return this._isNodeNoteExpanded(node) ? tr("Hide note") : tr("Show note");
  }

  _getColorBaseHex(value, fallback = "#ffffff") {
    const explicit = String(value ?? "").trim();
    const rgbMatch = explicit.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const toHex = (channel) => Math.max(0, Math.min(255, Number(channel) || 0)).toString(16).padStart(2, "0");
      return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toLowerCase();
    }

    const hexMatch = explicit.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) return `#${hexMatch[1]}`.toLowerCase();
    return String(fallback || "#ffffff").toLowerCase();
  }

  _getColorAlpha(alphaValue, colorValue, fallback = 1, { min = 0, max = 1 } = {}) {
    const numeric = Number(alphaValue);
    if (Number.isFinite(numeric)) return Math.max(min, Math.min(max, numeric));

    const match = String(colorValue ?? "").match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i);
    const parsed = match ? Number(match[1]) : NaN;
    if (Number.isFinite(parsed)) return Math.max(min, Math.min(max, parsed));

    return Math.max(min, Math.min(max, fallback));
  }

  _composeColorValue(baseHex, alpha = 1, { min = 0, max = 1, fallback = 1 } = {}) {
    const safeAlpha = Math.max(min, Math.min(max, Number(alpha)));
    const resolvedAlpha = Number.isFinite(safeAlpha) ? safeAlpha : fallback;
    return `rgba(${this._hexToRgbString(baseHex)}, ${resolvedAlpha})`;
  }

  _createNodeColorControl(field, alphaField, label, colorValue, alphaValue, { minAlpha = 0, maxAlpha = 1 } = {}) {
    const resolvedAlpha = this._getColorAlpha(alphaValue, colorValue, maxAlpha, { min: minAlpha, max: maxAlpha });
    return {
      field,
      alphaField,
      label,
      color: this._getColorBaseHex(colorValue),
      alpha: Math.round(resolvedAlpha * 100),
      minAlphaPercent: Math.round(minAlpha * 100),
      maxAlphaPercent: Math.round(maxAlpha * 100)
    };
  }

  _createNodeSizeControl(field, node = null, { step = 0.02 } = {}) {
    const base = this._getNodeTextBaseSize(field, node);
    const min = Number((base * 0.7).toFixed(2));
    const max = Number((base * 1.8).toFixed(2));
    const resolvedSize = this._getNodeTextRemValue(field, node);
    return {
      field,
      value: Number(resolvedSize.toFixed(2)),
      minRem: min,
      maxRem: max,
      stepRem: step,
      display: this._formatRemValue(resolvedSize),
      label: tr("Font size")
    };
  }

  _withNodeSizeControl(control, sizeField, node = null, options = {}) {
    return {
      ...control,
      sizeControl: this._createNodeSizeControl(sizeField, node, options)
    };
  }

  _getBatchColorValue(nodes, field, alphaField, { minAlpha = 0, maxAlpha = 1, fallbackColor = "#ffffff", fallbackAlpha = 1 } = {}) {
    const entries = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    if (!entries.length) {
      return {
        colorValue: fallbackColor,
        alphaValue: fallbackAlpha
      };
    }

    const primaryNode = entries[0];
    const alphaValue = entries.reduce(
      (sum, node) => sum + this._getColorAlpha(node?.[alphaField], node?.[field], fallbackAlpha, { min: minAlpha, max: maxAlpha }),
      0
    ) / entries.length;

    return {
      colorValue: primaryNode?.[field] || fallbackColor,
      alphaValue
    };
  }

  _getBatchTextRemValue(nodes, field, { fallback = 1 } = {}) {
    const entries = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    if (!entries.length) return this._getNodeTextBaseSize(field, null) * fallback;
    return entries.reduce((sum, node) => sum + this._getNodeTextRemValue(field, node, fallback), 0) / entries.length;
  }

  _getNodeDesignFieldNames() {
    return [
      "color",
      "colorAlpha",
      "typeColor",
      "typeColorAlpha",
      "typeSize",
      "titleColor",
      "titleColorAlpha",
      "titleSize",
      "textColor",
      "textColorAlpha",
      "textSize",
      "handleColor",
      "handleColorAlpha",
      "actionIconColor",
      "actionIconColorAlpha",
      "stageGoblinHatchColor",
      "stageGoblinHatchColorAlpha"
    ];
  }

  _extractNodeDesignPatch(source = {}) {
    return Object.fromEntries(
      this._getNodeDesignFieldNames()
        .map((field) => [field, source?.[field]])
        .filter(([, value]) => value !== undefined)
    );
  }

  _isNodeDesignPresetActive(node, preset) {
    if (!node || !preset) return false;
    return this._getNodeDesignFieldNames().every((field) => `${node?.[field] ?? ""}` === `${preset?.[field] ?? ""}`);
  }

  _buildNodeDesignPresetPreviewStyle(preset) {
    return [
      `--tom-node-design-preset-bg:${preset.color}`,
      `--tom-node-design-preset-type:${preset.typeColor}`,
      `--tom-node-design-preset-title:${preset.titleColor}`,
      `--tom-node-design-preset-text:${preset.textColor}`,
      `--tom-node-design-preset-hatch:${preset.stageGoblinHatchColor}`,
      `--tom-node-design-preset-type-size:${this._formatRemValue(this._getNodeTextRemValue("typeSize", preset))}`,
      `--tom-node-design-preset-title-size:${this._formatRemValue(this._getNodeTextRemValue("titleSize", preset))}`,
      `--tom-node-design-preset-text-size:${this._formatRemValue(this._getNodeTextRemValue("textSize", preset))}`
    ].join(";") + ";";
  }

  _isNodeDesignSectionExpanded(key) {
    return this._nodeDesignSectionStates?.[key] !== false;
  }

  _buildNodeDesignSection(key, title, controls = []) {
    const isExpanded = this._isNodeDesignSectionExpanded(key);
    return {
      key,
      title,
      controls,
      isExpanded
    };
  }

  _getNextNodeDesignPresetName(presets = []) {
    const existing = new Set((Array.isArray(presets) ? presets : []).map((preset) => String(preset?.name || "").trim()));
    for (let index = 1; index <= 10; index += 1) {
      const name = `${tr("Preset")} ${index}`;
      if (!existing.has(name)) return name;
    }
    return `${tr("Preset")} ${Math.min(10, (Array.isArray(presets) ? presets.length : 0) + 1)}`;
  }

  _buildNodeDesignPresetPreviews(presets = [], node = null) {
    return (Array.isArray(presets) ? presets : []).slice(0, 10).map((preset) => ({
      ...preset,
      style: this._buildNodeDesignPresetPreviewStyle(preset),
      isActive: this._isNodeDesignPresetActive(node, preset),
      sampleType: node?.type === "note" || node?.type === "group" ? "" : this._getNodeDisplayType(node),
      sampleTypeIconClass: node?.type === "note" ? "fas fa-note-sticky" : "",
      sampleTypeStyle: this._buildNodeTextStyle(
        preset.typeColor,
        this._getNodeTextRemValue("typeSize", node ? { ...node, typeSize: preset.typeSize } : preset),
        node?.type === "note"
          ? "display:inline-flex;align-items:center;justify-content:flex-start;line-height:1"
          : "font-weight:700;letter-spacing:0.08em;text-transform:uppercase"
      ),
      sampleTitleStyle: this._buildNodeTextStyle(
        preset.titleColor,
        this._getNodeTextRemValue("titleSize", node ? { ...node, titleSize: preset.titleSize } : preset),
        "line-height:1.2"
      ),
      sampleTextStyle: this._buildNodeTextStyle(
        preset.textColor,
        this._getNodeTextRemValue("textSize", node ? { ...node, textSize: preset.textSize } : preset),
        "line-height:1.3"
      ),
      sampleTitle: tr("Sample title"),
      sampleText: tr("Sample text")
    }));
  }

  _getNodeTypeInspectorLabel(node) {
    if (node?.type === "note") return tr("Node type icon");
    if (node?.type === "group") return "";
    return tr("Node type text");
  }

  _getBatchNodeTypeInspectorLabel(nodes = []) {
    const relevantNodes = nodes.filter((node) => node?.type !== "group");
    if (!relevantNodes.length) return "";
    if (relevantNodes.every((node) => node?.type === "note")) return tr("Node type icon");
    if (relevantNodes.every((node) => node?.type !== "note")) return tr("Node type text");
    return tr("Node type / icon");
  }

  _buildSingleNodeColorSections(node) {
    if (!node) return [];

    const textRows = [];
    const nodeTypeLabel = this._getNodeTypeInspectorLabel(node);
    if (nodeTypeLabel) {
      textRows.push(
        this._withNodeSizeControl(
          this._createNodeColorControl("typeColor", "typeColorAlpha", nodeTypeLabel, node.typeColor, node.typeColorAlpha),
          "typeSize",
          node
        )
      );
    }
    textRows.push(
      this._withNodeSizeControl(
        this._createNodeColorControl("titleColor", "titleColorAlpha", tr("Title"), node.titleColor, node.titleColorAlpha),
        "titleSize",
        node
      )
    );
    textRows.push(
      this._withNodeSizeControl(
        this._createNodeColorControl("textColor", "textColorAlpha", tr("Text / note"), node.textColor, node.textColorAlpha),
        "textSize",
        node
      )
    );

    const backgroundControls = [
      this._createNodeColorControl("color", "colorAlpha", tr("Background"), node.color, node.colorAlpha, { minAlpha: 0.01, maxAlpha: 0.8 }),
      this._createNodeColorControl("stageGoblinHatchColor", "stageGoblinHatchColorAlpha", tr("StageGoblin hatch"), node.stageGoblinHatchColor, node.stageGoblinHatchColorAlpha)
    ];

    return [
      this._buildNodeDesignSection("background", tr("Node background"), backgroundControls),
      this._buildNodeDesignSection("textIcon", tr("Node text & icon"), textRows),
      this._buildNodeDesignSection("controls", tr("Node controls"), [
        this._createNodeColorControl("handleColor", "handleColorAlpha", tr("Handle"), node.handleColor, node.handleColorAlpha),
        this._createNodeColorControl("actionIconColor", "actionIconColorAlpha", tr("Action icon"), node.actionIconColor, node.actionIconColorAlpha)
      ])
    ];
  }

  _buildBatchNodeColorSections(nodes = []) {
    if (!nodes.length) return [];

    const background = this._getBatchColorValue(nodes, "color", "colorAlpha", { minAlpha: 0.01, maxAlpha: 0.8, fallbackAlpha: 0.42 });
    const typeColor = this._getBatchColorValue(nodes, "typeColor", "typeColorAlpha");
    const titleColor = this._getBatchColorValue(nodes, "titleColor", "titleColorAlpha");
    const textColor = this._getBatchColorValue(nodes, "textColor", "textColorAlpha");
    const handleColor = this._getBatchColorValue(nodes, "handleColor", "handleColorAlpha");
    const actionIconColor = this._getBatchColorValue(nodes, "actionIconColor", "actionIconColorAlpha");
    const stageGoblinHatchColor = this._getBatchColorValue(nodes, "stageGoblinHatchColor", "stageGoblinHatchColorAlpha");
    const typeSize = this._getBatchTextRemValue(nodes, "typeSize");
    const titleSize = this._getBatchTextRemValue(nodes, "titleSize");
    const textSize = this._getBatchTextRemValue(nodes, "textSize");

    const textRows = [];
    const nodeTypeLabel = this._getBatchNodeTypeInspectorLabel(nodes);
    if (nodeTypeLabel) {
      textRows.push(
        this._withNodeSizeControl(
          this._createNodeColorControl("typeColor", "typeColorAlpha", nodeTypeLabel, typeColor.colorValue, typeColor.alphaValue),
          "typeSize",
          { typeSize: this._getNodeTextScaleFromRem("typeSize", typeSize) }
        )
      );
    }
    textRows.push(
      this._withNodeSizeControl(
        this._createNodeColorControl("titleColor", "titleColorAlpha", tr("Title"), titleColor.colorValue, titleColor.alphaValue),
        "titleSize",
        { titleSize: this._getNodeTextScaleFromRem("titleSize", titleSize) }
      )
    );
    textRows.push(
      this._withNodeSizeControl(
        this._createNodeColorControl("textColor", "textColorAlpha", tr("Text / note"), textColor.colorValue, textColor.alphaValue),
        "textSize",
        { textSize: this._getNodeTextScaleFromRem("textSize", textSize) }
      )
    );

    const backgroundControls = [
      this._createNodeColorControl("color", "colorAlpha", tr("Background"), background.colorValue, background.alphaValue, { minAlpha: 0.01, maxAlpha: 0.8 }),
      this._createNodeColorControl("stageGoblinHatchColor", "stageGoblinHatchColorAlpha", tr("StageGoblin hatch"), stageGoblinHatchColor.colorValue, stageGoblinHatchColor.alphaValue)
    ];

    return [
      this._buildNodeDesignSection("background", tr("Node background"), backgroundControls),
      this._buildNodeDesignSection("textIcon", tr("Node text & icon"), textRows),
      this._buildNodeDesignSection("controls", tr("Node controls"), [
        this._createNodeColorControl("handleColor", "handleColorAlpha", tr("Handle"), handleColor.colorValue, handleColor.alphaValue),
        this._createNodeColorControl("actionIconColor", "actionIconColorAlpha", tr("Action icon"), actionIconColor.colorValue, actionIconColor.alphaValue)
      ])
    ];
  }

  getData() {
    const state = TheatreStore.getMindmapState(this.plannerId);
    const planner = TheatreStore.getAdventurePlannerById(this.plannerId) ?? TheatreStore.getActiveAdventurePlanner();
    const themeState = TheatreStore.getThemeState();
    const stageGoblinNodeIds = new Set(
      TheatreStore.getStageGoblinState().items
        .filter((item) => item.sourceType === "plannerNode" && item.plannerId === this.plannerId)
        .map((item) => item.nodeId)
    );
    const selectedIdSet = new Set(this.selectedNodeIds?.length ? this.selectedNodeIds : (this.selectedNodeId ? [this.selectedNodeId] : []));
    const colorPalette = [
      { value: "#54c7c3", swatch: "#54c7c3", label: tr("Aqua") },
      { value: "#6fc5ff", swatch: "#6fc5ff", label: tr("Blue") },
      { value: "#b298ff", swatch: "#b298ff", label: tr("Violet") },
      { value: "#ff85b6", swatch: "#ff85b6", label: tr("Pink") },
      { value: "#f2c778", swatch: "#f2c778", label: tr("Amber") },
      { value: "#d85f6e", swatch: "#d85f6e", label: tr("Red") },
      { value: "#81cc9c", swatch: "#81cc9c", label: tr("Green") },
      { value: "#aebfd3", swatch: "#aebfd3", label: tr("Neutral") }
    ];
    const selectedNodesRaw = state.nodes.filter((node) => selectedIdSet.has(node.id));
    const selectedNodeRaw = selectedNodesRaw.length === 1 ? selectedNodesRaw[0] : null;
    const selectedNodeAlpha = selectedNodeRaw ? this._getNodeAlpha(selectedNodeRaw) : 0.42;
    const nodeDesignPresets = Array.isArray(planner?.nodeDesignPresets) ? planner.nodeDesignPresets : [];
    const sourceScenes = TheatreStore.getScenes().map((scene) => {
      const thumbnail = this._getSceneThumbnail(scene);
      return {
        id: scene.id,
        name: scene.name || tr("FOOTLIGHTS SCENE"),
        thumbnail,
        placeholderIconClass: isVideoMediaPath(scene.background) && !thumbnail ? "fas fa-video" : "fas fa-photo-film",
        actorCount: Array.isArray(scene.actors) ? scene.actors.length : 0
      };
    });
    const sourceAvatars = TheatreStore.getAvatars().map((avatar) => {
      const actor = getActorById(avatar.actorId);
      return {
        id: avatar.id,
        name: actor?.name || avatar.name || tr("Avatar"),
        thumbnail: avatar.defaultImage || actor?.img || "",
        moodCount: Object.keys(avatar.moodImages ?? {}).length
      };
    });
    const sourceMaps = TheatreStore.getWorldMaps().map((worldMap) => ({
      id: worldMap.id,
      name: worldMap.name || tr("World Map"),
      thumbnail: worldMap.thumbnail || "",
      placeholderIconClass: "fas fa-map-location-dot",
      hasTiles: Boolean(worldMap.tileUrlTemplate)
    }));
      const nodes = state.nodes.map((node) => ({
      ...node,
      iconClass: this._getNodeIcon(node),
        displayType: this._getNodeDisplayType(node),
        isNoteNode: node.type === "note",
        isGroupNode: node.type === "group",
        isSceneLaunchNode: node.type === "theatreScene" || node.documentType === "Scene",
        isMapLaunchNode: node.type === "worldMap",
        isJournalNode: node.type === "document" && ["JournalEntry", "JournalEntryPage"].includes(node.documentType),
        isRollTableNode: node.type === "document" && node.documentType === "RollTable",
        isMacroNode: node.type === "document" && node.documentType === "Macro",
        isActorDocumentNode: node.type === "document" && node.documentType === "Actor" && Boolean(node.documentId || node.documentUuid),
        hasInlineOpenAction: node.type !== "note"
          && node.type !== "group"
          && !(node.type === "theatreScene" || node.documentType === "Scene")
          && node.type !== "worldMap"
          && !(node.type === "document" && ["JournalEntry", "JournalEntryPage"].includes(node.documentType)),
        canToggleStageGoblin: this._canToggleStageGoblinForNode(node),
        isInStageGoblin: stageGoblinNodeIds.has(node.id),
        hasNoteDisplay: this._hasNodeDisplayNote(node),
        isNoteExpanded: this._isNodeNoteExpanded(node),
        noteToggleLabel: this._getNodeNoteToggleLabel(node),
        noteExpansionHeight: this._getNodeNoteExpansionHeight(node),
        renderedHeight: this._getRenderedNodeHeight(node),
        hasBottomActionBar: (
          this._hasNodeDisplayNote(node)
          || (node.type !== "note"
            && node.type !== "group"
            && !(node.type === "theatreScene" || node.documentType === "Scene")
            && node.type !== "worldMap"
            && !(node.type === "document" && ["JournalEntry", "JournalEntryPage"].includes(node.documentType)))
          || this._canToggleStageGoblinForNode(node)
          || node.type === "theatreScene"
          || node.type === "worldMap"
          || node.documentType === "Scene"
          || (node.type === "document" && ["JournalEntry", "JournalEntryPage"].includes(node.documentType))
          || (node.type === "document" && node.documentType === "RollTable")
          || (node.type === "document" && node.documentType === "Macro")
          || (node.type === "document" && node.documentType === "Actor" && Boolean(node.documentId || node.documentUuid))
        ),
        style: this._buildNodeStyle(node),
      typeTextStyle: this._buildNodeTextStyle(node.typeColor, this._getNodeTextRemValue("typeSize", node)),
      titleTextStyle: this._buildNodeTextStyle(node.titleColor, this._getNodeTextRemValue("titleSize", node)),
      noteTextStyle: this._buildNodeTextStyle(node.textColor, this._getNodeTextRemValue("textSize", node)),
      noteIconStyle: this._buildNodeTextStyle(node.typeColor, this._getNodeTextRemValue("typeSize", node)),
      titleInputStyle: this._buildNodeTextStyle(node.titleColor, this._getNodeTextRemValue("titleSize", node), `caret-color:${node.titleColor}`),
      titlePlaceholderStyle: `--tom-node-title-placeholder:${node.textColor};`,
      tagTextStyle: this._buildNodeTextStyle(node.textColor, this._getNodeTextRemValue("textSize", node)),
      portStyles: {
        top: this._getPortStyle(node.id, "top", state.edges),
        right: this._getPortStyle(node.id, "right", state.edges),
        bottom: this._getPortStyle(node.id, "bottom", state.edges),
        left: this._getPortStyle(node.id, "left", state.edges)
      },
      isSelected: selectedIdSet.has(node.id),
      isEditingTitle: this._editingNodeTitleId === node.id,
      showInlineColorPopover: selectedNodesRaw.length === 1 && selectedIdSet.has(node.id),
      inlineColorPalette: colorPalette.map((entry) => ({
        ...entry,
        isActive: this._getNodeBaseHex(node) === entry.value.toLowerCase()
      })),
      inlineAlphaPercent: Math.round(this._getNodeAlpha(node) * 100),
      notePreview: this._getNodeDisplayNoteText(node),
      tags: Array.isArray(node.tags) ? node.tags : []
    })).sort((a, b) => {
      if (a.isGroupNode === b.isGroupNode) return 0;
      return a.isGroupNode ? -1 : 1;
    });
    const edges = state.edges
      .map((edge) => {
        const fromNode = state.nodes.find((node) => node.id === edge.fromNodeId);
        const toNode = state.nodes.find((node) => node.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;

        const fromPoint = this._getPortPosition(fromNode, edge.fromSide || "right");
        const toPoint = this._getPortPosition(toNode, edge.toSide || "left");
        const curve = this._buildEdgeCurve(fromPoint, edge.fromSide || "right", toPoint, edge.toSide || "left");

        return {
          ...edge,
          path: curve.path,
          style: edge.style || "solid",
          edgeStyle: `--tom-edge-color:${this._resolveEdgeColor(edge)};`
        };
      })
      .filter(Boolean);

    const tempEdge = this._edgeDragState
      ? this._buildEdgeCurve(
        { x: this._edgeDragState.startX, y: this._edgeDragState.startY },
        this._edgeDragState.side,
        { x: this._edgeDragState.currentX, y: this._edgeDragState.currentY },
        this._edgeDragState.previewSide || this._edgeDragState.side
      )
      : null;

    const selectedNode = selectedNodeRaw ? nodes.find((node) => node.id === selectedNodeRaw.id) ?? null : null;
    const hasMultiSelection = selectedNodesRaw.length > 1;
    const selectedBaseHexes = Array.from(new Set(selectedNodesRaw.map((node) => this._getNodeBaseHex(node))));
    const selectedBatchBaseHex = selectedBaseHexes.length === 1 ? selectedBaseHexes[0] : null;
    const selectedBatchAlpha = selectedNodesRaw.length ? Math.round((selectedNodesRaw.reduce((sum, node) => sum + this._getNodeAlpha(node), 0) / selectedNodesRaw.length) * 100) : 42;
    const nodeDesignSectionToggleColor = this._colorStopToCss(themeState?.planner?.toggleIcon);
    const inspectorHeading2Style = this._buildInspectorTextStyle({
      colorVar: "--tom-content-subheading",
      fontVar: "--tom-font-heading-2"
    });
    const inspectorHeading3Style = this._buildInspectorTextStyle({
      colorVar: "--tom-content-label",
      fontVar: "--tom-font-heading-3"
    });
    const inspectorBodyStyle = this._buildInspectorTextStyle({
      colorVar: "--tom-content-text",
      fontVar: "--tom-font-body",
      fontWeight: 400
    });
    return {
      plannerName: planner?.name || tr("Adventure Planner"),
      themeInlineStyle: this._buildThemeInlineStyle(themeState),
      inspectorHeading2Style,
      inspectorHeading3Style,
      inspectorBodyStyle,
      boardStageStyle: `width:${Math.round(state.board.width * this._zoom)}px;height:${Math.round(state.board.height * this._zoom)}px;`,
      boardStyle: `width:${state.board.width}px;height:${state.board.height}px;transform:scale(${this._zoom});transform-origin:top left;`,
      nodes,
      edges,
      selectedNode,
      isSourceSidebarCollapsed: this._isSourceSidebarCollapsed,
      isSourceScenesExpanded: this._isSourceScenesExpanded,
      isSourceAvatarsExpanded: this._isSourceAvatarsExpanded,
      isSourceMapsExpanded: this._isSourceMapsExpanded,
      sourceScenes,
      sourceAvatars,
      sourceMaps,
      boardCreateMenu: this._boardCreateMenu ? {
        style: `left:${this._boardCreateMenu.left}px;top:${this._boardCreateMenu.top}px;`,
        x: this._boardCreateMenu.x,
        y: this._boardCreateMenu.y
      } : null,
      hasMultiSelection,
      selectedCount: selectedNodesRaw.length,
      canCreateGroupFromSelection: selectedNodesRaw.length > 1,
      selectedBatchTags: hasMultiSelection ? "" : null,
      isInspectorCollapsed: this._isInspectorCollapsed,
      isNodeDesignPresetsExpanded: this._isNodeDesignSectionExpanded("presets"),
      nodeDesignSectionToggleColor,
      selectedNodeColorSections: this._buildSingleNodeColorSections(selectedNodeRaw),
      selectedBatchColorSections: this._buildBatchNodeColorSections(selectedNodesRaw),
      selectedNodeDesignPresets: selectedNodeRaw ? this._buildNodeDesignPresetPreviews(nodeDesignPresets, selectedNodeRaw) : [],
      canCreateNodeDesignPreset: Boolean(selectedNodeRaw) && nodeDesignPresets.length < 10,
      colorPalette: colorPalette.map((entry) => ({
        ...entry,
        isActive: selectedNode
          ? this._getNodeBaseHex(selectedNode) === entry.value.toLowerCase()
          : selectedBatchBaseHex === entry.value.toLowerCase()
      })),
      selectedNodeAlpha: selectedNode ? Math.round(selectedNodeAlpha * 100) : selectedBatchAlpha,
      zoomPercent: Math.round(this._zoom * 100),
      tempEdge: tempEdge ? {
        path: tempEdge.path,
        startX: this._edgeDragState.startX,
        startY: this._edgeDragState.startY,
        endX: this._edgeDragState.currentX,
        endY: this._edgeDragState.currentY
      } : null
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const themeState = TheatreStore.getThemeState();
    const rootElement = html?.[0] ?? this.element?.[0] ?? this.form;
    applyThemeInlineStyleToHost(rootElement, themeState);
    this._bindLayoutListeners(html);
    this._bindSelectionAndEditorListeners(html);
    this._bindNodeActionListeners(html);
    this._bindBoardListeners(html);
    this._bindViewportListeners();
    this._restorePendingInspectorState();
    this._focusInlineTitleInput();
    this._pendingViewportState = null;
  }

  setPosition(...args) {
    const result = super.setPosition(...args);
    this._setResizeVisualState(true);
    this._scheduleResizeVisualStateClear();
    return result;
  }

  _setResizeVisualState(isResizing) {
    const appElement = this.element?.[0];
    const rootElement = appElement?.querySelector(".tom-mindmap") ?? appElement;
    appElement?.classList.toggle("is-window-resizing", isResizing);
    rootElement?.classList.toggle("is-window-resizing", isResizing);
  }

  _scheduleResizeVisualStateClear() {
    clearTimeout(this._windowResizeClassTimeout);
    this._windowResizeClassTimeout = window.setTimeout(() => {
      this._windowResizeClassTimeout = null;
      this._setResizeVisualState(false);
    }, 160);
  }

  _bindLayoutListeners(html) {
    html.find("[data-action='create-group-from-selection']").on("click", this._onCreateGroupFromSelection.bind(this));
    html.find("[data-action='create-node-design-preset']").on("click", this._onCreateNodeDesignPreset.bind(this));
    html.find("[data-action='apply-node-design-preset']").on("click", this._onApplyNodeDesignPreset.bind(this));
    html.find("[data-action='overwrite-node-design-preset']").on("click", this._onOverwriteNodeDesignPreset.bind(this));
    html.find("[data-action='delete-node-design-preset']").on("click", this._onDeleteNodeDesignPreset.bind(this));
    html.find("[data-action='create-board-node']").on("click", this._onCreateBoardNode.bind(this));
    html.find("[data-action='toggle-source-sidebar']").on("click", this._onToggleSourceSidebar.bind(this));
    html.find("[data-action='toggle-inspector']").on("click", this._onToggleInspector.bind(this));
    html.find("[data-action='toggle-source-section']").on("click", this._onToggleSourceSection.bind(this));
    html.find("[data-action='toggle-node-design-section']").on("click", this._onToggleNodeDesignSection.bind(this));
  }

  _bindSelectionAndEditorListeners(html) {
    html.find("[data-action='select-node']").on("click", this._onSelectNode.bind(this));
    html.find("[data-mindmap-node-id]").on("dblclick", this._onNodeDoubleClick.bind(this));
    html.find("[data-action='start-inline-title-edit']").on("click", this._onInlineTitleClick.bind(this));
    html.find("[data-action='start-inline-title-edit']").on("dblclick", this._onStartInlineTitleEdit.bind(this));
    html.find("[data-action='save-inline-title']").on("keydown", this._onInlineTitleKeydown.bind(this));
    html.find("[data-action='save-inline-title']").on("blur", this._onInlineTitleBlur.bind(this));
    html.find("[data-action='node-color-control']").on("input", this._onPreviewNodeColorControl.bind(this));
    html.find("[data-action='node-color-control']").on("change", this._onSaveNodeColorControl.bind(this));
    html.find("[data-action='node-size-control']").on("input", this._onPreviewNodeSizeControl.bind(this));
    html.find("[data-action='node-size-control']").on("change", this._onSaveNodeSizeControl.bind(this));
    html.find("[data-action='save-node-alpha']").on("input", this._onPreviewNodeAlpha.bind(this));
    html.find("[data-action='save-node-alpha']").on("change", this._onSaveNodeAlpha.bind(this));
    html.find("[data-action='save-node-details']").on("change", this._onSaveNodeDetails.bind(this));
    html.find("[data-action='set-node-color']").on("click", this._onSetNodeColor.bind(this));
  }

  _bindNodeActionListeners(html) {
    html.find("[data-action='open-node']").on("click", this._onOpenNode.bind(this));
    html.find("[data-action='rolltable-node']").on("click", this._onRollTableNode.bind(this));
    html.find("[data-action='run-macro-node']").on("click", this._onRunMacroNode.bind(this));
    html.find("[data-action='toggle-node-note']").on("click", this._onToggleNodeNote.bind(this));
    html.find("[data-action='toggle-stage-goblin-node']").on("click", this._onToggleStageGoblinNode.bind(this));
    html.find("[data-action='delete-node']").on("click", this._onDeleteNode.bind(this));
    html.find("[data-action='delete-edge']").on("click", this._onDeleteEdge.bind(this));
    html.find("[data-action='drag-actor-to-scene']").on("dragstart", this._onActorNodeDragStart.bind(this));
    html.find("[data-drag-planner-avatar='true']").on("dragstart", this._onPlannerAvatarDragStart.bind(this));
    html.find("[data-drag-planner-avatar='true']").on("dragend", this._onPlannerAvatarDragEnd.bind(this));
    html.find("[data-drag-planner-scene='true']").on("dragstart", this._onPlannerSceneDragStart.bind(this));
    html.find("[data-drag-planner-map='true']").on("dragstart", this._onPlannerMapDragStart.bind(this));
    html.find("[data-action='drag-node']").on("mousedown", this._onNodeDragStart.bind(this));
    html.find(".tom-mindmap-node").on("mousedown", this._onNodeSurfaceDragStart.bind(this));
    html.find("[data-action='start-edge-port']").on("mousedown", this._onEdgePortStart.bind(this));
    html.find("[data-action='resize-node-edge']").on("mousedown", this._onResizeStart.bind(this));
  }

  _bindBoardListeners(html) {
    html.find("[data-mindmap-board='true']").on("dragover", this._onBoardDragOver.bind(this));
    html.find("[data-mindmap-board='true']").on("drop", this._onBoardDrop.bind(this));
    html.find("[data-mindmap-board='true']").on("click", this._onBoardBackgroundClick.bind(this));
    html.find("[data-mindmap-board='true']").on("dblclick", this._onBoardDoubleClick.bind(this));
  }

  _bindViewportListeners() {
    const viewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport");
    if (!viewport) return;
    this._restorePendingViewportState(viewport);
    viewport.addEventListener("wheel", this._onViewportWheel, { passive: false });
    viewport.addEventListener("mousedown", this._onViewportMouseDown);
    viewport.addEventListener("contextmenu", this._onViewportContextMenu);
  }

  _restorePendingViewportState(viewport) {
    if (!viewport || !this._pendingViewportState) return;
    viewport.scrollLeft = this._pendingViewportState.scrollLeft;
    viewport.scrollTop = this._pendingViewportState.scrollTop;
  }

  _restorePendingInspectorState() {
    const inspector = this.element?.[0]?.querySelector(".tom-mindmap-inspector__fields");
    if (inspector && this._pendingViewportState) {
      inspector.scrollTop = this._pendingViewportState.inspectorScrollTop ?? 0;
    }
  }

  _focusInlineTitleInput() {
    const inlineTitleInput = this._editingNodeTitleId
      ? this.element?.[0]?.querySelector(`[data-inline-title-node-id="${this._editingNodeTitleId}"]`)
      : null;
    if (!inlineTitleInput) return;
    inlineTitleInput.focus();
    inlineTitleInput.select();
  }

  _syncBoardViewport() {
    const state = TheatreStore.getMindmapState(this.plannerId);
    const root = this.element?.[0];
    const boardStage = root?.querySelector(".tom-mindmap-board-stage");
    const board = root?.querySelector(".tom-mindmap-board");
    const zoomBadge = root?.querySelector(".tom-mindmap-zoom");
    if (!boardStage || !board) return;

    boardStage.style.width = `${Math.round(state.board.width * this._zoom)}px`;
    boardStage.style.height = `${Math.round(state.board.height * this._zoom)}px`;
    board.style.width = `${state.board.width}px`;
    board.style.height = `${state.board.height}px`;
    board.style.transform = `scale(${this._zoom})`;
    board.style.transformOrigin = "top left";
    if (zoomBadge) {
      zoomBadge.textContent = `${Math.round(this._zoom * 100)}%`;
    }
  }

  _captureViewportState() {
    const viewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport");
    const inspector = this.element?.[0]?.querySelector(".tom-mindmap-inspector__fields");
    if (!viewport && !inspector) return null;
    return {
      scrollLeft: viewport?.scrollLeft ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
      inspectorScrollTop: inspector?.scrollTop ?? 0
    };
  }

  _renderPreservingViewport(force = false) {
    this._pendingViewportState = this._pendingViewportState ?? this._captureViewportState();
    this.render(force);
  }

  _getSelectedNodeIds() {
    return this.selectedNodeIds?.length ? [...this.selectedNodeIds] : (this.selectedNodeId ? [this.selectedNodeId] : []);
  }

  _setSelection(nodeIds = []) {
    const normalized = Array.from(new Set((Array.isArray(nodeIds) ? nodeIds : []).filter(Boolean)));
    this.selectedNodeIds = normalized;
    this.selectedNodeId = normalized[0] ?? null;
    this._isInspectorCollapsed = normalized.length === 0;
  }

  _buildNodeStyle(node) {
    return [
      `left:${node.x}px`,
      `top:${node.y}px`,
      `width:${node.width}px`,
      `height:${this._getRenderedNodeHeight(node)}px`,
      `--tom-node-note-max-height:${Math.max(0, this._getNodeNoteExpansionHeight(node))}px`,
      `--tom-node-accent:${this._resolveNodeColor(node)}`,
      `--tom-node-glow:${this._resolveNodeColor(node)}`,
      `--tom-node-type-color:${node.typeColor}`,
      `--tom-node-type-size:${this._formatRemValue(this._getNodeTextRemValue("typeSize", node))}`,
      `--tom-node-title-color:${node.titleColor}`,
      `--tom-node-title-size:${this._formatRemValue(this._getNodeTextRemValue("titleSize", node))}`,
      `--tom-node-text-color:${node.textColor}`,
      `--tom-node-text-size:${this._formatRemValue(this._getNodeTextRemValue("textSize", node))}`,
      `--tom-node-handle-color:${node.handleColor}`,
      `--tom-node-action-color:${node.actionIconColor}`,
      `--tom-node-stage-goblin-hatch:${node.stageGoblinHatchColor}`
    ].join(";") + ";";
  }

  _applyNodeAppearanceToElement(nodeElement, node) {
    if (!nodeElement || !node) return;
    nodeElement.style.setProperty("height", `${this._getRenderedNodeHeight(node)}px`);
    nodeElement.style.setProperty("--tom-node-note-max-height", `${Math.max(0, this._getNodeNoteExpansionHeight(node))}px`);
    nodeElement.style.setProperty("--tom-node-accent", this._resolveNodeColor(node));
    nodeElement.style.setProperty("--tom-node-glow", this._resolveNodeColor(node));
    nodeElement.style.setProperty("--tom-node-type-color", node.typeColor);
    nodeElement.style.setProperty("--tom-node-type-size", this._formatRemValue(this._getNodeTextRemValue("typeSize", node)));
    nodeElement.style.setProperty("--tom-node-title-color", node.titleColor);
    nodeElement.style.setProperty("--tom-node-title-size", this._formatRemValue(this._getNodeTextRemValue("titleSize", node)));
    nodeElement.style.setProperty("--tom-node-text-color", node.textColor);
    nodeElement.style.setProperty("--tom-node-text-size", this._formatRemValue(this._getNodeTextRemValue("textSize", node)));
    nodeElement.style.setProperty("--tom-node-handle-color", node.handleColor);
    nodeElement.style.setProperty("--tom-node-action-color", node.actionIconColor);
    nodeElement.style.setProperty("--tom-node-stage-goblin-hatch", node.stageGoblinHatchColor);
    nodeElement.style.setProperty("--tom-node-title-placeholder", node.textColor);
  }

  _setNodeAppearanceVariable(nodeElement, field, colorValue) {
    if (!nodeElement || !field) return;

    if (field === "color") {
      nodeElement.style.setProperty("--tom-node-accent", colorValue);
      nodeElement.style.setProperty("--tom-node-glow", colorValue);
      return;
    }

    const propertyMap = {
      typeColor: "--tom-node-type-color",
      typeSize: "--tom-node-type-size",
      titleColor: "--tom-node-title-color",
      titleSize: "--tom-node-title-size",
      textColor: "--tom-node-text-color",
      textSize: "--tom-node-text-size",
      handleColor: "--tom-node-handle-color",
      actionIconColor: "--tom-node-action-color",
      stageGoblinHatchColor: "--tom-node-stage-goblin-hatch"
    };

    const propertyName = propertyMap[field];
    if (!propertyName) return;
    nodeElement.style.setProperty(propertyName, colorValue);
  }

  _refreshNodeElement(nodeId) {
    const node = TheatreStore.getMindmapState(this.plannerId).nodes.find((entry) => entry.id === nodeId);
    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${nodeId}"]`);
    if (!node || !nodeElement) return;

    this._applyNodeAppearanceToElement(nodeElement, node);
    nodeElement.classList.toggle("is-note-expanded", this._isNodeNoteExpanded(node));
    nodeElement.classList.toggle("has-display-note", this._hasNodeDisplayNote(node));

    const labelElement = nodeElement.querySelector(".tom-mindmap-node__label, .tom-mindmap-group__label");
    if (labelElement) {
      labelElement.textContent = node.label || "Node";
      labelElement.setAttribute("style", this._buildNodeTextStyle(node.titleColor, this._getNodeTextRemValue("titleSize", node)));
    }

    nodeElement.querySelectorAll(".tom-mindmap-node__type").forEach((element) => {
      element.setAttribute("style", this._buildNodeTextStyle(node.typeColor, this._getNodeTextRemValue("typeSize", node)));
    });

    nodeElement.querySelectorAll(".tom-mindmap-node__note-title-icon").forEach((element) => {
      element.setAttribute("style", this._buildNodeTextStyle(node.typeColor, this._getNodeTextRemValue("typeSize", node)));
    });

    nodeElement.querySelectorAll(".tom-mindmap-node__title-input").forEach((element) => {
      element.setAttribute("style", `${this._buildNodeTextStyle(node.titleColor, this._getNodeTextRemValue("titleSize", node), `caret-color:${node.titleColor}`)}--tom-node-title-placeholder:${node.textColor};`);
    });

    const thumbnailPlaceholder = nodeElement.querySelector(".tom-library-thumbnail--placeholder");
    if (thumbnailPlaceholder) {
      thumbnailPlaceholder.setAttribute("style", this._buildNodeTextStyle(node.typeColor, this._getNodeTextRemValue("typeSize", node)));
    }

    const tagsContainer = nodeElement.querySelector(".tom-mindmap-node__tags");
    const tags = Array.isArray(node.tags) ? node.tags : [];
    if (tagsContainer) {
      if (tags.length) {
        tagsContainer.innerHTML = tags.map((tag) => `<span class="tom-tag-chip" style="${this._buildNodeTextStyle(node.textColor, this._getNodeTextRemValue("textSize", node))}">${foundry.utils.escapeHTML(tag)}</span>`).join("");
      } else {
        tagsContainer.remove();
      }
    } else if (tags.length) {
      const body = nodeElement.querySelector(".tom-mindmap-node__body, .tom-mindmap-group__body");
      if (body) {
        const tagsMarkup = document.createElement("div");
        tagsMarkup.className = "tom-mindmap-node__tags";
        tagsMarkup.innerHTML = tags.map((tag) => `<span class="tom-tag-chip" style="${this._buildNodeTextStyle(node.textColor, this._getNodeTextRemValue("textSize", node))}">${foundry.utils.escapeHTML(tag)}</span>`).join("");
        const noteElement = body.querySelector(".tom-mindmap-node__note");
        body.insertBefore(tagsMarkup, noteElement ?? null);
      }
    }

    const notePreview = this._getNodeDisplayNoteText(node);
    const noteRegion = nodeElement.querySelector(".tom-mindmap-node__note-region");
    const noteElement = nodeElement.querySelector(".tom-mindmap-node__note");
    if (noteRegion) {
      noteRegion.classList.toggle("is-expanded", this._isNodeNoteExpanded(node));
      noteRegion.classList.toggle("is-empty", !notePreview);
    }
    if (noteElement) {
      noteElement.textContent = notePreview;
      noteElement.setAttribute("style", this._buildNodeTextStyle(node.textColor, this._getNodeTextRemValue("textSize", node)));
    }

    const noteToggle = nodeElement.querySelector(".tom-mindmap-node__note-toggle");
    if (noteToggle) {
      const isExpanded = this._isNodeNoteExpanded(node);
      noteToggle.classList.toggle("is-expanded", isExpanded);
      noteToggle.title = this._getNodeNoteToggleLabel(node);
      noteToggle.setAttribute("aria-label", this._getNodeNoteToggleLabel(node));
      const icon = noteToggle.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-angle-down", !isExpanded);
        icon.classList.toggle("fa-angle-up", isExpanded);
      }
    }

    this._refreshConnectedEdges(nodeId);
  }

  _refreshInspectorColorState(nodeId) {
    const node = TheatreStore.getMindmapState(this.plannerId).nodes.find((entry) => entry.id === nodeId);
    const root = this.element?.[0];
    if (!node || !root) return;

    const baseHex = this._getNodeBaseHex(node);
    root.querySelectorAll("[data-action='set-node-color']").forEach((button) => {
      button.classList.toggle("is-active", String(button.dataset.color || "").toLowerCase() === baseHex);
    });

    const alphaPercent = Math.round(this._getNodeAlpha(node) * 100);
    root.querySelectorAll("[data-action='save-node-alpha']").forEach((input) => {
      input.value = String(alphaPercent);
    });
    root.querySelectorAll(".tom-color-alpha__value").forEach((alphaValue) => {
      alphaValue.textContent = `${alphaPercent}%`;
    });
  }

  _onViewportContextMenu = (event) => {
    if (this._panState) {
      event.preventDefault();
    }
  };

  _onViewportMouseDown = (event) => {
    if (event.button !== 2) return;

    const viewport = event.currentTarget;
    this._panState = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };

    viewport.classList.add("is-panning");
    event.preventDefault();

    const onMove = (moveEvent) => {
      if (!this._panState) return;
      viewport.scrollLeft = this._panState.scrollLeft - (moveEvent.clientX - this._panState.startX);
      viewport.scrollTop = this._panState.scrollTop - (moveEvent.clientY - this._panState.startY);
    };

    const onUp = () => {
      viewport.classList.remove("is-panning");
      this._panState = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  _onViewportWheel = (event) => {
    event.preventDefault();
    const viewport = event.currentTarget;
    const previousZoom = this._zoom;
    const nextZoom = Math.max(0.5, Math.min(1.8, previousZoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    if (nextZoom === previousZoom) return;

    const rect = viewport.getBoundingClientRect();
    const pointX = event.clientX - rect.left + viewport.scrollLeft;
    const pointY = event.clientY - rect.top + viewport.scrollTop;
    const relativeX = pointX / previousZoom;
    const relativeY = pointY / previousZoom;

    this._zoom = nextZoom;
    this._syncBoardViewport();

    viewport.scrollLeft = (relativeX * nextZoom) - (event.clientX - rect.left);
    viewport.scrollTop = (relativeY * nextZoom) - (event.clientY - rect.top);
  };

  _getPortPosition(node, side) {
    const width = Number(node.width) || 220;
    const height = Number(node.renderedHeight ?? this._getRenderedNodeHeight(node)) || 84;

    if (side === "left") return { x: node.x, y: node.y + (height / 2) };
    if (side === "top") return { x: node.x + (width / 2), y: node.y };
    if (side === "bottom") return { x: node.x + (width / 2), y: node.y + height };
    return { x: node.x + width, y: node.y + (height / 2) };
  }

  _getControlPoint(point, side, distance) {
    if (side === "left") return { x: point.x - distance, y: point.y };
    if (side === "top") return { x: point.x, y: point.y - distance };
    if (side === "bottom") return { x: point.x, y: point.y + distance };
    return { x: point.x + distance, y: point.y };
  }

  _sampleCubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
      x: (mt2 * mt * p0.x) + (3 * mt2 * t * p1.x) + (3 * mt * t2 * p2.x) + (t2 * t * p3.x),
      y: (mt2 * mt * p0.y) + (3 * mt2 * t * p1.y) + (3 * mt * t2 * p2.y) + (t2 * t * p3.y)
    };
  }

  _buildEdgeCurve(fromPoint, fromSide, toPoint, toSide) {
    const dx = Math.abs(toPoint.x - fromPoint.x);
    const dy = Math.abs(toPoint.y - fromPoint.y);
    const distance = Math.max(42, Math.min(140, Math.max(dx, dy) * 0.35));
    const cp1 = this._getControlPoint(fromPoint, fromSide, distance);
    const cp2 = this._getControlPoint(toPoint, toSide, distance);
    const midpoint = this._sampleCubicPoint(fromPoint, cp1, cp2, toPoint, 0.5);

    return {
      path: `M ${fromPoint.x} ${fromPoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toPoint.x} ${toPoint.y}`,
      midpoint
    };
  }

  _composeEdgeColor(baseHex, alpha = 0.92) {
    return `rgba(${this._hexToRgbString(baseHex)}, ${Math.max(0.01, Math.min(1, Number(alpha) || 0.92))})`;
  }

  _getEdgeBaseHex(edge) {
    const explicit = String(edge?.color ?? "").trim();
    const rgbMatch = explicit.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      const toHex = (value) => Number(value).toString(16).padStart(2, "0");
      return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toLowerCase();
    }
    if (explicit.startsWith("#")) return explicit.toLowerCase();
    return "#6e2730";
  }

  _getEdgeAlpha(edge) {
    const alphaFromField = Number(edge?.colorAlpha);
    if (Number.isFinite(alphaFromField) && alphaFromField > 0) {
      return Math.max(0.01, Math.min(1, alphaFromField));
    }

    const match = String(edge?.color ?? "").match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i);
    const alphaFromColor = match ? Number(match[1]) : NaN;
    return Math.max(0.01, Math.min(1, Number.isFinite(alphaFromColor) ? alphaFromColor : 0.92));
  }

  _resolveEdgeColor(edge) {
    return this._composeEdgeColor(this._getEdgeBaseHex(edge), this._getEdgeAlpha(edge));
  }

  _getPortStyle(nodeId, side, edges = []) {
    const connectedEdges = edges.filter((edge) =>
      (edge.fromNodeId === nodeId && (edge.fromSide || "right") === side)
      || (edge.toNodeId === nodeId && (edge.toSide || "left") === side)
    );
    if (!connectedEdges.length) return "";

    const uniqueColors = Array.from(new Set(connectedEdges.map((edge) => this._resolveEdgeColor(edge))));
    if (uniqueColors.length !== 1) return "";
    return `--tom-port-color:${uniqueColors[0]};`;
  }

  _promptEdgeStyle() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let selectedStyle = "solid";
      let selectedColor = "#6e2730";
      let selectedAlpha = 0.92;
      const edgeColors = [
        { value: "#6e2730", swatch: "#6e2730", label: tr("Red") },
        { value: "#54c7c3", swatch: "#54c7c3", label: tr("Aqua") },
        { value: "#6fc5ff", swatch: "#6fc5ff", label: tr("Blue") },
        { value: "#b298ff", swatch: "#b298ff", label: tr("Violet") },
        { value: "#f2c778", swatch: "#f2c778", label: tr("Amber") },
        { value: "#81cc9c", swatch: "#81cc9c", label: tr("Green") }
      ];
      const dialog = new Dialog({
        title: tr("Line style"),
        content: `
          <div class="tom-theme-root tom-theme-default tom-edge-style-dialog">
            <div class="tom-edge-style-dialog__section">
              <strong class="tom-edge-style-dialog__label">${tr("Line style")}</strong>
              <div class="tom-edge-style-dialog__styles">
                <button type="button" class="tom-edge-style-option tom-edge-style-option--solid is-active" data-edge-style="solid" aria-label="${tr("Solid")}" title="${tr("Solid")}">
                  <span class="tom-edge-style-option__line tom-edge-style-option__line--solid" aria-hidden="true"></span>
                </button>
                <button type="button" class="tom-edge-style-option tom-edge-style-option--dashed" data-edge-style="dashed" aria-label="${tr("Dashed")}" title="${tr("Dashed")}">
                  <span class="tom-edge-style-option__line tom-edge-style-option__line--dashed" aria-hidden="true"></span>
                </button>
                <button type="button" class="tom-edge-style-option tom-edge-style-option--dotted" data-edge-style="dotted" aria-label="${tr("Dotted")}" title="${tr("Dotted")}">
                  <span class="tom-edge-style-option__line tom-edge-style-option__line--dotted" aria-hidden="true"></span>
                </button>
              </div>
            </div>
            <div class="tom-edge-style-dialog__section">
              <strong class="tom-edge-style-dialog__label">${tr("Color")}</strong>
            <div class="tom-edge-style-dialog__palette">
              ${edgeColors.map((entry, index) => `<button type="button" class="tom-color-swatch tom-edge-color-swatch ${index === 0 ? "is-active" : ""}" data-edge-color="${entry.value}" title="${entry.label}" aria-label="${entry.label}" style="--tom-swatch-color: ${entry.swatch};"></button>`).join("")}
            </div>
            </div>
            <div class="tom-edge-style-dialog__section">
              <strong class="tom-edge-style-dialog__label">${tr("Transparency")}</strong>
              <div class="tom-color-alpha tom-edge-style-dialog__alpha">
                <input type="range" min="1" max="100" step="1" value="92" data-edge-alpha="true" />
                <span class="tom-color-alpha__value">92%</span>
              </div>
            </div>
          </div>
        `,
        buttons: {
          apply: {
            label: tr("Apply"),
            callback: () => finish({
              style: selectedStyle,
              color: this._composeEdgeColor(selectedColor, selectedAlpha),
              colorAlpha: selectedAlpha
            })
          },
          cancel: { label: tr("Cancel"), callback: () => finish(null) }
        },
        default: "apply",
        render: (html) => {
          const dialogRoot = html.find(".tom-edge-style-dialog");
          const updatePreview = () => {
            dialogRoot.css("--tom-edge-preview-color", this._composeEdgeColor(selectedColor, selectedAlpha));
          };

          html.find("[data-edge-style]").on("click", (event) => {
            selectedStyle = event.currentTarget.dataset.edgeStyle || "solid";
            html.find("[data-edge-style]").removeClass("is-active");
            $(event.currentTarget).addClass("is-active");
          });

          html.find("[data-edge-color]").on("click", (event) => {
            selectedColor = event.currentTarget.dataset.edgeColor || "#6e2730";
            html.find("[data-edge-color]").removeClass("is-active");
            $(event.currentTarget).addClass("is-active");
            updatePreview();
          });

          html.find("[data-edge-alpha]").on("input", (event) => {
            selectedAlpha = Math.max(0.01, Math.min(1, Number(event.currentTarget.value) / 100 || 0.92));
            html.find(".tom-color-alpha__value").text(`${Math.round(selectedAlpha * 100)}%`);
            updatePreview();
          });
          updatePreview();
        },
        close: () => finish(null)
      });
      dialog.render(true);
      window.setTimeout(() => applyTheatreDialogTheme(dialog, MODULE_ID, "24rem"), 30);
    });
  }

  _getNodeGeometry(nodeId) {
    const stateNode = TheatreStore.getMindmapState(this.plannerId).nodes.find((entry) => entry.id === nodeId);
    if (!stateNode) return null;

    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${nodeId}"]`);
    if (!nodeElement) {
      return {
        x: stateNode.x,
        y: stateNode.y,
        width: stateNode.width,
        height: this._getRenderedNodeHeight(stateNode),
        renderedHeight: this._getRenderedNodeHeight(stateNode)
      };
    }

    return {
      x: Number.parseFloat(nodeElement.style.left || `${stateNode.x}`),
      y: Number.parseFloat(nodeElement.style.top || `${stateNode.y}`),
      width: Number.parseFloat(nodeElement.style.width || `${stateNode.width}`),
      height: Number.parseFloat(nodeElement.style.height || `${this._getRenderedNodeHeight(stateNode)}`),
      renderedHeight: Number.parseFloat(nodeElement.style.height || `${this._getRenderedNodeHeight(stateNode)}`)
    };
  }

  _refreshConnectedEdges(nodeId) {
    const root = this.element?.[0];
    if (!root) return;

    const state = TheatreStore.getMindmapState(this.plannerId);
    for (const edge of state.edges) {
      if (edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) continue;

      const fromNode = this._getNodeGeometry(edge.fromNodeId);
      const toNode = this._getNodeGeometry(edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const fromPoint = this._getPortPosition(fromNode, edge.fromSide || "right");
      const toPoint = this._getPortPosition(toNode, edge.toSide || "left");
      const curve = this._buildEdgeCurve(fromPoint, edge.fromSide || "right", toPoint, edge.toSide || "left");
      const pathElement = root.querySelector(`.tom-mindmap-edge[data-edge-id="${edge.id}"]`);
      if (pathElement) {
        pathElement.setAttribute("d", curve.path);
      }
    }
  }

  _getNodeIcon(node) {
    if (node.type === "group") return "fas fa-object-group";
    if (node.type === "theatreScene") return "fas fa-masks-theater";
    if (node.type === "worldMap") return "fas fa-map-location-dot";
    if (node.documentType === "Actor") return "fas fa-user";
    if (node.documentType === "Item") return "fas fa-suitcase";
    if (node.documentType === "JournalEntry" || node.documentType === "JournalEntryPage") return "fas fa-book-open";
    if (node.documentType === "RollTable") return "fas fa-dice";
    if (node.documentType === "Macro") return "fas fa-terminal";
    if (node.documentType === "Scene") return "fas fa-map";
    return "fas fa-circle-nodes";
  }

  _getNodeDisplayType(node) {
    if (node.type === "group") return tr("GROUP");
    if (node.type === "note") return tr("NOTE");
    if (node.documentType === "Actor") return tr("ACTOR");
    if (node.documentType === "RollTable") return tr("ROLLTABLE");
    if (node.documentType === "Macro") return tr("Macro");
    if (node.documentType === "JournalEntry" || node.documentType === "JournalEntryPage") return tr("JOURNAL");
    if (node.documentType === "Scene") return tr("FOUNDRY SCENE");
    if (node.type === "theatreScene") return tr("FOOTLIGHTS SCENE");
    if (node.type === "worldMap") return tr("WORLD MAP");
    return String(node.type || tr("document")).toUpperCase();
  }

  _canToggleStageGoblinForNode(node) {
    if (!node || node.type === "group" || node.type === "note") return false;
    if (node.type === "theatreScene") return true;
    if (node.type === "worldMap") return true;
    return node.type === "document"
      && ["Scene", "Actor", "Item", "JournalEntry", "JournalEntryPage", "Token", "TokenDocument", "RollTable", "Macro"].includes(node.documentType);
  }

  _getNodeColor(node) {
    if (node.type === "group") return "#54c7c3";
    if (node.type === "theatreScene") return "#54c7c3";
    if (node.type === "worldMap") return "#6fc5ff";
    if (node.documentType === "Actor") return "#6fc5ff";
    if (node.documentType === "Item") return "#f2c778";
    if (node.documentType === "JournalEntry" || node.documentType === "JournalEntryPage") return "#b298ff";
    if (node.documentType === "RollTable") return "#86d18f";
    if (node.documentType === "Macro") return "#ffb86f";
    if (node.documentType === "Scene") return "#ff85b6";
    return "#aebfd3";
  }

  _hexToRgbString(hex) {
    const normalized = String(hex ?? "").trim().replace("#", "");
    if (normalized.length !== 6) return "173, 191, 211";
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `${red}, ${green}, ${blue}`;
  }

  _composeNodeColor(baseHex, alpha = 0.42) {
    return this._composeColorValue(baseHex, alpha, { min: 0.01, max: 0.8, fallback: 0.42 });
  }

  _getNodeAlpha(node) {
    return this._getColorAlpha(node?.colorAlpha, node?.color, 0.42, { min: 0.01, max: 0.8 });
  }

  _getNodeBaseHex(node) {
    return this._getColorBaseHex(node?.color, this._getNodeColor(node));
  }

  _resolveNodeColor(node) {
    return this._composeNodeColor(this._getNodeBaseHex(node), this._getNodeAlpha(node));
  }

  _getSceneThumbnail(scene) {
    if (!scene) return "";

    const candidates = [
      scene.thumbnail,
      !isVideoMediaPath(scene.background) ? scene.background : "",
      scene.background?.src,
      scene.background?.image,
      scene.thumb,
      scene.img
    ];

    const thumbnail = candidates.find((value) => typeof value === "string" && value.trim());
    return thumbnail || "";
  }

  async _createNode(nodeData) {
    await TheatreStore.createMindmapNode({
      width: 220,
      colorAlpha: Number(nodeData.colorAlpha) || 0.42,
      color: this._composeNodeColor(this._getNodeColor(nodeData), Number(nodeData.colorAlpha) || 0.42),
      ...nodeData
    }, this.plannerId);
  }

  _getMindmapState() {
    return TheatreStore.getMindmapState(this.plannerId);
  }

  _getStateNode(nodeId) {
    return this._getMindmapState().nodes.find((entry) => entry.id === nodeId) ?? null;
  }

  _getSelectedStateNodes() {
    const selectedIds = new Set(this._getSelectedNodeIds());
    return this._getMindmapState().nodes.filter((node) => selectedIds.has(node.id));
  }

  _getViewportScrollState(viewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport")) {
    return {
      scrollLeft: viewport?.scrollLeft ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
      inspectorScrollTop: this.element?.[0]?.querySelector(".tom-mindmap-inspector__fields")?.scrollTop ?? 0
    };
  }

  _getBoardPositionFromClient(clientX, clientY, viewport, { offsetX = 0, offsetY = 0 } = {}) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: Math.max(24, Math.round(((clientX - rect.left + viewport.scrollLeft) / this._zoom) - offsetX)),
      y: Math.max(24, Math.round(((clientY - rect.top + viewport.scrollTop) / this._zoom) - offsetY))
    };
  }

  async _createNodeAndSelectLatest(nodeData, { render = false } = {}) {
    await this._createNode(nodeData);
    const latestNode = this._getMindmapState().nodes.at(-1) ?? null;
    if (latestNode?.id) {
      this._setSelection([latestNode.id]);
    }
    if (render) {
      this._renderPreservingViewport(false);
    }
    return latestNode;
  }

  async _updateSelectedNodes(resolveUpdate) {
    const selectedNodes = this._getSelectedStateNodes();
    for (const node of selectedNodes) {
      const update = await resolveUpdate(node);
      if (!update) continue;
      await TheatreStore.updateMindmapNode(node.id, update, this.plannerId);
      this._refreshNodeElement(node.id);
    }
    return selectedNodes;
  }

  _previewSelectedNodesAlpha(colorAlpha) {
    const valueBadges = this.element?.[0]?.querySelectorAll(".tom-color-alpha__value") ?? [];
    for (const node of this._getSelectedStateNodes()) {
      const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${node.id}"]`);
      if (!nodeElement) continue;
      const baseHex = this._getNodeBaseHex(node);
      const accent = this._composeNodeColor(baseHex, colorAlpha);
      this._setNodeAppearanceVariable(nodeElement, "color", accent);
    }
    valueBadges.forEach((valueBadge) => {
      valueBadge.textContent = `${Math.round(colorAlpha * 100)}%`;
    });
  }

  _getNodeColorControlContext(event) {
    const control = event.currentTarget?.closest?.("[data-node-color-control]");
    if (!control) return null;

    const field = String(control.dataset.nodeColorField || "").trim();
    const alphaField = String(control.dataset.nodeAlphaField || "").trim();
    const minAlpha = Number(control.dataset.minAlphaPercent ?? 0) / 100;
    const maxAlpha = Number(control.dataset.maxAlphaPercent ?? 100) / 100;
    const colorInput = control.querySelector("[data-node-color-input='true']");
    const alphaInput = control.querySelector("[data-node-alpha-input='true']");
    const alphaDisplay = control.querySelector("[data-node-alpha-display='true']");
    const color = this._getColorBaseHex(colorInput?.value, "#ffffff");
    const alpha = this._getColorAlpha(Number(alphaInput?.value) / 100, null, maxAlpha, { min: minAlpha, max: maxAlpha });

    return {
      control,
      field,
      alphaField,
      minAlpha,
      maxAlpha,
      color,
      alpha,
      alphaDisplay
    };
  }

  _previewSelectedNodesColorField(field, colorValue) {
    for (const node of this._getSelectedStateNodes()) {
      const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${node.id}"]`);
      if (!nodeElement) continue;
      this._setNodeAppearanceVariable(nodeElement, field, colorValue);
    }
  }

  _getNodeSizeControlContext(event) {
    const control = event.currentTarget?.closest?.("[data-node-size-control]");
    if (!control) return null;

    const field = String(control.dataset.nodeSizeField || "").trim();
    const min = Number(control.dataset.minSizeRem ?? 0.5);
    const max = Number(control.dataset.maxSizeRem ?? 2);
    const input = control.querySelector("[data-node-size-input='true']");
    const display = control.querySelector("[data-node-size-display='true']");
    const numeric = Number(input?.value);
    const size = Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : min;

    return {
      field,
      min,
      max,
      size,
      display
    };
  }

  _previewSelectedNodesSizeField(field, sizeValue) {
    for (const node of this._getSelectedStateNodes()) {
      const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${node.id}"]`);
      if (!nodeElement) continue;
      const scaleValue = this._getNodeTextScaleFromRem(field, sizeValue, node);
      this._setNodeAppearanceVariable(nodeElement, field, this._formatRemValue(sizeValue));
      this._applyNodeAppearanceToElement(nodeElement, {
        ...node,
        [field]: scaleValue
      });
      this._refreshConnectedEdges(node.id);
    }
  }

  _getNodeDetailsFormData(root = this.element?.[0]) {
    if (!root) return null;
    const titleInput = root.querySelector("[data-node-field='label']");
    const noteInput = root.querySelector("[data-node-field='noteContent']");
    const tagsInput = root.querySelector("[data-node-field='tags']");
    return {
      label: String(titleInput?.value ?? "").trim() || tr("Node"),
      noteContent: String(noteInput?.value ?? "").trim(),
      tags: String(tagsInput?.value ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8)
    };
  }

  _startPointerInteraction(stateKey, nextState, onMove, onEnd) {
    this[stateKey] = nextState;
    const moveHandler = (event) => onMove.call(this, event);
    const upHandler = async (event) => {
      window.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseup", upHandler);
      await onEnd.call(this, event);
    };
    window.addEventListener("mousemove", moveHandler);
    window.addEventListener("mouseup", upHandler);
  }

  async _createMindmapNodeFromDropPayload(payload, position) {
    if (payload.type === "TheatreScene") {
      const theatreScene = TheatreStore.getSceneById(payload.sceneId);
      if (!theatreScene) return false;
      await this._createNode({
        type: "theatreScene",
        theatreSceneId: theatreScene.id,
        label: theatreScene.name,
        x: position.x,
        y: position.y,
        thumbnail: this._getSceneThumbnail(theatreScene),
        icon: "fas fa-masks-theater"
      });
      return true;
    }

    if (payload.type === "WorldMap") {
      const worldMap = TheatreStore.getWorldMapById(payload.mapId);
      if (!worldMap) return false;
      await this._createNode({
        type: "worldMap",
        worldMapId: worldMap.id,
        label: worldMap.name || tr("World Map"),
        x: position.x,
        y: position.y,
        thumbnail: worldMap.thumbnail || "",
        icon: "fas fa-map-location-dot"
      });
      return true;
    }

    if (payload.type === "TheatreAvatar") {
      const avatar = TheatreStore.getAvatarById(payload.avatarId);
      if (!avatar) return false;
      const actor = getActorById(avatar.actorId);
      await this._createNode({
        type: "document",
        documentType: "Actor",
        documentId: actor?.id || avatar.actorId || "",
        documentUuid: actor?.uuid || "",
        label: actor?.name || avatar.name || tr("Avatar"),
        x: position.x,
        y: position.y,
        thumbnail: avatar.defaultImage || actor?.img || ""
      });
      return true;
    }

    const documentNode = await this._resolveDocumentDropNodeData(payload, position);
    if (!documentNode) return false;
    await this._createNode(documentNode);
    return true;
  }

  async _resolveDocumentDropNodeData(payload, position) {
    const documentType = payload.type;
    if (!documentType) return null;

    let label = documentType;
    let thumbnail = "";
    const documentUuid = payload.uuid || "";
    let resolvedDocument = null;

    if (documentUuid) {
      resolvedDocument = await fromUuid?.(documentUuid);
    }

    const resolvedDocumentType = resolvedDocument?.documentName || documentType;
    const resolvedDocumentId = resolvedDocument?.id || payload.id || payload._id || "";
    if (!resolvedDocumentId && !documentUuid) {
        console.debug(`${MODULE_ID} | mindmap document payload missing id/uuid`, payload);
      ui.notifications?.warn(tr("Adventure Planner could not resolve this document. Please check the browser console."));
      return null;
    }

    if (resolvedDocumentType === "Actor") {
      const actor = resolvedDocument || game.actors?.get(resolvedDocumentId);
      label = actor?.name || label;
      thumbnail = actor?.img || "";
    } else if (resolvedDocumentType === "Item") {
      const item = resolvedDocument || game.items?.get(resolvedDocumentId);
      label = item?.name || label;
      thumbnail = item?.img || "";
    } else if (resolvedDocumentType === "JournalEntry") {
      const journal = resolvedDocument || game.journal?.get(resolvedDocumentId);
      label = journal?.name || label;
    } else if (resolvedDocumentType === "RollTable") {
      const table = resolvedDocument || game.tables?.get(resolvedDocumentId);
      label = table?.name || payload.name || tr("ROLLTABLE");
      thumbnail = table?.thumbnail || table?.img || "";
    } else if (resolvedDocumentType === "Macro") {
      const macro = resolvedDocument || game.macros?.get(resolvedDocumentId);
      label = macro?.name || payload.name || tr("Macro");
      thumbnail = macro?.img || "";
    } else if (resolvedDocumentType === "Scene") {
      const scene = resolvedDocument || game.scenes?.get(resolvedDocumentId);
      label = scene?.name || label;
      thumbnail = this._getSceneThumbnail(scene);
    } else if (resolvedDocumentType === "JournalEntryPage") {
      label = resolvedDocument?.name || payload.name || tr("Journal page");
    } else {
      console.debug(`${MODULE_ID} | mindmap unsupported document payload`, payload);
      ui.notifications?.warn(tr("Adventure Planner cannot process the document type \"{type}\" yet. Please check the browser console.", {
        type: resolvedDocumentType || documentType
      }));
      return null;
    }

    return {
      type: "document",
      documentType: resolvedDocumentType,
      documentId: resolvedDocumentId,
      documentUuid,
      pageId: payload.pageId || "",
      label,
      x: position.x,
      y: position.y,
      thumbnail
    };
  }

  _buildPresetNodeData(kind, position = {}) {
    if (kind === "group") {
      return {
        id: randomId(),
        type: "group",
        label: tr("New group"),
        noteContent: "",
        tags: [],
        x: 200,
        y: 200,
        width: 520,
        height: 320,
        color: this._composeNodeColor("#54c7c3", 0.18),
        colorAlpha: 0.18,
        icon: "fas fa-object-group",
        ...position
      };
    }

    return {
      id: randomId(),
      type: "note",
      label: tr("New sticky note"),
      noteContent: "",
      tags: [],
      x: 160,
      y: 160,
      height: 120,
      color: this._composeNodeColor("#f2c778", 0.46),
      colorAlpha: 0.46,
      icon: "fas fa-note-sticky",
      ...position
    };
  }

  async _onCreateEmptyNode(event) {
    event?.preventDefault?.();
    await this._createNodeAndSelectLatest(this._buildPresetNodeData("note"), { render: true });
  }

  async _onCreateGroup(event) {
    event?.preventDefault?.();
    await this._createNodeAndSelectLatest(this._buildPresetNodeData("group"), { render: true });
  }

  async _onBoardDoubleClick(event) {
    if (event.target.closest("[data-mindmap-node-id], .tom-mindmap-node__port, .tom-mindmap-edge-hit, .tom-mindmap-edge, .tom-mindmap-node__tools")) return;

    event.preventDefault();
    const viewportRect = event.currentTarget.getBoundingClientRect();
    const { x, y } = this._getBoardPositionFromClient(event.clientX, event.clientY, event.currentTarget, { offsetX: 110, offsetY: 60 });
    const menuLeft = Math.max(12, Math.round(event.clientX - viewportRect.left + event.currentTarget.scrollLeft - 10));
    const menuTop = Math.max(12, Math.round(event.clientY - viewportRect.top + event.currentTarget.scrollTop - 10));
    this._boardCreateMenu = { x, y, left: menuLeft, top: menuTop };
    this._renderPreservingViewport(false);
  }

  _onBoardBackgroundClick(event) {
    if (event.target.closest("[data-mindmap-node-id], .tom-mindmap-node__port, .tom-mindmap-edge-hit, .tom-mindmap-edge, .tom-mindmap-node__tools")) return;
    if (this._boardCreateMenu) {
      this._boardCreateMenu = null;
      this._renderPreservingViewport(false);
      return;
    }
    if (!this._getSelectedNodeIds().length && !this._editingNodeTitleId) return;
    this._setSelection([]);
    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  async _onCreateBoardNode(event) {
    event.preventDefault();
    event.stopPropagation();
    const kind = event.currentTarget.dataset.createKind;
    const position = this._boardCreateMenu;
    this._boardCreateMenu = null;
    if (!position) {
      this._renderPreservingViewport(false);
      return;
    }

    if (kind === "group") {
      await this._createNodeAndSelectLatest(this._buildPresetNodeData("group", {
        x: position.x,
        y: position.y
      }));
    } else {
      await this._createNodeAndSelectLatest(this._buildPresetNodeData("note", {
        x: position.x,
        y: position.y
      }));
    }
    this._renderPreservingViewport(false);
  }

  _onToggleInspector(event) {
    event.preventDefault();
    this._isInspectorCollapsed = !this._isInspectorCollapsed;
    const root = this.element?.[0];
    const layout = root?.querySelector(".tom-mindmap-layout");
    const toggle = root?.querySelector("[data-action='toggle-inspector']");
    const toggleIcon = toggle?.querySelector("i");
    if (!layout || !toggle || !toggleIcon) {
      this._renderPreservingViewport(false);
      return;
    }

    layout.classList.toggle("is-inspector-collapsed", this._isInspectorCollapsed);
    toggle.title = this._isInspectorCollapsed ? "Show details" : "Hide details";
    toggle.setAttribute("aria-label", toggle.title);
    toggleIcon.classList.toggle("fa-angle-left", this._isInspectorCollapsed);
    toggleIcon.classList.toggle("fa-angle-right", !this._isInspectorCollapsed);
  }

  _onToggleSourceSidebar(event) {
    event.preventDefault();
    this._isSourceSidebarCollapsed = !this._isSourceSidebarCollapsed;
    const root = this.element?.[0];
    const layout = root?.querySelector(".tom-mindmap-layout");
    const toggle = root?.querySelector("[data-action='toggle-source-sidebar']");
    const toggleIcon = toggle?.querySelector("i");
    if (!layout || !toggle || !toggleIcon) {
      this._renderPreservingViewport(false);
      return;
    }

    layout.classList.toggle("is-source-collapsed", this._isSourceSidebarCollapsed);
    toggle.title = this._isSourceSidebarCollapsed ? "Show Footlights Sources" : "Hide Footlights Sources";
    toggle.setAttribute("aria-label", toggle.title);
    toggleIcon.classList.toggle("fa-angle-right", this._isSourceSidebarCollapsed);
    toggleIcon.classList.toggle("fa-angle-left", !this._isSourceSidebarCollapsed);
  }

  _onToggleSourceSection(event) {
    event.preventDefault();
    const section = event.currentTarget.dataset.sourceSection;
    if (section === "scenes") this._isSourceScenesExpanded = !this._isSourceScenesExpanded;
    if (section === "avatars") this._isSourceAvatarsExpanded = !this._isSourceAvatarsExpanded;
    if (section === "maps") this._isSourceMapsExpanded = !this._isSourceMapsExpanded;

    const button = event.currentTarget;
    const content = button.closest(".tom-mindmap-source-section")?.querySelector(".tom-mindmap-source-section__content");
    const icon = button.querySelector("i");
    const isExpanded = section === "scenes"
      ? this._isSourceScenesExpanded
      : section === "maps"
        ? this._isSourceMapsExpanded
        : this._isSourceAvatarsExpanded;

    if (!content || !icon) {
      this._renderPreservingViewport(false);
      return;
    }

    button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    content.classList.toggle("is-expanded", isExpanded);
    icon.classList.toggle("fa-chevron-down", isExpanded);
    icon.classList.toggle("fa-chevron-right", !isExpanded);
  }

  _onToggleNodeDesignSection(event) {
    event.preventDefault();
    event.stopPropagation();
    const sectionKey = String(event.currentTarget.dataset.nodeDesignSection || "").trim();
    if (!sectionKey) return;

    this._nodeDesignSectionStates[sectionKey] = !this._isNodeDesignSectionExpanded(sectionKey);
    const isExpanded = this._isNodeDesignSectionExpanded(sectionKey);
    const button = event.currentTarget;
    const section = button.closest("[data-node-design-section-root='true']");
    const content = section?.querySelector("[data-node-design-section-content='true']");
    const icon = button.querySelector("i");

    button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    if (content) {
      content.classList.toggle("is-expanded", isExpanded);
    }
    if (icon) {
      icon.classList.toggle("fa-chevron-down", isExpanded);
      icon.classList.toggle("fa-chevron-right", !isExpanded);
    }
  }

  _onSelectNode(event) {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() < this._suppressNodeClickUntil) return;
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId ?? null;
    if (!nodeId) return;

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const selected = new Set(this._getSelectedNodeIds());
      if (selected.has(nodeId)) selected.delete(nodeId);
      else selected.add(nodeId);
      this._setSelection(Array.from(selected));
    } else {
      this._setSelection([nodeId]);
    }
    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  _onNodeSurfaceClick(event) {
    if (Date.now() < this._suppressNodeClickUntil) return;

    const interactiveTarget = event.target.closest(
      [
        "input",
        "textarea",
        "select",
        "button",
        "[data-action]:not([data-action='select-node'])",
        ".tom-mindmap-node__port",
        ".tom-mindmap-node__tools",
        ".tom-mindmap-node__resize-edge",
        ".tom-mindmap-node__color-popover"
      ].join(",")
    );
    if (interactiveTarget) return;

    const nodeElement = event.currentTarget.closest("[data-mindmap-node-id]") || event.currentTarget;
    const nodeId = nodeElement?.dataset?.mindmapNodeId ?? null;
    if (!nodeId) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const selected = new Set(this._getSelectedNodeIds());
      if (selected.has(nodeId)) selected.delete(nodeId);
      else selected.add(nodeId);
      this._setSelection(Array.from(selected));
    } else {
      this._setSelection([nodeId]);
    }

    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  async _onNodeDoubleClick(event) {
    const target = event.target.closest("[data-action]");
    if (target?.dataset.action === "start-inline-title-edit") return;
    if (target && target.dataset.action !== "select-node") return;
    event.preventDefault();
    const body = event.currentTarget.querySelector("[data-action='open-node']");
    if (body) {
      await this._onOpenNode({ preventDefault() {}, currentTarget: body });
    }
  }

  _onInlineTitleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId ?? null;
    if (!nodeId) return;
    if (this.selectedNodeId === nodeId && this.selectedNodeIds.length === 1) return;
    this._setSelection([nodeId]);
    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  _onPlannerAvatarDragStart(event) {
    const avatarId = event.currentTarget.dataset.avatarId;
    if (!avatarId) return;
    setAvatarDragData(event, avatarId, { type: "TheatreAvatar", avatarId });
  }

  _onPlannerAvatarDragEnd() {
    clearDraggedAvatarId();
  }

  _onPlannerSceneDragStart(event) {
    const sceneId = event.currentTarget.dataset.sceneId;
    if (!sceneId) return;
    setTheatreSceneDragData(event, sceneId);
  }

  _onPlannerMapDragStart(event) {
    const mapId = event.currentTarget.dataset.mapId;
    if (!mapId) return;
    setWorldMapDragData(event, mapId);
  }

  _onStartInlineTitleEdit(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId ?? null;
    if (!nodeId) return;
    this._setSelection([nodeId]);
    this._editingNodeTitleId = nodeId;
    this._renderPreservingViewport(false);
  }

  async _commitInlineTitle(nodeId, value) {
    const normalizedValue = String(value ?? "").trim() || "Node";
    const node = this._getStateNode(nodeId);
    if (!node) return;
    if ((node.label || "Node") !== normalizedValue) {
      await TheatreStore.updateMindmapNode(nodeId, { label: normalizedValue }, this.plannerId);
      this._refreshNodeElement(nodeId);
    }
    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  _cancelInlineTitleEdit() {
    this._editingNodeTitleId = null;
    this._renderPreservingViewport(false);
  }

  async _onInlineTitleKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const nodeId = event.currentTarget.dataset.inlineTitleNodeId;
      await this._commitInlineTitle(nodeId, event.currentTarget.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this._cancelInlineTitleEdit();
    }
  }

  async _onInlineTitleBlur(event) {
    const nodeId = event.currentTarget.dataset.inlineTitleNodeId;
    if (!nodeId || this._editingNodeTitleId !== nodeId) return;
    await this._commitInlineTitle(nodeId, event.currentTarget.value);
  }

  _resolveDocumentByNode(node) {
    if (!node) return null;
    if (node.type === "theatreScene") {
      return TheatreStore.getSceneById(node.theatreSceneId);
    }

    if (node.documentUuid) {
      return fromUuidSync?.(node.documentUuid) ?? null;
    }

    const collectionName =
      node.documentType === "Actor" ? "actors" :
      node.documentType === "Item" ? "items" :
      node.documentType === "JournalEntry" ? "journal" :
      node.documentType === "RollTable" ? "tables" :
      node.documentType === "Macro" ? "macros" :
      node.documentType === "Scene" ? "scenes" :
      null;

    return collectionName ? game[collectionName]?.get(node.documentId) ?? null : null;
  }

  async _executeRollTable(document) {
    if (!document?.draw) return;
    await document.draw();
  }

  async _executeMacro(document) {
    if (!document?.execute) return;
    await document.execute();
  }

  async _onOpenNode(event) {
    event.preventDefault();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!node) return;

    if (node.type === "theatreScene") {
      await game.modules.get(MODULE_ID)?.api?.manager?.activateScene?.(node.theatreSceneId);
      return;
    }

    if (node.type === "worldMap") {
      await this._openWorldMapNode(node);
      return;
    }

    if (node.type === "note") {
      this._setSelection([nodeId]);
      this._renderPreservingViewport(false);
      return;
    }

    if (node.documentType === "JournalEntryPage" && node.documentUuid) {
      const page = await fromUuid?.(node.documentUuid);
      page?.sheet?.render?.(true);
      return;
    }

    const document = this._resolveDocumentByNode(node);
    if (node.documentType === "Scene" && document?.view) {
      await document.view();
      return;
    }
    document?.sheet?.render?.(true);
  }

  async _promptWorldMapMode(title = tr("Open world map")) {
    const content = `
      <div class="tom-theme-root tom-theme-default tom-world-map-open-mode-dialog">
        <p class="notes">${tr("Choose how this map should be opened.")}</p>
      </div>
    `;

    return new Promise((resolve) => {
      const dialog = new Dialog({
        title,
        content,
        buttons: {
          windowed: {
            icon: '<i class="fas fa-window-restore"></i>',
            label: tr("Windowed"),
            callback: () => resolve("window")
          },
          fullscreen: {
            icon: '<i class="fas fa-display"></i>',
            label: tr("Fullscreen"),
            callback: () => resolve("stage")
          },
          cancel: {
            label: tr("Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "windowed",
        close: () => resolve(null)
      });
      dialog.render(true);
      scheduleTheatreDialogTheme(dialog, MODULE_ID, "420px", TheatreStore.getThemeState());
    });
  }

  async _openWorldMapNode(node) {
    const worldMap = TheatreStore.getWorldMapById(node?.worldMapId);
    if (!worldMap) {
      ui.notifications?.warn(tr("No world map available."));
      return;
    }
    const mode = await this._promptWorldMapMode(tr("Open world map"));
    if (!mode) return;
    const api = game.modules.get(MODULE_ID)?.api;
    if (mode === "stage") api?.openWorldMapStage?.(worldMap.id);
    else api?.openWorldMap?.(worldMap.id);
  }

  async _onRollTableNode(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!node || node.documentType !== "RollTable") return;
    const document = this._resolveDocumentByNode(node) ?? await fromUuid?.(node.documentUuid);
    await this._executeRollTable(document);
  }

  async _onRunMacroNode(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!node || node.documentType !== "Macro") return;
    const document = this._resolveDocumentByNode(node) ?? await fromUuid?.(node.documentUuid);
    await this._executeMacro(document);
  }

  async _onToggleStageGoblinNode(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!this._canToggleStageGoblinForNode(node)) return;

    await TheatreStore.toggleStageGoblinPlannerNode(this.plannerId, nodeId, node.label || "Entry");
    game.modules.get(MODULE_ID)?.api?.renderStageGoblin?.();
    this._renderPreservingViewport(false);
  }

  async _onDeleteNode(event) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;
    await TheatreStore.deleteMindmapNode(nodeId, this.plannerId);
    this._setSelection(this._getSelectedNodeIds().filter((id) => id !== nodeId));
    this._renderPreservingViewport(false);
  }

  async _onDeleteEdge(event) {
    event.preventDefault();
    event.stopPropagation();
    const edgeId = event.currentTarget.dataset.edgeId;
    if (!edgeId) return;
    await TheatreStore.deleteMindmapEdge(edgeId, this.plannerId);
    this._renderPreservingViewport(false);
  }

  async _onSetNodeColor(event) {
    event.preventDefault();
    const color = event.currentTarget.dataset.color;
    if (!this._getSelectedNodeIds().length || !color) return;
    const selectedNodes = await this._updateSelectedNodes((stateNode) => {
      const colorAlpha = this._getNodeAlpha(stateNode);
      return {
        color: this._composeNodeColor(color, colorAlpha),
        colorAlpha
      };
    });
    this._refreshInspectorColorState(selectedNodes[0]?.id);
  }

  async _onSaveNodeAlpha(event) {
    const colorAlpha = Math.max(0.01, Math.min(0.8, Number(event.currentTarget.value) / 100 || 0.42));
    if (!this._getSelectedNodeIds().length) return;
    const selectedNodes = await this._updateSelectedNodes((stateNode) => {
      const baseHex = this._getNodeBaseHex(stateNode);
      return {
        color: this._composeNodeColor(baseHex, colorAlpha),
        colorAlpha
      };
    });
    this._refreshInspectorColorState(selectedNodes[0]?.id);
  }

  _onPreviewNodeAlpha(event) {
    const colorAlpha = Math.max(0.01, Math.min(0.8, Number(event.currentTarget.value) / 100 || 0.42));
    this._previewSelectedNodesAlpha(colorAlpha);
  }

  _onPreviewNodeColorControl(event) {
    const context = this._getNodeColorControlContext(event);
    if (!context?.field || !context?.alphaField) return;

    if (context.alphaDisplay) {
      context.alphaDisplay.textContent = `${Math.round(context.alpha * 100)}%`;
    }

    const colorValue = this._composeColorValue(context.color, context.alpha, {
      min: context.minAlpha,
      max: context.maxAlpha,
      fallback: context.maxAlpha
    });
    this._previewSelectedNodesColorField(context.field, colorValue);
  }

  _onPreviewNodeSizeControl(event) {
    const context = this._getNodeSizeControlContext(event);
    if (!context?.field) return;

    if (context.display) {
      context.display.textContent = this._formatRemValue(context.size);
    }

    this._previewSelectedNodesSizeField(context.field, context.size);
  }

  async _onSaveNodeColorControl(event) {
    const context = this._getNodeColorControlContext(event);
    if (!context?.field || !context?.alphaField || !this._getSelectedNodeIds().length) return;

    const colorValue = this._composeColorValue(context.color, context.alpha, {
      min: context.minAlpha,
      max: context.maxAlpha,
      fallback: context.maxAlpha
    });
    const selectedNodes = await this._updateSelectedNodes(() => ({
      [context.field]: colorValue,
      [context.alphaField]: context.alpha
    }));

    if (context.field === "color") {
      this._refreshInspectorColorState(selectedNodes[0]?.id);
    }
  }

  async _onSaveNodeSizeControl(event) {
    const context = this._getNodeSizeControlContext(event);
    if (!context?.field || !this._getSelectedNodeIds().length) return;

    if (context.display) {
      context.display.textContent = this._formatRemValue(context.size);
    }

    await this._updateSelectedNodes((node) => ({
      [context.field]: this._getNodeTextScaleFromRem(context.field, context.size, node)
    }));
  }

  async _onCreateNodeDesignPreset(event) {
    event.preventDefault();
    event.stopPropagation();
    const selectedNode = this._getStateNode(this.selectedNodeId);
    if (!selectedNode) return;

    const planner = TheatreStore.getAdventurePlannerById(this.plannerId) ?? TheatreStore.getActiveAdventurePlanner();
    const presets = Array.isArray(planner?.nodeDesignPresets) ? planner.nodeDesignPresets : [];
    if (presets.length >= 10) return;

    await TheatreStore.createMindmapNodeDesignPreset(this.plannerId, {
      id: randomId(),
      name: this._getNextNodeDesignPresetName(presets),
      ...this._extractNodeDesignPatch(selectedNode)
    });
    this._renderPreservingViewport(false);
  }

  async _onApplyNodeDesignPreset(event) {
    event.preventDefault();
    event.stopPropagation();
    const presetId = String(event.currentTarget.dataset.presetId || "").trim();
    const selectedNode = this._getStateNode(this.selectedNodeId);
    if (!presetId || !selectedNode) return;

    const planner = TheatreStore.getAdventurePlannerById(this.plannerId) ?? TheatreStore.getActiveAdventurePlanner();
    const preset = (planner?.nodeDesignPresets ?? []).find((entry) => entry.id === presetId);
    if (!preset) return;

    await TheatreStore.updateMindmapNode(selectedNode.id, this._extractNodeDesignPatch(preset), this.plannerId);
    this._renderPreservingViewport(false);
  }

  async _onOverwriteNodeDesignPreset(event) {
    event.preventDefault();
    event.stopPropagation();
    const presetId = String(event.currentTarget.dataset.presetId || "").trim();
    const selectedNode = this._getStateNode(this.selectedNodeId);
    if (!presetId || !selectedNode) return;

    await TheatreStore.updateMindmapNodeDesignPreset(this.plannerId, presetId, this._extractNodeDesignPatch(selectedNode));
    this._renderPreservingViewport(false);
  }

  async _onDeleteNodeDesignPreset(event) {
    event.preventDefault();
    event.stopPropagation();
    const presetId = String(event.currentTarget.dataset.presetId || "").trim();
    if (!presetId) return;

    await TheatreStore.deleteMindmapNodeDesignPreset(this.plannerId, presetId);
    this._renderPreservingViewport(false);
  }

  async _onSaveNodeDetails(event) {
    const selectedIds = this._getSelectedNodeIds();
    const formData = this._getNodeDetailsFormData();
    if (!selectedIds.length || !formData) return;

    await this._updateSelectedNodes(() => {
      if (selectedIds.length > 1) {
        return {
          tags: formData.tags
        };
      }

      return {
        label: formData.label,
        noteContent: formData.noteContent,
        tags: formData.tags
      };
    });
  }

  async _onCreateGroupFromSelection(event) {
    event.preventDefault();
    const selectedIds = this._getSelectedNodeIds();
    const state = this._getMindmapState();
    const selectedNodes = state.nodes.filter((node) => selectedIds.includes(node.id) && node.type !== "group");
    if (selectedNodes.length < 2) return;

    const minX = Math.min(...selectedNodes.map((node) => node.x));
    const minY = Math.min(...selectedNodes.map((node) => node.y));
    const maxX = Math.max(...selectedNodes.map((node) => node.x + node.width));
    const maxY = Math.max(...selectedNodes.map((node) => node.y + (node.height || 84)));

    const latestNode = await this._createNodeAndSelectLatest(this._buildPresetNodeData("group", {
      x: Math.max(24, minX - 36),
      y: Math.max(24, minY - 44),
      width: Math.max(360, (maxX - minX) + 72),
      height: Math.max(220, (maxY - minY) + 88)
    }));

    if (latestNode?.id) {
      this._renderPreservingViewport(false);
    }
  }

  _onActorNodeDragStart(event) {
    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!node || node.documentType !== "Actor") return;

    const payload = {
      type: "AdventurePlannerActorNode",
      actorId: node.documentId || "",
      uuid: node.documentUuid || "",
      label: node.label || tr("ACTOR")
    };

    const transfer = event.originalEvent?.dataTransfer ?? event.dataTransfer;
    if (!transfer) return;

    transfer.effectAllowed = "copy";
    transfer.setData("text/plain", JSON.stringify(payload));
    transfer.setData("application/x-theatre-adventure-planner-actor-node", JSON.stringify(payload));
  }

  _onNodeDragStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const nodeElement = event.currentTarget.closest("[data-mindmap-node-id]");
    const boardViewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport");
    if (!nodeElement || !boardViewport) return;

    const nodeId = nodeElement.dataset.mindmapNodeId;
    const node = this._getStateNode(nodeId);
    if (!node) return;

    this._startPointerInteraction("_dragState", {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: node.x,
      initialY: node.y,
      zoom: this._zoom,
      moved: false,
      additiveSelection: Boolean(event.ctrlKey || event.metaKey || event.shiftKey)
    }, this._onNodeDragMove, this._onNodeDragEnd);
  }

  _onNodeSurfaceDragStart(event) {
    const interactiveTarget = event.target?.closest?.([
      "[data-action='start-edge-port']",
      "[data-action='resize-node-edge']",
      "[data-action='delete-node']",
      "[data-action='toggle-node-note']",
      "[data-action='toggle-stage-goblin-node']",
      "[data-action='open-node']",
      "[data-action='rolltable-node']",
      "[data-action='run-macro-node']",
      "[data-action='drag-actor-to-scene']",
      "[data-action='start-inline-title-edit']",
      "[data-action='save-inline-title']",
      "[data-action='set-node-color']",
      "[data-action='save-node-alpha']",
      ".tom-mindmap-node__tools",
      ".tom-mindmap-node__action-bar",
      ".tom-mindmap-node__color-popover",
      "input",
      "textarea",
      "select",
      "button"
    ].join(","));

    if (interactiveTarget) return;
    this._onNodeDragStart(event);
  }

  _onResizeStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const nodeElement = event.currentTarget.closest("[data-mindmap-node-id]");
    const nodeId = nodeElement?.dataset.mindmapNodeId;
    const node = this._getStateNode(nodeId);
    if (!node) return;

    this._startPointerInteraction("_resizeState", {
      nodeId,
      edge: event.currentTarget.dataset.resizeEdge || "corner",
      startX: event.clientX,
      startY: event.clientY,
      initialNodeX: node.x,
      initialNodeY: node.y,
      initialWidth: node.width,
      initialHeight: this._getRenderedNodeHeight(node),
      zoom: this._zoom
    }, this._onResizeMove, this._onResizeEnd);
  }

  _onResizeMove(event) {
    if (!this._resizeState) return;

    const deltaX = (event.clientX - this._resizeState.startX) / this._resizeState.zoom;
    const deltaY = (event.clientY - this._resizeState.startY) / this._resizeState.zoom;
    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${this._resizeState.nodeId}"]`);
    if (!nodeElement) return;

    let nextX = this._resizeState.initialNodeX;
    let nextY = this._resizeState.initialNodeY;
    let nextWidth = this._resizeState.initialWidth;
    let nextHeight = this._resizeState.initialHeight;

    if (this._resizeState.edge === "right" || this._resizeState.edge === "corner") {
      nextWidth = Math.max(180, Math.round(this._resizeState.initialWidth + deltaX));
    }

    if (this._resizeState.edge === "bottom" || this._resizeState.edge === "corner") {
      nextHeight = Math.max(84, Math.round(this._resizeState.initialHeight + deltaY));
    }

    if (this._resizeState.edge === "left") {
      nextWidth = Math.max(180, Math.round(this._resizeState.initialWidth - deltaX));
      nextX = Math.round(this._resizeState.initialNodeX + (this._resizeState.initialWidth - nextWidth));
    }

    if (this._resizeState.edge === "top") {
      nextHeight = Math.max(84, Math.round(this._resizeState.initialHeight - deltaY));
      nextY = Math.round(this._resizeState.initialNodeY + (this._resizeState.initialHeight - nextHeight));
    }

    nodeElement.style.left = `${Math.max(24, nextX)}px`;
    nodeElement.style.top = `${Math.max(24, nextY)}px`;
    nodeElement.style.width = `${nextWidth}px`;
    nodeElement.style.height = `${nextHeight}px`;
    const stateNode = this._getStateNode(this._resizeState.nodeId);
    if (stateNode) {
      nodeElement.style.setProperty("--tom-node-note-max-height", `${this._getNodeNoteExpansionHeight({
        ...stateNode,
        width: nextWidth
      })}px`);
    }
    this._refreshConnectedEdges(this._resizeState.nodeId);
  }

  async _onResizeEnd() {
    if (!this._resizeState) return;

    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${this._resizeState.nodeId}"]`);
    const x = Number.parseFloat(nodeElement?.style.left || `${this._resizeState.initialNodeX}`);
    const y = Number.parseFloat(nodeElement?.style.top || `${this._resizeState.initialNodeY}`);
    const width = Number.parseFloat(nodeElement?.style.width || `${this._resizeState.initialWidth}`);
    const height = Number.parseFloat(nodeElement?.style.height || `${this._resizeState.initialHeight}`);
    const nodeId = this._resizeState.nodeId;
    const stateNode = this._getStateNode(nodeId);
    this._resizeState = null;
    const noteExpansionHeight = stateNode && this._isNodeNoteExpanded(stateNode)
      ? this._getNodeNoteExpansionHeight({
        ...stateNode,
        width: Math.max(180, Math.round(width))
      })
      : 0;

    await TheatreStore.updateMindmapNode(nodeId, {
      x: Math.max(24, Math.round(x)),
      y: Math.max(24, Math.round(y)),
      width: Math.max(180, Math.round(width)),
      height: Math.max(84, Math.round(height - noteExpansionHeight))
    }, this.plannerId);

    this._renderPreservingViewport(false);
  }

  async _onToggleNodeNote(event) {
    event.preventDefault();
    event.stopPropagation();

    const nodeId = event.currentTarget.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
    if (!nodeId) return;

    const node = this._getStateNode(nodeId);
    if (!node || !this._hasNodeDisplayNote(node)) return;

    await TheatreStore.updateMindmapNode(nodeId, {
      noteExpanded: !Boolean(node.noteExpanded)
    }, this.plannerId);

    this._refreshNodeElement(nodeId);
  }

  _onEdgePortStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const nodeElement = event.currentTarget.closest("[data-mindmap-node-id]");
    const nodeId = nodeElement?.dataset.mindmapNodeId;
    const side = event.currentTarget.dataset.side || "right";
    const node = this._getStateNode(nodeId);
    if (!node) return;

    const start = this._getPortPosition(node, side);
    this._startPointerInteraction("_edgeDragState", {
      nodeId,
      side,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
      hoverNodeId: null,
      hoverSide: null,
      zoom: this._zoom
    }, this._onEdgePortMove, this._onEdgePortEnd);
    this._renderPreservingViewport(false);
  }

  _onEdgePortMove(event) {
    if (!this._edgeDragState) return;

    const viewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport");
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const hoverPort = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-action='start-edge-port']");

    if (hoverPort) {
      const hoverNodeId = hoverPort.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
      const hoverSide = hoverPort.dataset.side || "left";
      const hoverNode = this._getStateNode(hoverNodeId);
      if (hoverNode && hoverNodeId !== this._edgeDragState.nodeId) {
        const hoverPoint = this._getPortPosition(hoverNode, hoverSide);
        this._edgeDragState.currentX = hoverPoint.x;
        this._edgeDragState.currentY = hoverPoint.y;
        this._edgeDragState.previewSide = hoverSide;
        this._edgeDragState.hoverNodeId = hoverNodeId;
        this._edgeDragState.hoverSide = hoverSide;
      }
    } else {
      this._edgeDragState.currentX = (event.clientX - rect.left + viewport.scrollLeft) / this._edgeDragState.zoom;
      this._edgeDragState.currentY = (event.clientY - rect.top + viewport.scrollTop) / this._edgeDragState.zoom;
      this._edgeDragState.previewSide = this._edgeDragState.side;
      this._edgeDragState.hoverNodeId = null;
      this._edgeDragState.hoverSide = null;
    }

    const line = this.element?.[0]?.querySelector(".tom-mindmap-edge--preview");
    if (line) {
      const previewCurve = this._buildEdgeCurve(
        { x: this._edgeDragState.startX, y: this._edgeDragState.startY },
        this._edgeDragState.side,
        { x: this._edgeDragState.currentX, y: this._edgeDragState.currentY },
        this._edgeDragState.previewSide || this._edgeDragState.side
      );
      line.setAttribute("d", previewCurve.path);
    }

    const startDot = this.element?.[0]?.querySelector(".tom-mindmap-edge-preview-dot--start");
    const endDot = this.element?.[0]?.querySelector(".tom-mindmap-edge-preview-dot--end");
    if (startDot) {
      startDot.setAttribute("cx", `${this._edgeDragState.startX}`);
      startDot.setAttribute("cy", `${this._edgeDragState.startY}`);
    }
    if (endDot) {
      endDot.setAttribute("cx", `${this._edgeDragState.currentX}`);
      endDot.setAttribute("cy", `${this._edgeDragState.currentY}`);
    }
  }

  async _onEdgePortEnd(event) {
    if (!this._edgeDragState) return;

    const fromNodeId = this._edgeDragState.nodeId;
    const fromSide = this._edgeDragState.side;
    const hoveredNodeId = this._edgeDragState.hoverNodeId;
    const hoveredSide = this._edgeDragState.hoverSide;
    this._edgeDragState = null;

    if (hoveredNodeId && hoveredNodeId !== fromNodeId) {
      const edgeConfig = await this._promptEdgeStyle();
      if (edgeConfig) {
        await TheatreStore.createMindmapEdge(
          fromNodeId,
          hoveredNodeId,
          fromSide,
          hoveredSide || "left",
          this.plannerId,
          edgeConfig.style,
          edgeConfig.color,
          edgeConfig.colorAlpha
        );
      }
      this._renderPreservingViewport(false);
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-action='start-edge-port']");
    if (target) {
      const toNodeId = target.closest("[data-mindmap-node-id]")?.dataset.mindmapNodeId;
      const toSide = target.dataset.side || "left";
      if (toNodeId && toNodeId !== fromNodeId) {
        const edgeConfig = await this._promptEdgeStyle();
        if (edgeConfig) {
          await TheatreStore.createMindmapEdge(
            fromNodeId,
            toNodeId,
            fromSide,
            toSide,
            this.plannerId,
            edgeConfig.style,
            edgeConfig.color,
            edgeConfig.colorAlpha
          );
        }
      }
    }

    this._renderPreservingViewport(false);
  }

  _onNodeDragMove(event) {
    if (!this._dragState) return;

    const deltaX = (event.clientX - this._dragState.startX) / this._dragState.zoom;
    const deltaY = (event.clientY - this._dragState.startY) / this._dragState.zoom;
    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${this._dragState.nodeId}"]`);
    if (!nodeElement) return;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      this._dragState.moved = true;
    }
    nodeElement.style.left = `${this._dragState.initialX + deltaX}px`;
    nodeElement.style.top = `${this._dragState.initialY + deltaY}px`;
    this._refreshConnectedEdges(this._dragState.nodeId);
  }

  async _onNodeDragEnd() {
    if (!this._dragState) return;

    const nodeElement = this.element?.[0]?.querySelector(`[data-mindmap-node-id="${this._dragState.nodeId}"]`);
    const finalX = Number.parseFloat(nodeElement?.style.left || `${this._dragState.initialX}`);
    const finalY = Number.parseFloat(nodeElement?.style.top || `${this._dragState.initialY}`);
    const nodeId = this._dragState.nodeId;
    const moved = Boolean(this._dragState.moved);
    const additiveSelection = Boolean(this._dragState.additiveSelection);
    this._dragState = null;

    if (!moved) {
      if (additiveSelection) {
        const selected = new Set(this._getSelectedNodeIds());
        if (selected.has(nodeId)) selected.delete(nodeId);
        else selected.add(nodeId);
        this._setSelection(Array.from(selected));
      } else {
        this._setSelection([nodeId]);
      }
      this._editingNodeTitleId = null;
      this._suppressNodeClickUntil = Date.now() + 220;
      this._renderPreservingViewport(false);
      return;
    }

    if (moved) {
      this._suppressNodeClickUntil = Date.now() + 220;
    }

    await TheatreStore.updateMindmapNode(nodeId, {
      x: Math.max(24, Math.round(finalX)),
      y: Math.max(24, Math.round(finalY))
    }, this.plannerId);

    this._renderPreservingViewport(false);
  }

  _onBoardDragOver(event) {
    event.preventDefault();
    event.originalEvent?.dataTransfer && (event.originalEvent.dataTransfer.dropEffect = "copy");
  }

  _extractDropData(event) {
    const nativeEvent = event.originalEvent ?? event;
    const theatreScenePayload = readTransferJson(event, "application/x-theatre-scene");
    if (theatreScenePayload?.sceneId) {
      return { type: "TheatreScene", sceneId: theatreScenePayload.sceneId };
    }

    const worldMapPayload = readTransferJson(event, "application/x-footlights-world-map");
    if (worldMapPayload?.mapId) {
      return { type: "WorldMap", mapId: worldMapPayload.mapId };
    }

    const foundryPayload = globalThis.TextEditor?.getDragEventData?.(nativeEvent);
    if (foundryPayload?.type) {
        console.debug(`${MODULE_ID} | mindmap foundry drop payload`, foundryPayload);
      return foundryPayload;
    }

    const plain = nativeEvent?.dataTransfer?.getData("text/plain");
    if (!plain) return null;

    try {
      const parsed = JSON.parse(plain);
        console.debug(`${MODULE_ID} | mindmap plain drop payload`, parsed);
      return parsed;
    } catch (_error) {
      console.debug(`${MODULE_ID} | mindmap unparsed text drop payload`, plain);
      return null;
    }
  }

  async _onBoardDrop(event) {
    event.preventDefault();
    const boardElement = event.currentTarget.querySelector(".tom-mindmap-board");
    const payload = this._extractDropData(event);
    if (!boardElement || !payload) {
    console.debug(`${MODULE_ID} | mindmap unsupported drop`, {
        boardFound: Boolean(boardElement),
        payload
      });
      ui.notifications?.warn(tr("An Adventure Planner drop was detected, but the payload could not be processed. Please check the browser console."));
      return;
    }

    const viewport = event.currentTarget;
    const preservedViewportState = this._getViewportScrollState(viewport);
    const position = this._getBoardPositionFromClient(event.clientX, event.clientY, viewport, { offsetX: 110, offsetY: 36 });
    const created = await this._createMindmapNodeFromDropPayload(payload, position);
    if (!created) return;

    this._pendingViewportState = preservedViewportState;
    this._renderPreservingViewport(false);
  }

  async close(options) {
    clearTimeout(this._windowResizeClassTimeout);
    this._windowResizeClassTimeout = null;
    this._setResizeVisualState(false);
    const viewport = this.element?.[0]?.querySelector(".tom-mindmap-board-viewport");
    if (viewport) {
      viewport.removeEventListener("wheel", this._onViewportWheel);
      viewport.removeEventListener("mousedown", this._onViewportMouseDown);
      viewport.removeEventListener("contextmenu", this._onViewportContextMenu);
    }
    return super.close(options);
  }
}
