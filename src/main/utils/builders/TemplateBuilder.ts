/**
 * Template Builder - prepares project build directory from Butano template
 * Handles directory structure creation, Makefile configuration, etc.
 */

import fs from 'fs';
import path from 'path';
import { TemplateConfig, BuildConfig } from '../types/BuildTypes';

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
  public async initializeBuildDirectory(buildConfig: BuildConfig): Promise<void> {
    // Create base directory structure
    this.ensureDirectories();

    // Copy template structure
    await this.copyTemplateStructure();

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
      path.join(this.buildDir, 'maps'),
      path.join(this.buildDir, 'include'),
      path.join(this.buildDir, 'graphics'),
      path.join(this.buildDir, 'dmg_audio'),
      path.join(this.buildDir, 'audio'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Copy template files to build directory
   */
  private async copyTemplateStructure(): Promise<void> {
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
      /^TARGET\s*:=\s*\$\(notdir \$\(CURDIR\)\)/m,
      `TARGET\t\t:= ${buildConfig.projectName || 'gba-project'}`
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
  public getBuildDir(): string {
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
  public getOutputDir(): string {
    return path.join(this.buildDir, 'build');
  }
}

export default TemplateBuilder;
