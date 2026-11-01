import { IpcMainInvokeEvent, ipcMain, webContents } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IPreferences, IRecentProject, IStoreData } from '@/interfaces/StoreInterface';
import { getCurrentActiveSandboxDirectory } from '@/states/tempProjectState';

const __store = new Store<IStoreData>();

// Defina um objeto de preferência padrão 
const defaultPreferences: IPreferences = {
  theme: 'systemDefault',
  language: 'systemDefault',
  recentProjects: [],
  tempProjectBackupLimit: 5,
  historyLimit: 50,
  gameWorldPanInertia: true,
  gameWorldMovementMode: 'grid',
  sceneObjectSnapSize: 8,
};

// THEME --------------------------------------------------------
// function salvarTema(theme) { 
//   console.log("..: Thema %s salvo no store!", theme)
//   __store.set('theme', theme);
// }
// // Carregar configuração de tema 
// function carregarTema() { 
//   const responseGetStoreTheme = __store.get('theme', 'systemDefault')
//   console.log("..: Thema %s carregado do store!", responseGetStoreTheme)
//   return responseGetStoreTheme; 
// };
// THEME END--------------------------------------------------------

// PREFERENCES CONFIG --------------------------------------------
let preferencesSnapshot: IPreferences | undefined;
// Carregar configuração de preferências 
export const getPreferences = (): IPreferences => { 
  preferencesSnapshot ??= __store.get('preferences', defaultPreferences);
  return structuredClone(preferencesSnapshot);
} 

// Salvar configuração de preferências 
const savePreferences = (preferenceConfig: IPreferences): void => { 
  __store.set('preferences', preferenceConfig); 
  preferencesSnapshot = structuredClone(preferenceConfig);
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send('preferences-updated');
  }
}

// Atualizar uma única configuração 
export const updatePreferences = (key: keyof IPreferences, value: any): void => {
  console.log("..: Atualizando preferencias: key: %s, value: %s", key, value);
  const preferences = getPreferences();
  
  // Adicionar novo projeto à lista de projetos recentes 
  if (key === 'recentProjects' && 'path' in value) {
    const recentProjects = preferences.recentProjects || []; 
    const projectExistIndex = recentProjects.findIndex((projeto: IRecentProject) => projeto.path === value.path);
    console.log('..: updatePreferences projectExistIndex: ', projectExistIndex);

    if (projectExistIndex !== -1) {
      const [projectExist] = recentProjects.splice(projectExistIndex, 1); 
      console.log('..: updatePreferences exite: ', projectExist);
      recentProjects.unshift({ ...projectExist, ...value });
    } else {
      console.log('..: updatePreferences NO exite: ', value);
      recentProjects.unshift(value);
    }
  } else {
    // Atualizar outra preferência
    const prefs = preferences as unknown as Record<string, unknown>;
    prefs[key as string] = value;
  }
       
  savePreferences(preferences); 
  // console.log("..: Atualizou preferencesConfig");
}

export const setGameWorldPreferences = (values: { panInertia: boolean; movementMode: 'free' | 'grid'; sceneObjectSnapSize?: 8 | 16; recenterEnabled?: boolean; recenterScenes?: boolean; recenterActors?: boolean; recenterTriggers?: boolean }) => {
  const preferences = getPreferences();
  preferences.gameWorldPanInertia = Boolean(values.panInertia);
  preferences.gameWorldMovementMode = values.movementMode === 'free' ? 'free' : 'grid';
  preferences.sceneObjectSnapSize = values.sceneObjectSnapSize === 16 ? 16 : 8;
  preferences.gameWorldRecenterEnabled = values.recenterEnabled ?? preferences.gameWorldRecenterEnabled ?? true;
  preferences.gameWorldRecenterScenes = values.recenterScenes ?? preferences.gameWorldRecenterScenes ?? true;
  preferences.gameWorldRecenterActors = values.recenterActors ?? preferences.gameWorldRecenterActors ?? true;
  preferences.gameWorldRecenterTriggers = values.recenterTriggers ?? preferences.gameWorldRecenterTriggers ?? true;
  savePreferences(preferences);
  return {
    gameWorldPanInertia: preferences.gameWorldPanInertia,
    gameWorldMovementMode: preferences.gameWorldMovementMode,
    sceneObjectSnapSize: preferences.sceneObjectSnapSize,
    gameWorldRecenterEnabled: preferences.gameWorldRecenterEnabled,
    gameWorldRecenterScenes: preferences.gameWorldRecenterScenes,
    gameWorldRecenterActors: preferences.gameWorldRecenterActors,
    gameWorldRecenterTriggers: preferences.gameWorldRecenterTriggers,
  };
};

export const deletePreference = (key: keyof IPreferences, value: any): void => {
  console.log('..: Deletando preference: ', value);
  const preferences = getPreferences(); 

  if (key === 'recentProjects' && Array.isArray(value)) { 
    preferences.recentProjects = value;
    savePreferences(preferences); 
  } else {
    //preferences.recentProjects[key] = '';
    // TODO
    console.log('..: Validar remoção de recentProjects');
  }

}
// PRECERENCES CONFIG END ----------------------------------------

