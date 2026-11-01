export function sceneObjectAxisBounds(sceneSize: number, objectSize: number, centered: boolean) {
  const offset = centered ? objectSize / 2 : 0;
  return { min: offset, max: Math.max(offset, sceneSize - objectSize + offset), offset };
}

/** Snap the selection area's top-left to the grid, preserving its center anchor. */
export function sceneObjectAxisPosition(value: number, sceneSize: number, objectSize: number, centered: boolean, grid: number) {
  const { min, max, offset } = sceneObjectAxisBounds(sceneSize, objectSize, centered);
  const snapped = Math.round(((Number.isFinite(value) ? value : min) - offset) / grid) * grid + offset;
  return Math.max(min, Math.min(max, snapped));
}
