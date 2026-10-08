import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AssetBuilder } from '../dist/main/utils/builders/AssetBuilder.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-parallel-layer-'));
const magick = path.resolve('bin/image-magick/magick.exe');
const file = jsonContent => ({ jsonContent, headerContent: Buffer.from(''), resourceType: 'gbasres', resourceName: 'test' });
try {
  const assets = path.join(root, 'assets');
  fs.mkdirSync(path.join(assets, 'tilesets'), { recursive: true });
  execFileSync(magick, ['-size', '16x8', 'xc:red', '-fill', 'blue', '-draw', 'rectangle 8,0 15,7', `PNG32:${path.join(assets, 'tilesets', 'tiles.png')}`], { windowsHide: true });
  const inputs = [file({ _resourceType: 'scene', id: 'scene-a', width: 256, height: 256, gridSize: 8,
    backgrounds: Array.from({ length: 4 }, (_, layerId) => ({ layerId, selectedTilesetId: 'tiles.png', tileMap: [[0, 1], [1, 0]], tilePaletteIds: [[null, 'preset-grayscale']] })),
  })];
  const builds = [];
  for (const parallel of [1, 4]) {
    const output = path.join(root, `output-${parallel}`);
    fs.mkdirSync(path.join(output, 'graphics'), { recursive: true });
    const resources = structuredClone(inputs);
    const builder = new AssetBuilder(path.resolve('dist'), output, magick);
    await builder.copyAssets(assets, resources, { preserveStructure: false });
    let active = 0, peak = 0;
    const compose = builder.composeTileLayer.bind(builder);
    builder.composeTileLayer = async (...args) => {
      peak = Math.max(peak, ++active);
      try { return await compose(...args); } finally { --active; }
    };
    const derived = await builder.materializeTileLayerEdits(resources, parallel);
    assert.equal(peak, parallel);
    assert.equal(derived.length, 4);
    builds.push({ derived, resources, images: derived.map(resource => fs.readFileSync(path.join(output, 'graphics', resource.filename))) });
    assert(!fs.existsSync(path.join(output, '.tile-palettes')));
    assert(!fs.readdirSync(path.join(output, 'graphics')).some(name => name.includes('.compose-') || name.includes('_base')));
  }
  assert.deepEqual(builds[0], builds[1], 'parallel and sequential builds must have identical images, resources and order');
  console.log('Parallel layers: four concurrent compositions match sequential images and resource order.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
