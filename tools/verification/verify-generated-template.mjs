import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const menuPositionEventIds = [
  '7505ed57-c18f-4abd-a56f-b684bddb4329',
  'e85af7ce-0f88-4f42-9468-89993486b129',
  '4fff0d90-da35-40f2-9d64-9dc44a25695e',
];
assert.equal(new Set(menuPositionEventIds).size, menuPositionEventIds.length);
assert.ok(menuPositionEventIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)));

const root = path.resolve(import.meta.dirname, '../..');
const sampleRoot = fs.existsSync(path.join(root, 'templateEngineGame', 'sample_project_example'))
  ? path.join(root, 'templateEngineGame', 'sample_project_example')
  : path.join(root, 'sample_project_example');
const dist = path.join(root, 'dist', 'main', 'utils', 'builders');
const { default: TemplateBuilder } = await import(pathToFileURL(path.join(dist, 'TemplateBuilder.js')).href);
const { default: ResourceBuilder } = await import(pathToFileURL(path.join(dist, 'ResourceBuilder.js')).href);
const { default: CppBuilder } = await import(pathToFileURL(path.join(dist, 'CppBuilder.js')).href);
const { toRuntimeResource } = await import(pathToFileURL(path.join(dist, '..', 'types', 'RuntimeResources.js')).href);

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-generated-event-'));
const templateDir = path.join(root, 'tools', 'butano', 'template');
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-fixture-'));
try {
const config = { projectName: 'event_smoke', authorName: 'GBA Studio', version: '1.0.0', useThreads: false, useAudio: true, useGraphics: true };

const templateBuilder = new TemplateBuilder({ templateDir, buildDir: outputDir, romTitle: 'EVENT SMOKE', romCode: 'EVSM' });
await templateBuilder.initializeBuildDirectory({ projectDir, projectName: config.projectName, targetDir: outputDir, romTitle: 'EVENT SMOKE', romCode: 'EVSM' });
fs.copyFileSync(path.join(sampleRoot, 'assets', 'musics', 'cyberrid.mod'), path.join(outputDir, 'audio', 'cyberrid.mod'));

const sfxGeneratorBundle = path.join(projectDir, 'sfxGenerator.mjs');
await build({ entryPoints: [path.join(root, 'src', 'renderer', 'frontend', 'src', 'utils', 'sfxGenerator.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sfxGeneratorBundle });
const { generateSfx, encodePcm16Wav, defaultSfxParameters } = await import(pathToFileURL(sfxGeneratorBundle).href);
const editorSfx = generateSfx({ ...defaultSfxParameters, waveform: 'square', frequency: 880, durationMs: 600, fadeOutMs: 120, seed: 7 });
const editorSfxPath = path.join(outputDir, 'audio', 'editor_generated_sfx.wav');
fs.writeFileSync(editorSfxPath, Buffer.from(encodePcm16Wav(editorSfx.pcm, editorSfx.parameters.sampleRate)));

const resourceBuilder = new ResourceBuilder(outputDir, templateDir);
const emitResource = source => resourceBuilder.processRuntimeResource(toRuntimeResource(source));
const triggerScript = [{ id: 'branch', command: 'EVENT_IF', args: {
  left: { kind: 'literal', type: 'boolean', value: true }, operator: '==',
  right: { kind: 'literal', type: 'boolean', value: true },
}, children: { then: [
  { id: 'trigger-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 2 } },
  { id: 'trigger-value', command: 'EVENT_VARIABLE', args: { variableId: 'trigger_value', value: { kind: 'literal', type: 'number', value: 7 } } },
  ...(process.argv.includes('--sfx-audio') ? [
    { id: 'trigger-sfx-delay', command: 'EVENT_WAIT', args: { units: 'frames', frames: 60 } },
    { id: 'editor-generated-sfx', version: 1, command: 'EVENT_PLAY_SOUND', args: { soundId: 'editor_generated_sfx', soundSource: 'asset', volume: 100, speed: 100, panning: 0, priority: 0, group: 'test' } },
  ] : []),
], else: [] } }];
const resources = [
  emitResource({ _resourceType: 'scripts', id: 'scripts', scripts: [{ id: 'physics-example', events: [
    { id: '40279041-c1d6-4a87-8c87-6aa11431c2b9', version: 1, command: 'EVENT_PHYSICS_SET_GRAVITY', args: { actorId: '__PLAYER__', gravity: 0.5 } },
    { id: '181f7e94-7d4e-4971-b098-6d0ebdde5ed1', version: 1, command: 'EVENT_PHYSICS_SET_JUMP_SPEED', args: { actorId: '__PLAYER__', jumpSpeed: 7 } },
    { id: '428206f9-8dab-4c8e-9dda-181877338b25', version: 1, command: 'EVENT_PHYSICS_SET_MAX_FALL_SPEED', args: { actorId: '__PLAYER__', maxFallSpeed: 8 } },
    { id: '0a28f091-6f9e-4700-873f-908a74bbff9d', version: 1, command: 'EVENT_PHYSICS_SET_AIR_JUMPS', args: { actorId: '__PLAYER__', airJumps: 1 } },
    { id: 'e360b258-d12f-4f74-864a-1444e6917bc9', version: 1, command: 'EVENT_PHYSICS_SET_DIAGONAL', args: { actorId: '__PLAYER__', allowDiagonal: false } },
    { id: '9a1bf8c1-0e2b-44f2-a99c-11e28ce8622e', version: 1, command: 'EVENT_PHYSICS_RESET', args: { actorId: '__PLAYER__' } },
    { id: 'physics-config', command: 'EVENT_CONFIGURE_MOVEMENT', args: { gravity: 0.125, jumpSpeed: 6, maxFallSpeed: 8, airJumps: 1 } },
    { id: 'physics-impulse', command: 'EVENT_APPLY_VERTICAL_IMPULSE', args: { impulse: -4, mode: 'add' } },
    { id: 'physics-reset', command: 'EVENT_CONFIGURE_MOVEMENT', args: { reset: true } },
    { id: 'physics-stop', command: 'EVENT_STOP_PHYSICS', args: { actorId: '__PLAYER__' } },
    { id: 'button-default', command: 'EVENT_RUN_BUTTON_ACTION', args: { button: 'B', mode: 'default' } },
    { id: 'button-custom', command: 'EVENT_RUN_BUTTON_ACTION', args: { button: 'A', mode: 'custom' } },
  ] }, { id: 'parameter-example', parameters: [
    { id: '__PARAM__:A', name: 'Parameter A', alias: 'entry', type: 'number', mode: 'local' },
    { id: '__PARAM__:B', name: 'Parameter B', alias: 'output', type: 'number', mode: 'reference' },
    ...Array.from({ length: 18 }, (_, index) => ({ id: `__PARAM__:${String.fromCharCode(67 + index)}`, name: `Parameter ${String.fromCharCode(67 + index)}`, type: 'number', mode: 'local' })),
  ], events: [
    { id: 'parameter-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } },
    { id: 'parameter-write', command: 'EVENT_VARIABLE', args: { variableId: '__PARAM__:B', value: { kind: 'expression', operation: 'add', left: { kind: 'variable', variableId: '__PARAM__:A' }, right: { kind: 'number', value: 1 } } } },
    { id: 'parameter-copy', command: 'EVENT_VARIABLE', args: { variableId: '__PARAM__:A', value: { kind: 'number', value: 0 } } },
  ] }] }),
  emitResource({ _resourceType: 'settings', id: 'settings', startSceneId: 'scene', startX: 0, startY: 0, startMoveSpeed: 1, startAnimSpeed: 1, startDirection: 'down', colorMode: 'mono', fadeDirection: 1, inputMapsBySceneType: { Platformer: { jump: ['A'], confirm: ['B'] }, 'Top Down': { confirm: ['L'] } }, shooterConfig: { defaultWaveId: 'wave_01', projectileSpriteId: 'player', playerHitPoints: 3, defaultDamage: 1 } }),
  emitResource({ _resourceType: 'variables', id: 'variables', variables:
    ['loop', 'choice', 'trigger_value'].map(id => ({ id, symbol: `VAR_${id.toUpperCase()}`, type: 'number', initialValue: 0 })),
  }),
  emitResource({ _resourceType: 'scene', id: 'scene', name: 'scene', sceneType: 'POINTNCLICK', backgrounds: [], script: process.argv.includes('--sfx-audio') ? [] : [
    { id: '87d650f4-2177-414f-8a4a-e58e28d7e70d', command: 'EVENT_ACTOR_SET_DIRECTION', args: { actorId: '__PLAYER__', direction: 'left' } },
    { id: '6428af9d-89ae-4a80-94be-07535fb97e67', command: 'EVENT_ACTOR_SET_ROTATION', args: { actorId: '__PLAYER__', angle: -45, durationFrames: 30 } },
    { id: '8b4d5d59-3b2c-412d-822b-b90044328bfa', command: 'EVENT_ACTOR_SET_SCALE', args: { actorId: '__PLAYER__', scale: 200, durationFrames: 60 } },
    { id: '632c69c9-8680-4a8c-9f1b-0242af7f3bb2', command: 'EVENT_ACTOR_SET_TINT', args: { actorId: '__PLAYER__', color: '#000000', value: 50, durationFrames: 90 } },
    { id: '3ada5b53-742d-45da-9387-d335a4e940d8', command: 'EVENT_TRIGGER_SET_ENABLED', args: { triggerId: 'region', enabled: false } },
    { id: 'b0f84e75-8666-48d1-8454-b2310e144a81', command: 'EVENT_TRIGGER_SET_ENABLED', args: { triggerId: 'region', enabled: true } },
    { id: '395e13c3-e213-4d06-b5f5-85bd37d1dc4c', command: 'EVENT_IF_ACTOR_FACING', args: { actorId: '__PLAYER__', targetActorId: '__PLAYER__' }, children: { then: [], else: [] } },
    ...(process.argv.includes('--menu-emulator') ? [
      { id: 'menu-music', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'cyberrid', volume: 50 } },
      { id: 'menu-grid', command: 'EVENT_MENU_OPEN', args: { showTitle: false, columns: 4, optionOrder: 'rows', options: Array.from({ length: 32 }, (_, index) => `A${String(index).padStart(2, '0')}`), resultVariable: 'choice', showFrame: false, animate: false } },
      { id: 'menu-columns', command: 'EVENT_MENU_OPEN', args: { prompt: 'A'.repeat(56), columns: 2, optionOrder: 'columns', options: Array.from({ length: 32 }, (_, index) => `Option ${index}`), resultVariable: 'choice', showFrame: false, animate: true } },
      { id: 'menu-binary', command: 'EVENT_DIALOGUE_CHOICE', args: { prompt: 'A'.repeat(56), optionA: 'Yes', optionB: 'No', resultVariable: 'choice', showFrame: false, animate: false, allowCancel: false } },
      { id: 'menu-cancel', command: 'EVENT_MENU_OPEN', args: { showTitle: false, columns: 3, options: Array.from({ length: 12 }, (_, index) => `B${index}`), resultVariable: 'choice', showFrame: false, animate: false } },
      { id: menuPositionEventIds[0], command: 'EVENT_MENU_OPEN', args: { position: 'full-screen', showTitle: false, columns: 4, options: Array.from({ length: 32 }, (_, index) => `F${index}`), initialSelection: 31, resultVariable: 'choice', showFrame: true, animate: false } },
      { id: menuPositionEventIds[1], command: 'EVENT_MENU_OPEN', args: { position: 'left', columns: 2, optionOrder: 'columns', prompt: 'Left menu title 1234567890', options: Array.from({ length: 12 }, (_, index) => `L${String(index).padStart(2, '0')}`), initialSelection: 7, resultVariable: 'choice', showFrame: true, animate: false } },
      { id: menuPositionEventIds[2], command: 'EVENT_MENU_OPEN', args: { position: 'right', showTitle: false, options: ['R'], initialSelection: 0, resultVariable: 'choice', animate: false } },
    ] : []),
    { id: 'parameter-call', command: 'EVENT_CALL_SCRIPT', args: { scriptId: 'parameter-example', arguments: [
      { parameterId: '__PARAM__:A', value: { kind: 'number', value: 12 } },
      { parameterId: '__PARAM__:B', value: { kind: 'variable', variableId: 'trigger_value' } },
      ...Array.from({ length: 18 }, (_, index) => ({ parameterId: `__PARAM__:${String.fromCharCode(67 + index)}`, value: { kind: 'number', value: index } })),
    ] } },
    { id: 'parameter-return', command: 'EVENT_VARIABLE', args: { variableId: 'trigger_value', value: { kind: 'expression', operation: 'add', left: { kind: 'variable', variableId: 'trigger_value' }, right: { kind: 'number', value: 2 } } } },
    { id: 'loop', command: 'EVENT_FOR', version: 1, args: { variableId: 'loop', start: 0, end: 1, step: 1 }, children: { then: [
      { id: 'loop-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } },
      { id: 'loop-continue', command: 'EVENT_CONTINUE', args: {} },
    ] } },
    { id: 'music', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'cyberrid', volume: 50 } },
    { id: 'generated-sfx', version: 1, command: 'EVENT_PLAY_SOUND', args: { soundId: 'generated', soundSource: 'generated', effect: 'coin', pitch: 76, durationFrames: 15, volume: 90, speed: 100, panning: 0, priority: 0, group: 'test' } },
    { id: 'editor-generated-sfx', version: 1, command: 'EVENT_PLAY_SOUND', args: { soundId: 'editor_generated_sfx', soundSource: 'asset', volume: 100, speed: 100, panning: 0, priority: 0, group: 'test' } },
    { id: 'shooter-start', command: 'EVENT_SHOOTER_START', args: { waveId: 'wave_01' } },
    { id: 'shooter-pause', command: 'EVENT_SHOOTER_PAUSE', args: { paused: true } },
    { id: 'shooter-resume', command: 'EVENT_SHOOTER_PAUSE', args: { paused: false } },
    { id: 'shooter-stop', command: 'EVENT_SHOOTER_STOP', args: {} },
    { id: 'ui-title', command: 'EVENT_UI_SET_TEXT', args: { text: 'UI lifecycle', x: 16, y: 16, font: 'fixed8x16' } },
    { id: 'ui-move', command: 'EVENT_UI_ANIMATE', args: { uiId: 'ui-title', animation: 'move', x: 100, y: 32, speed: 1 } },
    { id: 'ui-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-hide', command: 'EVENT_UI_HIDE', args: { uiId: 'ui-title' } },
    { id: 'ui-hidden-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-show', command: 'EVENT_UI_SHOW', args: { uiId: 'ui-title' } },
    { id: 'ui-visible-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-destroy', command: 'EVENT_UI_DESTROY', args: { uiId: 'ui-title' } },
    { id: 'choice', command: 'EVENT_DIALOGUE_CHOICE', args: { prompt: 'Continue?', optionA: 'Yes', optionB: 'No', resultVariable: 'choice' } },
    { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1, handle: 1 } },
    { id: 'break', command: 'EVENT_BREAK', args: {} },
  ], triggers: [{ id: 'region', x: 0, y: 0, width: 16, height: 16, activation: 'enter', once: true,
    onEnterScript: triggerScript, onLeaveScript: triggerScript,
  }] }),
];
const generatedSounds = resourceBuilder.prepareGeneratedEventSounds(resources, path.join(outputDir, 'audio'));
assert.equal(generatedSounds, process.argv.includes('--sfx-audio') ? 0 : 1, 'Generated Play Sound events must materialize their WAV only when that event is part of the test scene');
await resourceBuilder.writeResourceHeader(resources);
await resourceBuilder.generateResourceRegistryClass(resources, config);
const generatedRegistry = fs.readFileSync(path.join(outputDir, 'include', 'audio_registry.h'), 'utf8');
if (!process.argv.includes('--sfx-audio')) assert.match(generatedRegistry, /gba_event_sfx_[a-f0-9]{16}/, 'Generated WAV must be registered as a Maxmod sound item');
assert.match(generatedRegistry, /bn::sound_items::editor_generated_sfx/, 'The WAV generated by the editor must be selectable by EVENT_PLAY_SOUND');
fs.mkdirSync(path.join(outputDir, 'build'), { recursive: true });
await resourceBuilder.writeGraphicsHeader(path.join(outputDir, 'build'));
await new CppBuilder(outputDir, templateDir, []).generateProjectStructure(config);
if (process.argv.includes('--parameter-emulator')) {
  const file = path.join(outputDir, 'src', 'config_variables.cpp');
  const source = fs.readFileSync(file, 'utf8');
  const marker = 'BN_LOG("[EVENT_VARIABLE] set: ", variable->variable_id);';
  assert.ok(source.includes(marker));
  fs.writeFileSync(file, source.replace(marker, 'BN_LOG("[SCRIPT_INPUT_TEST]", variable->variable_id, ":", VariableManager::instance().get_number(variable->variable_id));'));
}
if (process.argv.includes('--menu-emulator')) {
  const file = path.join(outputDir, 'src', 'dialogue_manager.cpp');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace('++choice_options_revealed;', '++choice_options_revealed; BN_LOG("[MENU_OPTION_REVEALED]", choice_options_revealed);');
  const start = source.indexOf('bool DialogueManager::show_choice(');
  assert.ok(start >= 0);
  fs.writeFileSync(file, source.slice(0, start) + source.slice(start).replace('choice_acknowledged = false;', 'BN_LOG("[MENU_RESULT]", choice_cancelled ? -1 : choice_index); choice_acknowledged = false;').replace('choice_visible = true;', 'choice_visible = true; BN_LOG("[MENU_READY]", choice_options_count);'));
}
if (process.argv.includes('--sprite-pressure')) {
  assert.ok(process.argv.includes('--menu-emulator'), '--sprite-pressure requires --menu-emulator');
  const file = path.join(outputDir, 'src', 'dialogue_manager.cpp');
  let source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  source = source.replace('#include "bn_log.h"', '#include "bn_log.h"\n#include "bn_sprites.h"');
  source = source.replace('BN_DATA_EWRAM DialogueManager dialogue_manager_instance;', `BN_DATA_EWRAM DialogueManager dialogue_manager_instance;
    BN_DATA_EWRAM bn::vector<bn::sprite_ptr, 128> pressure_sprites;
    int pressure_ticks = 0;
    int pressure_last_index = -1;
    const char* pressure_last_prompt = nullptr;`);
  source = source.replace('    choice_data = data;', `    if(pressure_sprites.empty()) {
        for(int index = 0; index < 128; ++index) {
            auto sprite = common::fixed_8x16_sprite_font.item().create_sprite_optional(0, 0, 0);
            BN_ASSERT(sprite.has_value(), "Sprite pressure setup must fill OAM");
            pressure_sprites.push_back(*sprite);
        }
        BN_LOG("[MENU_PRESSURE_READY]");
    }
    choice_data = data;`);
  source = source.replace('    if(choice_visible && choice_render_cached', `    if(pressure_sprites.size() > 96 && ++pressure_ticks >= 120) {\n        while(pressure_sprites.size() > 96) pressure_sprites.pop_back();\n        BN_LOG("[MENU_PRESSURE_RELEASED]");\n    }\n    if(choice_visible && choice_options_visible && choice_render_cached`);
  source = source.replace('        choice_render_ready = text_generated;', `        choice_render_ready = text_generated;
        if(choice_render_ready && (choice_index != pressure_last_index || choice_data.prompt != pressure_last_prompt)) {
            pressure_last_index = choice_index;
            pressure_last_prompt = choice_data.prompt;
            BN_LOG("[MENU_SPRITES]", bn::sprites::used_items_count(), ",", rendered_sprites.size());
        }`);
  fs.writeFileSync(file, source);
}
console.log(outputDir);

// Optional integration gate: compile the generated project with the installed
// devkitPro, keeping all outputs in this fixture's unique temporary directory.
if (process.argv.includes('--build')) {
  const devkit = process.env.DEVKITPRO;
  assert.ok(devkit, 'DEVKITPRO must point to the installed toolchain');
  const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
  const windows = process.platform === 'win32';
  const make = windows ? path.join(devkit, 'msys2', 'usr', 'bin', 'make.exe') : 'make';
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = [path.join(devkit, 'msys2', 'usr', 'bin'), path.join(devkit, 'tools', 'bin'), path.join(arm, 'bin'), env[pathKey] || ''].join(path.delimiter);
  const slash = value => value.replaceAll('\\', '/');
  env.DEVKITPRO = slash(devkit);
  env.DEVKITARM = slash(arm);
  env.BUTANO = slash(path.join(root, 'tools', 'butano'));
  const result = spawnSync(make, ['-j2'], { cwd: outputDir, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Generated-template ROM build failed in ${outputDir}`);
  const rom = path.join(outputDir, `${config.projectName}.gba`);
  assert.ok(fs.statSync(rom).size > 192, 'ROM must contain more than the GBA header');
  assert.ok(fs.existsSync(path.join(outputDir, 'build', 'bn_sound_items.h')), 'Maxmod must generate the event sound item');
  assert.match(fs.readFileSync(path.join(outputDir, 'build', 'bn_sound_items.h'), 'utf8'), /editor_generated_sfx/, 'The editor-generated WAV must be present in the ROM soundbank');
  const memory = inspectGbaMemory(path.join(outputDir, `${config.projectName}.elf`));
  console.log(formatGbaMemoryReport(memory));
  assert.equal(memory.errors.length, 0, 'Generated ROM memory layout failed verification');
  console.log(`ROM build passed: ${rom}`);
  if (process.argv.includes('--emulate')) {
    const emulatorArgs = [path.join(root, 'tests', 'runtime-monitor-emulator.mjs'), rom];
    if (process.argv.includes('--sfx-audio')) emulatorArgs.push('--sfx-audio');
    const emulator = spawnSync(process.execPath, emulatorArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
    if (emulator.error) throw emulator.error;
    assert.equal(emulator.status, 0, 'Generated SFX WAV must produce audio in the EmulatorJS GBA runtime');
  }
}
} finally {
  if (!process.argv.includes('--keep')) {
    for (const [directory, prefix] of [[outputDir, 'gba-studio-generated-event-'], [projectDir, 'gba-studio-fixture-']]) {
      const resolved = path.resolve(directory);
      assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith(prefix), 'Unexpected temporary verification directory');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
