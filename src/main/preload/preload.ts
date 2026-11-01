const { contextBridge, ipcRenderer, webUtils } = require('electron');

const startupReads = new Map<string, Promise<any>>();
const sharedStartupRead = (channel: string, ...args: any[]): Promise<any> => {
  const key = JSON.stringify([channel, ...args]);
  const existing = startupReads.get(key);
  if (existing) return existing;
  const pending = ipcRenderer.invoke(channel, ...args).finally(() => {
    if (startupReads.get(key) === pending) startupReads.delete(key);
  });
  startupReads.set(key, pending);
  return pending;
};

let preferencesRead: Promise<any> | null = null;
let preferencesRevision = 0;
ipcRenderer.on('preferences-updated', () => { preferencesRevision++; preferencesRead = null; });
const loadSharedPreferences = (): Promise<any> => {
  if (!preferencesRead) {
    const revision = preferencesRevision;
    const pending: Promise<any> = ipcRenderer.invoke('loadPreferences')
      .then((value: any) => revision === preferencesRevision ? value : loadSharedPreferences())
      .catch((error: unknown) => { if (preferencesRead === pending) preferencesRead = null; throw error; });
    preferencesRead = pending;
  }
  // Consumers may edit their own copy without changing another component's read.
  return preferencesRead.then(value => structuredClone(value));
};

const electronAPI = {
  writeMusicNoteClipboard: (text: string) => ipcRenderer.invoke('write-music-note-clipboard', text),
  readMusicNoteClipboard: () => ipcRenderer.invoke('read-music-note-clipboard'),
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
  getPathForFile: (file: any) => webUtils.getPathForFile(file),
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
  getVersionsAPI: () => sharedStartupRead('get-versions'),
  loadCredits: () => sharedStartupRead('load-credits'),
  getProjectResourceUsage: () => ipcRenderer.invoke('get-project-resource-usage'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createProjectPath: (projectPath: any, template?: string) => ipcRenderer.invoke('create-project-path', projectPath, template),
  checkProjectFile: (projectPath: any) => ipcRenderer.invoke('check-project-file', projectPath),
  loadPreferences: loadSharedPreferences,
  setGameWorldPreferences: (values: { panInertia: boolean; movementMode: 'free' | 'grid'; sceneObjectSnapSize?: 8 | 16; recenterEnabled?: boolean; recenterScenes?: boolean; recenterActors?: boolean; recenterTriggers?: boolean }) => ipcRenderer.invoke('set-game-world-preferences', values),
  removePreferences: (key: any, value: any) => ipcRenderer.invoke('removePreferences', key, value),
  loadLastUsedPath: () => ipcRenderer.invoke('loadLastUsedPath'),
  saveLastUsedPath: (lastPath: any) => ipcRenderer.invoke('lastUsedPath', lastPath),
  loadLastSplashTab: () => sharedStartupRead('loadLastUsedSplashTab'),
  saveLastSplashTab: (lastSplashTab: any) => ipcRenderer.invoke('lastUsedSplashTab', lastSplashTab),
  saveLastPositionSplitters: (lastPositionSplitters: any) => ipcRenderer.invoke('lastPositionSplitters', lastPositionSplitters),
  loadLastPositionSplitters: (projectId?: string) => sharedStartupRead('loadLastPositionSplitters', projectId),
  updateTitle: (baseTitle: string, projectName: string, isSaved: boolean) => ipcRenderer.invoke('updateTitle', baseTitle, projectName, isSaved),
  // Settings --------------------------------------------
  loadSettings: (filePath: string) => ipcRenderer.invoke('loadSettings', filePath),
  updateSettings: (typeToSave:string, settings: any) => ipcRenderer.invoke('updateSettings', typeToSave, settings),
  deleteSettings: (typeToDelete: string, id: string) => ipcRenderer.invoke('deleteSettings', typeToDelete, id),
  fetchSettings: (typeToFetch: string) => ipcRenderer.invoke('fetchSettings', typeToFetch),
  // Images ----------------------------------------------
  saveImage: (filePath: string, filename: string, data: any) => ipcRenderer.invoke('save-image', { filePath, filename: filename, data }),
  saveGeneratedSpriteImage: (filename: string, data: string) => ipcRenderer.invoke('save-generated-sprite-image', { filename, data }),
  fetchImages: (folderName: string) => ipcRenderer.invoke('fetch-images', folderName),
  deleteProjectMusicAsset: (filename: string) => ipcRenderer.invoke('delete-project-music-asset', filename),
  deleteProjectSound: (filename: string, projectSource: boolean) => ipcRenderer.invoke('delete-project-sound', filename, projectSource),
  loadMusicMetadata: (filename: string) => ipcRenderer.invoke('load-music-metadata', filename),
  saveMusicMetadata: (filename: string, metadata: { artist?: string; instruments?: Record<string, unknown>; channelInstrumentTypes?: Record<string, 'Duty' | 'Wave' | 'Noise'>; channelSettings?: Record<string, { name?: string; instrumentType?: 'Any' | 'Duty' | 'Wave' | 'Noise' | 'Other'; hidden?: boolean }> }) => ipcRenderer.invoke('save-music-metadata', filename, metadata),
  selectCartridgeImage: () => ipcRenderer.invoke('select-cartridge-image'),
  getCartridgeImage: (projectDirectory: string | null, filename: string) => ipcRenderer.invoke('get-cartridge-image', projectDirectory, filename),
  getCommonFontImages: () => ipcRenderer.invoke('get-common-font-images'),
  readImageBytes: (source: string) => ipcRenderer.invoke('read-image-bytes', source),
  saveGeneratedSfx: (sourceFilename: string, sourceJson: string, wavFilename: string, wavData: string, mode: 'source' | 'wav', overwriteExisting = false) => ipcRenderer.invoke('save-generated-sfx', sourceFilename, sourceJson, wavFilename, wavData, mode, overwriteExisting),
  listProjectSfx: () => ipcRenderer.invoke('list-project-sfx'),
  loadProjectSfx: (filename: string) => ipcRenderer.invoke('load-project-sfx', filename),
  loadMusicEditorSource: (filename: string) => ipcRenderer.invoke('load-music-editor-source', filename),
  listTrackerProjects: () => ipcRenderer.invoke('list-tracker-projects'),
  loadTrackerProject: (filename: string) => ipcRenderer.invoke('load-tracker-project', filename),
  deleteTrackerProject: (filename: string) => ipcRenderer.invoke('delete-tracker-project', filename),
  saveTrackerProject: (filename: string, data: string, overwriteExisting = false) => ipcRenderer.invoke('save-tracker-project', filename, data, overwriteExisting),
  renameTrackerProject: (filename: string, nextFilename: string) => ipcRenderer.invoke('rename-tracker-project', filename, nextFilename),
  playTrackerModulePreview: (data: string, settings?: any, synchronizedStart = false, capturePreEmulationAudio = false, captureMixerChannelState = false, captureStartBlock = 0, captureAllMixerChannels = false, capturePlaybackPosition = false, captureTrackerMarkerClock = false, captureTrackerMarkerClockEndBlock = 0, captureBlockCount = 30, capturePlayOnce = false, captureStartOrder = 0, captureStartRow = 0) => ipcRenderer.invoke('play-tracker-module-preview', data, settings, synchronizedStart, capturePreEmulationAudio, captureMixerChannelState, captureStartBlock, captureAllMixerChannels, capturePlaybackPosition, captureTrackerMarkerClock, captureTrackerMarkerClockEndBlock, captureBlockCount, capturePlayOnce, captureStartOrder, captureStartRow),
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
