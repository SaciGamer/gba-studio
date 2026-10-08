const sceneCanvases = new Map<string, HTMLCanvasElement>();

export function getCachedSceneCanvas(sceneId: string): HTMLCanvasElement | undefined {
  return sceneCanvases.get(sceneId);
}

export function cacheSceneCanvas(sceneId: string, canvas: HTMLCanvasElement) {
  sceneCanvases.set(sceneId, canvas);
}

export function deleteCachedSceneCanvas(sceneId: string) {
  sceneCanvases.delete(sceneId);
}

export function clearSceneCanvasCache() {
  sceneCanvases.clear();
}
