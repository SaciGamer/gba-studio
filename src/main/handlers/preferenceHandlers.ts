import { IpcMainInvokeEvent, ipcMain } from 'electron';
import Store from 'electron-store';
import path from 'path';
import os from 'os';
import { IPreferences, IRecentProject, IStoreData } from '@/interfaces/StoreInterface';

const __store = new Store<IStoreData>();

// Defina um objeto de preferência padrão 
const defaultPreferences: IPreferences = {
  theme: 'systemDefault',
  language: 'pt_BR',
  recentProjects: [],
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
// Carregar configuração de preferências 
export const getPreferences = (): IPreferences => { 
  const responseGetStore = __store.get('preferences', defaultPreferences); 
  console.log('..: PreferencesConfig %s carregado do store!', responseGetStore)
  return responseGetStore; 
} 

// Salvar configuração de preferências 
const savePreferences = (preferenceConfig: IPreferences): void => { 
  __store.set('preferences', preferenceConfig); 
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
      recentProjects.unshift(projectExist);
    } else {
      console.log('..: updatePreferences NO exite: ', value);
      recentProjects.unshift(value);
    }
  } else { 
    // Atualizar outra preferência 
    preferences[key] = value;
  }
       
  savePreferences(preferences); 
  // console.log("..: Atualizou preferencesConfig");
}

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
const saveLastPositionSplitters = (lastPositionSplitters: number[]): void => {
  // console.log('..: saveLastPositionSplitters lastPositionSplitters: %s', lastPositionSplitters);
  __store.set('navigatorSidebarWidth', lastPositionSplitters[0]);
  __store.set('worldSidebarWidth', lastPositionSplitters[1]);
  __store.set('filesSidebarWidth', lastPositionSplitters[2]);
}

const getLastPositionSplitters = () => {
  return [__store.get('navigatorSidebarWidth', 200), __store.get('worldSidebarWidth', 200), __store.get('filesSidebarWidth', 200)];
}
// LAST POSITION SPLITTERS END ---------------------------------------------

// DEVKIT & BUILD PATHS ------------------------------------------------
const getDevkitPath = (): string => {
  const prefs = getPreferences();
  
  // 1. Primeiro tenta usar o valor salvo nas preferências
  if (prefs.devkitPath) {
    return prefs.devkitPath;
  }
  
  // 2. Se não tiver, tenta buscar a variável de ambiente DEVKITPRO
  const devkitEnv = process.env.DEVKITPRO;
  if (devkitEnv) {
    console.log('..: DevKit encontrado em env var DEVKITPRO:', devkitEnv);
    return devkitEnv;
  }
  
  return '';
};

const setDevkitPath = (devkitPath: string): void => {
  console.log('..: Setting devkitPath to', devkitPath);
  updatePreferences('devkitPath', devkitPath);
};

const getEmulatorPath = (): string => {
  const prefs = getPreferences();
  return prefs.emulatorPath || '';
};

const setEmulatorPath = (emulatorPath: string): void => {
  console.log('..: Setting emulatorPath to', emulatorPath);
  updatePreferences('emulatorPath', emulatorPath);
};

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
// DEVKIT & BUILD PATHS END -----------------------------------------------

// BUILD CONFIG -----------------------------------------------------------
export const getBuildConfig = () => {
  return __store.get('buildConfig', { parallel: 0, optimizationLevel: 'O2', verbose: false });
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

  // Se não tem devkitPath mas tem env var, salva
  if (!prefs.devkitPath) {
    const devkitEnv = process.env.DEVKITPRO;
    if (devkitEnv) {
      console.log('..: Inicializando devkitPath de env var:', devkitEnv);
      prefs.devkitPath = devkitEnv;
      shouldUpdate = true;
    }
  }

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
  ipcMain.handle('removePreferences', (_event: IpcMainInvokeEvent, key: keyof IPreferences, value: unknown) => deletePreference(key, value));
  //--
  ipcMain.handle('loadLastUsedPath', () => getLastUsedPath());
  ipcMain.handle('lastUsedPath', (_event: IpcMainInvokeEvent, lastPath: string) => saveLastUsedPath(lastPath));
  //--
  ipcMain.handle('loadLastUsedSplashTab', () => getLastUsedSplashTab());
  ipcMain.handle('lastUsedSplashTab', (_event: IpcMainInvokeEvent, lastSplashTab: string) => saveUsedSplashTab(lastSplashTab));
  //--
  ipcMain.handle('lastPositionSplitters', (_event: IpcMainInvokeEvent, lastPositionSplitters: number[]) => saveLastPositionSplitters(lastPositionSplitters));
  ipcMain.handle('loadLastPositionSplitters', () => getLastPositionSplitters());
  //--
  ipcMain.handle('get-devkit-path', () => getDevkitPath());
  ipcMain.handle('set-devkit-path', (_event: IpcMainInvokeEvent, devkitPath: string) => setDevkitPath(devkitPath));
  ipcMain.handle('get-emulator-path', () => getEmulatorPath());
  ipcMain.handle('set-emulator-path', (_event: IpcMainInvokeEvent, emulatorPath: string) => setEmulatorPath(emulatorPath));
  ipcMain.handle('get-temp-build-path', () => getTempBuildPath());
  ipcMain.handle('set-temp-build-path', (_event: IpcMainInvokeEvent, tempBuildPath: string) => setTempBuildPath(tempBuildPath));
  // Build config handlers
  ipcMain.handle('get-build-config', () => getBuildConfig());
  ipcMain.handle('set-build-config', (_event: IpcMainInvokeEvent, cfg: any) => setBuildConfig(cfg));
}
