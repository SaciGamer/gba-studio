/**
 * Asset Builder - manages project assets (graphics, audio, etc.)
 * Copies and organizes assets into the build directory structure
 */

import fs from 'fs';
import path from 'path';
import { execFile } from "child_process";
import { promisify } from "util";
import { JsonResourceDefault, ResourceFile } from '../types/BuildTypes';

const execFileAsync = promisify(execFile);
// AssetBuilder is also used by build verification outside Electron.  Its tool
// lookup needs the same answer as electron-is-dev without requiring Electron
// merely to load this file.
const isDev = process.env.ELECTRON_IS_DEV !== undefined
  ? Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
  : process.defaultApp === true;

export interface AssetCopyOptions {
  overwrite?: boolean;
  preserveStructure?: boolean;
  verbose?: boolean;
}

export class AssetBuilder {
  private buildDir: string;
  private __dirname: string;
  private readonly magickPath?: string;

  constructor(dirname: string, buildDir: string, magickPath?: string) {
    this.__dirname = dirname;
    this.buildDir = buildDir;
    this.magickPath = magickPath;
  }

  /**
   * Copy all assets from project to build directory
   */
  public async copyAssets(
    sourceAssetDir: string,
    resourceFiles: ResourceFile[],
    options: AssetCopyOptions = {}
  ): Promise<{ copiedCount: number; skippedCount: number }> {
    const { overwrite = true, preserveStructure = true, verbose = false } = options;
    if (!fs.existsSync(sourceAssetDir)) {
      console.warn('..: Asset directory not found:', sourceAssetDir);
      return { copiedCount: 0, skippedCount: 0 };
    }

    let copiedCount = 0;
    let skippedCount = 0;

    const walk = async (dir: string, relativeBase: string, resourceFiles: ResourceFile[]) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(dir, entry.name);
        const relativePath = path.join(relativeBase, entry.name);

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          await walk(sourcePath, relativePath, resourceFiles);
        } else if (entry.isFile()) {
          // Sanitize filename for graphics to satisfy Butano tools (must start with lowercase and allowed chars)
          const ext = path.extname(sourcePath).toLowerCase();
          let filename = entry.name;
          if (['.png', '.bmp', '.gif', '.jpg', '.jpeg'].includes(ext)) {
            filename = this.sanitizeFilename(entry.name);
          }

          // Determine destination based on asset type
          const relForDest = preserveStructure ? path.join(path.dirname(relativePath), filename) : filename;
          const destPath = this.getAssetDestination(sourcePath, relForDest);

          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }

          if (!fs.existsSync(destPath) || overwrite) {
            fs.copyFileSync(sourcePath, destPath);

            const resourceFile = resourceFiles.find(r => r.jsonContent?.filename && this.sanitizeFilename(r.jsonContent.filename) === filename);
            await this.processAssets(sourcePath, destPath, relativeBase, resourceFile);
            
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

    await walk(sourceAssetDir, '', resourceFiles);
    return { copiedCount, skippedCount };
  }

