import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { transcodeProject } from '../../dist/main/utils/projectTranscoder/transcode-project.js';
import { encodeSpriteBmp } from '../../dist/main/utils/builders/spriteCanvasPixels.js';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const argument = name => { const index = process.argv.indexOf(name);return index < 0 ? null : process.argv[index + 1]; };
const root = path.resolve('.');
const actorCapacity = process.argv.includes('--actor-capacity');
const temporary = argument('--reuse') ? path.resolve(argument('--reuse')) : fs.mkdtempSync(path.join(os.tmpdir(), 'gba-scene-performance-'));
assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
assert.ok(path.basename(temporary).startsWith('gba-scene-performance-'));
const project = path.join(temporary, 'project'), output = path.join(temporary, 'output');
const report = path.resolve(argument('--report') ?? 'test-results/scene-performance.json');
const ids = {
  scene: '2f591f1d-270c-40ec-89c0-9f925ab68f23', sprite: '0aa307ad-7329-4599-bc39-8f8c909f6dcb',
  background: '0e061a11-74e7-4848-a95b-fc25f5683cee', settings: '54897b71-abac-4e4b-9cf2-e9ac7d6f420e',
  fade: '91487fda-588f-4276-9629-f1d92f1ea24a', trigger: '0265a5f1-b33c-450d-88a8-aa3d353de808',
};
const actorIds = [
  '1f6579b7-ce2d-455f-a4c6-794973c81c71', 'a6d52c5f-bc31-4080-86a5-3e1bf92d9068', '1a58c41f-2505-47fd-933b-acf97dd715c5', '35bbc69f-7475-4717-8ba9-749d22bf67b0',
  'b128e1dc-0f08-4fef-9897-49b382974cf9', 'cee4b87f-b0da-47c8-9c6d-8a2f244418f3', '506255d5-c2be-448d-92f9-47cfd3a727f8', '362f7ad6-5255-47c4-9e8a-5566c7e1ddf0',
  'd7758d23-d59d-44f7-b5b3-180b88a15a7f', 'ba71e0ce-c670-45d9-aa34-7b788f2835ae', '4cc33d1a-c4f7-48fd-b7b8-8347d650956a', '5974b750-c5c2-4af0-971c-e73ecbf9a0ff',
  '0bb91e75-b654-43af-a69c-82fd48817b66', '6d0cc2e5-d46d-4b8d-b598-7f5ad0f7698a', '07f68db4-224d-477a-8cd1-cb94021bee8c', '76f6b244-8592-47e3-8e4c-81c462c5ddc8',
];
const capacityIds = JSON.parse(fs.readFileSync('tools/verification/fixtures/actor-capacity-ids.json', 'utf8'));
assert.equal(new Set(capacityIds).size, 160);
assert.ok(capacityIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
assert.ok([...Object.values(ids), ...actorIds].every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
assert.equal(new Set([...Object.values(ids), ...actorIds]).size, 22);
try {
  for(const folder of ['project', 'assets/sprites', 'assets/backgrounds']) fs.mkdirSync(path.join(project, folder), { recursive: true });
  fs.writeFileSync(path.join(project, 'benchmark.gbaproj'), JSON.stringify({ name: 'scene_performance' }));
  const image = size => {
    const pixels = new Uint8Array(size * size * 4);
    for(let y = 0; y < size; ++y) for(let x = 0; x < size; ++x) {
      const tile = (x >> 3) + (y >> 3) * (size / 8);
      pixels.set([(tile >> (x % 8)) & 1 ? 220 : 32, 140, 48, 255], (y * size + x) * 4);
    }
    return encodeSpriteBmp(pixels, size, size);
  };
  fs.writeFileSync(path.join(project, 'assets/sprites/hero.bmp'), image(16));
  fs.writeFileSync(path.join(project, 'assets/backgrounds/background.bmp'), image(256));
  const resources = [
    { _resourceType: 'sprite', id: ids.sprite, name: 'hero', filename: 'hero.bmp', imageWidth: 16, imageHeight: 16, playerFrameWidth: 16, playerFrameHeight: 16 },
    { _resourceType: 'background', id: ids.background, name: 'background', filename: 'background.bmp', imageWidth: 256, imageHeight: 256 },
    { _resourceType: 'settings', id: ids.settings, startSceneId: ids.scene, startX: 6, startY: 6, startMoveSpeed: 8, playerSpriteId: ids.sprite, colorMode: 'mono' },
    { _resourceType: 'scene', id: ids.scene, name: 'Scene performance', sceneType: 'Adventure', width: 256, height: 256,
      backgrounds: Array.from({ length: 4 }, (_, layerId) => ({ layerId, backgroundId: ids.background })),
      actors: actorIds.map((id, i) => ({ id, spriteId: ids.sprite, anchor: 'center', x: 16 + i % 8 * 28, y: 32 + Math.floor(i / 8) * 32, animationSpeed: 5 })),
      triggers: [{ id: ids.trigger, x: 300, y: 300, width: 8, height: 8, activation: 'enter', enabled: true, onEnterScript: [] }],
      script: [{ id: ids.fade, version: 1, command: 'EVENT_FADE_IN', args: { speed: 1 } }],
    },
  ];
  if(actorCapacity) {
    const scene = resources.find(value => value._resourceType === 'scene');
    scene.actors = capacityIds.slice(0, 95).map((id, i) => ({ id, spriteId: ids.sprite, anchor: 'center', x: 8 + i % 16 * 14, y: 8 + Math.floor(i / 16) * 18, animationSpeed: 0 }));
    // Keep save support in the projection without executing it during init.
    scene.actors[0].onInteractScript = [{ id: capacityIds[95], version: 1, command: 'EVENT_SAVE_WRITE', args: { slot: 0 } }];
    resources.push({ _resourceType: 'prefabs', id: capacityIds[96], prefabs: [{ id: capacityIds[97], name: 'Capacity pool', type: 'actor', actor: { id: capacityIds[98], spriteId: ids.sprite, animationSpeed: 0 } }] });
    scene.script.push(...capacityIds.slice(99, 131).map((id, i) => ({ id, version: 1, command: 'EVENT_SPAWN_ACTOR', args: { source: 'prefab', prefabId: capacityIds[97], x: 8 + (95 + i) % 16 * 14, y: 8 + Math.floor((95 + i) / 16) * 18 } })));
  }
  for(let i = 0; i < resources.length; ++i) fs.writeFileSync(path.join(project, 'project', `${i}.gbasres`), JSON.stringify(resources[i]));
  const result = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });assert.ok(result.success, result.message);
  if(argument('--baseline-dir')) {
    const baseline = path.resolve(argument('--baseline-dir'));
    // Replace method bodies, retaining the generated resource lookup tables
    // and expanded template tokens from this exact project.
    const filename = path.join(output, 'src/graphics_manager.cpp');
    let generated = fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
    const original = fs.readFileSync(path.join(baseline, 'graphics_manager.cpp'), 'utf8').replaceAll('\r\n', '\n');
    for(const signature of ['void GraphicsManager::set_player_animation(', 'void GraphicsManager::move_player_from_input(',
      'void GraphicsManager::update_sprites(', 'void GraphicsManager::update_default_palettes(', 'void GraphicsManager::update_actor_residency(',
      'void GraphicsManager::update_tile_animations(', 'ScriptTrigger GraphicsManager::get_script_trigger(',
      'bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(\n        const Sprites&']) {
      const start = generated.indexOf(signature), oldStart = original.indexOf(signature);assert.ok(start >= 0 && oldStart >= 0, signature);
      const end = generated.indexOf('\n}\n', start) + 2, oldEnd = original.indexOf('\n}\n', oldStart) + 2;
      generated = generated.slice(0, start) + original.slice(oldStart, oldEnd) + generated.slice(end);
    }
    fs.writeFileSync(filename, generated);
    fs.copyFileSync(path.join(baseline, 'script_trigger_manager.cpp'), path.join(output, 'src/script_trigger_manager.cpp'));
  }
  const header = path.join(output, 'include/graphics_manager.h');
  fs.writeFileSync(header, fs.readFileSync(header, 'utf8').replace('public:', 'public:\n    void verify_scene_performance();'));
  fs.appendFileSync(path.join(output, 'src/graphics_manager.cpp'), '\n' + (argument('--baseline-dir') ? '#define SCENE_PERFORMANCE_BASELINE 1\n' : '') + fs.readFileSync(actorCapacity ? 'tools/verification/fixtures/actor-capacity.cpp' : 'tools/verification/fixtures/scene-performance.cpp', 'utf8'));
  const game = path.join(output, 'src/game.cpp'), gameSource = fs.readFileSync(game, 'utf8');
  assert.ok(gameSource.includes('        update();'));
  fs.writeFileSync(game, gameSource.replace('        update();', '        update();\n        static int performance_frames=0;\n        if(++performance_frames>120) GraphicsManager::instance().verify_scene_performance();'));
  for(const folder of ['src', 'include']) for(const name of fs.readdirSync(path.join(output, folder))) if(/\.(cpp|h)$/.test(name)) fs.utimesSync(path.join(output, folder, name), new Date(), new Date());
  const devkit = process.env.DEVKITPRO;assert.ok(devkit);
  const arm = process.env.DEVKITARM ?? path.join(devkit, 'devkitARM'), env = { ...process.env };
  const pathKey = Object.keys(env).find(name => name.toUpperCase() === 'PATH');
  env[pathKey] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(arm, 'bin'), env[pathKey]].join(path.delimiter);
  env.DEVKITPRO = devkit.replaceAll('\\', '/');env.DEVKITARM = arm.replaceAll('\\', '/');env.BUTANO = path.join(root, 'tools/butano').replaceAll('\\', '/');
  const built = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: output, env, stdio: 'inherit', windowsHide: true });assert.equal(built.status, 0);
  const elf = fs.readdirSync(output).find(name => name.endsWith('.elf'));assert.ok(elf);
  const memory = inspectGbaMemory(path.join(output, elf));console.log(formatGbaMemoryReport(memory));assert.deepEqual(memory.errors, []);
  const rom = path.join(output, path.basename(elf, '.elf') + '.gba');
  const run = spawnSync(process.execPath, ['tools/verification/run-scene-performance-emulator.mjs', rom, report, ...(actorCapacity ? ['--actors'] : argument('--baseline-dir') ? [] : ['--capacity'])], { stdio: 'inherit', windowsHide: true });assert.equal(run.status, 0);
  const measured = JSON.parse(fs.readFileSync(report, 'utf8'));measured.memory = { regions: memory.regions, singletons: memory.singletons };
  if(argument('--compare')) {
    const previous = JSON.parse(fs.readFileSync(argument('--compare'), 'utf8'));
    measured.comparison = {};
    for(const [name, timing] of Object.entries(measured.timings)) {
      assert.equal(timing.checksum, previous.timings[name].checksum, `${name} changed observable benchmark state`);
      const reductionPercent = 100 * (1 - timing.ticks / previous.timings[name].ticks);
      measured.comparison[name] = { before: previous.timings[name].ticks, after: timing.ticks, reductionPercent };
      console.log(`${name}: ${reductionPercent.toFixed(1)}% fewer timer ticks (${previous.timings[name].ticks} -> ${timing.ticks})`);
    }
    for(const name of ['movement', 'sprites', 'palettes']) assert.ok(measured.comparison[name].reductionPercent > 0, `${name} must improve`);
  }
  fs.writeFileSync(report, JSON.stringify(measured, null, 2) + '\n');
  console.log(`Report: ${report}\nBuild: ${output}`);
} finally {
  if(!process.argv.includes('--keep')) fs.rmSync(temporary, { recursive: true, force: true });
}