// LAST USED PATH -------------------------------------------------
const getLastUsedPath = () => {
  return __store.get('__lastUsedPath', ''); 
}

const saveLastUsedPath = (lastPath: string): void => {
  // console.log('..: saveLastUsedPath lastPath: %s', lastPath);
  __store.set('__lastUsedPath', lastPath);
}
// LAST USED PATH END ---------------------------------------------

// LAST USED SPLASH TAB -------------------------------------------------
const getLastUsedSplashTab = (): string => {
  return __store.get('__lastUsedSplashTab', ''); 
}

const saveUsedSplashTab = (lastSplashTab: string): void => {
  // console.log('..: saveUsedSplashTab lastSplashTab: %s', lastSplashTab);
  __store.set('__lastUsedSplashTab', lastSplashTab);
}
// LAST USED SPLASH TAB END ---------------------------------------------

// LAST POSITION SPLITTERS -------------------------------------------------
const saveLastPositionSplitters = (lastPositionSplitters: number[] | Record<string, any>): void => {
  if (Array.isArray(lastPositionSplitters)) {
    __store.set('navigatorSidebarWidth', lastPositionSplitters[0]);
    __store.set('worldSidebarWidth', lastPositionSplitters[1]);
    __store.set('filesSidebarWidth', lastPositionSplitters[2]);
    return;
  }
  if (typeof lastPositionSplitters.projectId === 'string' && lastPositionSplitters.leftNavigation) {
    __store.set(`splitter:leftNavigation:${lastPositionSplitters.projectId}`, lastPositionSplitters.leftNavigation);
  }
  if (typeof lastPositionSplitters.projectId === 'string' && lastPositionSplitters.spriteNavigation) {
    __store.set(`splitter:spriteNavigation:${lastPositionSplitters.projectId}`, lastPositionSplitters.spriteNavigation);
  }
  if (typeof lastPositionSplitters.projectId === 'string' && lastPositionSplitters.musicNavigation) {
    __store.set(`splitter:musicNavigation:${lastPositionSplitters.projectId}`, lastPositionSplitters.musicNavigation);
  }
  Object.entries(lastPositionSplitters).forEach(([key, sizes]) => {
    if (key !== 'projectId' && key !== 'leftNavigation' && key !== 'musicNavigation' && Array.isArray(sizes) && sizes.every(size => Number.isFinite(size))) {
      __store.set(`splitter:${key}`, sizes);
    }
  });
}

const getLastPositionSplitters = (projectId?: string) => {
  return {
    main: [__store.get('navigatorSidebarWidth', 200), __store.get('worldSidebarWidth', 200), __store.get('filesSidebarWidth', 200)],
    leftNavigation: projectId
      ? __store.get(`splitter:leftNavigation:${projectId}`, null)
      : __store.get('splitter:leftNavigation', null),
    spriteNavigation: projectId ? __store.get(`splitter:spriteNavigation:${projectId}`, null) : null,
    musicNavigation: projectId ? __store.get(`splitter:musicNavigation:${projectId}`, null) : null,
    centerWorkspace: __store.get('splitter:centerWorkspace', null),
  };
}
// LAST POSITION SPLITTERS END ---------------------------------------------

// TEMP BUILD PATH ---------------------------------------------------------
const getTempBuildPath = (): string => {
  const prefs = getPreferences();
  
  // 1. Primeiro tenta usar o valor salvo nas preferências
  if (prefs.tempBuildPath) {
    return prefs.tempBuildPath;
  }
  
  // 2. Se não tiver, usa um padrão no AppData local (Windows)
  // ou no temp dir (outros SOs)
  const tempDefault = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'gba-studio-temp', 'gba-studio-build');
  console.log('..: Using default tempBuildPath:', tempDefault);
  return tempDefault;
};

const setTempBuildPath = (tempBuildPath: string): void => {
  console.log('..: Setting tempBuildPath to', tempBuildPath);
  updatePreferences('tempBuildPath', tempBuildPath);
};

const getTempProjectBackupLimit = (): number => {
  const prefs = getPreferences();
  const limit = Number(prefs.tempProjectBackupLimit ?? 5);
  return Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 5;
};

const setTempProjectBackupLimit = (tempProjectBackupLimit: number): void => {
  const safeLimit = Math.max(0, Math.floor(Number(tempProjectBackupLimit) || 0));
  console.log('..: Setting tempProjectBackupLimit to', safeLimit);
  updatePreferences('tempProjectBackupLimit', safeLimit);
};

const getHistoryLimit = (): number => {
  const limit = Number(getPreferences().historyLimit ?? 50);
  return Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50;
};

