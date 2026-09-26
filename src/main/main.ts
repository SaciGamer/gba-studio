import { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { dirname } from 'path'
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

import windowStateKeeper from 'electron-window-state';
import { getPreferences, updatePreferences, initializeDefaultPaths, getBuildConfig } from './handlers/preferenceHandlers';
import { prepareProjectSandbox, requestSaveChanges, setProjectDirectory, setProjectFile, waitForSaveComplete, copyDirectoryContents } from './services/saveSettingsService';
import { saveEvents } from './services/saveSettingsService';
import { createProjectStruct } from './structs/mainProjectStruct';
import menuTemplate from './menuTemplate';
import compileGBA, { cancelActiveCompile } from './utils/gbaCompiler/compile-gba';
import transcodeProject, { cancelActiveAssetGeneration } from './utils/projectTranscoder/transcode-project';
import initializeIpcHandlers from './controllers/HandlerController';
import { clearWatchers, startWatch } from './services/imagemService';
import { SettingsController } from './controllers/SettingsController';
import { setCurrentActiveSandboxDirectory } from './states/tempProjectState';
import { loadLauncherCredits, refreshLauncherCredits } from './services/creditsService';
import { checkForUpdates } from './services/updateService';

import express from 'express';
import { CompileResult } from './utils/types/BuildTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);

const preloadPath = path.join(__dirname, 'preload', 'preload.js');
const iconPath = path.join(app.getAppPath(), 'icon', 'defaultImgIcon.png');

const packageJsonPath = isDev
  ? path.resolve(__dirname, '../../package.json') // Em dev, busca na raiz do projeto
  : path.join(app.getAppPath(), 'package.json');  // Em produção, usa o app.getAppPath()

export const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
export let directoryPathProject: string | null = null;
export let originalProjectDirectory: string | null = null;

export function setProjectWorkspacePaths(activeDirectory: string | null, sourceDirectory: string | null): void {
  directoryPathProject = activeDirectory;
  originalProjectDirectory = sourceDirectory;
  setCurrentActiveSandboxDirectory(activeDirectory);
}

// If the app was started with a project file, store it here so splash can route to Engine
export let startupProjectToOpen: string | null = null;
let mainWindowIsClosing = false;
let currentTheme: string = getPreferences().theme;

// Registrar esquema personalizado como privilegiado
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      secure: true, // Marca o esquema como seguro
      standard: true, // Habilita APIs padrão, como carregamento de arquivos
      corsEnabled: true,
    },
  },
]);

interface Windows {
  splash: BrowserWindow | null;
  launcher: BrowserWindow | null;
  main: BrowserWindow | null;
  emulator: BrowserWindow | null;
  about: BrowserWindow | null;
}

// Window management
export const windows: Windows = {
  splash: null,
  launcher: null,
  main: null,
  emulator: null,
  about: null
};

// Detect if app was started with a project file in args (Windows: double-clicking a .gbaproj)
const initialProjectArg = process.argv.find(a => typeof a === 'string' && a.toLowerCase().endsWith('.gbaproj')) as string | undefined;
if (initialProjectArg) {
  startupProjectToOpen = initialProjectArg;
}

// Ensure single instance: if a second instance is launched with a .gbaproj, route it to the running instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv /* , workingDir */) => {
    try {
      const fileArg = (argv || []).find((a: any) => typeof a === 'string' && a.toLowerCase().endsWith('.gbaproj')) as string | undefined;
      if (fileArg) {
        // If main already exists, load the project immediately
        if (windows.main) {
          loadProject(fileArg);
        } else {
          // Otherwise set it as startup project so splash will route to Engine
          startupProjectToOpen = fileArg;
          // If there's no splash running, create one so it can route
          if (!windows.splash) {
            createSplashWindow();
          }
        }
      } else {
        // No project arg: bring existing window to front
        if (windows.main) {
          try { if (windows.main.isMinimized()) windows.main.restore(); windows.main.focus(); } catch (e) {}
        } else if (windows.launcher) {
          try { if (windows.launcher.isMinimized()) windows.launcher.restore(); windows.launcher.focus(); } catch (e) {}
        }
      }
    } catch (e) {
      console.error('second-instance handler error', e);
    }
  });
}

// Splash
function createSplashWindow() {
  windows.splash = new BrowserWindow({
    width: 660,
    height: 460,
    useContentSize: true,
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
    // Close splash first
    windows.splash?.close();

    // If we were started with a project file, open that project (go to Engine)
    if (startupProjectToOpen) {
      const p = startupProjectToOpen;
      startupProjectToOpen = null;
      // Use loadProject so menus and state are properly initialized
      loadProject(p);
      return;
    }

    // Otherwise create/show the launcher normally
    windows.launcher?.setAlwaysOnTop(true); // Garantir que a janela principal esteja sempre no topo
    // If launcher window hasn't been created yet, create it
    if (!windows.launcher) {
      createLauncherWindow(null, false);
    } else {
      windows.launcher.show();
      windows.launcher.focus();
      void checkForUpdates({ currentVersion: packageJson.version, parentWindow: windows.launcher });
    }
    windows.launcher?.setAlwaysOnTop(false); // Desabilitar a configuração após trazer a janela para o topo
  }, 3000); // 3 segundos
}

