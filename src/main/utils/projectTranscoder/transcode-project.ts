import { prepareBackgroundAnimationSheets } from '../builders/BackgroundAnimationAssets';
import fs from 'fs';
import { prepareAffineBackgrounds, materializeAffineBackgrounds } from '../builders/AffineBackgroundAssets';
import path from 'path';
import os from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { GameConfig, ResourceFile, TranscodeOptions, TranscodeResult } from '../types/BuildTypes';
import TemplateBuilder from '../builders/TemplateBuilder';
import ResourceBuilder from '../builders/ResourceBuilder';
import AssetBuilder from '../builders/AssetBuilder';
import { toRuntimeResource, validateRuntimeReferences, type RuntimeResource } from '../types/RuntimeResources';
import { preparePrefabSpawns } from '../builders/PrefabSpawns';
import { createRuntimeFeatureManifest, selectNativeRuntime } from '../builders/RuntimeFeatureManifest';

let activeAssetProcess: ChildProcess | null = null;
let activeAssetDone: Promise<void> | null = null;
let resolveActiveAssetDone: (() => void) | null = null;
let activeAssetCancelled = false;

/** Stops the asynchronous Butano asset-generation process, if one is running. */
export async function cancelActiveAssetGeneration(): Promise<boolean> {
  const proc = activeAssetProcess;
  const done = activeAssetDone;
  if (!proc || !proc.pid) return false;
  activeAssetCancelled = true;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const taskkill = spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true });
      taskkill.once('close', () => resolve());
      taskkill.once('error', () => resolve());
    });
  } else {
    proc.kill('SIGTERM');
  }

  await done;
  return true;
}
import { CppBuilder } from '../builders/CppBuilder';

// Obter o caminho do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.ELECTRON_IS_DEV !== undefined
  ? Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
  : process.defaultApp === true;
const packageJsonPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

/**
 * Transcode project resources into build directory using Butano template structure
 * Converts .gbasres files to C source, copies assets, and sets up the build environment
 *
 * @param options - Transcode configuration options
 * @returns Result indicating success/failure and paths to generated files
 */
