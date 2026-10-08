import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-actor-position-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'actor_position', script: [
      { id: 'position', command: 'EVENT_ACTOR_SET_POSITION', args: { actorId: 'npc', x: 20, y: 30 } },
      { id: 'move-to', command: 'EVENT_ACTOR_MOVE_TO', args: { actorId: 'npc', x: 24, y: 34 } },
      { id: 'spawn', command: 'EVENT_ACTOR_SPAWN', args: { actorId: 'npc2', x: 4, y: 6 } },
      { id: 'despawn', command: 'EVENT_ACTOR_DESPAWN', args: { actorId: 'npc2' } },
      { id: 'visible', command: 'EVENT_ACTOR_SET_VISIBLE', args: { actorId: 'npc', visible: false } },
    ],
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /ActorMoveEventData SCENE_ACTOR_POSITION_ARGS_\d+ = \{ "npc", 20, 30 \}/);
  assert.match(header, /\{ "position", "EVENT_ACTOR_SET_POSITION", &SCENE_ACTOR_POSITION_ARGS_\d+/);
  assert.match(header, /EVENT_ACTOR_MOVE_TO/);
  assert.match(header, /EVENT_ACTOR_SPAWN/);
  assert.match(header, /EVENT_ACTOR_DESPAWN/);
  assert.match(header, /EVENT_ACTOR_SET_VISIBLE/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid', script: [{ id: 'bad', command: 'EVENT_ACTOR_SET_POSITION', args: { x: 0, y: 0 } }],
  }), /actorId|required/);
  console.log('Actor set position build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
