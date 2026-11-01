import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const method = signature => {
  const start = source.indexOf(signature);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-properties-'));
try {
  const file = path.join(temp, 'test.cpp'), executable = path.join(temp, 'test.exe');
  fs.writeFileSync(file, `#include <cassert>
#include <iostream>
#include <string>
#include <optional>
#include "actor_motion_physics.h"
namespace bn { template<int N> using string=std::string; }
#define BN_LOG(...) ((void)0)
struct Sprite { bool shown=true; bool visible()const{return shown;} };
class GraphicsManager { public:
 int player_slot=0,player_world_x=32,player_world_y=64,actor_count=1,sprite_count=2;
 std::string player_direction="right",actor_ids[1]{"door"};
 int actor_slots[1]{1},actor_world_x[1]{240},actor_world_y[1]{172},actor_direction_override[1]{-1};
 int sprite_animation_frames[2]{},sprite_animation_speeds[2]{6,4};
 const Scenes* currentScene=nullptr;std::optional<Sprite> sprites[2]{Sprite{},Sprite{}};const Sprites* sprite_resources[2]{};
 int read_numeric_actor_property(const char*,int)const;
 bool script_actor_blocked(const char*,const Sprites&,int,int)const;
 int script_actor_minimum_distance(const char*,const Sprites&,int,int)const;
};
${method('int GraphicsManager::read_numeric_actor_property(')}
${method('bool GraphicsManager::script_actor_blocked(')}
${method('int GraphicsManager::script_actor_minimum_distance(')}
int main(){GraphicsManager graphics;Sprites body{};body.frame_width=16;body.frame_height=16;body.collision_x=-8;body.collision_y=-8;body.collision_width=16;body.collision_height=16;
 graphics.sprite_resources[0]=graphics.sprite_resources[1]=&body;
 assert(graphics.read_numeric_actor_property("door",0)==240&&graphics.read_numeric_actor_property("door",1)==172);
 assert(graphics.read_numeric_actor_property("door",5)==15&&graphics.read_numeric_actor_property("door",6)==10);
 assert(graphics.read_numeric_actor_property("door",7)==240&&graphics.read_numeric_actor_property("door",8)==172);
 assert(graphics.read_numeric_actor_property("__PLAYER__",5)==2&&graphics.read_numeric_actor_property("__PLAYER__",6)==4);
 graphics.actor_world_x[0]=31;graphics.actor_world_y[0]=-17;
 assert(graphics.read_numeric_actor_property("door",5)==1&&graphics.read_numeric_actor_property("door",6)==-1);
 graphics.actor_world_x[0]=96;graphics.actor_world_y[0]=64;
 assert(graphics.script_actor_blocked("__PLAYER__",body,96,64));assert(!graphics.script_actor_blocked("__PLAYER__",body,112,64));
 assert(graphics.script_actor_minimum_distance("__PLAYER__",body,96,64)==16);
 assert(!graphics.script_actor_blocked("door",body,96,64));assert(graphics.script_actor_blocked("door",body,32,64));
 graphics.sprites[1]->shown=false;assert(!graphics.script_actor_blocked("__PLAYER__",body,96,64));
 std::cout<<"Actor properties: live pixel/tile units, player coordinates, configured actor collision rectangles, self exclusion and hidden actors passed.\\n";
}`);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', 'tests/native/support', '-I', 'tests/native/scheduler', '-I', 'tools/butano/template/include', file, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  process.stdout.write(run.stdout);
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-actor-properties-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