  /**
   * Replaces the build-only common font bitmap with a project-selected mapped
   * font. The project asset itself is never modified; an empty setting keeps
   * the bundled Butano common font as the fallback.
   */
  public async applyFontOverrides(projectAssetsDir: string, settings: any): Promise<void> {
    const overrides = [
      ['font8x8Image', 'common_fixed_8x8_font.bmp', 8],
      ['font8x16Image', 'common_fixed_8x16_font.bmp', 16],
      ['font8x8VariablesImage', 'common_variable_8x8_font.bmp', 8],
      ['font8x16VariablesImage', 'common_variable_8x16_font.bmp', 16],
      ['font16x16VariablesImage', 'common_variable_16x16_font.bmp', 16],
    ] as const;
    const fontsDir = path.join(projectAssetsDir, 'fonts');
    const commonGraphicsDir = path.join(this.buildDir, 'common', 'graphics');
    if (!fs.existsSync(fontsDir)) return;
    fs.mkdirSync(commonGraphicsDir, { recursive: true });

    for (const [settingKey, targetFilename, height] of overrides) {
      const selected = typeof settings?.[settingKey] === 'string' ? settings[settingKey] : '';
      if (!selected || path.basename(selected) !== selected) continue;
      const sourcePath = path.join(fontsDir, selected);
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
      const targetPath = path.join(commonGraphicsDir, targetFilename);
      await this.convertFontWithMagick(sourcePath, targetPath);
      // Butano discovers graphics through the descriptor beside the bitmap.
      // Keep the same metadata used by the bundled common fonts, regardless
      // of whether the selected source was PNG, BMP, or another supported image.
      fs.writeFileSync(
        path.join(commonGraphicsDir, targetFilename.replace(/\.bmp$/i, '.json')),
        JSON.stringify({ type: 'sprite', height }, null, 2),
      );
    }
  }

  private async convertFontWithMagick(sourcePath: string, destinationPath: string): Promise<void> {
    await execFileAsync(this.getMagickPath(), [
      sourcePath,
      '-background', 'none',
      '-alpha', 'on',
      '-colors', '256',
      '-compress', 'None',
      '-type', 'Palette',
      `BMP3:${destinationPath}`,
    ]);
  }

