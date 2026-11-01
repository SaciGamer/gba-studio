import { normalizeSceneResource } from '../../shared/sceneResource';
import { pruneDeletedProjectEntries } from '../../shared/projectCollectionEntries';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { SettingsController } from '@/controllers/SettingsController';
import { createGenericSettingsStruct } from '@/structs/projectSettingsStruct';
import { getPreferences } from '@/handlers/preferenceHandlers';
import { updatePreferences } from '@/handlers/preferenceHandlers';
import { windows, directoryPathProject, originalProjectDirectory } from '@/main';
import { setCurrentActiveSandboxDirectory } from '@/states/tempProjectState';
import { formatMainWindowTitle } from '@/mainI18n';

//Controllers
const settingsController = SettingsController.getInstance();
let processingToSaved = false;
let pendingSaveOptions: SaveOptions | null = null;
let saveInProgress = false;
let lastWindowBaseTitle = '';
let lastProjectTitle = '';
// Event emitter to signal save completion so other modules (eg. build) can wait
export const saveEvents = new EventEmitter();

export interface SaveOptions {
    persistToOriginal?: boolean;
    markAsSaved?: boolean;
    source?: 'save' | 'save-as' | 'build' | 'run-live' | 'close';
    saveAsPath?: string;
}

export function updateWindowTitle(baseTitle: string, projectName: string, isSaved: boolean): void {
    lastWindowBaseTitle = baseTitle;
    lastProjectTitle = projectName;
    if (windows.main) {
        windows.main.setTitle(formatMainWindowTitle(baseTitle, projectName, isSaved, saveInProgress, getPreferences().language));
        settingsController.setIsSaved(isSaved);
    }
}

export function refreshWindowTitle(): void {
    if (lastWindowBaseTitle || lastProjectTitle) updateWindowTitle(lastWindowBaseTitle, lastProjectTitle, settingsController.isSaved());
}

function updateSaveProgress(isInProgress: boolean): void {
    saveInProgress = isInProgress;
    updateWindowTitle(lastWindowBaseTitle, lastProjectTitle, settingsController.isSaved());
}

// Default project path
export function setProjectDirectory(projectPath: string): string | null {
    return settingsController.setProjectDirectory(projectPath);
};

export function setProjectFile(file: string): string | null {
    return settingsController.setProjectFile(file);
}

export function changesPending<T>(type: 'main' | 'project' | 'settings' | 'scene' | 'variables', newData: Partial<T>) {
    settingsController.setIsSaved(false);
    settingsController.updateSettings(newData);
}

export function deletePending(type: 'scene', id: string): boolean {
    settingsController.setIsSaved(false);
    const response = settingsController.deleteSettings(type, id);
    return response;
}

export function prepareProjectSandbox(projectFilePath: string): { sandboxDirectory: string; originalDirectory: string } {
    const originalDirectory = path.resolve(path.dirname(projectFilePath));
    const sandboxDirectory = createProjectSandboxDirectory(originalDirectory);
    setCurrentActiveSandboxDirectory(sandboxDirectory);
    return { sandboxDirectory, originalDirectory };
}

// Requisitar FE para mandar arquivos para o Save
export function requestSaveChanges(options: SaveOptions = {}) {
    const mergedOptions: SaveOptions = { source: 'save', ...options };
    console.log('..: requestSaveChanges processingToSaved:', processingToSaved, 'source:', mergedOptions.source);
    if (windows.main && processingToSaved) {
        // A close request can arrive while another save is being prepared.
        // Upgrade that pending save so it also persists to the original
        // project instead of letting the close race with a sandbox-only save.
        pendingSaveOptions = { ...(pendingSaveOptions || {}), ...mergedOptions };
        return;
    }

    if (windows.main && !processingToSaved) {
        processingToSaved = true;
        pendingSaveOptions = mergedOptions;
        updateSaveProgress(true);
        windows.main.webContents.send('get-data', { type: 'SAVE_DATA', ...mergedOptions });
    }
}

export function waitForSaveComplete(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            saveEvents.removeListener('saved', onSaved);
            reject(new Error('Save timeout'));
        }, timeoutMs);

        const onSaved = (result?: { success?: boolean }) => {
            clearTimeout(timeout);
            if (result?.success === false) {
                reject(new Error('Save failed'));
                return;
            }
            resolve();
        };

        saveEvents.once('saved', onSaved);
    });
}

