import { loadPaletteTransparentImage } from './paletteTransparency';
import { loadTilesetAssets } from './tilesetAssets';
import { loadAutoTileAssets, toAutoTileSourceKey } from './autoTileAssets';
import { normalizePalette } from '../components/resourceEditors/paletteLibrary';
import { backgroundSheetGeometry } from '../../../../shared/events/backgroundSheetAnimation';
import { loadCachedImage } from './imageCache';

export async function inspectBackgroundAnimation(image: any, context: any, args: any, affine: boolean, bitmap = false): Promise<number> {
  const path = `${image.hd ? context.settingUtils.localImagePathHD : context.settingUtils.localImagePath}/${image.filename}`;
  const source = image.hd ? await loadCachedImage(path) : await loadPaletteTransparentImage(path);
  if (!source) throw new Error('Image unavailable');
  const geometry = backgroundSheetGeometry(args, { ...image, imageWidth: source.width, imageHeight: source.height });
  if (bitmap) return 0;
  const canvas = document.createElement('canvas');
  // The complete sheet stays resident, so count all of its tiles, not only
  // the selected interval. Reuse normal background padding.
  canvas.width = Math.ceil(geometry.paddedImageWidth / 256) * 256;
  canvas.height = Math.ceil(geometry.paddedImageHeight / 256) * 256;
  if (canvas.width > 16384 || canvas.height > 16384) throw new Error('Regular background dimension limit exceeded');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  const tiles = affineTileSignatures(canvas);
  return new Set(affine ? tiles : tiles.map(key => {
    let horizontal = '', vertical = '', both = '';
    for (let y = 0; y < 8; ++y) for (let x = 0; x < 8; ++x) {
      horizontal += key[y * 8 + 7 - x]; vertical += key[(7 - y) * 8 + x]; both += key[(7 - y) * 8 + 7 - x];
    }
    return [key, horizontal, vertical, both].sort()[0];
  })).size;
}

/** Compare visible 15-bit GBA pixels, without the flip deduplication that only regular maps support. */
export function affineTileSignatures(canvas: HTMLCanvasElement): string[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const tiles: string[] = [];
  for (let y = 0; y < canvas.height; y += 8) for (let x = 0; x < canvas.width; x += 8) {
    let key = '';
    for (let row = 0; row < 8; ++row) for (let col = 0; col < 8; ++col) {
      const offset = ((y + row) * canvas.width + x + col) * 4;
      const color = x + col >= canvas.width || y + row >= canvas.height || !pixels[offset + 3] ? 0
        : 32768 | pixels[offset] >> 3 | (pixels[offset + 1] >> 3) << 5 | (pixels[offset + 2] >> 3) << 10;
      key += String.fromCharCode(color);
    }
    tiles.push(key);
  }
  return tiles;
}

