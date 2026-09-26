const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadCachedImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}

export function clearImageCache() {
  imageCache.clear();
}
