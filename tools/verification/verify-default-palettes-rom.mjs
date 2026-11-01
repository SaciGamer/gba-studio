import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const root = path.resolve('.');
const { transcodeProject } = await import(pathToFileURL(path.join(root, 'dist/main/utils/projectTranscoder/transcode-project.js')));
const { encodeSpriteBmp } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/spriteCanvasPixels.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-default-palettes-rom-'));
const projectDir = path.join(temp, 'project'), outputDir = path.join(temp, 'output');
const sceneId = '41b24b9a-d732-4d52-8534-68f574ee0ec4';
const redId = '00b0b048-b387-44d1-bb1c-97b007e85130', blueId = '38dd93a3-13a6-4ae6-bc3d-18c7cbfc8f0a';
const events = [
  { id: '99802423-de88-40ae-8664-c77596ecf9ae', command: 'EVENT_WAIT', args: { units: 'frames', frames: 60 } },
  { id: '819978ac-914c-461e-87af-dfa31ce8c8fa', command: 'EVENT_CHANGE_DEFAULT_PALETTES', args: { paletteIds: [blueId] } },
  { id: '70acc7f6-070a-41b8-9350-a9ed06b18d71', command: 'EVENT_WAIT', args: { units: 'frames', frames: 60 } },
  { id: '7b7c41f3-b0d3-4402-981d-81c195812d9e', command: 'EVENT_CHANGE_DEFAULT_PALETTES', args: { paletteIds: [] } },
].map(event => ({ ...event, version: 1 }));
try {
  fs.mkdirSync(path.join(projectDir, 'project'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'assets/tilesets'), { recursive: true });
  const rgba = new Uint8Array(8 * 8 * 4);
  for (let index = 0; index < rgba.length; index += 4) { rgba[index] = 255; rgba[index + 3] = 255; }
  fs.writeFileSync(path.join(projectDir, 'assets/tilesets/tiles.bmp'), encodeSpriteBmp(rgba, 8, 8));
  const resources = [
    { _resourceType: 'settings', id: '62bf8559-9652-4c83-9369-6bb00459a4e2', startSceneId: sceneId, colorPaletteIds: [redId, redId, blueId] },
    { _resourceType: 'palette', id: redId, colors: ['#000000', ...Array(15).fill('#ff0000')] },
    { _resourceType: 'palette', id: blueId, colors: ['#000000', ...Array(15).fill('#0000ff')] },
    { _resourceType: 'scene', id: sceneId, name: 'Slot propagation', sceneType: 'Top Down', width: 256, height: 256, gridSize: 8,
      backgrounds: [0, 1].map(layerId => ({ layerId, x: 0, y: layerId * 16, selectedTilesetId: 'tiles', tileMap: [[0, 0]], tilePaletteIds: [['__slot__:0', '__slot__:1']] })), script: events },
  ];
  resources.forEach((resource, index) => fs.writeFileSync(path.join(projectDir, 'project', `${index}.gbasres`), JSON.stringify(resource)));
  const result = await transcodeProject({ projectDir, outputDir, projectName: 'default_palettes', runtimeMode: 'full' });
  assert.ok(result.success, result.message);
  const file = path.join(outputDir, 'src/graphics_manager.cpp');
  let source = fs.readFileSync(file, 'utf8');
  const marker = '    for(int layer = 0; layer < 4; ++layer) if(layer_palette_overrides[layer]) change_palette_layer(layer, layer_palette_overrides[layer], false);';
  assert.ok(source.includes(marker));
  source = source.replace(marker, `${marker}
    static int test_step = 0;
    int checked = 0;
    for(int layer = 0; layer < 2; ++layer) {
        const auto palette = get_layer_palette(layer);
        BN_ASSERT(palette, "Slot test background must be loaded");
        const auto* background = get_background_by_id(current_bgs_id[layer]);
        const auto item = get_bg_item_from_name(background->name);
        const auto originals = item->palette_item().colors_ref();
        for(int color = 0; color < originals.size(); ++color) {
            const int binding = get_slot_palette_binding(background->name, originals[color].data());
            if(binding < 0) continue;
            const int expected = binding / 16 == 0 && test_step == 0 ? 31744 : 31;
            BN_ASSERT(palette->colors()[color].data() == expected, "Shared slot propagation failed");
            ++checked;
        }
    }
    BN_ASSERT(checked == 4, "Both backgrounds must preserve both slot identities");
    BN_LOG("[SCENARIO_PALETTES]", test_step++);`);
  fs.writeFileSync(file, source);
  const devkit = process.env.DEVKITPRO;
  assert.ok(devkit, 'DEVKITPRO is required');
  const env = { ...process.env, DEVKITPRO: devkit.replaceAll('\\', '/'), DEVKITARM: (process.env.DEVKITARM || path.join(devkit, 'devkitARM')).replaceAll('\\', '/'), BUTANO: path.join(root, 'tools/butano').replaceAll('\\', '/') };
  const key = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  env[key] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(devkit, 'devkitARM/bin'), env[key]].join(path.delimiter);
  const compile = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: outputDir, env, stdio: 'inherit', windowsHide: true });
  assert.equal(compile.status, 0, 'Slot ROM compilation failed');
  const elf = path.join(outputDir, 'default_palettes.elf');
  const memory = inspectGbaMemory(elf);
  console.log(formatGbaMemoryReport(memory));
  assert.deepEqual(memory.errors, []);
  if (process.argv.includes('--emulate')) {
    const run = spawnSync(process.execPath, ['tests/runtime-monitor-emulator.mjs', path.join(outputDir, 'default_palettes.gba'), '--default-palettes'], { cwd: root, stdio: 'inherit', windowsHide: true });
    assert.equal(run.status, 0, 'Slot ROM emulation failed');
  }
  console.log(`Default palette ROM passed: ${elf}`);
} finally {
  if (process.argv.includes('--keep')) console.log(temp);
  else { assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-default-palettes-rom-')); fs.rmSync(temp, { recursive: true, force: true }); }
}
