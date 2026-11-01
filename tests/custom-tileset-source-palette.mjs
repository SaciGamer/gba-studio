import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const { encodeSlotPalettePixels } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/SlotPalettePixels.js')));
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/AssetBuilder.js')));
const { encodeSpriteBmp } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/spriteCanvasPixels.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-default-palettes-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  fs.mkdirSync(path.join(temp, 'src'));
  fs.mkdirSync(path.join(temp, 'graphics'));
  const paletteId = 'f4ccdaee-3c83-4e25-9fde-7321b1b354bd';
  const sceneId = '1518cdb3-d379-4f95-9e3c-66006ef810bc';
  const settingsId = '0503ef65-ed05-41a5-b58f-74702ccced5a';
  const assets = path.join(temp, 'assets');
  fs.mkdirSync(path.join(assets, 'tilesets'), { recursive: true });
  const tile = new Uint8Array(8 * 8 * 4);
  for (let offset = 0; offset < tile.length; offset += 4) { tile[offset] = 255; tile[offset + 3] = 255; }
  fs.writeFileSync(path.join(assets, 'tilesets', 'tiles.bmp'), encodeSpriteBmp(tile, 8, 8));
  const scene = { _resourceType: 'scene', id: sceneId, name: 'Shared slots', sceneType: 'Top Down', width: 256, height: 256, gridSize: 8,
    backgrounds: [{ layerId: 0, selectedTilesetId: 'tiles', tileMap: [[0, 0, 0, 0]], tilePaletteIds: [[null, '__slot__:1', '__original__']] }], script: [] };
  const settings = { _resourceType: 'settings', id: settingsId, startSceneId: sceneId, colorPaletteIds: [paletteId, paletteId] };
  const palette = { _resourceType: 'palette', id: paletteId, colors: ['#000000', ...Array(15).fill('#0000ff')] };
  const files = [scene, settings, palette].map(jsonContent => ({ jsonContent, resourceType: 'gbasres', resourceName: '', headerContent: Buffer.alloc(0) }));
  const assetBuilder = new AssetBuilder(path.join(root, 'dist'), temp, path.join(root, 'bin/image-magick/magick.exe'));
  await assetBuilder.copyAssets(assets, files, { preserveStructure: false });
  const derived = await assetBuilder.materializeTileLayerEdits(files);
  assert.deepEqual(derived[0].__slotPaletteBindings.map(binding => binding.slot), [1], 'only the explicitly applied palette creates slot bindings');
  const image = await assetBuilder.readGraphicRgba(path.join(temp, 'graphics', derived[0].filename), true);
  const pixel = x => [...image.rgba.slice(x * 4, x * 4 + 4)];
  for (const x of [0, 16, 24]) assert.deepEqual(pixel(x), [255, 0, 0, 255], 'unassigned and original cells preserve the red source palette');
  assert.notDeepEqual(pixel(8), [255, 0, 0, 255], 'the explicitly applied slot is encoded');
  console.log('Custom tilesets preserve source colors unless a palette is applied.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
