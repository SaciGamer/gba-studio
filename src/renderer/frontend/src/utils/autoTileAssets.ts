import { loadProjectAssetFiles, type ProjectAssetFile } from './projectAssetCache';

export type AutoTileAsset = ProjectAssetFile;

export const AUTO_TILE_SOURCE_PREFIX = 'auto-tile:';
/** Persist the scene autotile picker size even without a regular tileset selected. */
export const AUTO_TILE_VIEW_KEY = '__autotile_picker__';

export function toAutoTileSourceKey(id: string): string {
  return `${AUTO_TILE_SOURCE_PREFIX}${id}`;
}

export function getAutoTileIdFromSourceKey(id: string): string | null {
  return id.startsWith(AUTO_TILE_SOURCE_PREFIX) ? id.slice(AUTO_TILE_SOURCE_PREFIX.length) : null;
}

export function loadAutoTileAssets(cacheScope: string): Promise<AutoTileAsset[]> {
  return loadProjectAssetFiles('auto-tiles', cacheScope);
}
