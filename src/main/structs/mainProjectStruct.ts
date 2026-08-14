import { packageJson } from '@/main';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { defaultMainSettings, defaultProjectSettings } from './defaultValuesInterface';
import { createGenericSettingsStruct } from './projectSettingsStruct';

// Controllers
let projectSettings = defaultProjectSettings;
const defaultContentGit = `build/\ncache/\n\n*.bak\n*.sav\n*.icloud\n\nuser_settings.gbasres`;

export function createProjectStruct(basePath: string, template?: string): void {
  console.log('..: createProjectStruct basePath:', basePath);
  const projectName = basePath.split(path.sep).filter(Boolean).pop() || '';
  projectSettings.name = projectName;
  projectSettings._version = packageJson.version;
  console.log('..: createProjectStruct projectName:', projectSettings.name);

  console.log('..: Criando estrutura de pastas :..');
  // Estrutura de pastas
  const folders = ['assets', 'plugins', 'project'];
  const assets = ['avatars', 'backgrounds', 'backgrounds-hd', 'emotes', 'fonts', 'musics', 'sounds', 'sprites', 'tilesets', 'ui'];
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

  // Cria apenas com template se selecionado
  if (template) {
    createProjectByTemplate(basePath, template);
    console.log('..: createProjectStruct copia de template - END :..');
    return;
  } 

  // Criação de arquivo de settings
  const settingsPath = path.join(basePath, folders[2]);
  createGenericSettingsStruct(settingsPath, 'settings', defaultMainSettings);
  // createGenericSettingsStruct(settingsPath, 'user_settings', defaultUserSettings);
  // createGenericSettingsStruct(settingsPath, 'variables', defaultVariablesSettings);

  console.log('..: Criando estrutura de pastas - END :..');
}

function createProjectByTemplate(basePath: string, template: string): void {
  // Copy template files when specific template ids are selected
  try {
    const repoRoot =  app.getAppPath();
    const copyRecursive = (src: string, dest: string) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (const e of entries) {
          copyRecursive(path.join(src, e), path.join(dest, e));
        }
      } else {
        // Skip copying any .gbaproj file so the newly-created project file remains unique
        if (path.extname(src).toLowerCase() === '.gbaproj') {
          console.log('..: Skipping .gbaproj during template copy:', src);
          return;
        }
        fs.copyFileSync(src, dest);
      }
    };

    // When the renderer requests the sample project, copy the prepared sample_project_example folder
    if (template === 'sample_project_example') {
      const templateDir = path.resolve(repoRoot, template);
      console.log('..: Copying sample_project_example from', templateDir);
      if (fs.existsSync(templateDir)) {
        copyRecursive(templateDir, basePath);
        console.log('..: sample_project_example template copied.');
      } else {
        console.warn('..: sample_project_example template not found at', templateDir);
      }
    }
  } catch (err) {
    console.error('Error copying template:', err);
  }
}