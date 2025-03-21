import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { dirname } from 'path'
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import windowStateKeeper from 'electron-window-state';
import { getPreferences, updatePreferences } from './handlers/preferenceHandlers';
import { saveChanges, setProjectDirectory, setProjectFile, updateWindowTitle } from './services/saveSettingsService';
import { createProjectStruct } from './structs/mainProjectStruct';
import menuTemplate from './menuTemplate';
import { loadSettings } from './services/loadSettingsService';
import compileGBA from './utils/gbaCompiler/compile-gba';
import initializeIpcHandlers from './controllers/HandlerController';
import { SettingsUtilsManager } from './managers/SettingsUtilsManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const packageJson = JSON.parse(fs.readFileSync(`${path.join(app.getAppPath(), './package.json')}`, 'utf-8'));
const preloadPath = path.join(__dirname, 'preload', 'preload.js');
const iconPath = path.join(app.getAppPath(), 'icon', 'defaultImgIcon.png');

let mainWindowIsClosing = false;

interface Windows {
  splash: BrowserWindow | null;
  launcher: BrowserWindow | null;
  main: BrowserWindow | null;
  about: BrowserWindow | null;
}

// Window management
const windows: Windows = {
  splash: null,
  launcher: null,
  main: null,
  about: null
};

let currentTheme: string = getPreferences().theme;
let directoryPathProject: any;

// Splash
function createSplashWindow() {
  windows.splash = new BrowserWindow({
    width: 660,
    height: 460,
    resizable: false,
    frame: false,
    transparent: true,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    }
  });

  windows.splash.loadURL(
    isDev
      ? `http://localhost:5173#splash`
      : `file://${path.join(__dirname, '../renderer', 'index.html')}#/splash`
    );

   // Após um tempo, fechar a splash screen e mostrar a janela principal
   setTimeout(() => {
    windows.splash?.close();
    windows.launcher?.setAlwaysOnTop(true); // Garantir que a janela principal esteja sempre no topo
    windows.launcher?.show();
    windows.launcher?.focus();
    windows.launcher?.setAlwaysOnTop(false); // Desabilitar a configuração após trazer a janela para o topo
  }, 3000); // 3 segundos
}

// Laucher
export function createLauncherWindow(selectTab: string | null, isSplash: boolean): void {
  windows.launcher = new BrowserWindow({
    width: 660,
    height: 460,
    show: isSplash? false : true, // Não mostrar a janela principal inicialmente
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
  });

  
  windows.launcher.setMenu(null);
  
  // Carregar modo de desenvolvedor
  if (isDev) {
    windows.launcher.webContents.openDevTools();
  }
  
  // console.log('__dirname in DEV:', __dirname);
  // console.log('Preload path1:', preloadPath);
  // console.log('Carregando packageJSON:',  packageJson.build.win.icon);
  console.log('Carregando tab:', `http://localhost:5173#/launcher?tab=${encodeURI(selectTab || '')}`);

  windows.launcher.loadURL(
    isDev
      ? `http://localhost:5173#/launcher?tab=${encodeURI(selectTab || '')}`
      : `file://${path.join(__dirname, '../renderer', 'index.html')}#/launcher?tab=${encodeURI(selectTab || '')}`
  );
  
  // Detecta quando a janela perde o foco
  windows.launcher?.on('blur', () => {
    windows.launcher?.webContents.send('window-blurred');
  });

  // Detecta quando a janela ganha o foco
  windows.launcher?.on('focus', () => {
    windows.launcher?.webContents.send('window-focused');
  });

  windows.launcher?.on('closed', () => {
    windows.launcher = null;
  });
}

