/** Count actual distinct GBA-sized tile graphics, not their placements. */
export function addCanvasTiles(canvas: HTMLCanvasElement, keys: Set<string>, tileSize = 8): void {
  const context = canvas.getContext('2d');
  if(!context || !canvas.width || !canvas.height) return;
  for(let y = 0; y < canvas.height; y += tileSize) {
    for(let x = 0; x < canvas.width; x += tileSize) {
      const width = Math.min(tileSize, canvas.width - x);
      const height = Math.min(tileSize, canvas.height - y);
      const pixels = context.getImageData(x, y, width, height).data;
      let signature = `${width}x${height}:`;
      for(let index = 0; index < pixels.length; index += 1) signature += String.fromCharCode(pixels[index]);
      keys.add(signature);
    }
  }
}

export async function countDistinctImageTiles(sources: string[]): Promise<number> {
  const images = await Promise.all(sources.filter(Boolean).map(source => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load background: ${source}`));
    image.src = source;
  })));
  const keys = new Set<string>();
  images.forEach(image => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    addCanvasTiles(canvas, keys);
  });
  return keys.size;
}
