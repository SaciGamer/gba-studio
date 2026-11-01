import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawnSync}from'node:child_process';
const source=fs.readFileSync('tools/butano/template/src/graphics_manager.cpp','utf8').replaceAll('\r\n','\n');
const method=signature=>{const start=source.indexOf(signature);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}\n',start)+2);};
const fitStart=source.indexOf('    bool animation_frames_fit('),fit=source.slice(fitStart,source.indexOf('\n    }',fitStart)+6);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-actor-state-'));
try{
const cpp=`#include <cassert>\n#include <iostream>\n#include <string>\n#include <optional>\n#include "actor_motion_physics.h"
 namespace bn{template<int N>using string=std::string;}
 #define BN_LOG(...) ((void)0)
 struct Tiles{int graphics_count()const{return 16;}};
 struct Sprite{int frame=-1;bool flipped=false;void set_tiles(Tiles,int next){frame=next;}void set_horizontal_flip(bool next){flipped=next;}bool horizontal_flip()const{return flipped;}};
 class GraphicsManager{public:
 int player_slot=0,sprite_count=2,actor_count=1;std::string actor_ids[1]{"npc"};int actor_slots[1]{1};std::string player_direction="right";
 std::optional<Sprite>sprites[2]{Sprite{},Sprite{}};std::optional<Tiles>sprite_tiles_items[2]{Tiles{},Tiles{}};const Sprites*sprite_resources[2]{};
 const SpriteAnimationDefinition*sprite_animations[2]{};const char*sprite_main_states[2]{};int sprite_animation_frames[2]{},sprite_animation_updates[2]{};
 int sprite_animation_modes[2]{};bool sprite_animation_reverse[2]{};int sprite_group_parts(int)const{return 1;}
 bool set_actor_state(const char*,const char*);void set_player_animation(bool,const char*requested_type=nullptr);
 };
 ${fit}
 bool animation_frames_fit_composite(const SpriteAnimationDefinition& animation,int graphics_count,int){return animation_frames_fit(animation,graphics_count);}
 ${method('bool GraphicsManager::set_actor_state(')}
 ${method('void GraphicsManager::set_player_animation(')}
 int main(){const int a[]={0},b[]={1},c[]={2},d[]={3},e[]={4},f[]={5};
 SpriteAnimationDefinition clips[]={
 {"a","idle","idle",a,1,false},{"a","moving","movement",b,1,false},
 {"b","idle","idle",c,1,false},{"b","moving","movement",d,1,false},
 {"b","jump","jump",e,1,false},{"b","climb","climb",f,1,false}};
 Sprites resource{};resource.animations=clips;resource.animations_count=6;
 GraphicsManager manager;manager.sprite_resources[0]=manager.sprite_resources[1]=&resource;manager.sprite_animations[0]=manager.sprite_animations[1]=&clips[0];
 assert(manager.set_actor_state("__PLAYER__","b"));assert(manager.sprites[0]->frame==2&&manager.sprite_main_states[0]==clips[2].state_id);
 manager.set_player_animation(true);assert(manager.sprites[0]->frame==3);manager.set_player_animation(false);assert(manager.sprites[0]->frame==2);
 manager.set_player_animation(true,"jump");assert(manager.sprites[0]->frame==4);manager.set_player_animation(true,"climb");assert(manager.sprites[0]->frame==5);
 assert(manager.set_actor_state("npc","b")&&manager.sprites[1]->frame==2);
 assert(!manager.set_actor_state("npc","missing")&&manager.sprites[1]->frame==2);
 assert(!manager.set_actor_state("missing","b"));assert(!manager.set_actor_state("npc",""));
 assert(manager.set_actor_state("__PLAYER__","a"));manager.set_player_animation(true);assert(manager.sprites[0]->frame==1);
 std::cout<<"Actor states: player/NPC selection, persistent idle/movement/jump/climb and invalid states passed.\\n";}
 `;
const file=path.join(temp,'test.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-I','tests/native/support','-I','tests/native/scheduler','-I','tools/butano/template/include',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
