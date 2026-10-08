import { joinLocalAssetPath } from './localAssetUrl';

export interface ProjectAssetFile {
  id: string;
  name: string;
  path: string;
}

const assetCatalogs = new Map<string, Promise<ProjectAssetFile[]>>();

const cacheKey = (folder: string, projectScope: string) => `${projectScope}::${folder}`;

export function loadProjectAssetFiles(folder: string, projectScope: string): Promise<ProjectAssetFile[]> {
  const key = cacheKey(folder, projectScope);
  const cached = assetCatalogs.get(key);
  if (cached) return cached;

  const pending = window.electronAPI.fetchImages(folder).then((response: any) => {
    if (response?.status !== 'success' || !Array.isArray(response.fileImages)) return [];
    return response.fileImages.map((name: string) => ({
      id: name.replace(/\.[^/.]+$/, ''),
      name,
      path: joinLocalAssetPath(response.localPath, name),
    }));
  }).catch((error: unknown) => {
    assetCatalogs.delete(key);
    throw error;
  });
  assetCatalogs.set(key, pending);
  return pending;
}

export function clearProjectAssetFileCache() {
  assetCatalogs.clear();
}

window.addEventListener('gba-studio:assets-reloaded', clearProjectAssetFileCache);
