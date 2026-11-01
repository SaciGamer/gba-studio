import { DEFAULT_PALETTES } from '../../../shared/defaultPalettes';
/**
 * Asset Builder - manages project assets (graphics, audio, etc.)
 * Copies and organizes assets into the build directory structure
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { execFile } from "child_process";
import { promisify } from "util";
import { materializeSpriteCanvas } from './SpriteCanvasBuilder';
import { fitRegularBgBmp, regularBgDimensions } from './regularBgDimensions';
import { indexedTransparency, encodeSpriteBmp } from './spriteCanvasPixels';
import { JsonResourceDefault, ResourceFile } from '../types/BuildTypes';
import { runBuildJobs } from './runBuildJobs';
import { flattenItInstrumentModeForBuild } from '../../../shared/trackerItBuildCompatibility';
import { readTrackerProjectForBuild, musicAssetSymbol } from './TrackerProjectPackage';
import { exportMusicComposition } from '../../../renderer/frontend/src/utils/trackerCompositionExport';
import { isMusicCompositionDocument } from '../../../renderer/frontend/src/utils/trackerComposition';
import { materializeBackgroundAnimations } from './BackgroundAnimationAssets';
import { finalizeTileAnimationAssets, type TileAnimationAssetPlan } from './TileAnimationAssets';
import { encodeSlotPalettePixels } from './SlotPalettePixels';

const execFileAsync = promisify(execFile);

// AssetBuilder is also used by build verification outside Electron.  Its tool
// lookup needs the same answer as electron-is-dev without requiring Electron
// merely to load this file.
const isDev = process.env.ELECTRON_IS_DEV !== undefined
  ? Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
  : process.defaultApp === true;

export interface AssetCopyOptions {
  onProgress?: (message: string, key: string, name: string) => void;
  overwrite?: boolean;
  preserveStructure?: boolean;
  verbose?: boolean;
}

export class AssetBuilder {
  private buildDir: string;
  private __dirname: string;
  private readonly magickPath?: string;
  private readonly tilesetSourcePaths = new Map<string, string>();
  private readonly backgroundSourcePaths = new Map<string, string>();
  private readonly preparedGraphics = new Set<string>();
  private tileAnimationPlans: TileAnimationAssetPlan[] = [];
  public finalizeTileAnimations(resources: ResourceFile[], buildDir: string): void {
    finalizeTileAnimationAssets(this.tileAnimationPlans, resources, buildDir);
  }
  public hasPreparedGraphic(name: string): boolean { return this.preparedGraphics.has(name); }
  public async materializeBackgroundAnimations(resources: ResourceFile[], assetsDir: string): Promise<JsonResourceDefault[]> {
    const frames = await materializeBackgroundAnimations(resources, assetsDir, this.getGraphicsDir(), this.getMagickPath());
    for (const frame of frames) this.preparedGraphics.add(path.parse(String(frame.filename)).name);
    return frames;
  }

  constructor(dirname: string, buildDir: string, magickPath?: string) {
    this.__dirname = dirname;
    this.buildDir = buildDir;
    this.magickPath = magickPath;
  }

  /** Resolve missing UI defaults into the build, without modifying saved assets. */
  public async prepareUiDefaults(projectAssetDir: string, defaultDirs: string[]): Promise<void> {
    for (const filename of ['cursor.png', 'frame.png']) {
      if (fs.existsSync(path.join(projectAssetDir, 'ui', filename))) continue;
      const source = defaultDirs.map(directory => path.join(directory, filename)).find(candidate => fs.existsSync(candidate));
      if (!source) throw new Error(`Default UI asset not found: ${filename}`);
      const destination = path.join(this.getGraphicsDir(), filename);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      await this.processAssets(source, destination, 'ui');
    }
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
    this.preparedGraphics.clear();
    this.tilesetSourcePaths.clear();
    if (!fs.existsSync(sourceAssetDir)) {
      console.warn('..: Asset directory not found:', sourceAssetDir);
      return { copiedCount: 0, skippedCount: 0 };
    }

    // Builds for the same project reuse their output directory. Remove legacy
    // tileset graphics left by older builds so Butano cannot compile them.
    this.removeLegacyTilesetGraphics();

    let copiedCount = 0;
    let skippedCount = 0;
    const assetCachePath = path.join(this.buildDir, '.asset-copy-cache.json');
    let assetCache: Record<string, string> = {};
    try { assetCache = JSON.parse(fs.readFileSync(assetCachePath, 'utf8')); } catch { /* no build cache yet */ }
    const spriteSources: Array<{ filename: string; path: string }> = [];
    // Source sheets are editor inputs, like tilesets. Clear legacy copied
    // sheets before rebuilding other categories that may share a basename.
    const spriteDir = path.join(sourceAssetDir, 'sprites');
    const staleNames = new Set<string>();
    const scanSprites = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) scanSprites(filename);
        else if (entry.isFile() && /\.(png|bmp|gif|jpe?g)$/i.test(entry.name)) staleNames.add(path.parse(this.sanitizeFilename(entry.name)).name);
      }
    };
    scanSprites(spriteDir);
    const graphicsDir = path.join(this.buildDir, 'graphics');
    if (fs.existsSync(graphicsDir)) for (const entry of fs.readdirSync(graphicsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const stem = path.parse(entry.name).name;
      if (staleNames.has(stem) && /\.(png|bmp|gif|jpe?g|json)$/i.test(entry.name)) fs.unlinkSync(path.join(graphicsDir, entry.name));
    }
    const generatedDir = path.join(this.buildDir, 'build');
    if (fs.existsSync(generatedDir)) for (const entry of fs.readdirSync(generatedDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if ([...staleNames].some(stem => entry.name === `bn_sprite_items_${stem}.h` || entry.name.startsWith(`${stem}_bn_gfx.`))) fs.unlinkSync(path.join(generatedDir, entry.name));
    }

    const walk = async (dir: string, relativeBase: string, resourceFiles: ResourceFile[]) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = path.join(dir, entry.name);
        const relativePath = path.join(relativeBase, entry.name);

        if (entry.isDirectory()) {
          // Cartridge cover images are used only by the editor/launcher. They
          // are not game graphics and must not be converted or sent to Butano.
          if (!relativeBase && entry.name.toLowerCase() === 'cartridge') {
            continue;
          }
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
          let trackerBuildBytes: Uint8Array | null = null;
          if (['.mod', '.xm', '.s3m', '.it'].includes(ext)) {
            this.validateTrackerModule(sourcePath, ext);
            if (ext === '.it') {
              const sourceBytes = fs.readFileSync(sourcePath);
              const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer;
              const compatible = flattenItInstrumentModeForBuild(sourceBuffer);
              if (!compatible) throw new Error(`IT module ${entry.name} has an instrument map that cannot be prepared for the GBA audio build.`);
              if (compatible !== sourceBuffer) trackerBuildBytes = new Uint8Array(compatible);
            }
          }
          const assetCategory = relativeBase.toLowerCase().replace(/\\/g, '/').split('/')[0];
          const isImage = ['.png', '.bmp', '.gif', '.jpg', '.jpeg'].includes(ext);
          if (isImage && assetCategory === 'avatars') await this.validateAvatarDimensions(sourcePath);
          if (isImage && assetCategory === 'sprites') {
            spriteSources.push({ filename: path.relative(spriteDir, sourcePath).replace(/\\/g, '/'), path: sourcePath });
            continue;
          }
          if (isImage && (assetCategory === 'tilesets' || assetCategory === 'auto-tiles')) {
            const tilesetKey = this.sanitizeFilename(filename).replace(/\.[^/.]+$/, '');
            this.tilesetSourcePaths.set(assetCategory === 'auto-tiles' ? `auto-tile:${tilesetKey}` : tilesetKey, sourcePath);
            continue;
          }
          // Palette graphics are editor sources. Build-time palette remapping
          // uses the colors stored in palette resources and generated swatches.
          if (isImage && assetCategory === 'palettes') continue;
          const relForDest = assetCategory === 'avatars'
            ? `avatar_${filename}`
            : preserveStructure ? path.join(path.dirname(relativePath), filename) : filename;
          const destPath = this.getAssetDestination(sourcePath, relForDest, relativeBase);

          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }

          const resourceFile = resourceFiles.find(r => r.jsonContent?._resourceType !== 'sprite' && (r.jsonContent?._resourceType !== 'background' || Boolean((r.jsonContent as any).hd) === (assetCategory === 'backgrounds-hd')) && r.jsonContent?.filename && this.sanitizeFilename(r.jsonContent.filename) === filename);
          if (resourceFile?.jsonContent?._resourceType === 'background' && resourceFile.jsonContent.id) {
            this.backgroundSourcePaths.set(resourceFile.jsonContent.id, sourcePath);
          }
          if ((resourceFile?.jsonContent as any)?.__backgroundAnimationSheetOnly) {
            const stem = path.parse(destPath).name;
            for (const suffix of ['.bmp', '.json']) {
              const stale = path.join(this.getGraphicsDir(), stem + suffix);
              if (fs.existsSync(stale)) fs.unlinkSync(stale);
            }
            for (const name of fs.existsSync(generatedDir) ? fs.readdirSync(generatedDir) : [])
              if (name === `bn_regular_bg_items_${stem}.h` || name === `bn_direct_bitmap_items_${stem}.h` || name.startsWith(`${stem}_bn_gfx.`)) fs.unlinkSync(path.join(generatedDir, name));
            skippedCount++;
            continue;
          }
          const cacheKey = path.relative(this.buildDir, destPath).replace(/\\/g, '/');
          const resourceFingerprint = resourceFile?.jsonContent ? { ...resourceFile.jsonContent } : null;
          // Background dimensions are populated from the converted graphic by
          // processAssets; they are output metadata, not an input to conversion.
          if (resourceFingerprint?._resourceType === 'background') {
            delete resourceFingerprint.imageWidth;
            delete resourceFingerprint.imageHeight;
          }
          const fingerprint = crypto.createHash('sha256')
            .update(fs.readFileSync(sourcePath))
            .update(ext === '.it' ? 'it-build-compat-v1' : '')
            .update(JSON.stringify(resourceFingerprint))
            .update(relativeBase)
            .digest('hex');
          const descriptorPath = path.join(path.dirname(destPath), `${path.parse(destPath).name}.json`);
          if (fs.existsSync(destPath) && fs.existsSync(descriptorPath) && assetCache[cacheKey] === fingerprint) {
            // Cached files are valid outputs for this run too. This set gates
            // resource emission later in transcodeProject, so cache hits must
            // register the prepared graphic just like a fresh conversion.
            this.preparedGraphics.add(path.parse(destPath).name);
            skippedCount++;
            continue;
          }
          if (!fs.existsSync(destPath) || overwrite) {
            if (trackerBuildBytes) fs.writeFileSync(destPath, trackerBuildBytes);
            else fs.copyFileSync(sourcePath, destPath);

            options.onProgress?.(`Preparando asset: ${relativePath}`, 'asset', relativePath);
            await this.processAssets(sourcePath, destPath, relativeBase, resourceFile);
            assetCache[cacheKey] = fingerprint;
            
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
    const activeSpriteGraphics = new Set<string>();
    for (const file of resourceFiles) {
      const resource = file.jsonContent;
      if (resource?._resourceType !== 'sprite' || resource._deleted) continue;
      const filename = String(resource.filename ?? '').replace(/\\/g, '/');
      const normalizeSpriteFilename = (value: string) => value.replace(/\\/g, '/').toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
      const normalizedFilename = normalizeSpriteFilename(filename);
      const exactCandidates = spriteSources.filter(source => normalizeSpriteFilename(source.filename) === normalizedFilename);
      const candidates = exactCandidates.length > 0
        ? exactCandidates
        : spriteSources.filter(source => path.posix.basename(normalizeSpriteFilename(source.filename)) === path.posix.basename(normalizedFilename));
      if (candidates.length !== 1) throw new Error(`Sprite ${resource.name ?? resource.id}: source image not found or ambiguous (${filename})`);
      options.onProgress?.(`Gerando imagem do sprite: ${resource.name ?? filename}`, 'sprite', String(resource.name ?? filename));
      const spriteFingerprint = crypto.createHash('sha256')
        .update(fs.readFileSync(candidates[0].path))
        .update(JSON.stringify({ ...resource, __spriteCanvas: undefined }))
        .digest('hex');
      await materializeSpriteCanvas(resource, candidates[0].path, graphicsDir, this.getMagickPath(), spriteFingerprint);
      if (resource.__spriteCanvas) {
        this.preparedGraphics.add(resource.__spriteCanvas.graphicsName);
        activeSpriteGraphics.add(resource.__spriteCanvas.graphicsName);
      }
      skippedCount++;
    }
    for (const entry of fs.readdirSync(graphicsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('gbas_canvas_')) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const stem = path.parse(entry.name).name;
      if (['.bmp', '.json'].includes(extension) && !activeSpriteGraphics.has(stem)) fs.rmSync(path.join(graphicsDir, entry.name), { force: true });
    }
    if (fs.existsSync(generatedDir)) for (const entry of fs.readdirSync(generatedDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const spriteHeader = entry.name.match(/^bn_sprite_items_(gbas_canvas_[a-z0-9_]+)\.h$/i)?.[1];
      const generatedSprite = entry.name.match(/^(gbas_canvas_[a-z0-9_]+)_bn_gfx\./i)?.[1];
      const graphicsName = spriteHeader ?? generatedSprite;
      if (graphicsName && !activeSpriteGraphics.has(graphicsName)) fs.rmSync(path.join(generatedDir, entry.name), { force: true });
    }
    fs.writeFileSync(assetCachePath, JSON.stringify(assetCache, null, 2));
    return { copiedCount, skippedCount };
  }

  /** Materialize each saved .gbatracker target as a Butano audio module. */
  public materializeTrackerProjects(projectMusicDir: string): number {
    if (!fs.existsSync(projectMusicDir)) return 0;
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const source = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(source);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gbatracker')) files.push(source);
      }
    };
    visit(projectMusicDir);
    // Remove UUID filenames emitted by older builds; Butano rejects them even
    // when the corrected module is also present in the cached audio directory.
    const audioDir = this.getAudioDir();
    if (fs.existsSync(audioDir)) for (const entry of fs.readdirSync(audioDir, { withFileTypes: true })) {
      if (entry.isFile() && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mod|xm|s3m|it)$/i.test(entry.name)) {
        fs.rmSync(path.join(audioDir, entry.name));
      }
    }
    const seen = new Set<string>();
    for (const source of files.sort()) {
      const project = readTrackerProjectForBuild(fs.readFileSync(source), path.relative(projectMusicDir, source));
      const composition = project.composition;
      if (!isMusicCompositionDocument(composition)) {
        throw new Error(`GBA Tracker project ${path.basename(source)} contains an invalid canonical composition.`);
      }
      const format = composition.targetFormat;
      if (format !== project.format) {
        throw new Error(`GBA Tracker project ${path.basename(source)} has inconsistent target format metadata.`);
      }
      const extension = format.toLowerCase();
      if (seen.has(project.id)) throw new Error(`Duplicate GBA Tracker project ID ${project.id} in project/musics.`);
      seen.add(project.id);
      const exported = exportMusicComposition(composition, format);
      for (const warning of exported.warnings) console.warn(`..: ${path.basename(source)} (${format}): ${warning}`);
      let moduleBytes = Buffer.from(exported.moduleData);
      if (extension === 'it') {
        const sourceBuffer = moduleBytes.buffer.slice(moduleBytes.byteOffset, moduleBytes.byteOffset + moduleBytes.byteLength) as ArrayBuffer;
        const compatible = flattenItInstrumentModeForBuild(sourceBuffer);
        if (!compatible) throw new Error(`GBA Tracker project ${path.basename(source)} uses an IT instrument map that cannot be prepared for the GBA audio build.`);
        moduleBytes = Buffer.from(compatible);
      }
      const destination = path.join(this.getAudioDir(), `${musicAssetSymbol(project.id)}.${extension}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, moduleBytes);
      try { this.validateTrackerModule(destination, `.${extension}`); }
      catch (error) { fs.rmSync(destination, { force: true }); throw error; }
    }
    return files.length;
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
    const indexedTransparency = path.extname(sourcePath).toLowerCase() === '.bmp'
      ? this.readIndexedBmpTransparentPixels(sourcePath)
      : null;
    await execFileAsync(this.getMagickPath(), [
      sourcePath,
      '-background', 'none',
      '-alpha', 'on',
      '-colors', '256',
      '-depth', '8',
      '-compress', 'None',
      '-type', 'Palette',
      `BMP3:${destinationPath}`,
    ]);
    if (indexedTransparency) this.applyBmpTransparentPixels(destinationPath, indexedTransparency);
  }

  /**
   * Reads the indexed-color transparency convention used by Butano fonts:
   * source palette index 0 is transparent. Rows are returned top-to-bottom so
   * they can be applied after ImageMagick normalizes the bitmap for the build.
   */
  private readIndexedBmpTransparentPixels(filename: string): { width: number; height: number; transparent: boolean[] } | null {
    const data = fs.readFileSync(filename);
    if (data.length < 54 || data.toString('ascii', 0, 2) !== 'BM') return null;
    const dibSize = data.readUInt32LE(14);
    const width = data.readInt32LE(18);
    const signedHeight = data.readInt32LE(22);
    const bitDepth = data.readUInt16LE(28);
    const compression = data.readUInt32LE(30);
    if (bitDepth > 8) return null;
    if (width <= 0 || signedHeight === 0 || ![1, 4, 8].includes(bitDepth) || compression !== 0) {
      throw new Error(`Unsupported indexed BMP font format: ${filename}`);
    }

    const height = Math.abs(signedHeight);
    const topDown = signedHeight < 0;
    const pixelsOffset = data.readUInt32LE(10);
    const paletteOffset = 14 + dibSize;
    const colorsUsed = dibSize >= 40 ? data.readUInt32LE(46) : 0;
    const paletteCount = colorsUsed || (1 << bitDepth);
    const rowStride = Math.floor((width * bitDepth + 31) / 32) * 4;
    if (paletteCount < 1 || paletteOffset + paletteCount * 4 > pixelsOffset || pixelsOffset + rowStride * height > data.length) {
      throw new Error(`Invalid indexed BMP font data: ${filename}`);
    }

    const transparent = new Array<boolean>(width * height);
    for (let y = 0; y < height; y += 1) {
      const sourceY = topDown ? y : height - 1 - y;
      const rowOffset = pixelsOffset + sourceY * rowStride;
      for (let x = 0; x < width; x += 1) {
        let index: number;
        if (bitDepth === 8) index = data[rowOffset + x];
        else if (bitDepth === 4) index = (data[rowOffset + (x >> 1)] >> ((x & 1) === 0 ? 4 : 0)) & 0x0f;
        else index = (data[rowOffset + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (index >= paletteCount) throw new Error(`Invalid palette index in BMP font: ${filename}`);
        transparent[y * width + x] = index === 0;
      }
    }
    return { width, height, transparent };
  }

  /**
   * Marks the source transparent pixels as palette index 0 in the build-only
   * BMP. If ImageMagick assigned index 0 to a visible color, that color is
   * moved to an unused palette slot first so visible glyph pixels stay opaque.
   */
  private applyBmpTransparentPixels(filename: string, source: { width: number; height: number; transparent: boolean[] }): void {
    const data = fs.readFileSync(filename);
    if (data.length < 54 || data.toString('ascii', 0, 2) !== 'BM') {
      throw new Error(`ImageMagick did not produce a BMP font: ${filename}`);
    }
    const dibSize = data.readUInt32LE(14);
    const width = data.readInt32LE(18);
    const signedHeight = data.readInt32LE(22);
    const bitDepth = data.readUInt16LE(28);
    const compression = data.readUInt32LE(30);
    const height = Math.abs(signedHeight);
    if (width !== source.width || height !== source.height || ![1, 4, 8].includes(bitDepth) || compression !== 0) {
      throw new Error(`ImageMagick produced an unsupported BMP font layout: ${filename}`);
    }

    const topDown = signedHeight < 0;
    const pixelsOffset = data.readUInt32LE(10);
    const paletteOffset = 14 + dibSize;
    const colorsUsed = dibSize >= 40 ? data.readUInt32LE(46) : 0;
    const paletteCount = colorsUsed || Math.floor((pixelsOffset - paletteOffset) / 4);
    const rowStride = Math.floor((width * bitDepth + 31) / 32) * 4;
    if (paletteCount < 2 || paletteOffset + paletteCount * 4 > pixelsOffset || pixelsOffset + rowStride * height > data.length) {
      throw new Error(`Invalid converted BMP font data: ${filename}`);
    }

    const readPixelIndex = (rowOffset: number, x: number): number => {
      if (bitDepth === 8) return data[rowOffset + x];
      if (bitDepth === 4) return (data[rowOffset + (x >> 1)] >> ((x & 1) === 0 ? 4 : 0)) & 0x0f;
      return (data[rowOffset + (x >> 3)] >> (7 - (x & 7))) & 1;
    };
    const writePixelIndex = (rowOffset: number, x: number, index: number): void => {
      if (bitDepth === 8) {
        data[rowOffset + x] = index;
      } else if (bitDepth === 4) {
        const byteOffset = rowOffset + (x >> 1);
        const shift = (x & 1) === 0 ? 4 : 0;
        data[byteOffset] = (data[byteOffset] & ~(0x0f << shift)) | ((index & 0x0f) << shift);
      } else {
        const byteOffset = rowOffset + (x >> 3);
        const shift = 7 - (x & 7);
        data[byteOffset] = (data[byteOffset] & ~(1 << shift)) | ((index & 1) << shift);
      }
    };

    const usedByVisiblePixels = new Set<number>();
    for (let y = 0; y < height; y += 1) {
      const targetY = topDown ? y : height - 1 - y;
      const rowOffset = pixelsOffset + targetY * rowStride;
      for (let x = 0; x < width; x += 1) {
        if (!source.transparent[y * width + x]) usedByVisiblePixels.add(readPixelIndex(rowOffset, x));
      }
    }

    const replacementIndex = usedByVisiblePixels.has(0)
      ? Array.from({ length: paletteCount - 1 }, (_, index) => index + 1).find(index => !usedByVisiblePixels.has(index))
      : undefined;
    if (usedByVisiblePixels.has(0) && replacementIndex === undefined) {
      throw new Error(`Custom font uses all palette entries and has no transparent slot: ${filename}`);
    }
    if (replacementIndex !== undefined) {
      data.copy(data, paletteOffset + replacementIndex * 4, paletteOffset, paletteOffset + 4);
    }

    for (let y = 0; y < height; y += 1) {
      const targetY = topDown ? y : height - 1 - y;
      const rowOffset = pixelsOffset + targetY * rowStride;
      for (let x = 0; x < width; x += 1) {
        const index = readPixelIndex(rowOffset, x);
        if (source.transparent[y * width + x]) writePixelIndex(rowOffset, x, 0);
        else if (replacementIndex !== undefined && index === 0) writePixelIndex(rowOffset, x, replacementIndex);
      }
    }
    fs.writeFileSync(filename, data);
  }

  /**
   * Replays each edited layer recipe into a BMP used only by the current build.
   * The source asset remains untouched and the generated background is exposed
   * as a new in-memory resource by the caller.
   */
  public async materializeTileLayerEdits(resourceFiles: ResourceFile[], parallel = 1): Promise<JsonResourceDefault[]> {
    const graphicsDir = this.getGraphicsDir();
    if (fs.existsSync(graphicsDir)) {
      // Older failed transcodes could leave transparent source BMPs behind.
      // They are temporary composition inputs, not Butano graphics, and can
      // otherwise make a later run request a nonexistent `_base.json`.
      for (const entry of fs.readdirSync(graphicsDir, { withFileTypes: true })) {
        if (entry.isFile() && /^derived_[a-z0-9_]+_layer_[a-z0-9_]+_base\.(?:bmp|json)$/i.test(entry.name)) {
          fs.rmSync(path.join(graphicsDir, entry.name), { force: true });
        }
      }
    }
    const jobs: Array<() => Promise<JsonResourceDefault | undefined>> = [];
    const scenes = resourceFiles.filter(file => file.jsonContent?._resourceType === 'scene');
    this.tileAnimationPlans = [];
    const originalBackgrounds = new Map<string, string>();
    for (const file of scenes) for (const layer of (file.jsonContent as any).backgrounds ?? []) {
      originalBackgrounds.set(`${file.jsonContent?.id}:${layer.layerId}`, layer.backgroundId ?? '');
    }
    const backgrounds = resourceFiles.filter(file => file.jsonContent?._resourceType === 'background');
    const paletteResources = resourceFiles.filter(file => file.jsonContent?._resourceType === 'palette');
    const paletteSettings = resourceFiles.find(file => file.jsonContent?._resourceType === 'palettes')?.jsonContent as any;
    const settings = resourceFiles.find(file => file.jsonContent?._resourceType === 'settings')?.jsonContent as any;
    const paletteDirectory = path.join(this.buildDir, '.tile-palettes');
    const palettePaths = new Map<string, string>();
    const tileCachePath = path.join(this.buildDir, '.tile-layer-cache.json');
    let tileCache: Record<string, string> = {};
    try { tileCache = JSON.parse(fs.readFileSync(tileCachePath, 'utf8')); } catch { /* no generated layer cache yet */ }
    if (fs.existsSync(paletteDirectory)) fs.rmSync(paletteDirectory, { recursive: true, force: true });
    const defaultSlots: Array<string | null> = Array.from({ length: 16 }, (_, index) => settings?.colorPaletteIds?.[index] ?? null);
    const paletteDefinitions = [
      ...DEFAULT_PALETTES,
      ...paletteResources.map(file => file.jsonContent),
      ...(Array.isArray(paletteSettings?.palettes) ? paletteSettings.palettes : []),
    ];
    const requiredPaletteIds = new Set<string>();
    defaultSlots.forEach((id, slot) => {
      const palette = paletteDefinitions.find((palette: any) => palette.id === id);
      if (palette) paletteDefinitions.push({ ...palette, id: `__slot__:${slot}` });
    });
    for (const sceneFile of scenes) {
      const scene = sceneFile.jsonContent as any;
      for (const layer of Array.isArray(scene.backgrounds) ? scene.backgrounds : []) {
        const hasTileMap = Array.isArray(layer.tileMap) && layer.tileMap.some((row: unknown) => Array.isArray(row) && row.some(tile => Number(tile) >= 0));
        const hasColorize = Array.isArray(layer.tilePaletteIds) && layer.tilePaletteIds.some((row: unknown) => Array.isArray(row) && row.some(paletteId => typeof paletteId === 'string' && paletteId !== '__original__'));
        if (!hasTileMap && !hasColorize) continue;
        for (const row of Array.isArray(layer.tilePaletteIds) ? layer.tilePaletteIds : []) {
          for (const paletteId of Array.isArray(row) ? row : []) {
            if (typeof paletteId === 'string' && paletteId !== '__original__') requiredPaletteIds.add(paletteId);
          }
        }

      }
    }
    if (requiredPaletteIds.size) fs.mkdirSync(paletteDirectory, { recursive: true });
    for (const palette of paletteDefinitions) {
      if (typeof palette?.id !== 'string' || !requiredPaletteIds.has(palette.id) || !Array.isArray(palette.colors)) continue;
      const palettePath = path.join(paletteDirectory, `${this.sanitizeFilename(palette.id)}.png`);
      await this.createPaletteImage(palettePath, palette.colors);
      palettePaths.set(palette.id, palettePath);
    }

    for (const sceneFile of scenes) {
      const scene = sceneFile.jsonContent as any;
      if (!Array.isArray(scene.backgrounds)) continue;

      for (const layer of scene.backgrounds) {
        jobs.push(async () => {
        const hasTileMap = Array.isArray(layer.tileMap) && layer.tileMap.some((row: unknown) => Array.isArray(row) && row.some(tile => Number(tile) >= 0));
        const hasColorize = Array.isArray(layer.tilePaletteIds) && layer.tilePaletteIds.some((row: unknown) => Array.isArray(row) && row.some(paletteId => typeof paletteId === 'string' && paletteId !== '__original__'));
        if (!hasTileMap && !hasColorize) return;
        const referencedPaletteIds = new Set<string>();
        for (const row of Array.isArray(layer.tilePaletteIds) ? layer.tilePaletteIds : []) {
          for (const paletteId of Array.isArray(row) ? row : []) {
            if (typeof paletteId === 'string' && paletteId !== '__original__') referencedPaletteIds.add(paletteId);
          }
        }
        const missingPalette = [...referencedPaletteIds].find(id => !palettePaths.has(id));
        if (missingPalette) {
          throw new Error(`Unknown tile palette '${missingPalette}' referenced by scene ${scene.id ?? '<scene>'} layer ${layer.layerId ?? 0}`);
        }
        const source = backgrounds.find(file => file.jsonContent?.id === layer.backgroundId)?.jsonContent;
        const tilesetId = layer.selectedTilesetId;
        const tilesetIds = new Set<string>();
        if (hasTileMap) {
          layer.tileMap.forEach((row: number[], rowIndex: number) => row.forEach((tile: number, colIndex: number) => {
            if (Number(tile) < 0) return;
            const id = layer.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? tilesetId;
            if (typeof id === 'string' && id) tilesetIds.add(id);
          }));
        }
        if (hasTileMap && !tilesetIds.size) {
          throw new Error(`Cannot materialize scene ${scene.id ?? '<scene>'} layer ${layer.layerId ?? 0}: painted tiles have no source tileset`);
        }

        const logicalWidth = Math.round(Number(scene.width) || Number(source?.imageWidth) || 240);
        const logicalHeight = Math.round(Number(scene.height) || Number(source?.imageHeight) || 160);
        regularBgDimensions(logicalWidth, logicalHeight);
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
          const width = logicalWidth;
          const height = logicalHeight;
          await execFileAsync(this.getMagickPath(), ['-size', `${width}x${height}`, 'xc:none', '-compress', 'None', '-type', 'Palette', `BMP3:${sourceBmp}`]);
        }
        const availableTilesetBmps = new Map<string, string>();
        if (hasTileMap) {
          for (const id of tilesetIds) {
            const sourceKey = id.startsWith('auto-tile:')
              ? `auto-tile:${this.sanitizeFilename(id.slice('auto-tile:'.length)).replace(/\.[^/.]+$/, '')}`
              : this.sanitizeFilename(id).replace(/\.[^/.]+$/, '');
            const sourcePath = this.tilesetSourcePaths.get(sourceKey);
            if (sourcePath) availableTilesetBmps.set(id, sourcePath);
          }
        }
        const missingTileSources = hasTileMap ? [...tilesetIds].filter(id => !availableTilesetBmps.has(id)) : [];
        if (!fs.existsSync(sourceBmp) || missingTileSources.length) {
          // A transparent base is temporary input only. Never leave it in
          // Graphics: Butano treats every BMP there as a real asset and then
          // asks for a matching JSON descriptor.
          if (!source && fs.existsSync(sourceBmp)) fs.rmSync(sourceBmp, { force: true });
          if (missingTileSources.length) {
            throw new Error(`Missing tile source image(s) for scene ${scene.id ?? '<scene>'} layer ${layer.layerId ?? 0}: ${missingTileSources.join(', ')}. Add each image to its matching assets/tilesets or assets/auto-tiles folder.`);
          }
          throw new Error(`Cannot materialize scene ${scene.id ?? '<scene>'} layer ${layer.layerId ?? 0}: background graphic is unavailable (${source?.filename ?? '<empty layer>'})`);
        }

        const grid = Number(scene.gridSize) === 16 ? 16 : 8;
        const fingerprintHash = crypto.createHash('sha256');
        fingerprintHash.update(JSON.stringify({ sceneId: scene.id, layerId: layer.layerId, logicalWidth, logicalHeight, grid, tileMap: layer.tileMap, tileMapTilesetIds: layer.tileMapTilesetIds, tilesetId, tilePaletteIds: layer.tilePaletteIds, paletteApplication: 2, paletteColors: paletteDefinitions.filter((palette: any) => referencedPaletteIds.has(palette.id)).map((palette: any) => [palette.id, palette.colors]) }));
        fingerprintHash.update(fs.readFileSync(sourceBmp));
        for (const [id, filename] of [...availableTilesetBmps].sort(([left], [right]) => left.localeCompare(right))) {
          fingerprintHash.update(id);
          fingerprintHash.update(fs.readFileSync(filename));
        }
        const fingerprint = fingerprintHash.digest('hex');
        const cachedDescriptor = path.join(graphicsDir, `${derivedId}.json`);
        if (!defaultSlots.some(Boolean) && tileCache[derivedId] === fingerprint && fs.existsSync(destination) && fs.existsSync(cachedDescriptor)) {
          const padded = fitRegularBgBmp(fs.readFileSync(destination), logicalWidth, logicalHeight);
          // Empty edited layers need a temporary transparent source for a
          // cache fingerprint. It is only needed when composing a cache miss.
          if (!source && fs.existsSync(sourceBmp)) fs.rmSync(sourceBmp, { force: true });
          this.preparedGraphics.add(derivedId);
          layer.backgroundId = derivedId;
          return {
            ...(source ?? { _resourceType: 'background', autoColor: true, tileColors: '', imageWidth: Number(scene.width) || 240, imageHeight: Number(scene.height) || 160 }),
            imageWidth: padded.width,
            imageHeight: padded.height,
            id: derivedId,
            name: derivedId,
            filename: derivedFilename,
          };
        }
        const sizedBase = path.join(graphicsDir, `${derivedId}_sized_base.bmp`);
        fs.writeFileSync(sizedBase, fitRegularBgBmp(fs.readFileSync(sourceBmp), logicalWidth, logicalHeight).data);
        const colorizedBase = path.join(graphicsDir, `${derivedId}_colorized_base.bmp`);
        const compositionBase = hasColorize ? colorizedBase : sizedBase;
        if (hasColorize) await this.composeColorizedBackground(sizedBase, colorizedBase, layer.tilePaletteIds, grid, palettePaths);
        if (hasTileMap) {
          await this.composeTileLayer(compositionBase, availableTilesetBmps, destination, layer.tileMap, grid, layer.tileMapTilesetIds, tilesetId, layer.tilePaletteIds, palettePaths);
        } else {
          fs.copyFileSync(compositionBase, destination);
        }
        if (fs.existsSync(sizedBase)) fs.rmSync(sizedBase);
        if (hasColorize && fs.existsSync(colorizedBase)) fs.rmSync(colorizedBase);
        if (!source && fs.existsSync(sourceBmp)) fs.rmSync(sourceBmp);
        const padded = fitRegularBgBmp(fs.readFileSync(destination), logicalWidth, logicalHeight);
        fs.writeFileSync(destination, padded.data);
        fs.writeFileSync(path.join(graphicsDir, `${derivedId}.json`), JSON.stringify({ type: 'regular_bg' }, null, 2));
        tileCache[derivedId] = fingerprint;

        layer.backgroundId = derivedId;
        return {
          ...(source ?? { _resourceType: 'background', autoColor: true, tileColors: '', imageWidth: Number(scene.width) || 240, imageHeight: Number(scene.height) || 160 }),
          imageWidth: padded.width,
          imageHeight: padded.height,
          id: derivedId,
          name: derivedId,
          filename: derivedFilename,
        };
        });
      }
    }

    // Keep every original background available to runtime events such as
    // Change Background. A resource does not need to be assigned to a scene
    // layer in order to be selected later by an event.
    try {
      const results = await runBuildJobs(jobs, parallel);
      const derived = results.filter((resource): resource is JsonResourceDefault => resource !== undefined);
      derived.push(...await this.materializeTileAnimationLayers(resourceFiles, derived, originalBackgrounds, palettePaths));
      if (defaultSlots.some(Boolean)) {
        const definitions = new Map<string, string[]>(paletteDefinitions.map((palette: any) => [palette.id, palette.colors]));
        for (const resource of derived) {
          const owner = scenes.flatMap(file => {
            const scene = file.jsonContent as any;
            return (scene.backgrounds ?? []).map((layer: any) => ({ scene, layer }));
          }).find(({ scene, layer }: any) => [
            `derived_${String(scene.id).replace(/[^a-zA-Z0-9_]/g, '_')}_layer_${layer.layerId}`,
            `animated_${String(scene.id).replace(/[^a-zA-Z0-9_]/g, '_')}_layer_${layer.layerId}`,
          ].includes(String(resource.id)));
          if (!owner) continue;
          const { scene, layer } = owner;
          const filename = path.join(graphicsDir, String(resource.filename));
          const image = await this.readGraphicRgba(filename, true);
          const grid = Number(scene.gridSize) === 16 ? 16 : 8;
          const frames = (resource as any).__paletteFrames;
          const encoded = encodeSlotPalettePixels(image.rgba, image.width, defaultSlots, definitions, (x, y) => {
            if (frames && y >= Number(resource.imageHeight)) return frames[Math.floor(y / 8)]?.[Math.floor(x / 8)];
            const row = Math.floor(y / grid), col = Math.floor(x / grid);
            return layer.tilePaletteIds?.[row]?.[col];
          });
          if (encoded.bindings.length) {
            fs.writeFileSync(filename, encodeSpriteBmp(encoded.rgba, image.width, image.height));
            (resource as any).__slotPaletteBindings = encoded.bindings;
          }
          delete (resource as any).__paletteFrames;
        }
      }
      fs.writeFileSync(tileCachePath, JSON.stringify(tileCache, null, 2));
      for (const resource of derived) if (resource?.filename) this.preparedGraphics.add(path.parse(resource.filename).name);
      return derived;
    } finally {
      if (fs.existsSync(paletteDirectory)) fs.rmSync(paletteDirectory, { recursive: true, force: true });
    }
  }

  private async materializeTileAnimationLayers(resources: ResourceFile[], derived: JsonResourceDefault[], originalBackgrounds: Map<string, string>, palettePaths: Map<string, string>): Promise<JsonResourceDefault[]> {
    const graphics = this.getGraphicsDir();
    const backgrounds: any[] = [...resources.map(resource => resource.jsonContent), ...derived].filter(resource => resource?._resourceType === 'background');
    const output: JsonResourceDefault[] = [];
    for (const resource of resources) {
      const scene = resource.jsonContent as any;
      if (scene?._resourceType !== 'scene' || !scene.tileAnimations?.length) continue;
      for (const layer of scene.backgrounds ?? []) {
        const animations = scene.tileAnimations.filter((animation: any) => Number(animation.layerId) === Number(layer.layerId));
        if (!animations.length || !layer.backgroundId) continue;
        const source = backgrounds.find(background => background.id === layer.backgroundId);
        if (!source?.filename) throw new Error(`Tile animation background missing in scene ${scene.name || scene.id}, layer ${layer.layerId}`);
        const graphic = `animated_${String(scene.id).replace(/[^a-zA-Z0-9_]/g, '_')}_layer_${layer.layerId}`;
        const basePath = path.join(graphics, this.toBmpFilename(source.filename));
        const base = await this.readGraphicRgba(basePath, true);
        const columns = base.width / 8, area = columns * (base.height / 8);
        const originalBackground = originalBackgrounds.get(`${scene.id}:${layer.layerId}`);
        const sources = new Map<string, string>();
        const dimensions = new Map<string, { width: number; height: number }>();
        const resolveSource = async (id: string) => {
          if (dimensions.has(id)) return dimensions.get(id)!;
          const key = id.startsWith('auto-tile:') ? `auto-tile:${this.sanitizeFilename(id.slice(10)).replace(/\.[^/.]+$/, '')}` : this.sanitizeFilename(id).replace(/\.[^/.]+$/, '');
          const background = backgrounds.find(item => item.id === id);
          const filename = this.backgroundSourcePaths.get(id) ?? this.tilesetSourcePaths.get(key) ?? (background?.filename ? path.join(graphics, this.toBmpFilename(background.filename)) : undefined);
          if (!filename || !fs.existsSync(filename)) throw new Error(`Tile animation source '${id}' missing in scene ${scene.name || scene.id}, layer ${layer.layerId}`);
          const { stdout } = await execFileAsync(this.getMagickPath(), ['identify', '-format', '%w %h', filename], { windowsHide: true });
          const [width, height] = stdout.trim().split(/\s+/).map(Number);
          sources.set(id, filename); dimensions.set(id, { width, height });
          return { width, height };
        };
        const plan: TileAnimationAssetPlan = { sceneId: scene.id, layerId: Number(layer.layerId), graphic, width: base.width, height: base.height, entries: [] };
        const frameTiles: number[][] = Array.from({ length: base.height / 8 }, () => []);
        const frameSources: string[][] = Array.from({ length: base.height / 8 }, () => []);
        const framePalettes: Array<Array<string | null>> = Array.from({ length: base.height / 8 }, () => []);
        let ordinal = 0;
        const grid = Number(scene.gridSize) === 16 ? 16 : 8;
        for (const animation of animations) {
          const targetId = animation.targetTilesetId || layer.selectedTilesetId || originalBackground || scene.selectedTilesetId;
          const size = await resolveSource(targetId);
          const target = Number(animation.targetTileIndex);
          if (!Number.isInteger(target) || target < 0 || target >= Math.floor(size.width / 8) * Math.floor(size.height / 8)) throw new Error(`Tile animation destination ${target} outside '${targetId}'`);
          const sourceX = (target % Math.floor(size.width / 8)) * 8, sourceY = Math.floor(target / Math.floor(size.width / 8)) * 8;
          const groups = new Map<string, number[]>();
          const addTarget = (x: number, y: number, painted: boolean) => {
            if (x < 0 || y < 0 || x >= base.width || y >= base.height) return;
            const palette = layer.tilePaletteIds?.[Math.floor(y / grid)]?.[Math.floor(x / grid)];
            const paletteId = palette && palette !== '__original__' ? palette : '';
            const targets = groups.get(paletteId) ?? [];
            targets.push((y / 8) * columns + x / 8); groups.set(paletteId, targets);
          };
          if (targetId === originalBackground) {
            if (!(Number(layer.tileMap?.[Math.floor(sourceY / grid)]?.[Math.floor(sourceX / grid)] ?? -1) >= 0)) addTarget(sourceX, sourceY, false);
          } else {
            for (const [rowIndex, row] of (layer.tileMap ?? []).entries()) for (const [columnIndex, tile] of row.entries()) {
              if (!Number.isInteger(tile) || tile < 0) continue;
              const id = layer.tileMapTilesetIds?.[rowIndex]?.[columnIndex] ?? layer.selectedTilesetId ?? scene.selectedTilesetId;
              if (id !== targetId) continue;
              const perRow = Math.floor(size.width / grid);
              const x = (tile % perRow) * grid, y = Math.floor(tile / perRow) * grid;
              if (sourceX >= x && sourceX < x + grid && sourceY >= y && sourceY < y + grid) addTarget(columnIndex * grid + sourceX - x, rowIndex * grid + sourceY - y, true);
            }
          }
          if (!groups.size) {
            console.warn(`..: Ignoring tile animation '${animation.name || animation.id || target}' in scene ${scene.name || scene.id}, layer ${layer.layerId}: destination from '${targetId}' is no longer painted in this layer`);
            continue;
          }
          for (const [palette, targets] of groups) {
            const frames: number[] = [];
            for (const [index, frame] of animation.frameTileIndices.entries()) {
              const id = animation.frameTilesetIds?.[index] || targetId;
              const frameSize = await resolveSource(id);
              if (!Number.isInteger(frame) || frame < 0 || frame >= Math.floor(frameSize.width / 8) * Math.floor(frameSize.height / 8)) throw new Error(`Tile animation frame ${frame} outside '${id}'`);
              const cell = area + ordinal++, row = Math.floor(cell / columns), column = cell % columns;
              frameTiles[row] ??= []; frameSources[row] ??= []; framePalettes[row] ??= [];
              frameTiles[row][column] = frame; frameSources[row][column] = id; framePalettes[row][column] = palette || '__original__';
              frames.push(cell);
            }
            plan.entries.push({ animation: { ...animation }, targets, frames });
          }
        }
        if (!plan.entries.length) {
          scene.tileAnimations = scene.tileAnimations.filter((animation: any) => Number(animation.layerId) !== Number(layer.layerId));
          continue;
        }
        if (plan.entries.length > 32) throw new Error(`Scene ${scene.name || scene.id}, layer ${layer.layerId}: tile animation palette variants exceed 32`);
        const maps = 1 + Math.ceil(ordinal / area), height = base.height * maps;
        const rgba = new Uint8Array(base.width * height * 4);
        rgba.set(base.rgba);
        const temporary = path.join(graphics, `.${graphic}.base.bmp`), destination = path.join(graphics, `${graphic}.bmp`);
        fs.writeFileSync(temporary, encodeSpriteBmp(rgba, base.width, height));
        try {
          await this.composeTileLayer(temporary, sources, destination, frameTiles, 8, frameSources, undefined, framePalettes, palettePaths);
        } finally { fs.rmSync(temporary, { force: true }); }
        // Extra maps are replacement sheets in ROM; runtime uses only map 0.
        const descriptor = { type: 'regular_bg', height: base.height, bpp_mode: 'bpp_8', flipped_tiles_reduction: false, tiles_compression: 'none', map_compression: 'none', palette_compression: 'none' };
        fs.writeFileSync(path.join(graphics, `${graphic}.json`), JSON.stringify(descriptor, null, 2));
        layer.backgroundId = graphic;
        this.preparedGraphics.add(graphic);
        this.tileAnimationPlans.push(plan);
        output.push({ ...source, id: graphic, name: graphic, filename: `${graphic}.bmp`, imageWidth: base.width, imageHeight: base.height, __paletteFrames: framePalettes } as any);
      }
    }
    return output;
  }

  /**
   * Builds the dialogue frame as a regular background instead of scaling a
   * 32x32 sprite.  Scaling the sprite also scales its 8px border, which is
   * why the frame looked distorted in the game.
   */
  public async materializeDialogueFrame(sourceFilename = 'frame.png'): Promise<void> {
    const graphicsDir = this.getGraphicsDir();
    // Full-screen menus are frameless. Remove artifacts from older builds too.
    for (const extension of ['bmp', 'json']) {
      fs.rmSync(path.join(graphicsDir, `menu_frame_fullscreen_sprite.${extension}`), { force: true });
    }
    const sourceBase = this.sanitizeFilename(path.basename(sourceFilename)).replace(/\.[^/.]+$/, '');
    const sourcePath = [
      path.join(graphicsDir, `${sourceBase}.bmp`),
      path.join(graphicsDir, `${sourceBase}.png`),
    ].find(candidate => fs.existsSync(candidate));
    if (!sourcePath) {
      throw new Error(`Dialogue frame source not found: ${sourceFilename}`);
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

      const panelFrames = [
        ['menu_frame_side_1_sprite', 60, 160],
        ['menu_frame_side_2_sprite', 120, 160],
      ] as const;
      for (const [name, width, height] of panelFrames) {
        const sheetWidth = Math.ceil(width / 64) * 64;
        const sheetHeight = Math.ceil(height / 64) * 64;
        const output = path.join(graphicsDir, `${name}.bmp`);
        const panelArgs = [
          '-size', `${width}x${height}`, `xc:${indexZeroColor}`,
          topLeft, '-geometry', '+0+0', '-composite',
          '-size', `${width - 16}x8`, `tile:${top}`, '-geometry', '+8+0', '-composite',
          topRight, '-geometry', `+${width - 8}+0`, '-composite',
          '-size', `8x${height - 16}`, `tile:${left}`, '-geometry', '+0+8', '-composite',
          '-size', `${width - 16}x${height - 16}`, `tile:${center}`, '-geometry', '+8+8', '-composite',
          '-size', `8x${height - 16}`, `tile:${right}`, '-geometry', `+${width - 8}+8`, '-composite',
          bottomLeft, '-geometry', `+0+${height - 8}`, '-composite',
          '-size', `${width - 16}x8`, `tile:${bottom}`, '-geometry', `+8+${height - 8}`, '-composite',
          bottomRight, '-geometry', `+${width - 8}+${height - 8}`, '-composite',
          '-background', indexZeroColor, '-gravity', 'northwest', '-extent', `${sheetWidth}x${sheetHeight}`,
          '-compress', 'None', '-type', 'Palette', `BMP3:${output}`,
        ];
        await execFileAsync(magick, panelArgs);
        fs.writeFileSync(path.join(graphicsDir, `${name}.json`), JSON.stringify({ type: 'sprite', width: 64, height: 64 }, null, 2));
      }
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
    const executable = process.platform === 'win32' ? 'magick.exe' : 'magick';
    const localCandidates = [
      path.resolve(this.__dirname, 'bin', 'image-magick', executable),
      path.resolve(this.__dirname, '..', 'bin', 'image-magick', executable),
      path.resolve(this.__dirname, '..', '..', '..', '..', 'bin', 'image-magick', executable),
    ];
    const localPath = localCandidates.find(candidate => fs.existsSync(candidate));
    if (localPath) return localPath;
    return isDev
      ? path.join(this.__dirname, '..', 'bin', 'image-magick', executable)
      : path.join(process.resourcesPath ?? '', 'bin', 'image-magick', executable);
  }

  private async createPaletteImage(destination: string, colors: unknown[]): Promise<void> {
    const normalized = colors.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 16);
    while (normalized.length < 16) normalized.push('#000000');
    const args = normalized.flatMap(color => ['-size', '1x1', `xc:${color}`]);
    args.push('+append', `PNG32:${destination}`);
    await execFileAsync(this.getMagickPath(), args);
  }

  private async readGraphicRgba(filename: string, indexed = false) {
    const { stdout: dimensions } = await execFileAsync(this.getMagickPath(), ['identify', '-format', '%w %h', filename]);
    const [width, height] = dimensions.trim().split(/\s+/).map(Number);
    const { stdout } = await execFileAsync(this.getMagickPath(), [filename, '-alpha', 'on', '-depth', '8', 'RGBA:-'], { encoding: 'buffer', maxBuffer: width * height * 4 + 1024, windowsHide: true });
    const rgba = new Uint8Array(stdout);
    const mask = indexed ? indexedTransparency(fs.readFileSync(filename)) : null;
    if (mask) for (let pixel = 0; pixel < mask.length; ++pixel) if (mask[pixel]) rgba[pixel * 4 + 3] = 0;
    return { width, height, rgba };
  }

  private async indexedGraphicToPng(filename: string, destination: string): Promise<void> {
    const { width, height, rgba } = await this.readGraphicRgba(filename, true);
    const raw = destination + '.rgba';
    fs.writeFileSync(raw, rgba);
    try {
      await execFileAsync(this.getMagickPath(), ['-size', `${width}x${height}`, '-depth', '8', `RGBA:${raw}`, `PNG32:${destination}`]);
    } finally { fs.rmSync(raw, { force: true }); }
  }

  private async composeTileLayer(sourceBmp: string, tilesetBmps: Map<string, string>, destination: string, tileMap: number[][], grid: number, tileMapTilesetIds?: Array<Array<string | null>>, fallbackTilesetId?: string, tilePaletteIds?: Array<Array<string | null>>, palettePaths: Map<string, string> = new Map()): Promise<void> {
    const magickPath = this.getMagickPath();
    const normalizedInputs: string[] = [];
    const originalSource = sourceBmp;
    sourceBmp = destination + '.compose-base.png';
    normalizedInputs.push(sourceBmp);
    await this.indexedGraphicToPng(originalSource, sourceBmp);
    const normalizedTiles = new Map<string, string>();
    for (const [id, filename] of tilesetBmps) {
      const png = destination + `.compose-tiles-${normalizedTiles.size}.png`;
      normalizedInputs.push(png);
      await this.indexedGraphicToPng(filename, png);
      normalizedTiles.set(id, png);
    }
    tilesetBmps = normalizedTiles;
    const tilesPerRowById = new Map<string, number>();
    await Promise.all([...tilesetBmps.entries()].map(async ([id, filename]) => {
      const { stdout } = await execFileAsync(magickPath, ['identify', '-format', '%w', filename]);
      tilesPerRowById.set(id, Math.max(1, Math.floor(Number.parseInt(stdout, 10) / grid)));
    }));
    const compositeOperations: string[][] = [];
    for (let row = 0; row < tileMap.length; row++) {
      for (let col = 0; col < tileMap[row].length; col++) {
        const tile = Number(tileMap[row][col]);
        if (!Number.isInteger(tile) || tile < 0) continue;
        const tilesetId = tileMapTilesetIds?.[row]?.[col] ?? fallbackTilesetId;
        const tilesetBmp = tilesetId ? tilesetBmps.get(tilesetId) : undefined;
        const tilesPerRow = tilesetId ? tilesPerRowById.get(tilesetId) : undefined;
        if (!tilesetBmp || !tilesPerRow) continue;
        const sourceX = (tile % tilesPerRow) * grid;
        const sourceY = Math.floor(tile / tilesPerRow) * grid;
        const paletteId = tilePaletteIds?.[row]?.[col];
        const palettePath = paletteId ? palettePaths.get(paletteId) : undefined;
        const operation = ['(', tilesetBmp, '-crop', `${grid}x${grid}+${sourceX}+${sourceY}`, '+repage'];
        if (palettePath) operation.push('-remap', palettePath);
        operation.push(')', '-geometry', `+${col * grid}+${row * grid}`, '-composite');
        compositeOperations.push(operation);
      }
    }

    // Windows limits the total command-line length. Bound each Magick call and
    // apply batches to successive PNGs so alpha survives and arguments stay bounded.
    const maxCommandLength = 12000;
    const operationBatches: string[][][] = [];
    let batch: string[][] = [];
    let batchLength = sourceBmp.length + 128;
    for (const operation of compositeOperations) {
      const operationLength = operation.reduce((length, argument) => length + argument.length + 4, 0);
      if (batch.length && batchLength + operationLength > maxCommandLength) {
        operationBatches.push(batch);
        batch = [];
        batchLength = 128;
      }
      batch.push(operation);
      batchLength += operationLength;
    }
    if (batch.length || !operationBatches.length) operationBatches.push(batch);

    const temporaryOutputs: string[] = [...normalizedInputs];
    let input = sourceBmp;
    try {
      for (let index = 0; index < operationBatches.length; index += 1) {
        const output = destination + `.compose-${index}.png`;
        temporaryOutputs.push(output);
        const args = [input, ...operationBatches[index].flat(), `PNG32:${output}`];
        await execFileAsync(magickPath, args);
        if (input !== sourceBmp && fs.existsSync(input)) fs.rmSync(input, { force: true });
        input = output;
      }
      const image = await this.readGraphicRgba(input);
      fs.writeFileSync(destination, encodeSpriteBmp(image.rgba, image.width, image.height));
    } finally {
      for (const temporaryOutput of temporaryOutputs) {
        if (fs.existsSync(temporaryOutput)) fs.rmSync(temporaryOutput, { force: true });
      }
    }
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
    if (path.extname(bmpPath).toLowerCase() === '.bmp' && relativeBase.toLowerCase().replace(/\\/g, '/').split('/')[0] === 'backgrounds') {
      let bytes = fs.readFileSync(bmpPath);
      if (bytes.length < 54 || ![1, 4, 8].includes(bytes.readUInt16LE(28)) || bytes.readUInt32LE(30) !== 0) {
        await this.convertWithMagick(bmpPath, bmpPath, 'backgrounds', resourceFile);
        bytes = fs.readFileSync(bmpPath);
      }
      const padded = fitRegularBgBmp(bytes);
      fs.writeFileSync(bmpPath, padded.data);
      if (resourceFile?.jsonContent) {
        resourceFile.jsonContent.imageWidth = padded.width;
        resourceFile.jsonContent.imageHeight = padded.height;
      }
    }
    await this.createGraphicsJson(path.dirname(sourcePath), bmpPath, relativeBase, resourceFile);
    this.preparedGraphics.add(path.parse(bmpPath).name);
  }

  /**
   * Determine destination path for asset based on type
   */
  private getAssetDestination(
    sourcePath: string,
    relativePath: string,
    relativeBase = ''
  ): string {
    const ext = path.extname(sourcePath).toLowerCase();
    const baseDir = this.buildDir;

    // Categorize by extension
    if (['.png', '.bmp', '.gif', '.jpg', '.jpeg'].includes(ext)) {
      // Graphics/images
      return path.join(baseDir, 'graphics', relativePath);
    } else if (['.wav', '.mp3', '.ogg', '.mod', '.xm', '.s3m', '.it'].includes(ext)) {
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
   * Reject obviously truncated tracker files before they reach the Butano
   * converter. The converter remains the final authority for semantic
   * compatibility; this check gives the editor/build an actionable source
   * diagnostic and never rewrites the original module.
   */
  private validateTrackerModule(sourcePath: string, extension: string): void {
    const bytes = fs.readFileSync(sourcePath);
    const text = (offset: number, length: number) => bytes.subarray(offset, offset + length).toString('ascii');
    const u16 = (offset: number) => offset + 2 <= bytes.length ? bytes.readUInt16LE(offset) : -1;
    const u32 = (offset: number) => offset + 4 <= bytes.length ? bytes.readUInt32LE(offset) : -1;
    const filename = path.basename(sourcePath);
    const invalid = (reason: string): never => {
      throw new Error(`Invalid tracker module ${filename}: ${reason}`);
    };

    if (extension === '.mod') {
      // 15-sample MODs have a 600-byte minimum header; 31-sample variants
      // add the signature at 1080, but both must contain at least the header.
      if (bytes.length < 600) invalid('file is shorter than the minimum MOD header (600 bytes)');
      return;
    }
    if (extension === '.xm') {
      if (bytes.length < 80 || text(0, 17) !== 'Extended Module: ') invalid('missing the XM signature/header');
      const headerSize = u32(60);
      const patterns = u16(70);
      const instruments = u16(72);
      if (headerSize < 20 || 60 + headerSize > bytes.length) invalid('song header exceeds file size');
      if (patterns > 256 || instruments > 128) invalid('header counts exceed editor limits');
      let cursor = 60 + headerSize;
      for (let pattern = 0; pattern < patterns; pattern += 1) {
        if (cursor + 9 > bytes.length) invalid(`pattern ${pattern} header exceeds file size`);
        const patternHeaderSize = u32(cursor);
        const packedSize = u16(cursor + 7);
        if (patternHeaderSize < 9 || cursor + patternHeaderSize + packedSize > bytes.length) {
          invalid(`pattern ${pattern} data exceeds file size`);
        }
        cursor += patternHeaderSize + packedSize;
      }
      for (let instrument = 0; instrument < instruments; instrument += 1) {
        if (cursor + 33 > bytes.length) invalid(`instrument ${instrument + 1} header exceeds file size`);
        const instrumentHeaderSize = u32(cursor);
        const sampleCount = u16(cursor + 27);
        const sampleHeaderSize = u32(cursor + 29);
        if (instrumentHeaderSize < 33 || cursor + instrumentHeaderSize > bytes.length) invalid(`instrument ${instrument + 1} header exceeds file size`);
        if (sampleCount > 0 && (sampleHeaderSize < 40 || cursor + instrumentHeaderSize + sampleCount * sampleHeaderSize > bytes.length)) {
          invalid(`instrument ${instrument + 1} sample headers exceed file size`);
        }
        const sampleHeaders = cursor + instrumentHeaderSize;
        let sampleDataSize = 0;
        for (let sample = 0; sample < sampleCount; sample += 1) sampleDataSize += u32(sampleHeaders + sample * sampleHeaderSize);
        if (sampleHeaders + sampleCount * sampleHeaderSize + sampleDataSize > bytes.length) invalid(`instrument ${instrument + 1} sample data exceeds file size`);
        cursor = sampleHeaders + sampleCount * sampleHeaderSize + sampleDataSize;
      }
      return;
    }
    if (extension === '.s3m') {
      if (bytes.length < 96 || text(44, 4) !== 'SCRM') invalid('missing the S3M signature/header');
      const orders = u16(32);
      const instruments = u16(34);
      const patterns = u16(36);
      const tableEnd = 96 + orders + (instruments + patterns) * 2;
      if (orders < 0 || instruments < 0 || patterns < 0 || tableEnd > bytes.length) invalid('parapointer tables exceed file size');
      for (let index = 0; index < patterns; index++) {
        const pointer = u16(96 + orders + (instruments + index) * 2);
        if (pointer <= 0 || pointer * 16 >= bytes.length) invalid(`pattern ${index} parapointer is outside the file`);
        const patternOffset = pointer * 16;
        const packedLength = u16(patternOffset);
        if (packedLength < 0 || patternOffset + 2 + packedLength > bytes.length) invalid(`pattern ${index} data exceeds file size`);
      }
      return;
    }
    if (bytes.length < 192 || text(0, 4) !== 'IMPM') invalid('missing the IT signature/header');
    const orders = u16(0x20);
    const instruments = u16(0x22);
    const samples = u16(0x24);
    const patterns = u16(0x26);
    const tableEnd = 0xC0 + orders + (instruments + samples + patterns) * 4;
    if (orders < 0 || instruments < 0 || samples < 0 || patterns < 0 || tableEnd > bytes.length) invalid('pointer tables exceed file size');
    for (let index = 0; index < patterns; index++) {
      const pointer = u32(0xC0 + orders + (instruments + samples) * 4 + index * 4);
      if (pointer <= 0 || pointer >= bytes.length) invalid(`pattern ${index} pointer is outside the file`);
      const packedLength = u16(pointer);
      const rows = u16(pointer + 2);
      if (packedLength < 0 || rows < 1 || pointer + 8 + packedLength > bytes.length) invalid(`pattern ${index} data exceeds file size`);
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

  private removeLegacyTilesetGraphics(): void {
    const legacyTileSourceDir = path.join(this.buildDir, '.tile-source');
    if (fs.existsSync(legacyTileSourceDir)) fs.rmSync(legacyTileSourceDir, { recursive: true, force: true });

    const graphicsDir = this.getGraphicsDir();
    if (!fs.existsSync(graphicsDir)) return;

    for (const entry of fs.readdirSync(graphicsDir, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
      const descriptorPath = path.join(graphicsDir, entry.name);
      try {
        const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
        if (descriptor.type !== 'palette_bitmap') continue;
        const bitmapPath = path.join(graphicsDir, `${path.basename(entry.name, path.extname(entry.name))}.bmp`);
        if (fs.existsSync(bitmapPath)) fs.rmSync(bitmapPath, { force: true });
        fs.rmSync(descriptorPath, { force: true });
      } catch {
        // Leave unrelated or malformed graphics descriptors untouched.
      }
    }
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

    let avatarHeight = 16;
    if (rel === 'avatars') {
      const bmp = fs.readFileSync(destDir);
      if (bmp.length >= 26 && bmp.toString('ascii', 0, 2) === 'BM') avatarHeight = Math.abs(bmp.readInt32LE(22));
    }
    const jsonContent = {
      type,
      ...(type === 'sprite' ? { height: rel === 'avatars' ? avatarHeight : resourceFile?.jsonContent?.playerFrameHeight ?? 16 } : {}),
    };

    const jsonPath = path.join(
      path.dirname(destDir), 
      path.basename(destDir, path.extname(destDir)) + ".json"
    );
    fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
  }

  private async validateAvatarDimensions(sourcePath: string): Promise<void> {
    const { stdout } = await execFileAsync(this.getMagickPath(), [sourcePath + '[0]', '-format', '%w %h', 'info:']);
    const [width, height] = stdout.trim().split(/\s+/).map(Number);
    if (width !== height || (width !== 16 && width !== 32))
      throw new Error(`Avatar ${path.basename(sourcePath)} must be exactly 16x16 or 32x32 pixels (received ${width}x${height})`);
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

    const magickPath = this.getMagickPath();

    switch (mode) {
      case "title":
        args = [
          sourcePath,
          "-background", "none",
          customizedPalettePath ? "-remap" : "-colors",
          customizedPalettePath ? customizedPalettePath : "256",
          "-depth", "8",
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
          "-depth", "4",
          "-compress", "None",
          "-type", "Palette",
          `BMP3:${destPath}`
        ];

        break;
      case "sprites":
        args = [
          sourcePath,
          "-background", "none",
          "-colors", "256",
          "-depth", "8",
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
          "-depth", "8",
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
