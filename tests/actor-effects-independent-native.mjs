import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const method = signature => {
 const start = source.indexOf(signature); assert.ok(start >= 0);
 return source.slice(start, source.indexOf('\n}\n', start) + 2);
};
const state = source.slice(source.indexOf('    struct SpriteEffectTween'), source.indexOf('    struct ActorVisualState'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-independent-effects-'));
try {
 const cpp = `#include <algorithm>
#include <optional>
#include <string>
#include <cstring>
#include <cassert>
#define GBA_STUDIO_MAX_ACTORS 3
#define BN_DATA_EWRAM_BSS
namespace bn {
 using fixed = double; using std::min; using std::clamp;
 struct color { int r,g,b; color(int a,int c,int d):r(a),g(c),b(d){} };
 struct palette { double strength=0; color tint{0,0,0}; double fade_intensity()const{return strength;}
   void set_fade(color c,double v){tint=c;strength=v;} };
 struct sprite_palette_ptr { bn::palette& ref; sprite_palette_ptr(bn::palette& p):ref(p){} void set_fade(color c,double v){ref.set_fade(c,v);} };
 namespace blending { double fade_alpha(){return 0;} void set_transparency_alpha(double){} }
 struct sprite_ptr {
   double rotation=0,scale=1; bool visible=false; bn::palette pal;
   void set_rotation_angle_safe(double v){rotation=v<0?v+360:v;}
   void set_scale(double v){scale=v;}
   double rotation_angle()const{return rotation;} double horizontal_scale()const{return scale;}
   bn::palette& palette(){return pal;}
 };
}
namespace actor_motion { bool same_text(const char* a,const char* b){return a&&b&&!strcmp(a,b);} }
${state}
bool actor_opacity_control=false; int actor_opacity_percent=100;
struct GraphicsManager {
 int actor_count=2,player_slot=0,sprite_count=3,actor_slots[2]={1,2};
 std::string actor_ids[2]={"actor","other"};
 std::optional<bn::sprite_ptr> sprites[3]={bn::sprite_ptr{},bn::sprite_ptr{},bn::sprite_ptr{}};
 bool set_actor_transform(const char*,int,int,int,int=0xffffff);
 bool set_actor_effect(const char*,int,int,bool,const char*,int,int);
 bool set_actor_visible(const char* id,bool visible){int slot=actor_motion::same_text(id,"__PLAYER__")?0:1;sprites[slot]->visible=visible;return true;}
 void update_sprite_effects();
};
${method('bool GraphicsManager::set_actor_transform(')}
${method('bool GraphicsManager::set_actor_effect(')}
${method('void GraphicsManager::update_sprite_effects(')}
int main(){
 GraphicsManager g;
 assert(g.set_actor_transform("actor",0,90,4));
 assert(g.set_actor_transform("actor",1,200,2));
 assert(g.set_actor_transform("actor",2,80,8,0xff0000));
 g.update_sprite_effects();
 assert(g.sprites[1]->rotation_angle()==22 && g.sprites[1]->horizontal_scale()==1.5);
 assert(g.sprites[1]->palette().fade_intensity()==0.1 && !g.sprites[1]->visible);
 g.update_sprite_effects();assert(g.sprites[1]->horizontal_scale()==2);
 // Immediate replacement of rotation leaves scale and the active tint intact.
 assert(g.set_actor_transform("actor",0,-90,1));
 for(int i=0;i<6;++i)g.update_sprite_effects();
 assert(g.sprites[1]->rotation_angle()==270 && g.sprites[1]->horizontal_scale()==2);
 assert(g.sprites[1]->palette().fade_intensity()==0.8 && g.sprites[1]->palette().tint.r==31);
 assert(g.sprites[2]->rotation_angle()==0 && g.sprites[2]->horizontal_scale()==1);
 // Signed start after Butano normalizes a negative rotation to 270 degrees.
 assert(g.set_actor_transform("actor",0,0,2));g.update_sprite_effects();
 assert(g.sprites[1]->rotation_angle()==315);g.update_sprite_effects();assert(g.sprites[1]->rotation_angle()==0);
 assert(g.set_actor_transform("__PLAYER__",1,50,2));
 assert(g.set_actor_transform("other",0,180,2));g.update_sprite_effects();g.update_sprite_effects();
 assert(g.sprites[0]->horizontal_scale()==0.5 && g.sprites[2]->rotation_angle()==180);
 assert(!g.set_actor_transform("missing",0,0,1));assert(!g.set_actor_transform(nullptr,0,0,1));
 assert(!g.set_actor_transform("actor",3,0,1));assert(!g.set_actor_transform("actor",0,0,0));
 assert(g.set_actor_effect("actor",45,125,true,"black",100,2));g.update_sprite_effects();g.update_sprite_effects();
 assert(g.sprites[1]->rotation_angle()==45 && g.sprites[1]->horizontal_scale()==1.25 && g.sprites[1]->visible);
 assert(g.sprites[1]->palette().fade_intensity()==1 && g.sprites[1]->palette().tint.r==0);
}`;
 const file=path.join(temp,'main.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror',file,'-o',exe],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.error?.message??build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stdout+run.stderr);
 console.log('Independent rotation, scale, tint, simultaneous durations, player, replacement and legacy effects passed.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
