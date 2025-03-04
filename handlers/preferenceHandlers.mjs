import { ipcMain } from 'electron';
import Store from 'electron-store';

const __store = new Store();

// Defina um objeto de preferência padrão 
const defaultPreferences = { 
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
export function getPreferences() { 
  const responseGetStore = __store.get('preferences', defaultPreferences); 
  console.log('..: PreferencesConfig %s carregado do store!', responseGetStore)
  return responseGetStore; 
} 

// Salvar configuração de preferências 
function savePreferences(preferenceConfig) { 
  __store.set('preferences', preferenceConfig); 
}

// Atualizar uma única configuração 
export function updatePreferences(key, value) { 
  console.log("..: Atualizando preferencias: key: %s, value: %s", key, value);
  const preferences = getPreferences();
  let recentProjects = preferences.recentProjects || []; 

  // Adicionar novo projeto à lista de projetos recentes 
  if (key === 'recentProjects') { 
    const projectExistIndex = recentProjects.findIndex(projeto => projeto.path === value.path); 
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

export function deletePreference(key, value) {
  console.log('..: Deletando preference: ', value);
  const preferences = getPreferences(); 

  if (key === 'recentProjects' && Array.isArray(value)) { 
    preferences.recentProjects = value;
    savePreferences(preferences); 
  } else {
    preferences[key] = '';
  }

}
// PRECERENCES CONFIG END ----------------------------------------

// LAST USED PATH -------------------------------------------------
function getLastUsedPath() {
  return __store.get('__lastUsedPath', ''); 
}

function saveLastUsedPath(lastPath) {
  // console.log('..: saveLastUsedPath lastPath: %s', lastPath);
  __store.set('__lastUsedPath', lastPath);
}
// LAST USED PATH END ---------------------------------------------

// LAST USED SPLASH TAB -------------------------------------------------
function getLastUsedSplashTab() {
  return __store.get('__lastUsedSplashTab', ''); 
}

function saveUsedSplashTab(lastSplashTab) {
  // console.log('..: saveUsedSplashTab lastSplashTab: %s', lastSplashTab);
  __store.set('__lastUsedSplashTab', lastSplashTab);
}
// LAST USED SPLASH TAB END ---------------------------------------------

// LAST POSITION SPLITTERS -------------------------------------------------
function saveLastPositionSplitters(lastPositionSplitters) {
  // console.log('..: saveLastPositionSplitters lastPositionSplitters: %s', lastPositionSplitters);
  __store.set('navigatorSidebarWidth', lastPositionSplitters[0]);
  __store.set('worldSidebarWidth', lastPositionSplitters[1]);
  __store.set('filesSidebarWidth', lastPositionSplitters[2]);
}

function getLastPositionSplitters() {
  return [__store.get('navigatorSidebarWidth', 200), __store.get('worldSidebarWidth', 200), __store.get('filesSidebarWidth', 200)];
}
// LAST POSITION SPLITTERS END ---------------------------------------------

export function configurarPreferenceHandlers() {
  ipcMain.handle('loadPreferences', () => getPreferences());
  ipcMain.handle('removePreferences', (event, key, value) => deletePreference(key, value));
  //--
  ipcMain.handle('loadLastUsedPath', () => getLastUsedPath());
  ipcMain.handle('lastUsedPath', (event, lastPath) => saveLastUsedPath(lastPath));
  //--
  ipcMain.handle('loadLastUsedSplashTab', () => getLastUsedSplashTab());
  ipcMain.handle('lastUsedSplashTab', (event, lastSplashTab) => saveUsedSplashTab(lastSplashTab));
  //--
  ipcMain.handle('lastPositionSplitters', (event, lastPositionSplitters) => saveLastPositionSplitters(lastPositionSplitters));
  ipcMain.handle('loadLastPositionSplitters', () => getLastPositionSplitters());
}
