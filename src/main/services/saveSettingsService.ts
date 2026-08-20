import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { SettingsController } from '@/controllers/SettingsController';
import { createGenericSettingsStruct } from '@/structs/projectSettingsStruct';
import { getPreferences } from '@/handlers/preferenceHandlers';
import { windows, directoryPathProject, originalProjectDirectory } from '@/main';
import { setCurrentActiveSandboxDirectory } from '@/states/tempProjectState';
import { startWatch, stopAllWatchers } from './imagemService';

//Controllers
const settingsController = SettingsController.getInstance();
let processingToSaved = false;
let pendingSaveOptions: SaveOptions | null = null;
// Event emitter to signal save completion so other modules (eg. build) can wait
export const saveEvents = new EventEmitter();

export interface SaveOptions {
    persistToOriginal?: boolean;
    markAsSaved?: boolean;
    source?: 'save' | 'save-as' | 'build' | 'run-live' | 'close';
    saveAsPath?: string;
}

export function updateWindowTitle(baseTitle: string, projectName: string, isSaved: boolean): void {
    if (windows.main) {
        const title = `${baseTitle ? baseTitle : ''} - ${projectName ? projectName : ''}`;
        windows.main.setTitle(`${title}${!isSaved ? ' (Modified)' : ''}`);
        settingsController.setIsSaved(isSaved);
    }
}

// Default project path
export function setProjectDirectory(projectPath: string): string | null {
    return settingsController.setProjectDirectory(projectPath);
};

export function setProjectFile(file: string): string | null {
    return settingsController.setProjectFile(file);
}

export function changesPending<T>(type: 'main' | 'project' | 'settings' | 'scene', newData: Partial<T>) {
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
    if (windows.main && !processingToSaved) {
        processingToSaved = true;
        pendingSaveOptions = mergedOptions;
        windows.main.webContents.send('get-data', { type: 'SAVE_DATA', ...mergedOptions });
    }
}

export function waitForSaveComplete(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            saveEvents.removeListener('saved', onSaved);
            reject(new Error('Save timeout'));
        }, timeoutMs);

        const onSaved = () => {
            clearTimeout(timeout);
            resolve();
        };

        saveEvents.once('saved', onSaved);
    });
}

// Response FE para salvar nos arquivos
export function responseSaveChanges(dataToSave: any) {
    console.log('..: DATA response to save:', dataToSave);
    stopAllWatchers();
    processingToSaved = saveChanges(dataToSave, pendingSaveOptions || {});
    startWatch(windows.main, originalProjectDirectory, "backgrounds");
    pendingSaveOptions = null;
}

// Function to save changes
export function saveChanges(dataToSave: any, options: SaveOptions = {}) {
    console.log('..: Salvando alterações');
    try {
        if (!Array.isArray(dataToSave)) {
            console.warn('..: Dados de save inválidos, ignorando');
            emitSaveComplete(options);
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
            emitSaveComplete(options);
            return false;
        }

        filesToSave.forEach((fileData: any) => {
            if (fileData && Array.isArray(fileData)) {
                fileData.forEach((subFile: any) => {
                    const projectPath = path.join(activeProjectDirectory, 'project', subFile._resourceType + 's');
                    const filenameFormatted = subFile.name.toLowerCase().replace(/ /g, '');

                    if (subFile._deleted === true) {
                        return deleteSettings(projectPath, filenameFormatted!, subFile);
                    }

                    saveScene(projectPath, filenameFormatted, subFile);
                    console.log(`..: Configurações scene ${subFile._index} saved:`, subFile);
                });
                return;
            }

            if (fileData && fileData._resourceType === 'project') {
                saveSettingsToStore(activeProjectDirectory, '', path.basename(settingsUtils.projectPathFile || 'project.gbaproj'), fileData);
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
        return false;
    } catch (error) {
        console.error('..: Erro ao salvar configurações:', error);
        emitSaveComplete(options);
        return false;
    }
}

function emitSaveComplete(options: SaveOptions) {
    try {
        saveEvents.emit('saved', { success: true, options });
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
    console.log('..: Copying sandbox project back to original project directory');
    if (!originalProjectDirectory || !activeProjectDirectory) {
        return;
    }

    const normalizedActiveDir = path.resolve(activeProjectDirectory);
    const normalizedOriginalDir = path.resolve(originalProjectDirectory);

    if (normalizedActiveDir === normalizedOriginalDir) {
        return;
    }

    if (fs.existsSync(normalizedOriginalDir)) {
        fs.rmSync(normalizedOriginalDir, { recursive: true, force: true });
    }
    fs.mkdirSync(normalizedOriginalDir, { recursive: true });
    copyDirectoryContents(normalizedActiveDir, normalizedOriginalDir);
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

function saveScene(basePath: string, name: string, newSettings: any) {
  const folderBase = path.join(basePath, name.replace(/\s+/g, ""));
  let targetFolder = folderBase;
  let counter = 1;

  // verifica se já existe pasta com esse nome
  while (fs.existsSync(targetFolder)) {
    const sceneFile = path.join(targetFolder, "scene.gbasres");

    if (fs.existsSync(sceneFile)) {
      const oldData = JSON.parse(fs.readFileSync(sceneFile, "utf-8"));
      if (oldData.id === newSettings.id) {
        // mesmo id → renomeia e sobrescreve
        fs.renameSync(sceneFile, sceneFile + ".bak");
        fs.writeFileSync(sceneFile, JSON.stringify(newSettings, null, 2));
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
  const sceneFile = path.join(targetFolder, "scene.gbasres");
  fs.writeFileSync(sceneFile, JSON.stringify(newSettings, null, 2));

  // remove duplicados em outras pastas
  cleanupDuplicateScenes(basePath, newSettings.id, targetFolder);
}

function cleanupDuplicateScenes(basePath: string, id: string, keepFolder: string) {
  const folders = fs.readdirSync(basePath);
  for (const folder of folders) {
    const sceneFile = path.join(basePath, folder, "scene.gbasres");
    if (fs.existsSync(sceneFile)) {
      const data = JSON.parse(fs.readFileSync(sceneFile, "utf-8"));
      if (data.id === id && path.join(basePath, folder) !== keepFolder) {
        fs.unlinkSync(sceneFile);
        console.log("..: removido duplicado em", folder);
      }
    }
  }
}

function deleteSettings(basePath: string, folder: string, newSettings: any): void {
  // pasta alvo (ex: basePath/MyScene)
  const targetFolder = path.join(basePath, folder.replace(/\s+/g, ""));
  const sceneFile = path.join(targetFolder, "scene.gbasres");

  console.log("..: caminho para deletar a configuração:", sceneFile);

  try {
    if (fs.existsSync(sceneFile)) {
      // lê o arquivo para pegar o id
      const oldData = JSON.parse(fs.readFileSync(sceneFile, "utf-8"));
      const oldId = oldData.id;

      // remove o arquivo principal
      fs.unlinkSync(sceneFile);
      console.log(`..: Arquivo deletado: ${sceneFile}`);

      // remove backup se existir
      const bakFile = sceneFile + ".bak";
      if (fs.existsSync(bakFile)) {
        fs.unlinkSync(bakFile);
        console.log(`..: Arquivo .bak deletado: ${bakFile}`);
      }

      // opcional: remover duplicados em outras pastas com o mesmo id
      cleanupDuplicateScenes(basePath, oldId, targetFolder);

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

