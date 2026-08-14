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
    const allResources = loadAllResourcesRecursively(directory);
    resources.push(...allResources);

    console.log('..: All settings loaded to FE:', resources);    
    console.log('..: All settings loaded to BE:', settingsController.getSettingsData('all'));
    
    return resources;

  } catch (error) {
    console.error('..: Erro ao carregar configurações:', error);
    throw error;
  }
}

function loadAllResourcesRecursively(dirPath: string): any[] {
  const resources: any[] = [];

  function walkDir(currentPath: string) {
    const files = fs.readdirSync(currentPath);

    files.forEach(file => {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith('.gbasres') || file.endsWith('.gbaproj')) {
        try {
          const data = loadSettingsFile(filePath);
          if (data) {
            resources.push(data);
            // settingsController.addNewItem(JSON.parse(data));
          }
        } catch (error) {
          console.error(`..: Erro ao carregar arquivo ${filePath}:`, error);
        }
      }
    });
  }

  walkDir(dirPath);
  return resources;
}

function loadSettingsFile(filePath: string): any | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return fileContent;
  } catch (error) {
    console.error(`..: Erro ao ler arquivo ${filePath}:`, error);
    return null;
  }
}