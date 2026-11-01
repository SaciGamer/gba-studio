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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-facing-trigger-'));
try {
  const cpp = `#include <cassert>
#include <algorithm>
#include <cstring>
namespace bn { using std::max; }
namespace actor_motion { struct State { int x=0,y=0,direction=0; }; }
struct Sprites { int collision_x,collision_y,collision_width,collision_height; };
struct ScriptTrigger { int x,y,width,height; };
struct GraphicsManager {
 int player_slot=0,sprite_count=1;
 Sprites body{-4,-8,8,16}; const Sprites* sprite_resources[1]={&body};
 actor_motion::State a{},b{};
 const Sprites* read_script_actor_state(const char* id, actor_motion::State& state) const {
   if(!id) return nullptr;
   if(!strcmp(id,"actor")) state=a;
   else if(!strcmp(id,"__PLAYER__")) state=b;
   else return nullptr;
   return &body;
 }
 bool actor_is_facing(const char*, const char*, bool = true, bool = true, int = 0, int = 0) const;
 bool player_overlaps_trigger(const ScriptTrigger&,int,int) const;
};
${method('bool GraphicsManager::actor_is_facing(')}
${method('bool GraphicsManager::player_overlaps_trigger(')}
int main(){
 GraphicsManager g;
 const int x[]={0,20,0,-20},y[]={-20,0,20,0};
 for(int direction=0;direction<4;++direction) for(int target=0;target<4;++target){
   g.a={0,0,direction};g.b={x[target],y[target],(direction+2)%4};
   assert(g.actor_is_facing("actor","__PLAYER__")== (direction==target));
 }
 g.a={0,0,1};g.b={20,19,3};assert(g.actor_is_facing("actor","__PLAYER__"));
 g.b={19,20,3};assert(!g.actor_is_facing("actor","__PLAYER__"));
 g.b={20,20,3};assert(g.actor_is_facing("actor","__PLAYER__"));
 g.a.direction=2;assert(g.actor_is_facing("actor","__PLAYER__"));
 g.b={0,0,1};assert(!g.actor_is_facing("actor","__PLAYER__"));
 assert(!g.actor_is_facing("missing","__PLAYER__"));assert(!g.actor_is_facing("actor",nullptr));
 assert(!g.actor_is_facing("actor","actor"));
 // Horizontal-only checks ignore height and respect the inclusive X range.
 g.a={0,0,1};g.b={32,-200,0};
 assert(g.actor_is_facing("actor","__PLAYER__",true,false,32,1));
 assert(!g.actor_is_facing("actor","__PLAYER__",true,false,31,0));
 g.a.direction=3;assert(!g.actor_is_facing("actor","__PLAYER__",true,false));
 g.a={0,0,0};g.b={200,-32,0};
 assert(g.actor_is_facing("actor","__PLAYER__",false,true,1,32));
 assert(!g.actor_is_facing("actor","__PLAYER__",false,true,0,31));
 assert(!g.actor_is_facing("actor","__PLAYER__",false,false));
 g.a={0,0,1};g.b={32,20,0};
 assert(g.actor_is_facing("actor","__PLAYER__",true,true,32,20));
 assert(!g.actor_is_facing("actor","__PLAYER__",true,true,32,19));
 g.b={0,-32,0};assert(!g.actor_is_facing("actor","__PLAYER__",true,false));
 ScriptTrigger t{10,10,10,10};
 // Position outside, collider overlapping, on all four sides.
 assert(g.player_overlaps_trigger(t,7,15));assert(g.player_overlaps_trigger(t,23,15));
 assert(g.player_overlaps_trigger(t,15,3));assert(g.player_overlaps_trigger(t,15,27));
 // Edge-only contact has no positive overlap.
 assert(!g.player_overlaps_trigger(t,6,15));assert(!g.player_overlaps_trigger(t,24,15));
 assert(!g.player_overlaps_trigger(t,15,2));assert(!g.player_overlaps_trigger(t,15,28));
 g.body={40,30,20,20};assert(g.player_overlaps_trigger(t,-35,-25));
 assert(!g.player_overlaps_trigger(t,15,15));
 g.body={-40,-40,80,80};assert(g.player_overlaps_trigger(t,0,0));
 t.width=0;assert(!g.player_overlaps_trigger(t,0,0));
 t.width=10;g.player_slot=-1;assert(!g.player_overlaps_trigger(t,15,15));
}`;
  const file = path.join(temp, 'main.cpp'), exe = path.join(temp, 'test.exe');
  fs.writeFileSync(file, cpp);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', file, '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.error?.message ?? build.stdout + build.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.error?.message ?? run.stdout + run.stderr);
  console.log('Facing directions and trigger collider geometry passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
