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

    // Receive serialized project fallback (JSON + base64 assets)
    ipcMain.handle('send-serialized', (event, serializedData) => {
        console.log('..: Received serialized project data (fallback)');
        // Write serializedData into a temp project folder for processing
        // Save to os.tmpdir() or repo temp
        try {
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const tmpRoot = path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-serialized');
            if (fs.existsSync(tmpRoot))
                fs.rmSync(tmpRoot, { recursive: true, force: true });
            fs.mkdirSync(tmpRoot, { recursive: true });

            // Expect serializedData to be { projectFiles: [{ path, content }], assets: [{ path, base64 }] }
            if (serializedData.projectFiles) {
                serializedData.projectFiles.forEach((f: any) => {
                    const target = path.join(tmpRoot, f.path);
                    const dir = path.dirname(target);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(target, JSON.stringify(f.content, null, 2), 'utf8');
                });
            }

            if (serializedData.assets) {
                const assetsDir = path.join(tmpRoot, 'assets');
                if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
                serializedData.assets.forEach((a: any) => {
                    const target = path.join(tmpRoot, a.path);
                    const dir = path.dirname(target);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(target, Buffer.from(a.base64, 'base64'));
                });
            }

            return { status: 'ok', tmpPath: tmpRoot };
        } catch (err) {
            console.error('send-serialized handler error', err);
            return { status: 'error', message: String(err) };
        }
    });

}