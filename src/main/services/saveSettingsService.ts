import path from 'path';
import fs from 'fs';
import { BrowserWindow } from 'electron';
import { SettingsUtilsManager } from '@/managers/SettingsUtilsManager';
import { SettingsController } from '@/controllers/SettingsController';
import { ProjectManager } from '@/managers/ProjectManager';
import { MainSettingsManager } from '@/managers/MainSettingsManager';

//Controllers
const settingsController = SettingsController.getInstance();

const projectManager = ProjectManager.getInstance();
const settingsManager = MainSettingsManager.getInstance();
const settingsUtils = SettingsUtilsManager.getInstance();

export function updateWindowTitle(): void {
    const mainWindow = BrowserWindow.getFocusedWindow();
    console.log('..: updateWindowTitle windows:', mainWindow?.getTitle());
    if (mainWindow) {
        const title = `${settingsUtils.getBaseTitle()} - ${projectManager?.getProjectName() ? `${projectManager?.getProjectName()}` : ''}`;
        console.log('..: updateWindowTitle title changed:', title);
        mainWindow.setTitle(`${title}${!settingsUtils.isSaved() ? ' (Modified)' : ''}`);
    }
}

// Default project path
export function setProjectDirectory (path: string): string | null {
    settingsUtils.setProjectDirectory(path);
    return settingsUtils?.getProjectDirectory();
};

export function setProjectFile (file: string): string | null {
    return settingsUtils.setProjectFile(file);
}

export function changesPending<T>(type: 'main' | 'project' | 'settings', newData: Partial<T>): T {
    settingsUtils.updateData({ saved: false });
    const responseSettingsControllerUpdate = settingsController.updateSettings(type, newData);
    updateWindowTitle();
    return responseSettingsControllerUpdate;
}

// Function to save changes
export function saveChanges() {
    console.log('..: Salvando alterações');
    if (!settingsUtils.isSaved() && settingsUtils.getProjectFile()) {
        try {
            const directory = settingsUtils.getProjectDirectory();
            const projectFileNamePrincipal = settingsUtils.getProjectFile() || `unknow`;

            // Salvar todos os arquivos
            const settingsSaved = saveSettingsToStore(directory, 'project', 'settings', settingsManager.getData());
            console.log('..: Configurações settings saved:', settingsSaved);
            const projectSaved = saveSettingsToStore(directory, '', projectFileNamePrincipal, projectManager.getData());
            console.log('..: Configurações project saved:', projectSaved);
            
            // Salvo
            settingsUtils.updateData({ saved:true });
            updateWindowTitle();
            return true;
        } catch (error) {
            console.error('..: Erro ao salvar configurações:', error);
            return false;
        }
    }
    console.log('..: Nenhuma alteração para salvar');
    return false;
}

// Função para atualizar configurações
function saveSettingsToStore<T>(basePath: any, folder: string, fileName: string, newSettings: Partial<T>): T {
    const pathFileToSave = path.join(basePath, folder? path.join(`${folder}`, `${fileName}.gbasres`) : fileName);
    console.log('..: caminho para salvar a configuração: ', pathFileToSave);
    try {
        fs.writeFileSync(pathFileToSave, JSON.stringify(newSettings, null, 2));
        return newSettings as unknown as T;
    } catch (error) {
        console.error('..: Erro ao atualizar configurações:', error);
        throw error;
    }
}