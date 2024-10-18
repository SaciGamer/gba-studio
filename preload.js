const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRenderer: ipcRenderer,
  changeTheme: (theme) => ipcRenderer.send('change-theme', theme),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  send: (channel, data) => ipcRenderer.send(channel, data),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),

});

// contextBridge.exposeInMainWorld('api', {
//   saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
//   loadFile: (filePath) => ipcRenderer.invoke('load-file', filePath),
//   applyTheme: (theme) => ipcRenderer.send('apply-theme', theme),
//   onThemeChange: (callback) => ipcRenderer.on('change-theme', (event, theme) => callback(theme))
// });

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
});