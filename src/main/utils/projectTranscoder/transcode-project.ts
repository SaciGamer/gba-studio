import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GameConfig, TranscodeOptions, TranscodeResult } from '../types/BuildTypes';
import TemplateBuilder from '../builders/TemplateBuilder';
import ResourceBuilder from '../builders/ResourceBuilder';
import AssetBuilder from '../builders/AssetBuilder';
import { CppBuilder } from '../builders/CppBuilder';
import { packageJson } from '@/main';
import isDev from 'electron-is-dev';

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
    const toolsRoot = isDev 
      ? path.resolve(__dirname, '..', '..', '..', '..', 'tools') 
      : path.join(process.resourcesPath, "bin", 'tools');
    const templateDir = path.join(toolsRoot , 'butano', 'template');

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
    const gameConfig: GameConfig = {
      projectName: projectName,
      authorName: 'GBA Studio',
      version: packageJson.version || '1.0.0',
      useThreads: false,  // Can be made configurable from FE later
      useAudio: true,     // Include audio support by default
      useGraphics: true,  // Include graphics support by default
    };

    let resourceFiles: any[] = [];
    if (fs.existsSync(projectResourceDir)) {
      resourceFiles = await resourceBuilder.processResourceFiles(projectResourceDir);
      console.log('..: Processed', resourceFiles.length, 'resource files');

      // Generate resource header and registry
      if (resourceFiles.length > 0) {
        await resourceBuilder.writeResourceHeader(resourceFiles);
        await resourceBuilder.generateResourceRegistryClass(resourceFiles, gameConfig);
      }
    }

    // Copy assets if enabled
    let assetStats = { copiedCount: 0, skippedCount: 0 };
    if (includeAssets) {
      const assetBuilder = new AssetBuilder(path.resolve(__dirname, '..', '..', '..'), outputDir);
      const projectAssetsDir = path.join(projectDir, 'assets');

      if (fs.existsSync(projectAssetsDir)) {
        assetStats = await assetBuilder.copyAssets(projectAssetsDir, resourceFiles,
          {
            overwrite: true,
            preserveStructure: false, // Estrutura de pastas
            verbose: false,
          }
        );

        console.log('..: Copied', assetStats.copiedCount, 'assets');
      }
    }

    // Generate Butano assets before reading generated graphic headers.
    const buildDir = templateBuilder.getProjectBuildDir();
    const outputBuildDir = templateBuilder.getOutputBuildDir();

    if (fs.existsSync(buildDir)) {
      await generateButanoAssetHeaders(buildDir, outputBuildDir, toolsRoot);
    }

    let graphicHeaderGeneratedByButano: string[] = [];
    if (fs.existsSync(outputBuildDir)) {
      graphicHeaderGeneratedByButano = await resourceBuilder.writeGraphicsHeader(outputBuildDir);
    }

    // Generate C++ base project structure using CppBuilder
    const cppBuilder = new CppBuilder(outputDir, templateDir, graphicHeaderGeneratedByButano);
    await cppBuilder.generateProjectStructure(gameConfig);
    console.log('..: Generated C++ project structure with base Game class and managers');

    console.log('..: Transcode completed successfully');
    console.log('  - Output directory:', outputDir);
    console.log('  - Source files:', resourceFiles.length + 1); // resources + main.c
    console.log('  - Assets copied:', assetStats.copiedCount);

    return {
      success: true,
      message: '>> Transcode complete',
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
 * @param projectDir - The original project directory
 * @param defaultName - Default name to use if no project name is found
 * @returns The extracted project name or the default name
 */
async function extractProjectName(projectDir: string, defaultName: string): Promise<string> {
  const candidateDirs = [projectDir, path.join(projectDir, 'project')].filter(Boolean);

  for (const candidateDir of candidateDirs) {
    if (!fs.existsSync(candidateDir)) {
      continue;
    }

    try {
      const files = fs.readdirSync(candidateDir);
      for (const f of files) {
        if (!f.endsWith('.gbaproj') && !f.endsWith('.gbasres')) {
          continue;
        }

        try {
          const filePath = path.join(candidateDir, f);
          const content = fs.readFileSync(filePath, 'utf8');
          const obj = JSON.parse(content);
          if (obj._resourceType === 'project' && obj.name) {
            return obj.name;
          }
        } catch (e) {
          // ignore parse errors, continue searching
        }
      }
    } catch (e) {
      console.warn('..: Could not inspect project configuration directory:', candidateDir, e);
    }
  }

  return defaultName;
}

/**
 * Overload for backward compatibility - accepts projectDir string instead of options
 * @param projectDir - The original project directory
 * @returns Result indicating success/failure and paths to generated files
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
 * Resolve the executable path for a given tool, checking environment variables and system PATH
 * @param toolName - The name of the tool to resolve (e.g., 'grit', 'mmutil')
 * @returns The resolved path to the executable, or the tool name if not found
 */
function resolveToolExecutable(toolName: string): string {
  const executableName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  checkDevkitPro();
  return path.join(process.env.DEVKITPRO!, 'tools', 'bin', executableName);
}

/**
 * This function generates the Butano asset headers by invoking the Butano asset tool.
 * It ensures that the necessary directories exist and handles the execution of the tool.
 * @param buildDir - The build directory where the Butano asset headers will be generated
 * @param outputBuildDir - The output build directory where the generated headers will be placed 
 * @param toolsRoot - The toolsRoot directory where have the butano tools
 * @returns 
 */
async function generateButanoAssetHeaders(buildDir: string, outputBuildDir: string, toolsRoot: string): Promise<void> {
  const assetToolPath = path.join(toolsRoot, 'butano', 'butano', 'tools', 'butano_assets_tool.py');
  const graphicsDir = path.join(buildDir, 'graphics');
  const audioDir = path.join(buildDir, 'audio');
  const dmgAudioDir = path.join(buildDir, 'dmg_audio');

  if (!fs.existsSync(assetToolPath)) {
    console.warn('..: Butano asset tool not found, skipping asset generation:', assetToolPath);
    return;
  }

  for (const dir of [outputBuildDir, buildDir, graphicsDir, audioDir, dmgAudioDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const gritExecutable = resolveToolExecutable('grit');
  const audioToolExecutable = resolveToolExecutable('mmutil');
  const pythonExecutable = process.env.PYTHON || 'python';

  const result = spawnSync(
    pythonExecutable,
    [
      '-B',
      assetToolPath,
      '--grit', gritExecutable,
      '--audio', audioDir,
      '--audio_backend', 'maxmod',
      '--audio_tool', audioToolExecutable,
      '--dmg_audio', dmgAudioDir,
      '--dmg_audio_backend', 'default',
      '--graphics', graphicsDir,
      '--build', outputBuildDir,
    ],
    {
      cwd: buildDir,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Butano asset generation failed with exit code ${result.status}.`);
  }

  console.log('..: Butano asset generation completed for:', buildDir);
}

/**
 * Function validate if is the same project
 * @param projectDir - The original project directory
 * @param outputDir - The output build directory
 * @returns void
 * 
 * This function checks if the output directory already exists and if it corresponds to the same project.
 * If it is a different project, it will clean the output directory before proceeding.
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

function checkDevkitPro() {
  const devkitPro = process.env.DEVKITPRO;
  const devkitArm = process.env.DEVKITARM;

  if (!devkitPro || !devkitArm) {
    throw new Error("DevkitPro não encontrado. Instale e configure DEVKITPRO/DEVKITARM.");
  }

  const gccPath = path.join(devkitArm, 'bin', process.platform === 'win32' ? 'arm-none-eabi-gcc.exe' : 'arm-none-eabi-gcc');
  if (!fs.existsSync(gccPath)) {
    throw new Error("arm-none-eabi-gcc não encontrado. Verifique a instalação do DevkitPro.");
  }
}

export default transcodeProject;
