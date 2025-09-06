import { ipcMain } from 'electron';
import { SettingsController } from '@/controllers/SettingsController';
import { changesPending, deletePending, responseSaveChanges, updateWindowTitle } from '@/services/saveSettingsService';
import { loadSettings } from '@/services/loadSettingsService';

const settingsController = SettingsController.getInstance();

export const settingsHandlers = () => {
    ipcMain.handle('loadSettings', async (event, projectFilePath: any) => {
        console.log('..: settingsHandlers loadSettings project file path:', projectFilePath)
        return loadSettings(projectFilePath);
    });

    // Mandar novas informações
    ipcMain.handle('updateSettings', async (event, typeToSave, newSettings) => {
        console.log('..: updateSettings received, type: %s and config: %s', typeToSave, newSettings);
        changesPending(typeToSave, newSettings);
        return { status: 'success', statusCode: 200, message: 'data settings updated' };
    });

    // Remove configuração
    ipcMain.handle('deleteSettings', async (event, typeToSave, id) => {
        console.log('..: deleteSettings received, type: %s and id: %s', typeToSave, id);
        return deletePending(typeToSave, id);
    });

    // Pegar informações carregadas
    ipcMain.handle('fetchSettings', async (event, typeToFetch) => {
        console.log('..: fetchSettings settingsHandlers fetchSettings data with type:', typeToFetch)
        const settingsData = settingsController.getSettingsData(typeToFetch);
        console.log('..: fetchSettings SettingsData: ', settingsData);
        return { status: 'success', message: 'response settings data', settings: settingsData };
    });

    // Atualização de titulo
    ipcMain.handle('updateTitle',  async (event, baseTitle, projectName, isSaved) => {
        updateWindowTitle(baseTitle, projectName, isSaved);
    });

    
    ipcMain.handle('send-data', (event, dataToSave) => {
        responseSaveChanges(dataToSave);
    });

}