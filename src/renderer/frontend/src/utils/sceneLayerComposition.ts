/** Compose each layer completely before placing it above lower layers. */
export function createSceneLayerComposition(width: number, height: number) {
  const layers = new Map<number, HTMLCanvasElement>();
  return {
    context(layerId: number): CanvasRenderingContext2D {
      let canvas = layers.get(layerId);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        layers.set(layerId, canvas);
      }
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create scene layer canvas');
      context.imageSmoothingEnabled = false;
      return context;
    },
    draw(background: CanvasRenderingContext2D, foreground?: CanvasRenderingContext2D | null) {
      for (const [layerId, canvas] of [...layers].sort(([left], [right]) => left - right)) {
        (foreground && layerId >= 2 ? foreground : background).drawImage(canvas, 0, 0);
      }
    },
  };
}
