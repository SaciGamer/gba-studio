import type { ISceneActor, ISceneTrigger } from './ISceneElement';

export interface IPrefabFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface IPrefabDefinition {
  id: string;
  name: string;
  type: 'actor' | 'trigger';
  folderId?: string | null;
  actor?: Partial<ISceneActor>;
  trigger?: Partial<ISceneTrigger>;
}

export interface IPrefabsSettings {
  id: 'prefabs';
  _resourceType: 'prefabs';
  _version: '1.0';
  _saved: boolean;
  _deleted: boolean;
  folders: IPrefabFolder[];
  prefabs: IPrefabDefinition[];
}

export const PREFAB_ACTORS_FOLDER_ID = 'prefab-folder-actors';
export const PREFAB_TRIGGERS_FOLDER_ID = 'prefab-folder-triggers';

export const normalizePrefabs = (value: Partial<IPrefabsSettings> | null | undefined): IPrefabsSettings => {
  const defaults = createEmptyPrefabs();
  const prefabs = (value?.prefabs ?? []).map(prefab => {
    const actor = prefab.actor ? { ...prefab.actor } : undefined;
    if (actor) delete actor.direction;
    return { ...prefab, ...(actor ? { actor } : {}), folderId: prefab.type === 'actor' ? PREFAB_ACTORS_FOLDER_ID : PREFAB_TRIGGERS_FOLDER_ID };
  });
  return { ...defaults, ...value, folders: defaults.folders, prefabs };
};

export const createEmptyPrefabs = (): IPrefabsSettings => ({
  id: 'prefabs',
  _resourceType: 'prefabs',
  _version: '1.0',
  _saved: true,
  _deleted: false,
  folders: [
    { id: PREFAB_ACTORS_FOLDER_ID, name: 'Actors' },
    { id: PREFAB_TRIGGERS_FOLDER_ID, name: 'Triggers' },
  ],
  prefabs: [],
});
