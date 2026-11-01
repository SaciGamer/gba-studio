import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-motion-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const emit = (command, args) => builder.processResourceObject({ _resourceType: 'scene', id:'motion', backgrounds:[], script:[{id:'event',command,args:{actorId:'__PLAYER__',x:24,y:40,...args}}] }).headerContent.toString();
  for (const command of ['EVENT_PAN_CAMERA','EVENT_CAMERA_MOVE_TO','EVENT_MOVE_ACTOR','EVENT_ACTOR_MOVE_TO']) {
    const type = command.includes('CAMERA') ? 'CameraEventData' : 'ActorMoveEventData';
    assert.match(emit(command,{animated:true,speed:0.25}),new RegExp(type+'[^\\n]*24, 40, true, 64'));
    assert.match(emit(command,{animated:false,speed:2}),new RegExp(type+'[^\\n]*24, 40 \\}'));
    for (const speed of [0,17,'fast']) assert.throws(()=>emit(command,{animated:true,speed}));
    assert.throws(()=>emit(command,{animated:'yes',speed:1}));
  }
  assert.match(emit('EVENT_CAMERA_MOVE_TO',{}),/CameraEventData[^\n]*true, 256/);
  assert.match(emit('EVENT_ACTOR_MOVE_TO',{}),/ActorMoveEventData[^\n]*true, 256/);
  assert.doesNotMatch(emit('EVENT_PAN_CAMERA',{}),/true, 256/);
  assert.doesNotMatch(emit('EVENT_MOVE_ACTOR',{}),/true, 256/);
  assert.match(emit('EVENT_MOVE_ACTOR',{animated:true,speed:0.5,animationSpeed:8}),/ActorMoveEventData[^\n]*true, 128, 8/);
  assert.match(emit('EVENT_MOVE_ACTOR',{animated:true,speed:1,animationSpeed:0}),/ActorMoveEventData[^\n]*true, 256, 0/);
  for(const animationSpeed of [-1,9,1.5,'fast']) assert.throws(()=>emit('EVENT_MOVE_ACTOR',{animated:true,animationSpeed}));
  for(const command of ['EVENT_MOVE_ACTOR','EVENT_ACTOR_MOVE_TO']) {
    assert.match(emit(command,{animated:true,collideWalls:false,collideActors:true,lockDirection:'vertical',movementType:'diagonal'}),/true, 256, -1, false, true, 2, 2/);
    assert.match(emit(command,{animated:false,collideWalls:true,collideActors:false,lockDirection:'horizontal',movementType:'vertical-first'}),/false, 256, -1, true, false, 1, 1/);
    for(const args of [{collideWalls:'yes'},{collideActors:1},{lockDirection:'diagonal'},{movementType:'random'},{xUnit:'yards'},{yUnit:'yards'}]) assert.throws(()=>emit(command,args));
  }
  console.log('Motion event compilation: speed toggle, fractional rates, To aliases, instant legacy events and malformed payloads passed.');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
