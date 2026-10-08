import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-motion-events-'));
try {
  const graphics = `#pragma once
    #include "actor_motion_physics.h"
    class GraphicsManager {
    public:
      Scenes scene{}; Sprites body{}; actor_motion::State state; unsigned revision=1; int stops=0,animation_speed=6;
      static GraphicsManager& instance(){static GraphicsManager graphics;return graphics;}
      const Scenes* getScene()const{return &scene;}
      unsigned get_scene_revision()const{return revision;}
      const Sprites* read_script_actor_state(const char* id,actor_motion::State& output)const {
        if(!id||actor_motion::same_text(id,"missing")) return nullptr;
        output=state;return &body;
      }
      bool apply_script_actor_state(const char*,const actor_motion::State& next,actor_motion::Action){state=next;return true;}
      void stop_script_actor_motion(const char*){++stops;}
      int read_numeric_actor_property(const char*,int)const{return animation_speed;}
      bool set_actor_animation_speed(const char*,int speed){animation_speed=speed;return true;}
    };`;
  fs.writeFileSync(path.join(temp,'graphics_manager.h'),graphics);
  const handlers=fs.readFileSync('tools/butano/template/src/script_event_handlers.cpp','utf8').replaceAll('\r\n','\n');
  const method=signature=>{const start=handlers.indexOf(signature);assert.ok(start>=0);return handlers.slice(start,handlers.indexOf('\n}\n',start)+2);};
  fs.writeFileSync(path.join(temp,'test.cpp'),`#include <cassert>
    #include <iostream>
    #include "graphics_manager.h"
    #include "actor_motion_manager.h"
    class CameraManager { public:
      int x=0,y=0;bool following=true;
      static CameraManager& instance(){static CameraManager camera;return camera;}
      void set_position(int a,int b){x=a;y=b;}int get_x()const{return x;}int get_y()const{return y;}
      void follow_player_actor(bool enabled){following=enabled;}
    };
    class CameraEventHandler {public:static bool execute(const CameraEventData&);static EventStatus execute_status(const void*,MotionEventState&);};
    ${method('bool CameraEventHandler::execute(const CameraEventData&')}
    ${method('EventStatus CameraEventHandler::execute_status(')}
    int main(){
      MotionEventState camera_state;auto& camera=CameraManager::instance();CameraEventData pan{17,-7,true,64};
      int frames=0;while(CameraEventHandler::execute_status(&pan,camera_state)==EventStatus::running){assert(++frames<500);assert(camera.x<=17&&camera.y>=-7);}
      assert(camera.x==17&&camera.y==-7&&!camera.following&&!camera_state.active&&frames>60);
      CameraEventData instant{44,55};assert(CameraEventHandler::execute_status(&instant,camera_state)==EventStatus::completed&&camera.x==44&&camera.y==55);
      auto& graphics=GraphicsManager::instance();graphics.scene.scene_type="Top Down";graphics.scene.scene_width=160;graphics.scene.scene_height=128;
      graphics.body.frame_width=16;graphics.body.frame_height=16;graphics.body.collision_x=-4;graphics.body.collision_y=-4;graphics.body.collision_width=8;graphics.body.collision_height=8;
      SceneCollision wall{"wall",64,0,8,96,"solid"};graphics.scene.collisions=&wall;graphics.scene.collisions_count=1;graphics.state.x=32;graphics.state.y=64;
      auto& motion=ActorMotionManager::instance();MotionEventState actor_state;ActorMoveEventData move{"__PLAYER__",112,64,true,256,8};
      assert(motion.advance(move,actor_state)==EventStatus::running);assert(motion.controls_player());
      assert(graphics.animation_speed==8);
      frames=0;EventStatus result=EventStatus::running;
      while(result==EventStatus::running){result=motion.advance(move,actor_state);assert(++frames<5000);}
      assert(result==EventStatus::completed&&graphics.state.x==112&&graphics.state.y==64&&!motion.controls_player()&&!actor_state.active);
      assert(graphics.animation_speed==6);
      move.x=68;frames=0;do{result=motion.advance(move,actor_state);assert(++frames<5000);}while(result==EventStatus::running);
      assert(result==EventStatus::failed&&!motion.controls_player()&&!actor_state.active);
      move.x=32;assert(motion.advance(move,actor_state)==EventStatus::running);motion.cancel(&actor_state);assert(!motion.controls_player()&&!actor_state.active);
      assert(graphics.animation_speed==6);
      assert(motion.advance(move,actor_state)==EventStatus::running);++graphics.revision;assert(motion.advance(move,actor_state)==EventStatus::failed&&!motion.controls_player());
      move.actor_id="missing";assert(motion.advance(move,actor_state)==EventStatus::failed);
      move.actor_id="__PLAYER__";move.x=999;move.y=999;graphics.scene.collisions=nullptr;graphics.scene.collisions_count=0;
      frames=0;do{result=motion.advance(move,actor_state);assert(++frames<5000);}while(result==EventStatus::running);
      assert(result==EventStatus::completed&&graphics.state.x==144&&graphics.state.y==112);
      std::cout<<"Motion events: camera interpolation and exact completion, actor detours, failed destinations, cancellation and scene changes passed.\\n";
    }
  `);
  const executable=path.join(temp,'test.exe');
  const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-I',temp,'-I','tests/native/support','-I','tools/butano/template/include','-I','tests/native/scheduler',path.join(temp,'test.cpp'),'tools/butano/template/src/actor_motion_manager.cpp','-o',executable],{encoding:'utf8',windowsHide:true});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(executable,[],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