// Response FE para salvar nos arquivos
export function responseSaveChanges(dataToSave: any): boolean {
    console.log('..: DATA response to save:', dataToSave);
    const saveSucceeded = saveChanges(dataToSave, pendingSaveOptions || {});
    processingToSaved = false;
    pendingSaveOptions = null;
    updateSaveProgress(false);
    return saveSucceeded;
}

// Function to save changes
export function saveChanges(dataToSave: any, options: SaveOptions = {}) {
    console.log('..: Salvando alterações');
    try {
        if (!Array.isArray(dataToSave)) {
            console.warn('..: Dados de save inválidos, ignorando');
            emitSaveComplete(options, false);
            return false;
        }

        const settingsUtils = dataToSave.filter((data: any) => data._resourceType === 'setting-utils')
            .reduce((obj: any, item: any) => ({ ...obj, ...item }), {});
        const filesToSave = dataToSave.filter((data: any) => data._resourceType !== 'setting-utils');

        console.log('..: saveChanges settings Datas:', settingsUtils);
        console.log('..: saveChanges all Datas:', filesToSave);

        const activeProjectDirectory = options.persistToOriginal === false
            ? (directoryPathProject || '')
            : (directoryPathProject || settingsUtils.projectDirectory || path.dirname(settingsUtils.projectPathFile || ''));

        if (options.persistToOriginal === false && !activeProjectDirectory) {
            console.warn('..: Skip project write for implicit build/run-live save because no sandbox directory is active');
            emitSaveComplete(options, false);
            return false;
        }

        filesToSave.forEach((fileData: any) => {
            if (fileData && Array.isArray(fileData)) {
                fileData.forEach((subFile: any) => {
                    const projectPath = path.join(activeProjectDirectory, 'project', subFile._resourceType + 's');
                    const filenameFormatted = resourceFolderName(subFile.name);

                    if (subFile._deleted === true) {
                        return deleteSettings(projectPath, filenameFormatted!, subFile);
                    }

                    saveWithFolders(projectPath, filenameFormatted, subFile);
                    console.log(`..: Configurações scene ${subFile._index} saved:`, subFile);
                });
                return;
            }

            if (fileData && fileData._resourceType === 'project') {
                const projectFilename = path.basename(settingsUtils.projectPathFile || 'project.gbaproj');
                saveSettingsToStore(activeProjectDirectory, '', projectFilename, fileData);
                updatePreferences('recentProjects', {
                    title: projectFilename,
                    path: originalProjectDirectory || activeProjectDirectory,
                    hasCartridgeImage: typeof fileData.cartridgeImage === 'string' && Boolean(fileData.cartridgeImage),
                    cartridgeImage: typeof fileData.cartridgeImage === 'string' ? fileData.cartridgeImage : null,
                });
            } else if (fileData && fileData._resourceType === 'palettes') {
                const palettePath = path.join(activeProjectDirectory, 'project', 'palettes');
                fileData.palettes.forEach((palette: any) => saveWithFolders(palettePath, palette.name, { ...palette, _resourceType: 'palette' }));
            } else {
                saveSettingsToStore(activeProjectDirectory, 'project', fileData._resourceType, fileData);
            }
        });

        if (options.persistToOriginal === true) {
            copySandboxToOriginalProject(activeProjectDirectory);
        }

        console.log('..: Finalizando save :..');
        if (options.markAsSaved !== false) {
            settingsController.setIsSaved(true);
        }
        emitSaveComplete(options);
        return true;
    } catch (error) {
        console.error('..: Erro ao salvar configurações:', error);
        emitSaveComplete(options, false);
        return false;
    }
}

function emitSaveComplete(options: SaveOptions, success = true) {
    try {
        saveEvents.emit('saved', { success, options });
    } catch (e) {
        console.warn('saveEvents emit failed', e);
    }
}

