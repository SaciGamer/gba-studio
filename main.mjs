import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron';
// import Store from 'electron-store';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import isDev from 'electron-is-dev';
import { spawn } from 'child_process';
import { compileGBA } from './scripts/compile-gba.mjs';
import menuTemplate from './menuTemplate.mjs'

import { configurarPreferenceHandlers, getPreferences, updatePreferences } from './handlers/preferenceHandlers.mjs';
import windowStateKeeper from 'electron-window-state';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let splashWindow;
let launcherWindow;
let mainWindow;
let aboutWindow;
let currentTheme = getPreferences().theme;

// Splash
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 660,
    height: 460,
    frame: false,
    transparent: true,
    icon: path.join(__dirname, 'icon/defaultIcon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  splashWindow.loadURL(
    isDev
      ? `http://localhost:3000/splash`
      : `file://${path.join(__dirname, `frontend/build/splash.html?`)}`
    );

   // Após um tempo, fechar a splash screen e mostrar a janela principal
   setTimeout(() => {
    splashWindow.close();
    launcherWindow.setAlwaysOnTop(true); // Garantir que a janela principal esteja sempre no topo
    launcherWindow.show();
    launcherWindow.focus();
    launcherWindow.setAlwaysOnTop(false); // Desabilitar a configuração após trazer a janela para o topo
  }, 3000); // 3 segundos
}

// Laucher
export function createLauncherWindow(selectTab, isSplash) {
  launcherWindow = new BrowserWindow({
    width: 660,
    height: 460,
    show: isSplash? false : true, // Não mostrar a janela principal inicialmente
    resizable: false,
    icon: path.join(__dirname, 'icon/defaultIcon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
  });

  launcherWindow.setMenu(null);

  // Carregar modo de desenvolvedor
  // if (isDev) {
  //   launcherWindow.webContents.openDevTools();
  // }

  launcherWindow.loadURL(
    isDev
      ? `http://localhost:3000/launcher?tab=${encodeURI(selectTab)}`
      : `file://${path.join(__dirname, `frontend/build/launcher.html?tab=${encodeURI(selectTab)}`)}`
    );


  // Detecta quando a janela perde o foco
  launcherWindow.on('blur', () => {
    launcherWindow.webContents.send('window-blurred');
  });

  // Detecta quando a janela ganha o foco
  launcherWindow.on('focus', () => {
    launcherWindow.webContents.send('window-focused');
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

// Criar Janela Programa
function createProjectWindow(filePath) {
  // Carregar o estado anterior da janela
  const engineWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });


  // Criar a janela usando o estado
  mainWindow = new BrowserWindow({
    // Inserindo tamanho salvo da tela
    x: engineWindowState.x,
    y: engineWindowState.y,
    width: engineWindowState.width,
    height: engineWindowState.height,

    icon: path.join(__dirname, 'icon/defaultImgIcon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
    show: false, // Don't show the window until it's ready
    minWidth: 800,  // Largura mínima
    minHeight: 600, // Altura mínima
  });

  // Registrar a janela com o windowStateKeeper
  engineWindowState.manage(mainWindow);

  // mainWindow.loadURL( `file://${path.join(__dirname, 'frontend/build/index.html')}`);
  mainWindow.loadURL(
    isDev
    ? `http://localhost:3000/engine?file=${encodeURIComponent(filePath)}`
    : `file://${path.join(__dirname, `frontend/build/engine.html?file=${encodeURIComponent(filePath)}`)}`
  );

  // Carregar modo de desenvolvedor
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Detecta quando a janela perde o foco
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-blurred');
  });

  // Detecta quando a janela ganha o foco
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window-focused');
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show(); // Show the window when the content has been loaded
  });
}

// Criar Janela de About
export function createAboutWindow() {
  aboutWindow = new BrowserWindow({
    width: 418,
    height: 438,
    resizable: false,
    icon: path.join(__dirname, 'icon/defaultImgIcon.png'),
    title: 'About GBA Studio',
    webPreferences: {
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
  });

  aboutWindow.setMenu(null);

  aboutWindow.webContents.once('ready', () => {
    aboutWindow.webContents.send('change-theme', currentTheme);
  });

  // // Detecta quando a janela perde o foco
  // aboutWindow.on('blur', () => {
  //   aboutWindow.webContents.send('window-blurred');
  // });

  // // Detecta quando a janela ganha o foco
  // aboutWindow.on('focus', () => {
  //   aboutWindow.webContents.send('window-focused');
  // });

  aboutWindow.loadFile('about.html');
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
};

// Função para trocar temas
export function changeTheme(theme) {
  currentTheme = theme;
  console.log("..: Função changeTheme chamada: %s", currentTheme);

  // Envia o evento para todas as janelas ativas
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('change-theme', theme);
  });

  updatePreferences('theme', currentTheme)
}

ipcMain.on('change-theme', (event, theme) => {
  console.log("..: Entrando evento %s", theme);
  changeTheme(theme);
});

app.whenReady().then(() => {
  // createProjectWindow();
  // const menu = Menu.buildFromTemplate(menuTemplate(createAboutWindow, changeTheme));
  // Definir o menu da aplicação
  // Menu.setApplicationMenu(menu)
  createSplashWindow();
  createLauncherWindow(null, true);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow();
  }
});

// IPC para comunicação entre janelas
ipcMain.on('load-project-window', (event, filePath) => {
  loadProject(filePath);
});

