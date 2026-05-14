export function clampMapPoint(point = {}, worldMap = {}) {
  return {
    x: Math.max(0, Math.min(Number(worldMap?.width) || 0, Number(point?.x) || 0)),
    y: Math.max(0, Math.min(Number(worldMap?.height) || 0, Number(point?.y) || 0))
  };
}

export function offsetMapPoint(point = {}, worldMap = {}, offset = 24) {
  return clampMapPoint({
    x: (Number(point?.x) || 0) + offset,
    y: (Number(point?.y) || 0) + offset
  }, worldMap);
}

export function getClosestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return { x: start.x, y: start.y };
  const t = Math.max(0, Math.min(1, (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / ((dx * dx) + (dy * dy))));
  return {
    x: start.x + (dx * t),
    y: start.y + (dy * t)
  };
}
