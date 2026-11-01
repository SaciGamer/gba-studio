import { SFX_LIMITS, LEGACY_SFX_MAX_FREQUENCY, generateSfx, isSfxWaveform, isSfxHarmonics } from '../shared/events/sfxGenerator';
import { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { dirname } from 'path'
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

import windowStateKeeper from 'electron-window-state';
import { getPreferences, updatePreferences, initializeDefaultPaths, getBuildConfig } from './handlers/preferenceHandlers';
import { prepareProjectSandbox, requestSaveChanges, setProjectDirectory, setProjectFile, waitForSaveComplete, copyDirectoryContents } from './services/saveSettingsService';
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

import { RuntimeMonitorWindow, registerRuntimeMonitorIpc } from './managers/RuntimeMonitorWindow';
import express from 'express';
import { CompileResult } from './utils/types/BuildTypes';
import { readTrackerProjectDescriptor, readTrackerProjectForBuild } from './utils/builders/TrackerProjectPackage';
import { resolveProjectImagePath } from './utils/projectImagePath';

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
  runtimeMonitor: BrowserWindow | null;
  about: BrowserWindow | null;
}

// Window management
export const windows: Windows = {
  splash: null,
  launcher: null,
  main: null,
  emulator: null,
  runtimeMonitor: null,
  about: null
};

/** Send IPC only while the current editor window and its webContents are alive. */
export function sendMainWindowMessage(channel: string, payload: unknown): boolean {
  const target = windows.main;
  try {
    if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return false;
    target.webContents.send(channel, payload);
    return true;
  } catch {
    // The window can be torn down by Electron between lifecycle notifications.
    return false;
  }
}

