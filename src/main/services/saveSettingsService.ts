import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { SettingsController } from '@/controllers/SettingsController';
import { createGenericSettingsStruct } from '@/structs/projectSettingsStruct';
import { getPreferences } from '@/handlers/preferenceHandlers';
import { windows, directoryPathProject, originalProjectDirectory } from '@/main';
import { setCurrentActiveSandboxDirectory } from '@/states/tempProjectState';

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
    processingToSaved = saveChanges(dataToSave, pendingSaveOptions || {});
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
                    const projectPath = path.join(activeProjectDirectory, 'project');
                    const filenameFormatted = subFile.name.toLowerCase().replace(/ /g, '_');

                    if (subFile._deleted === true) {
                        return deleteSettings(projectPath, subFile._resourceType + 's', filenameFormatted!, subFile);
                    }

                    const scenesSaved = saveSettingsToStore(projectPath, subFile._resourceType + 's', filenameFormatted!, subFile);
                    console.log(`..: Configurações scene ${subFile._index} saved:`, scenesSaved);
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

function deleteSettings<T>(basePath: any, folder: string, filename: string, newSettings: Partial<T>): void {
    const pathFileToDelete = path.join(basePath, folder ? path.join(`${folder}`, `${filename}.gbasres`) : filename);
    console.log('..: caminho para deletar a configuração: ', pathFileToDelete);
    
    try {
        if (fs.existsSync(pathFileToDelete)) {
            fs.unlinkSync(pathFileToDelete);
            console.log(`..: Arquivo deletado: ${pathFileToDelete}`);
            const pathFileToBak = `${pathFileToDelete}.bak`;
            if (fs.existsSync(pathFileToBak)) {
                fs.unlinkSync(pathFileToBak);
                console.log(`..: Arquivo .bak deletado: ${pathFileToBak}`);
            }
        }
    } catch (error) {
        console.error('..: Erro ao deletar configurações:', error);
    }
       
}