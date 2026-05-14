export const FOG_DEFAULTS = Object.freeze({
  mode: "color",
  color: "#07111f",
  opacity: 0.88,
  imageTileSize: 256,
  brushSize: 72,
  feather: 18,
  action: "reveal",
  tool: "brush"
});

export function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeFogMode(value) {
  const mode = String(value || FOG_DEFAULTS.mode).trim().toLowerCase();
  return ["color", "image"].includes(mode) ? mode : FOG_DEFAULTS.mode;
}

export function normalizeFogTool(value) {
  return String(value || FOG_DEFAULTS.tool).trim().toLowerCase() === "polygon" ? "polygon" : "brush";
}

export function normalizeFogAction(value) {
  return String(value || FOG_DEFAULTS.action).trim().toLowerCase() === "restore" ? "restore" : "reveal";
}

export function normalizeFogOpacity(value, fallback = FOG_DEFAULTS.opacity) {
  return clampNumber(value, fallback, 0, 1);
}

export function normalizeFogImageTileSize(value, fallback = FOG_DEFAULTS.imageTileSize) {
  return clampNumber(value, fallback, 16, 2048);
}

export function normalizeWorldMapZoomStep(value, fallback = 0.25) {
  return clampNumber(value, fallback, 0.1, 2);
}

export function normalizeFogBrushSize(value, fallback = FOG_DEFAULTS.brushSize) {
  return clampNumber(value, fallback, 1, 512);
}

export function normalizeFogFeather(value, fallback = 0) {
  return clampNumber(value, fallback, 0, 256);
}

export function positiveModulo(value, divisor) {
  const numericDivisor = Number(divisor);
  if (!Number.isFinite(numericDivisor) || numericDivisor <= 0) return 0;
  return ((value % numericDivisor) + numericDivisor) % numericDivisor;
}

export function calculateFogCanvasMetrics({
  viewportWidth,
  viewportHeight,
  zoomStep = 0.25,
  devicePixelRatio = 1
} = {}) {
  const safeViewportWidth = Math.max(1, Math.ceil(Number(viewportWidth) || 1));
  const safeViewportHeight = Math.max(1, Math.ceil(Number(viewportHeight) || 1));
  const safeZoomStep = normalizeWorldMapZoomStep(zoomStep);
  const zoomReserve = 1.05 + (safeZoomStep * 0.28);
  const padding = Math.max(480, Math.min(1792, Math.ceil(Math.max(safeViewportWidth, safeViewportHeight) * zoomReserve)));
  const width = safeViewportWidth + (padding * 2);
  const height = safeViewportHeight + (padding * 2);
  const pixelArea = width * height;
  const ratioCap = pixelArea > 12000000 ? 1 : (pixelArea > 8000000 ? 1.25 : 1.5);
  const ratio = Math.max(1, Math.min(Number(devicePixelRatio) || 1, ratioCap));
  return {
    padding,
    width,
    height,
    ratio,
    pixelWidth: Math.round(width * ratio),
    pixelHeight: Math.round(height * ratio)
  };
}

export function calculateFogImageTileContainerSize(fogSettings = {}, mapToContainerScale = 1) {
  const configuredSize = normalizeFogImageTileSize(fogSettings?.imageTileSize);
  if (fogSettings?.imageTileFixedOnZoom) return configuredSize;
  const scale = Number.isFinite(Number(mapToContainerScale)) ? Math.max(0.0001, Number(mapToContainerScale)) : 1;
  const scaledSize = configuredSize * scale;
  return Math.max(4, Math.min(8192, scaledSize));
}

export function normalizeFogOperation(operation = {}, createId = () => "") {
  const tool = normalizeFogTool(operation?.tool);
  const action = normalizeFogAction(operation?.action);
  const points = Array.isArray(operation?.points)
    ? operation.points
        .map((point) => ({
          x: Number.isFinite(Number(point?.x)) ? Number(point.x) : null,
          y: Number.isFinite(Number(point?.y)) ? Number(point.y) : null
        }))
        .filter((point) => point.x !== null && point.y !== null)
    : [];
  if (!points.length) return null;
  const id = String(operation?.id || createId()).trim() || createId();
  return {
    id,
    tool,
    action,
    points,
    space: String(operation?.space || "map").trim().toLowerCase() === "screen" ? "screen" : "map",
    radius: clampNumber(operation?.radius, 64, 1, 32768),
    feather: clampNumber(operation?.feather, FOG_DEFAULTS.feather, 0, 32768),
    createdAt: Number.isFinite(Number(operation?.createdAt)) ? Number(operation.createdAt) : Date.now()
  };
}

export function normalizeFogOperations(operations = [], createId = () => "") {
  return (Array.isArray(operations) ? operations : [])
    .map((operation) => normalizeFogOperation(operation, createId))
    .filter(Boolean);
}
