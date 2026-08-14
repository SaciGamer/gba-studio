const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
  // Default ---------------------------------------------
  on: (channel: any, listener: any) => ipcRenderer.on(channel, listener),
  send: (channel: any, data: any) => ipcRenderer.send(channel, data),
  removeListener: (channel: any, listener: any) => ipcRenderer.removeListener(channel, listener),
  // Customized ------------------------------------------
  pathJoin: (...args: any) => ipcRenderer.invoke('path-join', args),
  // Temp folder --------------------------------------------
  getTempBuildPath: () => ipcRenderer.invoke('get-temp-build-path'),
  setTempBuildPath: (p: string) => ipcRenderer.invoke('set-temp-build-path', p),
  getTempProjectBackupLimit: () => ipcRenderer.invoke('get-temp-project-backup-limit'),
  setTempProjectBackupLimit: (limit: number) => ipcRenderer.invoke('set-temp-project-backup-limit', limit),
  clearTempProjectData: () => ipcRenderer.invoke('clear-temp-project-data'),
  // -------------------------------------------------------
  importTools: (toolsName: string, srcPath: string) => ipcRenderer.invoke('import-tools', toolsName, srcPath),
  openBrowser: (url: string) => ipcRenderer.invoke('abrir-navegador', url),
  getVersionsAPI: () => ipcRenderer.invoke('get-versions'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createProjectPath: (projectPath: any, template?: string) => ipcRenderer.invoke('create-project-path', projectPath, template),
  checkProjectFile: (projectPath: any) => ipcRenderer.invoke('check-project-file', projectPath),
  loadPreferences: () => ipcRenderer.invoke('loadPreferences'),
  removePreferences: (key: any, value: any) => ipcRenderer.invoke('removePreferences', key, value),
  loadLastUsedPath: () => ipcRenderer.invoke('loadLastUsedPath'),
  saveLastUsedPath: (lastPath: any) => ipcRenderer.invoke('lastUsedPath', lastPath),
  loadLastSplashTab: () => ipcRenderer.invoke('loadLastUsedSplashTab'),
  saveLastSplashTab: (lastSplashTab: any) => ipcRenderer.invoke('lastUsedSplashTab', lastSplashTab),
  saveLastPositionSplitters: (lastPositionSplitters: any) => ipcRenderer.invoke('lastPositionSplitters', lastPositionSplitters),
  loadLastPositionSplitters: () => ipcRenderer.invoke('loadLastPositionSplitters'),
  updateTitle: (baseTitle: string, projectName: string, isSaved: boolean) => ipcRenderer.invoke('updateTitle', baseTitle, projectName, isSaved),
  // Settings --------------------------------------------
  loadSettings: (filePath: string) => ipcRenderer.invoke('loadSettings', filePath),
  updateSettings: (typeToSave:string, settings: any) => ipcRenderer.invoke('updateSettings', typeToSave, settings),
  deleteSettings: (typeToDelete: string, id: string) => ipcRenderer.invoke('deleteSettings', typeToDelete, id),
  fetchSettings: (typeToFetch: string) => ipcRenderer.invoke('fetchSettings', typeToFetch),
  // Images ----------------------------------------------
  saveImage: (filePath: string, filename: string, data: any) => ipcRenderer.invoke('save-image', { filePath, filename: filename, data }),
  fetchImages: (folderName: string) => ipcRenderer.invoke('fetch-images', folderName),
  onUpdateImages: (callback: any) => ipcRenderer.on('update-images', (event: any, localPath: string, images: string) => callback({ localPath, images })),
  // Save Project  ---------------------------------------
  onRequestProjectToSave: (callback: any) => ipcRenderer.on('get-data', (event: any, requestToSave: string) => callback(requestToSave)),
  responseProjectToSave: (dataToSave: any) => ipcRenderer.invoke('send-data', dataToSave),
  // Serialized project (fallback) --------------------------------
  onRequestSerializedProject: (callback: any) => ipcRenderer.on('request-serialized-project', (event: any, requestToSave: string) => callback(requestToSave)),
  responseSerializedProject: (dataSerialized: any) => ipcRenderer.invoke('send-serialized', dataSerialized),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);