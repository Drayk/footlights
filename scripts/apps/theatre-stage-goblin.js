import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, clearDraggedAvatarId, getNativeDragEvent, readTransferJson, scheduleTheatreDialogTheme, setAvatarDragData, themeStopToCss } from "../helpers.js";
import { translate as tr } from "../localization.js";
import { TheatreStore } from "../store.js";

export class TheatreStageGoblinApplication extends Application {
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
    this._rootElement = null;
    this._dragState = null;
    this._resizeState = null;
    this._reorderState = null;
    this._isPlannerMenuOpen = false;
    this._onWindowMouseMove = this._onWindowMouseMove.bind(this);
    this._onWindowMouseUp = this._onWindowMouseUp.bind(this);
    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-stage-goblin`,
      title: tr("StageGoblin"),
      classes: [MODULE_ID, "theatre-stage-goblin-app"],
      popOut: false,
      minimizable: false,
      resizable: false,
      left: 96,
      top: 84,
      width: 720,
      height: 92,
      template: `modules/${MODULE_ID}/templates/apps/theatre-stage-goblin.hbs`
    });
  }

  getData() {
    const themeState = TheatreStore.getThemeState();
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const planners = TheatreStore.getAdventurePlanners();
    const bars = stageGoblinState.bars.filter((bar) => bar.visible !== false).map((bar) => {
      const selectedPlannerId = bar.selectedPlannerId || null;
      const plannerOptions = [
        {
          id: "",
          name: tr("No Adventure Planner"),
          isSelected: !selectedPlannerId,
          pinnedCount: ""
        },
        ...planners.map((planner) => ({
          id: planner.id,
          name: planner.name || tr("Adventure Planner"),
          isSelected: planner.id === selectedPlannerId,
          pinnedCount: this._getPlannerPinnedItems(stageGoblinState, planner.id).length
        }))
      ];
      const projectedPlannerItems = selectedPlannerId
        ? this._getPlannerPinnedItems(stageGoblinState, selectedPlannerId)
        : [];
      const items = [
        ...stageGoblinState.items.filter((item) => item.barId === bar.id && item.sourceType !== "plannerNode"),
        ...projectedPlannerItems
      ]
        .map((item) => this._getRenderableItem(item, themeState, bar))
        .filter(Boolean);
      return {
        ...bar,
        tagStyle: this._buildBarInlineStyle(bar, themeState),
        tagPositionClass: `tom-stage-goblin--tag-${String(bar.tagPosition || "left").replaceAll("_", "-")} ${bar.orientation === "vertical" ? "tom-stage-goblin--vertical" : "tom-stage-goblin--horizontal"}`,
        isVertical: bar.orientation === "vertical",
        showLabel: bar.showLabel !== false,
        isCollapsed: Boolean(bar.collapsed),
        hasPlannerOptions: planners.length > 0,
        plannerMenuOpen: this._isPlannerMenuOpen === bar.id && planners.length > 0,
        plannerOptions,
        hasItems: items.length > 0,
        items
      };
    });

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      showLabels: stageGoblinState.showLabels !== false,
      bars
    };
  }

  _buildBarInlineStyle(bar, themeState) {
    const colorWithAlpha = (color, alpha, fallbackStop) => {
      if (!color) return "";
      const fallbackAlpha = Number.isFinite(Number(fallbackStop?.alpha)) ? Number(fallbackStop.alpha) : 1;
      const numericAlpha = Number(alpha);
      const resolvedAlpha = Number.isFinite(numericAlpha) ? numericAlpha : fallbackAlpha;
      return themeStopToCss({
        color,
        alpha: Math.max(0, Math.min(1, resolvedAlpha > 1 ? resolvedAlpha / 100 : resolvedAlpha))
      });
    };
    const entries = [
      `--tom-stage-goblin-border-width:${Number(bar.borderWidth ?? themeState?.stageGoblin?.borderWidth ?? 1)}px`,
      `--tom-stage-goblin-radius:${Number(bar.radius ?? themeState?.stageGoblin?.radius ?? 11)}px`,
      `--tom-stage-goblin-font-size:${Number(bar.fontSize ?? 0.82)}rem`,
      `--tom-stage-goblin-icon-size:${Number(bar.iconSize ?? themeState?.stageGoblin?.iconSize ?? 0.92)}rem`,
      `--tom-stage-goblin-tag-font-size:${Number(bar.tagFontSize ?? themeState?.stageGoblin?.tagFontSize ?? 0.62)}rem`,
      `--tom-stage-goblin-tag-height:${Number(bar.tagHeight ?? themeState?.stageGoblin?.tagHeight ?? 26)}px`,
      `--tom-stage-goblin-tag-width:${Number(bar.tagWidth ?? themeState?.stageGoblin?.tagWidth ?? 92)}px`,
      `--tom-stage-goblin-tag-radius:${Number(bar.tagRadius ?? themeState?.stageGoblin?.tagRadius ?? 4)}px`,
      `--tom-stage-goblin-vertical-item-height:${Number(bar.verticalItemHeight ?? 38)}px`,
      `--tom-stage-goblin-tag-glow-blur:${bar.tagGlowEnabled === false ? 0 : Number(bar.tagGlowBlur ?? themeState?.stageGoblin?.tagGlowBlur ?? 14)}px`,
      `--tom-stage-goblin-tag-glow-alpha:${bar.tagGlowEnabled === false ? "0%" : "34%"}`
    ];
    const surfaceColor = colorWithAlpha(bar.surfaceColor, bar.surfaceAlpha, themeState?.stageGoblin?.surface);
    const borderColor = colorWithAlpha(bar.borderColor, bar.borderAlpha, themeState?.stageGoblin?.border);
    const iconColor = colorWithAlpha(bar.iconColor, bar.iconAlpha, themeState?.stageGoblin?.icon);
    const tagColor = colorWithAlpha(bar.tagColor, bar.tagAlpha, { alpha: 1 });
    const tagTextColor = colorWithAlpha(bar.tagTextColor, bar.tagTextAlpha, { alpha: 1 });
    if (tagColor) entries.unshift(`--tom-stage-goblin-tag-color:${tagColor}`);
    if (tagTextColor) entries.unshift(`--tom-stage-goblin-tag-text:${tagTextColor}`);
    if (surfaceColor) entries.push(`--tom-stage-goblin-surface-bg:${surfaceColor}`);
    if (borderColor) entries.push(`--tom-stage-goblin-border:${borderColor}`);
    if (iconColor) entries.push(`--tom-stage-goblin-control-icon:${iconColor}`);
    return entries.join(";");
  }

  _getPlannerPinnedItems(stageGoblinState, plannerId) {
    const seen = new Set();
    return (stageGoblinState.items ?? []).filter((item) => {
      if (item.sourceType !== "plannerNode" || item.plannerId !== plannerId || !item.nodeId) return false;
      const key = `${item.plannerId}:${item.nodeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._rootElement = html?.[0] ?? this._rootElement;
    applyThemeInlineStyleToHost(html?.[0], TheatreStore.getThemeState());
    this._applySavedPosition();
    this._bindRootListeners();
    requestAnimationFrame(() => {
      const rootElement = this._getRootElement();
      applyThemeInlineStyleToHost(rootElement, TheatreStore.getThemeState());
      this._applySavedPosition();
      this._bindRootListeners();
      this._syncPlannerMenuPosition();
    });
  }

