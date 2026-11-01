import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const method = signature => { const start = source.indexOf(signature); assert.ok(start >= 0); return source.slice(start, source.indexOf('\n}\n', start) + 2); };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-movement-differential-'));
try {
  const fixture = `
${fs.readFileSync('tools/butano/template/include/player_physics.h', 'utf8')}
#include <algorithm>
#include <cassert>
#include <iostream>
#include <optional>
#include <random>
#include <set>
#include <string>
#include <vector>
namespace bn {template<int N> using string=std::string;using std::min;using std::max;using std::clamp;}
struct Sprites {int frame_width=16,frame_height=16,collision_x=-4,collision_y=-4,collision_width=8,collision_height=8;};
struct SceneCollision {int x,y,width,height;const char* side;};
struct Scenes {const char* scene_type;const SceneCollision* collisions;int collisions_count,scene_width=512,scene_height=512;};
${fs.readFileSync('tools/butano/template/include/actor_motion_physics.h', 'utf8').replace('#include "resource_types.h"','').replace('#include "player_physics.h"','')}
struct Settings {int move_speed=1;} settings;const Settings* get_settings(){return &settings;}
struct InputManager {std::set<std::string> down,edge;static InputManager& instance(){static InputManager input;return input;}bool held(const char* key){return down.count(key);}bool pressed(const char* key){return edge.count(key);}};
struct Sprite {};
struct GraphicsManager {
 int player_slot=0,sprite_count=1,player_world_x=100,player_world_y=100;
 std::optional<Sprite> sprites[1]{Sprite{}};const Sprites* sprite_resources[1]{};const Scenes* currentScene=nullptr;
 PlayerPhysics player_physics;int player_vertical_velocity_q8=0,player_vertical_remainder_q8=0,player_diagonal_remainder_q16=0,player_ignored_platform_index=-1;
 bool player_grounded=false,player_climbing=false,player_drop_through_active=false;std::string player_direction="right",animation;
 bool player_on_ladder(int,int)const;
 void set_player_animation(bool moving,const char* type=nullptr){animation=(moving?"moving:":"idle:")+std::string(type?type:"");}
 void set_sprite_group_position(int,int,int){}
 void move_player_from_input();
};
struct ReferenceGraphicsManager:GraphicsManager {void move_player_from_input();};
${method('bool GraphicsManager::player_on_ladder(')}
${method('void GraphicsManager::move_player_from_input(')}
${fs.readFileSync('tests/native/movement/reference_player_movement.cpp','utf8')}
int main(){
 std::mt19937 random(0x6ba500);auto& input=InputManager::instance();const char* sides[]={"solid","top","down","left","right","ladder"};
 int frames=0;
 for(int scenario=0;scenario<600;++scenario){
  std::vector<SceneCollision> collisions;
  const int count=scenario%4==0?0:scenario%4==1?8:scenario%4==2?160:80;
  for(int i=0;i<count;++i)collisions.push_back({int(random()%500),int(random()%500),1+int(random()%48),1+int(random()%48),sides[random()%6]});
  // Force dense overlap beyond the bounded candidate list, plus thin walls.
  if(scenario%4==3)for(auto& c:collisions){c.x=80;c.y=80;c.width=c.height=80;}
  Scenes scene{scenario%2?"Platformer":"Adventure",collisions.data(),count};Sprites body;
  body.collision_x=-int(random()%12);body.collision_y=-int(random()%12);body.collision_width=1+random()%24;body.collision_height=1+random()%24;
  GraphicsManager actual;ReferenceGraphicsManager reference;actual.currentScene=reference.currentScene=&scene;actual.sprite_resources[0]=reference.sprite_resources[0]=&body;
  actual.player_world_x=reference.player_world_x=100;actual.player_world_y=reference.player_world_y=100;
  actual.player_physics.config.allow_diagonal=reference.player_physics.config.allow_diagonal=scenario%3;
  settings.move_speed=1+scenario%16;
  for(int frame=0;frame<80;++frame){
   input.down.clear();input.edge.clear();
   const unsigned keys=random();if(keys&1)input.down.insert("move_left");if(keys&2)input.down.insert("move_right");if(keys&4)input.down.insert("move_up");if(keys&8)input.down.insert("move_down");if(keys&16)input.edge.insert("jump");if(keys&32)input.edge.insert("move_down");
   if(frame%13==0){const int velocity=int(random()%8193)-4096;actual.player_vertical_velocity_q8=reference.player_vertical_velocity_q8=velocity;}
   actual.move_player_from_input();reference.move_player_from_input();
   #define SAME(field) if(actual.field!=reference.field){std::cerr<<"scenario="<<scenario<<" frame="<<frame<<" field="<<#field<<"\\n";return 1;}
   SAME(player_world_x);SAME(player_world_y);SAME(player_vertical_velocity_q8);SAME(player_vertical_remainder_q8);SAME(player_diagonal_remainder_q16);
   SAME(player_grounded);SAME(player_climbing);SAME(player_drop_through_active);SAME(player_ignored_platform_index);SAME(player_direction);SAME(animation);SAME(player_physics.air_jumps_used);SAME(player_physics.impulse_pending);
   ++frames;
  }
 }
 std::cout<<"Player movement matches the frozen reference for "<<frames<<" frames: sparse/dense colliders, overflow fallback, one-way sides, ladders, diagonal movement, jumps, impulses and speeds 1-16.\\n";
}
`;
  const cpp = path.join(temporary, 'main.cpp'), exe = path.join(temporary, 'test.exe');fs.writeFileSync(cpp, fixture);
  const built = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', cpp, '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(built.status, 0, built.error?.message ?? built.stdout + built.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true, timeout: 30000 });assert.equal(run.status, 0, run.error?.message ?? run.stdout + run.stderr);process.stdout.write(run.stdout);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
