import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const root=path.resolve('.'),template=path.join(root,'tools/butano/template'),scheduler=path.join(root,'tests/native/scheduler');
const {default:ResourceBuilder}=await import(pathToFileURL(path.join(root,'dist/main/utils/builders/ResourceBuilder.js')));
const output=fs.mkdtempSync(path.join(os.tmpdir(),'gba-camera-script-')),include=path.join(output,'include');fs.mkdirSync(include);
const number=value=>({kind:'number',value});
const numericPan={id:'numeric-pan',command:'EVENT_PAN_CAMERA',args:{x:{kind:'expression',operation:'add',left:{kind:'expression',operation:'modulo',left:{kind:'variable',variableId:'local-0'},right:number(7)},right:number(15)},y:{kind:'variable',variableId:'local-0'}}};
const pan=(id,x,y)=>({id,command:'EVENT_PAN_CAMERA',args:{x:{type:'number',value:x},y:{type:'number',value:y}}});
try {
 // This isolated camera harness does not provide the SRAM/scene save registry.
 const features=path.join(output,'native-features.h');
 fs.writeFileSync(features,fs.readFileSync(path.join(template,'include/gba_studio_features.h'),'utf8').replace('#define GBA_STUDIO_FEATURE_SAVE 1','#define GBA_STUDIO_FEATURE_SAVE 0'));
 const builder=new ResourceBuilder(output,template);
 const files=[
  builder.processResourceObject({_resourceType:'scene',id:'direct',backgrounds:[],script:[pan('direct-pan',312,-40)]}),
  builder.processResourceObject({_resourceType:'scene',id:'expression',backgrounds:[],script:[numericPan]}),
  builder.processResourceObject({_resourceType:'scene',id:'called',backgrounds:[],script:[{id:'call',command:'EVENT_CALL_SCRIPT',args:{scriptId:'outer'}}]}),
  builder.processResourceObject({_resourceType:'scripts',scripts:[{id:'inner',events:[numericPan,{id:'57881328-4fa6-4bbb-8495-051c598f8f23',version:1,command:'EVENT_CAMERA_STOP_FOLLOW',args:{}}],script:[pan('stale-pan',0,0)]},{id:'outer',events:[{id:'nested',command:'EVENT_CALL_SCRIPT',args:{scriptId:'inner'}}]}]}),
 ];
 fs.writeFileSync(path.join(include,'resources.h'),'#pragma once\n'+files.map(file=>`#include "${file.resourceName}"`).join('\n'));
 const handlers=fs.readFileSync(path.join(template,'src/script_event_handlers.cpp'),'utf8').replaceAll('\r\n','\n');
 const method=signature=>{const start=handlers.indexOf(signature);assert.ok(start>=0);return handlers.slice(start,handlers.indexOf('\n}\n',start)+2);};
 fs.writeFileSync(path.join(include,'camera_state.h'),'#pragma once\ninline int camera_x=0,camera_y=0,stop_calls=0;\nclass CameraManager {public:static CameraManager& instance(){static CameraManager value;return value;}void set_position(int x,int y){camera_x=x;camera_y=y;}void stop_follow(){++stop_calls;}};\n');
 const host=fs.readFileSync(path.join(scheduler,'handlers.cpp'),'utf8').replace('UNTESTED_HANDLER(CameraEventHandler, execute)',method('bool CameraEventHandler::execute(const void* args)')+'\n'+method('bool CameraEventHandler::execute(const CameraEventData& data)')).replace('bool CameraEventHandler::stop_follow() { std::abort(); }',method('bool CameraEventHandler::stop_follow()'));
 fs.writeFileSync(path.join(output,'handlers.cpp'),'#include "camera_state.h"\n'+host);
 fs.writeFileSync(path.join(output,'main.cpp'),`#include <cassert>
#include <iostream>
#include "script_command_manager.h"
#include "resources.h"
#include "camera_state.h"
#include "event_change_scene.h"
ChangeScene changeScene;
int read_variable(const char*){return 20;}
bool finish(const ScriptCommandData* data,int count){for(int i=0;i<20;i++)if(ScriptCommand::instance().execute("scene",data,count))return true;return false;}
int main(){assert(finish(SCENE_DIRECT_SCRIPTS,SCENE_DIRECT_SCRIPTS_COUNT));assert(camera_x==312&&camera_y==-40);ScriptCommand::instance().resetIndex();numeric_runtime_hooks.variable=read_variable;assert(finish(SCENE_EXPRESSION_SCRIPTS,SCENE_EXPRESSION_SCRIPTS_COUNT));assert(camera_x==21&&camera_y==20);ScriptCommand::instance().resetIndex();camera_x=0;camera_y=0;assert(finish(SCENE_CALLED_SCRIPTS,SCENE_CALLED_SCRIPTS_COUNT));assert(camera_x==21&&camera_y==20&&stop_calls==1);std::cout<<"Production compiler/scheduler/camera handler: direct OnInit and nested reusable scripts reach identical updated coordinates.\\n";}`);
 const exe=path.join(output,'camera.exe');
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-include',features,'-I',include,'-I',scheduler,'-I',path.join(root,'tests/native/support'),'-I',path.join(template,'include'),...['script_command_manager.cpp','event_wait.cpp','event_wait_input.cpp','variable_manager.cpp','script_trigger_manager.cpp'].map(file=>path.join(template,'src',file)),path.join(output,'handlers.cpp'),path.join(output,'main.cpp'),'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
} finally {fs.rmSync(output,{recursive:true,force:true});}
