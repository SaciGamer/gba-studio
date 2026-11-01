/** World coordinates shared by the arrival marker and its connecting trace. */
export function getChangeSceneMarkerPosition(
  scene: { x: number; y: number; width: number; height: number },
  preview: { x: number; y: number },
  sprite?: { playerFrameWidth?: number; playerFrameHeight?: number; playerCanvasOriginX?: number; playerCanvasOriginY?: number },
) {
  const left = scene.x + Math.max(0, Math.min(scene.width - (sprite?.playerFrameWidth ?? 16), preview.x * 16 - Number(sprite?.playerCanvasOriginX ?? 0)));
  const top = scene.y + Math.max(0, Math.min(scene.height - (sprite?.playerFrameHeight ?? 16), preview.y * 16 - Number(sprite?.playerCanvasOriginY ?? 8)));
  return { left, top, centerX: left + 8, centerY: top + 8 };
}
