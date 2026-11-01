import path from 'path';
import fs from 'fs';
import { SettingsController } from '../controllers/SettingsController';
import { directoryPathProject } from '@/main';

// Controllers
const settingsController = SettingsController.getInstance();

export async function loadSettings(filePath: string): Promise<any[]>{
  console.log('..: Carregando configurações :..');
  console.log('..: filePath:', filePath);

  const directory = directoryPathProject || path.dirname(filePath);
  const resources: any[] = [];

  try {
    const allResources = await loadAllResourcesRecursively(directory);
    resources.push(...allResources);

    console.log('..: All settings loaded to FE:', resources);    
    console.log('..: All settings loaded to BE:', settingsController.getSettingsData('all'));
    
    return resources;

  } catch (error) {
    console.error('..: Erro ao carregar configurações:', error);
    throw error;
  }
}

async function loadAllResourcesRecursively(dirPath: string): Promise<any[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return loadAllResourcesRecursively(filePath);
    if (!entry.isFile() || (!entry.name.endsWith('.gbasres') && !entry.name.endsWith('.gbaproj'))) return [];
    const data = await loadSettingsFile(filePath);
    return data ? [data] : [];
  }));
  return nested.flat();
}

async function loadSettingsFile(filePath: string): Promise<any | null> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return fileContent;
  } catch (error) {
    console.error(`..: Erro ao ler arquivo ${filePath}:`, error);
    return null;
  }
}
