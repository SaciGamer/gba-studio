/** Fit each HUD inside the center viewport, reserving the bottom resource cards. */
export function getWorldHudLayout(width: number, height: number, selectedScene: boolean) {
  const stacked = width < 390;
  const usageVisible = width >= 220 && height >= (stacked && selectedScene ? 148 : 86);
  const usageWidth = selectedScene && !stacked ? 346 : 168;
  const infoWidth = Math.max(0, width - 24 - (usageVisible ? usageWidth + 12 : 0));
  const minimapBottom = usageVisible ? (stacked && selectedScene ? 128 : 62) : 0;
  const minimapWidth = Math.min(192, Math.max(0, width - 98));
  const minimapHeight = Math.min(94, Math.max(0, height - 24 - minimapBottom - 52));
  return {
    usageVisible,
    infoVisible: infoWidth >= 120 && height >= 48,
    infoWidth,
    minimapVisible: minimapWidth >= 128 && minimapHeight >= 48,
    minimapWidth,
    minimapHeight,
    minimapBottom,
  };
}