const setHistoryLimit = (historyLimit: number): void => {
  updatePreferences('historyLimit', Math.max(1, Math.min(500, Math.floor(Number(historyLimit) || 50))));
};

const clearTempProjectData = (): void => {
  const tempRoot = path.join(os.tmpdir(), 'gba-studio-temp');
  if (!fs.existsSync(tempRoot)) {
    fs.mkdirSync(tempRoot, { recursive: true });
    return;
  }

  const activeSandbox = getCurrentActiveSandboxDirectory();
  const projectRoot = path.join(tempRoot, 'projects');

  if (fs.existsSync(projectRoot)) {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(projectRoot, entry.name));

    entries.forEach((entryPath) => {
      const normalizedEntry = path.resolve(entryPath);
      const normalizedActive = activeSandbox ? path.resolve(activeSandbox) : null;

      if (normalizedActive && normalizedEntry === normalizedActive) {
        return;
      }

      fs.rmSync(normalizedEntry, { recursive: true, force: true });
    });
  }

  if (fs.existsSync(tempRoot)) {
    const buildRoot = path.join(tempRoot, 'gba-studio-build');
    if (fs.existsSync(buildRoot)) {
      fs.rmSync(buildRoot, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  return;
};
// TEMP BUILD PATH END -----------------------------------------------------

// BUILD CONFIG -----------------------------------------------------------
export const getBuildConfig = () => {
  return __store.get('buildConfig', { parallel: 1, optimizationLevel: 'O2', verbose: false });
};

export const setBuildConfig = (cfg: any): void => {
  console.log('..: Setting buildConfig to', cfg);
  __store.set('buildConfig', cfg);
};
// BUILD CONFIG END -------------------------------------------------------

// Initialize default paths on app start
export const initializeDefaultPaths = (): void => {
  const prefs = getPreferences();
  let shouldUpdate = false;

  // Se não tem tempBuildPath, seta o padrão
  if (!prefs.tempBuildPath) {
    const tempDefault = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'gba-studio-temp','gba-studio-build');
    console.log('..: Inicializando tempBuildPath padrão:', tempDefault);
    prefs.tempBuildPath = tempDefault;
    shouldUpdate = true;
  }

  // Salva se houve mudanças
  if (shouldUpdate) {
    savePreferences(prefs);
  }
};

export const configurarPreferenceHandlers = () => {
  ipcMain.handle('loadPreferences', () => getPreferences());
  ipcMain.handle('set-game-world-preferences', (_event: IpcMainInvokeEvent, values: { panInertia: boolean; movementMode: 'free' | 'grid'; sceneObjectSnapSize?: 8 | 16; recenterEnabled?: boolean; recenterScenes?: boolean; recenterActors?: boolean; recenterTriggers?: boolean }) => setGameWorldPreferences(values));
  ipcMain.handle('removePreferences', (_event: IpcMainInvokeEvent, key: keyof IPreferences, value: unknown) => deletePreference(key, value));
  //--
  ipcMain.handle('loadLastUsedPath', () => getLastUsedPath());
  ipcMain.handle('lastUsedPath', (_event: IpcMainInvokeEvent, lastPath: string) => saveLastUsedPath(lastPath));
  //--
  ipcMain.handle('loadLastUsedSplashTab', () => getLastUsedSplashTab());
  ipcMain.handle('lastUsedSplashTab', (_event: IpcMainInvokeEvent, lastSplashTab: string) => saveUsedSplashTab(lastSplashTab));
  //--
  ipcMain.handle('lastPositionSplitters', (_event: IpcMainInvokeEvent, lastPositionSplitters: number[] | Record<string, any>) => saveLastPositionSplitters(lastPositionSplitters));
  ipcMain.handle('loadLastPositionSplitters', (_event: IpcMainInvokeEvent, projectId?: string) => getLastPositionSplitters(projectId));
  //--
  ipcMain.handle('get-temp-build-path', () => getTempBuildPath());
  ipcMain.handle('set-temp-build-path', (_event: IpcMainInvokeEvent, tempBuildPath: string) => setTempBuildPath(tempBuildPath));
  ipcMain.handle('get-temp-project-backup-limit', () => getTempProjectBackupLimit());
  ipcMain.handle('set-temp-project-backup-limit', (_event: IpcMainInvokeEvent, tempProjectBackupLimit: number) => setTempProjectBackupLimit(tempProjectBackupLimit));
  ipcMain.handle('get-history-limit', () => getHistoryLimit());
  ipcMain.handle('set-history-limit', (_event: IpcMainInvokeEvent, historyLimit: number) => setHistoryLimit(historyLimit));
  ipcMain.handle('clear-temp-project-data', () => clearTempProjectData());
  // Build config handlers
  ipcMain.handle('get-build-config', () => getBuildConfig());
  ipcMain.handle('set-build-config', (_event: IpcMainInvokeEvent, cfg: any) => setBuildConfig(cfg));
  ipcMain.handle('get-cpu-count', () => Math.max(1, os.cpus().length));
}
