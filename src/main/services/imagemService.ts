
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { directoryPathProject } from '@/main';

// const targetDir = path.join(app.getAppPath(), 'project_user', 'user_assets');
let targetDir: any;

const debounceInterval = 100;

// Pegar caminho completo da imagem
const getFullPathImages = (files: any, assetsPath: string) => {
  // Retorna o caminho completo de cada arquivo
  const fullPaths = files.map((file: any) => path.join(assetsPath, file));
  console.log('..: fetch-images:', fullPaths);
}

const preparePathForFrontend = (filePath: string) => {
  // Normalizar o caminho (ajusta barras e outros detalhes para o SO)
  const normalizedPath = path.normalize(filePath);

  // Substituir barras invertidas (\) por barras normais (/)
  const formattedPath = normalizedPath.replace(/\\/g, '/');

  // Codificar espaços e caracteres especiais
  return encodeURI(`local://${formattedPath}`);
};


// Função para sincronizar arquivos incrementalmente
// AssetLibraryEditor uses the same IPC endpoint for images, music and sound
// effects.  The old image-only filter made the audio screens always empty even
// when assets existed in assets/musics or assets/sounds.
const isAssetFile = (filename: string) => [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',
  '.wav', '.mp3', '.ogg', '.mod', '.xm', '.s3m', '.it',
].includes(path.extname(filename).toLowerCase());

const syncImagesIncrementally = (monitoredDir: string, targetUserDir: string | null) => {
  if (!fs.existsSync(monitoredDir)) return [];
  const sourceFiles = fs.readdirSync(monitoredDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isAssetFile(entry.name))
    .map((entry) => entry.name);
  const shouldSyncTarget = targetUserDir && path.resolve(monitoredDir) !== path.resolve(targetUserDir);
  const targetFiles = shouldSyncTarget && targetUserDir
    ? (fs.mkdirSync(targetUserDir, { recursive: true }), fs.readdirSync(targetUserDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isAssetFile(entry.name))
      .map((entry) => entry.name))
    : null;

  if (targetFiles && targetUserDir) {
    // Filtra os arquivos a adicionar
    const filesToAdd = sourceFiles.filter(file => !targetFiles.includes(file));

    // Adiciona novos arquivos
    filesToAdd.forEach((file) => {
      const source = path.join(monitoredDir, file);
      const destination = path.join(targetUserDir, file);
      fs.copyFileSync(source, destination);
      console.log(`..: syncImagesIncrementally file add: ${file}`);
    });

    // Filtra os arquivos a remover
    const filesToRemove = targetFiles.filter((file) => !sourceFiles.includes(file));

    // Remove arquivos obsoletos
    filesToRemove.forEach((file) => {
      const filePath = path.join(targetUserDir, file);
      fs.unlinkSync(filePath);
      console.log(`..: syncImagesIncrementally file removed: ${file}`);
    });

    // Atualiza arquivos modificados
    sourceFiles.forEach((file) => {
      if (targetFiles.includes(file)) {
        const source = path.join(monitoredDir, file);
        const destination = path.join(targetUserDir, file);
        if (!filesHaveSameContents(source, destination)) {
          fs.copyFileSync(source, destination);
          console.log(`..: syncImagesIncrementally file updated: ${file}`);
        }
      }
    });

  }

  return sourceFiles;
};

type WatcherEntry = { watcher: fs.FSWatcher; timer: NodeJS.Timeout | null; win: BrowserWindow; monitoredDir: string; targetDir: string | null };
const watchers = new Map<string, WatcherEntry>();

// Para desligar todos os watchers
export async function stopAllWatchers() {
  watchers.forEach(({ watcher, timer }) => {
    if (timer) clearTimeout(timer);
    try {
      watcher.close()
    } catch (err) {
      console.error("Erro ao fechar watcher:", err);
    }
  });
  watchers.clear();
  console.log('..: Todos os watchers foram desligados.');
};

export async function clearWatchers() {
  await stopAllWatchers();
  console.log('..: Watchers limpos.');
}

