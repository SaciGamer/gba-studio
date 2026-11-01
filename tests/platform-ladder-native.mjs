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
  void update_actor_physics(); bool remove_actor(const char*,bool=false);
  int player_slot=0,sprite_count=1,player_world_x=40,player_world_y=50,camera_x=0,camera_y=0,player_vertical_velocity_q8=0,player_vertical_remainder_q8=0;
  int player_diagonal_remainder_q16=0;
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
  struct Residence {bool enabled=true;int x=0,y=0;bool active=false;};Residence* actor_residence(const char*){return nullptr;}
  const char* actor_interaction_actor_id=nullptr;const void* actor_interaction_script=nullptr;int actor_interaction_count=0;
  const void* actor_definitions[16]{};int actor_initialization[16]{};
  struct EmoteAnimationState {bool occupied=false;std::string actor_id;std::optional<int> sprite;};EmoteAnimationState emote_animations[16];void remove_sprite(int){}
  void update_default_palettes(){}void update_actor_residency(){}
  void update_sprite_effects(){} void update_tile_animations(){} void update_sprites();
  void update_emote_animations(){} int sprite_group_parts(int)const{return 1;}
  void set_sprite_group_position(int,int,int){}
  bool stop_physics(const StopPhysicsEventData&); bool configure_movement(const MovementEventData&); bool set_physics_setting(const PhysicsSettingEventData&); bool apply_vertical_impulse(const VerticalImpulseEventData&);
  bool player_on_ladder(int,int)const; void set_player_animation(bool,const char* requested_type=nullptr);void move_player_from_input();
};
${fit}
bool animation_frames_fit_composite(const SpriteAnimationDefinition& animation,int graphics_count,int){return animation_frames_fit(animation,graphics_count);}
${method('bool GraphicsManager::player_on_ladder(')}
${method('void GraphicsManager::set_player_animation(')}
${method('bool GraphicsManager::stop_physics(')}
${method('bool GraphicsManager::configure_movement(')}
${method('bool GraphicsManager::set_physics_setting(')}
${method('bool GraphicsManager::apply_vertical_impulse(')}
${method('void GraphicsManager::move_player_from_input(')}
${method('bool GraphicsManager::apply_script_actor_state(')}
${method('void GraphicsManager::update_actor_physics(')}
${method('bool GraphicsManager::remove_actor(')}
enum class EventStatus { completed, failed };
class PhysicsEventHandler { public: static EventStatus execute_status(const bn::string<64>&, const void*, const char* = nullptr); };
${physicsHandler}