function createProjectSandboxDirectory(originalDirectory: string): string {
    const sandboxRoot = path.join(os.tmpdir(), 'gba-studio-temp', 'projects');
    fs.mkdirSync(sandboxRoot, { recursive: true });

    const preferences = getPreferences();
    const maxBackups = Number(preferences.tempProjectBackupLimit ?? 5);
    const safeMaxBackups = Number.isFinite(maxBackups) && maxBackups >= 0 ? Math.floor(maxBackups) : 5;

    if (safeMaxBackups >= 0) {
        const entries = fs.readdirSync(sandboxRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({ name: entry.name, fullPath: path.join(sandboxRoot, entry.name) }))
            .sort((a, b) => fs.statSync(a.fullPath).mtimeMs - fs.statSync(b.fullPath).mtimeMs);

        while (entries.length >= safeMaxBackups && entries.length > 0) {
            const oldest = entries.shift();
            if (oldest) {
                fs.rmSync(oldest.fullPath, { recursive: true, force: true });
            }
        }
    }

    const sandboxName = `${path.basename(originalDirectory || 'project')}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sandboxDirectory = path.join(sandboxRoot, sandboxName);

    if (fs.existsSync(sandboxDirectory)) {
        fs.rmSync(sandboxDirectory, { recursive: true, force: true });
    }

    fs.mkdirSync(sandboxDirectory, { recursive: true });
    copyDirectoryContents(originalDirectory, sandboxDirectory);
    return sandboxDirectory;
}

function copySandboxToOriginalProject(activeProjectDirectory: string) {
    console.log('..: Synchronizing changed sandbox files with original project directory');
    if (!originalProjectDirectory || !activeProjectDirectory) {
        return;
    }

    const normalizedActiveDir = path.resolve(activeProjectDirectory);
    const normalizedOriginalDir = path.resolve(originalProjectDirectory);

    if (normalizedActiveDir === normalizedOriginalDir) {
        return;
    }

    syncDirectoryChanges(normalizedActiveDir, normalizedOriginalDir);
}

/**
 * Synchronizes a sandbox without replacing the whole project directory.
 * Files are copied only when their contents changed. Asset files are always
 * preserved in the original project when they are missing from the sandbox;
 * a save must never turn a temporary/incomplete asset view into data loss.
 */
function syncDirectoryChanges(sourceDir: string, targetDir: string, preserveAssets = false): void {
    if (!fs.existsSync(sourceDir)) {
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
    const sourceNames = new Set(sourceEntries.map((entry) => entry.name));
    const preserveAssetEntries = preserveAssets || path.basename(sourceDir).toLowerCase() === 'assets';

    for (const entry of sourceEntries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
                fs.rmSync(targetPath, { force: true });
            }
            syncDirectoryChanges(sourcePath, targetPath, preserveAssetEntries);
            continue;
        }

        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }

        if (!filesHaveSameContents(sourcePath, targetPath)) {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, targetPath);
        }
    }

    if (!fs.existsSync(targetDir)) {
        return;
    }

    if (!preserveAssetEntries) {
        for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
            if (!sourceNames.has(entry.name)) {
                fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
            }
        }
    }
}

function filesHaveSameContents(sourcePath: string, targetPath: string): boolean {
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        return false;
    }

    const source = fs.readFileSync(sourcePath);
    const target = fs.readFileSync(targetPath);
    return source.equals(target);
}

export function copyDirectoryContents(sourceDir: string, targetDir: string) {
    if (!fs.existsSync(sourceDir)) {
        return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    entries.forEach((entry) => {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            copyDirectoryContents(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    });
}

// Função para atualizar configurações
function saveSettingsToStore<T>(basePath: any, folder: string, filename: string, newSettings: Partial<T>): T {
    newSettings = normalizeSceneResource(pruneDeletedProjectEntries(newSettings));
    const pathFileToSave = path.join(basePath, folder ? path.join(`${folder}`, `${filename}.gbasres`) : filename);
    console.log('..: caminho para salvar a configuração: ', pathFileToSave);
    try {
        if (fs.existsSync(pathFileToSave)) {
            const pathFileToBak = `${pathFileToSave}.bak`;
            fs.renameSync(pathFileToSave, pathFileToBak);
            fs.writeFileSync(pathFileToSave, JSON.stringify(newSettings, null, 2));
        } else {
            const pathFileToCreate = path.join(basePath, folder ? folder : '');
            if (!fs.existsSync(pathFileToSave)) {
                fs.mkdirSync(pathFileToCreate, { recursive: true });
            }

            createGenericSettingsStruct(pathFileToCreate, filename, newSettings);
        }

        return newSettings as unknown as T;
    } catch (error) {
        console.error('..: Erro ao atualizar configurações:', error);
        throw error;
    }
}

// function deleteSettings<T>(basePath: any, folder: string, filename: string, newSettings: Partial<T>): void {
//     const pathFileToDelete = path.join(basePath, folder ? path.join(`${folder}`, `${filename}.gbasres`) : filename);
//     console.log('..: caminho para deletar a configuração: ', pathFileToDelete);
    
//     try {
//         if (fs.existsSync(pathFileToDelete)) {
//             fs.unlinkSync(pathFileToDelete);
//             console.log(`..: Arquivo deletado: ${pathFileToDelete}`);
//             const pathFileToBak = `${pathFileToDelete}.bak`;
//             if (fs.existsSync(pathFileToBak)) {
//                 fs.unlinkSync(pathFileToBak);
//                 console.log(`..: Arquivo .bak deletado: ${pathFileToBak}`);
//             }
//         }
//     } catch (error) {
//         console.error('..: Erro ao deletar configurações:', error);
//     }
       
// }

function saveWithFolders(basePath: string, name: string, newSettings: any) {
  newSettings = normalizeSceneResource(newSettings);
  const folderBase = path.join(basePath, resourceFolderName(name));
  const fileName = newSettings._resourceType + ".gbasres";
  let targetFolder = folderBase;
  let counter = 1;

  // verifica se já existe pasta com esse nome
  while (fs.existsSync(targetFolder)) {
    const filePath = path.join(targetFolder, fileName);

    if (fs.existsSync(filePath)) {
      const oldData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (oldData.id === newSettings.id) {
        // mesmo id → renomeia e sobrescreve
        fs.renameSync(filePath, filePath + ".bak");
        fs.writeFileSync(filePath, JSON.stringify(newSettings, null, 2));
        return;
      } else {
        // id diferente → tenta próxima pasta
        targetFolder = folderBase + "_" + counter++;
      }
    } else {
      // pasta existe mas está vazia → reaproveita
      break;
    }
  }

  // cria nova pasta
  fs.mkdirSync(targetFolder, { recursive: true });
  const filePath = path.join(targetFolder, fileName);
  fs.writeFileSync(filePath, JSON.stringify(newSettings, null, 2));

  // remove duplicados em outras pastas
  cleanupDuplicateScenes(basePath, newSettings.id, targetFolder, fileName);
}

function cleanupDuplicateScenes(basePath: string, id: string, keepFolder: string, fileName: string) {
  const folders = fs.readdirSync(basePath);
  for (const folder of folders) {
    const filePath = path.join(basePath, folder, fileName);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (data.id === id && path.join(basePath, folder) !== keepFolder) {
        fs.unlinkSync(filePath);
        console.log("..: removido duplicado em", folder);
      }
    }
  }
}

function deleteSettings(basePath: string, folder: string, newSettings: any): void {
  // pasta alvo (ex: basePath/MyScene)
  const targetFolder = path.join(basePath, resourceFolderName(folder));
  const fileName = newSettings._resourceType + ".gbasres";
  const filePath = path.join(targetFolder, fileName);

  console.log("..: caminho para deletar a configuração:", filePath);

  try {
    if (fs.existsSync(filePath)) {
      // lê o arquivo para pegar o id
      const oldData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const oldId = oldData.id;

      // remove o arquivo principal
      fs.unlinkSync(filePath);
      console.log(`..: Arquivo deletado: ${filePath}`);

      // remove backup se existir
      const bakFile = filePath + ".bak";
      if (fs.existsSync(bakFile)) {
        fs.unlinkSync(bakFile);
        console.log(`..: Arquivo .bak deletado: ${bakFile}`);
      }

      // opcional: remover duplicados em outras pastas com o mesmo id
      cleanupDuplicateScenes(basePath, oldId, targetFolder, fileName);

      // se a pasta ficou vazia, pode remover também
      const remaining = fs.readdirSync(targetFolder);
      if (remaining.length === 0) {
        fs.rmdirSync(targetFolder);
        console.log(`..: Pasta removida: ${targetFolder}`);
      }
    }
  } catch (error) {
    console.error("..: Erro ao deletar configurações:", error);
  }
}

/** Create a filesystem-safe folder key without changing the resource's display name. */
function resourceFolderName(name: unknown): string {
  const normalized = String(name ?? '').toLowerCase().replace(/\s+/g, '');
  const safeName = normalized
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '');
  return safeName || 'unnamed';
}

