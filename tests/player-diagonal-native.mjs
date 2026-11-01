import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
function method(signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
}
const fitStart = source.indexOf('    bool animation_frames_fit(');
const fit = source.slice(fitStart, source.indexOf('\n    }', fitStart) + 6);
const handlersSource = fs.readFileSync('tools/butano/template/src/script_event_handlers.cpp', 'utf8').replaceAll('\r\n', '\n');
const handlerStart = handlersSource.indexOf('EventStatus PhysicsEventHandler::execute_status(');
assert.ok(handlerStart >= 0);
const physicsHandler = handlersSource.slice(handlerStart, handlersSource.indexOf('\n}\n', handlerStart) + 2);
const cpp = `
${fs.readFileSync("tools/butano/template/include/player_physics.h", "utf8")}
#include <cassert>
#include <algorithm>
#include <optional>
#include <string>
#include <set>
#include <iostream>
namespace bn { template<int N> using string=std::string; using std::min; using std::max; using std::clamp; }
struct SpriteAnimationDefinition { const char* state_id; const char* animation_id; const char* animation_type; const int* frames; int frames_count; bool flip_right_to_create_left_frames; };
struct Sprites { int frame_width=16,frame_height=16,canvas_origin_x=0,canvas_origin_y=0,collision_x=-4,collision_y=-4,collision_width=8,collision_height=8; const SpriteAnimationDefinition* animations=nullptr; int animations_count=0; };
struct SceneCollision {int x,y,width,height; const char* side;};
struct Scenes {const char* scene_type="Platformer"; const SceneCollision* collisions=nullptr; int collisions_count=0,scene_width=256,scene_height=256;};
struct Settings {int move_speed=1;};
Settings settings; const Settings* get_settings(){return &settings;}
struct InputManager {std::set<std::string> down,edge; static InputManager& instance(){static InputManager input;return input;} bool held(const char* key){return down.count(key);} bool pressed(const char* key){return edge.count(key);} };
struct Tiles {int graphics_count()const{return 8;}};
struct Sprite {bool flipped=false;int frame=0;void set_tiles(Tiles,int value){frame=value;} void set_horizontal_flip(bool value){flipped=value;} void set_position(int,int){} };
${fs.readFileSync("tools/butano/template/include/actor_motion_physics.h", "utf8").replace('#include "resource_types.h"', '').replace('#include "player_physics.h"', '')}
class GraphicsManager { public:
  static GraphicsManager& instance(){static GraphicsManager manager;return manager;}
  PlayerPhysics player_physics,actor_physics[16];
  actor_motion::State actor_physics_state[16];
  bool actor_physics_enabled[16]{};
  int actor_count=0,actor_slots[16]{},actor_world_x[16]{},actor_world_y[16]{},actor_direction_override[16]{};
  std::string actor_ids[16];
  bool apply_script_actor_state(const char*,const actor_motion::State&,actor_motion::Action);
  void update_actor_physics(); bool remove_actor(const char*);
  int player_slot=0,sprite_count=1,player_world_x=40,player_world_y=50,camera_x=0,camera_y=0,player_vertical_velocity_q8=0,player_vertical_remainder_q8=0,player_diagonal_remainder_q16=0;
  bool player_grounded=false,player_climbing=false,player_drop_through_active=false;
  int player_ignored_platform_index=-1;
  std::string player_direction="right";
  const Scenes* currentScene=nullptr; const Sprites* sprite_resources[3]{};
  std::optional<Sprite> sprites[3]{Sprite{}}; std::optional<Tiles> sprite_tiles_items[3]{Tiles{}};
  const SpriteAnimationDefinition* sprite_animations[3]{}; int sprite_animation_frames[3]{},sprite_animation_updates[3]{};
  int sprite_animation_speeds[3]{8};
  int sprite_animation_modes[3]{},sprite_composite_part_index[3]{};bool sprite_animation_reverse[3]{};
  bool sprite_script_motion[3]{}; int sprite_script_climb_direction[3]{};
  const char* sprite_main_states[3]{};
  void update_sprite_effects(){} void update_tile_animations(){} void update_sprites();
  void update_emote_animations(){} int sprite_group_parts(int)const{return 1;}
  void set_sprite_group_position(int,int,int){}
  bool stop_physics(const StopPhysicsEventData&); bool configure_movement(const MovementEventData&); bool set_physics_setting(const PhysicsSettingEventData&) { return false; } bool apply_vertical_impulse(const VerticalImpulseEventData&);
  bool player_on_ladder(int,int)const; void set_player_animation(bool,const char* requested_type=nullptr);void move_player_from_input();
};
bool GraphicsManager::player_on_ladder(int,int)const{return false;}
void GraphicsManager::set_player_animation(bool,const char*){}
${method('void GraphicsManager::move_player_from_input(')}
int main(){GraphicsManager manager;Scenes scene;Sprites sprite;auto&input=InputManager::instance();
 scene.scene_type="Adventure";scene.scene_width=scene.scene_height=10000;manager.currentScene=&scene;manager.sprite_resources[0]=&sprite;
 manager.player_physics.config.allow_diagonal=true;
 for(int speed:{1,2,4}) for(int sx:{-1,1}) for(int sy:{-1,1}) {
  settings.move_speed=speed;manager.player_world_x=manager.player_world_y=5000;manager.player_diagonal_remainder_q16=0;
  input.down={sx<0?"move_left":"move_right",sy<0?"move_up":"move_down"};
  for(int frame=0;frame<1000;++frame)manager.move_player_from_input();
  const int displacement=(1000*speed*46341)/65536;
  assert(manager.player_world_x==5000+sx*displacement);assert(manager.player_world_y==5000+sy*displacement);
 }
 input.down={"move_right"};manager.player_world_x=100;for(int frame=0;frame<10;++frame)manager.move_player_from_input();assert(manager.player_world_x==140);
 manager.player_physics.config.allow_diagonal=false;manager.player_world_y=100;input.down={"move_right","move_down"};manager.move_player_from_input();assert(manager.player_world_y==100);
 std::cout<<"Default player diagonal movement passed: normalized vector, all four directions, speeds 1/2/4, fractional accumulation, cardinal speed and disabled diagonals.";
}
`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-diagonal-'));
try {
 const file=path.join(temp,'test.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}