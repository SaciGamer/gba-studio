import { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import isDev from 'electron-is-dev';
import { dirname } from 'path'
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import windowStateKeeper from 'electron-window-state';
import { getPreferences, updatePreferences, initializeDefaultPaths, getBuildConfig } from './handlers/preferenceHandlers';
import { requestSaveChanges, setProjectDirectory, setProjectFile } from './services/saveSettingsService';
import { saveEvents } from './services/saveSettingsService';
import { createProjectStruct } from './structs/mainProjectStruct';
import menuTemplate from './menuTemplate';
// import { loadSettings } from './services/loadSettingsService';
import compileGBA from './utils/gbaCompiler/compile-gba';
import transcodeProject from './utils/projectTranscoder/transcode-project';
import initializeIpcHandlers from './controllers/HandlerController';
import { startWatch, stopAllWatchers } from './services/imagemService';
import { SettingsController } from './controllers/SettingsController';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const preloadPath = path.join(__dirname, 'preload', 'preload.js');
const iconPath = path.join(app.getAppPath(), 'icon', 'defaultImgIcon.png');

const packageJsonPath = isDev
  ? path.resolve(__dirname, '../../package.json') // Em dev, busca na raiz do projeto
  : path.join(app.getAppPath(), 'package.json');  // Em produção, usa o app.getAppPath()

export const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
export let directoryPathProject: any;

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
  about: BrowserWindow | null;
}

// Window management
export const windows: Windows = {
  splash: null,
  launcher: null,
  main: null,
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
  windows.main?.on('blur', () => {
    windows.main?.webContents.send('window-blurred');
  });

  // Detecta quando a janela ganha o foco
  windows.main?.on('focus', () => {
    windows.main?.webContents.send('window-focused');
  });

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
  
  // await loadSettings(filePath);

  const file = path.basename(filePath);
  const directory = path.dirname(filePath);

  directoryPathProject = setProjectDirectory(directory);
  setProjectFile(file);

  console.log('..: File:', file);
  console.log('..: Directory:', directory);

  updatePreferences('recentProjects', { title: file  , path: directory});

  createProjectWindow(filePath);
};

