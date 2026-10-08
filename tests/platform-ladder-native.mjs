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
const cpp = `
#include <cassert>
#include <algorithm>
#include <optional>
#include <string>
#include <set>
#include <iostream>
namespace bn { template<int N> using string=std::string; using std::min; using std::max; using std::clamp; }
struct SpriteAnimationDefinition { const char* state_id; const char* state_type; const char* animation_id; const char* animation_type; const int* frames; int frames_count; bool flip_right_to_create_left_frames; };
struct Sprites { int frame_width=16,frame_height=16,canvas_origin_x=0,canvas_origin_y=0,collision_x=-4,collision_y=-4,collision_width=8,collision_height=8; const SpriteAnimationDefinition* animations=nullptr; int animations_count=0; };
struct SceneCollision {const char* id; int x,y,width,height; const char* side;};
struct Scenes {const char* scene_type="Platformer"; const SceneCollision* collisions=nullptr; int collisions_count=0,scene_width=256,scene_height=256;};
struct Settings {int move_speed=1;};
const Settings* get_settings(){static Settings settings;return &settings;}
struct InputManager {std::set<std::string> down,edge; static InputManager& instance(){static InputManager input;return input;} bool held(const char* key){return down.count(key);} bool pressed(const char* key){return edge.count(key);} };
struct Tiles {int graphics_count()const{return 8;}};
struct Sprite {bool flipped=false;int frame=0;void set_tiles(Tiles,int value){frame=value;} void set_horizontal_flip(bool value){flipped=value;} void set_position(int,int){} };
class GraphicsManager { public:
  int player_slot=0,sprite_count=1,player_world_x=40,player_world_y=50,camera_x=0,camera_y=0,player_vertical_velocity_q8=0,player_vertical_remainder_q8=0;
  bool player_grounded=false,player_climbing=false;
  std::string player_direction="right";
  const Scenes* currentScene=nullptr; const Sprites* sprite_resources[1]{};
  std::optional<Sprite> sprites[1]{Sprite{}}; std::optional<Tiles> sprite_tiles_items[1]{Tiles{}};
  const SpriteAnimationDefinition* sprite_animations[1]{}; int sprite_animation_frames[1]{},sprite_animation_updates[1]{};
  int sprite_animation_speeds[1]{8};
  bool sprite_script_motion[1]{}; int sprite_script_climb_direction[1]{};
  const char* sprite_main_states[1]{};
  void update_sprite_effects(){} void update_tile_animations(){} void update_sprites();
  bool player_on_ladder(int,int)const; void set_player_animation(bool,const char* requested_type=nullptr);void move_player_from_input();
};
${fit}
${method('bool GraphicsManager::player_on_ladder(')}
${method('void GraphicsManager::set_player_animation(')}
${method('void GraphicsManager::move_player_from_input(')}
${method('void GraphicsManager::update_sprites(')}
int main(){
 const int idle[]={0},move[]={1},climb[]={2,3,6},jump[]={4,5};
 SpriteAnimationDefinition animations[]={{"main","fixed","idle","idle",idle,1,false},{"main","fixed","moving","movement",move,1,false},{"main","fixed","climbing","climb",climb,3,false},{"main","fixed","jumping","jump",jump,2,false}};
 Sprites player;player.animations=animations;player.animations_count=3;
 SceneCollision ladder{"ladder",32,16,16,112,"ladder"};Scenes scene;scene.collisions=&ladder;scene.collisions_count=1;
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
 // The Platformer Player model uses running/idle, rather than moving-right.
 animations[1].animation_id="running";animations[1].flip_right_to_create_left_frames=true;animations[0].flip_right_to_create_left_frames=true;
 manager.player_direction="left";manager.set_player_animation(true);assert(manager.sprites[0]->flipped && manager.sprite_animations[0]==&animations[1]);
 manager.player_direction="right";manager.set_player_animation(true);assert(!manager.sprites[0]->flipped);
 manager.player_direction="left";manager.set_player_animation(false);assert(manager.sprites[0]->flipped);
 animations[1].flip_right_to_create_left_frames=false;manager.set_player_animation(true);assert(!manager.sprites[0]->flipped);
 // Stationary jumping persists until actual ground contact, even at apex.
 player.animations_count=4;scene.collisions=nullptr;scene.collisions_count=0;
 manager.player_world_x=100;manager.player_world_y=240;manager.player_climbing=false;
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
 std::cout<<"Platform player: reverse climbing, frozen climbing frames, stationary jumping, landing and ladder regressions passed.\\n";
}
`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-ladder-'));
try {
 const file=path.join(temp,'test.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
