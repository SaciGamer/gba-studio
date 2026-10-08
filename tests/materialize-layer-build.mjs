import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-layer-build-'));
const graphicsDir = path.join(tempDir, 'graphics');
fs.mkdirSync(graphicsDir, { recursive: true });

try {
  const magick = path.join(root, 'bin', 'image-magick', 'magick.exe');
  execFileSync(magick, ['-size', '16x16', 'xc:#ff0000', `BMP3:${path.join(graphicsDir, 'source.bmp')}`]);
  execFileSync(magick, ['-size', '8x8', 'xc:#0000ff', `BMP3:${path.join(graphicsDir, 'tiles.bmp')}`]);

  const scene = {
    _resourceType: 'scene', id: 'scene-a', gridSize: 8,
    backgrounds: [{ layerId: 0, backgroundId: 'source-id', selectedTilesetId: 'tiles', tileMap: [[0, 0]], tilePaletteIds: [[null, 'palette-custom']] }],
  };
  const resources = [
    { resourceName: 'scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: scene },
    { resourceName: 'background_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'background', id: 'source-id', name: 'source', filename: 'source.bmp', imageWidth: 16, imageHeight: 16, autoColor: true, tileColors: '' } },
    { resourceName: 'settings_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'settings', paletteIds: ['palette-default'] } },
    { resourceName: 'palettes_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'palettes', palettes: [
      { id: 'palette-default', colors: Array(16).fill('#00ff00') },
      { id: 'palette-custom', colors: Array(16).fill('#ff8000') },
    ] } },
  ];
  const derived = await new AssetBuilder(path.join(root, 'dist'), tempDir, magick).materializeTileLayerEdits(resources);

  assert.equal(derived.length, 1);
  assert.equal(scene.backgrounds[0].backgroundId, 'derived_scene_a_layer_0');
  const derivedBmp = path.join(graphicsDir, 'derived_scene_a_layer_0.bmp');
  assert.ok(fs.existsSync(derivedBmp));
  const firstPixel = execFileSync(magick, [derivedBmp, '-format', '%[pixel:p{0,0}]', 'info:'], { encoding: 'utf8' });
  const secondPixel = execFileSync(magick, [derivedBmp, '-format', '%[pixel:p{8,0}]', 'info:'], { encoding: 'utf8' });
  assert.match(firstPixel, /0,255,0/, 'the Settings default palette must be applied to the painted tile');
  assert.match(secondPixel, /255,128,0/, 'a tile-specific palette must override the Settings default');
  const invalidPaletteScene = {
    ...scene,
    id: 'scene-invalid-palette',
    backgrounds: [{ ...scene.backgrounds[0], tilePaletteIds: [['missing-palette']] }],
  };
  await assert.rejects(
    () => new AssetBuilder(path.join(root, 'dist'), tempDir, magick).materializeTileLayerEdits([
      { resourceName: 'invalid_scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: invalidPaletteScene },
      ...resources.slice(1),
    ]),
    /Unknown tile palette 'missing-palette'/,
  );
  // Materialization must not destroy the source asset; derived output is a
  // separate build artifact and the original remains reusable by the project.
  assert.ok(fs.existsSync(path.join(graphicsDir, 'source.bmp')));

  const emptyLayerScene = {
    _resourceType: 'scene', id: 'scene-empty', gridSize: 8, width: 16, height: 16,
    backgrounds: [{ layerId: 1, selectedTilesetId: 'tiles', tileMap: [[0]] }],
  };
  const emptyDerived = await new AssetBuilder(path.join(root, 'dist'), tempDir, magick).materializeTileLayerEdits([
    { resourceName: 'empty_scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: emptyLayerScene },
  ]);
  assert.equal(emptyDerived.length, 1, 'an empty layer must receive a derived background');
  assert.equal(emptyLayerScene.backgrounds[0].backgroundId, 'derived_scene_empty_layer_1');
  assert.ok(fs.existsSync(path.join(graphicsDir, 'derived_scene_empty_layer_1.bmp')));
  console.log('Tile-layer materialization smoke test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
