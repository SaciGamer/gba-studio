/**
 * Template Builder - prepares project build directory from Butano template
 * Handles directory structure creation, Makefile configuration, etc.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { TemplateConfig, BuildConfig } from '../types/BuildTypes';
import type { RuntimeFeatureManifest } from './RuntimeFeatureManifest';

/** Make targets must be a single filename, without whitespace or make syntax. */
export function makeTargetName(projectName?: string): string {
  return (projectName || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'gba-project';
}

export class TemplateBuilder {
  private templateDir: string;
  private buildDir: string;

  constructor(config: TemplateConfig) {
    this.templateDir = config.templateDir;
    this.buildDir = config.buildDir;
  }

  /**
   * Initialize build directory from template
   */
  public async initializeBuildDirectory(buildConfig: BuildConfig, options: { deferNativeFiles?: boolean } = {}): Promise<void> {
    // Create base directory structure
    this.ensureDirectories();

    // Copy template structure
    await this.copyTemplateStructure(options.deferNativeFiles === true);

    // Update Makefile with project-specific settings
    await this.configureMakefile(buildConfig);

    console.log('..: TemplateBuilder initializeBuildDirectory finish at:', this.buildDir);
  }

  /**
   * Ensure all necessary directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.buildDir,
      path.join(this.buildDir, 'src'),
      path.join(this.buildDir, 'include'),
      path.join(this.buildDir, 'graphics'),
      path.join(this.buildDir, 'dmg_audio'),
      path.join(this.buildDir, 'audio'),
      path.join(this.buildDir, 'common'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Bundle Butano common font assets with generated projects; this keeps the
    // dialogue renderer self-contained when builds run from a temp directory.
    const commonSrc = path.resolve(this.templateDir, '..', 'common');
    const commonDst = path.join(this.buildDir, 'common');
    if (fs.existsSync(commonSrc)) this.copyRecursive(commonSrc, commonDst);
  }

  /**
   * Copy template files to build directory
   */
  private async copyTemplateStructure(deferNativeFiles = false): Promise<void> {
    const structureToCopy = [
      { src: 'Makefile', dst: 'Makefile' },
      { src: 'include', dst: 'include' },
      { src: 'graphics', dst: 'graphics' },
      { src: 'dmg_audio', dst: 'dmg_audio' },
      { src: 'audio', dst: 'audio' },
      { src: 'maps', dst: 'maps' },
      { src: 'src', dst: 'src' },
    ];

    for (const item of structureToCopy) {
      if (deferNativeFiles && ['include', 'src'].includes(item.src)) continue;
      const srcPath = path.join(this.templateDir, item.src);
      const dstPath = path.join(this.buildDir, item.dst);

      if (!fs.existsSync(srcPath)) {
        console.warn('..: Template file not found, skipping:', srcPath);
        continue;
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        this.copyRecursive(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  /** Copy an explicit native selection, retiring only files owned by this generator. */
  public copyNativeRuntime(manifest: RuntimeFeatureManifest, featureHeader: string): void {
    if (!manifest.selectionApplied) throw new Error('Native selection was not activated');
    const known = new Set<string>();
    for (const folder of ['src', 'include']) for (const file of fs.readdirSync(path.join(this.templateDir, folder))) {
      if (/\.(cpp|h)$/.test(file)) known.add(`${folder}/${file}`);
    }
    const files = [...manifest.sourceFiles, ...manifest.headerFiles].sort();
    const checked = (relative: string) => {
      if (!/^(src\/[^/\\]+\.cpp|include\/[^/\\]+\.h)$/.test(relative) || !known.has(relative)) throw new Error(`Invalid native selection file: ${relative}`);
      const absolute = path.resolve(this.buildDir, relative);
      if (!absolute.startsWith(path.resolve(this.buildDir) + path.sep)) throw new Error(`Native file escapes build directory: ${relative}`);
      return absolute;
    };
    const hash = createHash('sha256').update(`generator:${manifest.generatorVersion}\n${featureHeader}`);
    for (const relative of files) {
      checked(relative);
      hash.update(relative).update(fs.readFileSync(path.join(this.templateDir, relative)));
    }
    const fingerprint = hash.digest('hex');
    const marker = path.join(this.buildDir, '.native-files.json');
    let previous: { files: string[]; fingerprint?: string } = { files: [...known] };
    if (fs.existsSync(marker)) {
      const parsed = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (!Array.isArray(parsed.files) || parsed.files.some((file: unknown) => typeof file !== 'string')) throw new Error('Invalid previous native selection manifest');
      previous = parsed;
    }
    const current = new Set(files);
    for (const relative of previous.files) {
      const destination = checked(relative);
      if (!current.has(relative)) fs.rmSync(destination, { force: true });
    }
    if (previous.fingerprint !== fingerprint) {
      // Objects are named after project sources by the Butano Makefile. This
      // invalidates affected project code while preserving bn_* library cache.
      for (const relative of new Set([...previous.files, ...files])) {
        checked(relative);
        if (!relative.startsWith('src/')) continue;
        const stem = path.basename(relative, '.cpp');
        for (const extension of ['.o', '.d']) fs.rmSync(path.join(this.buildDir, 'build', stem + extension), { force: true });
      }
    }
    for (const relative of files) fs.copyFileSync(path.join(this.templateDir, relative), checked(relative));
    fs.writeFileSync(path.join(this.buildDir, 'include/gba_studio_features.h'), featureHeader, 'utf8');
    fs.writeFileSync(marker, JSON.stringify({ files, fingerprint }, null, 2) + '\n');
  }

  /**
   * Recursively copy directory
   */
  private copyRecursive(src: string, dst: string): void {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);

      if (entry.isDirectory()) {
        this.copyRecursive(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  /**
   * Configure Makefile with project-specific values
   */
  private async configureMakefile(buildConfig: BuildConfig): Promise<void> {
    const makefilePath = path.join(this.buildDir, 'Makefile');

    if (!fs.existsSync(makefilePath)) {
      console.warn('..: Makefile not found at:', makefilePath);
      return;
    }

    let content = fs.readFileSync(makefilePath, 'utf8');

    // Replace template values with project-specific ones
    content = content.replace(
      /^TARGET\s*:=.*$/m,
      `TARGET\t\t:= ${makeTargetName(buildConfig.projectName)}`
    );

    content = content.replace(
      /^ROMTITLE\s*:=\s*.*/m,
      `ROMTITLE\t:= ${buildConfig.romTitle || 'GBA STUDIO'}`
    );

    content = content.replace(
      /^ROMCODE\s*:=\s*.*/m,
      `ROMCODE\t\t:= ${buildConfig.romCode || 'GBAS'}`
    );

    fs.writeFileSync(makefilePath, content, 'utf8');
    console.log('..: Makefile configured for project:', buildConfig.projectName);
  }

  /**
   * Add asset directories to Makefile if needed
   */
  public addAssetDirectories(graphicsDirs: string[], audioDirs: string[]): void {
    const makefilePath = path.join(this.buildDir, 'Makefile');

    if (!fs.existsSync(makefilePath)) {
      return;
    }

    let content = fs.readFileSync(makefilePath, 'utf8');

    if (graphicsDirs.length > 0) {
      const graphicsLine = `GRAPHICS    := ${graphicsDirs.join(' ')}`;
      content = content.replace(/^GRAPHICS\s*:=\s*.*/m, graphicsLine);
    }

    if (audioDirs.length > 0) {
      const audioLine = `AUDIO       := ${audioDirs.join(' ')}`;
      content = content.replace(/^AUDIO\s*:=\s*.*/m, audioLine);
    }

    fs.writeFileSync(makefilePath, content, 'utf8');
  }

  /**
   * Get configured build directory
   */
  public getProjectBuildDir(): string {
    return this.buildDir;
  }

  /**
   * Get source directory path
   */
  public getSrcDir(): string {
    return path.join(this.buildDir, 'src');
  }

  /**
   * Get include directory path
   */
  public getIncludeDir(): string {
    return path.join(this.buildDir, 'include');
  }

  /**
   * Get graphics directory path
   */
  public getGraphicsDir(): string {
    return path.join(this.buildDir, 'graphics');
  }

  /**
   * Get build output directory path
   */
  public getOutputBuildDir(): string {
    return path.join(this.buildDir, 'build');
  }
}

export default TemplateBuilder;