const runtimeMonitor = new RuntimeMonitorWindow({
  preloadPath,
  iconPath,
  rendererUrl: isDev
    ? 'http://localhost:5173#/runtime-monitor'
    : `file://${path.join(__dirname, '../renderer', 'index.html')}#/runtime-monitor`,
  onWindowChange: window => { windows.runtimeMonitor = window; },
});
registerRuntimeMonitorIpc(ipcMain, runtimeMonitor);

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

  const engineWindow = windows.main;

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

  let closeDecisionPending = false;
  engineWindow.on('close', async (event) => {
    if (mainWindowIsClosing) {
      console.log('..: O fechamento já está em andamento.');
      return; // Evita chamadas repetitivas
    }

    event.preventDefault(); // Impede o fechamento imediato
    if (closeDecisionPending) return;
    closeDecisionPending = true;

    try {
      const mayClose = await handleWindowClose(engineWindow);
      if (!mayClose) {
        closeDecisionPending = false;
        console.log('..: createProjectWindow Fluxo interrompido. O fechamento da janela foi cancelado.');
        return; // Interrompe o fluxo
      }

      mainWindowIsClosing = true;
      await clearWatchers();
      if (!engineWindow.isDestroyed()) engineWindow.close();
    } catch (error) {
      closeDecisionPending = false;
      mainWindowIsClosing = false;
      console.error('..: Falha ao fechar a janela Engine; mantendo-a aberta.', error);
    }
  });

  engineWindow.on('closed', () => {
    if (windows.main === engineWindow) windows.main = null;
    // The emulator is a child of the current Engine session. Close it with
    // that session so diagnostic Maxmod ROMs cannot remain visible after the
    // editor window exits (and their temporary ROM is removed by its handler).
    const emulatorWindow = windows.emulator;
    if (emulatorWindow && !emulatorWindow.isDestroyed()) {
      try {
        emulatorWindow.close();
      } catch (error) {
        console.warn('Unable to close the emulator after the Engine window closed:', error);
      }
    }
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

function launchEmulatorWindow(romPath: string, cleanupFileOnClose?: string, emulatorSettings?: Record<string, unknown>) {
  if (windows.emulator) {
    windows.emulator.close();
    windows.emulator = null;
  }

  windows.emulator = new BrowserWindow({
    width: 720,
    height: 480,
    useContentSize: true,
    show: false, // Don't show the window until it's ready
    autoHideMenuBar: true,
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

  const emulatorWindow = windows.emulator;
  let emulatorWindowClosing = false;
  let pendingTopUpdate: NodeJS.Immediate | null = null;
  const keepEmulatorOnTop = () => {
    pendingTopUpdate = null;
    if (emulatorWindowClosing || emulatorWindow.isDestroyed()) return;
    try {
      if (!emulatorWindow.isVisible() || emulatorWindow.isMinimized()) return;
      emulatorWindow.setAlwaysOnTop(true, 'floating');
      // Raise the window without taking keyboard focus from the other app.
      emulatorWindow.moveTop();
    } catch (error) {
      // Electron can destroy the native window between the lifecycle check and
      // either native call. Ignore only that teardown race; keep other errors visible.
      if (!emulatorWindowClosing && !emulatorWindow.isDestroyed()) {
        console.warn('Unable to keep the emulator window on top:', error);
      }
    }
  };
  const deferKeepEmulatorOnTop = () => {
    if (emulatorWindowClosing || emulatorWindow.isDestroyed() || pendingTopUpdate) return;
    pendingTopUpdate = setImmediate(keepEmulatorOnTop);
  };
  emulatorWindow.on('show', deferKeepEmulatorOnTop);
  emulatorWindow.on('restore', deferKeepEmulatorOnTop);
  emulatorWindow.on('blur', deferKeepEmulatorOnTop);
  emulatorWindow.on('always-on-top-changed', (_event, isAlwaysOnTop) => {
    if (!isAlwaysOnTop) deferKeepEmulatorOnTop();
  });

  runtimeMonitor.attach(emulatorWindow);
  windows.emulator?.setMenu(null);
  windows.emulator?.setMenuBarVisibility(false);

  // passa o caminho da ROM via query string ou IPC
  const settingsQuery = emulatorSettings
    ? `&settings=${Buffer.from(JSON.stringify(emulatorSettings)).toString('base64url')}`
    : '';
  windows.emulator.loadURL(
    isDev
    ? `http://localhost:5173#emulator?rom=${encodeURIComponent(romPath)}${settingsQuery}`
    : `file://${path.join(__dirname, '../renderer', 'index.html')}#/emulator?rom=${encodeURIComponent(romPath)}${settingsQuery}`
  );

  // Carregar modo de desenvolvedor
  if (isDev) {
    windows.emulator?.webContents.openDevTools();
  }

  windows.emulator?.once('ready-to-show', () => {
    emulatorWindow.show();
    keepEmulatorOnTop();
    // notifica main to start emulator
    sendMainWindowMessage('emulator-started', undefined);
  });

  windows.emulator.once('close', () => {
    emulatorWindowClosing = true;
    if (pendingTopUpdate) clearImmediate(pendingTopUpdate);
    pendingTopUpdate = null;
  });

  windows.emulator.on('closed', () => {
    emulatorWindowClosing = true;
    if (pendingTopUpdate) clearImmediate(pendingTopUpdate);
    pendingTopUpdate = null;
    const wasCurrentEmulator = windows.emulator === emulatorWindow;
    if (wasCurrentEmulator) windows.emulator = null;
    if (cleanupFileOnClose && /^tracker-preview-\d+\.gba$/.test(path.basename(cleanupFileOnClose))) {
      try { fs.rmSync(cleanupFileOnClose, { force: true }); } catch (error) { console.warn('Unable to remove temporary tracker preview ROM:', error); }
    }
    if (wasCurrentEmulator) sendMainWindowMessage('emulator-stopped', undefined);
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
  for (const filename of fs.readdirSync(romDir)) {
    if (/^tracker-preview-\d+\.gba$/.test(filename)) {
      try { fs.rmSync(path.join(romDir, filename), { force: true }); } catch (error) { console.warn('Unable to remove stale tracker preview ROM:', error); }
    }
  }
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
  if (projectSwitchInProgress) return;
  projectSwitchInProgress = true;
  try {
  if (windows.launcher) {
    console.log('..: Fechando Launcher')
    // Native closing is animated on Windows. Hide first so restoring the
    // editor's application menu cannot repaint a strip on the closing launcher.
    windows.launcher.hide();
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

  // A build writes to a shared temporary directory. Stop and fully release it
  // before the next project's editor can start another Play/build operation.
  await stopBuildForProjectSwitch();

  // Stop subscriptions from the previous project before changing the global
  // source and sandbox paths. The old BrowserWindow is intentionally closed
  // from this flow, so its regular close handler does not clear these.
  await clearWatchers();
  
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

  let cartridgeImage: string | null = null;
  try {
    const projectMetadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    cartridgeImage = typeof projectMetadata.cartridgeImage === 'string' ? projectMetadata.cartridgeImage : null;
  } catch { /* Older or not-yet-created project files use the default cartridge. */ }
  updatePreferences('recentProjects', { title: file, path: directory, hasCartridgeImage: Boolean(cartridgeImage), cartridgeImage });

  createProjectWindow(filePath);
  } catch (error) {
    console.error('loadProject error', error);
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow(null, false);
  } finally {
    projectSwitchInProgress = false;
  }
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
  if (process.platform !== 'darwin' && !projectSwitchInProgress) {
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

  if (projectSwitchInProgress) return;
  projectSwitchInProgress = true;
  try {
    await stopBuildForProjectSwitch();
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
    await clearWatchers();
    setProjectWorkspacePaths(newSandbox, targetProjectDirectory);
    setProjectFile(saveAsName);

    windows.main?.webContents.send('project-saved-as', {
      projectPathFile: saveAsName,
      projectDirectory: saveAsDirectory,
      projectName: saveAsProjectName,
    });

    let cartridgeImage: string | null = null;
    try {
      const projectMetadata = JSON.parse(fs.readFileSync(targetProjectFilePath, 'utf8'));
      cartridgeImage = typeof projectMetadata.cartridgeImage === 'string' ? projectMetadata.cartridgeImage : null;
    } catch { /* Keep recent project metadata usable if an older project has no settings yet. */ }
    updatePreferences('recentProjects', { title: saveAsName, path: saveAsDirectory, hasCartridgeImage: Boolean(cartridgeImage), cartridgeImage });
  } catch (err) {
    console.error('save-project-as error', err);
  } finally {
    projectSwitchInProgress = false;
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
  if (!beginBuild()) return;
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
    sendMainWindowMessage('compile-error', error);
  } finally {
    finishBuild();
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
let projectSwitchInProgress = false;
let activeBuildCompletion: Promise<void> | null = null;
let resolveActiveBuildCompletion: (() => void) | null = null;

function beginBuild(): boolean {
  if (buildInProgress || projectSwitchInProgress) return false;
  buildInProgress = true;
  buildStopRequested = false;
  activeBuildCompletion = new Promise<void>(resolve => { resolveActiveBuildCompletion = resolve; });
  return true;
}

function finishBuild(): void {
  buildInProgress = false;
  resolveActiveBuildCompletion?.();
  resolveActiveBuildCompletion = null;
  activeBuildCompletion = null;
  sendMainWindowMessage('compile-progress', {
    status: 'finished',
    message: '>> Build encerrado.',
    messageKey: 'compiler.finished',
  });
}

async function stopBuildForProjectSwitch(): Promise<void> {
  if (!buildInProgress) return;
  buildStopRequested = true;
  const completion = activeBuildCompletion;
  sendMainWindowMessage('compile-progress', {
    status: 'running',
    message: '>> Cancelando build antes de trocar de projeto...',
  });
  await Promise.all([cancelActiveCompile(), cancelActiveAssetGeneration()]);
  await completion;
}

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
    const destinationDir = path.join(result.filePaths[0], 'build');
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.copyFileSync(sourceGba, path.join(destinationDir, `${name}.gba`));
    const sourceElf = sourceGba.replace(/\.gba$/i, '.elf');
    if (fs.existsSync(sourceElf)) fs.copyFileSync(sourceElf, path.join(destinationDir, `${name}.elf`));

    const projectRoots = [directoryPathProject, originalProjectDirectory]
      .filter((root): root is string => Boolean(root))
      .filter((root, index, all) => all.indexOf(root) === index);
    let cartridgeImage: string | null = null;
    for (const root of projectRoots) {
      const metadataPath = path.join(root, projectFile);
      if (!fs.existsSync(metadataPath)) continue;
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (typeof metadata.cartridgeImage === 'string' && path.basename(metadata.cartridgeImage) === metadata.cartridgeImage && /\.(png|jpe?g|webp)$/i.test(metadata.cartridgeImage)) {
          cartridgeImage = metadata.cartridgeImage;
          break;
        }
      } catch { /* An older project may not contain metadata. */ }
    }

    if (cartridgeImage) {
      const coverPath = projectRoots.map(root => path.join(root, 'assets', 'cartridge', cartridgeImage!)).find(candidate => fs.existsSync(candidate));
      if (coverPath) {
        const appRoot = app.getAppPath();
        const cartridgeAssets = [
          path.join(appRoot, 'src', 'renderer', 'frontend', 'src', 'img'),
          path.join(process.resourcesPath ?? '', 'bin', 'cartridge'),
        ];
        const findBundledAsset = (filename: string) => cartridgeAssets.map(directory => path.join(directory, filename)).find(candidate => fs.existsSync(candidate));
        const baseCartridge = findBundledAsset('CartuchoGBA.png');
        const cartridgeShell = findBundledAsset('CartuchoGBASemFundo.png');
        const magickCandidates = [
          path.join(appRoot, 'bin', 'image-magick', 'magick.exe'),
          path.join(process.resourcesPath ?? '', 'bin', 'image-magick', 'magick.exe'),
        ];
        const magick = magickCandidates.find(candidate => fs.existsSync(candidate));
        if (baseCartridge && cartridgeShell && magick) {
          const output = path.join(destinationDir, `${name}-cartridge-cover.png`);
          await execFileAsync(magick, [
            baseCartridge,
            '(', coverPath, '-auto-orient', '-resize', '170x87^', '-gravity', 'center', '-extent', '170x87', '+repage', ')',
            '-gravity', 'northwest', '-geometry', '+34+33', '-compose', 'over', '-composite',
            cartridgeShell, '-gravity', 'northwest', '-geometry', '+0+0', '-compose', 'over', '-composite', `PNG32:${output}`,
          ], { windowsHide: true });
        } else {
          console.warn('export-executable: cartridge cover composition assets are unavailable');
        }
      }
    }
    return { success: true, filePath: destinationDir };
  }
  catch (error) { return { success: false, message: `Não foi possível exportar o executável: ${error instanceof Error ? error.message : String(error)}` }; }
}));

ipcMain.on('stop-build', async () => {
  try {
    if (!buildInProgress) {
      sendMainWindowMessage('compile-error', { message: 'Não há compilação Butano em execução.' });
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
      sendMainWindowMessage('compile-progress', {
        status: 'running',
        message: '>> Cancelamento solicitado; aguardando a etapa atual.',
      });
      return;
    }

    clearTemporaryBuildDirectory();
    sendMainWindowMessage('compile-error', {
      message: 'Compilação cancelada e diretório temporário limpo.',
      cancelled: true,
    });
  } catch (error) {
    console.error('Unable to stop build', error);
    sendMainWindowMessage('compile-error', { message: String(error) });
  }
});

ipcMain.on('compile-project', async (event)  => {
  if (!beginBuild()) return;
  console.log('..: Compiling project...');
  try {
    const compileRes = await transcodeAndCompile();

    return { success: true, message: compileRes };
  } catch (error) {
    console.error('Transcode/compile error ', error);
    sendMainWindowMessage('compile-error', error);
  } finally {
    finishBuild();
  }
});

async function transcodeAndCompile(): Promise<CompileResult> {
  if (!windows.main) return { success: false, stdout: '', stderr: '' };

  requestSaveChanges({ source: 'build', persistToOriginal: false, markAsSaved: false });
  await waitForSaveComplete();
  
  // Notify renderer that transcode is starting
  sendMainWindowMessage('compile-progress', { status: 'started', message: '>> Iniciando transcodificação do projeto...', messageKey: 'compiler.transcodeStarted' });

  const activeProjectDir = directoryPathProject || originalProjectDirectory || '';
  if (!activeProjectDir) {
    console.warn('transcodeAndCompile: no active project directory available');
    return { success: false, stdout: '', stderr: '' };
  }

  // Transcode project using the sandbox workspace directly
  const buildCfg = getBuildConfig();
  const transRes: any = await transcodeProject({
    projectDir: activeProjectDir,
    markerProjectDir: originalProjectDirectory || activeProjectDir,
    parallel: buildCfg?.parallel,
    includeAssets: true,
    onProgress: (message, messageKey, messageParams) => sendMainWindowMessage('compile-progress', { status: 'running', message, messageKey, messageParams }),
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
  sendMainWindowMessage('compile-progress', { status: 'started', message: '>> Transcodificação concluída.', messageKey: 'compiler.transcodeFinished' });

  // Compile with new parameter-based interface (use saved build config)
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

ipcMain.handle('save-generated-sprite-image', async (_event, { filename, data }) => {
  try {
    if (typeof filename !== 'string' || path.basename(filename) !== filename || !/^[a-zA-Z0-9_-]+\.png$/i.test(filename)) {
      return { status: 'error', message: 'Invalid generated sprite filename.' };
    }
    if (typeof data !== 'string' || !data.length) return { status: 'error', message: 'Generated sprite image is empty.' };
    const roots = [originalProjectDirectory, directoryPathProject]
      .filter((root): root is string => Boolean(root))
      .filter((root, index, all) => all.indexOf(root) === index);
    if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
    const destinations = roots.map(root => path.join(root, 'assets', 'sprites'));
    destinations.forEach(directory => fs.mkdirSync(directory, { recursive: true }));
    const paths = destinations.map(directory => path.join(directory, filename));
    if (paths.some(file => fs.existsSync(file))) return { status: 'error', message: 'A sprite with this filename already exists.' };
    const image = Buffer.from(data, 'base64');
    if (!image.length) return { status: 'error', message: 'Generated sprite image is empty.' };
    paths.forEach(file => fs.writeFileSync(file, image));
    return { status: 'success', filename };
  } catch (error) {
    console.error('Error saving generated sprite image:', error);
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
});

// Handle fetch images from assets folder
ipcMain.handle('fetch-images', async (event, folderName) => {
  return startWatch(windows.main, originalProjectDirectory, folderName);
});

ipcMain.handle('delete-project-sound', async (_event, filename: string, projectSource: boolean) => {
  if (typeof filename !== 'string' || !filename || filename.includes('\0') || path.basename(filename) !== filename
    || typeof projectSource !== 'boolean' || !(projectSource ? /\.gbasfx$/i : /\.(wav|raw|mp3|ogg)$/i).test(filename)) {
    return { status: 'error', message: 'Invalid sound filename.' };
  }
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  try {
    for (const root of roots) {
      const directory = path.resolve(root, projectSource ? 'project' : 'assets', 'sounds');
      const filenamePath = path.resolve(directory, filename);
      if (!filenamePath.startsWith(directory + path.sep)) return { status: 'error', message: 'Invalid sound path.' };
      await fs.promises.rm(filenamePath, { force: true });
    }
    return { status: 'success' };
  } catch (error) {
    console.error('delete-project-sound error:', error);
    return { status: 'error', message: 'Unable to delete sound file.' };
  }
});

ipcMain.handle('delete-project-music-asset', async (_event, filename: string) => {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || !/\.(mp3|wav|mod|xm|s3m|it|mid|midi)$/i.test(filename)) return { status: 'error', message: 'Invalid music filename.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  for (const root of roots) {
    const musicPath = path.resolve(root, 'assets', 'musics', filename);
    const musicRoot = path.resolve(root, 'assets', 'musics') + path.sep;
    if (!musicPath.startsWith(musicRoot)) return { status: 'error', message: 'Invalid music path.' };
    await fs.promises.rm(musicPath, { force: true });
    if (/\.xm$/i.test(filename)) await fs.promises.rm(path.resolve(root, 'music-source', `${path.parse(filename).name}.gbasong.json`), { force: true });
    await fs.promises.rm(path.resolve(root, 'music-source', `${filename}.metadata.json`), { force: true });
  }
  return { status: 'success' };
});

const normalizeTrackerProjectRelativePath = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  const segments = value.replace(/\\/g, '/').split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9_-]{1,120}(?:\.[A-Za-z0-9_-]+)*$/i.test(segment))) return null;
  if (!segments.at(-1)?.toLowerCase().endsWith('.gbatracker')) return null;
  return segments.join('/');
};
const musicMetadataPath = (root: string, filename: string) => {
  const projectPath = normalizeTrackerProjectRelativePath(filename);
  return projectPath
    ? path.resolve(root, 'project', 'musics', ...projectPath.split('/')) + '.metadata.json'
    : path.resolve(root, 'music-source', `${filename}.metadata.json`);
};

ipcMain.handle('write-music-note-clipboard', (_event, text: unknown) => {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) return false;
  clipboard.writeText(text);
  return true;
});
ipcMain.handle('read-music-note-clipboard', () => {
  const text = clipboard.readText();
  return text.length <= 2 * 1024 * 1024 ? text : '';
});

ipcMain.handle('load-music-metadata', async (_event, filename: string) => {
  const projectPath = typeof filename === 'string' ? normalizeTrackerProjectRelativePath(filename) : null;
  if (typeof filename !== 'string' || (projectPath ? projectPath !== filename : path.basename(filename) !== filename || !/\.(mp3|wav|mod|xm|s3m|it|mid|midi)$/i.test(filename))) return { status: 'error', message: 'Invalid music filename.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  for (const root of roots) {
    try {
      const data = JSON.parse(await fs.promises.readFile(musicMetadataPath(root, filename), 'utf8'));
      if (data?.schema === 'gba-studio/music-metadata' && data.version === 1 && data.filename === filename) return { status: 'success', artist: typeof data.artist === 'string' ? data.artist : '', instruments: data.instruments && typeof data.instruments === 'object' ? data.instruments : {}, channelInstrumentTypes: data.channelInstrumentTypes && typeof data.channelInstrumentTypes === 'object' ? data.channelInstrumentTypes : {}, channelSettings: data.channelSettings && typeof data.channelSettings === 'object' ? data.channelSettings : {} };
    } catch { /* Metadata is optional. */ }
  }
  return { status: 'success', artist: '', instruments: {}, channelInstrumentTypes: {}, channelSettings: {} };
});

ipcMain.handle('save-music-metadata', async (_event, filename: string, metadata: { artist?: unknown; instruments?: unknown; channelInstrumentTypes?: unknown; channelSettings?: unknown }) => {
  const projectPath = typeof filename === 'string' ? normalizeTrackerProjectRelativePath(filename) : null;
  if (!metadata || typeof metadata !== 'object' || typeof filename !== 'string' || (projectPath ? projectPath !== filename : path.basename(filename) !== filename || !/\.(mp3|wav|mod|xm|s3m|it|mid|midi)$/i.test(filename)) || (!('artist' in metadata) && !('instruments' in metadata) && !('channelInstrumentTypes' in metadata) && !('channelSettings' in metadata))) return { status: 'error', message: 'Invalid music metadata.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  try {
    for (const root of roots) {
      const metadataPath = musicMetadataPath(root, filename);
      await fs.promises.mkdir(path.dirname(metadataPath), { recursive: true });
      let previous: any = {};
      try { previous = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8')); } catch { /* Start a metadata document when none exists. */ }
      const instruments = metadata.instruments && typeof metadata.instruments === 'object' && !Array.isArray(metadata.instruments)
        ? Object.fromEntries(Object.entries(metadata.instruments as Record<string, Record<string, { color?: unknown }>>).filter(([type, ids]) => ['Duty', 'Wave', 'Noise'].includes(type) && ids && typeof ids === 'object' && !Array.isArray(ids)).map(([type, ids]) => [type, Object.fromEntries(Object.entries(ids).filter(([key, value]) => /^\d{1,2}$/.test(key) && value && typeof value === 'object').map(([key, value]) => [key, { color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#59c7b3' }]))]))
        : previous.instruments ?? {};
      const channelInstrumentTypes = metadata.channelInstrumentTypes && typeof metadata.channelInstrumentTypes === 'object' && !Array.isArray(metadata.channelInstrumentTypes)
        ? Object.fromEntries(Object.entries(metadata.channelInstrumentTypes as Record<string, unknown>).filter(([key, type]) => /^\d{1,2}$/.test(key) && ['Duty', 'Wave', 'Noise'].includes(String(type))))
        : previous.channelInstrumentTypes ?? {};
      const channelSettings = metadata.channelSettings && typeof metadata.channelSettings === 'object' && !Array.isArray(metadata.channelSettings)
        ? Object.fromEntries(Object.entries(metadata.channelSettings as Record<string, any>).filter(([key, value]) => /^\d{1,2}$/.test(key) && Number(key) < 32 && value && typeof value === 'object').map(([key, value]) => [key, {
          ...(typeof value.name === 'string' ? { name: value.name.trim().slice(0, 64) } : {}),
          ...(['Any', 'Duty', 'Wave', 'Noise', 'Other'].includes(value.instrumentType) ? { instrumentType: value.instrumentType } : {}),
          ...(typeof value.hidden === 'boolean' ? { hidden: value.hidden } : {}),
        }])) : previous.channelSettings ?? {};
      const document = { schema: 'gba-studio/music-metadata', version: 1, filename, artist: typeof metadata.artist === 'string' ? metadata.artist.trim().slice(0, 120) : (typeof previous.artist === 'string' ? previous.artist : ''), instruments, channelInstrumentTypes, channelSettings };
      const temporary = `${metadataPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        await fs.promises.writeFile(temporary, JSON.stringify(document, null, 2), { encoding: 'utf8', flag: 'wx' });
        if (fs.existsSync(metadataPath)) await fs.promises.copyFile(metadataPath, `${metadataPath}.bak`);
        await fs.promises.rename(temporary, metadataPath);
      } finally {
        await fs.promises.rm(temporary, { force: true });
      }
    }
    return { status: 'success' };
  } catch (error) {
    console.error('save-music-metadata error:', error);
    return { status: 'error', message: 'Unable to save music metadata.' };
  }
});

const cartridgeImageMimeTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

ipcMain.handle('select-cartridge-image', async () => {
  if (!originalProjectDirectory && !directoryPathProject) return { status: 'error', message: 'No project is currently open.' };
  const result = windows.main
    ? await dialog.showOpenDialog(windows.main, { title: 'Select cartridge cover image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    : await dialog.showOpenDialog({ title: 'Select cartridge cover image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (result.canceled || !result.filePaths.length) return { status: 'cancelled' };

  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (!cartridgeImageMimeTypes[extension]) return { status: 'error', message: 'Unsupported image format.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  const destinations = roots.map(root => path.join(root, 'assets', 'cartridge'));
  destinations.forEach(destination => fs.mkdirSync(destination, { recursive: true }));
  const parsed = path.parse(source);
  let filename = parsed.base;
  let suffix = 1;
  while (destinations.some(destination => fs.existsSync(path.join(destination, filename)))) {
    filename = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }
  destinations.forEach(destination => fs.copyFileSync(source, path.join(destination, filename)));
  const data = fs.readFileSync(source).toString('base64');
  return { status: 'success', filename, dataUrl: `data:${cartridgeImageMimeTypes[extension]};base64,${data}` };
});

ipcMain.handle('get-cartridge-image', async (_event, projectDirectory: string | null | undefined, filename: string | null | undefined) => {
  if (!filename || path.basename(filename) !== filename || !/\.(png|jpe?g|webp)$/i.test(filename)) return null;
  const roots = projectDirectory
    ? [path.resolve(projectDirectory)]
    : [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root));
  for (const root of roots) {
    const imagePath = path.resolve(root, 'assets', 'cartridge', filename);
    const relative = path.relative(path.resolve(root, 'assets', 'cartridge'), imagePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(imagePath)) continue;
    const mimeType = cartridgeImageMimeTypes[path.extname(filename).toLowerCase()];
    return `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`;
  }
  return null;
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
  const assetPath = resolveProjectImagePath(source, [originalProjectDirectory, directoryPathProject]);

  const image = await fs.promises.readFile(assetPath);
  return image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength);
});

ipcMain.handle('load-music-editor-source', async (_event, filename: string) => {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || path.extname(filename).toLowerCase() !== '.xm') return null;
  const parsed = path.parse(filename);
  const roots = [originalProjectDirectory, directoryPathProject]
    .filter((root): root is string => Boolean(root))
    .filter((root, index, all) => all.indexOf(root) === index);
  for (const root of roots) {
    const sourcePath = path.resolve(root, 'music-source', `${parsed.name}.gbasong.json`);
    const sourceRoot = path.resolve(root, 'music-source') + path.sep;
    if (!sourcePath.startsWith(sourceRoot) || !fs.existsSync(sourcePath)) continue;
    try {
      const source = JSON.parse(await fs.promises.readFile(sourcePath, 'utf8'));
      if (source?.schema === 'gba-studio/music-source' && source.version === 1
        && source.format === 'XM' && source.assetFileName === filename) return source;
    } catch (error) {
      console.warn('Unable to read Music Editor source document:', error);
    }
  }
  return null;
});

ipcMain.handle('list-tracker-projects', async () => {
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  const files = new Set<string>();
  const projects = new Map<string, { filename: string; id: string; format: string }>();
  for (const root of roots) {
    const directory = path.resolve(root, 'project', 'musics');
    const visit = async (current: string, relative = '') => {
      try {
        for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
          const name = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await visit(path.join(current, entry.name), name);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gbatracker')) {
            files.add(name);
            try {
              const parsed = readTrackerProjectDescriptor(await fs.promises.readFile(path.join(current, entry.name)), name);
              projects.set(name, { filename: name, id: parsed.id, format: parsed.format });
            } catch { /* Keep invalid files visible in the music library for repair. */ }
          }
        }
      } catch { /* Missing folders are an empty project library. */ }
    };
    await visit(directory);
  }
  return { status: 'success', files: [...files].sort((left, right) => left.localeCompare(right)), projects: [...projects.values()].sort((left, right) => left.filename.localeCompare(right.filename)) };
});

ipcMain.handle('load-tracker-project', async (_event, filename: string) => {
  const relativePath = normalizeTrackerProjectRelativePath(filename);
  if (!relativePath) return { status: 'error', message: 'Invalid GBA Tracker project filename.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  for (const root of roots) {
    const projectRoot = path.resolve(root, 'project', 'musics') + path.sep;
    const source = path.resolve(root, 'project', 'musics', ...relativePath.split('/'));
    const sourceRoot = path.resolve(root, 'project', 'musics') + path.sep;
    if (!source.startsWith(projectRoot) || !source.startsWith(sourceRoot)) continue;
    try {
      const bytes = await fs.promises.readFile(source);
      return { status: 'success', data: bytes.toString('base64') };
    } catch { /* Check the next configured project root. */ }
  }
  return { status: 'error', message: 'GBA Tracker project was not found.' };
});

ipcMain.handle('delete-tracker-project', async (_event, filename: string) => {
  const relativePath = normalizeTrackerProjectRelativePath(filename);
  if (!relativePath) return { status: 'error', message: 'Invalid GBA Tracker project filename.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  for (const root of roots) {
    const musicRoot = path.resolve(root, 'project', 'musics');
    const projectRoot = `${musicRoot}${path.sep}`;
    const target = path.resolve(musicRoot, ...relativePath.split('/'));
    if (!target.startsWith(projectRoot)) return { status: 'error', message: 'Invalid GBA Tracker project path.' };
    await fs.promises.rm(target, { force: true });
    await fs.promises.rm(`${target}.metadata.json`, { force: true });
  }
  return { status: 'success' };
});

ipcMain.handle('rename-tracker-project', async (_event, filename: string, nextFilename: string) => {
  const sourceRelative = normalizeTrackerProjectRelativePath(filename);
  const requestedRelative = normalizeTrackerProjectRelativePath(nextFilename);
  if (!sourceRelative || !requestedRelative) return { status: 'error', message: 'Invalid GBA Tracker project filename.' };
  if (sourceRelative === requestedRelative) return { status: 'success', filename: sourceRelative };
  const sourceParts = path.posix.parse(sourceRelative);
  const requestedParts = path.posix.parse(requestedRelative);
  const folderParent = sourceParts.dir ? path.posix.dirname(sourceParts.dir) : '';
  let destinationFolder = path.posix.join(folderParent, requestedParts.name);
  let destinationRelative = path.posix.join(destinationFolder, requestedParts.base);
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  const projectsRoot = (root: string) => path.resolve(root, 'project', 'musics');
  const resolvePaths = () => roots.map(root => {
    const base = projectsRoot(root);
    const source = path.resolve(base, ...sourceRelative.split('/'));
    const destination = path.resolve(base, ...destinationRelative.split('/'));
    const rootPrefix = `${base}${path.sep}`;
    const sourceDirectory = path.dirname(source);
    const destinationDirectory = path.dirname(destination);
    return { source, destination, sourceDirectory, destinationDirectory, moveDirectory: sourceDirectory !== base && sourceDirectory !== destinationDirectory, safe: source.startsWith(rootPrefix) && destination.startsWith(rootPrefix) && destinationDirectory.startsWith(rootPrefix) };
  });
  let paths = resolvePaths();
  if (!paths.length || paths.some(item => !item.safe)) return { status: 'error', message: 'Invalid GBA Tracker project path.' };
  const existing = paths.filter(item => fs.existsSync(item.source));
  if (!existing.length) return { status: 'error', message: 'GBA Tracker project was not found.' };
  let suffix = 1;
  while (paths.some(item => fs.existsSync(item.destination) && item.source.toLowerCase() !== item.destination.toLowerCase()
    || fs.existsSync(item.destinationDirectory) && item.sourceDirectory.toLowerCase() !== item.destinationDirectory.toLowerCase()
      && (!fs.statSync(item.destinationDirectory).isDirectory() || fs.readdirSync(item.destinationDirectory).length > 0))) {
    const ending = `_${suffix++}`;
    destinationFolder = path.posix.join(folderParent, `${requestedParts.name.slice(0, 120 - ending.length)}${ending}`);
    destinationRelative = path.posix.join(destinationFolder, requestedParts.base);
    paths = resolvePaths();
  }
  const renamePaths = paths.filter(item => fs.existsSync(item.source));
  const rollback: Array<() => Promise<unknown>> = [];
  const move = async (source: string, destination: string) => {
    if (source === destination) return;
    await fs.promises.rename(source, destination);
    rollback.push(() => fs.promises.rename(destination, source));
  };
  try {
    for (const item of renamePaths) {
      if (item.moveDirectory) {
        if (fs.existsSync(item.destinationDirectory) && item.sourceDirectory.toLowerCase() !== item.destinationDirectory.toLowerCase()) {
          await fs.promises.rmdir(item.destinationDirectory);
          rollback.push(() => fs.promises.mkdir(item.destinationDirectory));
        }
        await move(item.sourceDirectory, item.destinationDirectory);
      }
      else if (!fs.existsSync(item.destinationDirectory)) {
        await fs.promises.mkdir(item.destinationDirectory);
        rollback.push(() => fs.promises.rmdir(item.destinationDirectory));
      }
      const currentSource = item.moveDirectory ? path.join(item.destinationDirectory, sourceParts.base) : item.source;
      await move(currentSource, item.destination);
      if (fs.existsSync(`${currentSource}.bak`)) await move(`${currentSource}.bak`, `${item.destination}.bak`);
      for (const metadataSuffix of ['.metadata.json', '.metadata.json.bak']) {
        const currentMetadata = `${currentSource}${metadataSuffix}`;
        const destinationMetadata = `${item.destination}${metadataSuffix}`;
        if (!fs.existsSync(currentMetadata)) continue;
        await move(currentMetadata, destinationMetadata);
        const previous = await fs.promises.readFile(destinationMetadata);
        const document = JSON.parse(previous.toString('utf8'));
        rollback.push(() => fs.promises.writeFile(destinationMetadata, previous));
        await fs.promises.writeFile(destinationMetadata, JSON.stringify({ ...document, filename: destinationRelative }, null, 2), 'utf8');
      }
    }
    return { status: 'success', filename: destinationRelative };
  } catch (error) {
    for (const undo of rollback.reverse()) {
      try { await undo(); } catch (rollbackError) { console.error('Unable to roll back tracker rename:', rollbackError); }
    }
    console.error('rename-tracker-project error:', error);
    return { status: 'error', message: 'Unable to rename GBA Tracker project.' };
  }
});

ipcMain.handle('save-tracker-project', async (_event, filename: string, data: string, overwriteExisting = false) => {
  const relativePath = normalizeTrackerProjectRelativePath(filename);
  if (!relativePath) return { status: 'error', message: 'Invalid GBA Tracker project filename.' };
  if (typeof data !== 'string' || !data || data.length > 720 * 1024 * 1024) return { status: 'error', message: 'GBA Tracker project is empty or too large.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  try {
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > 512 * 1024 * 1024) return { status: 'error', message: 'GBA Tracker project is empty or too large.' };
    const incoming = readTrackerProjectDescriptor(bytes, relativePath);
    const requested = path.posix.parse(relativePath);
    const requestedFolder = path.posix.join(requested.dir, requested.name);
    const packageFilename = `${requested.name}.gbatracker`;
    const projectsRoot = (root: string) => path.resolve(root, 'project', 'musics');
    const existingById = new Set<string>();
    for (const root of roots) {
      const musicRoot = projectsRoot(root);
      const visit = (directory: string, relative = '') => {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
          const child = path.join(directory, entry.name);
          if (entry.isDirectory()) visit(child, childRelative);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gbatracker')) {
            try {
              const descriptor = readTrackerProjectDescriptor(fs.readFileSync(child), childRelative);
              if (descriptor.id === incoming.id) existingById.add(childRelative);
            } catch { /* Keep invalid packages untouched; they cannot match a UUID. */ }
          }
        }
      };
      visit(musicRoot);
    }
    const updatingAtRequestedPath = existingById.has(relativePath);
    let folder = updatingAtRequestedPath ? requested.dir : requestedFolder;
    let suffix = 1;
    let actualRelativePath = updatingAtRequestedPath ? relativePath : path.posix.join(folder, packageFilename);
    while (roots.some(root => fs.existsSync(path.resolve(projectsRoot(root), ...actualRelativePath.split('/')))
      && !existingById.has(actualRelativePath))) {
      folder = `${requestedFolder}_${suffix++}`;
      actualRelativePath = path.posix.join(folder, packageFilename);
    }
    const destinations = roots.map(root => path.resolve(projectsRoot(root), ...actualRelativePath.split('/')));
    const transactionId = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const staged: Array<{ temporary: string; destination: string; backup?: string; committed?: boolean }> = [];
    try {
      for (const destination of destinations) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const temporary = `${destination}.${transactionId}.tmp`;
        fs.writeFileSync(temporary, bytes, { flag: 'wx' });
        staged.push({ temporary, destination });
      }
      for (const file of staged) {
        if (fs.existsSync(file.destination)) {
          let sameProject = false;
          try { sameProject = readTrackerProjectDescriptor(fs.readFileSync(file.destination), actualRelativePath).id === incoming.id; } catch { /* Corrupt or unrelated file. */ }
          if (!sameProject) throw new Error('A different GBA Tracker project already uses this path.');
          file.backup = `${file.destination}.${transactionId}.bak`;
          fs.renameSync(file.destination, file.backup);
        }
        fs.renameSync(file.temporary, file.destination);
        file.committed = true;
      }
      for (const file of staged) {
        if (file.backup) fs.copyFileSync(file.backup, `${file.destination}.bak`);
      }
      for (const file of staged) {
        if (!file.backup || !fs.existsSync(file.backup)) continue;
        try { fs.unlinkSync(file.backup); } catch { /* The committed project remains valid if stale backup cleanup fails. */ }
      }
      for (const duplicatePath of existingById) {
        if (duplicatePath === actualRelativePath) continue;
        for (const root of roots) {
          const duplicate = path.resolve(projectsRoot(root), ...duplicatePath.split('/'));
          try {
            if (readTrackerProjectDescriptor(fs.readFileSync(duplicate), duplicatePath).id === incoming.id) fs.unlinkSync(duplicate);
          } catch { /* A duplicate is removed only after its UUID is verified. */ }
        }
      }
    } catch (error) {
      for (const file of [...staged].reverse()) {
        if (file.backup && fs.existsSync(file.backup)) {
          if (fs.existsSync(file.destination)) fs.unlinkSync(file.destination);
          fs.renameSync(file.backup, file.destination);
        } else if (file.committed && fs.existsSync(file.destination)) fs.unlinkSync(file.destination);
        if (fs.existsSync(file.temporary)) fs.unlinkSync(file.temporary);
      }
      throw error;
    }
    return { status: 'success', filename: actualRelativePath };
  } catch (error) {
    console.error('save-tracker-project error:', error);
    return { status: 'error', message: 'Unable to save GBA Tracker project.' };
  }
});

ipcMain.handle('save-generated-sfx', async (_event, sourceFilename: string, sourceJson: string, wavFilename: string, wavData: string, mode: 'source' | 'wav' = 'source', overwriteExisting = false) => {
  const validName = (value: unknown, extension: string) => typeof value === 'string' && path.basename(value) === value
    && value.toLowerCase().endsWith(extension) && /^[A-Za-z0-9_]{1,64}\.[a-z]+$/i.test(value);
  if (!validName(sourceFilename, '.gbasfx') || !validName(wavFilename, '.wav')) return { status: 'error', message: 'Invalid SFX filename.' };
  if (typeof sourceJson !== 'string' || sourceJson.length > 32_000 || typeof wavData !== 'string' || wavData.length > 2_000_000) return { status: 'error', message: 'SFX data is empty or too large.' };
  let document: any;
  try { document = JSON.parse(sourceJson); } catch { return { status: 'error', message: 'SFX source document is invalid.' }; }
  const parameters = document?.parameters;
  if (document?.schema !== 'gba-studio/sfx' || document.version !== 1 || document.name !== path.parse(sourceFilename).name
    || !parameters || !isSfxWaveform(parameters.waveform) || !isSfxHarmonics(parameters.harmonics)
    || !Number.isFinite(parameters.frequency) || parameters.frequency < SFX_LIMITS.minFrequency || parameters.frequency > SFX_LIMITS.maxFrequency
    || !Number.isFinite(parameters.durationMs) || parameters.durationMs < SFX_LIMITS.minDurationMs || parameters.durationMs > SFX_LIMITS.maxDurationMs
    || !Number.isFinite(parameters.fadeOutMs) || parameters.fadeOutMs < 0 || parameters.fadeOutMs > parameters.durationMs
    || parameters.sampleRate !== 22_050
    || !Number.isInteger(parameters.seed) || parameters.seed < 0 || parameters.seed > 0xffffffff) return { status: 'error', message: 'SFX source document is invalid.' };
  const roots = [originalProjectDirectory, directoryPathProject].filter((root): root is string => Boolean(root)).filter((root, index, all) => all.indexOf(root) === index);
  if (!roots.length) return { status: 'error', message: 'No project is currently open.' };
  const wav = Buffer.from(wavData, 'base64');
  if (wav.length < 44 || wav.subarray(0, 4).toString('ascii') !== 'RIFF' || wav.subarray(8, 12).toString('ascii') !== 'WAVE'
    || wav.readUInt32LE(4) !== wav.length - 8 || wav.subarray(12, 16).toString('ascii') !== 'fmt ' || wav.subarray(36, 40).toString('ascii') !== 'data'
    || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== parameters.sampleRate
    || wav.readUInt32LE(28) !== parameters.sampleRate * 2 || wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16
    || wav.readUInt32LE(40) !== wav.length - 44 || wav.readUInt32LE(40) !== Math.round(parameters.durationMs * parameters.sampleRate / 1000) * 2) return { status: 'error', message: 'Exported WAV data is invalid.' };
  const pcmPeakLimit = Math.floor(0.85 * 32767);
  for (let offset = 44; offset < wav.length; offset += 2) if (Math.abs(wav.readInt16LE(offset)) > pcmPeakLimit) return { status: 'error', message: 'Exported WAV exceeds the SFX amplitude limit.' };
  if (!['source', 'wav'].includes(mode)) return { status: 'error', message: 'Invalid SFX save operation.' };
  if (mode === 'wav') {
    // Exports are independent snapshots. Exclusive creation also protects
    // against another export taking the selected filename concurrently.
    for (let suffix = 0; ; suffix++) {
      const filename = `${path.parse(wavFilename).name}${suffix ? `_${suffix}` : ''}.wav`;
      const destinations = roots.map(root => path.join(root, 'assets', 'sounds', filename));
      if (destinations.some(destination => fs.existsSync(destination))) continue;
      const created: string[] = [];
      try {
        for (const destination of destinations) {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, wav, { flag: 'wx' });
          created.push(destination);
        }
        return { status: 'success', mode, filename };
      } catch (error: any) {
        for (const destination of created) fs.rmSync(destination, { force: true });
        if (error?.code === 'EEXIST') continue;
        console.error('export-generated-sfx error:', error);
        return { status: 'error', message: 'Unable to export SFX WAV.' };
      }
    }
  }
  const writes = roots.map(root => ({
    destination: path.join(root, 'project', 'sounds', sourceFilename),
    contents: Buffer.from(JSON.stringify({ schema: document.schema, version: document.version, name: document.name, parameters }), 'utf8'),
  }));
  if (!overwriteExisting && writes.some(write => fs.existsSync(write.destination))) return { status: 'conflict', message: 'An SFX source or WAV with this name already exists.' };
  const transactionId = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  const staged: Array<{ temporary: string; destination: string; backup?: string; committed?: boolean }> = [];
  try {
    for (const write of writes) {
      fs.mkdirSync(path.dirname(write.destination), { recursive: true });
      const temporary = `${write.destination}.${transactionId}.tmp`;
      fs.writeFileSync(temporary, write.contents, { flag: 'wx' }); staged.push({ temporary, destination: write.destination });
    }
    for (const file of staged) {
      if (fs.existsSync(file.destination)) {
        if (!overwriteExisting) throw new Error('An SFX source or WAV with this name already exists.');
        file.backup = `${file.destination}.${transactionId}.bak`;
        fs.renameSync(file.destination, file.backup);
      }
      fs.renameSync(file.temporary, file.destination);
      file.committed = true;
    }
    for (const file of staged) {
      if (file.backup && file.destination.toLowerCase().endsWith('.gbasfx')) fs.copyFileSync(file.backup, `${file.destination}.bak`);
    }
    for (const file of staged) if (file.backup && fs.existsSync(file.backup)) { try { fs.rmSync(file.backup, { force: true }); } catch { /* The committed files are valid; retain the backup if cleanup is blocked. */ } }
    return { status: 'success', mode };
  } catch (error) {
    for (const file of [...staged].reverse()) {
      try {
        if (file.backup && fs.existsSync(file.backup)) {
          fs.rmSync(file.destination, { force: true });
          fs.renameSync(file.backup, file.destination);
        } else if (file.committed && fs.existsSync(file.destination)) fs.rmSync(file.destination, { force: true });
        fs.rmSync(file.temporary, { force: true });
      } catch { /* Preserve any backup that could not be restored. */ }
    }
    console.error('save-generated-sfx error:', error);
    return { status: 'error', message: 'Unable to save SFX source and WAV.' };
  }
});

ipcMain.handle('list-project-sfx', async () => {
  const root = originalProjectDirectory ?? directoryPathProject;
  if (!root) return { status: 'error', files: [] };
  const directory = path.resolve(root, 'project', 'sounds');
  try {
    const files = await fs.promises.readdir(directory);
    return { status: 'success', files: files.filter(filename => path.extname(filename).toLowerCase() === '.gbasfx' && path.basename(filename) === filename).sort((a, b) => a.localeCompare(b)) };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { status: 'success', files: [] };
    return { status: 'error', files: [] };
  }
});

ipcMain.handle('load-project-sfx', async (_event, filename: string) => {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || path.extname(filename).toLowerCase() !== '.gbasfx') return { status: 'error', message: 'Invalid SFX source filename.' };
  const root = originalProjectDirectory ?? directoryPathProject;
  if (!root) return { status: 'error', message: 'No project is currently open.' };
  try {
    const directory = path.resolve(root, 'project', 'sounds');
    const sourcePath = path.resolve(directory, filename);
    if (!sourcePath.startsWith(directory + path.sep)) return { status: 'error', message: 'Invalid SFX source path.' };
    const document = JSON.parse(await fs.promises.readFile(sourcePath, 'utf8'));
    const parameters = document?.parameters;
    if (document?.schema !== 'gba-studio/sfx' || document.version !== 1 || document.name !== path.parse(filename).name
      || !parameters || !isSfxWaveform(parameters.waveform) || !isSfxHarmonics(parameters.harmonics)
      || !Number.isFinite(parameters.frequency) || parameters.frequency < SFX_LIMITS.minFrequency || parameters.frequency > LEGACY_SFX_MAX_FREQUENCY
      || !Number.isFinite(parameters.durationMs) || parameters.durationMs < SFX_LIMITS.minDurationMs || parameters.durationMs > SFX_LIMITS.maxDurationMs
      || !Number.isFinite(parameters.fadeOutMs) || parameters.fadeOutMs < 0 || parameters.fadeOutMs > parameters.durationMs
      || parameters.sampleRate !== 22_050
      || !Number.isInteger(parameters.seed) || parameters.seed < 0 || parameters.seed > 0xffffffff) return { status: 'error', message: 'SFX source document is invalid.' };
    return { status: 'success', document: {
      schema: document.schema, version: document.version, name: document.name, parameters: generateSfx(parameters).parameters,
    } };
  } catch { return { status: 'error', message: 'Unable to read SFX source.' }; }
});

ipcMain.handle('play-tracker-module-preview', async (_event, data: string, rawSettings?: unknown, synchronizedStartValue?: unknown, capturePreEmulationValue?: unknown, captureMixerStateValue?: unknown, captureStartBlockValue?: unknown, captureAllMixerChannelsValue?: unknown, capturePlaybackPositionValue?: unknown, captureTrackerMarkerClockValue?: unknown, captureTrackerMarkerClockEndBlockValue?: unknown, captureBlockCountValue?: unknown, capturePlayOnceValue?: unknown, captureStartOrderValue?: unknown, captureStartRowValue?: unknown) => {
  if (typeof data !== 'string' || data.length === 0 || data.length > 48 * 1024 * 1024) {
    return { status: 'error', message: 'Tracker preview data is empty or too large.' };
  }
  const source = Buffer.from(data, 'base64');
  const isXm = source.length >= 80 && source.subarray(0, 17).toString('ascii') === 'Extended Module: ';
  const isS3m = source.length >= 48 && source.subarray(44, 48).toString('ascii') === 'SCRM';
  const isIt = source.length >= 4 && source.subarray(0, 4).toString('ascii') === 'IMPM';
  const modMagic = source.length >= 1084 ? source.subarray(1080, 1084).toString('ascii') : '';
  const isMod = new Set(['M.K.', 'M!K!', 'M&K!', 'N.T.', 'FLT4', 'FLT8', 'CD81', 'OKTA', '16CN', '32CN', '64CN']).has(modMagic)
    || /^\d{1,2}CHN$/.test(modMagic) || /^[1-9]\d{0,1}CH$/.test(modMagic);
  if (!isXm && !isS3m && !isIt && !isMod) {
    return { status: 'error', message: 'Maxmod ROM preview requires a valid MOD, XM, S3M, or IT module.' };
  }
  const devkitPro = process.env.DEVKITPRO;
  if (!devkitPro) return { status: 'error', message: 'DEVKITPRO is not configured, so the Maxmod preview cannot be built.' };
  const devkitArm = process.env.DEVKITARM || path.join(devkitPro, 'devkitARM');
  const mmutil = path.join(devkitPro, 'tools', 'bin', process.platform === 'win32' ? 'mmutil.exe' : 'mmutil');
  if (!fs.existsSync(mmutil)) return { status: 'error', message: 'Maxmod mmutil was not found in DEVKITPRO.' };

  const previewDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-tracker-preview-'));
  const sourceDirectory = path.join(previewDirectory, 'maxmod_data');
  const sourceExtension = isXm ? 'xm' : isS3m ? 's3m' : isIt ? 'it' : 'mod';
  const sourcePath = path.join(sourceDirectory, `music.${sourceExtension}`);
  const synchronizedStart = synchronizedStartValue === true;
  const capturePreEmulationAudio = capturePreEmulationValue === true;
  const captureMixerChannelState = captureMixerStateValue === true;
  const captureAllMixerChannels = captureAllMixerChannelsValue === true;
  const capturePlaybackPosition = capturePlaybackPositionValue === true;
  const captureTrackerMarkerClock = captureTrackerMarkerClockValue === true;
  const capturePlayOnce = capturePlayOnceValue === true;
  const captureStartBlock = Number.isInteger(captureStartBlockValue) ? Math.max(0, Math.min(20_000, Number(captureStartBlockValue))) : 0;
  const captureBlockCount = Number.isInteger(captureBlockCountValue) ? Math.max(30, Math.min(60, Number(captureBlockCountValue))) : 30;
  const captureStartOrder = Number.isInteger(captureStartOrderValue) ? Math.max(0, Math.min(0xffff, Number(captureStartOrderValue))) : 0;
  const captureStartRow = Number.isInteger(captureStartRowValue) ? Math.max(0, Math.min(0xff, Number(captureStartRowValue))) : 0;
  const captureStartPositionRequested = captureStartOrder !== 0 || captureStartRow !== 0;
  if (captureStartPositionRequested && !capturePreEmulationAudio) {
    return { status: 'error', message: 'Starting at a module order/row requires Maxmod pre-emulation capture.' };
  }
  const captureTrackerMarkerClockEndBlock = captureTrackerMarkerClock
    ? Math.max(captureStartBlock + captureBlockCount, Math.min(20_000, Number.isInteger(captureTrackerMarkerClockEndBlockValue) ? Number(captureTrackerMarkerClockEndBlockValue) : captureStartBlock + captureBlockCount))
    : captureStartBlock + captureBlockCount;
  if (capturePreEmulationAudio && !isDev) {
    return { status: 'error', message: 'Maxmod pre-emulation capture is available only in development builds.' };
  }
  if (captureMixerChannelState && (!capturePreEmulationAudio || !isDev)) {
    return { status: 'error', message: 'Maxmod mixer state capture requires the development pre-emulation audio capture.' };
  }
  const templateMakefile = path.join(devkitPro, 'examples', 'gba', 'audio', 'maxmod', 'basic_sound', 'Makefile');
  const butanoRoot = isDev
    ? path.resolve(__dirname, '../../tools/butano')
    : path.join(process.resourcesPath, 'bin', 'tools', 'butano');
  const maxmodSourceDirectory = path.join(butanoRoot, 'butano', 'hw', '3rd_party', 'maxmod');
  const makefilePath = path.join(previewDirectory, 'Makefile');
  const sourceFile = path.join(previewDirectory, 'source', 'MusicPreview.c');
  const outputPath = path.join(previewDirectory, `${path.basename(previewDirectory)}.gba`);
  let previewRomPath: string | null = null;
  try {
    if (!fs.existsSync(devkitArm) || !fs.existsSync(templateMakefile)) {
      return { status: 'error', message: 'The devkitPro GBA Maxmod example template was not found; check DEVKITARM and the installed examples.' };
    }
    if (!fs.existsSync(path.join(maxmodSourceDirectory, 'src', 'gba', 'mixer_asm.s'))
      || !fs.existsSync(path.join(maxmodSourceDirectory, 'src', 'core', 'mas.c'))
      || !fs.existsSync(path.join(maxmodSourceDirectory, 'include', 'maxmod.h'))) {
      return { status: 'error', message: 'The Butano Maxmod sources used by project builds are missing, so the reference ROM cannot be built with the project runtime.' };
    }
    const audioConfigPath = path.join(butanoRoot, 'butano', 'include', 'bn_config_audio.h');
    if (!fs.existsSync(audioConfigPath)) {
      return { status: 'error', message: 'The Butano audio configuration is missing, so the Maxmod reference ROM cannot match the project channel capacity.' };
    }
    const audioConfig = fs.readFileSync(audioConfigPath, 'utf8');
    const getDefaultAudioChannelCount = (name: string) => {
      const match = audioConfig.match(new RegExp(`#ifndef\\s+${name}\\s+#define\\s+${name}\\s+(\\d+)`));
      return match ? Number(match[1]) : NaN;
    };
    const maxmodChannelCount = getDefaultAudioChannelCount('BN_CFG_AUDIO_MAX_MUSIC_CHANNELS')
      + getDefaultAudioChannelCount('BN_CFG_AUDIO_MAX_SOUND_CHANNELS');
    if (!Number.isInteger(maxmodChannelCount) || maxmodChannelCount < 1 || maxmodChannelCount > 32) {
      return { status: 'error', message: 'The Butano Maxmod channel capacity is invalid for the GBA reference ROM.' };
    }
    if (captureAllMixerChannels && (!captureMixerChannelState || !capturePreEmulationAudio || !isDev)) {
      return { status: 'error', message: 'All-channel mixer-state capture requires the development pre-emulation and mixer-state captures.' };
    }
    if (capturePlaybackPosition && (!captureAllMixerChannels || !captureMixerChannelState || !capturePreEmulationAudio || !isDev || !(isMod || isS3m || isIt))) {
      return { status: 'error', message: 'Maxmod playback-position capture requires a development MOD, S3M, or IT all-channel pre-emulation capture.' };
    }
    if (captureTrackerMarkerClock && (!capturePlaybackPosition || !captureAllMixerChannels || !captureMixerChannelState || !capturePreEmulationAudio || !isDev || !(isS3m || isIt))) {
      return { status: 'error', message: 'Tracker marker-clock capture requires a development S3M or IT all-channel playback-position capture.' };
    }
    const captureMixerStateChannelCount = captureAllMixerChannels ? maxmodChannelCount : captureMixerChannelState ? 1 : 0;
    const captureClockStateBytes = capturePlaybackPosition ? 3 : 0;
    const captureTrackerMarkerClockCapacity = 1_024;
    const captureTrackerMarkerClockBytes = captureTrackerMarkerClock ? 2 + captureTrackerMarkerClockCapacity * 7 : 0;
    const captureBytes = 264 * captureBlockCount * 2 + captureBlockCount * (captureMixerStateChannelCount * 18 + captureClockStateBytes) + captureTrackerMarkerClockBytes;
    if (capturePreEmulationAudio && 16 + captureBytes > 38_400) {
      return { status: 'error', message: 'The Maxmod capture exceeds the GBA Mode 3 screenshot buffer.' };
    }
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourcePath, source);
    fs.cpSync(maxmodSourceDirectory, path.join(previewDirectory, 'maxmod'), { recursive: true });
    if (capturePreEmulationAudio) {
      const mixerPath = path.join(previewDirectory, 'maxmod', 'src', 'gba', 'mixer.c');
      const mixerSource = fs.readFileSync(mixerPath, 'utf8');
      const waveBufferDeclaration = 'static mm_addr mm_wavebuffer;';
      if (!synchronizedStart || !mixerSource.includes(waveBufferDeclaration)) {
        return { status: 'error', message: 'The Maxmod pre-emulation capture requires the synchronized harness and a recognized mixer source.' };
      }
      const singleMixerStateTap = captureMixerChannelState
        ? `, mm_byte *state)\n{\n    mm_addr left_start = (mm_addr)((uintptr_t)mp_writepos - mm_mixlen);\n    const mm_byte *left = (const mm_byte *)left_start;\n    const mm_byte *right = left + mm_mixlen * 2;\n    for(mm_word index = 0; index < mm_mixlen; ++index)\n    {\n        destination[index * 2] = left[index];\n        destination[index * 2 + 1] = right[index];\n    }\n    for(mm_word index = 0; index < 16; ++index) state[index] = 0;\n    for(mm_mixer_channel *channel = mm_mix_channels; channel < mm_mixch_end; ++channel)\n    {\n        if(!(channel->src & MIXCH_GBA_SRC_STOPPED))\n        {\n            const mm_word values[4] = { (mm_word)channel->src, channel->read, channel->freq, mm_ratescale };\n            for(mm_word valueIndex = 0; valueIndex < 4; ++valueIndex)\n                for(mm_word byteIndex = 0; byteIndex < 4; ++byteIndex) state[valueIndex * 4 + byteIndex] = (mm_byte)(values[valueIndex] >> (byteIndex * 8));
            state[16] = channel->vol;
            state[17] = channel->pan;\n            break;\n        }\n    }\n}`
        : `)\n{\n    mm_addr left_start = (mm_addr)((uintptr_t)mp_writepos - mm_mixlen);\n    const mm_byte *left = (const mm_byte *)left_start;\n    const mm_byte *right = left + mm_mixlen * 2;\n    for(mm_word index = 0; index < mm_mixlen; ++index)\n    {\n        destination[index * 2] = left[index];\n        destination[index * 2 + 1] = right[index];\n    }\n}`;
      const allMixerChannelsTap = captureAllMixerChannels
        ? `, mm_byte *state)\n{\n    mm_addr left_start = (mm_addr)((uintptr_t)mp_writepos - mm_mixlen);\n    const mm_byte *left = (const mm_byte *)left_start;\n    const mm_byte *right = left + mm_mixlen * 2;\n    for(mm_word index = 0; index < mm_mixlen; ++index)\n    {\n        destination[index * 2] = left[index];\n        destination[index * 2 + 1] = right[index];\n    }\n    for(mm_word channelIndex = 0; channelIndex < ${maxmodChannelCount}; ++channelIndex)\n    {\n        mm_byte *channelState = &state[channelIndex * 18];\n        for(mm_word byteIndex = 0; byteIndex < 18; ++byteIndex) channelState[byteIndex] = 0;\n        mm_mixer_channel *channel = &mm_mix_channels[channelIndex];\n        if(!(channel->src & MIXCH_GBA_SRC_STOPPED))\n        {\n            const mm_word values[4] = { (mm_word)channel->src, channel->read, channel->freq, mm_ratescale };\n            for(mm_word valueIndex = 0; valueIndex < 4; ++valueIndex)\n                for(mm_word byteIndex = 0; byteIndex < 4; ++byteIndex) channelState[valueIndex * 4 + byteIndex] = (mm_byte)(values[valueIndex] >> (byteIndex * 8));\n            channelState[16] = channel->vol;\n            channelState[17] = channel->pan;\n        }\n    }\n}`
        : singleMixerStateTap;
      const mixerStateTap = allMixerChannelsTap;
      const captureTap = `${waveBufferDeclaration}\n\n${captureMixerChannelState ? 'extern mm_mixer_channel *mm_mixch_end;\n\n' : ''}void trackerCopyLastMixedBlock(mm_byte *destination${mixerStateTap}`;
      fs.writeFileSync(mixerPath, mixerSource.replace(waveBufferDeclaration, captureTap));
    }
    let makefile = fs.readFileSync(templateMakefile, 'utf8');
    const makefileReplacements: Array<[RegExp, string]> = [
      [/^SOURCES\s*:=\s*source\s*$/m, 'SOURCES := source maxmod/src/core maxmod/src/gba'],
      [/^INCLUDES\s*:=\s*include\s*$/m, 'INCLUDES := include maxmod/include'],
      [/^LIBDIRS\s*:=\s*\$\(LIBGBA\)\s*$/m, 'LIBDIRS := $(CURDIR)/maxmod $(LIBGBA)'],
      [/^CFLAGS\s*\+=\s*\$\(INCLUDE\)\s*$/m, 'CFLAGS += $(INCLUDE) -I$(CURDIR)/maxmod/include -D__GBA__'],
      [/^LIBS\s*:=\s*-lmm\s+-lgba\s*$/m, 'LIBS := -lgba'],
    ];
    for (const [pattern, replacement] of makefileReplacements) {
      if (!pattern.test(makefile)) {
        return { status: 'error', message: 'The devkitPro example Makefile has an unsupported layout; cannot ensure the project Maxmod source is linked.' };
      }
      makefile = makefile.replace(pattern, replacement);
    }
    fs.writeFileSync(makefilePath, makefile);
    const playbackMode = capturePlayOnce ? 'MM_PLAY_ONCE' : 'MM_PLAY_LOOP';
    const captureStartPositionCode = captureStartPositionRequested ? `    mmSetPositionEx(${captureStartOrder}, ${captureStartRow});\n` : '';
    const moduleStartCode = synchronizedStart
      ? `    while(1) { VBlankIntrWait(); mmFrame(); scanKeys(); if(keysHeld() & KEY_A) { mmStart(MOD_MUSIC, ${playbackMode}); break; } }\n${captureStartPositionCode}`
      : `    mmStart(MOD_MUSIC, ${playbackMode});\n${captureStartPositionCode}`;
    const preEmulationCaptureSource = capturePreEmulationAudio
      ? `#define CAPTURE_BLOCKS 30\n#define CAPTURE_START_BLOCK ${captureStartBlock}\n#define CAPTURE_MARKER_CLOCK_END_BLOCK ${captureTrackerMarkerClockEndBlock}\n#define CAPTURE_FRAMES (264 * CAPTURE_BLOCKS)\n#define CAPTURE_BYTES (CAPTURE_FRAMES * 2)\n#define CAPTURE_STATE_BYTES ${captureMixerChannelState ? '18' : '0'}\n#define CAPTURE_CLOCK_BYTES ${capturePlaybackPosition ? '3' : '0'}\n#define CAPTURE_BLOCK_TRACE_BYTES (CAPTURE_STATE_BYTES + CAPTURE_CLOCK_BYTES)\n#define CAPTURE_TRACE_BYTES (CAPTURE_BLOCKS * CAPTURE_BLOCK_TRACE_BYTES)\n#define CAPTURE_MARKER_CLOCK_CAPACITY ${captureTrackerMarkerClockCapacity}\n#define CAPTURE_MARKER_CLOCK_BYTES ${captureTrackerMarkerClockBytes}\n#define CAPTURE_TOTAL_BYTES (CAPTURE_BYTES + CAPTURE_TRACE_BYTES + CAPTURE_MARKER_CLOCK_BYTES)\n#define CAPTURE_HEADER_BYTES 16\nstatic mm_byte trackerCapture[CAPTURE_TOTAL_BYTES] __attribute__((section(".sbss")));\nstatic mm_byte trackerCaptureHeader[CAPTURE_HEADER_BYTES] = { 'M', 'X', 'P', 'C', 0x98, 0x3d, 0, 0, (CAPTURE_FRAMES & 0xff), ((CAPTURE_FRAMES >> 8) & 0xff), ((CAPTURE_FRAMES >> 16) & 0xff), ((CAPTURE_FRAMES >> 24) & 0xff), 2, ${captureMixerChannelState ? '2' : '1'}, 0x08, 0x01 };\nextern void trackerCopyLastMixedBlock(mm_byte *destination${captureMixerChannelState ? ', mm_byte *state' : ''});\n${captureTrackerMarkerClock ? 'static mm_word trackerMarkerFrame; static mm_word trackerMarkerCount; static mm_byte trackerMarkerLastOrder = 0xff; static mm_byte trackerMarkerLastRow = 0xff; static void trackerCaptureMarkerClock(void) { ++trackerMarkerFrame; mm_byte order = (mm_byte)mmGetPosition(); mm_byte row = (mm_byte)mmGetPositionRow(); mm_byte tick = (mm_byte)mmGetPositionTick(); if(tick == 0 && (row & 15) == 0 && (order != trackerMarkerLastOrder || row != trackerMarkerLastRow) && trackerMarkerCount < CAPTURE_MARKER_CLOCK_CAPACITY) { mm_byte *entry = &trackerCapture[CAPTURE_BYTES + CAPTURE_TRACE_BYTES + 2 + trackerMarkerCount * 7]; entry[0] = (mm_byte)trackerMarkerFrame; entry[1] = (mm_byte)(trackerMarkerFrame >> 8); entry[2] = (mm_byte)(trackerMarkerFrame >> 16); entry[3] = (mm_byte)(trackerMarkerFrame >> 24); entry[4] = order; entry[5] = row; entry[6] = tick; ++trackerMarkerCount; trackerMarkerLastOrder = order; trackerMarkerLastRow = row; } } static void trackerCommitMarkerClock(void) { mm_byte *trace = &trackerCapture[CAPTURE_BYTES + CAPTURE_TRACE_BYTES]; trace[0] = (mm_byte)trackerMarkerCount; trace[1] = (mm_byte)(trackerMarkerCount >> 8); }' : ''}\nstatic void trackerShowCapture(void) { REG_DISPCNT = MODE_3 | BG2_ENABLE; volatile uint16_t *pixels = (volatile uint16_t *)VRAM; for(mm_word index = 0; index < CAPTURE_HEADER_BYTES + CAPTURE_TOTAL_BYTES; ++index) { mm_byte value = index < CAPTURE_HEADER_BYTES ? trackerCaptureHeader[index] : trackerCapture[index - CAPTURE_HEADER_BYTES]; mm_word red = value >> 3; mm_word green = (value & 7) << 2; pixels[index] = (uint16_t)(red | (green << 5)); } }\n`
      : '';
    const configuredPreEmulationCaptureSource = preEmulationCaptureSource.replace('#define CAPTURE_BLOCKS 30', `#define CAPTURE_BLOCKS ${captureBlockCount}`);
    const allChannelCaptureSource = captureAllMixerChannels
      ? configuredPreEmulationCaptureSource
        .replace('#define CAPTURE_STATE_BYTES 18', `#define CAPTURE_STATE_BYTES ${captureMixerStateChannelCount * 18}`)
        .replace(', 2, 2, 0x08, 0x01', ', 2, 3, 0x08, 0x01')
      : configuredPreEmulationCaptureSource;
    if (captureAllMixerChannels && allChannelCaptureSource === configuredPreEmulationCaptureSource) {
      return { status: 'error', message: 'The all-channel mixer capture source could not be configured.' };
    }
    const captureBlockCall = captureMixerChannelState
      ? `trackerCopyLastMixedBlock(&trackerCapture[block * 264 * 2], &trackerCapture[CAPTURE_BYTES + block * CAPTURE_BLOCK_TRACE_BYTES]);${capturePlaybackPosition ? ' { mm_byte *position = &trackerCapture[CAPTURE_BYTES + block * CAPTURE_BLOCK_TRACE_BYTES + CAPTURE_STATE_BYTES]; position[0] = (mm_byte)mmGetPosition(); position[1] = (mm_byte)mmGetPositionRow(); position[2] = (mm_byte)mmGetPositionTick(); }' : ''}`
      : 'trackerCopyLastMixedBlock(&trackerCapture[block * 264 * 2]);';
    const postStartCode = capturePreEmulationAudio
      ? `    for(mm_word block = 0; block < CAPTURE_START_BLOCK; ++block) { VBlankIntrWait(); mmFrame(); ${captureTrackerMarkerClock ? 'trackerCaptureMarkerClock(); ' : ''}}\n    for(mm_word block = 0; block < CAPTURE_BLOCKS; ++block) { VBlankIntrWait(); mmFrame(); ${captureTrackerMarkerClock ? 'trackerCaptureMarkerClock(); ' : ''}${captureBlockCall} }\n    ${captureTrackerMarkerClock ? `for(mm_word block = CAPTURE_START_BLOCK + CAPTURE_BLOCKS; block < CAPTURE_MARKER_CLOCK_END_BLOCK; ++block) { VBlankIntrWait(); mmFrame(); trackerCaptureMarkerClock(); } trackerCommitMarkerClock(); ` : ''}trackerShowCapture();\n    while(1) { VBlankIntrWait(); mmFrame(); }\n`
      : '    while(1) { VBlankIntrWait(); mmFrame(); }\n';
    fs.writeFileSync(sourceFile, `#include <gba.h>\n#include <maxmod.h>\n#include "soundbank.h"\n#include "soundbank_bin.h"\n${capturePreEmulationAudio ? 'extern void mmFrame(void);\n' : ''}\n${allChannelCaptureSource}\nint main(void) {\n    irqInit();\n    irqSet(IRQ_VBLANK, mmVBlank);\n    irqEnable(IRQ_VBLANK);\n    mmInitDefault((mm_addr)soundbank_bin, ${maxmodChannelCount});\n    mmSetModuleVolume(1024);\n${moduleStartCode}${postStartCode}}\n`);
    const bashPath = path.join(devkitPro, 'msys2', 'usr', 'bin', process.platform === 'win32' ? 'bash.exe' : 'bash');
    const makeDirectory = previewDirectory.replace(/^([A-Za-z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
    const quotedMakeDirectory = `'${makeDirectory.replace(/'/g, `'\\''`)}'`;
    // The devkitPro example Makefile uses one legacy pattern rule for both
    // `*.bin.o` and `*_bin.h`. Parallel make can run that recipe twice at once
    // and race while bin2s writes the shared header, so build this small
    // reference ROM serially for deterministic previews.
    await execFileAsync(bashPath, ['-lc', `cd ${quotedMakeDirectory} && make -j1`], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return { status: 'error', message: 'The Maxmod preview harness did not produce a GBA ROM.' };
    }
    let preEmulationMemory: { captureAddress: number; captureBytes: number; ewramStaticTail: number; captureStateChannels?: number; capturePlaybackPosition?: boolean; captureTrackerMarkerClock?: boolean } | undefined;
    if (capturePreEmulationAudio) {
      const elfPath = path.join(previewDirectory, `${path.basename(previewDirectory)}.elf`);
      const toolDirectory = path.join(devkitArm, 'bin');
      const [sectionsResult, symbolsResult] = await Promise.all([
        execFileAsync(path.join(toolDirectory, `arm-none-eabi-objdump${process.platform === 'win32' ? '.exe' : ''}`), ['-h', elfPath], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }),
        execFileAsync(path.join(toolDirectory, `arm-none-eabi-nm${process.platform === 'win32' ? '.exe' : ''}`), ['-S', '-C', elfPath], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }),
      ]);
      const allocatedSections = sectionsResult.stdout.split(/\r?\n/).flatMap((line, index, lines) => {
        const match = /^\s*\d+\s+(\S+)\s+([\da-f]+)\s+([\da-f]+)\s+[\da-f]+\s+[\da-f]+/i.exec(line);
        return match && /\bALLOC\b/.test(lines[index + 1] ?? '')
          ? [{ address: Number.parseInt(match[3], 16), size: Number.parseInt(match[2], 16) }]
          : [];
      }).filter(section => section.address < 0x02040000 && section.address + section.size > 0x02000000);
      const captureSymbol = symbolsResult.stdout.split(/\r?\n/).map(line => /^\s*([\da-f]+)\s+([\da-f]+)\s+[bB]\s+trackerCapture$/i.exec(line)).find(Boolean);
      if (!captureSymbol || allocatedSections.length === 0) {
        return { status: 'error', message: 'The Maxmod pre-emulation capture ELF is missing its EWRAM buffer or allocated memory sections.' };
      }
      const captureAddress = Number.parseInt(captureSymbol[1], 16);
      const captureBytes = Number.parseInt(captureSymbol[2], 16);
      const ewramStaticEnd = Math.max(...allocatedSections.map(section => section.address + section.size));
      const ewramStaticTail = Math.max(0, 0x02040000 - ewramStaticEnd);
      if (captureAddress < 0x02000000 || captureAddress + captureBytes > 0x02040000) {
        return { status: 'error', message: `The Maxmod pre-emulation capture buffer is outside physical GBA EWRAM: ${JSON.stringify({ captureAddress: `0x${captureAddress.toString(16)}`, captureBytes, ewramStaticEnd: `0x${ewramStaticEnd.toString(16)}`, ewramStaticTail })}.` };
      }
      preEmulationMemory = { captureAddress, captureBytes, ewramStaticTail, ...(captureMixerChannelState ? { captureStateChannels: captureMixerStateChannelCount } : {}), ...(capturePlaybackPosition ? { capturePlaybackPosition: true } : {}), ...(captureTrackerMarkerClock ? { captureTrackerMarkerClock: true } : {}) };
    }
    const romDirectory = path.join(app.getPath('userData'), 'gba-studio-play', 'roms');
    fs.mkdirSync(romDirectory, { recursive: true });
    const filename = `tracker-preview-${Date.now()}.gba`;
    previewRomPath = path.join(romDirectory, filename);
    fs.copyFileSync(outputPath, previewRomPath);
    const sourceSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings as Record<string, unknown> : {};
    const emulatorSettings = {
      demoFilter: typeof sourceSettings.demoFilter === 'string' ? sourceSettings.demoFilter.slice(0, 80) : '',
      demoShowFPS: sourceSettings.demoShowFPS === true,
      demoShowCPU: sourceSettings.demoShowCPU === true,
      demoShowMenu: sourceSettings.demoShowMenu === true,
      demoShowLicense: sourceSettings.demoShowLicense === true,
      demoAudioVolume: typeof sourceSettings.demoAudioVolume === 'number' && Number.isFinite(sourceSettings.demoAudioVolume)
        ? Math.min(1, Math.max(0, sourceSettings.demoAudioVolume))
        : 1,
      demoAudioMuted: sourceSettings.demoAudioMuted === true,
      demoJoystick: sourceSettings.demoJoystick && typeof sourceSettings.demoJoystick === 'object' ? sourceSettings.demoJoystick : null,
      controls: sourceSettings.controls && typeof sourceSettings.controls === 'object' ? sourceSettings.controls : {},
    };
    launchEmulatorWindow(`http://localhost:3000/roms/${filename}`, previewRomPath, emulatorSettings);
    return { status: 'success', message: 'The Maxmod preview ROM is running in the emulator.', ...(preEmulationMemory ? { preEmulationMemory: { ...preEmulationMemory, captureStartBlock } } : {}) };
  } catch (error) {
    if (previewRomPath) {
      try { fs.rmSync(previewRomPath, { force: true }); } catch (cleanupError) { console.warn('Unable to remove failed tracker preview ROM:', cleanupError); }
    }
    const buildOutput = error && typeof error === 'object'
      ? [Reflect.get(error, 'stderr'), Reflect.get(error, 'stdout')].filter(value => typeof value === 'string' && value.trim()).join('\n').trim()
      : '';
    const message = error instanceof Error ? error.message : 'Unknown Maxmod error.';
    const details = `${message}${buildOutput ? `\n${buildOutput}` : ''}`.slice(0, 1_200);
    return { status: 'error', message: `Unable to build the Maxmod preview: ${details}` };
  } finally {
    fs.rmSync(previewDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle('rename-asset', async (_event, folderName: string, filename: string, nextFilename: string) => {
  const allowedFolders = new Set(['auto-tiles', 'backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
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
    if (folderName === 'musics' && sourceExtension === '.xm') {
      roots.forEach(root => {
        const source = path.join(root, 'music-source', `${path.parse(filename).name}.gbasong.json`);
        const destination = path.join(root, 'music-source', `${path.parse(nextFilename).name}.gbasong.json`);
        if (!fs.existsSync(source)) return;
        const document = JSON.parse(fs.readFileSync(source, 'utf8'));
        document.assetFileName = nextFilename;
        fs.writeFileSync(destination, JSON.stringify(document, null, 2), 'utf8');
        if (path.resolve(source) !== path.resolve(destination)) fs.rmSync(source, { force: true });
      });
    }
    if (folderName === 'musics') {
      roots.forEach(root => {
        const source = path.resolve(root, 'music-source', `${filename}.metadata.json`);
        const destination = path.resolve(root, 'music-source', `${nextFilename}.metadata.json`);
        if (!fs.existsSync(source)) return;
        const document = JSON.parse(fs.readFileSync(source, 'utf8'));
        document.filename = nextFilename;
        fs.writeFileSync(destination, JSON.stringify(document, null, 2), 'utf8');
        if (path.resolve(source) !== path.resolve(destination)) fs.rmSync(source, { force: true });
      });
    }
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
  const allowedFolders = new Set(['auto-tiles', 'backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
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
  const allowedFolders = new Set(['auto-tiles', 'backgrounds', 'backgrounds-hd', 'avatars', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui']);
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