  _injectHTML(html) {
    const nextRoot = html[0];
    document.querySelectorAll(".tom-stage-goblin-stack").forEach((element) => {
      if (element !== nextRoot) element.remove();
    });
    this._rootElement = nextRoot;
    document.body.appendChild(nextRoot);
  }

  _replaceHTML(element, html) {
    const nextRoot = html[0];
    const currentRoot = this._getRootElement();
    if (currentRoot && currentRoot !== nextRoot) {
      currentRoot.replaceWith(nextRoot);
    } else if (element && element !== nextRoot) {
      element.replaceWith(nextRoot);
    } else if (!nextRoot.isConnected) {
      document.body.appendChild(nextRoot);
    }
    this._rootElement = nextRoot;
    document.querySelectorAll(".tom-stage-goblin-stack").forEach((rootElement) => {
      if (rootElement !== nextRoot) rootElement.remove();
    });
  }

  setPosition(position = {}) {
    const savedPosition = TheatreStore.getStageGoblinState().position;
    const nextPosition = {
      left: position.left ?? savedPosition.left ?? 96,
      top: position.top ?? savedPosition.top ?? 84,
      width: position.width ?? savedPosition.width ?? 720,
      height: position.height ?? savedPosition.height ?? 92
    };
    const result = super.setPosition({
      ...position,
      ...nextPosition
    });
    this._applySavedPosition(nextPosition);
    return result;
  }

  async close(options) {
    document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    this._teardownPointerInteractions();
    this._rootElement?.remove?.();
    this._rootElement = null;
    return super.close(options);
  }

  _applySavedPosition(position = null) {
    const root = this._getRootElement();
    if (!root) return;
    const state = TheatreStore.getStageGoblinState();
    for (const bar of state.bars) {
      const barElement = root.querySelector(`[data-stage-goblin-bar-id="${bar.id}"]`);
      if (!barElement) continue;
      const resolvedPosition = position?.barId === bar.id ? position : bar.position;
      const isVertical = bar.orientation === "vertical";
      const minWidth = isVertical ? 168 : 240;
      const fallbackWidth = isVertical ? 210 : 720;
      const safeWidth = Math.max(minWidth, Number(resolvedPosition.width) || fallbackWidth);
      const safeHeight = Math.max(30, Math.min(Number(resolvedPosition.height) || 64, window.innerHeight - 16));
      barElement.style.position = "fixed";
      barElement.style.left = `${Math.max(8, Number(resolvedPosition.left) || 96)}px`;
      barElement.style.top = `${Math.max(8, Number(resolvedPosition.top) || 84)}px`;
      barElement.style.width = `${safeWidth}px`;
      barElement.style.height = `${safeHeight}px`;
      barElement.style.right = "auto";
      barElement.style.bottom = "auto";
      barElement.style.zIndex = "320";
      this._syncResponsiveMetrics(safeWidth, safeHeight, barElement);
    }
    this._syncPlannerMenuPosition();
  }

  _getRootElement() {
    if (this._rootElement?.isConnected) return this._rootElement;
    this._rootElement = document.querySelector(".tom-stage-goblin-stack");
    return this._rootElement;
  }

  _getBarElement(barId = "bar-1") {
    const root = this._getRootElement();
    return root?.querySelector?.(`[data-stage-goblin-bar-id="${barId}"]`) ?? root?.querySelector?.(".tom-stage-goblin") ?? null;
  }

  _bindRootListeners() {
    const rootElement = this._getRootElement();
    if (!rootElement) return;

    rootElement.onmousedown = this._onRootMouseDown.bind(this);
    rootElement.onmousemove = this._onRootMouseMove.bind(this);
    rootElement.onmouseleave = this._onRootMouseLeave.bind(this);
    rootElement.querySelectorAll(".tom-stage-goblin__shell").forEach((shellElement) => {
      shellElement.onmousedown = this._onRootMouseDown.bind(this);
      shellElement.onmousemove = this._onRootMouseMove.bind(this);
      shellElement.onmouseleave = this._onRootMouseLeave.bind(this);
    });

    rootElement.querySelectorAll("[data-action='drag-stage-goblin']").forEach((element) => {
      element.onmousedown = this._onDragStart.bind(this);
    });

    rootElement.querySelectorAll("[data-action='toggle-stage-goblin-planner-menu']").forEach((element) => {
      element.onclick = this._onTogglePlannerMenu.bind(this);
    });

    rootElement.querySelectorAll("[data-action='toggle-stage-goblin-collapse']").forEach((element) => {
      element.onclick = this._onToggleCollapsed.bind(this);
    });

    rootElement.querySelectorAll("[data-action='select-stage-goblin-planner']").forEach((element) => {
      element.onclick = this._onSelectPlanner.bind(this);
    });

    rootElement.querySelectorAll("[data-action='open-stage-goblin-planner']").forEach((element) => {
      element.onclick = this._onOpenPlanner.bind(this);
    });

    rootElement.querySelectorAll("[data-action='resize-stage-goblin']").forEach((element) => {
      element.onmousedown = this._onResizeStart.bind(this);
    });

    rootElement.querySelectorAll("[data-action='drag-stage-goblin-item']").forEach((element) => {
      element.ondragstart = this._onItemDragStart.bind(this);
      element.ondragend = this._onItemDragEnd.bind(this);
    });

    rootElement.querySelectorAll(".tom-stage-goblin__items").forEach((itemsContainer) => {
      itemsContainer.ondragover = this._onItemsContainerDragOver.bind(this);
      itemsContainer.ondrop = this._onItemsContainerDrop.bind(this);
      itemsContainer.ondragleave = this._onItemsContainerDragLeave.bind(this);
      itemsContainer.onwheel = this._onItemsContainerWheel.bind(this);
    });

    rootElement.querySelectorAll("[data-action='open-stage-goblin-item']").forEach((element) => {
      element.onclick = this._onOpenItem.bind(this);
      element.onauxclick = this._onItemAuxClick.bind(this);
      element.oncontextmenu = this._onRemoveItem.bind(this);
    });

    rootElement.querySelectorAll("[data-stage-goblin-dropzone='true']").forEach((dropzone) => {
      dropzone.ondragover = this._onDropzoneDragOver.bind(this);
      dropzone.ondrop = this._onDropzoneDrop.bind(this);
    });

    document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    document.addEventListener("pointerdown", this._onDocumentPointerDown, true);
    this._syncPlannerMenuPosition();
  }

  _syncPlannerMenuPosition() {
    const root = this._getRootElement();
    if (!root) return;

    root.querySelectorAll(".tom-stage-goblin--vertical.is-planner-menu-open").forEach((barElement) => {
      const menu = barElement.querySelector(".tom-stage-goblin__planner-menu");
      if (!menu) return;

      const anchorRect = this._getVerticalPlannerMenuAnchorRect(barElement);
      const menuRect = menu.getBoundingClientRect();
      const gap = 8;
      const menuWidth = Math.max(menuRect.width, menu.offsetWidth, 192);
      const maxLeft = Math.max(gap, window.innerWidth - menuWidth - gap);
      const maxTop = Math.max(gap, window.innerHeight - menuRect.height - gap);
      const desiredLeft = anchorRect.right + gap;
      const left = Math.max(gap, Math.min(maxLeft, desiredLeft));
      const top = Math.max(gap, Math.min(maxTop, anchorRect.top));
      menu.style.setProperty("--tom-stage-goblin-menu-left", `${Math.round(left)}px`);
      menu.style.setProperty("--tom-stage-goblin-menu-top", `${Math.round(top)}px`);
    });
  }

