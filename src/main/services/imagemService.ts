
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { directoryPathProject } from '@/main';

// const targetDir = path.join(app.getAppPath(), 'project_user', 'user_assets');
let targetDir: any;

const eventCache: Record<string, boolean> = {}; // Cache para debouncing
const debounceInterval = 100; // Intervalo em milissegundos para ignorar eventos repetidos

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
  '.png', '.jpg', '.jpeg', '.gif', '.bmp',
  '.wav', '.mp3', '.ogg', '.mod', '.xm', '.s3m', '.it',
].includes(path.extname(filename).toLowerCase());

const syncImagesIncrementally = (monitoredDir: string, targetUserDir: string | null) => {
  const sourceFiles = fs.readdirSync(monitoredDir).filter(isAssetFile);
  const shouldSyncTarget = targetUserDir && path.resolve(monitoredDir) !== path.resolve(targetUserDir);
  const targetFiles = shouldSyncTarget && targetUserDir
    ? (fs.mkdirSync(targetUserDir, { recursive: true }), fs.readdirSync(targetUserDir).filter(isAssetFile))
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
        const sourceStat = fs.statSync(source);
        const targetStat = fs.statSync(destination);

        if (sourceStat.mtime > targetStat.mtime) {
          fs.copyFileSync(source, destination);
          console.log(`..: syncImagesIncrementally file updated: ${file}`);
        }
      }
    });

  }

  return sourceFiles;
};

let watchers: any[] = [];

// Para desligar todos os watchers
export async function stopAllWatchers() {
  watchers.forEach((watcher) => {
    try {
      watcher.close()
    } catch (err) {
      console.error("Erro ao fechar watcher:", err);
    }
  });
  console.log('..: Todos os watchers foram desligados.');
};

export async function clearWatchers() {
  await stopAllWatchers();
  watchers = [];
  console.log('..: Watchers limpos.');
}

// Monitorar alterações na pasta
const watchImages = (win: any, monitoredDir: string, targetUserDir: string | null) => {
  const sandboxAssetsDir = targetUserDir ?? (directoryPathProject
    ? path.join(directoryPathProject, 'assets', path.basename(monitoredDir))
    : null);
  console.log(`..: Monitorando o diretório: ${monitoredDir}`);

  const watch = fs.watch(monitoredDir, (eventType, filename) => {
    if (filename) {
      //   if (eventCache[monitoredDir]) {
      //     // Ignora eventos repetidos dentro do intervalo
      //     return;
      //   }

      //   eventCache[monitoredDir] = true;
      //   setTimeout(() => {
      //     delete eventCache[monitoredDir]; // Limpa o cache após o intervalo
      //   }, debounceInterval);

      console.log(`..: Alteração detectada: ${eventType} no arquivo ${filename}`);
      const imagesNames = syncImagesIncrementally(monitoredDir, sandboxAssetsDir); // Atualiza sandbox e lista de arquivos
      console.log('..: watchImages enviar para o FE:', monitoredDir, imagesNames);
      win.webContents.send('update-images', preparePathForFrontend(monitoredDir), imagesNames); // Notifica o frontend
    }
  });

  watchers.push(watch);
};

// Iniciar o monitoramento
export function startWatch(win: BrowserWindow | null, originalProjectDirectory: string | null, monitoringFolderPath: string) {
  const projectPath = path.join(originalProjectDirectory || '', 'assets', monitoringFolderPath);

  if (!fs.existsSync(projectPath)) {
    if (monitoringFolderPath === 'fonts') {
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
  watchImages(win, projectPath, null/*, targetUserDir*/); // Chama a função passando a janela e o caminho do projeto

  return { status: 'success', localPath: `${preparePathForFrontend(projectPath)}`, fileImages: syncImagesIncrementally(projectPath, targetUserDir) };
};

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
