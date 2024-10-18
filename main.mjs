import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import isDev from 'electron-is-dev';
import { spawn } from 'child_process';
import { compileGBA } from './scripts/compile-gba.mjs';
import menuTemplate from './menuTemplate.mjs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let launcherWindow;
let mainWindow;
let aboutWindow;
let currentTheme = 'systemDefault';

// Laucher
function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 660,
    height: 460,
    resizable: false,
    icon: path.join(__dirname, 'icon/defaultImgIcon.png'),
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
    },
  });

  launcherWindow.setMenu(null);

  // Carregar modo de desenvolvedor
  if (isDev) {
    launcherWindow.webContents.openDevTools();
  }

  launcherWindow.loadFile('launcher.html');
  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

// Criar Janela Programa
function createProjectWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  // mainWindow.loadURL( `file://${path.join(__dirname, 'frontend/build/index.html')}`);
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, 'frontend/build/index.html')}`
    );

  // Carregar modo de desenvolvedor
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show(); // Show the window when the content has been loaded
  });
}

// Criar Janela de About
const createAboutWindow = () => {
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

  aboutWindow.webContents.once('dom-ready', () => {
    aboutWindow.webContents.send('change-theme', currentTheme);
  });

  aboutWindow.loadFile('about.html');
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });

};

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

// Função para trocar temas
function changeTheme(theme) {
  currentTheme = theme;
  console.log("..: Função changeTheme chamada: %s", theme);
  mainWindow.webContents.send('change-theme', theme);
}

app.whenReady().then(() => {
  createProjectWindow();
  const menu = Menu.buildFromTemplate(menuTemplate(createAboutWindow, changeTheme));
  // Definir o menu da aplicação
  Menu.setApplicationMenu(menu)
  // createLauncherWindow();

  
  // IPC para comunicação entre janelas
  ipcMain.on('open-project-window', () => {
    console.log('IPC event received');
    if (launcherWindow) {
      launcherWindow.close();
    }

    // Criar o menu a partir do template
   ;

    // Cria a janela
    //createMainWindow();
    createProjectWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
     createProjectWindow();
    //createLauncherWindow();
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

// ipcMain.handle('check-file-exists', async (event, filePath) => {
//   return fs.existsSync(filePath);
// });