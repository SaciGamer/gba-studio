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
  assert.match(output, /SCENE_TRIGGER_SCENE_TRIGGER_0_LEAVE_SCRIPTS, 1/);
  await builder.generateResourceRegistryClass([result], { projectName: 'trigger-test', authorName: '', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(tempDir, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SCENE_TRIGGER_SCENE_TRIGGERS, SCENE_TRIGGER_SCENE_TRIGGERS_COUNT/);
  console.log('Scene trigger build smoke test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