  /**
   * Replays each edited layer recipe into a BMP used only by the current build.
   * The source asset remains untouched and the generated background is exposed
   * as a new in-memory resource by the caller.
   */
  public async materializeTileLayerEdits(resourceFiles: ResourceFile[]): Promise<JsonResourceDefault[]> {
    const graphicsDir = this.getGraphicsDir();
    const derived: JsonResourceDefault[] = [];
    const scenes = resourceFiles.filter(file => file.jsonContent?._resourceType === 'scene');
    const backgrounds = resourceFiles.filter(file => file.jsonContent?._resourceType === 'background');
    const paletteResources = resourceFiles.filter(file => file.jsonContent?._resourceType === 'palette');
    const paletteSettings = resourceFiles.find(file => file.jsonContent?._resourceType === 'palettes')?.jsonContent as any;
    const settings = resourceFiles.find(file => file.jsonContent?._resourceType === 'settings')?.jsonContent as any;
    const paletteDirectory = path.join(this.buildDir, '.tile-palettes');
    const palettePaths = new Map<string, string>();
    const defaultPaletteId = Array.isArray(settings?.paletteIds) ? settings.paletteIds.find((id: unknown) => typeof id === 'string') : undefined;
    const paletteDefinitions = [
      ...paletteResources.map(file => file.jsonContent),
      ...(Array.isArray(paletteSettings?.palettes) ? paletteSettings.palettes : []),
    ];
    if (paletteDefinitions.length) fs.mkdirSync(paletteDirectory, { recursive: true });
    for (const palette of paletteDefinitions) {
      if (typeof palette?.id !== 'string' || !Array.isArray(palette.colors)) continue;
      const palettePath = path.join(paletteDirectory, `${this.sanitizeFilename(palette.id)}.png`);
      await this.createPaletteImage(palettePath, palette.colors);
      palettePaths.set(palette.id, palettePath);
    }

    for (const sceneFile of scenes) {
      const scene = sceneFile.jsonContent as any;
      if (!Array.isArray(scene.backgrounds)) continue;

      for (const layer of scene.backgrounds) {
        const hasTileMap = Array.isArray(layer.tileMap) && layer.tileMap.some((row: unknown) => Array.isArray(row) && row.some(tile => Number(tile) >= 0));
        const hasColorize = Array.isArray(layer.tilePaletteIds) && layer.tilePaletteIds.some((row: unknown) => Array.isArray(row) && row.some(paletteId => typeof paletteId === 'string' && paletteId !== '__original__'));
        if (!hasTileMap && !hasColorize) continue;
        const source = backgrounds.find(file => file.jsonContent?.id === layer.backgroundId)?.jsonContent;
        const tilesetId = layer.selectedTilesetId ?? scene.selectedTilesetId;
        if (hasTileMap && !tilesetId) {
          console.warn('..: Skipping tile layer without tileset:', scene.id, layer.layerId);
          continue;
        }

        const derivedId = `derived_${String(scene.id).replace(/[^a-zA-Z0-9_]/g, '_')}_layer_${layer.layerId}`;
        const derivedFilename = `${derivedId}.bmp`;
        const destination = path.join(graphicsDir, derivedFilename);
        // A painted layer is valid even when it started empty. In that case
        // create an indexed transparent base at the scene dimensions, then
        // replay the same tile recipe used by non-empty backgrounds.
        const sourceBmp = source && typeof source.filename === 'string'
          ? path.join(graphicsDir, this.toBmpFilename(source.filename))
          : path.join(graphicsDir, `${derivedId}_base.bmp`);
        if (!source) {
          const width = Math.max(8, Number(scene.width) || 240);
          const height = Math.max(8, Number(scene.height) || 160);
          await execFileAsync(this.getMagickPath(), ['-size', `${width}x${height}`, 'xc:none', '-compress', 'None', '-type', 'Palette', `BMP3:${sourceBmp}`]);
        }
        const tilesetBmp = hasTileMap ? fs.readdirSync(graphicsDir).find(file => path.extname(file).toLowerCase() === '.bmp' && path.basename(file, '.bmp') === this.sanitizeFilename(String(tilesetId)).replace(/\.[^/.]+$/, '')) : undefined;
        if (!fs.existsSync(sourceBmp) || (hasTileMap && !tilesetBmp)) {
          console.warn('..: Skipping tile layer because build graphics are unavailable:', scene.id, layer.layerId);
          continue;
        }

        const grid = Number(scene.gridSize) === 16 ? 16 : 8;
        const colorizedBase = path.join(graphicsDir, `${derivedId}_colorized_base.bmp`);
        const compositionBase = hasColorize ? colorizedBase : sourceBmp;
        if (hasColorize) await this.composeColorizedBackground(sourceBmp, colorizedBase, layer.tilePaletteIds, grid, palettePaths);
        if (hasTileMap) {
          await this.composeTileLayer(compositionBase, path.join(graphicsDir, tilesetBmp!), destination, layer.tileMap, grid, layer.tilePaletteIds, palettePaths, defaultPaletteId);
        } else {
          fs.copyFileSync(compositionBase, destination);
        }
        if (hasColorize && fs.existsSync(colorizedBase)) fs.rmSync(colorizedBase);
        if (!source && fs.existsSync(sourceBmp)) fs.rmSync(sourceBmp);
        fs.writeFileSync(path.join(graphicsDir, `${derivedId}.json`), JSON.stringify({ type: 'regular_bg' }, null, 2));

        layer.backgroundId = derivedId;
        derived.push({
          ...(source ?? { _resourceType: 'background', autoColor: true, tileColors: '', imageWidth: Number(scene.width) || 240, imageHeight: Number(scene.height) || 160 }),
          id: derivedId,
          name: derivedId,
          filename: derivedFilename,
        });
      }
    }

    // Keep every original background available to runtime events such as
    // Change Background. A resource does not need to be assigned to a scene
    // layer in order to be selected later by an event.
    return derived;
  }

