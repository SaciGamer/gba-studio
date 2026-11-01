import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ResourceBuilder from '../dist/main/utils/builders/ResourceBuilder.js';
import { toRuntimeScene } from '../dist/main/utils/types/RuntimeResources.js';
import { preparePrefabSpawns } from '../dist/main/utils/builders/PrefabSpawns.js';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-offscreen-contract-'));
try {
  const scene = { _resourceType: 'scene', id: 'scene', name: 'Actors', actors: [
    { id: 'default', spriteId: 'hero', x: 32, y: 48, anchor: 'center' },
    { id: 'keep', spriteId: 'hero', keepRunningWhileOffscreen: true, x: 64, y: 48, anchor: 'center' },
  ], backgrounds: [], script: [] };
  const runtime = toRuntimeScene(scene);
  assert.equal(runtime.actors[0].keepRunningWhileOffscreen, false);
  assert.equal(runtime.actors[1].keepRunningWhileOffscreen, true);
  fs.mkdirSync(path.join(temporary, 'include'));
  const builder = new ResourceBuilder(temporary, path.resolve('tools/butano/template'));
  const compiled = builder.processRuntimeResource(runtime).headerContent.toString();
  assert.match(compiled, /"default", "hero", 32, 48,[^\n]*nullptr, false \}/);
  assert.match(compiled, /"keep", "hero", 64, 48,[^\n]*nullptr, true \}/);
  const file = jsonContent => ({ jsonContent, headerContent: Buffer.alloc(0), resourceName: '', resourceType: 'gbasres' });
  const library = file({ _resourceType: 'prefabs', prefabs: [{ id: 'prefab', type: 'actor', actor: { spriteId: 'hero', keepRunningWhileOffscreen: true } }] });
  const placed = file({ ...scene, script: [{ id: 'spawn', command: 'EVENT_SPAWN_ACTOR', args: { source: 'prefab', prefabId: 'prefab', x: 800, y: 48 } }] });
  preparePrefabSpawns([library, placed]);
  assert.ok(toRuntimeScene(placed.jsonContent).actors.filter(actor => actor.spawnPrefabId).every(actor => actor.keepRunningWhileOffscreen));
  assert.equal(JSON.parse(JSON.stringify(scene)).actors[1].keepRunningWhileOffscreen, true);
  assert.doesNotThrow(() => builder.processResourceObject({ ...scene, actors: Array.from({ length: 129 }, (_, id) => ({ id: String(id), spriteId: 'hero' })) }));

  // Compile the actual canvas/camera predicate: composite parts and origins must
  // remain alive while even a single pixel intersects the screen.
  const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
  const start = source.indexOf('bool GraphicsManager::actor_on_screen(');
  const predicate = source.slice(start, source.indexOf('\n}', start) + 2);
  const cpp = path.join(temporary, 'bounds.cpp'), executable = path.join(temporary, 'bounds.exe');
  fs.writeFileSync(cpp, `#include <cassert>
#include <algorithm>
#include <string>
namespace bn{template<int N>using string=std::string;using std::max;}
struct SceneActor{const char* sprite_id="hero";};
struct Sprites{int canvas_origin_x=8,canvas_origin_y=8,frame_width=16,frame_height=16,composite_columns=2,composite_rows=2;};
Sprites resource;const Sprites* get_sprite_by_id(const std::string& id){return id=="hero"?&resource:nullptr;}
struct GraphicsManager{int camera_x=0,camera_y=0;bool actor_on_screen(const SceneActor&,int,int,int=-1)const;};
${predicate}
int main(){GraphicsManager graphics;SceneActor actor;
assert(graphics.actor_on_screen(actor,-23,8));assert(!graphics.actor_on_screen(actor,-24,8));
assert(graphics.actor_on_screen(actor,247,8));assert(!graphics.actor_on_screen(actor,248,8));
assert(graphics.actor_on_screen(actor,8,-23));assert(!graphics.actor_on_screen(actor,8,-24));
assert(graphics.actor_on_screen(actor,8,167));assert(!graphics.actor_on_screen(actor,8,168));
graphics.camera_x=600;assert(graphics.actor_on_screen(actor,608,8));assert(!graphics.actor_on_screen(actor,32,8));
actor.sprite_id="missing";assert(!graphics.actor_on_screen(actor,608,8));}
`);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', cpp, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true }); assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Actor offscreen contract passed: legacy/default false, explicit true, JSON persistence, prefab projection, generated ABI, bounded metadata and native composite canvas/camera edges.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-actor-offscreen-contract-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
