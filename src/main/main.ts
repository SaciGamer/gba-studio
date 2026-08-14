import { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { dirname } from 'path'
import { fileURLToPath } from 'url';

import windowStateKeeper from 'electron-window-state';
import { getPreferences, updatePreferences, initializeDefaultPaths, getBuildConfig } from './handlers/preferenceHandlers';
import { prepareProjectSandbox, requestSaveChanges, setProjectDirectory, setProjectFile, waitForSaveComplete, copyDirectoryContents } from './services/saveSettingsService';
import { saveEvents } from './services/saveSettingsService';
import { createProjectStruct } from './structs/mainProjectStruct';
import menuTemplate from './menuTemplate';
import compileGBA from './utils/gbaCompiler/compile-gba';
import transcodeProject from './utils/projectTranscoder/transcode-project';
import initializeIpcHandlers from './controllers/HandlerController';
import { startWatch, stopAllWatchers } from './services/imagemService';
import { SettingsController } from './controllers/SettingsController';
import { setCurrentActiveSandboxDirectory } from './states/tempProjectState';

import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    }
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
    // notifica outras janelas
    BrowserWindow.getAllWindows().forEach(win => {
      try { win.webContents.send('emulator-started'); } catch {}
    });
  });

  windows.emulator.on('closed', () => {
    windows.emulator = null;
    BrowserWindow.getAllWindows().forEach(win => {
      try { win.webContents.send('emulator-stopped'); } catch {}
    });
  });
}

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

        return new Response(new Uint8Array(fileBuffer), {
          status: 200, // Success
          headers: { 'Content-Type': 'image/png' },
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
  server.use("/roms", express.static(romDir));
  server.listen(3000, () => {
    console.log("ROM server running at http://localhost:3000/roms");
  });

  createSplashWindow();
  // Launcher creation is handled by the splash screen (it will create/show launcher
  // if no startup project was provided). This avoids duplicating windows.
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
      requestSaveChanges();
      return true; // Permitir o fechamento
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
  
  stopAllWatchers();
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

function closeAllWindowsExcept(exceptWindow: BrowserWindow | null) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win !== exceptWindow) {
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

    closeAllWindowsExcept(null);
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

    BrowserWindow.getAllWindows().forEach((win) => {
      try {
        win.webContents.send('project-saved-as', {
          projectPathFile: saveAsName,
          projectDirectory: saveAsDirectory,
          projectName: saveAsProjectName,
        });
      } catch (e) {
        /* ignore */
      }
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
  console.log('..: run-live requested');
  try {
    if (!windows.main) return;

    const activeProjectDir = directoryPathProject || originalProjectDirectory || '';
    if (!activeProjectDir) {
      console.warn('run-live: no active project directory available');
      return;
    }

    requestSaveChanges({ persistToOriginal: false, markAsSaved: false, source: 'run-live' });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Save timeout for run-live')), 10000);
      saveEvents.once('saved', () => { clearTimeout(timeout); resolve(true); });
    });

    // Transcode project using the sandbox workspace directly
    const transRes: any = await transcodeProject({
      projectDir: activeProjectDir,
      includeAssets: true,
    });

    if (!transRes.success || !transRes.outputDir) {
      throw new Error(`Transcode failed: ${transRes.message}`);
    }

    const tempBuild = transRes.outputDir;

    // Notify renderer that transcode finished and compilation will start
    try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Transcodificação concluída.' })); } catch (e) {}

    // Compile with new parameter-based interface (use saved build config)
    const prefsRunLive = getPreferences();
    const buildCfg = getBuildConfig();
    let compileRes = await compileGBA({
      buildDir: tempBuild,
      devkitPath: prefsRunLive.devkitPath,
      parallel: buildCfg?.parallel,
      optimizationLevel: buildCfg?.optimizationLevel as any,
      verbose: buildCfg?.verbose,
    });


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
  } catch (err) {
    console.error('run-live error', err);
  }
});
// ## RUN-LIVE END #####################################################

