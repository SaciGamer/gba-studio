import fs from 'fs';
import path from 'path';
import type { ResourceFile } from '../types/BuildTypes';

export interface TileAnimationAssetPlan {
  sceneId: string;
  layerId: number;
  graphic: string;
  width: number;
  height: number;
  entries: Array<{ animation: any; targets: number[]; frames: number[] }>;
}

/** Convert image-cell positions to Grit's screen-block order when required. */
export function tileAnimationMapOffset(cell: number, width: number, height: number): number {
  const columns = width / 8;
  const x = cell % columns, y = Math.floor(cell / columns);
  const big = width > 512 || height > 512;
  return !big && (width === 512 || height === 512)
    ? (Math.floor(y / 32) * (columns / 32) + Math.floor(x / 32)) * 1024 + (y % 32) * 32 + (x % 32)
    : cell;
}

function readArray(code: string, symbol: string) {
  const match = new RegExp(`(${symbol}:\\r?\\n)((?:(?:[\\t ]*\\.(?:word|hword)[^\\r\\n]*|[\\t ]*)\\r?\\n)+)`).exec(code);
  if (!match) throw new Error(`Tile animation generated array missing: ${symbol}`);
  const values = [...match[2].matchAll(/0x[0-9a-f]+|\b\d+\b/gi)].map(value => Number(value[0]));
  return { match, values };
}

function writeArray(code: string, symbol: string, values: number[], digits: number) {
  const { match } = readArray(code, symbol);
  const rows: string[] = [];
  for (let index = 0; index < values.length; index += 8) {
    rows.push('\t.' + (digits === 8 ? 'word ' : 'hword ') + values.slice(index, index + 8).map(value => '0x' + value.toString(16).padStart(digits, '0')).join(','));
  }
  return code.replace(match[0], match[1] + rows.join('\n') + '\n\n');
}

/** Remap only build copies. The editable source indices remain in the project. */
export function finalizeTileAnimationAssets(plans: TileAnimationAssetPlan[], resources: ResourceFile[], buildDir: string): void {
  const marker = '@ GBA_STUDIO_TILE_ANIMATION_DATA\n';
  for (const plan of plans) {
    const headerPath = path.join(buildDir, `bn_regular_bg_items_${plan.graphic}.h`);
    const sourcePath = path.join(buildDir, `${plan.graphic}_bn_gfx.s`);
    const cachePath = path.join(buildDir, `.${plan.graphic}.tile-animation-source.json`);
    let header = fs.readFileSync(headerPath, 'utf8');
    let source = fs.readFileSync(sourcePath, 'utf8');
    // Butano can reuse generated assets on an incremental build. Always patch
    // its pristine arrays, so dedicated destination tiles are never appended twice.
    if (source.startsWith(marker)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      source = cached.source; header = cached.header;
    } else fs.writeFileSync(cachePath, JSON.stringify({ source, header }));
    const metadata = header.match(/regular_bg_tiles_item\(span<const tile>\([^,]+,\s*(\d+)\),\s*bpp_mode::(BPP_[48]),\s*compression_type::NONE/);
    if (!metadata || !/regular_bg_map_item\([\s\S]*?compression_type::NONE/.test(header)) {
      throw new Error(`Tile animation ${plan.graphic} requires uncompressed graphics and map`);
    }
    const wordsPerTile = metadata[2] === 'BPP_8' ? 16 : 8;
    const tileSymbol = plan.graphic + '_bn_gfxTiles';
    const mapSymbol = plan.graphic + '_bn_gfxMap';
    const tiles = readArray(source, tileSymbol).values;
    const cells = readArray(source, mapSymbol).values;
    const animations: any[] = [];
    for (const entry of plan.entries) {
      const target = tiles.length / wordsPerTile;
      if (target >= 1024) throw new Error(`Tile animation ${plan.graphic} exceeds the 1024-tile background limit`);
      const original = cells[tileAnimationMapOffset(entry.targets[0], plan.width, plan.height)] & 1023;
      tiles.push(...tiles.slice(original * wordsPerTile, (original + 1) * wordsPerTile));
      for (const cell of entry.targets) {
        const offset = tileAnimationMapOffset(cell, plan.width, plan.height);
        cells[offset] = (cells[offset] & 0xfc00) | target;
      }
      const frames = entry.frames.map(cell => {
        const value = cells[tileAnimationMapOffset(cell, plan.width, plan.height)];
        if (value === undefined || (value & 0x0c00)) throw new Error(`Invalid tile animation frame in ${plan.graphic}`);
        return value & 1023;
      });
      animations.push({ ...entry.animation, targetTileIndex: target, frameTileIndices: frames });
    }
    const physicalTiles = tiles.length / 8;
    source = writeArray(source, tileSymbol, tiles, 8);
    source = writeArray(source, mapSymbol, cells, 4);
    header = header.replace(new RegExp(`(${tileSymbol}\\[)\\d+(\\])`), `$1${physicalTiles}$2`)
      .replace(new RegExp(`(span<const tile>\\(${tileSymbol},\\s*)\\d+(\\))`), `$1${physicalTiles}$2`)
      .replace(new RegExp(`(#define ${tileSymbol}Len )\\d+`), `$1${tiles.length * 4}`);
    fs.writeFileSync(sourcePath, marker + source);
    fs.writeFileSync(headerPath, '// GBA_STUDIO_TILE_ANIMATION_DATA\n' + header);
    const scene: any = resources.find(resource => resource.jsonContent?._resourceType === 'scene' && resource.jsonContent.id === plan.sceneId)?.jsonContent;
    if (!scene) throw new Error(`Tile animation scene missing: ${plan.sceneId}`);
    scene.tileAnimations = [...(scene.tileAnimations ?? []).filter((animation: any) => Number(animation.layerId) !== plan.layerId), ...animations];
    if (scene.tileAnimations.length > 32) throw new Error(`Scene ${scene.name || scene.id} exceeds 32 runtime tile animations after palette variants`);
  }
}