  _getVerticalPlannerMenuAnchorRect(barElement) {
    const barRect = barElement.getBoundingClientRect();
    const toggleRect = barElement.querySelector(".tom-stage-goblin__planner-toggle")?.getBoundingClientRect();
    if (toggleRect?.width > 0 && toggleRect?.height > 0) {
      return {
        top: toggleRect.top,
        right: toggleRect.right
      };
    }
    const controlsRect = barElement.querySelector(".tom-stage-goblin__controls")?.getBoundingClientRect();
    const itemRects = Array.from(barElement.querySelectorAll(".tom-stage-goblin__item, .tom-stage-goblin__empty"))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const saneItemRight = itemRects
      .filter((rect) => rect.width <= 280)
      .reduce((right, rect) => Math.max(right, rect.right), 0);
    const comfortRight = barRect.left + Math.min(Math.max(barRect.width, 168), 210);
    const right = Math.max(
      controlsRect?.right ?? barRect.left,
      saneItemRight || 0,
      comfortRight
    );
    const top = Math.min(
      controlsRect?.top ?? barRect.top,
      ...itemRects.map((rect) => rect.top),
      barRect.top
    );
    return {
      top: Number.isFinite(top) ? top : barRect.top,
      right
    };
  }

  _getRenderableItem(item, themeState, bar = null) {
    if (item.sourceType === "plannerNode") {
      const planner = TheatreStore.getAdventurePlannerById(item.plannerId);
      const node = planner?.nodes?.find((entry) => entry.id === item.nodeId) ?? null;
      if (!planner || !node) return null;
      const canDragToCanvas = this._canDragItemToCanvas(item, node);
      return {
        id: item.id,
        label: node.label || item.label || tr("Entry"),
        tooltip: tr("{planner}: {label}", {
          planner: planner.name || tr("Adventure Planner"),
          label: node.label || item.label || tr("Entry")
        }),
        accentStyle: this._buildPlannerNodeItemStyle(node, themeState),
        sourceType: item.sourceType,
        canDragToCanvas,
        canvasDragTitle: canDragToCanvas ? "Auf Canvas ziehen" : ""
      };
    }

    const canDragToCanvas = this._canDragItemToCanvas(item);
    return {
      id: item.id,
      label: item.label || tr("Entry"),
      tooltip: item.label || item.documentType || tr("Entry"),
      accentStyle: this._buildDocumentItemStyle(item.documentType, themeState, bar),
      sourceType: item.sourceType,
      canDragToCanvas,
      canvasDragTitle: canDragToCanvas ? "Auf Canvas ziehen" : ""
    };
  }

  _buildPlannerNodeItemStyle(node, themeState) {
    return [
      `--tom-stage-goblin-accent:${this._resolvePlannerNodeAccent(node)}`,
      `--tom-stage-goblin-text:${node?.titleColor || themeStopToCss(themeState?.planner?.heading)}`,
      `--tom-stage-goblin-icon:${node?.handleColor || themeStopToCss(themeState?.planner?.handle)}`
    ].join(";");
  }

  _buildDocumentItemStyle(documentType, themeState, bar = null) {
    return [
      `--tom-stage-goblin-accent:${this._resolveDocumentAccent(documentType)}`,
      `--tom-stage-goblin-text:${this._resolveBarTextColor(bar, themeState)}`,
      `--tom-stage-goblin-icon:${themeStopToCss(themeState?.planner?.actionIcon)}`
    ].join(";");
  }

