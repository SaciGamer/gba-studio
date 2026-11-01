import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-camera-shake-'));
try {
 fs.writeFileSync(path.join(temp,'bn_string.h'),'#pragma once\n#include <string>\nnamespace bn {template<int N> using string=std::string;}');fs.writeFileSync(path.join(temp,'bn_display.h'),'');
 fs.copyFileSync('tools/butano/template/include/camera_manager.h',path.join(temp,'camera_manager.h'));
 fs.writeFileSync(path.join(temp,'graphics_manager.h'),`#pragma once
struct Scenes {int scene_width=640,scene_height=480;}; struct GraphicsManager {Scenes scene; std::string last_actor_id; int actor_x=200,actor_y=120; int x=0,y=0;static GraphicsManager&instance(){static GraphicsManager gm;return gm;}void set_camera_position(int a,int b){x=a;y=b;}int get_camera_x()const{return x;}int get_camera_y()const{return y;}int get_player_world_x(){return 200;}int get_player_world_y(){return 120;} int read_numeric_actor_property(const char* id,int property){last_actor_id=id;return property==0?actor_x:actor_y;} const Scenes* getScene(){return &scene;}};`);
 fs.writeFileSync(path.join(temp,'main.cpp'),`#include <cassert>
#include "camera_manager.h"
#include "graphics_manager.h"
int main(){auto&camera=CameraManager::instance();auto&graphics=GraphicsManager::instance();
 for(int axis:{0,1,2,99}){camera.set_position(40,60);camera.shake(4,3,axis);for(int i=0;i<4;i++){camera.update();assert(camera.get_x()==40&&camera.get_y()==60);assert(axis==2?graphics.x==40:graphics.x==37||graphics.x==43);assert(axis==1?graphics.y==60:graphics.y==57||graphics.y==63);}camera.update();assert(graphics.x==40&&graphics.y==60);}
 camera.shake(999,999,1);for(int i=0;i<120;i++){camera.update();assert(graphics.x==32||graphics.x==48);assert(graphics.y==60);}camera.update();assert(graphics.x==40&&graphics.y==60);
 camera.shake(20,8);camera.update();camera.shake(1,1,2);camera.update();assert(graphics.x==40&&(graphics.y==59||graphics.y==61));camera.update();assert(graphics.x==40&&graphics.y==60);
 camera.follow_player_actor(true);camera.shake(2,2,1);camera.update();assert(camera.get_x()==80&&camera.get_y()==40&&graphics.y==40);camera.update();camera.update();assert(graphics.x==80&&graphics.y==40);
 camera.shake(0,8);camera.update();assert(graphics.x==80&&graphics.y==40);
 camera.set_position(0,0);camera.follow_actor(true,"actor",true,80,40);
 graphics.actor_x=120;graphics.actor_y=80;camera.update();assert(camera.get_x()==0&&camera.get_y()==0);
 graphics.actor_x=180;graphics.actor_y=120;camera.update();assert(camera.get_x()==20&&camera.get_y()==20);assert(graphics.last_actor_id=="actor");
 graphics.actor_x=150;graphics.actor_y=100;camera.update();assert(camera.get_x()==20&&camera.get_y()==20);
 graphics.actor_x=90;graphics.actor_y=70;camera.update();assert(camera.get_x()==10&&camera.get_y()==10);
 graphics.actor_x=-100;graphics.actor_y=-100;camera.update();assert(camera.get_x()==0&&camera.get_y()==0);
 graphics.actor_x=1000;graphics.actor_y=1000;camera.update();assert(camera.get_x()==400&&camera.get_y()==320);
 for(bool lock_x:{false,true}) for(bool lock_y:{false,true}) {
  graphics.scene={640,480};graphics.actor_x=300;graphics.actor_y=240;
  camera.set_position(40,60);camera.follow_actor(true,"actor",false,0,0,lock_x,lock_y);camera.update();
  assert(camera.get_x()==(lock_x?40:180));assert(camera.get_y()==(lock_y?60:160));
  camera.set_position(40,60);camera.follow_actor(true,"actor",false,80,40,lock_x,lock_y);camera.update();
  assert(camera.get_x()==(lock_x?40:140));assert(camera.get_y()==(lock_y?60:140));
  // Clamping may adjust only the axes that follow; a locked coordinate stays exact.
  graphics.actor_x=1000;graphics.actor_y=1000;camera.set_position(-25,-35);
  camera.follow_actor(true,"actor",true,0,0,lock_x,lock_y);camera.update();
  assert(camera.get_x()==(lock_x?-25:400));assert(camera.get_y()==(lock_y?-35:320));
 }
 // Follow activation must retain an externally positioned viewport, including
 // a locked coordinate outside scene bounds. The free axis uses its dead zone.
 graphics.scene={640,480};graphics.actor_x=160;graphics.actor_y=140;
 camera.set_position(0,0);graphics.set_camera_position(60,70);
 camera.follow_actor(true,"actor",true,80,40,false,true);camera.update();
 assert(camera.get_x()==60&&camera.get_y()==70); // Target is inside the X area.
 graphics.actor_x=230;camera.update();assert(camera.get_x()==70&&camera.get_y()==70);
 graphics.actor_x=300;camera.update();assert(camera.get_x()==140&&camera.get_y()==70);
 camera.set_position(0,0);graphics.set_camera_position(-35,70);
 camera.follow_actor(true,"actor",true,80,40,true,false);camera.update();
 assert(camera.get_x()==-35&&camera.get_y()==70); // Target is inside the Y area.
 graphics.actor_y=200;camera.update();assert(camera.get_x()==-35&&camera.get_y()==100);
 camera.set_position(0,0);graphics.set_camera_position(75,95);
 camera.follow_actor(true,"actor",true,80,40,true,true);camera.update();
 assert(camera.get_x()==75&&camera.get_y()==95);
 // Enabling follow during the final shake frame must not freeze the shake offset.
 camera.follow_player_actor(false);camera.set_position(40,60);camera.shake(1,3,1);camera.update();
 assert(graphics.x!=40);camera.follow_actor(true,"actor",false,80,40,true,true);camera.update();
 assert(camera.get_x()==40&&camera.get_y()==60&&graphics.x==40&&graphics.y==60);
 graphics.actor_x=1000;graphics.actor_y=1000;
 // Legacy calls reset the locks and still track both axes.
 camera.follow_actor(true,"actor",true,80,40);camera.update();assert(camera.get_x()==400&&camera.get_y()==320);
 graphics.scene={100,80};camera.update();assert(camera.get_x()==0&&camera.get_y()==0);\n camera.follow_actor(false,"actor",true,80,40);graphics.actor_x=0;camera.set_position(10,20);camera.update();assert(camera.get_x()==10&&camera.get_y()==20);
 // A new scene starts with its own camera offset and no outgoing behavior.
 camera.follow_actor(true,"actor",true,80,40,true,true);camera.shake(120,8,2);
 camera.reset_for_scene(24,16);assert(!camera.is_following_player());
 graphics.actor_x=-1000;graphics.actor_y=1000;
 for(int frame=0;frame<130;++frame){camera.update();assert(camera.get_x()==24&&camera.get_y()==16&&graphics.x==24&&graphics.y==16);}
 // New-scene events may opt back into follow with the ordinary defaults.
 graphics.actor_x=200;graphics.actor_y=120;camera.follow_player_actor(true);camera.update();
 assert(camera.get_x()==80&&camera.get_y()==40&&graphics.last_actor_id=="__PLAYER__");
 // An explicit opt-in preserves the target, locks, dead zone and clamp over multiple scenes.
 graphics.scene={640,480};camera.follow_actor(true,"actor",true,80,40,true,false,true);
 camera.shake(120,8,2);camera.reset_for_scene(24,16);assert(camera.is_following_player());
 graphics.actor_x=200;graphics.actor_y=100;camera.update();
 assert(camera.get_x()==24&&camera.get_y()==16&&graphics.x==24&&graphics.y==16&&graphics.last_actor_id=="actor");
 graphics.actor_y=200;camera.update();assert(camera.get_x()==24&&camera.get_y()==100);
 graphics.actor_y=1000;camera.update();assert(camera.get_y()==320);
 camera.reset_for_scene(35,18);graphics.actor_y=100;camera.update();assert(camera.get_x()==35&&camera.get_y()==18);
 // Turning persistence off makes the next scene local again.
 camera.follow_actor(true,"actor",true,80,40,true,false,false);camera.reset_for_scene(56,32);
 assert(!camera.is_following_player());camera.update();assert(graphics.x==56&&graphics.y==32);
 // Stop Follow clears persistent behavior but leaves the current position intact.
 camera.set_position(42,60);camera.follow_actor(true,"actor",true,80,40,true,true,true);
 camera.stop_follow();assert(!camera.is_following_player());graphics.actor_x=900;graphics.actor_y=900;
 for(int frame=0;frame<3;++frame){camera.update();assert(camera.get_x()==42&&camera.get_y()==60);}
 camera.stop_follow();camera.reset_for_scene(24,16);camera.update();
 assert(!camera.is_following_player()&&graphics.x==24&&graphics.y==16);
}`.replace('#include <cassert>','#include <cassert>\n#include <initializer_list>'));
 const exe=path.join(temp,'test.exe');const built=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','-I'+temp,'tools/butano/template/src/camera_manager.cpp',path.join(temp,'main.cpp'),'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
 console.log('Camera shake native passed: both/horizontal/vertical axes, legacy defaults, runtime amplitude/duration caps, replacement, player following and exact position restoration, independent follow-axis locks, dead zones and scene clamping.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
