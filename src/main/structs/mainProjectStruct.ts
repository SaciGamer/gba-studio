import path from 'path';
import fs from 'fs';
import { createGenericSettingsStruct } from './projectSettingsStruct';
import { packageJson } from '@/main';
import { defaultMainSettings, defaultProjectSettings } from './defaultValuesInterface';
import { SettingsController } from '@/controllers/SettingsController';
import { IProjectSettings } from '@/interfaces/MainSettingsInterface';

// Controllers
let projectSettings = defaultProjectSettings;
const defaultContentGit = `build/\ncache/\n\n*.bak\n*.sav\n*.icloud\n\nuser_settings.gbasres`;

export function createProjectStruct(basePath: string): void {
  console.log('..: createProjectStruct basePath: ', basePath);
  const projectName = basePath.split(path.sep).filter(Boolean).pop() || '';
  projectSettings.name = projectName;
  projectSettings._version = packageJson.version;
  console.log('..: createProjectStruct projectName: ', projectSettings.name);

  console.log('..: Criando estrutura de pastas :..');
  // Estrutura de pastas
  const folders = ['assets', 'plugins', 'project'];
  const assets = ['avatars', 'backgrounds', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui'];
  const projects = ['backgrounds', 'emotes', 'fonts', 'musics', 'palettes', 'sprites'];
  const files = ['.gitignore', `${projectSettings.name}.gbaproj`];

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
  createGenericSettingsStruct(settingsPath, 'settings', defaultMainSettings);

  // Criação de arquivo do projeto e gitignore
  files.forEach(file => {
    if (file.endsWith('.gbaproj'))
      createGenericSettingsStruct(basePath, file, projectSettings);
    else if (file.endsWith('.gitignore')) {
      createGenericSettingsStruct(basePath, file, null, defaultContentGit);
    }
    else
      createGenericSettingsStruct(basePath, file);
  });

  console.log('..: Criando estrutura de pastas - END :..');
}