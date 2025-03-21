import path from 'path';
import fs from 'fs';
// import { SettingsController } from '../controllers/SettingsController';
import { ProjectManager } from '@/managers/ProjectManager';
// import { SettingsUtilsManager } from '../managers/SettingsUtilsManager';
import { MainSettingsManager } from '@/managers/MainSettingsManager';
import { SettingsUtilsManager } from '@/managers/SettingsUtilsManager';

// Controllers
const projectManager = ProjectManager.getInstance();
const settingsUtils = SettingsUtilsManager.getInstance();
const mainSettingsManager = MainSettingsManager.getInstance();

export function loadSettings(filePath: string): void {
    console.log('..: Carregando configurações :..');
    console.log('..: filePath:', filePath);

    const directory = settingsUtils.getProjectDirectory();

    // ## User Settings ###############################
    const loadSettingProject = defaultLoadSettings(filePath, null, 'project', projectManager.getData());
    projectManager.updateData(loadSettingProject);
    // ## User Settings END ###########################
    
    // ## Gamer Settings ###############################
    const loadMainSettings = defaultLoadSettings(directory, 'project', 'settings', mainSettingsManager.getData());
    mainSettingsManager.updateData(loadMainSettings);
    // ## Gamer Settings END ###########################
}

// Função default para carregar as configurações no backend
function defaultLoadSettings<T>(settingsPath: any, folder: string | null, type: 'project' | 'settings', cacheJson: T): T {
  try {
    const pathFileToSave = path.join(settingsPath, folder? path.join(`${folder}`, `${type}.gbasres`) : '');
    const settings = JSON.parse(fs.readFileSync(pathFileToSave, 'utf8'));
    return { ...cacheJson, ...settings }; ;
  } catch (error) {
    console.error('..: Erro ao ler configurações:', error);
    return { ...cacheJson }; // Retorna defaults se houver erro
  }
}