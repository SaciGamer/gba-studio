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
    bool actor_blocked(const char*,const Sprites& body,int x,int y) { return overlaps(body,x,y,{80,32,16,64,"solid"}); }
    Action first_action(const Scenes& scene,const Sprites& body,const State& state,const Options& options,int& frames) {
      search.begin(scene,body,state,52,84,256,true,false,options);
      SearchStatus result=SearchStatus::running;for(int i=0;i<10000&&result==SearchStatus::running;++i)result=search.advance();assert(result==SearchStatus::found);
      PathAction actions[512];int count=search.copy_reverse_path(actions,512);assert(count>0);frames=0;for(int i=0;i<count;++i)frames+=actions[i].frames;
      return actions[count-1].action;
    }
    bool route(const Scenes& scene, const Sprites& body, State& state, int x, int y, int speed = 256, bool nearest = false, const Options& options = {}) {
      search.begin(scene, body, state, x, y, speed, true, nearest,options);
      SearchStatus result = SearchStatus::running;
      for(int i=0; i<10000 && result==SearchStatus::running; ++i) result=search.advance(32);
      assert(result!=SearchStatus::running);
      if(result!=SearchStatus::found) return false;
      x=search.destination_x();y=search.destination_y();
      PathAction actions[512]; int count=search.copy_reverse_path(actions,512); assert(count>=0);
      for(int i=count-1;i>=0;--i) for(int frame=0;frame<actions[i].frames;++frame) {
        const int dx=std::abs(x-state.x),dy=std::abs(y-state.y);
        const int distance=actions[i].action>=up_left?std::min(dx,dy):actions[i].action==up||actions[i].action==down?dy:dx;
        step(scene,body,state,actions[i].action,distance?std::min(speed,distance*256):speed,frame==0,options);
        for(int c=0;options.walls&&c<scene.collisions_count;++c) if(same_text(scene.collisions[c].side,"solid")) assert(!overlaps(body,state.x,state.y,scene.collisions[c]));
        if(options.actors)assert(!options.actor_blocked(options.actor_id,body,state.x,state.y));
      }
      return state.x==x&&state.y==y;
    }
    int main() {
      Sprites body{};body.frame_width=16;body.frame_height=16;body.collision_x=-4;body.collision_y=-4;body.collision_width=8;body.collision_height=8;
      Scenes scene{};scene.scene_type="Top Down";scene.scene_width=160;scene.scene_height=128;
      SceneCollision wall{64,0,8,96,"solid"};scene.collisions=&wall;scene.collisions_count=1;
      State state;state.x=32;state.y=64;assert(route(scene,body,state,112,64));
      state={};state.x=32;state.y=64;assert(!route(scene,body,state,68,64));
      assert(!route(scene,body,state,-10,64));
      scene.collisions=nullptr;scene.collisions_count=0;state={};state.x=32;state.y=64;
      Options options;int horizontal_frames=0,vertical_frames=0,diagonal_frames=0;
      assert(first_action(scene,body,state,options,horizontal_frames)==right);
      options.movement_type=1;assert(first_action(scene,body,state,options,vertical_frames)==down);
      options.movement_type=2;assert(first_action(scene,body,state,options,diagonal_frames)==down_right);assert(diagonal_frames<horizontal_frames&&diagonal_frames<vertical_frames);
      assert(route(scene,body,state,34,84,512,false,options));assert(state.x==34&&state.y==84);
      state={};state.x=32;state.y=64;
      options.lock_axis=1;assert(route(scene,body,state,52,84,256,false,options));assert(state.x==52&&state.y==64);
      options.lock_axis=2;state.x=32;assert(route(scene,body,state,52,84,256,false,options));assert(state.x==32&&state.y==84);
      options={};options.walls=false;scene.collisions=&wall;scene.collisions_count=1;state={};state.x=32;state.y=64;
      assert(route(scene,body,state,68,64,256,false,options));assert(state.x==68);
      options.actors=true;options.actor_blocked=actor_blocked;state={};state.x=32;state.y=64;
      assert(route(scene,body,state,112,64,256,false,options));assert(state.x==112&&state.y==64);
      state={};state.x=32;state.y=64;assert(route(scene,body,state,84,64,256,true,options));assert(state.x==76&&state.y==64);
      options.actors=false;state={};state.x=32;state.y=64;assert(route(scene,body,state,84,64,256,false,options));assert(state.x==84&&state.y==64);
      scene.collisions=nullptr;scene.collisions_count=0;state={};state.x=32;state.y=64;
      assert(route(scene,body,state,37,71,512));
      state={};state.x=32;state.y=64;assert(route(scene,body,state,37,64,64));
      SceneCollision platform[]={{0,112,160,16,"solid"},{32,40,16,72,"ladder"}};
      scene.scene_type="Platformer";scene.collisions=platform;scene.collisions_count=2;
      state={};state.x=40;state.y=108;assert(route(scene,body,state,40,44));assert(state.climbing);
      assert(route(scene,body,state,40,108));
      SceneCollision jumping[]={{0,112,160,16,"solid"},{64,88,8,24,"solid"}};
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
      // fase_00: the door anchor is four pixels lower than the player anchor.
      SceneCollision doorway[]={{0,176,256,16,"solid"},{248,96,8,80,"solid"},{0,96,8,80,"solid"}};
      scene.scene_width=256;scene.scene_height=256;scene.collisions=doorway;scene.collisions_count=3;
      body.canvas_origin_x=8;body.canvas_origin_y=8;body.collision_x=-8;body.collision_y=-8;body.collision_width=16;body.collision_height=16;
      state={};state.x=224;state.y=168;assert(route(scene,body,state,240,172));assert(state.y==168);
      assert(route(scene,body,state,240,172,256,true));assert(state.x==240&&state.y==168);
      // A tile-rounded door Y (160) is above the standing anchor (168).
      // Finish at supported height instead of trying to jump to the air point.
      state={};state.x=224;state.y=168;
      search.begin(scene,body,state,240,160,256,true,true);
      assert(search.advance()==SearchStatus::found);
      assert(search.destination_x()==240&&search.destination_y()==168);
      assert(route(scene,body,state,240,160,256,true));assert(state.x==240&&state.y==168&&state.grounded);
      // Different configured footprints determine different reachable margins.
      body.collision_y=-6;body.collision_height=12;
      state={};state.x=224;state.y=170;assert(route(scene,body,state,240,172,256,true));assert(state.x==240&&state.y==170);
      body.collision_y=-8;body.collision_height=16;
      SceneCollision sealed[]={{0,176,256,16,"solid"},{80,0,16,176,"solid"}};
      scene.collisions=sealed;scene.collisions_count=2;state={};state.x=32;state.y=168;
      assert(route(scene,body,state,120,168,256,true));assert(state.x==72&&state.y==168);
      assert(route(scene,body,state,120,168,256,true));assert(state.x==72&&state.y==168);
      scene.collisions=doorway;scene.collisions_count=3;
      scene.scene_width=160;scene.scene_height=128;
      body.frame_width=24;body.frame_height=32;body.canvas_origin_x=3;body.canvas_origin_y=11;
      int x=999,y=999;assert(clamp_destination(scene,body,x,y));assert(x==152&&y==120);
      assert(x+body.collision_x+body.collision_width==scene.scene_width&&y+body.collision_y+body.collision_height==scene.scene_height);
      x=-50;y=-50;assert(clamp_destination(scene,body,x,y));assert(x==8&&y==8);
      body.collision_x=-20;body.collision_y=-20;body.collision_width=48;body.collision_height=48;
      x=999;y=999;assert(clamp_destination(scene,body,x,y));assert(x==132&&y==100);
      x=-50;y=-50;assert(clamp_destination(scene,body,x,y));assert(x==20&&y==20);
      body.frame_width=200;assert(clamp_destination(scene,body,x,y));
      body.collision_width=200;assert(!clamp_destination(scene,body,x,y));
      // Artwork size/origin must not change physical room boundaries or routes.
      scene.scene_type="Top Down";scene.scene_width=160;scene.scene_height=128;
      SceneCollision gap[]={{64,0,8,56,"solid"},{64,64,8,64,"solid"}};
      scene.collisions=gap;scene.collisions_count=2;
      body.collision_x=-4;body.collision_y=-4;body.collision_width=8;body.collision_height=8;
      for(int canvas : {16,64,200}) {
        body.frame_width=canvas;body.frame_height=canvas;body.canvas_origin_x=canvas/2;body.canvas_origin_y=canvas-2;
        x=999;y=999;assert(clamp_destination(scene,body,x,y));assert(x==156&&y==124);
        state={};state.x=32;state.y=60;assert(route(scene,body,state,112,60));assert(state.x==112&&state.y==60);
        step(scene,body,state,down,4096);assert(state.y==76);
      }
      // A taller collider cannot pass through the same eight-pixel opening.
      body.collision_y=-6;body.collision_height=12;state={};state.x=32;state.y=60;
      assert(!route(scene,body,state,112,60));
      // NPCs with different collider offsets land using their own feet, too.
      scene.scene_type="Platformer";scene.scene_height=512;
      SceneCollision ground{0,432,160,16,"solid"};scene.collisions=&ground;scene.collisions_count=1;
      body.collision_y=-10;body.collision_height=14;state={};state.x=32;state.y=428;
      assert(route(scene,body,state,112,416,256,false));assert(state.y==428&&state.grounded);
      body.collision_y=-20;body.collision_height=32;state={};state.x=32;state.y=420;
      assert(route(scene,body,state,112,416,256,false));assert(state.y==420&&state.grounded);
      state={};state.x=32;state.y=420;assert(route(scene,body,state,112,428,256,false));assert(state.y==420&&state.grounded);
      std::cout<<"Actor paths: detours, nearest reachable destinations, configured collision margins, exact targets, fractional speeds, ladders and platform jumps passed.\\n";
    }
  `);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', 'tests/native/support', '-I', 'tests/native/scheduler', '-I', 'tools/butano/template/include', file, '-o', executable], { encoding:'utf8', windowsHide:true });
  assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(executable,[],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  process.stdout.write(run.stdout);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
