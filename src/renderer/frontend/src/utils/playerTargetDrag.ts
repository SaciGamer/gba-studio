const activeDrags = new Set<symbol>();
export const isPlayerTargetDragging = () => activeDrags.size > 0;
export function setPlayerTargetDragActive(source: symbol, active: boolean) {
  const before = isPlayerTargetDragging();
  if (active) activeDrags.add(source); else activeDrags.delete(source);
  if (before !== isPlayerTargetDragging()) window.dispatchEvent(new CustomEvent('gba-studio:player-target-drag', { detail: { paused: isPlayerTargetDragging() } }));
}

/** Markers and dimmed scene overlays must not block the canvas underneath. */
export function findPlayerTargetCanvas(clientX: number, clientY: number): HTMLCanvasElement | undefined {
  const hit = document.elementsFromPoint(clientX, clientY).find(node => node.matches('canvas[data-scene-id]'));
  if (hit) return hit as HTMLCanvasElement;
  return [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-scene-id]')].reverse().find(canvas => {
    const rect = canvas.getBoundingClientRect();
    const viewport = canvas.closest('[data-testid="game-world-viewport"]')?.getBoundingClientRect();
    if (viewport && (clientX < viewport.left || clientX >= viewport.right || clientY < viewport.top || clientY >= viewport.bottom)) return false;
    return rect.width > 0 && rect.height > 0 && clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
  });
}

export function getPlayerTargetDragPosition(canvas: HTMLCanvasElement, clientX: number, clientY: number, drag: { grabX: number; grabY: number; originX: number; originY: number; stepX: number; stepY: number; width?: number; height?: number }) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * canvas.width - drag.grabX + drag.originX;
  const y = (clientY - rect.top) / rect.height * canvas.height - drag.grabY + drag.originY;
  return {
    x: (Math.max(0, Math.min(Math.round(x / drag.stepX) * drag.stepX - drag.originX, Math.max(0, canvas.width - (drag.width ?? 16)))) + drag.originX) / 16,
    y: (Math.max(0, Math.min(Math.round(y / drag.stepY) * drag.stepY - drag.originY, Math.max(0, canvas.height - (drag.height ?? 16)))) + drag.originY) / 16,
  };
}
