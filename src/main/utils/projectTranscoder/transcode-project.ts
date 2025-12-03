import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { TranscodeOptions, TranscodeResult } from '../types/BuildTypes';
import TemplateBuilder from '../builders/TemplateBuilder';
import ResourceBuilder from '../builders/ResourceBuilder';
import AssetBuilder from '../builders/AssetBuilder';
import { CppBuilder, GameConfig } from '../builders/CppBuilder';
import { packageJson } from '@/main';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Transcode project resources into build directory using Butano template structure
 * Converts .gbasres files to C source, copies assets, and sets up the build environment
 *
 * @param options - Transcode configuration options
 * @returns Result indicating success/failure and paths to generated files
 */
export async function transcodeProject(options: TranscodeOptions): Promise<TranscodeResult> {
  try {
    console.log('..: transcodeProject starting with options:', {
      projectDir: options.projectDir,
      outputDir: options.outputDir,
      projectName: options.projectName,
      includeAssets: options.includeAssets,
    });

    // Validate project directory exists
    if (!fs.existsSync(options.projectDir)) {
      throw new Error(`Project directory not found: ${options.projectDir}`);
    }

    // Setup paths
    const projectDir = options.projectDir;
    const outputDir = options.outputDir || path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-build');
    const includeAssets = options.includeAssets !== false;

    // Get project name - try from options first, then from project file
    let projectName = options.projectName || path.basename(projectDir);
    projectName = await extractProjectName(projectDir, projectName);

    // Locate template and tools
    const repoRoot = path.resolve(__dirname, '..', '..');
    const toolsRoot = path.join(repoRoot, '..', '..', 'tools');
    const templateDir = path.join(toolsRoot, 'butano', 'template');

    // Validate template exists
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template directory not found: ${templateDir}`);
    }

    console.log('..: Using template from:', templateDir);
    
    // Valid path and clean if same project
    prepareBuildDir(projectDir, outputDir);

    // Initialize template builder
    const templateBuilder = new TemplateBuilder({
      templateDir: templateDir,
      buildDir: outputDir,
      romTitle: projectName.toUpperCase().slice(0, 12),
      romCode: 'GBAS',
    });

    // Initialize build directory from template
    await templateBuilder.initializeBuildDirectory({
      projectDir: projectDir,
      projectName: projectName,
      targetDir: outputDir,
      romTitle: projectName.toUpperCase().slice(0, 12),
      romCode: 'GBAS',
    });

    console.log('..: Template build directory initialized');

    // Process resources (.gbasres files)
    const resourceBuilder = new ResourceBuilder(outputDir, templateDir);
    const projectResourceDir = path.join(projectDir, 'project');

    let resourceFiles: any[] = [];
    if (fs.existsSync(projectResourceDir)) {
      resourceFiles = await resourceBuilder.processResourceFiles(projectResourceDir);
      console.log('..: Processed', resourceFiles.length, 'resource files');

      // Generate resource header and registry
      if (resourceFiles.length > 0) {
        await resourceBuilder.writeResourceHeader(resourceFiles);
        await resourceBuilder.generateResourceRegistryClass(resourceFiles);
      }
    }

    // Copy assets if enabled
    let assetStats = { copiedCount: 0, skippedCount: 0 };
    if (includeAssets) {
      const assetBuilder = new AssetBuilder(path.resolve(__dirname, '..', '..', '..'), outputDir);
      const projectAssetsDir = path.join(projectDir, 'assets');

      if (fs.existsSync(projectAssetsDir)) {
        assetStats = await assetBuilder.copyAssets(projectAssetsDir, {
          overwrite: true,
          preserveStructure: false, // Estrutura de pastas
          verbose: false,
        });

        console.log('..: Copied', assetStats.copiedCount, 'assets');
      }
    }

    // Create Graphics Header by dir build output
    const buildDir = templateBuilder.getOutputDir();
    if (fs.existsSync(buildDir)) {
      await resourceBuilder.writeGraphicsHeader(buildDir);
    }

    // Generate C++ base project structure using CppBuilder
    const cppBuilder = new CppBuilder(outputDir, templateDir);
    const gameConfig: GameConfig = {
      projectName: projectName,
      authorName: 'GBA Studio',
      version: packageJson.version || '1.0.0',
      useThreads: false,  // Can be made configurable from FE later
      useAudio: true,     // Include audio support by default
      useGraphics: true,  // Include graphics support by default
    };

    await cppBuilder.generateProjectStructure(gameConfig);
    console.log('..: Generated C++ project structure with base Game class and managers');

    console.log('..: Transcode completed successfully');
    console.log('  - Output directory:', outputDir);
    console.log('  - Source files:', resourceFiles.length + 1); // resources + main.c
    console.log('  - Assets copied:', assetStats.copiedCount);

    return {
      success: true,
      message: 'Transcode complete',
      outputDir: outputDir,
      buildDir: outputDir,
      sourceFiles: resourceFiles.map((f) => f.filename),
    };
  } catch (err) {
    console.error('..: transcodeProject error:', err);
    return {
      success: false,
      message: String(err),
      outputDir: options.outputDir,
    };
  }
}

/**
 * Extract project name from project configuration files
 */
async function extractProjectName(projectDir: string, defaultName: string): Promise<string> {
  const projectFolder = path.join(projectDir, 'project');

  if (!fs.existsSync(projectFolder)) {
    return defaultName;
  }

  try {
    const files = fs.readdirSync(projectFolder);
    for (const f of files) {
      if (f.endsWith('.gbasres') || f.endsWith('.gbaproj')) {
        try {
          const content = fs.readFileSync(path.join(projectFolder, f), 'utf8');
          const obj = JSON.parse(content);
          if (obj._resourceType === 'project' && obj.name) {
            return obj.name;
          }
        } catch (e) {
          // ignore parse errors, continue searching
        }
      }
    }
  } catch (e) {
    console.warn('..: Could not extract project name from configuration:', e);
  }

  return defaultName;
}

/**
 * Generate main.c entry point
 */
async function generateMainC(sourceDir: string, projectName: string): Promise<void> {
  const mainC = `#include <gba_systemcalls.h>

/**
 * Auto-generated main entry point
 * Project: ${projectName}
 * 
 * This is the entry point for the GBA application.
 * Modify this file to implement your game logic.
 */

int main(void) {
    // Initialize system
    // TODO: Add initialization code here

    // Main loop
    while (1) {
        VBlankIntrWait();
        // TODO: Add game logic here
    }

    return 0;
}
`;

  const mainPath = path.join(sourceDir, 'main.c');
  fs.writeFileSync(mainPath, mainC, 'utf8');
  console.log('..: Generated main.c at:', mainPath);
}

/**
 * Overload for backward compatibility - accepts projectDir string instead of options
 */
export async function transcodeProjectLegacy(projectDir: string): Promise<any> {
  const result = await transcodeProject({
    projectDir: projectDir,
    includeAssets: true,
  });

  // Return legacy format for compatibility
  return {
    success: result.success,
    message: result.message,
    tempBuild: result.outputDir,
  };
}


/**
 * Function validate if is the same project
 */
function prepareBuildDir(projectDir: string, outputDir: string) {
  const markerFile = path.join(outputDir, '.project.json');

  // Se já existe buildDir, validar se é do mesmo projeto
  if (fs.existsSync(outputDir)) {
    let sameProject = false;

    if (fs.existsSync(markerFile)) {
      try {
        const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
        if (marker.projectDir === projectDir) {
          sameProject = true;
        }
      } catch {
        // se não conseguir ler, assume que não é o mesmo projeto
        // sameProject ainda estará false
      }
    }

    if (!sameProject) {
      // só limpa se for outro projeto
      // Clean and prepare output directory (retry on EBUSY)
      if (fs.existsSync(outputDir)) {
        const maxRetries = 5;
        let attempt = 0;
        while (fs.existsSync(outputDir) && attempt < maxRetries) {
          try {
            fs.rmSync(outputDir, { recursive: true, force: true });
            break;
          } catch (e: any) {
            attempt++;
            if (e && e.code === 'EBUSY') {
              console.warn(`..: EBUSY removing outputDir, retrying (${attempt}/${maxRetries})`);
              // wait a bit
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
              continue;
            }
            // Non-EBUSY error -> rethrow
            throw e;
          }
        }

        fs.mkdirSync(outputDir, { recursive: true });
      }
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Atualiza marcador
  fs.writeFileSync(markerFile, JSON.stringify({
    projectDir,
    lastBuild: new Date().toISOString()
  }, null, 2));
}




export default transcodeProject;