// Criar Janela Programa
function createProjectWindow(filePath: string): void {
  // Carregar o estado anterior da janela
  const engineWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  // Criar a janela usando o estado
  windows.main = new BrowserWindow({
    // Inserindo tamanho salvo da tela
    x: engineWindowState.x,
    y: engineWindowState.y,
    width: engineWindowState.width,
    height: engineWindowState.height,

    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
    show: false, // Don't show the window until it's ready
    minWidth: 800,  // Largura mínima
    minHeight: 600, // Altura mínima
  });

  // Registrar a janela com o windowStateKeeper
  engineWindowState.manage(windows.main);

  // Carregar modo de desenvolvedor
  if (isDev) {
    windows.main?.webContents.openDevTools();
  }

  windows.main.loadURL(
    isDev
      ? `http://localhost:5173#engine?file=${encodeURIComponent(filePath)}`
      : `file://${path.join(__dirname, '../renderer', 'index.html')}#/engine?file=${encodeURIComponent(filePath)}`
  );

  // Detecta quando a janela perde o foco
  windows.main?.on('blur', () => {
    windows.main?.webContents.send('window-blurred');
  });

  // Detecta quando a janela ganha o foco
  windows.main?.on('focus', () => {
    windows.main?.webContents.send('window-focused');
  });

  windows.main?.once('ready-to-show', () => {
    windows.main?.show(); // Show the window when the content has been loaded
    updateWindowTitle();
  });

  windows.main.on('close', async (event) => {
    if (mainWindowIsClosing) {
      console.log('..: O fechamento já está em andamento.');
      return; // Evita chamadas repetitivas
    }

    if (windows?.main) {
      event.preventDefault(); // Impede o fechamento imediato

      mainWindowIsClosing = await handleWindowClose(windows.main);
      if (!mainWindowIsClosing) {
        console.log('..: createProjectWindow Fluxo interrompido. O fechamento da janela foi cancelado.');
        return; // Interrompe o fluxo
      }
      windows.main.close();
    }
  });

  windows.main.on('closed', () => {
    mainWindowIsClosing = false;
  });
}

// Criar Janela de About
export function createAboutWindow() {
  windows.about = new BrowserWindow({
    width: 418,
    height: 438,
    resizable: false,
    icon: iconPath,
    title: 'About GBA Studio',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
  });

  windows.about?.setMenu(null);

  // windows.about?.webContents.once("dom-ready", () => {
  //   windows.about?.webContents.send('change-theme', currentTheme);
  // });

  // // Detecta quando a janela perde o foco
  // aboutWindow.on('blur', () => {
  //   aboutWindow.webContents.send('window-blurred');
  // });

  // // Detecta quando a janela ganha o foco
  // aboutWindow.on('focus', () => {
  //   aboutWindow.webContents.send('window-focused');
  // });
   
  windows.about.loadURL(
    isDev
    ? `http://localhost:5173#about`
    : `file://${path.join(__dirname, '../renderer', 'index.html')}#/about`
  );

  // Carregar modo de desenvolvedor
  if (isDev) {
    windows.about?.webContents.openDevTools();
  }

  windows.about?.once('ready-to-show', () => {
    windows.about?.show();
  });

  windows.about.on('closed', () => {
    windows.about = null;
  });
};

// Função para trocar temas
export function changeTheme(theme: string) {
  currentTheme = theme;
  console.log("..: Função changeTheme chamada: ", currentTheme);

  // Envia o evento para todas as janelas ativas
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('change-theme', theme);
  });

  updatePreferences('theme', currentTheme)
}

app.whenReady().then(() => {
  createSplashWindow();
  createLauncherWindow(null, true);
});

async function handleWindowClose(window: BrowserWindow) {
  const settingsUtilsManager = SettingsUtilsManager.getInstance();
  const settingsData = settingsUtilsManager.getData();

  if (!settingsData.saved) {
    const response = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Save', 'Don\'t Save', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      title: 'GBA Studio',
      message: 'Do you want to save the changes to "title"?',
      detail: 'Your changes will be lost if you don\'t save them.',
    });

    if (response.response === 0) { // Botão "Save"
      saveChanges();
      return true; // Permitir o fechamento
    } else if (response.response === 1) { // Botão "Don't Save"
      settingsUtilsManager.updateData({ saved: true });
      return true; // Permitir o fechamento
    } else if (response.response === 2) { // Botão "Cancelar"
      return false; // Impedir fechamento
    }
  }

  return true; // Nenhuma ação pendente, permitir o fechamento
}

