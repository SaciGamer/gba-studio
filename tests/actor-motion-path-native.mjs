import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-motion-'));
try {
  const file = path.join(temp, 'test.cpp'), executable = path.join(temp, 'test.exe');
  fs.writeFileSync(file, `#include <cassert>
    #include <iostream>
    #include "actor_motion_path.h"
    using namespace actor_motion;
    static PathSearch search;
    bool route(const Scenes& scene, const Sprites& body, State& state, int x, int y, int speed = 256) {
      search.begin(scene, body, state, x, y, speed);
      SearchStatus result = SearchStatus::running;
      for(int i=0; i<10000 && result==SearchStatus::running; ++i) result=search.advance(32);
      assert(result!=SearchStatus::running);
      if(result!=SearchStatus::found) return false;
      PathAction actions[512]; int count=search.copy_reverse_path(actions,512); assert(count>=0);
      for(int i=count-1;i>=0;--i) for(int frame=0;frame<actions[i].frames;++frame) {
        const int dx=std::abs(x-state.x),dy=std::abs(y-state.y);
        const int distance=actions[i].action==up||actions[i].action==down?dy:dx;
        step(scene,body,state,actions[i].action,distance?std::min(speed,distance*256):speed,frame==0);
        for(int c=0;c<scene.collisions_count;++c) if(same_text(scene.collisions[c].side,"solid")) assert(!overlaps(body,state.x,state.y,scene.collisions[c]));
      }
      return state.x==x&&state.y==y;
    }
    int main() {
      Sprites body{};body.frame_width=16;body.frame_height=16;body.collision_x=-4;body.collision_y=-4;body.collision_width=8;body.collision_height=8;
      Scenes scene{};scene.scene_type="Top Down";scene.scene_width=160;scene.scene_height=128;
      SceneCollision wall{"wall",64,0,8,96,"solid"};scene.collisions=&wall;scene.collisions_count=1;
      State state;state.x=32;state.y=64;assert(route(scene,body,state,112,64));
      state={};state.x=32;state.y=64;assert(!route(scene,body,state,68,64));
      assert(!route(scene,body,state,-10,64));
      scene.collisions=nullptr;scene.collisions_count=0;state={};state.x=32;state.y=64;
      assert(route(scene,body,state,37,71,512));
      state={};state.x=32;state.y=64;assert(route(scene,body,state,37,64,64));
      SceneCollision platform[]={{"floor",0,112,160,16,"solid"},{"ladder",32,40,16,72,"ladder"}};
      scene.scene_type="Platformer";scene.collisions=platform;scene.collisions_count=2;
      state={};state.x=40;state.y=108;assert(route(scene,body,state,40,44));assert(state.climbing);
      assert(route(scene,body,state,40,108));
      SceneCollision jumping[]={{"floor",0,112,160,16,"solid"},{"wall",64,88,8,24,"solid"}};
      scene.collisions=jumping;scene.collisions_count=2;state={};state.x=32;state.y=108;
      assert(route(scene,body,state,112,108));
      // Scripted jumps happen only at a blocking obstacle, once per attempt.
      scene.collisions_count=1;state={};state.x=32;state.y=108;
      step(scene,body,state,jump_right,256);assert(state.y==108&&state.velocity_q8==0&&state.jumped_obstacle==-1);
      jumping[1].y=8;jumping[1].height=104;scene.collisions_count=2;state={};state.x=60;state.y=108;
      int jumps=0;
      for(int i=0;i<120;++i){const int previous=state.velocity_q8;step(scene,body,state,jump_right,256);if(previous>=0&&state.velocity_q8<0)++jumps;}
      assert(jumps==1&&state.x==60&&state.y==108);
      state={};state.x=32;state.y=108;assert(!route(scene,body,state,112,108));
      body.frame_width=24;body.frame_height=32;body.canvas_origin_x=3;body.canvas_origin_y=11;
      int x=999,y=999;assert(clamp_destination(scene,body,x,y));assert(x==139&&y==107);
      assert(x-body.canvas_origin_x+body.frame_width==scene.scene_width&&y-body.canvas_origin_y+body.frame_height==scene.scene_height);
      x=-50;y=-50;assert(clamp_destination(scene,body,x,y));assert(x==3&&y==11);
      body.frame_width=200;assert(!clamp_destination(scene,body,x,y));
      std::cout<<"Actor paths: detours, unreachable destinations, exact targets, fractional speeds, ladders and platform jumps passed.\\n";
    }
  `);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', 'tests/native/support', '-I', 'tests/native/scheduler', '-I', 'tools/butano/template/include', file, '-o', executable], { encoding:'utf8', windowsHide:true });
  assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(executable,[],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  process.stdout.write(run.stdout);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