// Função para iniciar o Emulador
function launchEmulator(romPath: string) {
  console.log("..: Iniciando Emulação :..");
  const prefs = getPreferences();
  const prefEmu = (prefs && (prefs as any).emulatorPath) ? (prefs as any).emulatorPath : '';

  // Prefer project-local tools/mGBA
  const repoRoot = path.resolve(__dirname, '..', '..');
  const toolsMgba1 = path.join(repoRoot, 'tools', 'mGBA', 'mGBA.exe');
  const toolsMgba2 = path.join(repoRoot, 'tools', 'mGBA', 'mgba.exe');
  const bundledVba = path.join(__dirname, 'emulator', 'visualboyadvance-m.exe');

  let emulatorExec = '';
  if (fs.existsSync(toolsMgba1)) emulatorExec = toolsMgba1;
  else if (fs.existsSync(toolsMgba2)) emulatorExec = toolsMgba2;
  else if (prefEmu && fs.existsSync(prefEmu)) emulatorExec = prefEmu;
  else emulatorExec = bundledVba;

  romPath = path.join(__dirname, romPath);
  console.log(`..: Using emulator: ${emulatorExec}`);
  console.log(`..: diretorio do projeto: ${romPath}`);
  const emulator = spawn(emulatorExec, [romPath]);
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

// Track emulator process so we can stop it from the IDE
let emulatorProcess: any = null;

function launchEmulatorAndTrack(romPath: string) {
  // Launch and keep reference
  const proc = spawn(((): string => {
    const prefs = getPreferences();
    const prefEmu = (prefs && (prefs as any).emulatorPath) ? (prefs as any).emulatorPath : '';

    // Prefer project-local tools/mGBA
    const repoRoot = path.resolve(__dirname, '..', '..');
    const toolsMgba1 = path.join(repoRoot, 'tools', 'mGBA', 'mGBA.exe');
    const toolsMgba2 = path.join(repoRoot, 'tools', 'mGBA', 'mgba.exe');
    const bundledVba = path.join(__dirname, 'emulator', 'visualboyadvance-m.exe');

    if (fs.existsSync(toolsMgba1)) return toolsMgba1;
    if (fs.existsSync(toolsMgba2)) return toolsMgba2;
    if (prefEmu && fs.existsSync(prefEmu)) return prefEmu;
    return bundledVba;
  })(), [romPath]);

  emulatorProcess = proc;

  // Notify renderer
  BrowserWindow.getAllWindows().forEach(win => {
    try { win.webContents.send('emulator-started'); } catch (e) { }
  });

  proc.on('close', (code) => {
    emulatorProcess = null;
    BrowserWindow.getAllWindows().forEach(win => {
      try { win.webContents.send('emulator-stopped'); } catch (e) { }
    });
  });

  proc.stdout?.on('data', (d) => console.log('Emu:', d.toString()));
  proc.stderr?.on('data', (d) => console.error('Emu-err:', d.toString()));
  return proc;
}

ipcMain.on('stop-emulator', (event) => {
  if (emulatorProcess) {
    try { emulatorProcess.kill(); } catch (e) { console.warn('Failed to stop emulator', e); }
  }
});

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

// Run using serialized project from renderer (no save requested)
ipcMain.on('run-live', async (event) => {
  console.log('..: run-live requested');
  try {
    if (!windows.main) return;
    // Ask renderer to provide serialized project via a global helper that FE should implement
    const resp = await windows.main.webContents.executeJavaScript('window.__getSerializedProject ? window.__getSerializedProject() : null');
    if (!resp) {
      console.warn('Renderer did not provide serialized project');
      return;
    }

    // Write the serialized data to a temp folder here (same logic as send-serialized handler)
    const tmpRoot = path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-serialized');
    if (fs.existsSync(tmpRoot))
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });

    if (resp.projectFiles) {
      resp.projectFiles.forEach((f: any) => {
        const target = path.join(tmpRoot, f.path);
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, JSON.stringify(f.content, null, 2), 'utf8');
      });
    }

    if (resp.assets) {
      resp.assets.forEach((a: any) => {
        const target = path.join(tmpRoot, a.path);
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, Buffer.from(a.base64, 'base64'));
      });
    }

    // const tmpPath = tmpRoot;

    // Transcode project with new parameter-based interface
    const transRes: any = await transcodeProject({
      projectDir: directoryPathProject,
      includeAssets: true,
    });
    const tempBuild = transRes.outputDir;

    // Notify renderer that transcode finished and compilation will start
    try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Transcodificação concluída.' })); } catch (e) {}

    // Compile with new parameter-based interface (use saved build config)
    const prefsRunLive = getPreferences();
    const buildCfg = getBuildConfig();
    const compileRes = await compileGBA({
      buildDir: tempBuild,
      devkitPath: prefsRunLive.devkitPath,
      parallel: buildCfg?.parallel,
      optimizationLevel: buildCfg?.optimizationLevel as any,
      verbose: buildCfg?.verbose,
    });

    if (compileRes && compileRes.gbaPath) {
      // For Play, copy the generated .gba into a temp location and launch that
      const playTmp = path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-play');
      if (fs.existsSync(playTmp)) fs.rmSync(playTmp, { recursive: true, force: true });
      fs.mkdirSync(playTmp, { recursive: true });
      const destGba = path.join(playTmp, path.basename(compileRes.gbaPath));
      try { fs.copyFileSync(compileRes.gbaPath, destGba); } catch (e) { console.warn('Could not copy gba to play tmp', e); }
      const rel = path.relative(__dirname, destGba);
      launchEmulatorAndTrack(rel);
    } else {
      console.warn('run-live: compile did not produce a .gba');
    }
  } catch (err) {
    console.error('run-live error', err);
  }
});

