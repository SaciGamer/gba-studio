import { IpcMainInvokeEvent, ipcMain } from 'electron';
import Store from 'electron-store';
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
}
