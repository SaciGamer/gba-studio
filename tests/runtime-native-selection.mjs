import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inspectGbaMemory, formatGbaMemoryReport } from '../tools/verification/verify-gba-memory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'tools/butano/template');
const dist = path.join(root, 'dist/main/utils');
const { TemplateBuilder } = await import(pathToFileURL(path.join(dist, 'builders/TemplateBuilder.js')));
const { ResourceBuilder } = await import(pathToFileURL(path.join(dist, 'builders/ResourceBuilder.js')));
const { CppBuilder } = await import(pathToFileURL(path.join(dist, 'builders/CppBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.join(dist, 'types/RuntimeResources.js')));
const { createRuntimeFeatureManifest, selectNativeRuntime } = await import(pathToFileURL(path.join(dist, 'builders/RuntimeFeatureManifest.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-native-selection-'));
const output = path.join(temp, 'output');
const project = path.join(temp, 'project');
const config = { projectName: 'native_selection', useGraphics: true, useAudio: true };
const optionalEvents = [
  { id: 'rumble', command: 'EVENT_RUMBLE', args: { durationFrames: 2, intensity: 50 } },
  { id: 'save', command: 'EVENT_SAVE_WRITE', args: { slot: 0, variableId: 'value' } },
  { id: 'hbe', command: 'EVENT_HBE_EFFECT_ENABLE', args: { preset: 'green_swap', intensity: 1 } },
  { id: 'hbe-stop', command: 'EVENT_HBE_EFFECT_DISABLE', args: {} },
  { id: 'motion', command: 'EVENT_ACTOR_MOVE_TO', args: { actorId: '__PLAYER__', x: 16, y: 16, animated: true } },
  { id: 'audio', command: 'EVENT_STOP_MUSIC', args: {} },
  { id: 'text', command: 'EVENT_UI_SET_TEXT', args: { text: 'Selection', x: 8, y: 8, font: 'fixed8x8' } },
  { id: 'shooter', command: 'EVENT_SHOOTER_START', args: { waveId: '' } },
  { id: 'signal', command: 'EVENT_SHOOTER_WAIT_SIGNAL', args: { signal: 'wave_cleared', timeoutFrames: 1 } },
  { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } },
  { id: 'input', command: 'EVENT_WAIT_INPUT', args: { action: 'interact', timeoutFrames: 1 } },
  { id: 'layer', command: 'EVENT_VISIBLE_BACKGROUND', args: { layerId: 0, visible: true } },
  { id: 'scene', command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'scene', x: 0, y: 0, direction: 'down', fadeSpeed: 1 } },
  { id: 'numeric', command: 'EVENT_PAN_CAMERA', args: { x: { kind: 'variable', variableId: 'value' }, y: 0 } },
  { id: 'effect', command: 'EVENT_SPRITE_EFFECT', args: { actorId: '__PLAYER__', rotation: 30, scale: 100, durationFrames: 3 } },
];
const symbols = /(?:RumbleManager|SaveManager|HbeManager|ActorManager|ActorMotionManager|AudioManager|DialogueManager|ShooterKit|CombatManager|SpawnerTimelineManager|ScriptTriggerManager|RumbleEventHandler|SaveEventHandler|HbeEventHandler|AudioEventHandler|DialogueEventHandler|UiEventHandler|ShooterEventHandler|WaitSignalEventHandler|WaitEventHandler|WaitInputEventHandler|ChangeSceneEventHandler|ChangeLayerEventHandler|run_change_scene|run_change_layer|run_visible_background|numeric_runtime_hooks|numeric_frame_count|numeric_random_state)/;
const metrics = [];
try {
  fs.mkdirSync(project);
  const builder = new TemplateBuilder({ templateDir: template, buildDir: output, romTitle: 'SELECTION', romCode: 'SELC' });
  await builder.initializeBuildDirectory({ projectDir: project, projectName: config.projectName, targetDir: output, romTitle: 'SELECTION', romCode: 'SELC' }, { deferNativeFiles: true });
  assert.deepEqual(fs.readdirSync(path.join(output, 'src')), [], 'Native sources must wait for analysis');
  assert.deepEqual(fs.readdirSync(path.join(output, 'include')), [], 'Native headers must wait for analysis');
  const resourceBuilder = new ResourceBuilder(output, template);
  const emit = async (events, mode = 'selective') => {
    const resources = [
      toRuntimeResource({ _resourceType: 'settings', startSceneId: 'scene', startX: 0, startY: 0, startMoveSpeed: 1, startAnimSpeed: 4, startDirection: 'down', colorMode: 'mono' }),
      ...(events.length ? [toRuntimeResource({ _resourceType: 'variables', variables: [{ id: 'value', symbol: 'VAR_VALUE', type: 'number', initialValue: 123 }] })] : []),
      toRuntimeResource({ _resourceType: 'scene', id: 'scene', name: 'Scene', sceneType: 'Logo', width: 240, height: 160, backgrounds: [], triggers: events.length ? [{ id: 'region', x: 0, y: 0, width: 16, height: 16 }] : [], script: [
        ...(events.length ? [{ id: 'fade', command: 'EVENT_FADE_IN', args: { speed: 1 } }] : []), ...events,
      ] }),
    ];
    const selection = selectNativeRuntime(createRuntimeFeatureManifest(resources, mode));
    assert.deepEqual(selection.manifest.sourceFiles, selection.manifest.desiredSourceFiles);
    assert.deepEqual(selection.manifest.headerFiles, selection.manifest.desiredHeaderFiles);
    builder.copyNativeRuntime(selection.manifest, selection.featureHeader);
    fs.writeFileSync(path.join(output, 'runtime-feature-manifest.json'), JSON.stringify(selection.manifest, null, 2));
    const files = resources.map(resource => resourceBuilder.processRuntimeResource(resource));
    await resourceBuilder.writeResourceHeader(files);
    await resourceBuilder.generateResourceRegistryClass(files, config);
    fs.mkdirSync(path.join(output, 'build'), { recursive: true });
    await resourceBuilder.writeGraphicsHeader(path.join(output, 'build'));
    await new CppBuilder(output, template, []).generateProjectStructure(config, selection.manifest.sourceFiles);
    return selection.manifest;
  };
  let manifest = await emit([]);
  assert.equal(manifest.selectionPhase, 'complete');
  assert.deepEqual(manifest.sourceFiles, manifest.desiredSourceFiles);
  assert.deepEqual(manifest.headerFiles, manifest.desiredHeaderFiles);
  for (const stem of ['rumble_manager', 'save_manager', 'hbe_manager', 'actor_manager', 'actor_motion_manager', 'audio_manager', 'dialogue_manager', 'shooter_kit', 'combat_manager', 'spawner_timeline_manager', 'event_wait_signal', 'event_wait', 'event_wait_input', 'script_trigger_manager', 'event_change_scene', 'event_change_layer', 'numeric_values']) {
    assert.equal(fs.existsSync(path.join(output, 'src', stem + '.cpp')), false);
    if (!['event_change_layer', 'numeric_values'].includes(stem)) assert.equal(fs.existsSync(path.join(output, 'include', stem + '.h')), false);
  }
  for (const file of manifest.sourceFiles) assert.ok(fs.existsSync(path.join(output, file)), file);
  for (const stem of ['variable_manager', 'config_variables']) {
    assert.equal(fs.existsSync(path.join(output, 'src', stem + '.cpp')), false);
    assert.equal(fs.existsSync(path.join(output, 'include', stem + '.h')), false);
  }
  for (const stem of ['script_command_manager', 'script_event_handlers']) {
    assert.equal(fs.existsSync(path.join(output, 'src', stem + '.cpp')), false);
    assert.equal(fs.existsSync(path.join(output, 'include', stem + '.h')), false);
  }
  assert.match(fs.readFileSync(path.join(output, 'include/gba_studio_features.h'), 'utf8'), /GBA_STUDIO_FEATURE_RUMBLE 0/);
  let env;
  const compile = (label, absent) => {
    const start = performance.now();
    const devkit = process.env.DEVKITPRO;
    assert.ok(devkit, 'DEVKITPRO is required for native selection verification');
    const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
    env = { ...process.env };
    const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'PATH';
    env[key] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(arm, 'bin'), env[key]].join(path.delimiter);
    env.DEVKITPRO = devkit.replaceAll('\\', '/'); env.DEVKITARM = arm.replaceAll('\\', '/'); env.BUTANO = path.join(root, 'tools/butano').replaceAll('\\', '/');
    const result = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: output, env, stdio: 'inherit', windowsHide: true });
    assert.equal(result.status, 0, result.error?.message ?? `${label} ROM build failed`);
    const elf = path.join(output, config.projectName + '.elf');
    const nm = spawnSync(path.join(arm, 'bin/arm-none-eabi-nm.exe'), ['-S', '-C', elf], { env, encoding: 'utf8', windowsHide: true });
    assert.equal(nm.status, 0, nm.stderr);
    if (absent === true) {
      assert.doesNotMatch(nm.stdout, symbols, 'Excluded managers, handlers and singleton buffers must be absent from the ELF');
      assert.doesNotMatch(nm.stdout, /VariableManager|ConfigVariables|IfEventHandler|VariableEventHandler|ScriptCommand::|SpriteEventHandler|sprite_effect_states|update_sprite_effects|set_actor_effect/);
    } else if (absent === false) {
      for (const name of ['RumbleManager', 'SaveManager', 'HbeManager', 'ActorMotionManager', 'AudioManager', 'DialogueManager', 'ShooterKit', 'CombatManager', 'SpawnerTimelineManager', 'ScriptTriggerManager', 'WaitEventHandler', 'WaitInputEventHandler']) assert.ok(nm.stdout.includes(name), `Missing enabled module ${name}`);
      assert.ok(nm.stdout.includes('numeric_runtime_hooks'), 'Missing selected numeric runtime state');
    }
    const memory = inspectGbaMemory(elf); assert.deepEqual(memory.errors, []); console.log(formatGbaMemoryReport(memory));
    metrics.push({ label, compileSeconds: (performance.now() - start) / 1000, romBytes: fs.statSync(path.join(output, config.projectName + '.gba')).size, regions: memory.regions });
    console.log(`${label}: native selection and ELF checks passed.`);
    return nm.stdout;
  };
  if (process.argv.includes('--build')) compile('minimal-selective', true);
  const libraryObject = path.join(output, 'build/bn_core.o');
  if (!process.argv.includes('--build')) fs.writeFileSync(libraryObject, 'valid-library-cache');
  const cachedLibrary = fs.readFileSync(libraryObject);
  manifest = await emit(optionalEvents);
  assert.ok(fs.existsSync(path.join(output, 'src/rumble_manager.cpp')));
  assert.match(fs.readFileSync(path.join(output, 'include/gba_studio_features.h'), 'utf8'), /GBA_STUDIO_FEATURE_SAVE 1/);
  assert.deepEqual(fs.readFileSync(libraryObject), cachedLibrary);
  if (process.argv.includes('--build')) compile('optional-events-added', false);
  else for (const stem of ['rumble_manager', 'save_manager', 'hbe_manager', 'actor_motion_manager']) for (const ext of ['.o', '.d']) fs.writeFileSync(path.join(output, 'build', stem + ext), 'stale-project-artifact');
  manifest = await emit([]);
  for (const stem of ['rumble_manager', 'save_manager', 'hbe_manager', 'actor_motion_manager']) for (const ext of ['.o', '.d']) assert.equal(fs.existsSync(path.join(output, 'build', stem + ext)), false);
  assert.deepEqual(fs.readFileSync(libraryObject), cachedLibrary);
  if (process.argv.includes('--build')) compile('optional-events-removed', true);
  manifest = await emit([], 'full');
  assert.equal(manifest.selectionPhase, 'complete');
  for (const stem of ['rumble_manager', 'save_manager', 'hbe_manager']) assert.ok(fs.existsSync(path.join(output, 'src', stem + '.cpp')));
  if (process.argv.includes('--build')) compile('explicit-full-mode', false);
  if (process.argv.includes('--ui-matrix')) {
    await emit([{ id: 'close', command: 'EVENT_DIALOGUE_CLOSE', args: {} }]);
    if (process.argv.includes('--build')) {
      const names = compile('dialogue-without-ui', null);
      assert.ok(names.includes('DialogueManager'));
      assert.doesNotMatch(names, /DialogueManager::(?:set_ui|animate_ui|render_ui_text|stop_ui_animation)|UiEventHandler/);
    }
    await emit([{ id: 'text', command: 'EVENT_UI_SET_TEXT', args: { text: 'Text', x: 8, y: 8, font: 'fixed8x8' } }]);
    if (process.argv.includes('--build')) {
      const names = compile('ui-without-animation', null);
      assert.ok(names.includes('UiEventHandler::set_text'));
      assert.doesNotMatch(names, /DialogueManager::(?:animate_ui|stop_ui_animation)|UiEventHandler::(?:animate|stop_animation)/);
    }
    await emit([
      { id: 'text', command: 'EVENT_UI_SET_TEXT', args: { text: 'Text', x: 8, y: 8, font: 'fixed8x8' } },
      { id: 'animate', command: 'EVENT_UI_ANIMATE', args: { uiId: 'text', animation: 'move', x: 16, y: 8, speed: 1 } },
    ]);
    if (process.argv.includes('--build')) {
      const names = compile('ui-with-animation', null);
      assert.ok(names.includes('UiEventHandler::animate'));
    }
    await emit([{ id: 'choice', command: 'EVENT_DIALOGUE_CHOICE', args: { prompt: 'Choose', optionA: 'A', optionB: 'B', resultVariable: 'value' } }]);
    if (process.argv.includes('--build')) {
      const names = compile('dialogue-with-choice-without-ui', null);
      assert.ok(names.includes('DialogueEventHandler::choice'));
      assert.doesNotMatch(names, /UiEventHandler|DialogueManager::(?:set_ui|animate_ui|render_ui_text)/);
    }
  }
  const reportIndex = process.argv.indexOf('--report');
  if (reportIndex >= 0) {
    const report = path.resolve(process.argv[reportIndex + 1]); fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify({ selectionPhase: 'complete', metrics, note: 'Native source/header selection follows the desired module closure. Compile times include native build and ELF inspection; first build is cold, later builds reuse library objects. UI matrix separates dialogue, static UI, animation and choices.' }, null, 2) + '\n');
  }
  console.log('Native source selection passed: explicit copies, generated guards, addition/removal, object invalidation, preserved library cache and explicit full mode.');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-native-selection-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