export async function inspectAffineLayer(scene: any, layer: any, background: any, context: any, replacement = false): Promise<number> {
  const { settingUtils, palettes } = context;
  const sources = new Map<string, HTMLCanvasElement>();
  const sourcePaths = new Map<string, string>();
  const imagePath = background ? `${background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${background.filename}` : '';
  const image = background ? await loadPaletteTransparentImage(imagePath) : null;
  if (background && !image) throw new Error('Image unavailable');
  if (image) { sources.set(background.id, image); sourcePaths.set(background.id, imagePath); }
  const custom = !replacement && (layer.tileMap?.some((row: number[]) => row.some(tile => tile >= 0)) || layer.tilePaletteIds?.flat().some((id: string) => id && id !== '__original__'));
  const animations = replacement ? [] : (scene.tileAnimations ?? []).filter((item: any) => item.layerId === layer.layerId);
  const needsSources = custom || animations.some((item: any) => item.targetTilesetId || item.frameTilesetIds?.some(Boolean));
  const ids = new Set<string>([layer.selectedTilesetId, ...(layer.tileMapTilesetIds ?? []).flat(), ...animations.flatMap((item: any) => [item.targetTilesetId, ...(item.frameTilesetIds ?? [])])].filter(Boolean));
  if (needsSources && [...ids].some(id => !sources.has(id))) {
    const scope = settingUtils.projectPathFile ?? settingUtils.localImagePath;
    const [tiles, auto] = await Promise.all([loadTilesetAssets(scope), loadAutoTileAssets(scope)]);
    const assets = new Map([...tiles.map(item => [item.id, item.path] as const), ...auto.map(item => [toAutoTileSourceKey(item.id), item.path] as const)]);
    await Promise.all([...ids].map(async id => {
      if (sources.has(id)) return;
      const path = assets.get(id);
      if (!path) throw new Error('Tileset unavailable');
      const source = await loadPaletteTransparentImage(path);
      if (!source) throw new Error('Tileset unavailable');
      sources.set(id, source);
      sourcePaths.set(id, path);
    }));
  }
  const canvas = document.createElement('canvas');
  canvas.width = custom ? Number(scene.width) || 256 : image?.width || 256;
  canvas.height = custom ? Number(scene.height) || 256 : image?.height || 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  const columns8 = Math.ceil(canvas.width / 8);
  const origins = Array.from({ length: columns8 * Math.ceil(canvas.height / 8) }, (_, index) => ({ id: background?.id, index: image ? Math.floor(index / columns8) % Math.ceil(image.height / 8) * Math.ceil(image.width / 8) + index % columns8 % Math.ceil(image.width / 8) : -1 }));
  if (image) { const pattern = ctx.createPattern(image, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, canvas.width, canvas.height); } }
  if (custom) {
    const grid = scene.gridSize === 16 ? 16 : 8;
    for (let row = 0; row < (layer.tileMap?.length ?? 0); ++row) for (let col = 0; col < layer.tileMap[row].length; ++col) {
      const tile = layer.tileMap[row][col];
      if (tile < 0) continue;
      const id = layer.tileMapTilesetIds?.[row]?.[col] ?? layer.selectedTilesetId;
      let source = sources.get(id);
      if (!source) throw new Error('Tileset unavailable');
      const paletteId = layer.tilePaletteIds?.[row]?.[col];
      if (paletteId && paletteId !== '__original__') {
        const colors = normalizePalette(palettes.find((item: any) => item.id === paletteId) ?? {})?.colors;
        if (colors) source = await loadPaletteTransparentImage(sourcePaths.get(id)!, colors) ?? source;
      }
      const columns = Math.max(1, Math.floor(source.width / grid));
      ctx.clearRect(col * grid, row * grid, grid, grid);
      ctx.drawImage(source, tile % columns * grid, Math.floor(tile / columns) * grid, grid, grid, col * grid, row * grid, grid, grid);
      for (let y = 0; y < grid / 8; ++y) for (let x = 0; x < grid / 8; ++x) {
        origins[(row * grid / 8 + y) * columns8 + col * grid / 8 + x] = { id, index: (Math.floor(tile / columns) * grid / 8 + y) * Math.ceil(source.width / 8) + tile % columns * grid / 8 + x };
      }
    }
    // Colorized cells without paint still come from the original background.
    for (let row = 0; row < (layer.tilePaletteIds?.length ?? 0); ++row) for (let col = 0; col < layer.tilePaletteIds[row].length; ++col) {
      const paletteId = layer.tilePaletteIds[row][col];
      if (!image || !paletteId || paletteId === '__original__' || (layer.tileMap?.[row]?.[col] ?? -1) >= 0) continue;
      const colors = normalizePalette(palettes.find((item: any) => item.id === paletteId) ?? {})?.colors;
      if (!colors) throw new Error('Palette unavailable');
      const colorized = await loadPaletteTransparentImage(imagePath, colors);
      if (!colorized) throw new Error('Background unavailable');
      ctx.clearRect(col * grid, row * grid, grid, grid);
      ctx.drawImage(colorized, col * grid % image.width, row * grid % image.height, grid, grid, col * grid, row * grid, grid, grid);
    }
  }
  const cells = affineTileSignatures(canvas), keys = new Set<string>();
  // Animation destinations cannot be merged into immutable frame/source tiles.
  // Include frames which are absent from the initial background composition.
  const targets = new Set<string>();
  const dedicated = new Set<number>();
  const signatures = new Map<HTMLCanvasElement, string[]>();
  const sourceTiles = (source: HTMLCanvasElement) => {
    let tiles = signatures.get(source);
    if (!tiles) { tiles = affineTileSignatures(source); signatures.set(source, tiles); }
    return tiles;
  };
  for (const animation of animations) {
    const targetId = animation.targetTilesetId ?? layer.selectedTilesetId ?? background?.id;
    const targetSource = sources.get(targetId);
    if (!targetSource) throw new Error('Animation target unavailable');
    const target = sourceTiles(targetSource)[animation.targetTileIndex];
    if (target === undefined) throw new Error('Animation target unavailable');
    const matches = origins.flatMap((origin, index) => origin.id === targetId && origin.index === animation.targetTileIndex ? [index] : []);
    if (!matches.length) throw new Error('Animation target is absent from the layer');
    matches.forEach(index => dedicated.add(index));
    targets.add(`${targetId}:${animation.targetTileIndex}`);
    for (let i = 0; i < animation.frameTileIndices.length; ++i) {
      const frameId = animation.frameTilesetIds?.[i] ?? layer.selectedTilesetId ?? background?.id;
      const frameSource = sources.get(frameId);
      if (!frameSource) throw new Error('Animation frame unavailable');
      const frame = sourceTiles(frameSource)[animation.frameTileIndices[i]];
      if (frame === undefined) throw new Error('Animation frame unavailable');
      keys.add(frame);
    }
  }
  cells.forEach((key, index) => { if (!dedicated.has(index)) keys.add(key); });
  return keys.size + targets.size;
}
