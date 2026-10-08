import { loadCachedImage } from './imageCache';
import { joinLocalAssetPath } from './localAssetUrl';
import { loadPaletteTransparentImage } from './paletteTransparency';
import { normalizePalette } from '../components/resourceEditors/paletteLibrary';
import { getAutoTileIdFromSourceKey, toAutoTileSourceKey } from './autoTileAssets';

export function preloadSceneVisualAssets({ scenes, backgrounds, normalCatalog, hdCatalog, tilesets, autoTiles, sprites, palettes }: any): Promise<PromiseSettledResult<unknown>[]> {
  const normalFiles = new Set<string>(normalCatalog?.fileImages ?? []);
  const hdFiles = new Set<string>(hdCatalog?.fileImages ?? []);
  const backgroundsById = new Map((backgrounds ?? []).map((item: any) => [item.id, item]));
  const tilesetsById = new Map((tilesets ?? []).map((item: any) => [item.id, item]));
  const autoTilesById = new Map((autoTiles ?? []).map((item: any) => [item.id, item]));
  const spritesById = new Map((sprites ?? []).map((item: any) => [item.id, item]));
  const jobs: Promise<unknown>[] = [];

  (scenes ?? []).forEach((scene: any) => {
    const sceneTileIds = new Set<string>();
    const scenePaletteIds = new Set<string>();
    (scene.backgrounds ?? []).forEach((layer: any) => {
      const background: any = backgroundsById.get(layer.backgroundId);
      if (background?.filename) {
        const hd = Boolean(background.hd);
        const catalog = hd ? hdCatalog : normalCatalog;
        const files = hd ? hdFiles : normalFiles;
        if (files.has(background.filename) && catalog?.localPath) {
          const source = joinLocalAssetPath(catalog.localPath, background.filename);
          const palette = normalizePalette((palettes ?? []).find((item: any) => item.id === layer.paletteId) ?? {})?.colors;
          jobs.push(loadPaletteTransparentImage(source), loadCachedImage(source));
          if (palette) jobs.push(loadPaletteTransparentImage(source, palette));
          (layer.tilePaletteIds ?? []).flat().forEach((id: string | null) => {
            if (id && id !== '__original__') scenePaletteIds.add(id);
          });
          scenePaletteIds.forEach(id => {
            const colors = normalizePalette((palettes ?? []).find((item: any) => item.id === id) ?? {})?.colors;
            if (colors) jobs.push(loadPaletteTransparentImage(source, colors));
          });
        }
      }
      layer.tileMap?.forEach((row: number[], rowIndex: number) => row.forEach((tile, colIndex) => {
        if (tile < 0) return;
        const id = layer.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? layer.selectedTilesetId ?? scene.selectedTilesetId;
        if (id) sceneTileIds.add(id);
      }));
      if (layer.selectedTilesetId) sceneTileIds.add(layer.selectedTilesetId);
      (layer.tilePaletteIds ?? []).flat().forEach((id: string | null) => {
        if (id && id !== '__original__') scenePaletteIds.add(id);
      });
    });
    scene.autoTileSlots?.forEach((slot: any) => { if (slot.autoTileId) sceneTileIds.add(toAutoTileSourceKey(slot.autoTileId)); });
    if (scene.selectedTilesetId) sceneTileIds.add(scene.selectedTilesetId);
    sceneTileIds.forEach(id => {
      const autoTileId = getAutoTileIdFromSourceKey(id);
      const sourceAsset: any = autoTileId ? autoTilesById.get(autoTileId) : tilesetsById.get(id);
      if (!sourceAsset) return;
      jobs.push(loadCachedImage(sourceAsset.path), loadPaletteTransparentImage(sourceAsset.path));
      scenePaletteIds.forEach(paletteId => {
        const colors = normalizePalette((palettes ?? []).find((item: any) => item.id === paletteId) ?? {})?.colors;
        if (colors) jobs.push(loadPaletteTransparentImage(sourceAsset.path, colors));
      });
    });
    (scene.actors ?? []).forEach((actor: any) => {
      const sprite: any = spritesById.get(actor.spriteId ?? actor.actorId);
      if (sprite) jobs.push(loadCachedImage(sprite.path), loadPaletteTransparentImage(sprite.path));
    });
  });
  return Promise.allSettled(jobs);
}
