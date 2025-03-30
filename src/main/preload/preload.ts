const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
  // Default ---------------------------------------------
  on: (channel: any, listener: any) => ipcRenderer.on(channel, listener),
  send: (channel: any, data: any) => ipcRenderer.send(channel, data),
  removeListener: (channel: any, listener: any) => ipcRenderer.removeListener(channel, listener),
  // Customized ------------------------------------------
  pathJoin: (...args: any) => ipcRenderer.invoke('path-join', args),
  openBrowser: (url: string) => ipcRenderer.invoke('abrir-navegador', url),
  getVersionsAPI: () => ipcRenderer.invoke('get-versions'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createProjectPath: (projectPath: any) => ipcRenderer.invoke('create-project-path', projectPath),
  checkProjectFile: (projectPath: any) => ipcRenderer.invoke('check-project-file', projectPath),
  loadPreferences: () => ipcRenderer.invoke('loadPreferences'),
  removePreferences: (key: any, value: any) => ipcRenderer.invoke('removePreferences', key, value),
  loadLastUsedPath: () => ipcRenderer.invoke('loadLastUsedPath'),
  saveLastUsedPath: (lastPath: any) => ipcRenderer.invoke('lastUsedPath', lastPath),
  loadLastSplashTab: () => ipcRenderer.invoke('loadLastUsedSplashTab'),
  saveLastSplashTab: (lastSplashTab: any) => ipcRenderer.invoke('lastUsedSplashTab', lastSplashTab),
  saveLastPositionSplitters: (lastPositionSplitters: any) => ipcRenderer.invoke('lastPositionSplitters', lastPositionSplitters),
  loadLastPositionSplitters: () => ipcRenderer.invoke('loadLastPositionSplitters'),
  // Settings --------------------------------------------
  getSettingsByType: (type: string) => ipcRenderer.invoke('getSettings', type),
  updateSettings: (typeToSave:string, settings: any) => ipcRenderer.invoke('updateSettings', typeToSave, settings),
  // Images --------------------------------------------
  saveImage: (filePath: string, fileName: string, data: any) => ipcRenderer.invoke('save-image', { filePath, fileName, data }),
  fetchImages: (folderName: string) => ipcRenderer.invoke('fetch-images', folderName),
  onUpdateImages: (callback: any) => ipcRenderer.on('update-images', (event: any, localPath: string, images: string) => callback({ localPath, images })),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// // contextBridge.exposeInMainWorld('api', {
// //   saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
// //   loadFile: (filePath) => ipcRenderer.invoke('load-file', filePath),
// //   applyTheme: (theme) => ipcRenderer.send('apply-theme', theme),
// //   onThemeChange: (callback) => ipcRenderer.on('change-theme', (event, theme) => callback(theme))
// // });

// // contextBridge.exposeInMainWorld('ipcRenderer', {
// //   on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
// //   send: (channel, data) => ipcRenderer.send(channel, data),
// // });
// // --------------------------------------------------------------------------------------------------------------------------------