import { ipcMain } from 'electron';
import { SettingsController } from '@/controllers/SettingsController';
import { changesPending } from '@/services/saveSettingsService';

const settingsController = SettingsController.getInstance();

export const settingsHandlers = () => {
    // Pegar informações carregadas
    ipcMain.handle('getSettings', async (event, type: any) => {
        console.log('..: settingsHandlers getSettings data with type:', type)
        const settingsData = settingsController.getSettingsData(type);
        console.log('..: SettingsData: ', settingsData);
        return settingsData;
    });

    // Mandar novas informações
    ipcMain.handle('updateSettings', async (event, typeToSave, newSettings) => {
        console.log('..: updateSettings received, type: %s and config: %s', typeToSave, newSettings);
        return changesPending(typeToSave, newSettings);
    });

}