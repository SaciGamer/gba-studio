const sceneCanvases = new Map<string, HTMLCanvasElement>();
const sceneRenderParts = new Map<string, { background: HTMLCanvasElement; foreground?: HTMLCanvasElement }>();

export function getCachedSceneRenderParts(sceneId: string) {
  return sceneRenderParts.get(sceneId);
}

export function getCachedSceneCanvas(sceneId: string): HTMLCanvasElement | undefined {
  return sceneCanvases.get(sceneId);
}

export function cacheSceneCanvas(sceneId: string, canvas: HTMLCanvasElement, foreground?: HTMLCanvasElement) {
  sceneRenderParts.set(sceneId, { background: canvas, foreground });
  if (foreground) {
    const complete = document.createElement('canvas');
    complete.width = canvas.width;
    complete.height = canvas.height;
    const context = complete.getContext('2d');
    if (!context) return;
    context.drawImage(canvas, 0, 0);
    context.drawImage(foreground, 0, 0);
    sceneCanvases.set(sceneId, complete);
  } else sceneCanvases.set(sceneId, canvas);
}

export function deleteCachedSceneCanvas(sceneId: string) {
  sceneCanvases.delete(sceneId);
  sceneRenderParts.delete(sceneId);
}

export function clearSceneCanvasCache() {
  sceneCanvases.clear();
  sceneRenderParts.clear();
}
