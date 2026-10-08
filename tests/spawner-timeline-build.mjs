import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-spawner-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const scene = builder.processResourceObject({
    _resourceType: 'scene', id: 'stage', name: 'stage', backgrounds: [], width: 240, height: 160,
    spawnerTimelines: [{ id: 'wave_1', entries: [
      { frame: 0, archetypeId: 'enemy_basic', x: 20, y: 30, patternId: 'sine', dropId: 'powerup' },
      { frame: 30, archetypeId: 'enemy_basic', x: 40, y: 30, patternId: 'sine' },
    ] }],
  });
  const header = scene.headerContent.toString('utf8');
  assert.match(header, /SpawnerTimelineEntry SCENE_STAGE_SPAWNER_0_ENTRIES/);
  assert.match(header, /\{ 30, "enemy_basic", 40, 30, "sine", "" \}/);
  assert.match(header, /\{ 0, "enemy_basic", 20, 30, "sine", "powerup" \}/);
  await builder.generateResourceRegistryClass([scene], { projectName: 'spawner', authorName: 'test', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(temp, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SCENE_STAGE_SPAWNER_TIMELINES/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad', backgrounds: [], spawnerTimelines: [{ id: 'wave', entries: [{ frame: -1 }] }] }), /frame must be/);
  console.log('Spawner timeline build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