// ## COMPILE PROJECT  #################################################
ipcMain.on('compile-project', async (event)  => {
  // Implemente a lógica de compilação aqui
  console.log('..: Recebida solicitação para compilar o projeto :..');
  console.log('..: Compiling project...');
  try {
    // Ask renderer to save current project data to disk first
    requestSaveChanges({ source: 'build', persistToOriginal: false, markAsSaved: false });

    // Wait for save to complete (timeout 10s)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Save timeout')) , 10000);
      saveEvents.once('saved', () => { clearTimeout(timeout); resolve(true); });
    });

    // Transcode project files into path build before compiling
    try {
      // Notify renderer that transcode is starting
      try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Iniciando transcodificação do projeto...' })); } catch (e) {}

      // Transcode with new parameter-based interface
      const activeProjectDir = directoryPathProject || originalProjectDirectory || '';
      const transRes: any = await transcodeProject({
        projectDir: activeProjectDir,
        includeAssets: true,
      });

      // Compile using path build
      const tempBuild = transRes.outputDir;
      try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Transcodificação concluída.' })); } catch (e) {}

      // Compile with new parameter-based interface (use saved build config)
      {
        const prefsCompile = getPreferences();
        const buildCfg = getBuildConfig();
        let compileRes = await compileGBA({
          buildDir: tempBuild,
          devkitPath: prefsCompile.devkitPath,
          parallel: buildCfg?.parallel,
          optimizationLevel: buildCfg?.optimizationLevel as any,
          verbose: buildCfg?.verbose,
        });

        // On successful compile, copy outputs (.gba, .elf, .map) into project's build folder
        if (compileRes && compileRes.gbaPath) {
          const outDir = path.join(/*directoryPathProject ||*/ originalProjectDirectory || '', 'build');
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

          // Copy .gba
          try { fs.copyFileSync(compileRes.gbaPath, path.join(outDir, path.basename(compileRes.gbaPath))); } catch (e) { console.warn('Could not copy .gba to project build', e); }

          // Try to copy .elf and .map if present in same folder
          const possibleElf = compileRes.gbaPath.replace(/\.gba$/i, '.elf');
          const possibleMap = compileRes.gbaPath.replace(/\.gba$/i, '.map');
          try { if (fs.existsSync(possibleElf)) fs.copyFileSync(possibleElf, path.join(outDir, path.basename(possibleElf))); } catch (e) { console.warn('Could not copy .elf to project build', e); }
          try { if (fs.existsSync(possibleMap)) fs.copyFileSync(possibleMap, path.join(outDir, path.basename(possibleMap))); } catch (e) { console.warn('Could not copy .map to project build', e); }
        }

        return { success: true, message: compileRes };
      }
    } catch (e) {
      console.warn('Transcode/compile failed', e);
      return { success: false, message: e };
    }
  } catch (error) {
    console.log('..: Erro Compiling ' + error);
    return { success: false, message: error};
  }
});
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

// Handle get project path - files from Frontend
ipcMain.handle('save-image', async (event, { filePath, filename, data }) => {
  try {
    const pathToSave = filePath || directoryPathProject;
    const uploadDir = path.join(pathToSave, 'assets', 'backgrounds'); // Diretório de destino
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const destinationPath = path.join(uploadDir, filename);

    // Escreve o arquivo no disco
    fs.writeFileSync(destinationPath, data, 'base64');
    return { status: 'success', message: destinationPath };
  } catch (error) {
    console.error('Error saving image:', error);
    return { status: 'error', message: '>> Error saving image.' };
  }
});

// Handle fetch images from assets folder
ipcMain.handle('fetch-images', async (event, folderName) => {
  const assetsPath = path.join(directoryPathProject || originalProjectDirectory || '', 'assets', folderName);

  if (!fs.existsSync(assetsPath)) {
    return { status: 'error', message: '>> Directory not found.' };
  }

  // const targetUserDir = createUserPathTargetDir(folderName);
  return startWatch(windows.main, assetsPath/*, targetUserDir*/);
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