function loadProject(filePath) {
  if (launcherWindow) {
    console.log('..: Fechando Launcher')
    launcherWindow.close();
  } else if (mainWindow) {
    console.log('..: Fechando mainWindow')
    mainWindow.close();
  }

  // Criar o menu a partir do template
  const menu = Menu.buildFromTemplate(menuTemplate());
  // Definir o menu da aplicação
  Menu.setApplicationMenu(menu)

  // Cria a janela
  console.log('..: IPC event received filePath:', filePath);

  let file = path.basename(filePath);
  let directory = path.dirname(filePath);

  if(path.extname(file) !== '.gbaproj') {
    file = file + '.gbaproj';
    directory = filePath;
  }

  console.log('..: File: ', file);
  console.log('..: Directory: ', directory);

  updatePreferences('recentProjects', { title: file  , path: directory});

  createProjectWindow(filePath);
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Função para iniciar o Emulador
function launchEmulator(romPath) {
  console.log("..: Iniciando Emulação :..");
  const emulatorPath = path.join(__dirname, 'emulator', 'visualboyadvance-m.exe');
  romPath = path.join(__dirname, romPath)
  console.log(`..: diretorio do projeto: ${romPath}`)
  const emulator = spawn(emulatorPath, [romPath]);
  emulator.setApplicationMenu(null)

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

function createProjectStruct(basePath) {
  console.log('..: createProjectStruct basePath: ', basePath);
  const projectName = basePath.split(path.sep).filter(Boolean).pop();
  console.log('..: createProjectStruct projectName: ', projectName);
  const userName = os.userInfo().username;
  const versionApplication = getApplicationVersion();

  const defaultContentProjectJson = { 
    "_resourceType": "project", 
    "name": projectName, 
    "author": userName, 
    "notes": "", 
    "_version": versionApplication, 
    "_release": "1" };

  const folders = ['assets', 'plugins', 'project']; 
  const assets = ['avatars', 'backgrounds', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui'];
  const projects = ['backgrounds', 'emotes', 'fonts', 'musics', 'palettes', 'sprites'];
  const files = ['.gitignore', `${projectName}.gbaproj`]; 
  console.log('..: Criando estrutura de pastas :..');
  
  folders.forEach(folder => { const folderPath = path.join(basePath, folder); 
    if (!fs.existsSync(folderPath)) { 
      fs.mkdirSync(folderPath, { recursive: true }); 
      console.log(`..: Pasta criada: ${folderPath}`); 
    } 
  }); 

  function getApplicationVersion() { 
    // Caminho do package.json no diretório de saída após o build 
    const packageJsonPath = path.resolve('dist', 'package.json'); 
    // Verifique se o arquivo existe no caminho do build 
    if (!fs.existsSync(packageJsonPath)) { 
      // Se não existir, use o caminho de desenvolvimento 
      console.warn('Arquivo package.json não encontrado no diretório de build. Usando o caminho de desenvolvimento.'); 
      return JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')).version; 
    } 
    // Se existir, use o caminho de build 
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).version; 
  }

  assets.forEach(assets => { const assetsPath = path.join(basePath, folders[0], assets); 
    if (!fs.existsSync(assetsPath)) { 
      fs.mkdirSync(assetsPath, { recursive: true }); 
      console.log(`..: Pasta do assets criada: ${folders[0]}\\${assetsPath}`); 
    } 
  }); 

  projects.forEach(projects => { const assetsPath = path.join(basePath, folders[2], projects); 
    if (!fs.existsSync(assetsPath)) { 
      fs.mkdirSync(assetsPath, { recursive: true }); 
      console.log(`..: Pasta do project criada: ${folders[0]}\\${assetsPath}`); 
    } 
  }); 

  files.forEach(file => { const filePath = path.join(basePath, file); 
    if (!fs.existsSync(filePath)) { 
      if (filePath.search(projectName))
        fs.writeFileSync(filePath, JSON.stringify(defaultContentProjectJson, null, 2));
      else 
        fs.writeFileSync(filePath, ''); 

      console.log(`..: Arquivo criado: ${filePath}`); 
    } 
  });

  console.log('..: Criando estrutura de pastas - END :..');
}

function getCaminhoAppData() {
  const appDataPath = path.join(os.homedir(), 'AppData', 'Local', 'gbaStudio'); 
  if (!fs.existsSync(appDataPath)) { 
    fs.mkdirSync(appDataPath, { recursive: true }); 
  } 
  return appDataPath;
}

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
    console.log('..: Erro Compiling ' + error.toString());
    return { success: false, message: error.toString() };
  }
});

ipcMain.on('launch-emulator', (event, romPath) => {
  // Implemente a lógica de emulador aqui
  console.log(`Recebida solicitação para iniciar o emulador com a ROM: ${romPath}`);
  launchEmulator(romPath);
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

// SAVE AS -------------------------------------------------------------
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

// OPEN PROJECT -------------------------------------------------------
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

// Handle IPC requests //Abrir Project
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

ipcMain.handle('check-project-file', async (event, projectPath) => {
  return fs.existsSync(projectPath);
});

ipcMain.handle('create-project-path', async (event, projectPath) => {
  const normalizedPath = projectPath.replace(/[/\\]/g, path.sep);

  console.log('..: Create project path request: ', normalizedPath);
  /*const response = */fs.mkdirSync(normalizedPath, { recursive: true });
  // console.log('..: Create project path response: ', response);
  createProjectStruct(normalizedPath);
  return normalizedPath;
});

// Handle opening documentation link
ipcMain.on('open-documentation', async () => {
  const url = 'https://www.google.com/?documentation'; // Substitua pelo URL da documentação
  await shell.openExternal(url); 
});

// Handle select folder to save project
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return { filePath: '' };
  } else {
    return { filePath: result.filePaths[0] };
  }
});

// Funções com handle
configurarPreferenceHandlers();