// Laucher
export function createLauncherWindow(selectTab: string | null, isSplash: boolean): void {
  windows.launcher = new BrowserWindow({
    width: 660,
    height: 460,
    useContentSize: true,
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

  if (!isSplash) {
    windows.launcher.once('ready-to-show', () => {
      void checkForUpdates({ currentVersion: packageJson.version, parentWindow: windows.launcher });
    });
  }
  
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
function createProjectWindow(projectFilePath: string): void {
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
    // electron-window-state persists native bounds (which include the title
    // bar). Keep BrowserWindow in that same coordinate system: with content
    // size enabled Electron would add the frame height every time it reopens.
    useContentSize: false,
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
  console.log('..: createProjectWindow setting loaded:', projectFilePath);

  windows.main.loadURL(
    isDev
      ? `http://localhost:5173#engine?path=${encodeURIComponent(projectFilePath)}`
      : `file://${path.join(__dirname, '../renderer', 'index.html')}#/engine?path=${encodeURIComponent(projectFilePath)}`
  );

  // Detecta quando a janela perde o foco
  // windows.main?.on('blur', () => {
  //   windows.main?.webContents.send('window-blurred');
  // });

  // // Detecta quando a janela ganha o foco
  // windows.main?.on('focus', () => {
  //   windows.main?.webContents.send('window-focused');
  // });

  windows.main?.once('ready-to-show', () => {
    windows.main?.show(); // Show the window when the content has been loaded
    // updateWindowTitle();
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

      await clearWatchers();
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
    useContentSize: true,
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

function launchEmulatorWindow(romPath: string) {
  if (windows.emulator) {
    windows.emulator.close();
    windows.emulator = null;
  }

  windows.emulator = new BrowserWindow({
    width: 720,
    height: 480,
    useContentSize: true,
    show: false, // Don't show the window until it's ready
    // resizable: false,
    icon: iconPath,
    title: 'GBA Studio - Emulator',
    // frame: false,          // remove bordas e botões padrão
    // transparent: true,        // permite fundo transparente
    alwaysOnTop: true,   // mantém acima das outras
    // skipTaskbar: true,   // não aparece na barra de tarefas
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false, // Importante para segurança
      contextIsolation: true, // Importante para segurança
      webSecurity: false,     // desabilita CSP
    },
  });

  windows.emulator?.setMenu(null);

  // passa o caminho da ROM via query string ou IPC
  windows.emulator.loadURL(
    isDev
    ? `http://localhost:5173#emulator?rom=${encodeURIComponent(romPath)}`
    : `file://${path.join(__dirname, '../renderer', 'index.html')}#/emulator?rom=${encodeURIComponent(romPath)}`
  );

  // Carregar modo de desenvolvedor
  if (isDev) {
    windows.emulator?.webContents.openDevTools();
  }

  windows.emulator?.once('ready-to-show', () => {
    windows.emulator?.show();
    // notifica main to start emulator
    windows.main?.webContents.send('emulator-started');
  });

  windows.emulator.on('closed', () => {
    windows.emulator = null;
    windows.main?.webContents.send('emulator-stopped');
  });
}

// Função para trocar temas
export function changeTheme(theme: string) {
  currentTheme = theme;
  console.log("..: Função changeTheme chamada: ", currentTheme);

  // Envia o evento para todas as janelas ativas
  Object.values(windows).forEach((window) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('change-theme', theme);
    }
  });

  updatePreferences('theme', currentTheme)
}

app.whenReady().then(() => {
  // Initialize default paths from environment variables
  initializeDefaultPaths();

  // Manipular requisições do esquema 'local://'
  protocol.handle('local', async (request) => {
    const url = decodeURIComponent(request.url.replace('local://', ''));
    let filePath = path.normalize(url); // Normalizar caminhos com barras corretas
    if (/^[a-zA-Z](\\|\/)/.test(filePath)) {
      // Adiciona ":" se faltar no caminho (drive letter Windows)
      filePath = filePath.replace(/^([a-zA-Z])(\\|\/)/, '$1:\\')
    }

    console.log('Processed file path:', filePath); 

    try {
      // Ensure the file exists before returning it
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const extension = path.extname(filePath).toLowerCase();
        const contentType = extension === '.bmp' ? 'image/bmp'
          : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
            : extension === '.gif' ? 'image/gif'
              : extension === '.wav' ? 'audio/wav'
                : extension === '.mp3' ? 'audio/mpeg'
                  : extension === '.ogg' ? 'audio/ogg'
                    : 'image/png';

        return new Response(new Uint8Array(fileBuffer), {
          status: 200, // Success
          headers: { 'Content-Type': contentType },
        });
      } else {
        return new Response('File not found', {
          status: 404, // Not Found
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch (error) {
      console.error('Error serving file:', error);

      return new Response('Internal Server Error', {
        status: 500, // Internal Server Error
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  });

  const server = express();
  const romDir = path.join(app.getPath("userData"), "gba-studio-play", "roms");
  fs.mkdirSync(romDir, { recursive: true });
  const emulatorjsBasePath = isDev
      ? path.join(__dirname, "..", "renderer", "emulatorjs", "data")
      : path.join(process.resourcesPath, "bin", "tools", "emulatorjs", "data");

  server.use("/roms", express.static(romDir));
  server.use("/emulatorjs-data", express.static(emulatorjsBasePath));

  server.listen(3000, () => {
    console.log("ROM server running at http://localhost:3000/roms");
    console.log("EMULATORJS server running at http://localhost:3000/emulatorjs");
  });

  createSplashWindow();
});

async function handleWindowClose(window: BrowserWindow) {
  const settingsController = SettingsController.getInstance();

  if (!settingsController.isSaved()) {
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
      requestSaveChanges({ source: 'close', persistToOriginal: true });

      try {
        // The renderer must answer and the original project must be updated
        // before watchers/build processes are stopped and the window closes.
        await waitForSaveComplete();
        return true;
      } catch (error) {
        console.error('..: Save did not finish before closing; keeping the window open.', error);
        return false;
      }
    } else if (response.response === 1) { // Botão "Don't Save"
      settingsController.setIsSaved(true);
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
  
  // cleanAllTargetDir();
  
  // Criar o menu a partir do template
  const menu = Menu.buildFromTemplate(menuTemplate());
  // Definir o menu da aplicação
  Menu.setApplicationMenu(menu)
  
  // Cria a janela
  console.log('..: loadProject filePath %s received', filePath);
  
  const file = path.basename(filePath);
  const directory = path.dirname(filePath);
  const { sandboxDirectory } = prepareProjectSandbox(filePath);

  setProjectWorkspacePaths(sandboxDirectory, directory);
  directoryPathProject = setProjectDirectory(sandboxDirectory);
  setProjectFile(file);

  console.log('..: File:', file);
  console.log('..: Directory:', directory);

  updatePreferences('recentProjects', { title: file  , path: directory});

  createProjectWindow(filePath);
};

// TODO remover caso não utilize
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

async function closeAllWindowsExcept(exceptWindow: BrowserWindow | null) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win !== exceptWindow) {
      if (win == windows.main) {
        clearWatchers();
      }
      win.close();
    }
  });
}

async function changeLauncher(tab: string, isSplash: boolean) {
  if (windows.main) {
    mainWindowIsClosing = await handleWindowClose(windows.main);

    if (!mainWindowIsClosing) {
      console.log('..: changeLauncher Fluxo interrompido. O fechamento da janela foi cancelado.');
      return; // Interrompe o fluxo
    }

    await closeAllWindowsExcept(null);
    createLauncherWindow(tab, isSplash);
  }
}

// IPC para comunicação entre janelas
// Track emulator process so we can stop it from the IDE
ipcMain.on('stop-emulator', (event) => {
  if (windows.emulator) {
    windows.emulator.close();
    windows.emulator = null;
  }
});

ipcMain.on('change-theme', (event, theme) => {
  console.log("..: Entrando evento %s", theme);
  changeTheme(theme);
});

ipcMain.on('load-project-window', (event, filePath) => {
  loadProject(filePath);
});

ipcMain.on('change-to-launcher', (event, tab, isSplash) => {
  console.log('..: ipcMain changeLauncher parametros:', tab, isSplash);
  changeLauncher(tab, isSplash);
});

// ## SAVE AS ##########################################################
ipcMain.on('save-project-as', async (event) => {
  console.log('..: save-project-as requested');
  if (!windows.main) return;

  const currentProjectFile = SettingsController.getInstance().getProjectFile() || 'NewProject.gbaproj';
  const currentProjectDirectory = originalProjectDirectory || directoryPathProject || app.getPath('documents');
  const defaultPath = path.join(currentProjectDirectory, currentProjectFile);

  const result = await dialog.showSaveDialog(windows.main, {
    title: 'Save Project As',
    defaultPath,
    filters: [{ name: 'GBA Studio Project', extensions: ['gbaproj'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const saveAsPath = result.filePath;
  const saveAsName = path.basename(saveAsPath);
  const saveAsDirectory = path.dirname(saveAsPath);
  const saveAsProjectName = path.basename(saveAsName, '.gbaproj');
  const targetProjectDirectory = path.join(saveAsDirectory, saveAsProjectName);
  const targetProjectFilePath = path.join(targetProjectDirectory, saveAsName);

  try {
    if (!directoryPathProject && !originalProjectDirectory) {
      console.warn('save-project-as: no active project sandbox or original project directory available');
      return;
    }

    requestSaveChanges({ persistToOriginal: false, markAsSaved: true, source: 'save-as', saveAsPath });
    await waitForSaveComplete(10000);

    const sourceSandbox = directoryPathProject || originalProjectDirectory || '';
    if (!fs.existsSync(targetProjectDirectory)) {
      fs.mkdirSync(targetProjectDirectory, { recursive: true });
    }

    copyDirectoryContents(sourceSandbox, targetProjectDirectory);

    const currentProjectFileName = currentProjectFile;
    const currentProjectFilePath = path.join(targetProjectDirectory, currentProjectFileName);
    const currentProjectBackupPath = `${currentProjectFilePath}.bak`;
    const targetProjectBackupPath = `${targetProjectFilePath}.bak`;

    if (currentProjectFileName !== saveAsName && fs.existsSync(currentProjectFilePath)) {
      fs.renameSync(currentProjectFilePath, targetProjectFilePath);
      if (fs.existsSync(currentProjectBackupPath)) {
        if (fs.existsSync(targetProjectBackupPath)) {
          fs.rmSync(targetProjectBackupPath, { force: true });
        }
        fs.renameSync(currentProjectBackupPath, targetProjectBackupPath);
      }
    }

    try {
      if (fs.existsSync(targetProjectFilePath)) {
        const projectJson = JSON.parse(fs.readFileSync(targetProjectFilePath, 'utf8'));
        if (typeof projectJson === 'object' && projectJson !== null) {
          projectJson.name = saveAsProjectName;
          fs.writeFileSync(targetProjectFilePath, JSON.stringify(projectJson, null, 2), 'utf8');
        }
      }
    } catch (writeErr) {
      console.warn('save-project-as: failed to update project name in .gbasproj', writeErr);
    }

    const { sandboxDirectory: newSandbox } = prepareProjectSandbox(targetProjectFilePath);
    setProjectWorkspacePaths(newSandbox, targetProjectDirectory);
    setProjectFile(saveAsName);

    windows.main?.webContents.send('project-saved-as', {
      projectPathFile: saveAsName,
      projectDirectory: saveAsDirectory,
      projectName: saveAsProjectName,
    });

    updatePreferences('recentProjects', { title: saveAsName, path: saveAsDirectory });
  } catch (err) {
    console.error('save-project-as error', err);
  }
});
// ## SAVE AS END ######################################################

// ## GET EMULATOR ROM BUFFER ##########################################
ipcMain.handle("get-emulator-rom-buffer", async (event, filePath) => {
  if (!filePath) throw new Error("filePath not exists!");
  const file = await fs.promises.readFile(filePath);
  return file.buffer; // return with ArrayBuffer
});
// ## GET EMULATOR ROM BUFFER END ######################################

// ## RUN-LIVE #########################################################
// This is used for "Run Live" feature, which runs the project without saving changes to disk
ipcMain.on('run-live', async (event) => {
  if (buildInProgress) return;
  buildInProgress = true;
  buildStopRequested = false;
  console.log('..: run-live requested');
  try {
    const compileRes = await transcodeAndCompile();

    if (compileRes && compileRes.gbaPath) {
      // For Play, copy the generated .gba into a temp location and launch that
      const romDir = path.join(app.getPath("userData"), 'gba-studio-play', 'roms');
      const destGba = path.join(romDir, path.basename(compileRes.gbaPath));

      if (fs.existsSync(destGba)) {
        fs.rmSync(destGba, { force: true });
      }
      
      try { 
        fs.copyFileSync(compileRes.gbaPath, destGba); 
      } catch (e) { 
        console.warn('Could not copy .gba to play', e); 
      }
      
      const romUrl  = `http://localhost:3000/roms/${path.basename(destGba)}`;
      launchEmulatorWindow(romUrl);
    } else {
      console.warn('run-live: compile did not produce a .gba');
    }
  } catch (error) {
    console.error('run-live error', error);
    windows.main?.webContents.send('compile-error', error);
  } finally {
    buildInProgress = false;
  }
});
// ## RUN-LIVE END #####################################################

// ## COMPILE PROJECT  #################################################
function getTemporaryBuildDirectory(): string {
  return path.resolve(os.tmpdir(), 'gba-studio-temp', 'gba-studio-build');
}

function clearTemporaryBuildDirectory(): void {
  const temporaryRoot = path.resolve(os.tmpdir(), 'gba-studio-temp');
  const buildDirectory = getTemporaryBuildDirectory();
  if (path.dirname(buildDirectory) !== temporaryRoot) {
    throw new Error(`Refusing to clean an unexpected build directory: ${buildDirectory}`);
  }
  fs.rmSync(buildDirectory, { recursive: true, force: true });
}

async function archiveBuildDirectory(sourceDirectory: string, destinationFile: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Exportação de build em ZIP está disponível apenas no Windows no momento.');
  }

  // Keep paths out of the PowerShell command. `-Command` doesn't bind trailing
  // process arguments to a top-level `param`, while environment variables are
  // passed reliably even when a path contains spaces.
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$source = $env:GBA_STUDIO_EXPORT_SOURCE; $destination = $env:GBA_STUDIO_EXPORT_DESTINATION; $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("gba-studio-export-" + [guid]::NewGuid()); New-Item -ItemType Directory -Path $stage -Force | Out-Null; Copy-Item -Path (Join-Path $source "*") -Destination $stage -Recurse -Force; Get-ChildItem -LiteralPath $stage -Recurse -Force -File | Where-Object { $_.Name -eq ".project.json" -or $_.Extension -in @(".gba", ".elf") } | Remove-Item -Force; Get-ChildItem -LiteralPath $stage -Force | Compress-Archive -DestinationPath $destination -Force; Remove-Item -LiteralPath $stage -Recurse -Force',
  ], {
    windowsHide: true,
    env: {
      ...process.env,
      GBA_STUDIO_EXPORT_SOURCE: sourceDirectory,
      GBA_STUDIO_EXPORT_DESTINATION: destinationFile,
    },
  });
}

let buildInProgress = false;
let buildStopRequested = false;
let exportInProgress = false;

const runExclusiveExport = async (operation: () => Promise<unknown>) => {
  if (exportInProgress) {
    return { success: false, message: 'Uma exportação já está aberta. Feche a janela atual antes de tentar novamente.' };
  }
  exportInProgress = true;
  try {
    return await operation();
  } finally {
    exportInProgress = false;
  }
};

ipcMain.handle('export-build-as', () => runExclusiveExport(async () => {
  if (buildInProgress) {
    return { success: false, message: 'Aguarde o build atual terminar antes de exportar.' };
  }

  const buildDirectory = getTemporaryBuildDirectory();
  const markerFile = path.join(buildDirectory, '.project.json');
  if (!fs.existsSync(markerFile)) return { success: false, message: 'Nenhum build válido foi encontrado. Faça um build primeiro.' };
  try {
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    if (marker.projectDir !== (originalProjectDirectory || '')) return { success: false, message: 'O build pertence a outro projeto. Faça um build primeiro.' };
  } catch { return { success: false, message: 'O build está inválido. Faça um build primeiro.' }; }
  if (!fs.existsSync(buildDirectory) || !fs.statSync(buildDirectory).isDirectory()) {
    return { success: false, message: 'Nenhum build temporário foi encontrado. Compile o projeto antes de exportar.' };
  }

  const projectFile = SettingsController.getInstance().getProjectFile() || 'gba-studio';
  const archiveName = `${path.basename(projectFile, path.extname(projectFile))}-build.zip`;
  const dialogOptions = {
    title: 'Export Build As',
    defaultPath: path.join(originalProjectDirectory || app.getPath('documents'), archiveName),
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  };
  const result = windows.main
    ? await dialog.showSaveDialog(windows.main, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  try {
    await archiveBuildDirectory(buildDirectory, result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Failed to export build archive', error);
    return { success: false, message: `Não foi possível exportar o build: ${error instanceof Error ? error.message : String(error)}` };
  }
}));

ipcMain.handle('export-executable', () => runExclusiveExport(async () => {
  if (buildInProgress) return { success: false, message: 'Aguarde o build atual terminar antes de exportar.' };
  const buildDirectory = getTemporaryBuildDirectory();
  const markerFile = path.join(buildDirectory, '.project.json');
  if (!fs.existsSync(markerFile)) return { success: false, message: 'Nenhum build válido foi encontrado. Faça um build primeiro.' };
  try {
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    if (marker.projectDir !== (originalProjectDirectory || '')) return { success: false, message: 'O build pertence a outro projeto. Faça um build primeiro.' };
  } catch { return { success: false, message: 'O build está inválido. Faça um build primeiro.' }; }
  const findGba = (directory: string): string | null => {
    if (!fs.existsSync(directory)) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) { const nested = findGba(candidate); if (nested) return nested; }
      else if (/\.gba$/i.test(entry.name)) return candidate;
    }
    return null;
  };
  const sourceGba = findGba(buildDirectory);
  if (!sourceGba) return { success: false, message: 'Nenhum executável encontrado. Compile o projeto antes de exportar.' };
  const projectFile = SettingsController.getInstance().getProjectFile() || 'gba-studio';
  const result = windows.main
    ? await dialog.showOpenDialog(windows.main, { title: 'Export Executable', defaultPath: originalProjectDirectory || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] })
    : await dialog.showOpenDialog({ title: 'Export Executable', defaultPath: originalProjectDirectory || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true };
  try {
    const name = path.basename(projectFile, path.extname(projectFile));
    const destinationDir = path.join(result.filePaths[0], 'Build');
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.copyFileSync(sourceGba, path.join(destinationDir, `${name}.gba`));
    const sourceElf = sourceGba.replace(/\.gba$/i, '.elf');
    if (fs.existsSync(sourceElf)) fs.copyFileSync(sourceElf, path.join(destinationDir, `${name}.elf`));
    return { success: true, filePath: destinationDir };
  }
  catch (error) { return { success: false, message: `Não foi possível exportar o executável: ${error instanceof Error ? error.message : String(error)}` }; }
}));

ipcMain.on('stop-build', async () => {
  try {
    if (!buildInProgress) {
      windows.main?.webContents.send('compile-error', { message: 'Não há compilação Butano em execução.' });
      return;
    }

    buildStopRequested = true;
    const [stoppedCompile, stoppedAssets] = await Promise.all([
      cancelActiveCompile(),
      cancelActiveAssetGeneration(),
    ]);
    if (!stoppedCompile && !stoppedAssets) {
      // The current transcode operation has not started make yet. It will
      // observe this flag before compiling and clean the temporary directory.
      windows.main?.webContents.send('compile-progress', {
        status: 'running',
        message: '>> Cancelamento solicitado; aguardando a etapa atual.',
      });
      return;
    }

    clearTemporaryBuildDirectory();
    windows.main?.webContents.send('compile-error', {
      message: 'Compilação cancelada e diretório temporário limpo.',
      cancelled: true,
    });
  } catch (error) {
    console.error('Unable to stop build', error);
    windows.main?.webContents.send('compile-error', { message: String(error) });
  }
});

ipcMain.on('compile-project', async (event)  => {
  if (buildInProgress) return;
  buildInProgress = true;
  buildStopRequested = false;
  console.log('..: Compiling project...');
  try {
    const compileRes = await transcodeAndCompile();

    return { success: true, message: compileRes };
  } catch (error) {
    console.error('Transcode/compile error ', error);
    windows.main?.webContents.send('compile-error', error);
  } finally {
    buildInProgress = false;
  }
});

async function transcodeAndCompile(): Promise<CompileResult> {
  if (!windows.main) return { success: false, stdout: '', stderr: '' };

  requestSaveChanges({ source: 'build', persistToOriginal: false, markAsSaved: false });
  
  // Wait for save to complete (timeout 10s)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Save timeout for build')), 10000);
    saveEvents.once('saved', () => { clearTimeout(timeout); resolve(true); });
  });
  
  // Notify renderer that transcode is starting
  windows.main?.webContents.send('compile-progress', { status: 'started', message: '>> Iniciando transcodificação do projeto...' });

  const activeProjectDir = directoryPathProject || originalProjectDirectory || '';
  if (!activeProjectDir) {
    console.warn('transcodeAndCompile: no active project directory available');
    return { success: false, stdout: '', stderr: '' };
  }

  // Transcode project using the sandbox workspace directly
  const transRes: any = await transcodeProject({
    projectDir: activeProjectDir,
    markerProjectDir: originalProjectDirectory || activeProjectDir,
    includeAssets: true,
  });

  if (!transRes.success || !transRes.outputDir) {
    throw new Error(`Transcode failed: ${transRes.message}`);
  }

  if (buildStopRequested) {
    clearTemporaryBuildDirectory();
    throw new Error('Compilação cancelada pelo usuário');
  }

  // Compile using path build
  const tempBuild = transRes.outputDir;

  // Notify renderer that transcode finished and compilation will start
  windows.main?.webContents.send('compile-progress', { status: 'started', message: '>> Transcodificação concluída.' });

  // Compile with new parameter-based interface (use saved build config)
  const buildCfg = getBuildConfig();
  const compileRes = await compileGBA({
    buildDir: tempBuild,
    parallel: buildCfg?.parallel,
    optimizationLevel: buildCfg?.optimizationLevel as any,
    verbose: buildCfg?.verbose,
  });

  return compileRes;
}
// ## COMPILE PROJECT  END #############################################

// ## OPEN PROJECT #####################################################
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
      const originalPath = originalProjectDirectory || directoryPathProject || '';
      console.log('No project path provided, tentando abrir o diretório do projeto original: ', originalPath);
      await shell.openPath(originalPath);
    }
  } catch (error) {
    console.error('Error opening project folder:', error);
  }
});
// ## OPEN PROJECT END #################################################

// ## OPEN DOCUMENTATION LINK ##########################################
ipcMain.on('open-documentation', async () => {
  const url = 'https://sacigamer.github.io/gba-studio-site/docs/intro';
  await shell.openExternal(url); 
});
// ## OPEN DOCUMENTATION LINK END ######################################
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

// Handle create project path
ipcMain.handle('create-project-path', async (event, projectPath, template) => {
  const normalizedPath = projectPath.replace(/[/\\]/g, path.sep);

  console.log('..: Create project path request: ', normalizedPath, ' template:', template);
  fs.mkdirSync(normalizedPath, { recursive: true });
  createProjectStruct(normalizedPath, template);
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

// Handle select file to open project
ipcMain.handle('abrir-navegador', async (event, url) => {
  try {
    console.log(`Navegador aberto: ${url}`);
    await shell.openExternal(url);
  } catch (err) {
    console.error(`Erro ao abrir o navegador: ${err}`);
  }
});

// Handle get versions
ipcMain.handle('get-versions', () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  projectVersion: packageJson.version,
}));

ipcMain.handle('load-credits', async () => {
  const localCredits = await loadLauncherCredits();
  void refreshLauncherCredits().then((remoteCredits) => {
    if (remoteCredits) windows.launcher?.webContents.send('credits-updated', remoteCredits);
  });
  return localCredits;
});

interface ProjectResourceUsage {
  /** Last exported ROM, kept only as a confirmation/calibration reference. */
  binary: number;
  /** Engine code and static runtime estimate. */
  engine: number;
  graphics: number;
  audio: number;
  scripts: number;
  /** Calculated from intermediate build resources, not from the .gba file. */
  total: number;
  source: 'build' | 'assets';
  measuredAt: number;
}

const sumDirectoryBytes = (directory: string): number => {
  if (!fs.existsSync(directory)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += sumDirectoryBytes(fullPath);
    else if (entry.isFile()) total += fs.statSync(fullPath).size;
  }
  return total;
};

const newestGbaSize = (directory: string): number => {
  if (!fs.existsSync(directory)) return 0;
  const files: Array<{ path: string; modified: number }> = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gba')) files.push({ path: fullPath, modified: fs.statSync(fullPath).mtimeMs });
    }
  };
  visit(directory);
  files.sort((left, right) => right.modified - left.modified);
  return files[0] ? fs.statSync(files[0].path).size : 0;
};

