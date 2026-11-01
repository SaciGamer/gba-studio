export const ZOOM_STEPS = [25, 50, 100, 200, 400, 800, 1600] as const;

export const getNextZoomStep = (currentZoom: number | undefined, change: number): number => {
  const current = currentZoom ?? 100;
  const closestIndex = ZOOM_STEPS.reduce((bestIndex, step, index) =>
    Math.abs(step - current) < Math.abs(ZOOM_STEPS[bestIndex] - current) ? index : bestIndex,
  0);

  if(change > 0)
  {
    return ZOOM_STEPS[Math.min(closestIndex + 1, ZOOM_STEPS.length - 1)];
  }

  if(change < 0)
  {
    return ZOOM_STEPS[Math.max(closestIndex - 1, 0)];
  }

  return ZOOM_STEPS[closestIndex];
};
