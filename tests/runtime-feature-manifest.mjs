import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalog } from './helpers/event-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { createRuntimeFeatureManifest, RUNTIME_MODULES, selectNativeRuntime } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/RuntimeFeatureManifest.js')));
const { toRuntimeResource, toRuntimeScene, toRuntimeSettings } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')));
const { toRuntimeScripts } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeScript.js')));
const scene = events => toRuntimeScene({ _resourceType: 'scene', id: 'scene', name: 'scene', backgrounds: [], script: events });
const event = (command, args = {}) => ({ id: command.toLowerCase(), command, args });
const minimal = createRuntimeFeatureManifest([scene([])]);
assert.equal(minimal.selectionApplied, false);
assert.deepEqual(minimal.eventCodes, []);
assert.match(selectNativeRuntime(minimal).featureHeader, /#define GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION 0/);
for (const module of ['core', 'startup', 'audio-backend', 'fade', 'graphics', 'input', 'camera']) assert.ok(minimal.modules.includes(module));
for (const module of ['rumble', 'shooter', 'save', 'dialogue', 'ui-animation', 'motion', 'scripts']) assert.ok(!minimal.modules.includes(module), `Unexpected minimal module ${module}`);
assert.ok(!minimal.sourceFiles.some(file => file.includes('rumble') || file.includes('shooter')));
const expected = {
  EVENT_BACKGROUND_ANIMATE: ['background-animation', 'layers'], EVENT_RUMBLE: ['rumble'], EVENT_SAVE_LOAD: ['save', 'variables'], EVENT_UI_ANIMATE: ['ui-animation', 'ui', 'dialogue'],
  EVENT_SHOOTER_START: ['shooter', 'combat', 'spawner', 'actors'], EVENT_SHOOTER_WAIT_SIGNAL: ['wait-signal', 'shooter', 'combat'],
  EVENT_PLAY_MUSIC: ['audio', 'audio-backend'], EVENT_HBE_EFFECT_ENABLE: ['hbe', 'graphics'], EVENT_WAIT_INPUT: ['wait-input', 'input'],
  EVENT_CHANGE_SCENE: ['scene-change', 'fade', 'graphics', 'scripts'],
};
let cases = 0;
for (const definition of catalog.EVENT_CATALOG) {
  const args = structuredClone(catalog.EVENT_DEFAULTS[definition.code] ?? {});
  // The analysis consumes compiled commands. Isolated fixtures provide every
  // static lookup target, while real payload validation remains in compiler tests.
  if (['EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD'].includes(definition.code)) args.allVariables = true;
  if (definition.code === 'EVENT_CHANGE_SCENE') args.sceneId = 'scene';
  if (definition.code === 'EVENT_CALL_SCRIPT') args.scriptId = 'sub';
  if (definition.code === 'EVENT_BACKGROUND_ANIMATE') args.regularBackgroundId = 'frame';
  if (definition.code === 'EVENT_CHANGE_LAYER') args.backgroundId = '';
  if (definition.code === 'EVENT_SHOOTER_LOAD_STAGE') args.backgroundId = '';
  let runtimeEvent = event(definition.code, args);
  let expectedCode = definition.code;
  if (definition.code === 'EVENT_SWITCH') {
    runtimeEvent = { ...runtimeEvent, children: { then: [{ id: 'case', command: 'EVENT_SWITCH_CASE', args: { value: { kind: 'literal', type: 'number', value: 0 } }, children: { then: [] } }], else: [] } };
    [runtimeEvent] = toRuntimeScripts([runtimeEvent]);
    expectedCode = 'EVENT_IF';
  }
  const localScene = definition.code === 'EVENT_LOCAL_VARIABLE_RESET' ? toRuntimeScene({_resourceType:'scene', id:'scene', actors:[{id:'983fe268-d30c-4f05-9031-0ebd0d356430',onInitScript:[runtimeEvent]}]}) : scene([runtimeEvent]);
  const resources = [localScene, toRuntimeResource({ _resourceType: 'scripts', scripts: [{ id: 'sub', events: [] }] })];
  if (definition.code === 'EVENT_BACKGROUND_ANIMATE') resources.push(toRuntimeResource({_resourceType:'background',id:'frame',filename:'frame.bmp',imageWidth:256,imageHeight:256}));
  const manifest = createRuntimeFeatureManifest(resources);
  assert.deepEqual(manifest.eventCodes, [expectedCode]);
  if (definition.code === 'EVENT_BACKGROUND_ANIMATE') assert.match(selectNativeRuntime(manifest).featureHeader, /#define GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION 1/);
  assert.ok(manifest.modules.includes('scripts'));
  for (const module of expected[definition.code] ?? []) assert.ok(manifest.modules.includes(module), `${definition.code} lacks ${module}`);
  for (const module of manifest.modules) for (const dependency of RUNTIME_MODULES[module].dependencies) assert.ok(manifest.modules.includes(dependency), `Missing closure ${module}->${dependency}`);
  for (const file of [...manifest.sourceFiles, ...manifest.headerFiles]) assert.ok(fs.existsSync(path.join(root, 'tools/butano/template', file)), `Missing module file ${file}`);
  cases++;
}
const nested = { id: 'branch', command: 'EVENT_IF', args: { left: { kind: 'literal', type: 'number', value: 1 }, operator: '==', right: { kind: 'literal', type: 'number', value: 2 } }, children: {
  then: [event('EVENT_RUMBLE', { durationFrames: 1, intensity: 100 })], else: [event('EVENT_SAVE_LOAD', { slot: 0, variableId: 'value' })],
} };
const contextual = toRuntimeScene({ _resourceType: 'scene', id: 'scene', actors: [{ id: 'actor', onInteractScript: [nested] }], triggers: [{ id: 'trigger', onEnterScript: [event('EVENT_CALL_SCRIPT', { scriptId: 'a' })], onLeaveScript: [event('EVENT_WAIT', { units: 'frames', frames: 1 })] }] });
const definitions = toRuntimeResource({ _resourceType: 'scripts', scripts: [
  { id: 'a', events: [event('EVENT_CALL_SCRIPT', { scriptId: 'b' })] },
  { id: 'b', events: [event('EVENT_CALL_SCRIPT', { scriptId: 'a' }), event('EVENT_PLAY_SOUND', { soundId: 'sound' })] },
  { id: 'dynamic-target', events: [event('EVENT_HBE_EFFECT_DISABLE')] },
] });
const combined = createRuntimeFeatureManifest([contextual, definitions]);
for (const command of ['EVENT_IF', 'EVENT_RUMBLE', 'EVENT_SAVE_LOAD', 'EVENT_CALL_SCRIPT', 'EVENT_PLAY_SOUND', 'EVENT_HBE_EFFECT_DISABLE', 'EVENT_WAIT']) assert.ok(combined.eventCodes.includes(command));
assert.deepEqual(combined.scriptIds, ['a', 'b', 'dynamic-target']);
assert.ok(combined.reasons.rumble.some(reason => reason.includes('actor:actor')));
assert.ok(combined.reasons.audio.some(reason => reason.includes('script:b')));
assert.deepEqual(createRuntimeFeatureManifest([definitions, contextual]), combined, 'Manifest order must not depend on resource traversal');
assert.throws(() => createRuntimeFeatureManifest([scene([event('EVENT_CALL_SCRIPT', { scriptId: 'missing' })])]), /missing script/);
const omitted = createRuntimeFeatureManifest([scene([
  { ...event('EVENT_RUMBLE'), args: { __comment: true } }, { ...event('EVENT_SHOOTER_START'), disabled: true },
])]);
assert.deepEqual(omitted, minimal);
const camera = createRuntimeFeatureManifest([scene([event('EVENT_CAMERA_MOVE_TO', { x: 4, y: 8 })])]);
assert.ok(!camera.modules.includes('motion'), 'Camera interpolation must not include actor path-search state');
const instant = createRuntimeFeatureManifest([scene([event('EVENT_ACTOR_MOVE_TO', { actorId: '__PLAYER__', x: 4, y: 8, animated: false })])]);
assert.ok(!instant.modules.includes('motion'));
const moving = createRuntimeFeatureManifest([scene([event('EVENT_ACTOR_MOVE_TO', { actorId: '__PLAYER__', x: 4, y: 8 })])]);
assert.ok(moving.modules.includes('motion') && moving.modules.includes('pathfinding'));
const numeric = createRuntimeFeatureManifest([scene([event('EVENT_PAN_CAMERA', { x: { kind: 'engine', field: 'cameraX' }, y: 0 })])]);
assert.ok(numeric.modules.includes('numeric') && numeric.modules.includes('variables'));
const literal = createRuntimeFeatureManifest([scene([event('EVENT_PAN_CAMERA', { x: { kind: 'number', value: 4 }, y: 0 })])]);
assert.ok(!literal.modules.includes('numeric'), 'Literal substitution must not include the numeric interpreter');
const shooter = createRuntimeFeatureManifest([toRuntimeScene({ _resourceType: 'scene', id: 'scene', sceneType: "Shoot Em'Up" })]);
assert.ok(shooter.modules.includes('shooter'));
const startup = createRuntimeFeatureManifest([toRuntimeSettings({ startSceneId: '' })]);
assert.ok(startup.modules.includes('audio-backend'));
assert.ok(!startup.modules.includes('audio'), 'Startup uses native Butano audio, without event AudioManager');
const full = createRuntimeFeatureManifest([scene([])], 'full');
assert.deepEqual(full.modules, Object.keys(RUNTIME_MODULES).sort());
const actualSources = fs.readdirSync(path.join(root, 'tools/butano/template/src')).filter(file => file.endsWith('.cpp')).map(file => `src/${file}`).sort();
assert.deepEqual(full.sourceFiles, actualSources, 'Every current native source must have explicit module ownership');
assert.ok(full.reasons.rumble.includes('mode:full (explicit diagnostic build)'));
console.log(`Runtime feature manifest passed: ${cases} events, minimal/full source ownership, dependency closure, nested entry points, cycles, dynamic lookup, implicit startup and stable reasons.`);