const sumMatchingFiles = (directory: string, predicate: (name: string) => boolean): number => {
  if (!fs.existsSync(directory)) return 0;
  let total = 0;
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && predicate(entry.name)) total += fs.statSync(fullPath).size;
    }
  };
  visit(directory);
  return total;
};

const ENGINE_ROM_BASE_ESTIMATE = 256 * 1024;

// The displayed value is deliberately an estimate. It uses Butano's generated
// resource objects whenever a temporary build exists, rather than adding raw
// source files to a finished .gba (which double-counts ROM). The exported GBA
// remains a separate confirmation and calibrates the engine baseline.
ipcMain.handle('get-project-resource-usage', (): { status: 'success' | 'error'; usage?: ProjectResourceUsage; message?: string } => {
  try {
    const root = originalProjectDirectory ?? directoryPathProject;
    if (!root) return { status: 'error', message: 'No project is currently open.' };
    const assets = path.join(root, 'assets');
    const sourceGraphics = ['backgrounds', 'backgrounds-hd', 'sprites', 'tilesets', 'avatars', 'emotes', 'fonts', 'ui']
      .reduce((total, folder) => total + sumDirectoryBytes(path.join(assets, folder)), 0);
    const sourceAudio = ['musics', 'sounds'].reduce((total, folder) => total + sumDirectoryBytes(path.join(assets, folder)), 0);
    const scripts = sumDirectoryBytes(path.join(root, 'scripts')) + sumDirectoryBytes(path.join(root, 'data', 'scripts'));
    const binary = newestGbaSize(path.join(root, 'build'));
    const temporaryBuild = getTemporaryBuildDirectory();
    const buildObjects = path.join(temporaryBuild, 'build');
    const generatedGraphics = sumMatchingFiles(buildObjects, name => /_bn_gfx\.o$/i.test(name));
    const generatedAudio = fs.existsSync(path.join(buildObjects, 'bn_audio_soundbank.bin'))
      ? fs.statSync(path.join(buildObjects, 'bn_audio_soundbank.bin')).size
      : 0;
    const hasBuildEstimate = generatedGraphics > 0 || generatedAudio > 0;
    const graphics = hasBuildEstimate ? generatedGraphics : sourceGraphics;
    const audio = hasBuildEstimate ? generatedAudio : sourceAudio;
    const estimatedContent = graphics + audio + scripts;
    // A confirmed ROM improves the static engine term, but never becomes the
    // displayed estimate itself. This keeps the bar useful before Build.
    const engine = binary > estimatedContent
      ? Math.max(ENGINE_ROM_BASE_ESTIMATE, binary - estimatedContent)
      : ENGINE_ROM_BASE_ESTIMATE;
    const usage = { binary, engine, graphics, audio, scripts, total: engine + estimatedContent, source: hasBuildEstimate ? 'build' as const : 'assets' as const, measuredAt: Date.now() };
    return { status: 'success', usage };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
});

// Handle get project path - files from Frontend
ipcMain.handle('save-image', async (event, { filePath, filename, data }) => {
  try {
    const pathToSave = filePath || originalProjectDirectory;
    const uploadDir = path.join(pathToSave, 'assets', 'backgrounds'); // Diretório de destino
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const destinationPath = path.join(uploadDir, filename);

    // Escreve o arquivo no disco
    fs.writeFileSync(destinationPath, data, 'base64');

    // Copia para projeto temporario
    fs.copyFileSync(destinationPath, path.join(directoryPathProject || originalProjectDirectory || '', 'assets', 'backgrounds', filename));

    return { status: 'success', message: destinationPath };
  } catch (error) {
    console.error('Error saving image:', error);
    return { status: 'error', message: '>> Error saving image.' };
  }
});

// Handle fetch images from assets folder
ipcMain.handle('fetch-images', async (event, folderName) => {
  return startWatch(windows.main, originalProjectDirectory, folderName);
});

ipcMain.handle('get-common-font-images', async () => {
  const filenames = [
    'common_fixed_8x8_font.bmp',
    'common_fixed_8x16_font.bmp',
    'common_variable_8x8_font.bmp',
    'common_variable_8x16_font.bmp',
    'common_variable_16x16_font.bmp',
  ];
  const roots = [
    path.resolve(__dirname, '..', '..', 'tools', 'butano', 'common', 'graphics'),
    path.join(process.resourcesPath, 'bin', 'tools', 'butano', 'common', 'graphics'),
  ];
  const result: Record<string, string> = {};
  for (const filename of filenames) {
    const source = roots.map(root => path.join(root, filename)).find(candidate => fs.existsSync(candidate));
    if (!source) continue;
    result[filename] = `data:image/bmp;base64,${fs.readFileSync(source).toString('base64')}`;
  }
  return result;
});

ipcMain.handle('read-image-bytes', async (_event, source: string) => {
  if (!originalProjectDirectory) throw new Error('Project directory is unavailable.');
  const decodedSource = source.startsWith('local://')
    ? decodeURIComponent(source.replace('local://', ''))
    : source;
  const normalizedSource = /^[a-zA-Z](\\|\/)/.test(decodedSource)
    ? decodedSource.replace(/^([a-zA-Z])(\\|\/)/, '$1:\\')
    : decodedSource;
  const assetRoot = path.resolve(originalProjectDirectory, 'assets') + path.sep;
  const assetPath = path.resolve(normalizedSource);
  if (!assetPath.startsWith(assetRoot)) throw new Error('Image source is outside project assets.');

  const image = await fs.promises.readFile(assetPath);
  return image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength);
});

