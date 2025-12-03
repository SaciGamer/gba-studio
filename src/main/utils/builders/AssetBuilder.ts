/**
 * Asset Builder - manages project assets (graphics, audio, etc.)
 * Copies and organizes assets into the build directory structure
 */

import fs from 'fs';
import path from 'path';
import { execFile } from "child_process";
import { promisify } from "util";
import isDev from "electron-is-dev";

const execFileAsync = promisify(execFile);

export interface AssetCopyOptions {
  overwrite?: boolean;
  preserveStructure?: boolean;
  verbose?: boolean;
}

export class AssetBuilder {
  private buildDir: string;
  private __dirname: string;

  constructor(dirname: string, buildDir: string) {
    this.__dirname = dirname;
    this.buildDir = buildDir;
  }

  /**
   * Copy all assets from project to build directory
   */
  public async copyAssets(
    sourceAssetDir: string,
    options: AssetCopyOptions = {}
  ): Promise<{ copiedCount: number; skippedCount: number }> {
    const { overwrite = true, preserveStructure = true, verbose = false } = options;

    if (!fs.existsSync(sourceAssetDir)) {
      console.warn('..: Asset directory not found:', sourceAssetDir);
      return { copiedCount: 0, skippedCount: 0 };
    }

    let copiedCount = 0;
    let skippedCount = 0;

    const walk = async (dir: string, relativeBase: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(dir, entry.name);
        const relativePath = path.join(relativeBase, entry.name);

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          await walk(sourcePath, relativePath);
        } else if (entry.isFile()) {
          // Sanitize filename for graphics to satisfy Butano tools (must start with lowercase and allowed chars)
          const ext = path.extname(sourcePath).toLowerCase();
          let fileName = entry.name;
          if (['.png', '.bmp', '.gif', '.jpg', '.jpeg'].includes(ext)) {
            fileName = this.sanitizeFileName(entry.name);
          }

          // Determine destination based on asset type
          const relForDest = preserveStructure ? path.join(path.dirname(relativePath), fileName) : fileName;
          const destPath = this.getAssetDestination(sourcePath, relForDest);

          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }

          if (!fs.existsSync(destPath) || overwrite) {
            fs.copyFileSync(sourcePath, destPath);

            await this.processAssets(sourcePath, destPath);
            
            if (verbose) {
              console.log('..: Copied asset:', relativePath);
            }
            copiedCount++;
          } else {
            if (verbose) {
              console.log('..: Skipped existing asset:', relativePath);
            }
            skippedCount++;
          }
        }
      }
    };

    await walk(sourceAssetDir, '');
    return { copiedCount, skippedCount };
  }

  private async processAssets(sourcePath: string, actualPath: string) {
    const bmpPath = await this.convertToBmp(actualPath);
    await this.createGraphicsJson(path.dirname(sourcePath), bmpPath);
  }

  /**
   * Determine destination path for asset based on type
   */
  private getAssetDestination(
    sourcePath: string,
    relativePath: string
  ): string {
    const ext = path.extname(sourcePath).toLowerCase();
    const baseDir = this.buildDir;

    // Categorize by extension
    if (['.png', '.bmp', '.gif', '.jpg', '.jpeg'].includes(ext)) {
      // Graphics/images
      return path.join(baseDir, 'graphics', relativePath);
    } else if (['.wav', '.mp3', '.ogg', '.mod', '.s3m'].includes(ext)) {
      // Audio files
      return path.join(baseDir, 'audio', relativePath);
    } else if (['.dat', '.bin'].includes(ext)) {
      // Binary data
      return path.join(baseDir, 'data', relativePath);
    } else {
      // Default to base assets directory
      return path.join(baseDir, 'assets', relativePath);
    }
  }

  /**
   * Copy specific asset types
   */
  public async copyGraphics(
    sourceDir: string,
    options: AssetCopyOptions = {}
  ): Promise<{ copiedCount: number; skippedCount: number }> {
    const destDir = path.join(this.buildDir, 'graphics');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    return this.copyFromTo(sourceDir, destDir, options);
  }

  /**
   * Copy audio assets
   */
  public async copyAudio(
    sourceDir: string,
    options: AssetCopyOptions = {}
  ): Promise<{ copiedCount: number; skippedCount: number }> {
    const destDir = path.join(this.buildDir, 'audio');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    return this.copyFromTo(sourceDir, destDir, options);
  }

  /**
   * Generic copy from source to destination
   */
  private async copyFromTo(
    sourceDir: string,
    destDir: string,
    options: AssetCopyOptions
  ): Promise<{ copiedCount: number; skippedCount: number }> {
    const { overwrite = true, verbose = false } = options;

    if (!fs.existsSync(sourceDir)) {
      return { copiedCount: 0, skippedCount: 0 };
    }

    let copiedCount = 0;
    let skippedCount = 0;

    const copyRecursive = (src: string, dst: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);

        if (entry.isDirectory()) {
          if (!fs.existsSync(dstPath)) {
            fs.mkdirSync(dstPath, { recursive: true });
          }
          copyRecursive(srcPath, dstPath);
        } else if (entry.isFile()) {
          if (!fs.existsSync(dstPath) || overwrite) {
            fs.copyFileSync(srcPath, dstPath);
            if (verbose) {
              console.log('..: Copied:', entry.name);
            }
            copiedCount++;
          } else {
            skippedCount++;
          }
        }
      }
    };

    copyRecursive(sourceDir, destDir);
    return { copiedCount, skippedCount };
  }

  /**
   * Get graphics directory path
   */
  public getGraphicsDir(): string {
    return path.join(this.buildDir, 'graphics');
  }

  /**
   * Get audio directory path
   */
  public getAudioDir(): string {
    return path.join(this.buildDir, 'audio');
  }

  /**
   * Get assets directory path
   */
  public getAssetsDir(): string {
    return path.join(this.buildDir, 'assets');
  }

  /**
   * Create a .json descriptor for a graphic asset
   */
  private async createGraphicsJson(assetPath: string, destDir: string) {
    const rel = assetPath.toLowerCase();
    let type = "sprite";

    if (rel.includes("background")) {
      type = "regular_bg";
    } else if (rel.includes("sprites")) {
      type = "sprite";
    }

    const jsonContent = {
      type,
      // file: path.basename(assetPath),
      // bpp: 4,
      // compression: "lz77"
    };

    const jsonPath = path.join(
      path.dirname(destDir), 
      path.basename(destDir, path.extname(destDir)) + ".json"
    );
    fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
  }

  /** 
   * Convert image to BMP format using sharp
   */
  private async convertToBmp(sourcePath: string) {
    const ext = path.extname(sourcePath).toLowerCase();

    // Only convert if source is not already BMP
    if (['.png', '.gif', '.jpg', '.jpeg'].includes(ext)) {
      const destPath = path.join(
        path.dirname(sourcePath), 
        path.basename(sourcePath, path.extname(sourcePath)) + ".bmp"
      );

      // Chama o LibreSprite em modo batch
      // await execFileAsync("libresprite", [
      //   "-b",
      //   sourcePath,
      //   "--save-as",
      //   destPath
      // ]);

      await this.convertWithMagick(sourcePath, destPath, "background");

      // Se o nome mudou, apaga o original
      if (sourcePath !== destPath && fs.existsSync(sourcePath)) {
        fs.rmSync(sourcePath);
      }

      return destPath;
    }

    return sourcePath;
  }

  private async convertWithMagick(sourcePath: string, destPath: string, mode: "title" | "background", customizedPalettePath?: string) {
    // Background (16 colors, 4bpp) remapeando para paleta customizada se 
    // magick indexed.png -colors 16 -depth 4 BMP3:output_4bpp.bmp
    // magick indexed.png -remap sua_paleta.png -depth 4 BMP3:output_remapped_4bpp.bmp

    // Title (256 colors, 8bpp)
    // magick indexed.png -colors 256 -depth 8 BMP3:output_8bpp.bmp
    // magick indexed.png -remap sua_paleta.png -depth 8 BMP3:output_remapped_8bpp.bmp

    let args: string[];

    const magickPath = isDev 
      ? path.join(this.__dirname, "tools", "image-magick", process.platform === "win32" ? "magick.exe" : "magick") 
      : path.join(process.resourcesPath, "bin", process.platform === "win32" ? "magick.exe" : "magick");

    switch (mode) {
      case "title":
        args = [
          sourcePath,
          customizedPalettePath ? "-remap" : "-colors",
          customizedPalettePath ? customizedPalettePath : "256",
          // "-depth", "8",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
      case "background":
        args = [
          sourcePath,
          "-colors", "16",
          // "-depth", "4",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
      default:
        args = [
          sourcePath,
          customizedPalettePath ? "-remap" : "-colors",
          customizedPalettePath ? customizedPalettePath : "256",
          // "-depth", "8",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
    }

    const { stdout, stderr } = await execFileAsync(magickPath, args);
    console.log("..: execFileAsync stdout:", stdout);
    console.log("..: execFileAsync stderr:", stderr);

    // const proc = spawn(magickPath, args);
    // proc.stdout.on("data", data => console.log(data.toString()));
    // proc.stderr.on("data", data => console.error(data.toString()));
    // proc.on("close", code => console.log("Processo finalizado com código", code));

    return destPath;

  }

  /**
   * Sanitize file name to meet Butano FileInfo.validate rules:
   * - lowercase letters only for first char
   * - allowed characters: lowercase letters, digits and underscore
   * - only one dot before the extension
   */
  private sanitizeFileName(original: string): string {
    // Separate base and extension (use last dot)
    const idx = original.lastIndexOf('.');
    const base = idx >= 0 ? original.slice(0, idx) : original;
    const ext = idx >= 0 ? original.slice(idx + 1) : '';

    // Normalize and remove diacritics
    let s = base.normalize('NFD').replace(/\p{Diacritic}/gu, '');

    // Replace invalid chars with underscore, keep lowercase letters and digits
    s = s.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();

    // Ensure starts with a lowercase letter
    if (!/^[a-z]/.test(s)) {
      s = 'a_' + s;
    }

    // Collapse multiple underscores
    s = s.replace(/_+/g, '_');

    // Ensure extension is lowercase
    const newExt = ext.toLowerCase();

    return newExt ? `${s}.${newExt}` : s;
  }
}

export default AssetBuilder;
