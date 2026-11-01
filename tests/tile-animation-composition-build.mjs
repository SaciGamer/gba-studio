import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const { transcodeProject } = await import(pathToFileURL(path.join(root, 'dist/main/utils/projectTranscoder/transcode-project.js')));
const { encodeSpriteBmp } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/spriteCanvasPixels.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-animation-composition-'));
const project = path.join(temp, 'project'), output = path.join(temp, 'output');
const image = (width, height, tiles) => {
  const pixels = new Uint8Array(width * height * 4);
  for (const [index, color] of tiles) {
    const x = (index % (width / 8)) * 8, y = Math.floor(index / (width / 8)) * 8;
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) pixels.set([...color, 255], ((y + dy) * width + x + dx) * 4);
  }
  return encodeSpriteBmp(pixels, width, height);
};
const read = filename => fs.readFileSync(path.join(output, filename), 'utf8');
const mapValues = graphic => {
  const code = read(`build/${graphic}_bn_gfx.s`);
  const match = code.match(new RegExp(`${graphic}_bn_gfxMap:\\r?\\n((?:(?:[\\t ]*\\.hword[^\\r\\n]*|[\\t ]*)\\r?\\n)+)`));
  assert.ok(match);
  return [...match[1].matchAll(/0x[0-9a-f]+|\b\d+\b/gi)].map(value => Number(value[0]));
};
try {
  for (const dir of ['project', 'assets/tilesets', 'assets/auto-tiles', 'assets/backgrounds']) fs.mkdirSync(path.join(project, dir), { recursive: true });
  fs.writeFileSync(path.join(project, 'assets/tilesets/props.bmp'), image(128, 128, [[110, [255, 0, 0]]]));
  fs.writeFileSync(path.join(project, 'assets/tilesets/other.bmp'), image(128, 128, [[130, [0, 255, 0]]]));
  fs.writeFileSync(path.join(project, 'assets/auto-tiles/auto.bmp'), image(128, 128, [[0, [255, 0, 0]]]));
  fs.writeFileSync(path.join(project, 'assets/backgrounds/bg.bmp'), image(128, 128, [[20, [255, 0, 0]], [21, [255, 0, 0]], [23, [0, 255, 0]]]));
  const documents = {
    'settings.gbasres': { _resourceType: 'settings', startSceneId: 'painted', colorMode: 'mono', startX: 0, startY: 0, startDirection: 'down', fadeDirection: 1 },
    'painted.gbasres': { _resourceType: 'scene', id: 'painted', name: 'Painted', width: 240, height: 160, gridSize: 8, sceneType: 'Top Down', script: [{ id: 'fade', command: 'EVENT_FADE_IN', args: { speed: 1 } }],
      backgrounds: [{ layerId: 2, selectedTilesetId: 'props', tileMap: [[110, 0, 110]], tileMapTilesetIds: [['props', 'auto-tile:auto', 'props']] }],
      tileAnimations: [{ id: 'pumpkin', name: 'Pumpkin', layerId: 2, targetTilesetId: 'props', targetTileIndex: 110, frameTileIndices: [110, 130], frameTilesetIds: ['props', 'other'], durationFrames: 2, loop: true, initialFrame: 0 }] },
    'background.gbasres': { _resourceType: 'background', id: 'background', name: 'Background', filename: 'bg.bmp', imageWidth: 128, imageHeight: 128 },
    'standard.gbasres': { _resourceType: 'scene', id: 'standard', name: 'Standard', width: 256, height: 256, sceneType: 'Logo', backgrounds: [{ layerId: 0, backgroundId: 'background' }],
      tileAnimations: [{ layerId: 0, targetTilesetId: 'background', targetTileIndex: 20, frameTileIndices: [20, 23], frameTilesetIds: ['background', 'background'], durationFrames: 2, loop: true, initialFrame: 0 }] },
  };
  for (const [name, value] of Object.entries(documents)) fs.writeFileSync(path.join(project, 'project', name), JSON.stringify(value));
  const before = readProject();
  const result = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });
  assert.equal(result.success, true, result.message);
  const painted = read('include/scene_painted_res.h');
  const target = Number(painted.match(/TileAnimation SCENE_PAINTED_TILE_ANIMATION_0 = \{ 2, (\d+),/)[1]);
  const frames = painted.match(/SCENE_PAINTED_TILE_ANIMATION_0_FRAMES\[\] = \{ ([^}]+) \}/)[1].split(',').map(Number);
  assert.notEqual(target, 110, 'Source indices must be translated to generated tiles');
  assert.notEqual(frames[0], frames[1], 'A replacement frame absent from the painted map must survive conversion');
  const cells = mapValues('animated_painted_layer_2');
  assert.equal(cells[0] & 1023, target);
  assert.equal(cells[2] & 1023, target, 'All occurrences of the selected source tile animate');
  assert.notEqual(cells[1] & 1023, target, 'Identical autotile pixels must remain isolated');
  const standardCells = mapValues('animated_standard_layer_0');
  assert.notEqual(standardCells[36] & 1023, standardCells[37] & 1023, 'Standard-background source positions must survive padding from 128 to 256 pixels');
  const firstSource = mapValues('animated_painted_layer_2');
  const rerun = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });
  assert.equal(rerun.success, true, rerun.message);
  assert.deepEqual(mapValues('animated_painted_layer_2'), firstSource, 'Incremental builds must not append destinations twice');
  assert.deepEqual(readProject(), before, 'Build remapping must not change editable scene indices');
  if (process.argv.includes('--build')) {
    const devkit = process.env.DEVKITPRO, arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
    const env = { ...process.env, DEVKITPRO: devkit.replaceAll('\\', '/'), DEVKITARM: arm.replaceAll('\\', '/') };
    const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
    env[pathKey] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(arm, 'bin'), env[pathKey]].join(path.delimiter);
    const make = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: output, env, windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    fs.writeFileSync(path.join(output, 'tile-animation-build.log'), make.stdout + make.stderr);
    assert.equal(make.status, 0, `ROM build failed: ${make.stderr}\n${make.stdout.slice(-4000)}`);
    const { inspectGbaMemory, formatGbaMemoryReport } = await import('../tools/verification/verify-gba-memory.mjs');
    const memory = inspectGbaMemory(path.join(output, 'project.elf'));
    console.log(formatGbaMemoryReport(memory));
    assert.deepEqual(memory.errors, []);
    console.log('Tile animation ROM built:', path.join(output, 'project.gba'));
    if (process.argv.includes('--emulate')) {
      const run = spawnSync(process.execPath, ['tests/runtime-monitor-emulator.mjs', path.join(output, 'project.gba'), '--tile-composition'], { cwd: root, windowsHide: true, stdio: 'inherit' });
      assert.equal(run.status, 0, 'The composed animation must alternate frames in the real GBA framebuffer');
    }
  }
  console.log('Tile animation composition passed: source 110, cross-tileset replacement frames, standard backgrounds, autotile isolation and repeated build.');
  function readProject() { return Object.keys(documents).map(name => fs.readFileSync(path.join(project, 'project', name), 'utf8')); }
} finally {
  if (process.env.KEEP_TILE_ANIMATION_BUILD) console.log('Kept tile animation build:', temp);
  else {
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-animation-composition-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
