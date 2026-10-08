import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-input-map-build-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'settings', id: 'settings', startSceneId: '', startX: 0, startY: 0,
    startMoveSpeed: 1, startAnimSpeed: 4, startDirection: 'right', colorMode: 'mono',
    inputMap: { move_left: ['LEFT'], confirm: ['A', 'START'] },
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
  await builder.generateResourceRegistryClass([result], { projectName: 'input-map', authorName: 'test', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(tempDir, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SETTINGS_SETTINGS_INPUTMAP_BINDINGS/);
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
