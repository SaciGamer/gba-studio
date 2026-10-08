const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
  // Default ---------------------------------------------
  on: (channel: any, listener: any) => ipcRenderer.on(channel, listener),
  subscribe: (channel: any, listener: any) => {
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  send: (channel: any, data: any) => ipcRenderer.send(channel, data),
  removeListener: (channel: any, listener: any) => ipcRenderer.removeListener(channel, listener),
  // Customized ------------------------------------------
  pathJoin: (...args: any) => ipcRenderer.invoke('path-join', args),
  // Temp folder --------------------------------------------
  getTempBuildPath: () => ipcRenderer.invoke('get-temp-build-path'),
  setTempBuildPath: (p: string) => ipcRenderer.invoke('set-temp-build-path', p),
  getTempProjectBackupLimit: () => ipcRenderer.invoke('get-temp-project-backup-limit'),
  setTempProjectBackupLimit: (limit: number) => ipcRenderer.invoke('set-temp-project-backup-limit', limit),
  getHistoryLimit: () => ipcRenderer.invoke('get-history-limit'),
  setHistoryLimit: (limit: number) => ipcRenderer.invoke('set-history-limit', limit),
  clearTempProjectData: () => ipcRenderer.invoke('clear-temp-project-data'),
  getBuildConfig: () => ipcRenderer.invoke('get-build-config'),
  setBuildConfig: (config: any) => ipcRenderer.invoke('set-build-config', config),
  getCpuCount: () => ipcRenderer.invoke('get-cpu-count'),
  exportBuildAs: () => ipcRenderer.invoke('export-build-as'),
  exportExecutable: () => ipcRenderer.invoke('export-executable'),
  // -------------------------------------------------------
  importTools: (toolsName: string, srcPath: string) => ipcRenderer.invoke('import-tools', toolsName, srcPath),
  openBrowser: (url: string) => ipcRenderer.invoke('abrir-navegador', url),
  getVersionsAPI: () => ipcRenderer.invoke('get-versions'),
  loadCredits: () => ipcRenderer.invoke('load-credits'),
  getProjectResourceUsage: () => ipcRenderer.invoke('get-project-resource-usage'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createProjectPath: (projectPath: any, template?: string) => ipcRenderer.invoke('create-project-path', projectPath, template),
  checkProjectFile: (projectPath: any) => ipcRenderer.invoke('check-project-file', projectPath),
  loadPreferences: () => ipcRenderer.invoke('loadPreferences'),
  setGameWorldPreferences: (values: { panInertia: boolean; movementMode: 'free' | 'grid' }) => ipcRenderer.invoke('set-game-world-preferences', values),
  removePreferences: (key: any, value: any) => ipcRenderer.invoke('removePreferences', key, value),
  loadLastUsedPath: () => ipcRenderer.invoke('loadLastUsedPath'),
  saveLastUsedPath: (lastPath: any) => ipcRenderer.invoke('lastUsedPath', lastPath),
  loadLastSplashTab: () => ipcRenderer.invoke('loadLastUsedSplashTab'),
  saveLastSplashTab: (lastSplashTab: any) => ipcRenderer.invoke('lastUsedSplashTab', lastSplashTab),
  saveLastPositionSplitters: (lastPositionSplitters: any) => ipcRenderer.invoke('lastPositionSplitters', lastPositionSplitters),
  loadLastPositionSplitters: (projectId?: string) => ipcRenderer.invoke('loadLastPositionSplitters', projectId),
  updateTitle: (baseTitle: string, projectName: string, isSaved: boolean) => ipcRenderer.invoke('updateTitle', baseTitle, projectName, isSaved),
  // Settings --------------------------------------------
  loadSettings: (filePath: string) => ipcRenderer.invoke('loadSettings', filePath),
  updateSettings: (typeToSave:string, settings: any) => ipcRenderer.invoke('updateSettings', typeToSave, settings),
  deleteSettings: (typeToDelete: string, id: string) => ipcRenderer.invoke('deleteSettings', typeToDelete, id),
  fetchSettings: (typeToFetch: string) => ipcRenderer.invoke('fetchSettings', typeToFetch),
  // Images ----------------------------------------------
  saveImage: (filePath: string, filename: string, data: any) => ipcRenderer.invoke('save-image', { filePath, filename: filename, data }),
  fetchImages: (folderName: string) => ipcRenderer.invoke('fetch-images', folderName),
  selectCartridgeImage: () => ipcRenderer.invoke('select-cartridge-image'),
  getCartridgeImage: (projectDirectory: string | null, filename: string) => ipcRenderer.invoke('get-cartridge-image', projectDirectory, filename),
  getCommonFontImages: () => ipcRenderer.invoke('get-common-font-images'),
  readImageBytes: (source: string) => ipcRenderer.invoke('read-image-bytes', source),
  saveTrackerModule: (filename: string, data: string) => ipcRenderer.invoke('save-tracker-module', filename, data),
  renameAsset: (folderName: string, filename: string, nextFilename: string) => ipcRenderer.invoke('rename-asset', folderName, filename, nextFilename),
  importAssets: (folderName: string) => ipcRenderer.invoke('import-assets', folderName),
  importDroppedAssets: (folderName: string, filePaths: string[]) => ipcRenderer.invoke('import-dropped-assets', folderName, filePaths),
  onUpdateImages: (callback: any) => {
    const listener = (_event: any, localPath: string, images: string[]) => callback({ localPath, images });
    ipcRenderer.on('update-images', listener);
    return listener;
  },
  // Save Project  ---------------------------------------
  onRequestProjectToSave: (callback: any) => {
    const listener = (_event: any, requestToSave: string) => callback(requestToSave);
    ipcRenderer.on('get-data', listener);
    return () => ipcRenderer.removeListener('get-data', listener);
  },
  responseProjectToSave: (dataToSave: any) => ipcRenderer.invoke('send-data', dataToSave),
  // Serialized project (fallback) --------------------------------
  onRequestSerializedProject: (callback: any) => ipcRenderer.on('request-serialized-project', (event: any, requestToSave: string) => callback(requestToSave)),
  responseSerializedProject: (dataSerialized: any) => ipcRenderer.invoke('send-serialized', dataSerialized),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
