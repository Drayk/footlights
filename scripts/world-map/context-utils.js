export function createClosedContextMenuState() {
  return {
    isOpen: false,
    x: 0,
    y: 0,
    latlng: null,
    mode: "create",
    targetType: "",
    targetId: ""
  };
}

export function createContextMenuStateFromLeafletEvent(event, leafletMap, {
  mode = "create",
  targetType = "",
  targetId = ""
} = {}) {
  const nativeEvent = event?.originalEvent ?? event;
  const containerPoint = leafletMap?.mouseEventToContainerPoint?.(nativeEvent);
  return {
    isOpen: true,
    x: Math.max(12, Number(containerPoint?.x) || 0),
    y: Math.max(12, Number(containerPoint?.y) || 0),
    latlng: event?.latlng ?? null,
    mode,
    targetType: String(targetType || "").trim(),
    targetId: String(targetId || "").trim()
  };
}

export function getWorldMapContextTarget(worldMap, contextMenuState, labels = {}) {
  if (!worldMap) return null;
  const normalizedType = String(contextMenuState?.targetType || "").trim();
  const normalizedId = String(contextMenuState?.targetId || "").trim();
  if (!normalizedType || !normalizedId) return null;

  const targetCollections = {
    pin: {
      entries: worldMap.pins,
      label: (entry) => entry.label || labels.pin || "Pin"
    },
    objectOverlay: {
      entries: worldMap.objectOverlays,
      label: (entry) => entry.name || labels.objectOverlay || "Object overlay"
    },
    region: {
      entries: worldMap.regions,
      label: (entry) => entry.name || labels.region || "Region"
    },
    line: {
      entries: worldMap.lines,
      label: (entry) => entry.name || labels.line || "Line"
    }
  };

  const definition = targetCollections[normalizedType];
  const entry = definition?.entries?.find?.((item) => item.id === normalizedId);
  return entry ? { type: normalizedType, entry, label: definition.label(entry) } : null;
}
