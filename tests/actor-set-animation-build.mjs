import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-actor-animation-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'actor_animation', script: [{ id: 'animation', command: 'EVENT_ACTOR_SET_ANIMATION', args: { actorId: 'npc', speed: 12 } }],
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /ActorAnimationSpeedEventData SCENE_ACTOR_ANIMATION_ARGS_0 = \{ "npc", 12 \}/);
  assert.match(header, /\{ "animation", "EVENT_ACTOR_SET_ANIMATION", &SCENE_ACTOR_ANIMATION_ARGS_0/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid', script: [{ id: 'bad', command: 'EVENT_ACTOR_SET_ANIMATION', args: { actorId: '', speed: 61 } }],
  }), /actorId|required|above/);
  console.log('Actor set animation build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