ipcMain.handle('rename-asset', async (_event, folderName: string, filename: string, nextFilename: string) => {
  const allowedFolders = new Set(['backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
  if (!allowedFolders.has(folderName) || path.basename(filename) !== filename || path.basename(nextFilename) !== nextFilename) {
    return { status: 'error', message: 'Invalid asset name.' };
  }

  const sourceExtension = path.extname(filename).toLowerCase();
  if (!sourceExtension || path.extname(nextFilename).toLowerCase() !== sourceExtension) {
    return { status: 'error', message: 'The asset extension cannot be changed.' };
  }

  const roots = [originalProjectDirectory, directoryPathProject]
    .filter((root): root is string => Boolean(root))
    .filter((root, index, all) => all.indexOf(root) === index);
  const locations = roots.map(root => ({
    source: path.join(root, 'assets', folderName, filename),
    destination: path.join(root, 'assets', folderName, nextFilename),
  }));

  if (locations.length === 0 || !locations.some(location => fs.existsSync(location.source))) {
    return { status: 'error', message: 'Asset not found.' };
  }
  if (locations.some(location => fs.existsSync(location.destination) && path.resolve(location.source) !== path.resolve(location.destination))) {
    return { status: 'error', message: 'An asset with this name already exists.' };
  }

  try {
    locations.forEach(location => {
      if (fs.existsSync(location.source) && path.resolve(location.source) !== path.resolve(location.destination)) {
        fs.renameSync(location.source, location.destination);
      }
    });
    return { status: 'success', filename: nextFilename };
  } catch (error) {
    console.error('rename-asset error:', error);
    return { status: 'error', message: 'Unable to rename asset.' };
  }
});

const copyAssetsToProject = (folderName: string, sources: string[]) => {
  const sourceRoot = originalProjectDirectory;
  const activeRoot = directoryPathProject;
  if (!sourceRoot && !activeRoot) {
    return { status: 'error', message: 'No project is currently open.' };
  }

  const destinations = [sourceRoot, activeRoot]
    .filter((root): root is string => Boolean(root))
    .filter((root, index, roots) => roots.indexOf(root) === index)
    .map(root => path.join(root, 'assets', folderName));
  destinations.forEach(destination => fs.mkdirSync(destination, { recursive: true }));

  const imported: string[] = [];
  for (const source of sources) {
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const parsed = path.parse(source);
    let candidate = parsed.base;
    let suffix = 1;
    while (destinations.some(destination => fs.existsSync(path.join(destination, candidate)))) {
      candidate = `${parsed.name}-${suffix}${parsed.ext}`;
      suffix += 1;
    }
    destinations.forEach(destination => fs.copyFileSync(source, path.join(destination, candidate)));
    imported.push(candidate);
  }

  return { status: 'success', files: imported };
};

ipcMain.handle('import-assets', async (_event, folderName: string) => {
  const allowedFolders = new Set(['backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
  if (!allowedFolders.has(folderName)) {
    return { status: 'error', message: `Unsupported asset folder: ${folderName}` };
  }

  const importDialogOptions: Electron.OpenDialogOptions = {
    title: `Import assets into ${folderName}`,
    properties: ['openFile', 'multiSelections'],
  };
  const result = windows.main
    ? await dialog.showOpenDialog(windows.main, importDialogOptions)
    : await dialog.showOpenDialog(importDialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return { status: 'cancelled', files: [] };
  }

  return copyAssetsToProject(folderName, result.filePaths);
});

ipcMain.handle('import-dropped-assets', async (_event, folderName: string, filePaths: string[]) => {
  const allowedFolders = new Set(['backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
  if (!allowedFolders.has(folderName) || !Array.isArray(filePaths)) {
    return { status: 'error', message: `Unsupported asset import: ${folderName}` };
  }
  try {
    return copyAssetsToProject(folderName, filePaths);
  } catch (error) {
    console.error('import-dropped-assets error:', error);
    return { status: 'error', message: 'Unable to copy dropped assets.' };
  }
});

// Initialize IPC handlers for preferences and other functionalities
initializeIpcHandlers();
// ## Handle Preferences END ###########################################

// ## Handle Project File Operations ###################################
// Tools import and checks
ipcMain.handle('import-tools', async (event, toolsName: string, srcPath: string) => {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const toolsRoot = path.join(repoRoot, 'tools');
    if (!fs.existsSync(toolsRoot)) fs.mkdirSync(toolsRoot, { recursive: true });

    const dest = path.join(toolsRoot, toolsName);
    // Copy recursively
    const copyRecursive = (src: string, destPath: string) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
        const entries = fs.readdirSync(src);
        for (const e of entries) copyRecursive(path.join(src, e), path.join(destPath, e));
      } else {
        fs.copyFileSync(src, destPath);
      }
    };

    copyRecursive(srcPath, dest);
    return { success: true, message: `Imported ${toolsName}` };
  } catch (err) {
    console.error('import-tools error', err);
    return { success: false, message: String(err) };
  }
});
// ## Handle Project File Operations END ###############################
