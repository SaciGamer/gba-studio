import path from 'path';
import fs from 'fs';
import { SettingsController } from '@/controllers/SettingsController';
import { MainSettingsManager } from '@/managers/MainSettingsManager';

// Controllers
const settingsController = SettingsController.getInstance();
const mainSettingsManager = settingsController.getSettings('settings') as MainSettingsManager;

// Função para criar o arquivo settings.gbasres
export function createProjectSettingsStruct(basePath: string): void {
    const filePath = path.join(basePath, 'settings.gbasres');
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(mainSettingsManager.getData(), null, 2));
        console.log(`..: Arquivo de configurações criado: ${filePath}`);
    }
}