async function loadProject(filePath: string) {
  if (windows.launcher) {
    console.log('..: Fechando Launcher')
    windows.launcher.close();
  } else if (windows.main) {
    console.log('..: Fechando mainWindow')
    mainWindowIsClosing = await handleWindowClose(windows.main);

    if (!mainWindowIsClosing) {
      console.log('..: loadProject Fluxo interrompido. O fechamento da janela foi cancelado.');
      return; // Interrompe o fluxo
    }
    windows.main.close();
  }

  // Criar o menu a partir do template
  const menu = Menu.buildFromTemplate(menuTemplate());
  // Definir o menu da aplicação
  Menu.setApplicationMenu(menu)

  // Cria a janela
  console.log('..: loadProject filePath %s received', filePath);

  const file = path.basename(filePath);
  const directory = path.dirname(filePath);
  directoryPathProject = setProjectDirectory(directory);
  setProjectFile(file);

  console.log('..: File:', file);
  console.log('..: Directory:', directory);

  updatePreferences('recentProjects', { title: file  , path: directory});

  createProjectWindow(filePath);
  loadSettings(filePath);
};

// Função para iniciar o Emulador
function launchEmulator(romPath: string) {
  console.log("..: Iniciando Emulação :..");
  const emulatorPath = path.join(__dirname, 'emulator', 'visualboyadvance-m.exe');
  romPath = path.join(__dirname, romPath)
  console.log(`..: diretorio do projeto: ${romPath}`)
  const emulator = spawn(emulatorPath, [romPath]);
  //emulator.setApplicationMenu(null) // remover menu

  emulator.stdout.on('data', (data) => {
    console.log(`Emulator output: ${data}`);
  });

  emulator.stderr.on('data', (data) => {
    console.error(`Emulator error: ${data}`);
  });

  emulator.on('close', (code) => {
    console.log(`Emulator exited with code ${code}`);
  });
}

function getCaminhoAppData() {
  const appDataPath = path.join(os.homedir(), 'AppData', 'Local', 'gbaStudio'); 
  if (!fs.existsSync(appDataPath)) { 
    fs.mkdirSync(appDataPath, { recursive: true }); 
  } 
  return appDataPath;
}

// ## Read ON IPC requests #############################################
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow(null, true);
  }
});

ipcMain.on('change-theme', (event, theme) => {
  console.log("..: Entrando evento %s", theme);
  changeTheme(theme);
});


// IPC para comunicação entre janelas
ipcMain.on('load-project-window', (event, filePath) => {
  loadProject(filePath);
});

async function changeLauncher(tab: string, isSplash: boolean) {
  if (windows.main) {
    mainWindowIsClosing = await handleWindowClose(windows.main);

    if (!mainWindowIsClosing) {
      console.log('..: changeLauncher Fluxo interrompido. O fechamento da janela foi cancelado.');
      return; // Interrompe o fluxo
    }

    windows.main.close();
    createLauncherWindow(tab, isSplash);
  }
}

ipcMain.on('change-to-launcher', (event, tab, isSplash) => {
  console.log('..: ipcMain changeLauncher parametros:', tab, isSplash);
  changeLauncher(tab, isSplash);
});

ipcMain.on('run-project', (event) => {
  // Implemente a lógica para executar o projeto compilado
  console.log('..: Recebida solicitação para executar o projeto');
  console.log('..: Running project...');
  // Inicie o emulador com a ROM compilada
});

ipcMain.on('compile-project', async (event)  => {
  // Implemente a lógica de compilação aqui
  console.log('..: Recebida solicitação para compilar o projeto :..');
  console.log('..: Compiling project...');
  try {
    const result = await compileGBA();
    console.log('..: Success Compiling');
    return { success: true, message: result };
  } catch (error) {
    console.log('..: Erro Compiling ' + error);
    return { success: false, message: error};
  }
});

