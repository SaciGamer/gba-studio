import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-trigger-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools', 'butano', 'template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'trigger-scene', backgrounds: [],
    triggers: [{ id: 'door', x: 8, y: 16, width: 24, height: 8, activation: 'interact', enabled: true, once: true, cooldownFrames: 12,
      onEnterScript: [{ id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } }],
      onLeaveScript: [{ id: 'fade', command: 'EVENT_FADE_OUT', args: { speed: 2 } }] }],
  });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /static const ScriptTrigger SCENE_TRIGGER_SCENE_TRIGGERS\[\]/);
  assert.match(output, /\"door\", 8, 16, 24, 8, TriggerActivation::interact, true, true, 12/);
  assert.match(output, /SCENE_TRIGGER_SCENE_TRIGGER_0_ENTER_SCRIPTS/);
  assert.match(output, /SCENE_TRIGGER_SCENE_TRIGGER_0_LEAVE_SCRIPTS/);
  assert.match(output, /SCENE_TRIGGER_SCENE_TRIGGER_0_LEAVE_SCRIPTS, SCENE_TRIGGER_SCENE_TRIGGER_0_LEAVE_SCRIPTS_COUNT/);
  assert.match(output, /SCENE_TRIGGER_SCENE_TRIGGER_0_LEAVE_SCRIPTS_COUNT = 1/);
  await builder.generateResourceRegistryClass([result], { projectName: 'trigger-test', authorName: '', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(tempDir, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SCENE_TRIGGER_SCENE_TRIGGERS, SCENE_TRIGGER_SCENE_TRIGGERS_COUNT/);
  // Exercise validation through the public build entry point, including a
  // reference nested inside a conditional rather than only direct events.
  const placements = [
    events => ({ triggers: [{ id: 'door', onEnterScript: events }] }),
    events => ({ triggers: [{ id: 'door', onLeaveScript: events }] }),
    events => ({ actors: [{ id: 'npc', onInteractScript: events }] }),
  ];
  for (const place of placements) {
    for (const [command, args, expected] of [
      ['EVENT_CHANGE_SCENE', { sceneId: 'missing' }, /scene 'missing' does not exist/],
      ['EVENT_CHANGE_LAYER', { layerId: 0, backgroundId: 'missing' }, /background 'missing' does not exist/],
    ]) {
      const events = [{ id: 'branch', command: 'EVENT_IF', children: {
        then: [], else: [{ id: 'invalid-reference', command, args }],
      } }];
      const invalid = { ...result, jsonContent: {
        _resourceType: 'scene', id: 'trigger-scene', ...place(events),
      } };
      await assert.rejects(() => builder.generateResourceRegistryClass([invalid], {
        projectName: 'invalid-trigger', authorName: '', version: '1.0.0',
      }), expected);
    }
    const valid = { ...result, jsonContent: {
      ...result.jsonContent, ...place([{ id: 'return', command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'trigger-scene' } }]),
    } };
    await builder.generateResourceRegistryClass([valid], { projectName: 'valid-trigger', authorName: '', version: '1.0.0' });
  }
  console.log('Scene trigger build smoke test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
