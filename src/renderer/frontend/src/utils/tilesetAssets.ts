import { loadProjectAssetFiles, type ProjectAssetFile } from './projectAssetCache';

export type TilesetAsset = ProjectAssetFile;

export function loadTilesetAssets(cacheScope: string): Promise<TilesetAsset[]> {
  return loadProjectAssetFiles('tilesets', cacheScope);
}
