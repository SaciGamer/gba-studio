import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
const start = source.indexOf('            const Sprites* actor_resource', source.indexOf('bool GraphicsManager::update_actor_interaction'));
const code = source.slice(start, source.indexOf('            if(dx <= interaction_range', start));
assert.ok(start > 0 && code.includes('const int dy'));
const range = Number(source.match(/const int interaction_range = (\d+);/)[1]);assert.equal(range,0);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-interaction-'));
try {
 const cpp = `#include <algorithm>
#include <cassert>
namespace bn { using std::max; }
struct Sprites {int collision_x,collision_y,collision_width,collision_height;};
bool near(int ax,int ay,int px,int py,const Sprites& actor,const Sprites& player){
 const Sprites* sprite_resources[]={&player,&actor};int actor_slots[]={1};
 int index=0,player_slot=0,sprite_count=2;
 int actor_world_x[]={ax},actor_world_y[]={ay};int player_world_x=px,player_world_y=py;
 for(int once=0;once<1;++once){
 ${code}
 return dx<=${range}&&dy<=${range};
 }return false;
}
int main(){
 Sprites small{-4,-4,8,8};
 assert(near(8,0,0,0,small,small));
 assert(near(7,0,0,0,small,small));
 assert(!near(24,0,0,0,small,small));
 assert(!near(9,0,0,0,small,small));
 assert(near(0,8,0,0,small,small));
 assert(!near(0,9,0,0,small,small));
 Sprites offset{80,40,8,8};
 assert(!near(0,0,0,0,offset,small));
 assert(near(0,0,80,40,offset,small));
 Sprites large{-64,-32,128,64};
 assert(near(0,0,68,0,large,small));
 assert(!near(0,0,80,0,large,small));
 assert(!near(0,0,69,0,large,small));
 assert(near(0,0,0,0,small,small));
}`;
 const file=path.join(temp,'test.cpp'),exe=path.join(temp,'test.exe');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror',file,'-o',exe],{encoding:'utf8',windowsHide:true});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stdout+run.stderr);
 console.log('Actor interaction: collider offsets, sizes, overlap and range boundaries passed.');
} finally {
 assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));
 fs.rmSync(temp,{recursive:true,force:true});
}