  /**
   * Builds the dialogue frame as a regular background instead of scaling a
   * 32x32 sprite.  Scaling the sprite also scales its 8px border, which is
   * why the frame looked distorted in the game.
   */
  public async materializeDialogueFrame(sourceFilename = 'frame.png'): Promise<void> {
    const graphicsDir = this.getGraphicsDir();
    const sourceBase = this.sanitizeFilename(path.basename(sourceFilename)).replace(/\.[^/.]+$/, '');
    const sourcePath = [
      path.join(graphicsDir, `${sourceBase}.bmp`),
      path.join(graphicsDir, `${sourceBase}.png`),
    ].find(candidate => fs.existsSync(candidate));
    if (!sourcePath) {
      console.warn('..: Dialogue frame source not found:', sourceFilename);
      return;
    }

    const workDir = path.join(this.buildDir, '.dialogue-frame');
    fs.mkdirSync(workDir, { recursive: true });
    const magick = this.getMagickPath();
    const pieces = [
      ['top_left', 0, 0, 0, 0], ['top', 8, 0, 8, 0], ['top_right', 24, 0, 16, 0],
      ['left', 0, 8, 0, 8], ['center', 8, 8, 8, 8], ['right', 24, 8, 16, 8],
      ['bottom_left', 0, 24, 0, 16], ['bottom', 8, 24, 8, 16], ['bottom_right', 24, 24, 16, 16],
    ] as const;

    try {
      const indexZeroColor = this.readBmpPaletteIndexZero(sourcePath) || '#000000';
      const piecePaths: string[] = [];
      for (const [name, x, y] of pieces) {
        const piece = path.join(workDir, `${name}.png`);
        await execFileAsync(magick, [sourcePath, '-crop', '8x8+' + x + '+' + y, '+repage', `PNG32:${piece}`]);
        piecePaths.push(piece);
      }

      const [topLeft, top, topRight, left, center, right, bottomLeft, bottom, bottomRight] = piecePaths;
      // Four 64x64 sprites cover the 240x64 frame without consuming a
      // regular BG layer.
      const spriteOutput = path.join(graphicsDir, 'dialogue_frame_sprite.bmp');
      const spriteArgs = [
        '-size', '256x64', `xc:${indexZeroColor}`,
        topLeft, '-geometry', '+8+0', '-composite',
        '-size', '224x8', `tile:${top}`, '-geometry', '+16+0', '-composite',
        topRight, '-geometry', '+240+0', '-composite',
        '-size', '8x48', `tile:${left}`, '-geometry', '+8+8', '-composite',
        '-size', '224x48', `tile:${center}`, '-geometry', '+16+8', '-composite',
        '-size', '8x48', `tile:${right}`, '-geometry', '+240+8', '-composite',
        bottomLeft, '-geometry', '+8+56', '-composite',
        '-size', '224x8', `tile:${bottom}`, '-geometry', '+16+56', '-composite',
        bottomRight, '-geometry', '+240+56', '-composite',
        '-compress', 'None', '-type', 'Palette', `BMP3:${spriteOutput}`,
      ];
      await execFileAsync(magick, spriteArgs);
      fs.writeFileSync(path.join(graphicsDir, 'dialogue_frame_sprite.json'), JSON.stringify({ type: 'sprite', width: 64, height: 64 }, null, 2));
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  private readBmpPaletteIndexZero(filename: string): string | null {
    if (path.extname(filename).toLowerCase() !== '.bmp') return null;
    const data = fs.readFileSync(filename);
    if (data.length < 58 || data.toString('ascii', 0, 2) !== 'BM') return null;
    const dibOffset = 14;
    const dibSize = data.readUInt32LE(dibOffset);
    const bitDepth = data.readUInt16LE(28);
    if (bitDepth > 8) return null;
    const paletteOffset = dibOffset + dibSize;
    if (paletteOffset + 4 > data.length) return null;
    const blue = data[paletteOffset];
    const green = data[paletteOffset + 1];
    const red = data[paletteOffset + 2];
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  private toBmpFilename(filename: string): string {
    return this.sanitizeFilename(filename).replace(/\.[^/.]+$/, '.bmp');
  }

  private getMagickPath(): string {
    if (this.magickPath) return this.magickPath;
    return isDev
      ? path.join(this.__dirname, '..', 'bin', 'image-magick', process.platform === 'win32' ? 'magick.exe' : 'magick')
      : path.join(process.resourcesPath, 'bin', 'image-magick', process.platform === 'win32' ? 'magick.exe' : 'magick');
  }

  private async createPaletteImage(destination: string, colors: unknown[]): Promise<void> {
    const normalized = colors.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 16);
    while (normalized.length < 16) normalized.push('#000000');
    const args = normalized.flatMap(color => ['-size', '1x1', `xc:${color}`]);
    args.push('+append', `PNG32:${destination}`);
    await execFileAsync(this.getMagickPath(), args);
  }

  private async composeTileLayer(sourceBmp: string, tilesetBmp: string, destination: string, tileMap: number[][], grid: number, tilePaletteIds?: Array<Array<string | null>>, palettePaths: Map<string, string> = new Map(), defaultPaletteId?: string): Promise<void> {
    const magickPath = this.getMagickPath();
    const { stdout } = await execFileAsync(magickPath, ['identify', '-format', '%w', tilesetBmp]);
    const tilesPerRow = Math.max(1, Math.floor(Number.parseInt(stdout, 10) / grid));
    const args = [sourceBmp];
    for (let row = 0; row < tileMap.length; row++) {
      for (let col = 0; col < tileMap[row].length; col++) {
        const tile = Number(tileMap[row][col]);
        if (!Number.isInteger(tile) || tile < 0) continue;
        const sourceX = (tile % tilesPerRow) * grid;
        const sourceY = Math.floor(tile / tilesPerRow) * grid;
        const paletteId = tilePaletteIds?.[row]?.[col] ?? defaultPaletteId;
        const palettePath = paletteId ? palettePaths.get(paletteId) : undefined;
        args.push('(', tilesetBmp, '-crop', `${grid}x${grid}+${sourceX}+${sourceY}`, '+repage');
        if (palettePath) args.push('-remap', palettePath);
        args.push(')', '-geometry', `+${col * grid}+${row * grid}`, '-composite');
      }
    }
    // Keep every tile colour here. Butano/grit decides the appropriate GBA
    // palette banks instead of flattening the edited layer to just 16 colours.
    args.push('-compress', 'None', '-type', 'Palette', `BMP3:${destination}`);
    await execFileAsync(magickPath, args);
  }

  /**
   * Produces a build-only copy of a source background with its Colorize cells
   * remapped. This deliberately crops from the original source for every
   * cell, so the project asset is never changed.
   */
  private async composeColorizedBackground(sourceBmp: string, destination: string, tilePaletteIds: Array<Array<string | null>> | undefined, grid: number, palettePaths: Map<string, string>): Promise<void> {
    const args = [sourceBmp];
    tilePaletteIds?.forEach((row, rowIndex) => row.forEach((paletteId, colIndex) => {
      if (!paletteId || paletteId === '__original__') return;
      const palettePath = palettePaths.get(paletteId);
      if (!palettePath) return;
      args.push(
        '(', sourceBmp, '-crop', `${grid}x${grid}+${colIndex * grid}+${rowIndex * grid}`, '+repage',
        '-remap', palettePath, ')',
        '-geometry', `+${colIndex * grid}+${rowIndex * grid}`, '-composite',
      );
    }));
    args.push('-compress', 'None', '-type', 'Palette', `BMP3:${destination}`);
    await execFileAsync(this.getMagickPath(), args);
  }

  private async processAssets(sourcePath: string, actualPath: string, relativeBase: string, resourceFile?: ResourceFile) {
    const bmpPath = await this.convertToBmp(actualPath, relativeBase, resourceFile);
    await this.createGraphicsJson(path.dirname(sourcePath), bmpPath, relativeBase, resourceFile);
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
  private async createGraphicsJson(assetPath: string, destDir: string, relativeBase: string, resourceFile?: ResourceFile) {
    const rel = relativeBase.toLowerCase().replace(/\\/g, '/').split('/')[0];
    let type = "sprite";

    if (rel === "backgrounds") {
      type = "regular_bg";
    } else if (rel === "tilesets") {
      type = "palette_bitmap";
    } else if (rel === "backgrounds-hd") {
      type = "direct_bitmap";
    } else if (rel === "sprites") {
      type = "sprite";
    }

    const jsonContent = {
      type,
      ...(type === 'sprite' ? { height: resourceFile?.jsonContent?.playerFrameHeight ?? 16 } : {}),
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
  private async convertToBmp(sourcePath: string, relativeBase: string, resourceFile?: ResourceFile) {
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

      await this.convertWithMagick(sourcePath, destPath, relativeBase, resourceFile);

      // Se o nome mudou, apaga o original
      if (sourcePath !== destPath && fs.existsSync(sourcePath)) {
        fs.rmSync(sourcePath);
      }

      return destPath;
    }

    return sourcePath;
  }


  private async convertWithMagick(sourcePath: string, destPath: string, mode: string/*"title" | "backgrounds" | "sprites"*/, resourceFile?: ResourceFile, customizedPalettePath?: string) {
    // Background (16 colors, 4bpp) remapeando para paleta customizada se 
    // magick indexed.png -colors 16 -depth 4 BMP3:output_4bpp.bmp
    // magick indexed.png -remap sua_paleta.png -depth 4 BMP3:output_remapped_4bpp.bmp

    // Title (256 colors, 8bpp)
    // magick indexed.png -colors 256 -depth 8 BMP3:output_8bpp.bmp
    // magick indexed.png -remap sua_paleta.png -depth 8 BMP3:output_remapped_8bpp.bmp

    let args: string[];

    const magickPath = isDev 
      ? path.join(this.__dirname, "..", "bin", "image-magick", process.platform === "win32" ? "magick.exe" : "magick") 
      : path.join(process.resourcesPath, "bin", "image-magick", process.platform === "win32" ? "magick.exe" : "magick");

    switch (mode) {
      case "title":
        args = [
          sourcePath,
          "-background", "none",
          customizedPalettePath ? "-remap" : "-colors",
          customizedPalettePath ? customizedPalettePath : "256",
          // "-depth", "8",
          "-compress", "None",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
      case "backgrounds":
        args = [
          sourcePath,
          "-background", "none",
          "-colors", "16",
          // "-depth", "4",
          "-compress", "None",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];

        // se menor que 256x256, centraliza e cria uma imagem maior
        if (resourceFile?.jsonContent?.imageWidth !== undefined && resourceFile?.jsonContent?.imageHeight !== undefined && 
          (resourceFile.jsonContent.imageWidth < 256 || resourceFile.jsonContent.imageHeight < 256)) {
          args = [
            sourcePath,
            // "-background", "#FF00FF", // cor de fundo magenta (transparente)
            // "-flatten", // achata a imagem e usa a cor de fundo removendo transparência
            "-background", "none",
            "-gravity", "center",
            "-extent", "256x256",
            "-colors", "16",
            "-compress", "None",
            "-type", "Palette",
            `BMP3:${destPath}`
          ];
        }
        break;
      case "sprites":
        args = [
          sourcePath,
          "-background", "none",
          "-colors", "256",
          "-compress", "None",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
      default:
        args = [
          sourcePath,
          "-background", "none",
          customizedPalettePath ? "-remap" : "-colors",
          customizedPalettePath ? customizedPalettePath : "256", // customizedPalettePath inserir customPalette.png
          // "-depth", "8",
          "-compress", "None",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];
        break;
    }

    /*const { stdout, stderr } = */await execFileAsync(magickPath, args);
    // console.log("..: execFileAsync stdout:", stdout);
    // console.log("..: execFileAsync stderr:", stderr);

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
  private sanitizeFilename(original: string): string {
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
