import { offsetMapPoint } from "./geometry-utils.js";

const WORLD_MAP_ELEMENT_OPERATIONS = Object.freeze({
  pin: Object.freeze({
    upsertMethod: "upsertWorldMapPin",
    deleteMethod: "deleteWorldMapPin",
    syncGroup: "pins"
  }),
  objectOverlay: Object.freeze({
    upsertMethod: "upsertWorldMapObjectOverlay",
    deleteMethod: "deleteWorldMapObjectOverlay",
    syncGroup: "objectOverlays"
  }),
  region: Object.freeze({
    upsertMethod: "upsertWorldMapRegion",
    deleteMethod: "deleteWorldMapRegion",
    syncGroup: "regions",
    canDuplicate: false
  }),
  line: Object.freeze({
    upsertMethod: "upsertWorldMapLine",
    deleteMethod: "deleteWorldMapLine",
    syncGroup: "lines"
  })
});

const WORLD_MAP_ELEMENT_COLLECTIONS = Object.freeze({
  pin: "pins",
  objectOverlay: "objectOverlays",
  region: "regions",
  line: "lines"
});

export function getWorldMapElementOperation(type) {
  return WORLD_MAP_ELEMENT_OPERATIONS[String(type || "").trim()] ?? null;
}

export function getWorldMapElementCollection(worldMap, type) {
  const collectionKey = WORLD_MAP_ELEMENT_COLLECTIONS[String(type || "").trim()];
  const collection = collectionKey ? worldMap?.[collectionKey] : null;
  return Array.isArray(collection) ? collection : [];
}

export function findWorldMapElement(worldMap, type, elementId) {
  const normalizedElementId = String(elementId || "").trim();
  if (!normalizedElementId) return null;
  return getWorldMapElementCollection(worldMap, type).find((entry) => entry.id === normalizedElementId) ?? null;
}

export function buildMovedWorldMapElement(worldMap, {
  type,
  elementId,
  x,
  y,
  fallbackEntry = {}
} = {}) {
  const normalizedElementId = String(elementId || "").trim();
  if (!normalizedElementId) return null;
  const existingEntry = findWorldMapElement(worldMap, type, normalizedElementId) ?? fallbackEntry ?? {};
  return {
    ...existingEntry,
    id: normalizedElementId,
    x,
    y
  };
}

export function createDefaultRegionDraft({
  category = "general",
  name = "Region"
} = {}) {
  return {
    name,
    category,
    documentUuid: "",
    documentType: "",
    documentName: "",
    documentPlayerAccess: true,
    description: "",
    zIndex: 0,
    visibleForPlayers: true,
    visible: true,
    fillColor: "#7ebaec",
    strokeColor: "#d7e8ff",
    fillOpacity: 0.28,
    strokeOpacity: 0.95,
    strokeWidth: 2,
    fillStyle: "solid",
    fillPatternScale: 14,
    fillPatternSize: 2,
    strokeStyle: "solid",
    tooltipEnabled: true
  };
}

export function createDefaultLineDraft({
  category = "location",
  name = "Line"
} = {}) {
  return {
    name,
    category,
    documentUuid: "",
    documentType: "",
    documentName: "",
    documentPlayerAccess: true,
    description: "",
    zIndex: 0,
    visibleForPlayers: true,
    visible: true,
    color: "#d7e8ff",
    opacity: 0.95,
    width: 3,
    outlineColor: "#101722",
    outlineWidth: 0,
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowBlur: 6,
    shadowDistance: 0,
    shadowDirection: 135,
    lineStyle: "solid",
    lineCap: "round",
    pointStyle: "none",
    pointSize: 7,
    pointColor: "#d7e8ff",
    pointOpacity: 0.95,
    pointOutlineColor: "#101722",
    pointOutlineWidth: 1,
    movableForPlayers: false,
    tooltipEnabled: true
  };
}

export function createDefaultObjectOverlayDraft(type = "text", {
  category = "general",
  textName = "Text object",
  imageName = "Image object",
  circleName = "Circle",
  rectangleName = "Rectangle"
} = {}) {
  const requestedType = String(type || "text").trim().toLowerCase();
  const normalizedType = ["image", "text", "circle", "rectangle"].includes(requestedType) ? requestedType : "text";
  const linkedDefaults = {
    documentUuid: "",
    documentType: "",
    documentName: "",
    documentPlayerAccess: true,
    description: "",
    zIndex: 0,
    visibleForPlayers: true,
    travelTargetType: "",
    travelTargetId: "",
    travelTargetUuid: "",
    travelTargetName: "",
    travelPlayerAccess: false,
    travelCloseWorldMap: true
  };
  if (normalizedType === "circle" || normalizedType === "rectangle") {
    return {
      type: normalizedType,
      name: normalizedType === "circle" ? circleName : rectangleName,
      category,
      ...linkedDefaults,
      width: 180,
      height: 120,
      radius: 80,
      cornerRadius: normalizedType === "rectangle" ? 0 : 999,
      fillColor: "#7ebaec",
      fillOpacity: 0.28,
      fillStyle: "solid",
      fillPatternScale: 14,
      fillPatternSize: 2,
      strokeColor: "#d7e8ff",
      strokeOpacity: 0.95,
      strokeWidth: 2,
      strokeStyle: "solid",
      opacity: 1,
      scaleWithZoom: true,
      movableForPlayers: false,
      visible: true
    };
  }
  if (normalizedType === "image") {
    return {
      type: normalizedType,
      name: imageName,
      category,
      imagePath: "",
      ...linkedDefaults,
      width: 160,
      opacity: 1,
      scaleWithZoom: true,
      movableForPlayers: false,
      visible: true
    };
  }
  return {
    type: normalizedType,
    name: textName,
    category,
    text: textName,
    ...linkedDefaults,
    fontSize: 24,
    lineHeight: 0.95,
    fontFamily: "",
    color: "#f2f5f8",
    outlineColor: "#101722",
    outlineMode: "outer",
    outlineWidth: 0,
    shadowColor: "#000000",
    shadowDistance: 2,
    shadowOpacity: 0.7,
    shadowBlur: 8,
    opacity: 1,
    scaleWithZoom: true,
    movableForPlayers: false
  };
}

export function buildDuplicatedWorldMapElement(target, worldMap, {
  duplicateData,
  randomId,
  copySuffix = "(Copy)",
  fallbackElementName = "Map element",
  fallbackPinLabel = "Pin",
  offset = 24
} = {}) {
  const operation = getWorldMapElementOperation(target?.type);
  if (!operation || operation.canDuplicate === false || typeof duplicateData !== "function" || typeof randomId !== "function") {
    return null;
  }

  const entry = target?.entry;
  if (!entry) return null;

  const duplicated = duplicateData(entry);
  duplicated.id = randomId();
  duplicated.name = `${entry.name || entry.label || fallbackElementName} ${copySuffix}`;

  if (target.type === "pin") {
    const point = offsetMapPoint(entry, worldMap, offset);
    return {
      type: target.type,
      data: {
        ...duplicated,
        label: `${entry.label || fallbackPinLabel} ${copySuffix}`,
        x: point.x,
        y: point.y
      }
    };
  }

  if (target.type === "objectOverlay") {
    const point = offsetMapPoint(entry, worldMap, offset);
    return {
      type: target.type,
      data: {
        ...duplicated,
        x: point.x,
        y: point.y
      }
    };
  }

  if (target.type === "line") {
    return {
      type: target.type,
      data: {
        ...duplicated,
        points: (entry.points ?? []).map((point) => offsetMapPoint(point, worldMap, offset))
      }
    };
  }

  return null;
}
