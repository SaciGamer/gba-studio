const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ipcRenderer: ipcRenderer,
  // Default ---------------------------------------------
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  send: (channel, data) => ipcRenderer.send(channel, data),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
  // Customized ------------------------------------------
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createProjectPath: (projectPath) => ipcRenderer.invoke('create-project-path', projectPath),
  checkProjectFile: (projectPath) => ipcRenderer.invoke('check-project-file', projectPath),
  loadPreferences: () => ipcRenderer.invoke('loadPreferences'),
  removePreferences: (key, value) => ipcRenderer.invoke('removePreferences', key, value),
  loadLastUsedPath: () => ipcRenderer.invoke('loadLastUsedPath'),
  saveLastUsedPath: (lastPath) => ipcRenderer.invoke('lastUsedPath', lastPath),
  loadLastSplashTab: () => ipcRenderer.invoke('loadLastUsedSplashTab'),
  saveLastSplashTab: (lastSplashTab) => ipcRenderer.invoke('lastUsedSplashTab', lastSplashTab),
  saveLastPositionSplitters: (lastPositionSplitters) => ipcRenderer.invoke('lastPositionSplitters', lastPositionSplitters),
  loadLastPositionSplitters: () => ipcRenderer.invoke('loadLastPositionSplitters'),
});

// contextBridge.exposeInMainWorld('api', {
//   saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
//   loadFile: (filePath) => ipcRenderer.invoke('load-file', filePath),
//   applyTheme: (theme) => ipcRenderer.send('apply-theme', theme),
//   onThemeChange: (callback) => ipcRenderer.on('change-theme', (event, theme) => callback(theme))
// });

// contextBridge.exposeInMainWorld('ipcRenderer', {
//   on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
//   send: (channel, data) => ipcRenderer.send(channel, data),
// });