// Monitorar alterações na pasta
const watchImages = (win: any, monitoredDir: string, targetUserDir: string | null) => {
  const key = path.resolve(monitoredDir);
  const current = watchers.get(key);
  if (current) {
    current.win = win;
    current.targetDir = targetUserDir;
    return;
  }
  const sandboxAssetsDir = targetUserDir ?? (directoryPathProject
    ? path.join(directoryPathProject, 'assets', path.basename(monitoredDir))
    : null);
  console.log(`..: Monitorando o diretório: ${monitoredDir}`);

  const entry: WatcherEntry = { watcher: null as any, timer: null, win, monitoredDir, targetDir: sandboxAssetsDir };
  let retryCount = 0;
  const scheduleSync = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      try {
        const imagesNames = syncImagesIncrementally(entry.monitoredDir, entry.targetDir);
        retryCount = 0;
        if (!entry.win.isDestroyed() && !entry.win.webContents.isDestroyed()) {
          entry.win.webContents.send('update-images', preparePathForFrontend(entry.monitoredDir), imagesNames);
        }
      } catch (error) {
        console.warn(`Asset sync will retry for ${entry.monitoredDir}:`, error);
        if (retryCount < 3) {
          retryCount += 1;
          scheduleSync();
        }
      }
    }, debounceInterval);
  };

  entry.watcher = fs.watch(monitoredDir, scheduleSync);
  entry.watcher.on('error', (error) => {
    console.error(`Asset watcher failed for ${monitoredDir}:`, error);
    if (entry.timer) clearTimeout(entry.timer);
    watchers.delete(key);
  });
  watchers.set(key, entry);
};

// Iniciar o monitoramento
export function startWatch(win: BrowserWindow | null, originalProjectDirectory: string | null, monitoringFolderPath: string) {
  const projectPath = path.join(originalProjectDirectory || '', 'assets', monitoringFolderPath);

  if (!fs.existsSync(projectPath)) {
    if (monitoringFolderPath === 'fonts' || monitoringFolderPath === 'auto-tiles') {
      fs.mkdirSync(projectPath, { recursive: true });
    } else {
      return { status: 'error', message: '>> Directory not found.' };
    }
  }

  if (!win) {
    return { status: 'error', message: '>> Nenhuma janela ativa encontrada' };
  }
  const targetUserDir = directoryPathProject
    ? path.join(directoryPathProject, 'assets', monitoringFolderPath)
    : null;
  targetDir = directoryPathProject;
  watchImages(win, projectPath, targetUserDir);

  try {
    return { status: 'success', localPath: `${preparePathForFrontend(projectPath)}`, fileImages: syncImagesIncrementally(projectPath, targetUserDir) };
  } catch (error) {
    console.error(`Unable to synchronize assets from ${projectPath}:`, error);
    return { status: 'error', message: 'Unable to synchronize project assets.' };
  }
};

function filesHaveSameContents(sourcePath: string, targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() && fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
  } catch {
    return false;
  }
}

// export function cleanAllTargetDir () {
//   // Deleta pasta do usuario para recria-la
//   if (fs.existsSync(targetDir)) {
//     fs.rmSync(targetDir, { recursive: true }); // Remove o diretório e seus conteúdos
//     console.log('..: Diretório e conteúdos removidos!');
//   } else {
//     console.log('..: Diretório não encontrado!');
//   }
// };

export function createUserPathTargetDir(folderName: string) {
  const targetDirWithFolder = path.join(targetDir, 'assets', folderName);

  // Garantir que a pasta exista
  if (!fs.existsSync(targetDirWithFolder)) {
    fs.mkdirSync(targetDirWithFolder, { recursive: true }); // Cria a pasta e as subpastas, se necessário
    console.log(`..: createUserPathTargetDir folder assets/${folderName} criada com sucesso.`);
  }

  return targetDirWithFolder;
};


// TODO salvar imagem na base
export function saveImageSettings(imageSettings: string) {

}
