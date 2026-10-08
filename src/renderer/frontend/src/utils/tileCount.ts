/** Count actual distinct GBA-sized tile graphics, not their placements. */
export function addCanvasTiles(canvas: HTMLCanvasElement, keys: Set<string>, tileSize = 8): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return;
  // Read the canvas once. Calling getImageData for every 8x8 tile makes scenes
  // with large tile maps spend most of their load time crossing the canvas API.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for(let y = 0; y < canvas.height; y += tileSize) {
    for(let x = 0; x < canvas.width; x += tileSize) {
      const width = Math.min(tileSize, canvas.width - x);
      const height = Math.min(tileSize, canvas.height - y);
      let signature = `${width}x${height}:`;
      for (let row = 0; row < height; row += 1) {
        const start = ((y + row) * canvas.width + x) * 4;
        signature += String.fromCharCode(...pixels.subarray(start, start + width * 4));
      }
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
    canvas.getContext('2d', { willReadFrequently: true })?.drawImage(image, 0, 0);
    addCanvasTiles(canvas, keys);
  });
  return keys.size;
}
