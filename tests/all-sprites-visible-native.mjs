import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
const method = source.slice(source.indexOf('bool GraphicsManager::set_all_actors_visible('), source.indexOf('bool GraphicsManager::set_actor_state('));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-all-visible-'));
try {
  const cpp = path.join(temp, 'test.cpp');
  fs.writeFileSync(cpp, `#include <optional>
#include <cassert>
struct Sprite { bool visible = true; void set_visible(bool value) { visible = value; } };
struct GraphicsManager {
  int player_slot = 0, sprite_count = 4, actor_count = 3;
  int actor_slots[3] = {1, 2, -1};
  std::optional<Sprite> sprites[4] = {Sprite{}, Sprite{}, std::nullopt, Sprite{}};
  bool set_all_actors_visible(bool visible);
};
${method}
int main() {
  GraphicsManager gm;
  assert(gm.set_all_actors_visible(false));
  assert(!gm.sprites[0]->visible && !gm.sprites[1]->visible);
  assert(gm.sprites[3]->visible);
  assert(gm.set_all_actors_visible(true));
  assert(gm.sprites[0]->visible && gm.sprites[1]->visible);
  gm.actor_count = 0;
  assert(gm.set_all_actors_visible(false));
  assert(!gm.sprites[0]->visible);
  gm.player_slot = -1;
  assert(gm.set_all_actors_visible(true));
  gm.player_slot = 4;
  assert(gm.set_all_actors_visible(false));
  gm.player_slot = 2;
  assert(gm.set_all_actors_visible(true));
}
`);
  const exe = path.join(temp, 'test.exe');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', cpp, '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Hide/Show All Sprites: player, actors, missing slots and player-only scenes passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
