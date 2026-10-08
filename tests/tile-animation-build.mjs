import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')).href);
const graphics = fs.readFileSync(path.join(root, 'tools/butano/template/src/graphics_manager.cpp'), 'utf8');
const sceneInterface = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/providers/contexts/interfaces/ISceneElement.tsx'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/TileAnimationEditor.tsx'), 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-tile-animation-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({ _resourceType: 'scene', id: 'tile-animation', backgrounds: [{ layerId: 0, backgroundId: 'water-bg', tileMapCellOverrides: [{ index: 4, tileIndex: 7, horizontalFlip: true, verticalFlip: true, paletteId: 3 }] }], tileAnimations: [
    { id: 'water', layerId: 0, targetTileIndex: 16, frameTileIndices: [32, 33, 34], durationFrames: 4, loop: true, initialFrame: 1 },
    { id: 'one-shot', layerId: 1, targetTileIndex: 7, frameTileIndices: [8, 9], durationFrames: 2, loop: false },
  ] });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /RegularBgMapCellOverride SCENE_TILE_ANIMATION_BACKGROUNDS_LAYER_0_MAP_OVERRIDES\[\] = \{ \{ 4, 15367 \} \};/);
  assert.match(output, /\{ 0, "water-bg", nullptr, nullptr, nullptr, 0, 0, 3, 0, SCENE_TILE_ANIMATION_BACKGROUNDS_LAYER_0_MAP_OVERRIDES, 1 \}/);
  assert.match(output, /static const int SCENE_TILE_ANIMATION_TILE_ANIMATION_0_FRAMES\[\] = \{ 32, 33, 34 \};/);
  assert.match(output, /static const TileAnimation SCENE_TILE_ANIMATION_TILE_ANIMATION_0 = \{ 0, 16, [^,]+, 3, 4, true, 1 \};/);
  assert.match(output, /static const int SCENE_TILE_ANIMATION_TILE_ANIMATION_1_FRAMES\[\] = \{ 8, 9 \};/);
  assert.match(output, /SCENE_TILE_ANIMATION_TILE_ANIMATIONS_COUNT = 2/);
  assert.match(graphics, /tiles\.bpp\(\) == bn::bpp_mode::BPP_8 \? 2 : 1/);
  assert.match(graphics, /overwrite_tile\(animation\.target_tile_index/);
  assert.match(graphics, /animation\.duration_frames/);
  assert.match(graphics, /regular_bg_map_ptr::allocate_optional/);
  assert.match(graphics, /map_cell_overrides_count/);
  assert.match(graphics, /bg_ptr\.set_map\(\*map_copy\)/);
  assert.match(sceneInterface, /tileMapCellOverrides\?:/);
  assert.match(sceneInterface, /horizontalFlip\?: boolean/);
  assert.match(preview, /cellOverride\?\.horizontalFlip === true/);
  assert.match(preview, /context\.scale\(horizontalFlip \? -1 : 1, verticalFlip \? -1 : 1\)/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-target', tileAnimations: [{ targetTileIndex: 1024, frameTileIndices: [1] }] }), /targetTileIndex/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-frame', tileAnimations: [{ targetTileIndex: 0, frameTileIndices: [1024] }] }), /frameTileIndices/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-duration', tileAnimations: [{ targetTileIndex: 0, frameTileIndices: [1], durationFrames: 0 }] }), /durationFrames/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-initial', tileAnimations: [{ targetTileIndex: 0, frameTileIndices: [1], initialFrame: 1 }] }), /initialFrame/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'too-many', tileAnimations: Array.from({ length: 33 }, () => ({ targetTileIndex: 0, frameTileIndices: [1] })) }), /limit of 32/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'duplicate-target', tileAnimations: [
    { targetTileIndex: 4, frameTileIndices: [1] }, { targetTileIndex: 4, frameTileIndices: [2] },
  ] }), /already animated/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-map-override', backgrounds: [{ layerId: 0, tileMapCellOverrides: [{ index: 0, tileIndex: 1024 }] }] }), /tileIndex must be between 0 and 1023/);
  const generatedBuild = path.join(tempDir, 'generated-build');
  fs.mkdirSync(generatedBuild, { recursive: true });
  fs.writeFileSync(path.join(generatedBuild, 'bn_regular_bg_items_water_bg.h'), [
    'regular_bg_tiles_item(span<const tile>(water_bg_bn_gfxTiles, 8), bpp_mode::BPP_8, compression_type::LZ77),',
    'regular_bg_map_item(water_bg_bn_gfxMap[0], size(32, 32), compression_type::RUN_LENGTH, 1, false);',
  ].join('\n'));
  fs.writeFileSync(path.join(generatedBuild, 'bn_regular_bg_items_four_bg.h'), [
    'regular_bg_tiles_item(span<const tile>(four_bg_bn_gfxTiles, 8), bpp_mode::BPP_4, compression_type::NONE),',
    'regular_bg_map_item(four_bg_bn_gfxMap[0], size(32, 32), compression_type::NONE, 1, false);',
  ].join('\n'));
  const validResources = [{ jsonContent: {
    _resourceType: 'background', id: 'water-bg', name: 'Water', filename: 'water_bg.png',
  } }, { jsonContent: {
    _resourceType: 'scene', id: 'water-scene',
    backgrounds: [{ layerId: 0, backgroundId: 'water-bg' }],
    tileAnimations: [{ layerId: 0, targetTileIndex: 3, frameTileIndices: [0, 1, 3] }],
  } }];
  builder.validateTileAnimationReferences(validResources, generatedBuild);
  assert.throws(() => builder.validateTileAnimationReferences([{ jsonContent: {
    ...validResources[1].jsonContent,
    tileAnimations: [{ layerId: 0, targetTileIndex: 4, frameTileIndices: [0] }],
  } }], generatedBuild), /exceeds 3 logical tiles/);
  const fourBppResources = [{ jsonContent: {
    _resourceType: 'scene', id: 'four-scene',
    backgrounds: [{ layerId: 0, backgroundId: 'four-bg' }],
    tileAnimations: [{ layerId: 0, targetTileIndex: 7, frameTileIndices: [0] }],
  } }];
  builder.validateTileAnimationReferences(fourBppResources, generatedBuild);
  assert.throws(() => builder.validateTileAnimationReferences([{ jsonContent: {
    ...fourBppResources[0].jsonContent,
    tileAnimations: [{ layerId: 0, targetTileIndex: 8, frameTileIndices: [0] }],
  } }], generatedBuild), /exceeds 7 logical tiles/);
  console.log('Tile animation build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
