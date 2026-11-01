import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')).href);
const { toRuntimeResource } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-layer-build-'));
const graphicsDir = path.join(tempDir, 'graphics');
fs.mkdirSync(graphicsDir, { recursive: true });

try {
  const magick = path.join(root, 'bin', 'image-magick', 'magick.exe');
  const assets = path.join(tempDir, 'assets');
  fs.mkdirSync(path.join(assets, 'tilesets'), { recursive: true });
  fs.mkdirSync(path.join(assets, 'backgrounds'), { recursive: true });
  execFileSync(magick, ['-size', '16x16', 'xc:#ff0000', `BMP3:${path.join(assets, 'backgrounds', 'source.bmp')}`], { windowsHide: true });
  execFileSync(magick, ['-size', '8x8', 'xc:#0000ff', `BMP3:${path.join(assets, 'tilesets', 'tiles.bmp')}`], { windowsHide: true });

  const scene = {
    _resourceType: 'scene', id: 'scene-a', gridSize: 8,
    backgrounds: [{ layerId: 0, backgroundId: 'source-id', selectedTilesetId: 'tiles', tileMap: [[0, 0]], tilePaletteIds: [[null, 'palette-custom']] }],
  };
  const sceneRecipe = structuredClone(scene);
  const resources = [
    { resourceName: 'scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: scene },
    { resourceName: 'background_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'background', id: 'source-id', name: 'source', filename: 'source.bmp', imageWidth: 16, imageHeight: 16, autoColor: true, tileColors: '' } },
    { resourceName: 'settings_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'settings', paletteIds: ['palette-default'] } },
    { resourceName: 'palettes_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: { _resourceType: 'palettes', palettes: [
      { id: 'palette-default', colors: Array(16).fill('#00ff00') },
      { id: 'palette-custom', colors: Array(16).fill('#ff8000') },
    ] } },
  ];
  const builder = new AssetBuilder(path.join(root, 'dist'), tempDir, magick);
  await builder.copyAssets(assets, resources, { preserveStructure: false });
  const processAssets = builder.processAssets.bind(builder);
  let processedAssets = 0;
  builder.processAssets = async (...args) => { processedAssets += 1; return processAssets(...args); };
  await builder.copyAssets(assets, resources, { preserveStructure: false });
  assert.equal(processedAssets, 0, 'Unchanged source graphics skip conversion');
  assert.equal(builder.hasPreparedGraphic('source'), true, 'Cached graphics still count as prepared for the current transcode');
  const derived = await builder.materializeTileLayerEdits(resources);

  assert.equal(derived.length, 1);
  assert.equal(scene.backgrounds[0].backgroundId, 'derived_scene_a_layer_0');
  const derivedBmp = path.join(graphicsDir, 'derived_scene_a_layer_0.bmp');
  assert.ok(fs.existsSync(derivedBmp));
  const firstPixel = execFileSync(magick, [derivedBmp, '-format', '%[pixel:p{0,0}]', 'info:'], { encoding: 'utf8' });
  const secondPixel = execFileSync(magick, [derivedBmp, '-format', '%[pixel:p{8,0}]', 'info:'], { encoding: 'utf8' });
  assert.match(firstPixel, /0,255,0/, 'the Settings default palette must be applied to the painted tile');
  // Palette swatches round RGB channels through the GBA's five-bit encoding.
  assert.match(secondPixel, /255,132,0/, 'a tile-specific palette must override the Settings default');
  let composeCalls = 0;
  const composeTileLayer = builder.composeTileLayer.bind(builder);
  builder.composeTileLayer = async (...args) => { composeCalls += 1; return composeTileLayer(...args); };
  const repeatedScene = structuredClone(sceneRecipe);
  const repeatedResources = [{ ...resources[0], jsonContent: repeatedScene }, ...resources.slice(1)];
  await builder.materializeTileLayerEdits(repeatedResources);
  assert.equal(composeCalls, 0, 'Unchanged painted layers reuse their generated graphics');
  const invalidPaletteScene = {
    ...scene,
    id: 'scene-invalid-palette',
    backgrounds: [{ ...scene.backgrounds[0], tilePaletteIds: [['missing-palette']] }],
  };
  await assert.rejects(
    () => builder.materializeTileLayerEdits([
      { resourceName: 'invalid_scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: invalidPaletteScene },
      ...resources.slice(1),
    ]),
    /Unknown tile palette 'missing-palette'/,
  );
  // Materialization must not destroy the source asset; derived output is a
  // separate build artifact and the original remains reusable by the project.
  assert.ok(fs.existsSync(path.join(graphicsDir, 'source.bmp')));

  const autoScene = { _resourceType: 'scene', id: 'auto-current', width: 16, height: 16, gridSize: 8,
    backgrounds: [{ layerId: 0, selectedTilesetId: 'auto-tile:tiles', tileMap: [[0]] }] };
  const autoFile = { resourceName: 'auto_res.h', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: autoScene };
  await assert.rejects(() => builder.materializeTileLayerEdits([autoFile]), /Missing tile source image.*auto-tile:tiles/,
    'Autotiles must not silently resolve an ordinary tileset with the same name');
  fs.mkdirSync(path.join(assets, 'auto-tiles'));
  execFileSync(magick, ['-size', '8x8', 'xc:#ff0000', `BMP3:${path.join(assets, 'auto-tiles', 'tiles.bmp')}`], { windowsHide: true });
  await builder.copyAssets(assets, resources, { preserveStructure: false });
  const autoDerived = await builder.materializeTileLayerEdits([autoFile]);
  assert.equal(autoDerived.length, 1);
  assert.match(execFileSync(magick, [path.join(graphicsDir, autoDerived[0].filename), '-format', '%[pixel:p{0,0}]', 'info:'],
    { encoding: 'utf8', windowsHide: true }), /255,0,0/, 'The current autotile folder must win over the blue ordinary tileset');

  const savedScene = { _resourceType: 'scene', id: 'painted', sceneType: 'Top Down', width: 16, height: 16,
    gridSize: 8, backgrounds: [{ layerId: 0, selectedTilesetId: 'tiles', tileMap: [[0, -1], [-1, 0]] }] };
  const savedProject = path.join(tempDir, 'saved-project');
  fs.mkdirSync(savedProject);
  const savedPath = path.join(savedProject, 'scene.gbasres');
  const savedBytes = JSON.stringify(savedScene, null, 2);
  fs.writeFileSync(savedPath, savedBytes);
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  const resourceBuilder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const [paintedFile] = await resourceBuilder.processResourceFiles(savedProject);
  const painted = paintedFile.jsonContent;
  const paintedDerived = await builder.materializeTileLayerEdits([paintedFile]);
  assert.equal(paintedDerived.length, 1);
  assert.equal(painted.backgrounds[0].backgroundId, 'derived_painted_layer_0');
  assert.equal(fs.readFileSync(savedPath, 'utf8'), savedBytes, 'Preparation must preserve the saved recipe');
  assert.doesNotMatch(resourceBuilder.processRuntimeResource(toRuntimeResource(painted)).headerContent.toString(), /_TILEMAP|SELECTEDTILESETID/);

  const emptyLayerScene = {
    _resourceType: 'scene', id: 'scene-empty', gridSize: 8, width: 16, height: 16,
    backgrounds: [{ layerId: 1, selectedTilesetId: 'tiles', tileMap: [[0]] }],
  };
  const emptyDerived = await builder.materializeTileLayerEdits([
    { resourceName: 'empty_scene_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: emptyLayerScene },
  ]);
  assert.equal(emptyDerived.length, 1, 'an empty layer must receive a derived background');
  assert.equal(emptyLayerScene.backgrounds[0].backgroundId, 'derived_scene_empty_layer_1');
  assert.ok(fs.existsSync(path.join(graphicsDir, 'derived_scene_empty_layer_1.bmp')));
  const repeatedEmptyScene = structuredClone(emptyLayerScene);
  await builder.materializeTileLayerEdits([{ resourceName: 'empty_scene_res.h', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: repeatedEmptyScene }]);
  assert.equal(fs.existsSync(path.join(graphicsDir, 'derived_scene_empty_layer_1_base.bmp')), false,
    'A cache hit for an empty layer must remove its temporary transparent source');
  await assert.rejects(() => builder.materializeTileLayerEdits([
    { resourceName: 'missing_source_res.h', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: {
      _resourceType: 'scene', id: 'missing-source', backgrounds: [{ layerId: 0, tileMap: [[0]] }],
    } },
  ]), /painted tiles have no source tileset/);
  await assert.rejects(() => builder.materializeTileLayerEdits([
    { resourceName: 'missing_graphic_res.h', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: {
      _resourceType: 'scene', id: 'missing-graphic', backgrounds: [{ layerId: 0, backgroundId: 'absent', selectedTilesetId: 'tiles', tileMap: [[0]] }],
    } },
    { resourceName: 'absent_res.h', resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: {
      _resourceType: 'background', id: 'absent', filename: 'absent.bmp',
    } },
  ]), /background graphic is unavailable/);
  console.log('Tile-layer materialization smoke test passed.');
} finally {
  assert.ok(path.resolve(tempDir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(tempDir).startsWith('gba-studio-layer-build-'));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