ipcMain.on('compile-project', async (event)  => {
  // Implemente a lógica de compilação aqui
  console.log('..: Recebida solicitação para compilar o projeto :..');
  console.log('..: Compiling project...');
  try {
    // Ask renderer to save current project data to disk first
    requestSaveChanges();

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
      const transRes: any = await transcodeProject({
        projectDir: directoryPathProject,
        includeAssets: true,
      });

      // Compile using path build
      const tempBuild = transRes.outputDir;
      try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Transcodificação concluída.' })); } catch (e) {}

      // Compile with new parameter-based interface (use saved build config)
      {
        const prefsCompile = getPreferences();
        const buildCfg = getBuildConfig();
        const compileRes = await compileGBA({
          buildDir: tempBuild,
          devkitPath: prefsCompile.devkitPath,
          parallel: buildCfg?.parallel,
          optimizationLevel: buildCfg?.optimizationLevel as any,
          verbose: buildCfg?.verbose,
        });

        // On successful compile, copy outputs (.gba, .elf, .map) into project's build folder
        if (compileRes && compileRes.gbaPath) {
          const outDir = path.join(directoryPathProject, 'build');
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

ipcMain.handle('compile-project-demo', async (event, projectPath) => {
    try {
    // Ensure latest FE data is saved
    requestSaveChanges();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Save timeout')) , 10000);
      saveEvents.once('saved', () => { clearTimeout(timeout); resolve(true); });
    });
  console.log('..: compile-project-demo for', projectPath);
  try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Iniciando compilação demo...' })); } catch (e) {}
    
    // Resolve temp build path: use preference if set, otherwise use OS tmpdir
    const prefs = getPreferences();
    const tempBuildPreference = prefs.tempBuildPath;
    const tempBuild = tempBuildPreference && fs.existsSync(tempBuildPreference)
      ? path.join(tempBuildPreference, 'gba-studio-build')
      : path.join(os.tmpdir(), 'gba-project-temp', 'gba-studio-build');

    // Clean temp
    if (fs.existsSync(tempBuild)) {
      fs.rmSync(tempBuild, { recursive: true, force: true });
    }
    fs.mkdirSync(tempBuild, { recursive: true });

    // Copy project files into path build (look for main.c or any .c in project folder)
    try {
      const projectSrc = path.join(projectPath);
      if (fs.existsSync(projectSrc)) {
        const copyRecursive = (src: string, dest: string) => {
          const stat = fs.statSync(src);
          if (stat.isDirectory()) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
            const entries = fs.readdirSync(src);
            for (const e of entries) {
              copyRecursive(path.join(src, e), path.join(dest, e));
            }
          } else {
            const ext = path.extname(src).toLowerCase();
            if (['.c', '.h', '.s', '.o', '.bin', '.data', '.txt'].includes(ext) || ext === '') {
              fs.copyFileSync(src, dest);
            }
          }
        };

        // Try to copy project's 'project' folder or root
        const candidate1 = path.join(projectPath, 'project');
        const candidate2 = projectPath;
        if (fs.existsSync(candidate1)) copyRecursive(candidate1, tempBuild);
        else copyRecursive(candidate2, tempBuild);
      }
    } catch (err) {
      console.warn('Could not copy project files for demo compile:', err);
    }

    // Now run compileGBA which will pick up repo gba-project
    try { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('compile-progress', { status: 'started', message: '>> Iniciando compilação demo (repo gba-project)...' })); } catch (e) {}
    const buildCfg = getBuildConfig();
    const result = await compileGBA({
      buildDir: path.join(__dirname, '..', '..', 'gba-project'),
      devkitPath: prefs.devkitPath,
      parallel: buildCfg?.parallel,
      optimizationLevel: buildCfg?.optimizationLevel as any,
      verbose: buildCfg?.verbose,
    });

    // Auto-launch using returned path
    try {
      if (result && result.gbaPath) {
        const rel = path.relative(__dirname, result.gbaPath);
        launchEmulator(rel);
      }
    } catch (err) {
      console.warn('Could not auto-launch emulator after demo compile:', err);
    }

    return { success: true, message: result };
  } catch (error) {
    console.error('Demo compile error', error);
    return { success: false, message: error };
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

// Recebendo o arquivo do frontend
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

// Pegar caminho das imagens do projeto
ipcMain.handle('fetch-images', async (event, folderName) => {
  const assetsPath = path.join(directoryPathProject, 'assets', folderName);

  if (!fs.existsSync(assetsPath)) {
    return { status: 'error', message: '>> Directory not found.' };
  }

  // const targetUserDir = createUserPathTargetDir(folderName);
  return startWatch(windows.main, assetsPath/*, targetUserDir*/);
});

initializeIpcHandlers();
// ## Handle Preferences END ###########################################

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

ipcMain.handle('check-tools-exe', async (event, toolsName: string, exeRelativePath: string) => {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const toolsExe = path.join(repoRoot, 'tools', toolsName, exeRelativePath);
    return fs.existsSync(toolsExe);
  } catch (err) {
    console.error('check-tools-exe error', err);
    return false;
  }
});

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