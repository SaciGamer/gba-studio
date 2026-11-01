import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
const method = name => {
  const start = source.indexOf(`void GraphicsManager::${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-shooter-sprites-'));
try {
  const cpp = path.join(temporary, 'sprites.cpp'), executable = path.join(temporary, 'sprites.exe');
  fs.writeFileSync(cpp, `
#include <algorithm>
#include <array>
#include <cassert>
#include <memory>
#include <optional>
#include <string>
namespace bn {
template<int N>using string=std::string;template<class T>using optional=std::optional<T>;using std::min;
int limit=128;
struct sprite_ptr {struct state {inline static int alive=0;state(){++alive;}~state(){--alive;}};std::shared_ptr<state> value=std::make_shared<state>();void set_bg_priority(int){}void set_blending_enabled(bool){}void set_position(int,int){} };
struct sprite_item {
 struct size {int width()const{return 8;}int height()const{return 8;}};size shape_size()const{return{};}
 optional<sprite_ptr> create_sprite_optional(int,int,int)const{if(sprite_ptr::state::alive>=limit)return{};return sprite_ptr{};}
};
}
struct Sprites {const char* graphics_name="item";int frame_width=8,frame_height=8,canvas_origin_x=0,canvas_origin_y=0,idle_frame=0;};
Sprites resource;
const Sprites* get_sprite_by_id(const std::string& id){return id.empty()?nullptr:&resource;}
bn::optional<bn::sprite_item> get_sprite_item_from_name(const std::string&){return bn::sprite_item{};}
struct ShooterProjectile{int x=0,y=0;};struct ShooterDrop{int x=0,y=0;const char* drop_id="item";};
struct ShooterKit{
 std::array<ShooterProjectile,128> projectiles{};int projectiles_count=0;
 std::array<ShooterDrop,16> drops{};int drops_count=0;
 bool projectile_at(int i,ShooterProjectile& result)const{if(i<0||i>=projectiles_count)return false;result=projectiles[i];return true;}
 int drop_count()const{return drops_count;}bool drop_at(int i,ShooterDrop& result)const{if(i<0||i>=drops_count)return false;result=drops[i];return true;}
};
struct GraphicsManager {
 static constexpr int MAX_SHOOTER_PROJECTILE_SPRITES=16;int camera_x=0,camera_y=0;
 bn::optional<bn::sprite_ptr> shooter_projectile_sprites[16],shooter_drop_sprites[16];
 int shooter_projectile_indices[16];std::string shooter_drop_ids[16];
 GraphicsManager(){for(int& index:shooter_projectile_indices)index=-1;}
 void sync_shooter_projectiles(const ShooterKit&,const char*);void sync_shooter_drops(const ShooterKit&);
};
${['sync_shooter_projectiles','sync_shooter_drops'].map(method).join('\n')}
int main(){
 GraphicsManager graphics;ShooterKit shooter;shooter.projectiles_count=32;shooter.drops_count=16;
 for(auto& projectile:shooter.projectiles)projectile.x=1000;
 for(auto& drop:shooter.drops)drop.x=1000;
 graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==0);
 shooter.projectiles[31].x=16;shooter.drops[15].x=16;
 graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==2);
 std::weak_ptr<bn::sprite_ptr::state> old_projectile=graphics.shooter_projectile_sprites[0]->value,old_drop=graphics.shooter_drop_sprites[15]->value;
 graphics.camera_x=500;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(old_projectile.expired()&&old_drop.expired()&&bn::sprite_ptr::state::alive==0);
 assert(shooter.projectiles_count==32&&shooter.drops_count==16);
 graphics.camera_x=0;bn::limit=0;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==0);
 bn::limit=128;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==2);
 for(int i=0;i<100;++i){graphics.camera_x=500;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==0);graphics.camera_x=0;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==2);}
 shooter.projectiles_count=0;shooter.drops_count=0;graphics.sync_shooter_projectiles(shooter,"item");graphics.sync_shooter_drops(shooter);assert(bn::sprite_ptr::state::alive==0);
}
`);
  const compiled = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', cpp, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Production shooter sprite budget passed: offscreen projectiles/drops allocate nothing, visible items beyond earlier offscreen entries render, camera changes release/recreate graphics, OAM exhaustion retries safely, simulation remains active and 100 camera cycles retain no extra sprites.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-shooter-sprites-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