ipcMain.on('launch-emulator', (event, romPath) => {
  // Implemente a lógica de emulador aqui
  console.log(`Recebida solicitação para iniciar o emulador com a ROM: ${romPath}`);
  launchEmulator(romPath);
});

// Read ON IPC requests //Abrir Project
ipcMain.on('open-project-window', async (event) => {
  console.log("..: chamado abertura de projeto");
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'GBA Projects', extensions: ['gbaproj'] }],
    });

    if (result.canceled) {
      console.log('..: Project file selected - canceled');
    } else if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      console.log('..: Project file selected:', filePath);

      const file = path.basename(filePath);
      const directory = path.dirname(filePath);
      updatePreferences('recentProjects', { title: file, path: directory});

      loadProject(filePath);
    }
  } catch (error) {
    console.error('Error opening project file dialog:', error);
  }
});

ipcMain.on('open-project-folder', async (event, projectPath) => {
  try {
    if (projectPath) {
      await shell.openPath(projectPath);
    } else {
      console.log('No project path provided, tentando abrir o diretório do projeto: ', directoryPathProject);
      await shell.openPath(directoryPathProject);
    }
  } catch (error) {
    console.error('Error opening project folder:', error);
  }
});

// Read opening documentation link
ipcMain.on('open-documentation', async () => {
  const url = 'https://www.google.com/?documentation'; // Substitua pelo URL da documentação
  await shell.openExternal(url); 
});

// ## Read ON IPC requests END #########################################

// ## Handle Preferences ###############################################
// Handle join path
ipcMain.handle('path-join', async (event, pathJoin) => {
  return path.join(...pathJoin);
});

// Handle file save
ipcMain.handle('save-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return 'File saved successfully';
  } catch (error) {
    console.error(error);
    return 'Error saving file';
  }
});

// Handle file load
ipcMain.handle('load-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data;
  } catch (error) {
    console.error(error);
    return 'Error loading file';
  }
});

// Handle check project file
ipcMain.handle('check-project-file', async (event, projectPath) => {
  return fs.existsSync(projectPath);
});

ipcMain.handle('create-project-path', async (event, projectPath) => {
  const normalizedPath = projectPath.replace(/[/\\]/g, path.sep);

  console.log('..: Create project path request: ', normalizedPath);
  fs.mkdirSync(normalizedPath, { recursive: true });
  createProjectStruct(normalizedPath);
  return normalizedPath;
});

// Handle select folder to save project
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(windows.main!, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return { filePath: '' };
  } else {
    return { filePath: result.filePaths[0] };
  }
});

ipcMain.handle('abrir-navegador', async (event, url) => {
  try {
    console.log(`Navegador aberto: ${url}`);
    await shell.openExternal(url);
  } catch (err) {
    console.error(`Erro ao abrir o navegador: ${err}`);
  }
});

ipcMain.handle('get-versions', () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  projectVersion: packageJson.version,
}));

initializeIpcHandlers();
// ## Handle Preferences END ###########################################

// ## SAVE AS ##########################################################
/*const saveProjectAs = (projectData) => {
  const filePath = dialog.showSaveDialogSync(mainWindow, {
    title: 'Save Project As',
    defaultPath: path.join(app.getPath('documents'), 'NewProject.gbasproj'),
    filters: [{ name: 'GBA Studio Project', extensions: ['gbasproj'] }]
  });
  
  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(projectData), 'utf-8');
  }
};*/
// ## SAVE AS END ######################################################


// ## OPEN PROJECT #####################################################
/*const loadProject = () => {
  const filePath = dialog.showOpenDialogSync(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'GBA Studio Project', extensions: ['gbasproj'] }]
  });
  
  if (filePath && filePath.length > 0) {
    const projectData = JSON.parse(fs.readFileSync(filePath[0], 'utf-8'));
    mainWindow.webContents.send('load-project', projectData);
  }
};*/
// ## OPEN PROJECT END #################################################

