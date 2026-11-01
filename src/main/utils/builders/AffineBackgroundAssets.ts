import fs from 'fs';
import path from 'path';
import type { ResourceFile } from '../types/BuildTypes';
import { toRuntimeBackground } from '../types/RuntimeResources';
import { tileAnimationMapOffset } from './TileAnimationAssets';
import { AFFINE_TRANSFORM_EVENTS, collectBackgroundManipulations } from '../../../shared/events/backgroundCompatibility';

export const BACKGROUND_TRANSFORMS = AFFINE_TRANSFORM_EVENTS;
interface Plan { name: string; graphic: string; scene?: any; layer?: any }

/** Analyze reachable scripts, including actor/trigger branches and reusable calls.
 * Preparation changes only build copies, never saved scene or image resources. */
export function prepareAffineBackgrounds(resources: ResourceFile[], graphicsDir: string): Plan[] {
  const backgrounds = new Map(resources.filter(file => file.jsonContent?._resourceType === 'background').map(file => [file.jsonContent!.id, file.jsonContent!]));
  const definitions = new Map<string, any>();
  for (const file of resources) if (file.jsonContent?._resourceType === 'scripts')
    for (const script of (file.jsonContent as any).scripts ?? []) definitions.set(script.id, script);
  const plans = new Map<string, Plan>();
  const graphicFor = (id: string) => {
    const background = backgrounds.get(id);
    if (!background) throw new Error(`Affine background resource not found: ${id}`);
    return toRuntimeBackground(background).graphicsName;
  };
  for (const file of resources) {
    const scene = file.jsonContent as any;
    if (scene?._resourceType !== 'scene' || scene._deleted) continue;
    const sceneType = String(scene.sceneType ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (['logo', 'pointclick', 'pointnclick'].includes(sceneType)) continue;
    const transforms = new Set<number>(), changes: any[] = [];
    for (const event of collectBackgroundManipulations(scene, definitions)) {
      if (BACKGROUND_TRANSFORMS.has(event.command)) {
        const layer = event.args?.layerId ?? 0;
        if (!Number.isInteger(layer) || layer < 0 || layer > 3) throw new Error(`Scene ${scene.name}: affine transformations require a fixed layer from 0 to 3`);
        transforms.add(layer);
      }
      if (event.command === 'EVENT_CHANGE_LAYER') changes.push(event.args ?? {});
      if (event.command === 'EVENT_BACKGROUND_ANIMATE' && event.args?.regularBackgroundId) changes.push({ layerId: event.args?.layerId ?? 0, backgroundId: event.args.regularBackgroundId });
    }
    if (!transforms.size) continue;
    scene.backgrounds ??= [];
    const active = new Set<number>(scene.backgrounds.filter((layer: any) => layer.backgroundId).map((layer: any) => Number(layer.layerId)));
    for (const change of changes) if (change.backgroundId && Number.isInteger(change.layerId)) active.add(change.layerId);
    const affine = [...active].filter(layer => transforms.has(layer)).length;
    const regular = active.size - affine;
    if (affine > 2 || (affine === 2 && regular > 0) || (affine === 1 && regular > 2))
      throw new Error(`Scene ${scene.name}: affine background hardware limit exceeded (${affine} affine, ${regular} regular). Use one affine with at most two regular layers, or two affine layers without regular layers.`);
    for (const layerId of transforms) {
      let layer = scene.backgrounds.find((candidate: any) => Number(candidate.layerId) === layerId);
      if (!layer) { layer = { layerId, backgroundId: '' }; scene.backgrounds.push(layer); }
      layer.__affine = true;
      if (layer.backgroundId) {
        const graphic = graphicFor(layer.backgroundId);
        const name = `affine_${String(scene.id).replace(/[^a-zA-Z0-9_]/g, '_')}_l${layerId}`;
        layer.__affineGraphicsName = name;
        plans.set(name, { name, graphic, scene, layer });
      }
      for (const change of changes) if (Number(change.layerId) === layerId && change.backgroundId) {
        const graphic = graphicFor(change.backgroundId);
        plans.set(graphic, { name: graphic, graphic });
      }
    }
  }
  for (const graphic of new Set([...plans.values()].map(plan => plan.graphic))) {
    const descriptorPath = path.join(graphicsDir, graphic + '.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    if (descriptor.type !== 'regular_bg') throw new Error(`Affine conversion requires a tiled background: ${graphic}`);
    fs.writeFileSync(descriptorPath, JSON.stringify({ ...descriptor, tiles_compression: 'none', map_compression: 'none', palette_compression: 'none' }));
  }
  return [...plans.values()];
}

function array(source: string, symbol: string): number[] {
  const match = new RegExp(`${symbol}:\\r?\\n((?:(?:[\\t ]*\\.(?:word|hword)[^\\r\\n]*|[\\t ]*)\\r?\\n)+)`).exec(source);
  if (!match) throw new Error(`Affine conversion: missing uncompressed array ${symbol}`);
  return [...match[1].matchAll(/0x[0-9a-f]+|\b\d+\b/gi)].map(value => Number(value[0]));
}

export function convertAffineTiles(words: number[], cells: number[], palette: number[], width: number, height: number, bpp: 4 | 8, animations: any[] = []) {
  const wordsPerTile = bpp === 8 ? 16 : 8;
  const source = new Uint8Array(words.length * 4);
  words.forEach((word, index) => { for (let byte = 0; byte < 4; ++byte) source[index * 4 + byte] = (word >>> (byte * 8)) & 255; });
  const result: number[][] = [], indices = new Map<string, number>(), deduplicated = new Map<string, number>();
  const targets = new Set<number>(animations.map(animation => animation.targetTileIndex));
  const variants = new Map<number, Map<number, number>>();
  const add = (index: number, attributes: number, dedicated = false): number => {
    const key = `${index}:${attributes}`;
    if (indices.has(key)) return indices.get(key)!;
    if (index < 0 || (index + 1) * wordsPerTile > words.length) throw new Error(`Affine conversion: invalid source tile ${index}`);
    const pixels = Array.from({ length: 64 }, (_, pixel) => {
      const x = pixel % 8, y = Math.floor(pixel / 8);
      const sourcePixel = (attributes & 2048 ? 7 - y : y) * 8 + (attributes & 1024 ? 7 - x : x);
      if (bpp === 8) return source[index * 64 + sourcePixel];
      const byte = source[index * 32 + Math.floor(sourcePixel / 2)];
      const value = (byte >>> ((sourcePixel % 2) * 4)) & 15;
      return value ? value + ((attributes >>> 12) * 16) : 0;
    });
    const pixelKey = pixels.join(',');
    let tile = dedicated ? undefined : deduplicated.get(pixelKey);
    if (tile === undefined) {
      tile = result.length;
      result.push(pixels);
      if (!dedicated) deduplicated.set(pixelKey, tile);
    }
    indices.set(key, tile);
    if (dedicated) { if (!variants.has(index)) variants.set(index, new Map()); variants.get(index)!.set(attributes, tile); }
    return tile;
  };
  const map = Array.from({ length: width * height }, (_, cell) => {
    const entry = cells[tileAnimationMapOffset(cell, width * 8, height * 8)];
    if (entry === undefined) throw new Error('Affine conversion: map dimensions do not match the tile data');
    const index = entry & 1023;
    return add(index, entry & 0xfc00, targets.has(index));
  });
  const convertedAnimations = animations.flatMap(animation => {
    if (!variants.has(animation.targetTileIndex)) add(animation.targetTileIndex, 0, true);
    return [...variants.get(animation.targetTileIndex)!].map(([attributes, targetTileIndex]) => ({ ...animation, targetTileIndex,
      frameTileIndices: animation.frameTileIndices.map((frame: number) => add(frame, attributes)) }));
  });
  // Count the whole converted asset before reporting overflow. Stopping at
  // tile 257 concealed how far the source was from the hardware limit.
  if (result.length > 256) throw new Error(`Affine background requires ${result.length} unique tiles; the GBA limit is 256 unique tiles, including animation frames, palette variants and baked flips. Simplify the background to fit, keep it regular without scale/rotation/shear, or use a direct bitmap scene (Logo/Point Click).`);
  const colors = [...palette];
  while (colors.length < 16 || colors.length % 16) colors.push(0);
  return { tiles: result, cells: map, colors, animations: convertedAnimations };
}

/** Generate ROM-only affine items after regular animation destinations have
 * been isolated. Hardware map cells cannot represent flips or palette banks. */
export function materializeAffineBackgrounds(plans: Plan[], buildDir: string): void {
  const expected = new Set(plans.map(plan => `bn_affine_bg_items_${plan.name}.h`));
  for (const name of fs.readdirSync(buildDir)) if (name.startsWith('bn_affine_bg_items_') && name.endsWith('.h') && !expected.has(name)) {
    const file = path.join(buildDir, name);
    if (fs.readFileSync(file, 'utf8').startsWith('// GBA_STUDIO_AFFINE')) fs.unlinkSync(file);
  }
  for (const plan of plans) {
    try {
      const header = fs.readFileSync(path.join(buildDir, `bn_regular_bg_items_${plan.graphic}.h`), 'utf8');
      const source = fs.readFileSync(path.join(buildDir, `${plan.graphic}_bn_gfx.s`), 'utf8');
      const size = /regular_bg_map_item\([^]*?size\((\d+),\s*(\d+)\)/.exec(header);
      const bpp = /bpp_mode::BPP_([48])/.exec(header);
      if (!size || !bpp) throw new Error('unavailable map dimensions or color depth');
      const cells = array(source, plan.graphic + '_bn_gfxMap');
      for (const override of plan.layer?.tileMapCellOverrides ?? []) {
        const offset = tileAnimationMapOffset(override.index, Number(size[1]) * 8, Number(size[2]) * 8);
        if (offset < 0 || offset >= cells.length) throw new Error('invalid cell attribute index');
        cells[offset] = override.tileIndex | (override.horizontalFlip ? 1024 : 0) | (override.verticalFlip ? 2048 : 0) | ((override.paletteId ?? 0) << 12);
      }
      const animations = (plan.scene?.tileAnimations ?? []).filter((animation: any) => animation.layerId === plan.layer.layerId);
      const converted = convertAffineTiles(array(source, plan.graphic + '_bn_gfxTiles'), cells, array(source, plan.graphic + '_bn_gfxPal'), Number(size[1]), Number(size[2]), Number(bpp[1]) as 4 | 8, animations);
      const tiles: number[][] = [];
      for (const pixels of converted.tiles) for (let half = 0; half < 2; ++half) {
        const data = [];
        for (let word = 0; word < 8; ++word) {
          const index = half * 32 + word * 4;
          data.push((pixels[index] | pixels[index + 1] << 8 | pixels[index + 2] << 16 | pixels[index + 3] << 24) >>> 0);
        }
        tiles.push(data);
      }
      const symbol = plan.name + '_gbas_affine';
      const text = `#pragma once\n#include "bn_affine_bg_item.h"\n#include "bn_tile.h"\n#include "bn_color.h"\nnamespace bn::affine_bg_items {\nalignas(4) inline constexpr tile ${symbol}_tiles[] = {\n${tiles.map(words => '{{' + words.map(word => '0x' + word.toString(16) + 'u').join(',') + '}}').join(',\n')}\n};\nalignas(4) inline constexpr color ${symbol}_colors[] = {${converted.colors.map(color => `color(${color & 31},${color >>> 5 & 31},${color >>> 10 & 31})`).join(',')}};\nalignas(4) inline constexpr affine_bg_map_cell ${symbol}_map[] = {${converted.cells.join(',')}};\ninline constexpr affine_bg_item ${plan.name}(affine_bg_tiles_item(span<const tile>(${symbol}_tiles, ${tiles.length})), bg_palette_item(span<const color>(${symbol}_colors, ${converted.colors.length}), bpp_mode::BPP_8), affine_bg_map_item(${symbol}_map[0], size(${size[1]}, ${size[2]}), compression_type::NONE));\n}\n`;
      fs.writeFileSync(path.join(buildDir, `bn_affine_bg_items_${plan.name}.h`), '// GBA_STUDIO_AFFINE\n' + text);
      if (plan.scene) {
        plan.scene.tileAnimations = [...(plan.scene.tileAnimations ?? []).filter((animation: any) => animation.layerId !== plan.layer.layerId), ...converted.animations];
        if (plan.scene.tileAnimations.length > 32) throw new Error('more than 32 runtime tile animation variants');
      }
    } catch (error) { throw new Error(`Affine background ${plan.scene?.name ?? plan.graphic}, layer ${plan.layer?.layerId ?? 'replacement'}, image ${plan.graphic}: ${error instanceof Error ? error.message : error}`); }
  }
}
