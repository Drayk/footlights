import { MODULE_ID } from "../constants.js";
import { applyThemeInlineStyleToHost, buildThemeInlineStyle, getNativeDragEvent, readTransferJson, scheduleTheatreDialogTheme, themeStopToCss } from "../helpers.js";
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
    const selectedPlannerId = stageGoblinState.selectedPlannerId
      || TheatreStore.getActiveAdventurePlanner()?.id
      || planners[0]?.id
      || null;
    const plannerOptions = planners.map((planner) => ({
      id: planner.id,
      name: planner.name || tr("Adventure Planner"),
      isSelected: planner.id === selectedPlannerId,
      pinnedCount: stageGoblinState.items.filter((item) => item.sourceType === "plannerNode" && item.plannerId === planner.id).length
    }));
    const items = stageGoblinState.items
      .filter((item) => item.sourceType !== "plannerNode" || !selectedPlannerId || item.plannerId === selectedPlannerId)
      .map((item) => this._getRenderableItem(item, themeState))
      .filter(Boolean);

    return {
      themeInlineStyle: buildThemeInlineStyle(themeState),
      isCollapsed: Boolean(stageGoblinState.collapsed),
      hasPlannerOptions: plannerOptions.length > 0,
      plannerMenuOpen: this._isPlannerMenuOpen && plannerOptions.length > 0,
      plannerOptions,
      hasItems: items.length > 0,
      items
    };
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
    });
  }

  _injectHTML(html) {
    const nextRoot = html[0];
    document.querySelectorAll(".tom-stage-goblin").forEach((element) => {
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
    document.querySelectorAll(".tom-stage-goblin").forEach((rootElement) => {
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
    const resolvedPosition = position ?? TheatreStore.getStageGoblinState().position;
    const appElement = this._getRootElement();
    if (!appElement) return;
    const safeWidth = Math.max(240, Number(resolvedPosition.width) || 720);
    const safeHeight = Math.max(44, Math.min(Number(resolvedPosition.height) || 64, window.innerHeight - 16));
    appElement.style.position = "fixed";
    appElement.style.left = `${Math.max(8, Number(resolvedPosition.left) || 96)}px`;
    appElement.style.top = `${Math.max(8, Number(resolvedPosition.top) || 84)}px`;
    appElement.style.width = `${safeWidth}px`;
    appElement.style.height = `${safeHeight}px`;
    appElement.style.right = "auto";
    appElement.style.bottom = "auto";
    appElement.style.zIndex = "320";
    this._syncResponsiveMetrics(safeWidth, safeHeight);
  }

  _getRootElement() {
    if (this._rootElement?.isConnected) return this._rootElement;
    this._rootElement = document.querySelector(".tom-stage-goblin");
    return this._rootElement;
  }

  _bindRootListeners() {
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const shellElement = rootElement.querySelector(".tom-stage-goblin__shell");

    rootElement.onmousedown = this._onRootMouseDown.bind(this);
    rootElement.onmousemove = this._onRootMouseMove.bind(this);
    rootElement.onmouseleave = this._onRootMouseLeave.bind(this);
    if (shellElement) {
      shellElement.onmousedown = this._onRootMouseDown.bind(this);
      shellElement.onmousemove = this._onRootMouseMove.bind(this);
      shellElement.onmouseleave = this._onRootMouseLeave.bind(this);
    }

    const dragHandle = rootElement.querySelector("[data-action='drag-stage-goblin']");
    if (dragHandle) {
      dragHandle.onmousedown = this._onDragStart.bind(this);
    }

    const plannerMenuToggle = rootElement.querySelector("[data-action='toggle-stage-goblin-planner-menu']");
    if (plannerMenuToggle) {
      plannerMenuToggle.onclick = this._onTogglePlannerMenu.bind(this);
    }

    const collapseToggle = rootElement.querySelector("[data-action='toggle-stage-goblin-collapse']");
    if (collapseToggle) {
      collapseToggle.onclick = this._onToggleCollapsed.bind(this);
    }

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

    const itemsContainer = rootElement.querySelector(".tom-stage-goblin__items");
    if (itemsContainer) {
      itemsContainer.ondragover = this._onItemsContainerDragOver.bind(this);
      itemsContainer.ondrop = this._onItemsContainerDrop.bind(this);
      itemsContainer.ondragleave = this._onItemsContainerDragLeave.bind(this);
    }

    rootElement.querySelectorAll("[data-action='open-stage-goblin-item']").forEach((element) => {
      element.onclick = this._onOpenItem.bind(this);
      element.oncontextmenu = this._onRemoveItem.bind(this);
    });

    const dropzone = rootElement.querySelector("[data-stage-goblin-dropzone='true']");
    if (dropzone) {
      dropzone.ondragover = this._onDropzoneDragOver.bind(this);
      dropzone.ondrop = this._onDropzoneDrop.bind(this);
    }

    document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    document.addEventListener("pointerdown", this._onDocumentPointerDown, true);
  }

  _getRenderableItem(item, themeState) {
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
      accentStyle: this._buildDocumentItemStyle(item.documentType, themeState),
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

  _buildDocumentItemStyle(documentType, themeState) {
    return [
      `--tom-stage-goblin-accent:${this._resolveDocumentAccent(documentType)}`,
      `--tom-stage-goblin-text:${themeStopToCss(themeState?.planner?.heading)}`,
      `--tom-stage-goblin-icon:${themeStopToCss(themeState?.planner?.actionIcon)}`
    ].join(";");
  }

  _canDragItemToCanvas(item, plannerNode = null) {
    if (!item) return false;
    if (item.sourceType === "plannerNode") {
      return ["Actor", "Token", "TokenDocument"].includes(plannerNode?.documentType);
    }

    return item.sourceType === "document" && ["Actor", "Token", "TokenDocument"].includes(item.documentType);
  }

  _buildCanvasDragPayload(itemId) {
    const item = this._getStageGoblinItem(itemId);
    if (!item) return null;

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
    if (node?.documentType === "Actor" || node?.documentType === "Token" || node?.documentType === "TokenDocument") return "rgba(111, 197, 255, 0.42)";
    if (node?.documentType === "Item") return "rgba(242, 199, 120, 0.42)";
    if (node?.documentType === "JournalEntry" || node?.documentType === "JournalEntryPage") return "rgba(178, 152, 255, 0.42)";
    if (node?.documentType === "RollTable") return "rgba(134, 209, 143, 0.42)";
    if (node?.documentType === "Macro") return "rgba(255, 184, 111, 0.42)";
    if (node?.documentType === "Scene") return "rgba(255, 133, 182, 0.42)";
    return "rgba(174, 191, 211, 0.42)";
  }

  _resolveDocumentAccent(documentType) {
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

  async _openDocumentReference(item) {
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
    this._isPlannerMenuOpen = !this._isPlannerMenuOpen;
    this.render(false);
  }

  async _onSelectPlanner(event) {
    event.preventDefault();
    event.stopPropagation();
    const plannerId = String(event.currentTarget?.dataset?.plannerId || "").trim();
    if (!plannerId) return;
    this._isPlannerMenuOpen = false;
    await TheatreStore.saveStageGoblinSelectedPlanner(plannerId);
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
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const menu = rootElement.querySelector(".tom-stage-goblin__planner");
    if (menu?.contains(event.target)) return;
    this._isPlannerMenuOpen = false;
    this.render(false);
  }

  async _onToggleCollapsed(event) {
    event.preventDefault();
    event.stopPropagation();
    const nextCollapsed = !TheatreStore.getStageGoblinState().collapsed;
    this._isPlannerMenuOpen = false;
    await TheatreStore.saveStageGoblinCollapsed(nextCollapsed);
    this.render(false);
  }

  _onDragStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rootElement = this._getRootElement();
    if (!rootElement) return;

    this._dragState = {
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
    const rootElement = this._getRootElement();
    if (!rootElement) return null;
    const rect = rootElement.getBoundingClientRect();
    const threshold = 10;
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
    const shellElement = rootElement?.querySelector(".tom-stage-goblin__shell");
    const cursor =
      edge === "left" || edge === "right" ? "ew-resize" :
      edge === "top" || edge === "bottom" ? "ns-resize" :
      "";

    if (rootElement) rootElement.style.cursor = cursor;
    if (shellElement) shellElement.style.cursor = cursor;
  }

  _onRootMouseMove(event) {
    if (this._dragState || this._resizeState) return;
    const edge = this._detectResizeEdge(event);
    this._setResizeCursor(edge);
  }

  _onRootMouseLeave() {
    if (this._dragState || this._resizeState) return;
    this._setResizeCursor(null);
  }

  _onRootMouseDown(event) {
    if (event.button !== 0) return;
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    if (event.target?.closest?.("[data-action='drag-stage-goblin'], [data-action='toggle-stage-goblin-planner-menu'], [data-action='toggle-stage-goblin-collapse'], .tom-stage-goblin__planner-menu, .tom-stage-goblin__item, .tom-stage-goblin__empty")) {
      return;
    }
    const edge = this._detectResizeEdge(event);

    if (!edge) return;
    this._beginResize(event, edge);
  }

  _beginResize(event, edge) {
    const rootElement = this._getRootElement();
    if (!rootElement || !edge) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = rootElement.getBoundingClientRect();
    this._resizeState = {
      edge,
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

    this._reorderState = {
      draggedItemId: itemElement.dataset.stageGoblinItemId,
      targetItemId: itemElement.dataset.stageGoblinItemId,
      insertAfter: false,
      didDrop: false
    };
    itemElement.classList.add("is-reordering");
    nativeEvent.dataTransfer.effectAllowed = "move";
    nativeEvent.dataTransfer.setData("application/x-theatre-stage-goblin-item", JSON.stringify({
      itemId: this._reorderState.draggedItemId
    }));
    const canvasPayload = this._buildCanvasDragPayload(this._reorderState.draggedItemId);
    if (canvasPayload) {
      nativeEvent.dataTransfer.setData("text/plain", JSON.stringify(canvasPayload));
      nativeEvent.dataTransfer.setData("application/x-theatre-adventure-planner-actor-node", JSON.stringify(canvasPayload));
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
    const rootElement = this._getRootElement();
    if (!rootElement) return;

    const nextLeft = Math.max(8, event.clientX - this._dragState.offsetX);
    const nextTop = Math.max(8, event.clientY - this._dragState.offsetY);
    rootElement.style.left = `${nextLeft}px`;
    rootElement.style.top = `${nextTop}px`;
    rootElement.style.right = "auto";
    rootElement.style.bottom = "auto";
  }

  _updateBarSize(event) {
    const rootElement = this._getRootElement();
    if (!rootElement || !this._resizeState) return;

    const minWidth = 240;
    const minHeight = 44;
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
    this._syncResponsiveMetrics(nextWidth, nextHeight);
  }

  _syncResponsiveMetrics(width, height) {
    const rootElement = this._getRootElement();
    if (!rootElement) return;
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const itemsElement = rootElement.querySelector(".tom-stage-goblin__items");
    const shellHeight = Math.max(32, height - 4);
    const itemHeight = Math.max(22, height - 12);
    const isCollapsed = Boolean(stageGoblinState.collapsed);
    const visibleItemCount = Math.max(
      (!isCollapsed && rootElement.querySelectorAll(".tom-stage-goblin__item").length)
        || (rootElement.querySelector(".tom-stage-goblin__empty") ? 1 : 0),
      1
    );
    const dragHandleWidth = 20;
    const itemsStyles = itemsElement ? window.getComputedStyle(itemsElement) : null;
    const itemsGap = Number.parseFloat(itemsStyles?.columnGap || itemsStyles?.gap || "0") || 0;
    const availableWidth = isCollapsed ? 0 : Math.max(92, (itemsElement?.clientWidth || 0));
    const itemContentWidth = Math.max(84, availableWidth - (Math.max(0, visibleItemCount - 1) * itemsGap));
    const itemWidth = Math.max(84, itemContentWidth / visibleItemCount);
    rootElement.style.setProperty("--tom-stage-goblin-height", `${shellHeight}px`);
    rootElement.style.setProperty("--tom-stage-goblin-item-height", `${itemHeight}px`);
    rootElement.style.setProperty("--tom-stage-goblin-item-width", `${itemWidth}px`);
    rootElement.style.setProperty("--tom-stage-goblin-handle-width", `${dragHandleWidth}px`);
    if (isCollapsed) {
      const collapsedWidth = this._getCollapsedWidth();
      rootElement.style.width = `${collapsedWidth}px`;
    } else {
      const expandedWidth = Math.max(240, Number(width) || Number(rootElement.style.width) || Number(stageGoblinState.position?.width) || 720);
      rootElement.style.width = `${expandedWidth}px`;
    }
  }

  _getCollapsedWidth() {
    const rootElement = this._getRootElement();
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
    const dragWidth = Number.parseFloat(getComputedStyle(rootElement).getPropertyValue("--tom-stage-goblin-handle-width")) || 20;
    const plannerWidth = rootElement.querySelector(".tom-stage-goblin__planner") ? 24 : 0;
    const collapseWidth = rootElement.querySelector(".tom-stage-goblin__collapse-toggle") ? 24 : 0;
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
    this._updateReorderPreview(event.clientX);
  }

  async _onItemDragEnd() {
    await this._finalizeItemDragEnd();
  }

  _onItemsContainerDragLeave(event) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    if (!this._reorderState) return;
    this._clearReorderTargetVisualState();
  }

  _updateReorderPreview(clientX) {
    const root = this._getRootElement();
    if (!root || !this._reorderState) return;

    const itemElements = Array.from(root.querySelectorAll("[data-stage-goblin-item-id]"))
      .filter((element) => element.dataset.stageGoblinItemId !== this._reorderState.draggedItemId);

    this._clearReorderTargetVisualState();

    if (!itemElements.length) {
      this._reorderState.targetItemId = null;
      this._reorderState.insertAfter = false;
      return;
    }

    let bestMatch = itemElements[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of itemElements) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const distance = Math.abs(clientX - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = element;
      }
    }

    const bestRect = bestMatch.getBoundingClientRect();
    const insertAfter = clientX >= (bestRect.left + (bestRect.width / 2));
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
    if (!this._reorderState.didDrop && this._reorderState.targetItemId) {
      await this._commitItemReorder();
    }
    this._clearReorderVisualState();
    this._reorderState = null;
  }

  async _commitItemReorder() {
    if (!this._reorderState?.draggedItemId) return;

    const state = TheatreStore.getStageGoblinState();
    const draggedItemId = this._reorderState.draggedItemId;
    const draggedIndex = state.items.findIndex((item) => item.id === draggedItemId);
    const targetItemId = this._reorderState.targetItemId;
    let targetIndex = state.items.findIndex((item) => item.id === targetItemId);

    if (draggedIndex === -1) return;

    if (targetIndex === -1) {
      await TheatreStore.reorderStageGoblinItemToIndex(draggedItemId, state.items.length);
      this.render(false);
      return;
    }

    if (this._reorderState.insertAfter) targetIndex += 1;
    if (draggedIndex < targetIndex) targetIndex -= 1;
    await TheatreStore.reorderStageGoblinItemToIndex(draggedItemId, targetIndex);
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
    const appElement = this._getRootElement();
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const left = Number.parseFloat(appElement?.style.left || "0") || 0;
    const top = Number.parseFloat(appElement?.style.top || "0") || 0;
    const width = stageGoblinState.collapsed
      ? stageGoblinState.position.width
      : (Number.parseFloat(appElement?.style.width || "0") || stageGoblinState.position.width);
    const height = Number.parseFloat(appElement?.style.height || "0") || stageGoblinState.position.height;
    const nextPosition = { left, top, width, height };
    await TheatreStore.saveStageGoblinPosition(nextPosition);
    this._applySavedPosition(nextPosition);
  }

  async _finalizeBarResize() {
    const appElement = this._getRootElement();
    const stageGoblinState = TheatreStore.getStageGoblinState();
    const left = Number.parseFloat(appElement?.style.left || "0") || 0;
    const top = Number.parseFloat(appElement?.style.top || "0") || 0;
    const width = stageGoblinState.collapsed
      ? stageGoblinState.position.width
      : (Number.parseFloat(appElement?.style.width || "0") || stageGoblinState.position.width);
    const height = Number.parseFloat(appElement?.style.height || "0") || stageGoblinState.position.height;
    const nextPosition = { left, top, width, height };
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
    if (nativeEvent?.dataTransfer) nativeEvent.dataTransfer.dropEffect = "copy";
  }

  async _resolveDroppedDocumentPayload(payload) {
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

    const reorderPayload = readTransferJson(event, "application/x-theatre-stage-goblin-item");
    if (reorderPayload?.itemId) return;

    const payload = readTransferJson(event, "text/plain");
    const nextItem = await this._resolveDroppedDocumentPayload(payload);
    if (!nextItem) return;
    await TheatreStore.addStageGoblinItem(nextItem);
    this.render(false);
  }
}