export async function transcodeProject(options: TranscodeOptions): Promise<TranscodeResult> {
  let describeFailure = (error: unknown) => String(error);
  const progress = (message: string, key: string, params?: Record<string, string | number>) => options.onProgress?.(`>> ${message}\n`, `compiler.${key}`, params);
  try {
    progress('Validando projeto e preparando transcodificação...', 'validate');
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
    const localToolsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'tools');
    const toolsRoot = isDev || fs.existsSync(localToolsRoot)
      ? localToolsRoot
      : path.join(process.resourcesPath, "bin", 'tools');
    const templateDir = path.join(toolsRoot , 'butano', 'template');

    // Validate template exists
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template directory not found: ${templateDir}`);
    }

    console.log('..: Using template from:', templateDir);
    
    // Valid path and clean if same project
    progress('Preparando diretório de build e template...', 'template');
    prepareBuildDir(options.markerProjectDir || projectDir, outputDir);

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
    }, { deferNativeFiles: true });

    console.log('..: Template build directory initialized');

    // Process resources (.gbasres files)
    const resourceBuilder = new ResourceBuilder(outputDir, templateDir);
    describeFailure = error => resourceBuilder.describeEventFailure(error);
    const projectResourceDir = path.join(projectDir, 'project');
    const gameConfig: GameConfig = {
      projectName: projectName,
      authorName: 'GBA Studio',
      version: packageJson.version || '1.0.0',
      useThreads: false,  // Can be made configurable from FE later
      useAudio: true,     // Include audio support by default
      useGraphics: true,  // Include graphics support by default
    };

    let resourceFiles: ResourceFile[] = [];
    if (fs.existsSync(projectResourceDir)) {
      progress('Lendo recursos e preparando headers de cenas, scripts e configurações...', 'resources');
      resourceFiles = await resourceBuilder.processResourceFiles(projectResourceDir);
      console.log('..: Processed', resourceFiles.length, 'resource files');

    }

    preparePrefabSpawns(resourceFiles);
    prepareBackgroundAnimationSheets(resourceFiles);

    // Copy assets if enabled
    let assetStats = { copiedCount: 0, skippedCount: 0 };
    const assetBuilder = new AssetBuilder(path.resolve(__dirname, '..', '..', '..'), outputDir);
    if (includeAssets) {
      progress('Convertendo imagens e preparando assets de áudio...', 'assets');
      const projectAssetsDir = path.join(projectDir, 'assets');

      // Missing defaults belong to preparation, never to the saved project.
      const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
      const defaultUiDir = path.join(projectRoot, 'src', 'renderer', 'frontend', 'src', 'img');
      const migratedSampleRoot = path.join(projectRoot, 'templateEngineGame', 'sample_project_example');
      const sampleRoot = fs.existsSync(migratedSampleRoot)
        ? migratedSampleRoot
        : path.join(projectRoot, 'sample_project_example');
      const sampleUiDir = path.join(sampleRoot, 'assets', 'ui');

      if (fs.existsSync(projectAssetsDir)) {
        assetStats = await assetBuilder.copyAssets(projectAssetsDir, resourceFiles,
          {
            overwrite: true,
            preserveStructure: false, // Estrutura de pastas
            verbose: false,
            onProgress: (message, key, name) => progress(message, key, { name }),
          }
        );

        console.log('..: Copied', assetStats.copiedCount, 'assets');
      }
      const trackerProjects = assetBuilder.materializeTrackerProjects(path.join(projectDir, 'project', 'musics'));
      assetStats.copiedCount += trackerProjects;
      if (trackerProjects) progress(`Preparando ${trackerProjects} música(s) .gbatracker para Butano...`, 'assets');
      // Game defaults have GBA sprite dimensions; editor icons can be 24x24.
      await assetBuilder.prepareUiDefaults(projectAssetsDir, [sampleUiDir, defaultUiDir]);
      const projectSettings = resourceFiles.find(file => file.jsonContent?._resourceType === 'settings')?.jsonContent;
      progress('Gerando fontes e imagens de diálogo...', 'fonts');
      await assetBuilder.applyFontOverrides(projectAssetsDir, projectSettings);
      await assetBuilder.materializeDialogueFrame(projectSettings?.uiFrameImage || 'frame.png');
      progress('Gerando imagens das camadas e aplicando edições de tiles...', 'layers');
      const derivedResources = await assetBuilder.materializeTileLayerEdits(resourceFiles, options.parallel);
      resourceFiles.push(...derivedResources.map(jsonContent => ({ resourceName: '', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent })));
      if (derivedResources.length) console.log('..: Materialized', derivedResources.length, 'edited background layer(s)');
    }

    // Event generated effects are static, build-time PCM assets: Maxmod loads
    // them from the soundbank just like authored WAV files.
    const generatedSoundCount = resourceBuilder.prepareGeneratedEventSounds(
      resourceFiles,
      path.join(templateBuilder.getProjectBuildDir(), 'audio'),
    );
    if (generatedSoundCount) progress(`Gerando ${generatedSoundCount} efeito(s) sonoro(s) dos eventos...`, 'audio');
    const projectSfxCount = resourceBuilder.prepareProjectSfxSounds(
      resourceFiles,
      path.join(projectDir, 'project', 'sounds'),
      path.join(templateBuilder.getProjectBuildDir(), 'audio'),
    );
    if (projectSfxCount) progress(`Preparando ${projectSfxCount} projeto(s) .gbasfx para Butano...`, 'audio');

    const animationSheets = await assetBuilder.materializeBackgroundAnimations(resourceFiles, path.join(projectDir, 'assets'));
    resourceFiles.push(...animationSheets.map(jsonContent => ({ resourceName: '', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent })));

    const affineBackgroundPlans = prepareAffineBackgrounds(resourceFiles, path.join(outputDir, 'graphics'));
    const preparedResources = resourceFiles.map(file => toRuntimeResource(file.jsonContent)).filter((resource): resource is RuntimeResource => resource !== null);
    validateRuntimeReferences(preparedResources);
    for (const resource of preparedResources) {
      if (resource._resourceType !== 'background' && resource._resourceType !== 'sprite') continue;
      const graphic = path.join(outputDir, 'graphics', resource.graphicsName);
      if (!assetBuilder.hasPreparedGraphic(resource.graphicsName) || !fs.existsSync(graphic + '.bmp') || !fs.existsSync(graphic + '.json')) {
        throw new Error(`${resource._resourceType} ${resource.id}: materialized graphic not found (${resource.graphicsName}.bmp)`);
      }
    }

    // Resolve composed image cells against Butano's optimized tile table before
    // projecting editor recipes to runtime resources and emitting their headers.
    const buildDir = templateBuilder.getProjectBuildDir();
    const outputBuildDir = templateBuilder.getOutputBuildDir();
    if (fs.existsSync(buildDir)) {
      progress('Gerando gráficos, áudio e headers do Butano...', 'butano');
      await generateButanoAssetHeaders(buildDir, outputBuildDir, toolsRoot, options.onProgress);
      assetBuilder.finalizeTileAnimations(resourceFiles, outputBuildDir);
      materializeAffineBackgrounds(affineBackgroundPlans, outputBuildDir);
    }

    // Preparation (including all parallel layer jobs) is complete. Emit once.
    progress('Atualizando headers com os frames e imagens gerados...', 'updateHeaders');
    for (const file of resourceFiles) {
      const scene = file.jsonContent as any;
      if (scene?._resourceType !== 'scene' || !Array.isArray(scene.tileAnimations)) continue;
      for (const [index, animation] of scene.tileAnimations.entries()) {
        const layerId = Number.isInteger(Number(animation?.layerId)) ? Math.max(0, Math.min(3, Math.trunc(Number(animation.layerId)))) : 0;
        const layer = (Array.isArray(scene.backgrounds) ? scene.backgrounds : []).find((candidate: any) => Number(candidate?.layerId) === layerId);
        if (!layer?.backgroundId) console.warn(`..: Ignoring tile animation ${animation?.name || animation?.id || index} in scene ${scene.name || scene.id}: layer ${layerId} has no background`);
      }
    }
    const runtimeResources = resourceFiles.map(file => toRuntimeResource(file.jsonContent)).filter((resource): resource is RuntimeResource => resource !== null);
    validateRuntimeReferences(runtimeResources);
    const selection = selectNativeRuntime(createRuntimeFeatureManifest(runtimeResources, options.runtimeMode));
    templateBuilder.copyNativeRuntime(selection.manifest, selection.featureHeader);
    fs.writeFileSync(path.join(outputDir, 'runtime-feature-manifest.json'), JSON.stringify(selection.manifest, null, 2) + '\n');
    const runtimeFiles = runtimeResources.map(resource => resourceBuilder.processRuntimeResource(resource));
    resourceFiles = runtimeFiles;
    await resourceBuilder.writeScriptSourceMap();
    // The registry must be emitted after derived layer resources have been added.
    progress('Preparando headers de recursos e registro do projeto...', 'registry');
    await resourceBuilder.writeResourceHeader(runtimeFiles);
    await resourceBuilder.generateResourceRegistryClass(runtimeFiles, gameConfig);

    progress('Validando referências de animações e músicas...', 'references');
    resourceBuilder.validateTileAnimationReferences(resourceFiles, outputBuildDir);
    resourceBuilder.validateMusicReferences(resourceFiles, outputBuildDir);

    let graphicHeaderGeneratedByButano: string[] = [];
    if (fs.existsSync(outputBuildDir)) {
      progress('Preparando header de itens gráficos...', 'graphicsHeader');
      graphicHeaderGeneratedByButano = await resourceBuilder.writeGraphicsHeader(outputBuildDir);
    }

    // Generate C++ base project structure using CppBuilder
    const cppBuilder = new CppBuilder(outputDir, templateDir, graphicHeaderGeneratedByButano);
    progress('Gerando código C++ e preparando compilação da ROM...', 'cpp');
    await cppBuilder.generateProjectStructure(gameConfig, selection.manifest.sourceFiles);
    console.log('..: Generated C++ project structure with base Game class and managers');

    console.log('..: Transcode completed successfully');
    console.log('  - Output directory:', outputDir);
    console.log('  - Native source files:', selection.manifest.sourceFiles.length);
    console.log('  - Resource headers:', resourceFiles.length);
    console.log('  - Assets copied:', assetStats.copiedCount);

    return {
      success: true,
      message: '>> Transcode complete',
      outputDir: outputDir,
      buildDir: outputDir,
      sourceFiles: selection.manifest.sourceFiles.map(file => path.join(outputDir, file)),
    };
  } catch (err) {
    console.error('..: transcodeProject error:', err);
    return {
      success: false,
      message: describeFailure(err),
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
async function generateButanoAssetHeaders(buildDir: string, outputBuildDir: string, toolsRoot: string, onProgress?: (message: string) => void): Promise<void> {
  const assetToolPath = path.join(toolsRoot, 'butano', 'butano', 'tools', 'butano_assets_tool.py');
  const graphicsDir = path.join(buildDir, 'graphics');
  const audioDir = path.join(buildDir, 'audio');
  const dmgAudioDir = path.join(buildDir, 'dmg_audio');

  if (!fs.existsSync(assetToolPath)) {
    console.warn('..: Butano asset tool not found, skipping asset generation:', assetToolPath);
    return;
  }

  // The output directory contains both project artifacts and Butano library
  // objects. Clean only artifacts owned by the project so unchanged library
  // objects remain incremental between builds.
  cleanProjectBuildArtifacts(outputBuildDir);

  for (const dir of [outputBuildDir, buildDir, graphicsDir, audioDir, dmgAudioDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const gritExecutable = resolveToolExecutable('grit');
  const audioToolExecutable = resolveToolExecutable('mmutil');
  const pythonExecutable = process.env.PYTHON || 'python';

  const args = [
    '-u', '-B', assetToolPath,
    '--grit', gritExecutable,
    '--audio', audioDir,
    '--audio_backend', 'maxmod',
    '--audio_tool', audioToolExecutable,
    '--dmg_audio', dmgAudioDir,
    '--dmg_audio_backend', 'default',
    '--graphics', graphicsDir,
    '--build', outputBuildDir,
  ];

  const exitCode = await new Promise<number>((resolve, reject) => {
    const proc = spawn(pythonExecutable, args, {
      cwd: buildDir,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    activeAssetProcess = proc;
    activeAssetCancelled = false;
    activeAssetDone = new Promise<void>((done) => { resolveActiveAssetDone = done; });
    proc.stdout?.on('data', (data) => { const message = data.toString(); console.log(message); onProgress?.(message); });
    proc.stderr?.on('data', (data) => { const message = data.toString(); console.warn(message); onProgress?.(message); });
    proc.once('error', reject);
    proc.once('close', (code) => {
      activeAssetProcess = null;
      resolveActiveAssetDone?.();
      resolveActiveAssetDone = null;
      activeAssetDone = null;
      resolve(code ?? 1);
    });
  });

  if (activeAssetCancelled) throw new Error('Butano asset generation cancelled.');
  if (exitCode !== 0) {
    throw new Error(`Butano asset generation failed with exit code ${exitCode}.`);
  }

  console.log('..: Butano asset generation completed for:', buildDir);
}

function cleanProjectBuildArtifacts(outputBuildDir: string): void {
  if (!fs.existsSync(outputBuildDir)) return;

  const projectArtifact = /(?:_bn_gfx\.(?:s|o|d)|_bn_[^/]+_graphics_file_info\.txt$|^bn_ofiles\.txt$|bn_(?:regular_bg_items|direct_bitmap_items|sprite_items|palette_bitmap_items)_[^/]+\.h$|^(?:event_[^/]+|game|graphics_manager|main|resource_registry|script_[^/]+|startup)\.(?:o|d|cpp|h|txt)$)/i;
  const projectAudioArtifact = /^(?:bn_(?:audio_soundbank|sound_items|music_items)(?:\.|_|$)|_bn_(?:maxmod|aas)_audio_files_info\.txt$)/i;

  for (const entry of fs.readdirSync(outputBuildDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!projectArtifact.test(entry.name) && !projectAudioArtifact.test(entry.name)) continue;
    fs.rmSync(path.join(outputBuildDir, entry.name), { force: true });
  }
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