  _resolveBarTextColor(bar, themeState) {
    const color = String(bar?.textColor || themeState?.stageGoblin?.text?.color || "").trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) return themeStopToCss(themeState?.stageGoblin?.text ?? themeState?.planner?.heading);
    const numericAlpha = Number(bar?.textAlpha ?? themeState?.stageGoblin?.text?.alpha ?? 1);
    const alpha = Number.isFinite(numericAlpha) ? numericAlpha : 1;
    return themeStopToCss({
      color,
      alpha: Math.max(0, Math.min(1, alpha > 1 ? alpha / 100 : alpha))
    });
  }

  _canDragItemToCanvas(item, plannerNode = null) {
    if (!item) return false;
    if (item.sourceType === "document" && item.documentType === "avatar") return true;
    if (item.sourceType === "plannerNode") {
      return ["Actor", "Token", "TokenDocument"].includes(plannerNode?.documentType);
    }

    return item.sourceType === "document" && ["Actor", "Token", "TokenDocument"].includes(item.documentType);
  }

  _buildCanvasDragPayload(itemId) {
    const item = this._getStageGoblinItem(itemId);
    if (!item) return null;

    if (item.sourceType === "document" && item.documentType === "avatar") {
      const avatar = TheatreStore.getAvatarById(item.documentId);
      return avatar ? {
        type: "TheatreAvatar",
        avatarId: avatar.id,
        name: avatar.name || item.label || tr("Avatar")
      } : null;
    }

    if (item.sourceType === "plannerNode") {
      const planner = TheatreStore.getAdventurePlannerById(item.plannerId);
      const node = planner?.nodes?.find((entry) => entry.id === item.nodeId) ?? null;
      if (!node || !this._canDragItemToCanvas(item, node)) return null;

      const tokenDocument = ["Token", "TokenDocument"].includes(node.documentType)
        ? (node.documentUuid ? fromUuidSync?.(node.documentUuid) : null)
        : null;
      const actor = node.documentType === "Actor"
        ? (node.documentUuid ? fromUuidSync?.(node.documentUuid) : game.actors?.get(node.documentId))
        : tokenDocument?.actor ?? null;

      return {
        type: "AdventurePlannerActorNode",
        actorId: actor?.id || "",
        uuid: actor?.uuid || "",
        tokenUuid: tokenDocument?.uuid || node.documentUuid || "",
        label: node.label || actor?.name || tr("ACTOR")
      };
    }

    if (!this._canDragItemToCanvas(item)) return null;

    const tokenDocument = ["Token", "TokenDocument"].includes(item.documentType)
      ? (item.documentUuid ? fromUuidSync?.(item.documentUuid) : null)
      : null;
    const actor = item.documentType === "Actor"
      ? (item.documentUuid ? fromUuidSync?.(item.documentUuid) : game.actors?.get(item.documentId))
      : tokenDocument?.actor ?? null;

    return {
      type: "AdventurePlannerActorNode",
      actorId: actor?.id || "",
      uuid: actor?.uuid || "",
      tokenUuid: tokenDocument?.uuid || item.documentUuid || "",
      label: item.label || actor?.name || tr("ACTOR")
    };
  }

  _resolvePlannerNodeAccent(node) {
    if (node?.color) return node.color;
    if (node?.type === "theatreScene") return "rgba(84, 199, 195, 0.42)";
    if (node?.type === "worldMap") return "rgba(111, 197, 255, 0.42)";
    if (node?.type === "portal") return "rgba(185, 215, 122, 0.42)";
    if (node?.documentType === "Actor" || node?.documentType === "Token" || node?.documentType === "TokenDocument") return "rgba(111, 197, 255, 0.42)";
    if (node?.documentType === "Item") return "rgba(242, 199, 120, 0.42)";
    if (node?.documentType === "JournalEntry" || node?.documentType === "JournalEntryPage") return "rgba(178, 152, 255, 0.42)";
    if (node?.documentType === "RollTable") return "rgba(134, 209, 143, 0.42)";
    if (node?.documentType === "Macro") return "rgba(255, 184, 111, 0.42)";
    if (node?.documentType === "Scene") return "rgba(255, 133, 182, 0.42)";
    return "rgba(174, 191, 211, 0.42)";
  }

  _resolveDocumentAccent(documentType) {
    if (documentType === "theatreScene") return "rgba(84, 199, 195, 0.42)";
    if (documentType === "worldMap") return "rgba(111, 197, 255, 0.42)";
    if (documentType === "portal") return "rgba(185, 215, 122, 0.42)";
    if (documentType === "avatar") return "rgba(111, 197, 255, 0.42)";
    if (documentType === "soundPlaylist") return "rgba(242, 199, 120, 0.42)";
    if (documentType === "Scene") return "rgba(255, 133, 182, 0.42)";
    if (documentType === "Actor" || documentType === "Token" || documentType === "TokenDocument") return "rgba(111, 197, 255, 0.42)";
    if (documentType === "JournalEntry" || documentType === "JournalEntryPage") return "rgba(178, 152, 255, 0.42)";
    if (documentType === "RollTable") return "rgba(134, 209, 143, 0.42)";
    if (documentType === "Macro") return "rgba(255, 184, 111, 0.42)";
    if (documentType === "Item") return "rgba(242, 199, 120, 0.42)";
    return "rgba(174, 191, 211, 0.42)";
  }

  _getStageGoblinItem(itemId) {
    return TheatreStore.getStageGoblinState().items.find((item) => item.id === itemId) ?? null;
  }

  _resolveDocumentByReference(documentType, documentId, documentUuid) {
    if (documentUuid) {
      return fromUuidSync?.(documentUuid) ?? null;
    }

    const collectionName =
      documentType === "Actor" ? "actors" :
      documentType === "Item" ? "items" :
      documentType === "JournalEntry" ? "journal" :
      documentType === "RollTable" ? "tables" :
      documentType === "Macro" ? "macros" :
      documentType === "Scene" ? "scenes" :
      null;

    return collectionName ? game[collectionName]?.get(documentId) ?? null : null;
  }

  async _openPlannerNodeReference(item) {
    const planner = TheatreStore.getAdventurePlannerById(item.plannerId);
    const node = planner?.nodes?.find((entry) => entry.id === item.nodeId) ?? null;
    if (!node) return;

    if (node.type === "theatreScene") {
      await this.manager?.activateScene?.(node.theatreSceneId);
      return;
    }

    if (node.type === "worldMap") {
      await this._openWorldMapNode(node);
      return;
    }

    if (node.type === "portal") {
      await this._openPortalNode(node);
      return;
    }

    if (node.documentType === "JournalEntryPage" && node.documentUuid) {
      const page = await fromUuid?.(node.documentUuid);
      page?.sheet?.render?.(true);
      return;
    }

    const document = this._resolveDocumentByReference(node.documentType, node.documentId, node.documentUuid);
    if (node.documentType === "RollTable" && document?.draw) {
      await document.draw();
      return;
    }
    if (node.documentType === "Macro" && document?.execute) {
      await document.execute();
      return;
    }
    if (node.documentType === "Scene" && document?.view) {
      await document.view();
      return;
    }
    if ((node.documentType === "Token" || node.documentType === "TokenDocument") && document?.object?.control) {
      document.object.control({ releaseOthers: true });
    }
    document?.sheet?.render?.(true);
  }

  async _promptWorldMapMode(title = tr("Open world map")) {
    const content = `
      <div class="tom-world-map-open-mode-dialog">
        <p class="notes">${tr("Choose how this entry should be opened.")}</p>
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
      const markDialog = () => dialog.element?.addClass("tom-world-map-open-mode-dialog-host");
      markDialog();
      scheduleTheatreDialogTheme(dialog, MODULE_ID, "360px", TheatreStore.getThemeState());
      requestAnimationFrame(markDialog);
      window.setTimeout(markDialog, 50);
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

  async _openPortalNode(node) {
    const portal = TheatreStore.getPortalById(node?.portalId);
    if (!portal) {
      ui.notifications?.warn(tr("No portal available."));
      return;
    }
    const mode = await this._promptWorldMapMode(tr("Open portal"));
    if (!mode) return;
    const api = game.modules.get(MODULE_ID)?.api;
    if (mode === "stage") api?.openPortalStage?.(portal.id);
    else api?.openPortal?.(portal.id);
  }

  async _openDocumentReference(item) {
    const api = game.modules.get(MODULE_ID)?.api;
    if (item.documentType === "theatreScene") {
      await this.manager?.activateScene?.(item.documentId);
      return;
    }
    if (item.documentType === "worldMap") {
      await this._openWorldMapNode({ worldMapId: item.documentId });
      return;
    }
    if (item.documentType === "portal") {
      await this._openPortalNode({ portalId: item.documentId });
      return;
    }
    if (item.documentType === "avatar") {
      const avatar = TheatreStore.getAvatarById(item.documentId);
      const actor = avatar?.actorId ? game.actors?.get?.(avatar.actorId) : null;
      if (!actor) {
        ui.notifications?.warn(tr("This Footlights avatar needs a linked actor before it can be opened from StageGoblin."));
        return;
      }
      actor.sheet?.render?.(true);
      return;
    }
    if (item.documentType === "soundPlaylist") {
      api?.openSoundPlaylist?.(item.documentId);
      return;
    }

    let document = this._resolveDocumentByReference(item.documentType, item.documentId, item.documentUuid);
    if (!document && item.documentUuid) {
      document = await fromUuid?.(item.documentUuid);
    }
    if (!document) return;

    const documentName = document.documentName || item.documentType;
    if (documentName === "RollTable" && document.draw) {
      await document.draw();
      return;
    }
    if (documentName === "Macro" && document.execute) {
      await document.execute();
      return;
    }
    if (documentName === "Scene" && document.view) {
      await document.view();
      return;
    }
    if ((documentName === "Token" || documentName === "TokenDocument") && document.object?.control) {
      document.object.control({ releaseOthers: true });
    }
    document.sheet?.render?.(true);
  }

  async _activateNativeSceneReference(item) {
    if (!item) return false;
    let document = null;

    if (item.sourceType === "plannerNode") {
      const planner = TheatreStore.getAdventurePlannerById(item.plannerId);
      const node = planner?.nodes?.find((entry) => entry.id === item.nodeId) ?? null;
      if (node?.documentType !== "Scene") return false;
      document = this._resolveDocumentByReference(node.documentType, node.documentId, node.documentUuid);
      if (!document && node.documentUuid) document = await fromUuid?.(node.documentUuid);
    } else if (item.documentType === "Scene") {
      document = this._resolveDocumentByReference(item.documentType, item.documentId, item.documentUuid);
      if (!document && item.documentUuid) document = await fromUuid?.(item.documentUuid);
    }

    const scene = document?.documentName === "Scene" ? document : null;
    if (!scene?.activate) return false;
    await scene.activate();
    return true;
  }

  async _onOpenItem(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest("[data-stage-goblin-item-id]")?.dataset.stageGoblinItemId;
    if (!itemId) return;

    const item = this._getStageGoblinItem(itemId);
    if (!item) return;

    if (item.sourceType === "plannerNode") {
      await this._openPlannerNodeReference(item);
      return;
    }

    await this._openDocumentReference(item);
  }

  async _onItemAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const itemId = event.currentTarget.closest("[data-stage-goblin-item-id]")?.dataset.stageGoblinItemId;
    if (!itemId) return;

    const item = this._getStageGoblinItem(itemId);
    const activated = await this._activateNativeSceneReference(item);
    if (activated) return;

    await this._onOpenItem(event);
  }

  async _onRemoveItem(event) {
    event.preventDefault();
    event.stopPropagation();
    const itemId = event.currentTarget.closest("[data-stage-goblin-item-id]")?.dataset.stageGoblinItemId;
    if (!itemId) return;
    await TheatreStore.removeStageGoblinItem(itemId);
    this.render(false);
  }

  _onTogglePlannerMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset.stageGoblinBarId || "bar-1";
    this._isPlannerMenuOpen = this._isPlannerMenuOpen === barId ? false : barId;
    this.render(false);
    requestAnimationFrame(() => this._syncPlannerMenuPosition());
  }

  async _onSelectPlanner(event) {
    event.preventDefault();
    event.stopPropagation();
    const plannerId = String(event.currentTarget?.dataset?.plannerId || "").trim();
    const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset.stageGoblinBarId || "bar-1";
    this._isPlannerMenuOpen = false;
    await TheatreStore.saveStageGoblinSelectedPlanner(plannerId, barId);
    this.render(false);
  }

  _onOpenPlanner(event) {
    event.preventDefault();
    event.stopPropagation();
    const plannerId = String(event.currentTarget?.dataset?.plannerId || "").trim();
    if (!plannerId) return;
    this._isPlannerMenuOpen = false;
    game.modules.get(MODULE_ID)?.api?.openAdventurePlanner?.(plannerId);
  }

  _onDocumentPointerDown(event) {
    if (!this._isPlannerMenuOpen) return;
    const barElement = this._getBarElement(this._isPlannerMenuOpen);
    if (!barElement) return;
    const planner = barElement.querySelector(".tom-stage-goblin__planner");
    const menu = barElement.querySelector(".tom-stage-goblin__planner-menu");
    if (planner?.contains(event.target) || menu?.contains(event.target)) return;
    this._isPlannerMenuOpen = false;
    this.render(false);
  }

  async _onToggleCollapsed(event) {
    event.preventDefault();
    event.stopPropagation();
    const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset.stageGoblinBarId || "bar-1";
    const bar = TheatreStore.getStageGoblinState().bars.find((entry) => entry.id === barId);
    const nextCollapsed = !bar?.collapsed;
    this._isPlannerMenuOpen = false;
    await TheatreStore.saveStageGoblinCollapsed(nextCollapsed, barId);
    this.render(false);
  }

  _onDragStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rootElement = event.currentTarget?.closest?.(".tom-stage-goblin");
    if (!rootElement) return;

    this._dragState = {
      barId: rootElement.dataset.stageGoblinBarId || "bar-1",
      offsetX: event.clientX - rootElement.getBoundingClientRect().left,
      offsetY: event.clientY - rootElement.getBoundingClientRect().top
    };

    document.addEventListener("mousemove", this._onWindowMouseMove);
    document.addEventListener("mouseup", this._onWindowMouseUp);
  }

  _onResizeStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const edge = event.currentTarget?.dataset?.edge;
    this._beginResize(event, edge);
  }

  _detectResizeEdge(event) {
    const barElement = event.target?.closest?.(".tom-stage-goblin") ?? this._getBarElement();
    if (!barElement) return null;
    const rect = barElement.getBoundingClientRect();
    const threshold = 18;
    const nearLeft = event.clientX <= rect.left + threshold;
    const nearRight = event.clientX >= rect.right - threshold;
    const nearTop = event.clientY <= rect.top + threshold;
    const nearBottom = event.clientY >= rect.bottom - threshold;

    if (nearLeft) return "left";
    if (nearRight) return "right";
    if (nearTop) return "top";
    if (nearBottom) return "bottom";
    return null;
  }

  _setResizeCursor(edge = null) {
    const rootElement = this._getRootElement();
    const cursor =
      edge === "left" || edge === "right" ? "ew-resize" :
      edge === "top" || edge === "bottom" ? "ns-resize" :
      "";

    rootElement?.querySelectorAll?.(".tom-stage-goblin, .tom-stage-goblin__shell").forEach((element) => {
      element.style.cursor = cursor;
    });
  }

  _onRootMouseMove(event) {
    if (this._dragState || this._resizeState) return;
    if (event.target?.closest?.(".tom-stage-goblin__tag, .tom-stage-goblin__planner-menu")) {
      this._setResizeCursor(null);
      return;
    }
    const edge = this._detectResizeEdge(event);
    this._setResizeCursor(edge);
  }

  _onRootMouseLeave() {
    if (this._dragState || this._resizeState) return;
    this._setResizeCursor(null);
  }

  _onRootMouseDown(event) {
    if (event.button !== 0) return;
    const barElement = event.target?.closest?.(".tom-stage-goblin");
    if (!barElement) return;
    if (event.target?.closest?.("[data-action='drag-stage-goblin'], [data-action='toggle-stage-goblin-planner-menu'], [data-action='toggle-stage-goblin-collapse'], .tom-stage-goblin__planner-menu, .tom-stage-goblin__item, .tom-stage-goblin__empty, .tom-stage-goblin__tag")) {
      return;
    }
    const edge = this._detectResizeEdge(event);

    if (!edge) return;
    this._beginResize(event, edge);
  }

  _beginResize(event, edge) {
    const rootElement = event.currentTarget?.closest?.(".tom-stage-goblin") ?? event.target?.closest?.(".tom-stage-goblin");
    if (!rootElement || !edge) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = rootElement.getBoundingClientRect();
    this._resizeState = {
      edge,
      barId: rootElement.dataset.stageGoblinBarId || "bar-1",
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height
    };

    document.addEventListener("mousemove", this._onWindowMouseMove);
    document.addEventListener("mouseup", this._onWindowMouseUp);
  }

  _onItemDragStart(event) {
    const nativeEvent = getNativeDragEvent(event);
    if (!nativeEvent?.dataTransfer) return;

    const itemElement = event.currentTarget.closest("[data-stage-goblin-item-id]");
    if (!itemElement) return;
    const barElement = itemElement.closest(".tom-stage-goblin");

    this._reorderState = {
      barId: barElement?.dataset?.stageGoblinBarId || "bar-1",
      draggedItemId: itemElement.dataset.stageGoblinItemId,
      targetItemId: itemElement.dataset.stageGoblinItemId,
      insertAfter: false,
      didDrop: false
    };
    itemElement.classList.add("is-reordering");
    barElement?.classList.add("is-reordering-item");
    nativeEvent.dataTransfer.effectAllowed = "move";
    nativeEvent.dataTransfer.setData("application/x-theatre-stage-goblin-item", JSON.stringify({
      itemId: this._reorderState.draggedItemId
    }));
    const canvasPayload = this._buildCanvasDragPayload(this._reorderState.draggedItemId);
    if (canvasPayload) {
      if (canvasPayload.type === "TheatreAvatar") {
        setAvatarDragData(event, canvasPayload.avatarId, canvasPayload);
        nativeEvent.dataTransfer.effectAllowed = "copyMove";
      } else {
        nativeEvent.dataTransfer.setData("text/plain", JSON.stringify(canvasPayload));
        nativeEvent.dataTransfer.setData("application/x-theatre-adventure-planner-actor-node", JSON.stringify(canvasPayload));
      }
    }
    nativeEvent.dataTransfer.setDragImage(itemElement, Math.min(itemElement.clientWidth * 0.5, 80), Math.min(itemElement.clientHeight * 0.5, 18));
  }

  _onWindowMouseMove(event) {
    if (this._dragState) {
      this._updateBarPosition(event);
      return;
    }

    if (this._resizeState) {
      this._updateBarSize(event);
    }
  }

  _updateBarPosition(event) {
    const rootElement = this._getBarElement(this._dragState?.barId);
    if (!rootElement) return;

    const nextLeft = Math.max(8, event.clientX - this._dragState.offsetX);
    const nextTop = Math.max(8, event.clientY - this._dragState.offsetY);
    rootElement.style.left = `${nextLeft}px`;
    rootElement.style.top = `${nextTop}px`;
    rootElement.style.right = "auto";
    rootElement.style.bottom = "auto";
    this._syncPlannerMenuPosition();
  }

  _updateBarSize(event) {
    const rootElement = this._getBarElement(this._resizeState?.barId);
    if (!rootElement || !this._resizeState) return;

    const minWidth = rootElement.classList.contains("tom-stage-goblin--vertical") ? 168 : 240;
    const minHeight = 30;
    const viewportHeight = Math.max(window.innerHeight - 16, minHeight);
    const deltaX = event.clientX - this._resizeState.startX;
    const deltaY = event.clientY - this._resizeState.startY;
    let nextLeft = this._resizeState.startLeft;
    let nextTop = this._resizeState.startTop;
    let nextWidth = this._resizeState.startWidth;
    let nextHeight = this._resizeState.startHeight;

    if (this._resizeState.edge === "right") {
      nextWidth = this._resizeState.startWidth + deltaX;
    } else if (this._resizeState.edge === "left") {
      nextWidth = this._resizeState.startWidth - deltaX;
      nextLeft = this._resizeState.startLeft + deltaX;
    } else if (this._resizeState.edge === "bottom") {
      nextHeight = this._resizeState.startHeight + deltaY;
    } else if (this._resizeState.edge === "top") {
      nextHeight = this._resizeState.startHeight - deltaY;
      nextTop = this._resizeState.startTop + deltaY;
    }

    nextWidth = Math.max(minWidth, nextWidth);
    nextHeight = Math.max(minHeight, Math.min(nextHeight, viewportHeight));
    nextLeft = Math.max(8, nextLeft);
    nextTop = Math.max(8, Math.min(nextTop, window.innerHeight - nextHeight - 8));

    if (this._resizeState.edge === "left") {
      nextWidth = Math.max(minWidth, this._resizeState.startWidth + (this._resizeState.startLeft - nextLeft));
    }
    if (this._resizeState.edge === "top") {
      nextHeight = Math.max(minHeight, Math.min(this._resizeState.startHeight + (this._resizeState.startTop - nextTop), viewportHeight));
    }

    rootElement.style.left = `${nextLeft}px`;
    rootElement.style.top = `${nextTop}px`;
    rootElement.style.width = `${nextWidth}px`;
    rootElement.style.height = `${nextHeight}px`;
    rootElement.style.right = "auto";
    rootElement.style.bottom = "auto";
    this._syncResponsiveMetrics(nextWidth, nextHeight, rootElement);
    this._syncPlannerMenuPosition();
  }

  _syncResponsiveMetrics(width, height, rootElement = null) {
    rootElement = rootElement ?? this._getBarElement();
    if (!rootElement) return;
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const barId = rootElement.dataset.stageGoblinBarId || "bar-1";
    const bar = stageGoblinState.bars.find((entry) => entry.id === barId) ?? stageGoblinState.bars[0];
    const itemsElement = rootElement.querySelector(".tom-stage-goblin__items");
    const isVertical = rootElement.classList.contains("tom-stage-goblin--vertical");
    const shellHeight = Math.max(32, height - 4);
    const itemHeight = isVertical
      ? Math.max(18, Math.min(72, Number(bar?.verticalItemHeight) || 38))
      : Math.max(22, height - 12);
    const isCollapsed = Boolean(bar?.collapsed);
    const visibleItemCount = Math.max(
      (!isCollapsed && rootElement.querySelectorAll(".tom-stage-goblin__item").length)
        || (rootElement.querySelector(".tom-stage-goblin__empty") ? 1 : 0),
      1
    );
    const dragHandleWidth = 14;
    const itemsStyles = itemsElement ? window.getComputedStyle(itemsElement) : null;
    const itemsGap = Number.parseFloat(itemsStyles?.columnGap || itemsStyles?.gap || "0") || 0;
    const availableWidth = isCollapsed ? 0 : Math.max(92, (itemsElement?.clientWidth || 0));
    const itemContentWidth = Math.max(84, availableWidth - (Math.max(0, visibleItemCount - 1) * itemsGap));
    const itemWidth = Math.max(84, itemContentWidth / visibleItemCount);
    rootElement.style.setProperty("--tom-stage-goblin-height", `${shellHeight}px`);
    rootElement.style.setProperty("--tom-stage-goblin-item-height", `${itemHeight}px`);
    rootElement.style.setProperty("--tom-stage-goblin-item-width", `${isVertical ? Math.max(84, availableWidth) : itemWidth}px`);
    rootElement.style.setProperty("--tom-stage-goblin-handle-width", `${dragHandleWidth}px`);
    if (isCollapsed) {
      const collapsedWidth = this._getCollapsedWidth(rootElement);
      rootElement.style.width = `${collapsedWidth}px`;
      if (isVertical) {
        const collapsedHeight = this._getCollapsedHeight(rootElement);
        rootElement.style.height = `${collapsedHeight}px`;
      }
    } else {
      const minWidth = isVertical ? 168 : 240;
      const fallbackWidth = isVertical ? 210 : 720;
      const expandedWidth = Math.max(minWidth, Number(width) || Number(rootElement.style.width) || Number(bar?.position?.width) || fallbackWidth);
      rootElement.style.width = `${expandedWidth}px`;
    }
  }

  _getCollapsedHeight(rootElement = null) {
    rootElement = rootElement ?? this._getBarElement();
    const shellElement = rootElement?.querySelector(".tom-stage-goblin__shell");
    const controlsElement = rootElement?.querySelector(".tom-stage-goblin__controls");
    if (!shellElement || !controlsElement) return 40;
    const shellStyles = window.getComputedStyle(shellElement);
    const controlsRect = controlsElement.getBoundingClientRect();
    const paddingTop = Number.parseFloat(shellStyles.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(shellStyles.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(shellStyles.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(shellStyles.borderBottomWidth || "0") || 0;
    return Math.ceil(controlsRect.height + paddingTop + paddingBottom + borderTop + borderBottom);
  }

  _getCollapsedWidth(rootElement = null) {
    rootElement = rootElement ?? this._getBarElement();
    const shellElement = rootElement?.querySelector(".tom-stage-goblin__shell");
    const controlsElement = rootElement?.querySelector(".tom-stage-goblin__controls");
    if (!shellElement) return 120;
    if (controlsElement) {
      const shellStyles = window.getComputedStyle(shellElement);
      const controlsRect = controlsElement.getBoundingClientRect();
      const paddingLeft = Number.parseFloat(shellStyles.paddingLeft || "0") || 0;
      const paddingRight = Number.parseFloat(shellStyles.paddingRight || "0") || 0;
      const borderLeft = Number.parseFloat(shellStyles.borderLeftWidth || "0") || 0;
      const borderRight = Number.parseFloat(shellStyles.borderRightWidth || "0") || 0;
      return Math.ceil(controlsRect.width + paddingLeft + paddingRight + borderLeft + borderRight + 10);
    }
    const computed = window.getComputedStyle(shellElement);
    const gap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
    const paddingLeft = Number.parseFloat(computed.paddingLeft || "0") || 0;
    const paddingRight = Number.parseFloat(computed.paddingRight || "0") || 0;
    const dragWidth = Number.parseFloat(getComputedStyle(rootElement).getPropertyValue("--tom-stage-goblin-handle-width")) || 14;
    const plannerWidth = rootElement.querySelector(".tom-stage-goblin__planner") ? 18 : 0;
    const collapseWidth = rootElement.querySelector(".tom-stage-goblin__collapse-toggle") ? 18 : 0;
    const controlCount = 1 + (plannerWidth ? 1 : 0) + (collapseWidth ? 1 : 0);
    const gaps = Math.max(0, controlCount - 1) * gap;
    return Math.ceil(paddingLeft + paddingRight + dragWidth + plannerWidth + collapseWidth + gaps + 12);
  }

  _onItemsContainerDragOver(event) {
    if (!this._reorderState?.draggedItemId) return;
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = getNativeDragEvent(event);
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
    const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset?.stageGoblinBarId || this._reorderState.barId || "bar-1";
    this._reorderState.targetBarId = barId;
    this._updateReorderPreview(event, barId);
  }

  _onItemsContainerWheel(event) {
    const container = event.currentTarget;
    if (!container) return;

    const isVertical = container.closest(".tom-stage-goblin")?.classList.contains("tom-stage-goblin--vertical");
    if (isVertical) {
      if (container.scrollHeight <= container.clientHeight) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      container.scrollTop += delta;
      return;
    }

    if (container.scrollWidth <= container.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    container.scrollLeft += delta;
  }

  async _onItemDragEnd() {
    clearDraggedAvatarId();
    await this._finalizeItemDragEnd();
  }

  _onItemsContainerDragLeave(event) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    if (!this._reorderState) return;
    this._clearReorderTargetVisualState();
  }

  _updateReorderPreview(event, targetBarId = null) {
    const root = this._getBarElement(targetBarId || this._reorderState?.targetBarId || this._reorderState?.barId);
    if (!root || !this._reorderState) return;
    const isVertical = root.classList.contains("tom-stage-goblin--vertical");
    const pointerCoordinate = isVertical ? event.clientY : event.clientX;

    const itemElements = Array.from(root.querySelectorAll("[data-stage-goblin-item-id]"))
      .filter((element) => element.dataset.stageGoblinItemId !== this._reorderState.draggedItemId);
    const allItemElements = Array.from(root.querySelectorAll("[data-stage-goblin-item-id]"));
    const draggedIndex = allItemElements.findIndex((element) => element.dataset.stageGoblinItemId === this._reorderState.draggedItemId);
    const resolveInsertAfter = (targetElement, proposedInsertAfter) => {
      const targetIndex = allItemElements.findIndex((element) => element.dataset.stageGoblinItemId === targetElement?.dataset?.stageGoblinItemId);
      if (draggedIndex === -1 || targetIndex === -1) return proposedInsertAfter;
      if (draggedIndex < targetIndex) return true;
      if (draggedIndex > targetIndex) return false;
      return proposedInsertAfter;
    };

    this._clearReorderTargetVisualState();

    if (!itemElements.length) {
      this._reorderState.targetItemId = null;
      this._reorderState.insertAfter = false;
      return;
    }

    const firstElement = itemElements[0];
    const lastElement = itemElements[itemElements.length - 1];
    const firstRect = firstElement.getBoundingClientRect();
    const lastRect = lastElement.getBoundingClientRect();
    const firstEdge = isVertical ? firstRect.top : firstRect.left;
    const lastEdge = isVertical ? lastRect.bottom : lastRect.right;
    if (pointerCoordinate <= firstEdge) {
      this._reorderState.targetItemId = firstElement.dataset.stageGoblinItemId;
      this._reorderState.insertAfter = resolveInsertAfter(firstElement, false);
      firstElement.classList.add(this._reorderState.insertAfter ? "is-drop-after" : "is-drop-before");
      return;
    }
    if (pointerCoordinate >= lastEdge) {
      this._reorderState.targetItemId = lastElement.dataset.stageGoblinItemId;
      this._reorderState.insertAfter = resolveInsertAfter(lastElement, true);
      lastElement.classList.add(this._reorderState.insertAfter ? "is-drop-after" : "is-drop-before");
      return;
    }

    let bestMatch = itemElements[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of itemElements) {
      const rect = element.getBoundingClientRect();
      const center = isVertical ? rect.top + (rect.height / 2) : rect.left + (rect.width / 2);
      const distance = Math.abs(pointerCoordinate - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = element;
      }
    }

    const bestRect = bestMatch.getBoundingClientRect();
    const proposedInsertAfter = pointerCoordinate >= (isVertical ? bestRect.top + (bestRect.height / 2) : bestRect.left + (bestRect.width / 2));
    const insertAfter = resolveInsertAfter(bestMatch, proposedInsertAfter);
    this._reorderState.targetItemId = bestMatch.dataset.stageGoblinItemId;
    this._reorderState.insertAfter = insertAfter;
    bestMatch.classList.add(insertAfter ? "is-drop-after" : "is-drop-before");
  }

  async _onItemsContainerDrop(event) {
    if (!this._reorderState?.draggedItemId) return;
    event.preventDefault();
    event.stopPropagation();
    this._reorderState.didDrop = true;
    await this._commitItemReorder();
    this._clearReorderVisualState();
    this._reorderState = null;
  }

  async _finalizeItemDragEnd() {
    if (!this._reorderState) return;
    if (!this._reorderState.didDrop
      && this._reorderState.targetItemId
      && this._reorderState.targetItemId !== this._reorderState.draggedItemId) {
      await this._commitItemReorder();
    }
    this._clearReorderVisualState();
    this._reorderState = null;
  }

  async _commitItemReorder() {
    if (!this._reorderState?.draggedItemId) return;

    const state = TheatreStore.getStageGoblinState();
    const draggedItemId = this._reorderState.draggedItemId;
    const draggedItem = state.items.find((item) => item.id === draggedItemId);
    const targetBarId = this._reorderState.targetBarId || draggedItem?.barId || this._reorderState.barId || "bar-1";
    const targetItemId = this._reorderState.targetItemId;

    if (!draggedItem) return;

    await TheatreStore.reorderStageGoblinItemRelative(
      draggedItemId,
      targetItemId,
      Boolean(this._reorderState.insertAfter),
      targetBarId
    );
    this.render(false);
  }

  _clearReorderTargetVisualState() {
    const root = this._getRootElement();
    if (!root) return;
    root.querySelectorAll(".tom-stage-goblin__item.is-reorder-target, .tom-stage-goblin__item.is-drop-before, .tom-stage-goblin__item.is-drop-after").forEach((element) => {
      element.classList.remove("is-reorder-target", "is-drop-before", "is-drop-after");
    });
  }

  _clearReorderVisualState() {
    const root = this._getRootElement();
    if (!root) return;
    root.querySelectorAll(".tom-stage-goblin__item.is-reordering, .tom-stage-goblin__item.is-reorder-target, .tom-stage-goblin__item.is-drop-before, .tom-stage-goblin__item.is-drop-after").forEach((element) => {
      element.classList.remove("is-reordering", "is-reorder-target", "is-drop-before", "is-drop-after");
    });
    root.querySelectorAll(".tom-stage-goblin.is-reordering-item").forEach((element) => {
      element.classList.remove("is-reordering-item");
    });
  }

  async _onWindowMouseUp() {
    if (this._dragState) {
      await this._finalizeBarPosition();
    } else if (this._resizeState) {
      await this._finalizeBarResize();
    }
    this._teardownPointerInteractions();
  }

  async _finalizeBarPosition() {
    const barId = this._dragState?.barId || "bar-1";
    const appElement = this._getBarElement(barId);
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const bar = stageGoblinState.bars.find((entry) => entry.id === barId) ?? stageGoblinState.bars[0];
    const left = Number.parseFloat(appElement?.style.left || "0") || 0;
    const top = Number.parseFloat(appElement?.style.top || "0") || 0;
    const width = bar?.collapsed
      ? bar.position.width
      : (Number.parseFloat(appElement?.style.width || "0") || bar?.position.width || 720);
    const height = bar?.collapsed
      ? bar.position.height
      : (Number.parseFloat(appElement?.style.height || "0") || bar?.position.height || 64);
    const nextPosition = { barId, left, top, width, height };
    await TheatreStore.saveStageGoblinPosition(nextPosition);
    this._applySavedPosition(nextPosition);
  }

  async _finalizeBarResize() {
    const barId = this._resizeState?.barId || "bar-1";
    const appElement = this._getBarElement(barId);
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const bar = stageGoblinState.bars.find((entry) => entry.id === barId) ?? stageGoblinState.bars[0];
    const left = Number.parseFloat(appElement?.style.left || "0") || 0;
    const top = Number.parseFloat(appElement?.style.top || "0") || 0;
    const width = bar?.collapsed
      ? bar.position.width
      : (Number.parseFloat(appElement?.style.width || "0") || bar?.position.width || 720);
    const height = bar?.collapsed
      ? bar.position.height
      : (Number.parseFloat(appElement?.style.height || "0") || bar?.position.height || 64);
    const nextPosition = { barId, left, top, width, height };
    await TheatreStore.saveStageGoblinPosition(nextPosition);
    this._applySavedPosition(nextPosition);
  }

  _teardownPointerInteractions() {
    this._dragState = null;
    this._resizeState = null;
    this._setResizeCursor(null);
    document.removeEventListener("mousemove", this._onWindowMouseMove);
    document.removeEventListener("mouseup", this._onWindowMouseUp);
  }

  _onDropzoneDragOver(event) {
    event.preventDefault();
    const nativeEvent = getNativeDragEvent(event);
    if (this._reorderState?.draggedItemId) {
      event.stopPropagation();
      const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset?.stageGoblinBarId || this._reorderState.barId || "bar-1";
      this._reorderState.targetBarId = barId;
      this._updateReorderPreview(event, barId);
      if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
      return;
    }
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "copy";
  }

  async _resolveDroppedDocumentPayload(payload) {
    if (payload?.type === "FootlightsStageGoblinDocument") {
      const documentType = String(payload.documentType || "").trim();
      const documentId = String(payload.documentId || "").trim();
      return documentType && documentId ? {
        sourceType: "document",
        documentType,
        documentId,
        documentUuid: String(payload.documentUuid || "").trim(),
        label: String(payload.label || payload.name || "").trim() || tr("Entry")
      } : null;
    }

    if (payload?.type === "TheatreScene") {
      const sceneId = payload.sceneId || payload.id || "";
      const scene = TheatreStore.getSceneById(sceneId);
      return sceneId ? {
        sourceType: "document",
        documentType: "theatreScene",
        documentId: sceneId,
        label: scene?.name || payload.name || tr("Entry")
      } : null;
    }

    if (payload?.type === "TheatreAvatar") {
      const avatarId = payload.avatarId || payload.id || "";
      const avatar = TheatreStore.getAvatarById(avatarId);
      return avatarId ? {
        sourceType: "document",
        documentType: "avatar",
        documentId: avatarId,
        label: avatar?.name || payload.name || tr("Entry")
      } : null;
    }

    if (payload?.type === "WorldMap") {
      const worldMapId = payload.worldMapId || payload.mapId || payload.id || "";
      const worldMap = TheatreStore.getWorldMapById(worldMapId);
      return worldMapId ? {
        sourceType: "document",
        documentType: "worldMap",
        documentId: worldMapId,
        label: worldMap?.name || payload.name || tr("Entry")
      } : null;
    }

    if (payload?.type === "Portal") {
      const portalId = payload.portalId || payload.id || "";
      const portal = TheatreStore.getPortalById(portalId);
      return portalId ? {
        sourceType: "document",
        documentType: "portal",
        documentId: portalId,
        label: portal?.name || payload.name || tr("Entry")
      } : null;
    }

    if (payload?.type === "SoundPlaylist") {
      const playlistId = payload.playlistId || payload.soundPlaylistId || payload.id || "";
      const playlist = TheatreStore.getSoundPlaylistById?.(playlistId);
      return playlistId ? {
        sourceType: "document",
        documentType: "soundPlaylist",
        documentId: playlistId,
        label: playlist?.name || payload.name || tr("Entry")
      } : null;
    }

    const documentType = payload?.type || "";
    const documentUuid = payload?.uuid || "";
    let document = null;

    if (documentUuid) {
      document = await fromUuid?.(documentUuid);
    }

    const resolvedType = document?.documentName || documentType;
    const resolvedId = document?.id || payload?.id || payload?._id || "";

    if (!resolvedType || (!resolvedId && !documentUuid)) return null;

    let label = document?.name || payload?.name || resolvedType;
    if (resolvedType === "Token" || resolvedType === "TokenDocument") {
      label = document?.name || document?.actor?.name || payload?.name || "Token";
    }

    if (!["Scene", "Actor", "Item", "JournalEntry", "JournalEntryPage", "Token", "TokenDocument", "RollTable", "Macro"].includes(resolvedType)) {
      return null;
    }

    return {
      sourceType: "document",
      documentType: resolvedType,
      documentId: resolvedId,
      documentUuid,
      label
    };
  }

  async _onDropzoneDrop(event) {
    event.preventDefault();
    const barId = event.currentTarget?.closest?.(".tom-stage-goblin")?.dataset?.stageGoblinBarId || "bar-1";

    const reorderPayload = readTransferJson(event, "application/x-theatre-stage-goblin-item");
    if (reorderPayload?.itemId) {
      event.stopPropagation();
      this._reorderState = this._reorderState || {
        barId,
        draggedItemId: reorderPayload.itemId,
        targetItemId: null,
        insertAfter: false,
        didDrop: false
      };
      this._reorderState.targetBarId = barId;
      this._reorderState.didDrop = true;
      await this._commitItemReorder();
      this._clearReorderVisualState();
      this._reorderState = null;
      return;
    }

    const payload = readTransferJson(event, "text/plain");
    const nextItem = await this._resolveDroppedDocumentPayload(payload);
    if (!nextItem) return;
    await TheatreStore.addStageGoblinItem({ ...nextItem, barId });
    this.render(false);
  }
}
