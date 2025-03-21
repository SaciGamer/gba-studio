import path from 'path';
import fs from 'fs';
import { createProjectSettingsStruct } from './projectSettingsStruct';
import { ProjectManager } from '@/managers/ProjectManager';
import { SettingsController } from '@/controllers/SettingsController';
import { packageJson } from '@/main';

// Controllers
const settingsController = SettingsController.getInstance();
const projectController = settingsController.getSettings('project') as ProjectManager;

const defaultContentGit = `build/\ncache/\n\n*.bak\n*.sav\n*.icloud\n\nuser_settings.gbasres`;

export function getMainFile() {
  return `${projectController.getProjectName()}.gbaproj`;
}

export function createProjectStruct(basePath: string): void {
  console.log('..: createProjectStruct basePath: ', basePath);
  const projectName = basePath.split(path.sep).filter(Boolean).pop() || '';
  projectController.setProjectName(projectName);
  projectController.updateData({ _version: packageJson.version });
  console.log('..: createProjectStruct projectName: ', projectController.getProjectName());
  
  console.log('..: Criando estrutura de pastas :..');
  // Estrutura de pastas
  const folders = ['assets', 'plugins', 'project'];
  const assets = ['avatars', 'backgrounds', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui'];
  const projects = ['backgrounds', 'emotes', 'fonts', 'musics', 'palettes', 'sprites'];
  const files = ['.gitignore', `${projectController.getProjectName()}.gbaproj`];

  // Criação de pastas
  folders.forEach(folder => {
    const folderPath = path.join(basePath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`..: Pasta criada: ${folderPath}`);
    }
  });

  // Criação de pastas de assets
  assets.forEach(assets => {
    const assetsPath = path.join(basePath, folders[0], assets);
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
      console.log(`..: Pasta do assets criada: ${folders[0]}\\${assetsPath}`);
    }
  });

  // Criação de pastas de project
  projects.forEach(projects => {
    const projectPath = path.join(basePath, folders[2], projects);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
      console.log(`..: Pasta do project criada: ${folders[0]}\\${projectPath}`);
    }
  });

  // Criação de arquivo de settings
  const settingsPath = path.join(basePath, folders[2]);
  createProjectSettingsStruct(settingsPath);

  // Criação de arquivo do projeto e gitignore
  files.forEach(file => {
    const filePath = path.join(basePath, file);
    if (!fs.existsSync(filePath)) {
      if (file.endsWith('.gbaproj'))
        fs.writeFileSync(filePath, JSON.stringify(projectController.getData(), null, 2));
      else if (file.endsWith('.gitignore'))
        fs.writeFileSync(filePath, defaultContentGit);
      else
        fs.writeFileSync(filePath, '');

      console.log(`..: Arquivo criado: ${filePath}`);
    }
  });

  console.log('..: Criando estrutura de pastas - END :..');
}