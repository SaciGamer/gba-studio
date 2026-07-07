import path from 'path';
import fs from 'fs';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { SettingsController } from '@/controllers/SettingsController';
import { createGenericSettingsStruct } from '@/structs/projectSettingsStruct';
import { IMainSettings, IProjectSettings } from '@/interfaces/MainSettingsInterface';
import { ISceneSettings } from '@/interfaces/SceneInterface';
import { windows } from '@/main';
import { directoryPathProject } from '@/main';

//Controllers
const settingsController = SettingsController.getInstance();
let processingToSaved = false;
// Event emitter to signal save completion so other modules (eg. build) can wait
export const saveEvents = new EventEmitter();

export function updateWindowTitle(baseTitle: string, projectName: string, isSaved: boolean): void {
    // console.log('..: updateWindowTitle fields:', baseTitle, projectName, isSaved);

    if (windows.main) {
        // console.log('..: updateWindowTitle windows:', windows.main?.getTitle());
        const title = `${baseTitle ? baseTitle : ''} - ${projectName ? projectName : ''}`;
        windows.main.setTitle(`${title}${!isSaved ? ' (Modified)' : ''}`);
        settingsController.setIsSaved(isSaved);
        // console.log('..: updateWindowTitle title changed:',  windows.main?.getTitle());
    }
}

// Default project path
export function setProjectDirectory(path: string): string | null {
    return settingsController.setProjectDirectory(path);;
};

export function setProjectFile(file: string): string | null {
    return settingsController.setProjectFile(file);
}

export function changesPending<T>(type: 'main' | 'project' | 'settings' | 'scene', newData: Partial<T>) {
    settingsController.setIsSaved(false);
    settingsController.updateSettings(newData);
    // updateWindowTitle();
}

export function deletePending(type: 'scene', id: string): boolean {
    settingsController.setIsSaved(false);
    const response = settingsController.deleteSettings(type, id);
    // updateWindowTitle();
    return response;
}

// Requisitar FE para mandar arquivos para o Save
export function requestSaveChanges() {
    console.log('..: requestSaveChanges processingToSaved:', processingToSaved)
    if (windows.main && !processingToSaved) {
        processingToSaved = true;
        windows.main.webContents.send('get-data', 'SAVE_DATA');
    }
}

// Response FE para salvar nos arquivos
export function responseSaveChanges(dataToSave: any) {
    console.log('..: DATA response to save:', dataToSave);
    processingToSaved = saveChanges(dataToSave);
}

// Function to save changes
export function saveChanges(dataToSave: any) {
    console.log('..: Salvando alterações');
    if (processingToSaved) {
        try {
            const settingsUtils = dataToSave.filter((data: any) => data._resourceType === 'setting-utils')
                .reduce((obj: any, item: any) => {
                    return {...obj, ...item};
                }, {});
            const filesToSave = dataToSave.filter((data: any) => data._resourceType !== 'setting-utils');

            console.log('..: saveChanges settings Datas:', settingsUtils);
            console.log('..: saveChanges all Datas:', filesToSave);

            filesToSave.forEach((fileData: any) => {
                // Para elementos que podem ser salvos/deletados
                if (fileData! && Array.isArray(fileData)) {
                    fileData.forEach((subFile: any) => {
                        const projectPath = path.join(directoryPathProject, 'project');
                        // Transformar em minúsculas e substituir o espaço por underscore
                        const filenameFormatted = subFile.name.toLowerCase().replace(/ /g, "_");
                        
                        // Verifica se o elemento está marcado para deleção
                        if (subFile._deleted === true) {
                            // Deleta arquivo caso ainda exista e ignore o salvamento
                            return deleteSettings(projectPath, subFile._resourceType + 's', filenameFormatted!, subFile); 
                        }
                        
                        // Salvar arquivo caso não tenha sido flegado para deletar
                        const scenesSaved = saveSettingsToStore(projectPath, subFile._resourceType + 's', filenameFormatted!, subFile);
                        console.log(`..: Configurações scene ${subFile._index} saved:`, scenesSaved);
                    });
                    return;
                }

                if (fileData! && fileData._resourceType === 'project')
                    saveSettingsToStore(settingsUtils.projectDirectory, '', path.basename(settingsUtils.projectPathFile), fileData);
                else {
                    saveSettingsToStore(settingsUtils.projectDirectory, 'project', fileData._resourceType, fileData);
                }
            });
            
            console.log('..: Finalizando save :..');
            // updateWindowTitle();
            return false;
        } catch (error) {
            console.error('..: Erro ao salvar configurações:', error);
            return false;
        }
    }


    // if (!settingsController.isSaved() && settingsController.getProjectFile()) {
    //     try {
    //         const directory = settingsController.getProjectDirectory();
    //         const projectFilenamePrincipal = settingsController.getProjectFile() || `unknow`;

    //         console.log('..: saveChanges all Datas:', settingsController.getSettingsData('all'));

    //         // Salvar todos os arquivos TODO Arruma o getData para pegar do Controller
    //         const settingsData = settingsController.getSettingsData('settings') as IMainSettings;
    //         const settingsSaved = saveSettingsToStore(directory, 'project', 'settings', settingsData);
    //         console.log('..: Configurações settings saved:', settingsSaved);

    //         const projectData = settingsController.getSettingsData('project') as IProjectSettings;
    //         const projectSaved = saveSettingsToStore(directory, '', projectFilenamePrincipal, projectData);
    //         console.log('..: Configurações project saved:', projectSaved);

    //         // Salvar os arquivos de cena
    //         // Deletar a pasta de cenas para evitar duplicação
    //         // TODO revisar o delete
    //         fs.rmSync(path.join(directory!, 'project', 'scenes'), { recursive: true, force: true });
    //         const scenesData = settingsController.getSettingsData<ISceneSettings>('scene')!;
    //         if (Array.isArray(scenesData)) {
    //             scenesData.forEach((sceneData) => {
    //                 const projectPath = path.join(directory!, 'project', 'scenes');
    //                 // Transformar em minúsculas e substituir o espaço por underscore
    //                 const filenameFormatted = sceneData.name.toLowerCase().replace(/ /g, "_");
    //
    //                 const scenesSaved = saveSettingsToStore(projectPath, filenameFormatted!, 'scene', sceneData);
    //                 console.log(`..: Configurações scene ${sceneData._index} saved:`, scenesSaved);
    //             });
    //         }

    //         // Salvo
    //         settingsController.setIsSaved(true);
    //         // updateWindowTitle();
    //         return true;
    //     } catch (error) {
    //         console.error('..: Erro ao salvar configurações:', error);
    //         return false;
    //     }
    // }
    console.log('..: Nenhuma alteração para salvar');
    // Emit save complete even when nothing to save so build flows can continue
    try { saveEvents.emit('saved', true); } catch (e) { console.warn('saveEvents emit failed', e); }
    return false;
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
            const pathFileToCreate = path.join(basePath, folder ? folder : '')
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