${method('void GraphicsManager::update_sprites(')}
int main(){
 const int idle[]={0},move[]={1},climb[]={2,3,6},jump[]={4,5};
 SpriteAnimationDefinition animations[]={{"main","idle","idle",idle,1,false},{"main","moving","movement",move,1,false},{"main","climbing","climb",climb,3,false},{"main","jumping","jump",jump,2,false}};
 Sprites player;player.animations=animations;player.animations_count=3;
 SceneCollision ladder{32,16,16,112,"ladder"};Scenes scene;scene.collisions=&ladder;scene.collisions_count=1;
 GraphicsManager manager;manager.currentScene=&scene;manager.sprite_resources[0]=&player;
 auto& input=InputManager::instance();
 // Contact alone never starts climbing, gravity remains active.
 for(int i=0;i<8;i++) manager.move_player_from_input();
 assert(!manager.player_climbing && manager.player_world_y>50);
 manager.player_world_x=80;manager.player_world_y=50;manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;
 input.down={"move_up"};manager.move_player_from_input();assert(!manager.player_climbing && manager.player_world_y>=50);
 manager.player_world_x=40;manager.player_world_y=50;
 manager.move_player_from_input();assert(manager.player_climbing && manager.player_world_y==49 && manager.sprite_animations[0]==&animations[2]);
 manager.update_sprites();assert(manager.sprite_animation_frames[0]==1 && manager.sprites[0]->frame==3);
 input.down.clear();for(int i=0;i<20;i++){manager.move_player_from_input();manager.update_sprites();}
 assert(manager.player_world_y==49 && manager.player_climbing && manager.sprite_animations[0]==&animations[2] && manager.sprites[0]->frame==3);
 input.down={"move_right"};manager.move_player_from_input();manager.update_sprites();
 assert(manager.player_climbing && manager.sprite_animations[0]==&animations[2] && manager.sprite_animation_frames[0]==1 && manager.sprites[0]->frame==3);
 input.down={"move_down"};manager.move_player_from_input();assert(manager.player_world_y==50 && manager.sprite_animations[0]==&animations[2]);
 manager.update_sprites();assert(manager.sprite_animation_frames[0]==0 && manager.sprites[0]->frame==2);
 manager.update_sprites();assert(manager.sprite_animation_frames[0]==2 && manager.sprites[0]->frame==6);
 input.down={"move_up"};manager.update_sprites();assert(manager.sprite_animation_frames[0]==0 && manager.sprites[0]->frame==2);
 input.down.clear();input.edge={"jump"};manager.move_player_from_input();assert(!manager.player_climbing && manager.player_world_y<50 && manager.player_vertical_velocity_q8<0);
 input.edge.clear();manager.player_world_y=50;input.down={"move_up"};manager.move_player_from_input();assert(manager.player_climbing);
 input.down={"move_right"};for(int i=0;i<20;i++) manager.move_player_from_input();assert(!manager.player_climbing);
 int before=manager.player_world_y;input.down.clear();for(int i=0;i<8;i++) manager.move_player_from_input();assert(manager.player_world_y>before);
 manager.player_world_x=40;manager.player_world_y=50;scene.scene_type="Top Down";input.down={"move_up"};manager.move_player_from_input();assert(!manager.player_climbing && manager.player_world_y==49);
 scene.scene_type="Platformer";player.animations_count=2;manager.move_player_from_input();assert(manager.player_climbing && manager.sprite_animations[0]==&animations[0]);
 // Standing on the ladder top is supported without activating climbing.
 manager.player_climbing=false;manager.player_world_y=12;manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;input.down.clear();
 for(int i=0;i<20;i++){manager.move_player_from_input();}assert(manager.player_world_y==12 && manager.player_grounded && !manager.player_climbing);
 input.down={"move_down"};manager.move_player_from_input();assert(manager.player_world_y==13 && manager.player_climbing);
 input.down={"move_up"};manager.move_player_from_input();assert(manager.player_world_y==12 && !manager.player_climbing);
 input.down.clear();manager.move_player_from_input();assert(manager.player_world_y==12 && manager.player_grounded);
 // Down releases a top-only platform, ignores only that platform while the
 // collision body passes through it, and leaves vertical travel to gravity.
 SceneCollision drop_platforms[]={{0,100,80,4,"top"},{0,128,80,4,"top"}};
 scene.collisions=drop_platforms;scene.collisions_count=2;player.animations=animations;player.animations_count=4;
 const int drop_idle[]={0,7};animations[0].frames=drop_idle;animations[0].frames_count=2;
 manager.player_world_x=40;manager.player_world_y=96;manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;
 manager.player_grounded=false;manager.player_climbing=false;manager.player_ignored_platform_index=-1;manager.player_drop_through_active=false;
 manager.sprite_animations[0]=&animations[0];manager.sprite_animation_frames[0]=0;manager.sprite_animation_updates[0]=0;
 input.down.clear();input.edge={"move_down"};manager.move_player_from_input();input.edge.clear();
 assert(!manager.player_grounded && manager.player_drop_through_active && manager.player_ignored_platform_index==0);
 assert(manager.player_vertical_velocity_q8>0 && manager.player_world_y==96 && manager.sprite_animations[0]==&animations[0]);
 manager.update_sprites();assert(manager.sprite_animation_frames[0]==0 && manager.sprite_animation_updates[0]==0 && manager.sprites[0]->frame==0);
 for(int i=0;i<100 && !manager.player_grounded;i++){manager.move_player_from_input();manager.update_sprites();}
 assert(manager.player_grounded && manager.player_world_y==124 && !manager.player_drop_through_active && manager.player_ignored_platform_index==-1);
 input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 bool jumped_through_platform=false;
 for(int i=0;i<100 && !manager.player_grounded;i++) { manager.move_player_from_input(); jumped_through_platform |= manager.player_world_y<96; }
 assert(jumped_through_platform && manager.player_world_y==96 && manager.player_grounded);
 // The Platformer Player model uses running/idle, rather than moving-right.
 animations[1].animation_id="running";animations[1].flip_right_to_create_left_frames=true;animations[0].flip_right_to_create_left_frames=true;
 manager.player_direction="left";manager.set_player_animation(true);assert(manager.sprites[0]->flipped && manager.sprite_animations[0]==&animations[1]);
 manager.player_direction="right";manager.set_player_animation(true);assert(!manager.sprites[0]->flipped);
 manager.player_direction="left";manager.set_player_animation(false);assert(manager.sprites[0]->flipped);
 animations[1].flip_right_to_create_left_frames=false;manager.set_player_animation(true);assert(!manager.sprites[0]->flipped);
 // Stationary jumping persists until actual ground contact, even at apex.
 player.animations_count=4;scene.collisions=nullptr;scene.collisions_count=0;
 manager.player_world_x=100;manager.player_world_y=252;manager.player_climbing=false;
 input.edge={"jump"};input.down.clear();manager.move_player_from_input();input.edge.clear();
 assert(manager.sprite_animations[0]==&animations[3] && !manager.player_grounded);
 bool ascent=false,descent=false,apex=false;
 for(int i=0;i<80 && !manager.player_grounded;i++){
  int previous=manager.player_world_y;input.down.clear();
  manager.move_player_from_input();
  if(!manager.player_grounded){assert(manager.sprite_animations[0]==&animations[3]);ascent|=manager.player_world_y<previous;descent|=manager.player_world_y>previous;apex|=manager.player_world_y==previous;}
 }
 assert(ascent && descent && apex && manager.player_grounded && manager.sprite_animations[0]!=&animations[3]);
 // Falling from a ledge also remains jumping without a jump button press.
 manager.player_world_y=180;input.down.clear();manager.move_player_from_input();assert(manager.sprite_animations[0]==&animations[3]);
 input.down={"move_right"};manager.move_player_from_input();assert(manager.sprite_animations[0]==&animations[1]);
 // A horizontal input blocked by a wall during a platform jump must not
 // switch between the movement and jump clips.
 SceneCollision wall_jump_collisions[]={{0,204,256,4,"top"},{104,160,8,44,"solid"}};
 scene.collisions=wall_jump_collisions;scene.collisions_count=2;scene.scene_height=300;
 manager.player_world_x=100;manager.player_world_y=200;manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;manager.player_grounded=false;
 input.down={"move_right"};input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(manager.player_world_x==100 && manager.sprite_animations[0]==&animations[3]);
 for(int frame=0;frame<4;frame++){manager.move_player_from_input();assert(manager.player_world_x==100 && manager.sprite_animations[0]==&animations[3]);}
 // Configurable player physics runs through the production input/collision path.
 scene.collisions=nullptr;scene.collisions_count=0;scene.scene_height=512;
 manager.player_world_x=100;manager.player_world_y=508;
 manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;
 manager.player_climbing=false; input.down.clear();input.edge.clear();
 MovementEventData movement{"__PLAYER__",false,true,64,1280,1536,1};
 assert(manager.configure_movement(movement));
 input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(manager.player_vertical_velocity_q8==-1216 && manager.player_physics.air_jumps_used==0);
 for(int i=0;i<6;i++)manager.move_player_from_input();
 input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(manager.player_vertical_velocity_q8==-1216 && manager.player_physics.air_jumps_used==1);
 input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(manager.player_vertical_velocity_q8==-1152 && manager.player_physics.air_jumps_used==1);
 // Reapplying configuration must not refill a consumed jump.
 manager.configure_movement(movement);input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(manager.player_vertical_velocity_q8==-1088);
 for(int i=0;i<160 && !manager.player_grounded;i++)manager.move_player_from_input();
 assert(manager.player_grounded && manager.player_physics.air_jumps_used==0);
 // Unlimited jumps, including after walking off a ledge.
 movement.air_jumps=-1;manager.configure_movement(movement);manager.player_world_y=200;
 for(int i=0;i<20;i++){input.edge={"jump"};manager.move_player_from_input();assert(manager.player_vertical_velocity_q8==-1216);}
 input.edge.clear();
 // An event impulse starts from the floor without the support test swallowing it.
 manager.player_world_y=508;manager.player_vertical_velocity_q8=0;
 assert(manager.apply_vertical_impulse({"__PLAYER__",-768,false}));manager.move_player_from_input();
 assert(manager.player_world_y<508 && manager.player_vertical_velocity_q8==-704);
 assert(manager.apply_vertical_impulse({"__PLAYER__",-256,true}));assert(manager.player_vertical_velocity_q8==-960);
 assert(manager.apply_vertical_impulse({"__PLAYER__",512,false}));assert(manager.player_vertical_velocity_q8==512);
 movement.gravity_q8=0;movement.max_fall_speed_q8=1024;manager.configure_movement(movement);
 manager.player_world_y=200;manager.apply_vertical_impulse({"__PLAYER__",-256,false});
 int floating_y=manager.player_world_y;for(int i=0;i<5;i++)manager.move_player_from_input();
 assert(manager.player_world_y==floating_y-5 && manager.player_vertical_velocity_q8==-256);
 movement.gravity_q8=256;movement.max_fall_speed_q8=512;manager.configure_movement(movement);
 manager.apply_vertical_impulse({"__PLAYER__",256,false});for(int i=0;i<5;i++)manager.move_player_from_input();
 assert(manager.player_vertical_velocity_q8==512);
 // Adventure keeps the Settings speed; physics configuration only controls diagonals.
 scene.scene_type="Adventure";movement.allow_diagonal=false;manager.configure_movement(movement);
 manager.player_world_x=100;manager.player_world_y=100;input.down={"move_right","move_down"};
 manager.move_player_from_input();assert(manager.player_world_x==101 && manager.player_world_y==100);
 assert(!manager.apply_vertical_impulse({"__PLAYER__",-256,false}));
 movement.allow_diagonal=true;manager.configure_movement(movement);
 manager.move_player_from_input();assert(manager.player_world_x==101 && manager.player_world_y==100);
 movement.reset=true;manager.configure_movement(movement);
 assert(manager.player_physics.config.gravity_q8==64 && manager.player_physics.config.jump_speed_q8==1280 && manager.player_physics.config.air_jumps==0);
 manager.move_player_from_input();assert(manager.player_world_x==102 && manager.player_world_y==101);
 // Subpixel jumps keep ascending velocity while the anchor still touches the floor.
 scene.scene_type="Platformer";scene.collisions=nullptr;scene.collisions_count=0;
 movement={"__PLAYER__",false,true,0,64,1536,0};manager.configure_movement(movement);
 manager.player_world_y=508;manager.player_vertical_velocity_q8=0;manager.player_vertical_remainder_q8=0;
 input.down.clear();input.edge={"jump"};manager.move_player_from_input();input.edge.clear();
 assert(!manager.player_grounded && manager.player_vertical_velocity_q8==-64);
 for(int i=0;i<3;i++){manager.move_player_from_input();}
 assert(manager.player_world_y==507 && manager.player_vertical_velocity_q8==-64);
 // High configurable speeds and impulses must respect one-pixel collisions.
 scene.scene_type="Platformer";scene.scene_height=512;
 movement={"__PLAYER__",false,true,0,1280,4096,0};manager.configure_movement(movement);settings.move_speed=16;
 SceneCollision thin_wall{110,0,1,512,"solid"};scene.collisions=&thin_wall;scene.collisions_count=1;
 manager.player_world_x=100;manager.player_world_y=200;manager.player_vertical_velocity_q8=0;
 input.down={"move_right"};manager.move_player_from_input();assert(manager.player_world_x==106);settings.move_speed=1;
 SceneCollision thin_floor{0,210,256,1,"top"};scene.collisions=&thin_floor;
 manager.player_world_x=100;manager.player_world_y=200;input.down.clear();
 manager.apply_vertical_impulse({"__PLAYER__",4096,false});manager.move_player_from_input();
 assert(manager.player_world_y==206 && manager.player_grounded && manager.player_vertical_velocity_q8==0);
 SceneCollision thin_ceiling{0,190,256,1,"solid"};scene.collisions=&thin_ceiling;
 manager.player_world_y=200;manager.apply_vertical_impulse({"__PLAYER__",-4096,false});manager.move_player_from_input();
 assert(manager.player_world_y==195 && !manager.player_grounded && manager.player_vertical_velocity_q8==0);
 // A forced impulse detaches from an active ladder even with climb input held.
 scene.collisions=&ladder;scene.collisions_count=1;manager.player_world_x=40;manager.player_world_y=50;manager.player_climbing=true;
 input.down={"move_up"};manager.apply_vertical_impulse({"__PLAYER__",-512,false});manager.move_player_from_input();
 assert(!manager.player_climbing && manager.player_world_y==48);
 // Other actors opt into independent gravity; impulses can enable physics directly.
 scene.scene_type="Platformer";scene.collisions=nullptr;scene.collisions_count=0;
 manager.actor_count=2;manager.sprite_count=3;manager.actor_ids[0]="a";manager.actor_ids[1]="b";
 manager.actor_slots[0]=1;manager.actor_slots[1]=2;manager.sprites[1]=Sprite{};manager.sprites[2]=Sprite{};
 manager.sprite_resources[1]=&player;manager.sprite_resources[2]=&player;
 manager.actor_world_x[0]=100;manager.actor_world_y[0]=100;manager.actor_world_x[1]=140;manager.actor_world_y[1]=100;
 MovementEventData actorConfig{"a",false,true,128,1280,512,0};
 assert(manager.configure_movement(actorConfig));manager.update_actor_physics();manager.update_actor_physics();
 assert(manager.actor_world_y[0]>100 && manager.actor_world_y[1]==100);
 assert(manager.apply_vertical_impulse({"b",-512,false}));manager.update_actor_physics();
 assert(manager.actor_world_y[1]<100 && manager.actor_physics_enabled[1]);
 assert(manager.actor_physics_state[0].velocity_q8!=manager.actor_physics_state[1].velocity_q8);
 actorConfig.reset=true;assert(manager.configure_movement(actorConfig));
 int stoppedY=manager.actor_world_y[0];for(int i=0;i<4;i++){manager.update_actor_physics();}
 assert(manager.actor_world_y[0]==stoppedY && !manager.actor_physics_enabled[0]);
 assert(!manager.configure_movement({"missing",false,true,64,1280,1536,0}));
 assert(!manager.apply_vertical_impulse({"missing",-512,false}));
 // Removing one actor preserves the remaining actor's independent physics state.
 int bVelocity=manager.actor_physics_state[1].velocity_q8;
 assert(manager.remove_actor("a"));
 assert(manager.actor_count==1 && manager.actor_ids[0]=="b" && manager.actor_physics_enabled[0]);
 assert(manager.actor_physics_state[0].velocity_q8==bVelocity);

 // Live configuration takes effect midair while Stop Physics clears momentum only.
 manager.player_world_x=160;manager.player_world_y=100;manager.player_vertical_remainder_q8=0;
 manager.player_climbing=false;input.down.clear();input.edge.clear();
 movement={"__PLAYER__",false,true,0,1536,2048,1};manager.configure_movement(movement);
 manager.apply_vertical_impulse({"__PLAYER__",-1280,false});manager.move_player_from_input();
 assert(manager.player_vertical_velocity_q8==-1280);
 movement.jump_speed_q8=768;manager.configure_movement(movement);manager.move_player_from_input();
 assert(manager.player_vertical_velocity_q8==-1280 && manager.player_physics.config.jump_speed_q8==768);
 int stopY=manager.player_world_y,stopX=manager.player_world_x;
 assert(manager.stop_physics({"__PLAYER__"}));input.down={"move_right"};manager.move_player_from_input();
 assert(manager.player_world_y==stopY && manager.player_world_x==stopX+1 && manager.player_vertical_velocity_q8==0);
 movement.gravity_q8=128;manager.configure_movement(movement);manager.stop_physics({"__PLAYER__"});
 manager.move_player_from_input();manager.move_player_from_input();
 assert(manager.player_world_y>stopY && manager.player_physics.config.gravity_q8==128);
 assert(manager.stop_physics({"b"}) && manager.actor_physics_state[0].velocity_q8==0);
 assert(!manager.stop_physics({"missing"}));
 // Production event handler returns real completion/failure instead of stalling.
 auto& singleton=GraphicsManager::instance();
 singleton.currentScene=&scene;singleton.sprite_resources[0]=&player;
 assert(PhysicsEventHandler::execute_status("EVENT_CONFIGURE_MOVEMENT",&movement)==EventStatus::completed);
 assert(PhysicsEventHandler::execute_status("EVENT_CONFIGURE_MOVEMENT",nullptr)==EventStatus::failed);
 VerticalImpulseEventData impulse{"__PLAYER__",-1280,false};
 assert(PhysicsEventHandler::execute_status("EVENT_APPLY_VERTICAL_IMPULSE",&impulse)==EventStatus::completed);
 assert(singleton.player_vertical_velocity_q8==-1280);
 singleton.actor_count=1;singleton.actor_ids[0]="selfActor";singleton.actor_slots[0]=1;
 singleton.sprite_count=2;singleton.sprites[1]=Sprite{};singleton.sprite_resources[1]=&player;
 MovementEventData selfConfig{"__SELF__",false,true,32,1280,512,0};
 assert(PhysicsEventHandler::execute_status("EVENT_CONFIGURE_MOVEMENT",&selfConfig,"selfActor")==EventStatus::completed);
 assert(singleton.actor_physics[0].config.gravity_q8==32);
 VerticalImpulseEventData selfImpulse{"__SELF__",-768,false};
 assert(PhysicsEventHandler::execute_status("EVENT_APPLY_VERTICAL_IMPULSE",&selfImpulse,"selfActor")==EventStatus::completed);
 assert(singleton.actor_physics_state[0].velocity_q8==-768 && singleton.player_vertical_velocity_q8==-1280);
 StopPhysicsEventData stopSelf{"__SELF__"};
 assert(PhysicsEventHandler::execute_status("EVENT_STOP_PHYSICS",&stopSelf,"selfActor")==EventStatus::completed);
 assert(singleton.actor_physics_state[0].velocity_q8==0 && singleton.actor_physics[0].config.gravity_q8==32);

 assert(PhysicsEventHandler::execute_status("EVENT_APPLY_VERTICAL_IMPULSE",&selfImpulse)==EventStatus::failed);

 scene.scene_type="Adventure";
 assert(PhysicsEventHandler::execute_status("EVENT_APPLY_VERTICAL_IMPULSE",&impulse)==EventStatus::failed);
 // Independent setters preserve every unrelated parameter and the jump budget.
 auto before_config = singleton.player_physics.config;
 singleton.player_physics.air_jumps_used=3;
 singleton.player_vertical_velocity_q8=-700;
 PhysicsSettingEventData gravity_setting{"__PLAYER__",PhysicsSetting::gravity,128};
 assert(PhysicsEventHandler::execute_status("EVENT_PHYSICS_SET_GRAVITY",&gravity_setting)==EventStatus::completed);
 assert(singleton.player_physics.config.gravity_q8==128);
 assert(singleton.player_physics.config.jump_speed_q8==before_config.jump_speed_q8);
 assert(singleton.player_physics.config.max_fall_speed_q8==before_config.max_fall_speed_q8);
 assert(singleton.player_physics.air_jumps_used==3 && singleton.player_vertical_velocity_q8==-700);
 assert(singleton.set_physics_setting({"__PLAYER__",PhysicsSetting::jump_speed,2048}));
 assert(singleton.set_physics_setting({"__PLAYER__",PhysicsSetting::max_fall_speed,1024}));
 assert(singleton.set_physics_setting({"__PLAYER__",PhysicsSetting::air_jumps,-1}));
 assert(singleton.set_physics_setting({"__PLAYER__",PhysicsSetting::allow_diagonal,0}));
 assert(singleton.player_physics.config.gravity_q8==128 && singleton.player_physics.config.jump_speed_q8==2048);
 assert(singleton.player_physics.config.max_fall_speed_q8==1024 && singleton.player_physics.config.air_jumps==-1);
 assert(!singleton.player_physics.config.allow_diagonal && singleton.player_physics.air_jumps_used==3);
 assert(!singleton.set_physics_setting({"missing",PhysicsSetting::gravity,128}));
 assert(!singleton.set_physics_setting({"__PLAYER__",static_cast<PhysicsSetting>(99),128}));
 MovementEventData reset_setting{"__PLAYER__",true,true,64,1280,1536,0};
 assert(PhysicsEventHandler::execute_status("EVENT_PHYSICS_RESET",&reset_setting)==EventStatus::completed);
 assert(singleton.player_physics.config.gravity_q8==64 && singleton.player_physics.config.air_jumps==0);
 assert(singleton.player_physics.config.allow_diagonal && singleton.player_physics.air_jumps_used==0);
 singleton.actor_count=1;singleton.actor_ids[0]="c2d15146-f824-4401-8d4a-08e92e2ef6ab";singleton.actor_slots[0]=1;
 singleton.sprite_count=2;singleton.sprites[1]=Sprite{};singleton.sprite_resources[1]=&player;
 singleton.actor_physics_state[0].velocity_q8=-300;
 PhysicsSettingEventData self_gravity{"__SELF__",PhysicsSetting::gravity,256};
 assert(PhysicsEventHandler::execute_status("EVENT_PHYSICS_SET_GRAVITY",&self_gravity,"c2d15146-f824-4401-8d4a-08e92e2ef6ab")==EventStatus::completed);
 assert(singleton.actor_physics_enabled[0] && singleton.actor_physics[0].config.gravity_q8==256);
 assert(singleton.actor_physics_state[0].velocity_q8==-300);
 assert(singleton.set_physics_setting({"c2d15146-f824-4401-8d4a-08e92e2ef6ab",PhysicsSetting::max_fall_speed,512}));
 assert(singleton.actor_physics[0].config.gravity_q8==256 && singleton.actor_physics[0].config.max_fall_speed_q8==512);
 assert(!singleton.set_physics_setting({"c2d15146-f824-4401-8d4a-08e92e2ef6ab",PhysicsSetting::jump_speed,512}));
 MovementEventData actor_reset{"c2d15146-f824-4401-8d4a-08e92e2ef6ab",true,true,64,1280,1536,0};
 assert(PhysicsEventHandler::execute_status("EVENT_PHYSICS_RESET",&actor_reset)==EventStatus::completed);
 assert(!singleton.actor_physics_enabled[0] && singleton.actor_physics_state[0].velocity_q8==0);
 singleton.currentScene=nullptr;
 assert(PhysicsEventHandler::execute_status("EVENT_CONFIGURE_MOVEMENT",&movement)==EventStatus::failed);
 manager.currentScene=nullptr;assert(!manager.configure_movement(movement));
 std::cout<<"Platform player: reverse climbing, frozen climbing frames, stationary jumping, landing, ladders, configurable physics, air jumps, impulses and thin collision sweeps passed.\\n";
}
`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-ladder-'));
try {
 const file=path.join(temp,'test.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
