import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const { toRuntimeSettings } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-input-map-build-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'settings', id: 'settings', startSceneId: '', startX: 0, startY: 0,
    startMoveSpeed: 1, startAnimSpeed: 4, startDirection: 'right', colorMode: 'mono',
    inputMap: { move_left: ['LEFT'], confirm: ['A', 'START'] },
    inputMapsBySceneType: { Platformer: { confirm: ['B'], jump: ['A'] }, 'Top Down': { confirm: ['L'] } },
    inputGroups: { gameplay: ['START'], menu: [], interaction: ['B'] },
  });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /static const InputBinding SETTINGS_SETTINGS_INPUTMAP_BINDINGS\[\]/);
  assert.match(output, /\{ "move_left", SETTINGS_SETTINGS_INPUTMAP_MOVE_LEFT_BUTTONS/);
  assert.match(output, /\{ "confirm", SETTINGS_SETTINGS_INPUTMAP_CONFIRM_BUTTONS/);
  const legacy = builder.processResourceObject({
    _resourceType: 'settings', id: 'legacy-settings', startSceneId: '',
  });
  const legacyOutput = legacy.headerContent.toString('utf8');
  assert.match(legacyOutput, /static const InputBinding SETTINGS_LEGACY_SETTINGS_INPUTMAP_BINDINGS\[\]/,
    'legacy settings without inputMap must receive compatible default bindings');
  assert.match(legacyOutput, /\{ "move_left", SETTINGS_LEGACY_SETTINGS_INPUTMAP_MOVE_LEFT_BUTTONS/);
  assert.deepEqual((legacy.jsonContent).inputMap.move_left, ['LEFT']);
  assert.deepEqual(legacy.jsonContent.inputMap.select,['SELECT']);
  assert.deepEqual(legacy.jsonContent.inputMap.left_button,['L']);
  assert.deepEqual(legacy.jsonContent.inputMap.right_button,['R']);
  assert.equal(legacy.jsonContent.inputMap.shoot,undefined);
  assert.equal(legacy.jsonContent.inputMap.menu,undefined);
  const migrated=builder.processResourceObject({_resourceType:'settings',id:'migrated',inputMap:{menu:['R']}});
  assert.deepEqual(migrated.jsonContent.inputMap.select,['R']);
  assert.equal(migrated.jsonContent.inputMap.menu,undefined);
  await builder.generateResourceRegistryClass([result], { projectName: 'input-map', authorName: 'test', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(tempDir, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SETTINGS_SETTINGS_INPUTMAP_BINDINGS/);
  assert.match(registry, /\{ 16, 0, 2 \}/);
  assert.match(output, /static const SceneInputMap SETTINGS_SETTINGS_INPUTMAPSBYSCENETYPE_MAPS/);
  assert.match(registry, /SETTINGS_SETTINGS_INPUTMAPSBYSCENETYPE_MAPS, 2/);
  assert.deepEqual(toRuntimeSettings(JSON.parse(JSON.stringify(result.jsonContent))).inputMapsBySceneType, { Platformer: { confirm: ['B'], jump: ['A'] }, 'Top Down': { confirm: ['L'] } });
  assert.throws(() => builder.processResourceObject({_resourceType:'settings',inputMapsBySceneType:{Logo:{jump:['A']}}}), /Invalid scene input binding/);
  assert.throws(() => builder.processResourceObject({_resourceType:'settings',inputMapsBySceneType:{Platformer:{jump:['X']}}}), /Invalid scene input binding/);
  assert.deepEqual(toRuntimeSettings(JSON.parse(JSON.stringify(result.jsonContent))).inputGroups, { gameplay: ['START'], menu: [], interaction: ['B'] });
  assert.throws(() => builder.processResourceObject({ _resourceType: 'settings', inputMapsBySceneType: { Platformer: { confirm: ['B'], jump: ['A'] }, 'Top Down': { confirm: ['L'] } },
    inputGroups: { gameplay: ['X'] } }), /Invalid inputGroups/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'settings', id: 'invalid', inputMap: { 'bad-action!': ['A'] },
  }), /Invalid inputMap action/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'settings', id: 'invalid-button', inputMap: { action: ['X'] },
  }), /buttons must contain/);
  console.log('Input map build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
