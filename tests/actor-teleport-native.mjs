import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('bool GraphicsManager::move_actor(');
assert.ok(start >= 0);
const method = source.slice(start, source.indexOf('\n}\n', start) + 2);
const groupStart = source.indexOf('void GraphicsManager::set_sprite_group_position(');
const groupMethod = source.slice(groupStart, source.indexOf('\n}\n', groupStart) + 2);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-teleport-'));
try {
  const cpp = `#include <cassert>
#include <optional>
#include <string>
#include <algorithm>
namespace bn { template<int N> using string=std::string; using std::max; }
struct Sprites { int frame_width=16,frame_height=16,canvas_origin_x=8,canvas_origin_y=8,collision_x=-4,collision_y=-4,collision_width=8,collision_height=8,composite_columns=1,composite_rows=1; };
struct SceneActor { const char* sprite_id=nullptr; };
const Sprites* get_sprite_by_id(const std::string&){return nullptr;}
struct SceneCollision { int x,y,width,height; const char* side; };
struct Scenes { int scene_width=256,scene_height=256; const SceneCollision* collisions=nullptr; int collisions_count=0; };
struct Sprite { int x=0,y=0; void set_position(int nx,int ny){x=nx;y=ny;} };
namespace actor_motion { bool clamp_destination(const Scenes&,const Sprites&,int x,int y){return x>=0&&y>=0&&x<256&&y<256;} }
class GraphicsManager { public:
 int player_slot=0,sprite_count=1,actor_count=0,camera_x=0,camera_y=0,player_world_x=24,player_world_y=120;
 int player_vertical_velocity_q8=-1280,player_vertical_remainder_q8=96,player_ignored_platform_index=3;
 bool player_grounded=false,player_drop_through_active=false;
 const Scenes* currentScene=nullptr; const Sprites* sprite_resources[1]{};
 std::optional<Sprite> sprites[1]{Sprite{}};
 const char* actor_ids[1]{}; int actor_slots[1]{},actor_world_x[1]{},actor_world_y[1]{};
 struct Residence{const SceneActor*definition;bool enabled;int x,y;};Residence* actor_residence(const char*){return nullptr;}
 bool move_actor(const char*,int,int);
 void set_sprite_group_position(int,int,int);
};
${groupMethod}
${method}
int main(){Scenes scene;Sprites player;GraphicsManager manager;manager.currentScene=&scene;manager.sprite_resources[0]=&player;
 assert(manager.move_actor("__PLAYER__",80,64));
 assert(manager.player_world_x==80&&manager.player_world_y==64);
 assert(manager.player_vertical_velocity_q8==-1280&&manager.player_vertical_remainder_q8==96);
 assert(!manager.player_grounded&&manager.player_ignored_platform_index==-1&&!manager.player_drop_through_active);
 assert(manager.sprites[0]->x==80-120&&manager.sprites[0]->y==64-80);
}`;
  const file = path.join(temp, 'test.cpp'), exe = path.join(temp, 'test.exe');
  fs.writeFileSync(file, cpp);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', file, '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Immediate player teleport preserves airborne vertical velocity and gravity remainder.');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temp, { recursive: true, force: true });
}
