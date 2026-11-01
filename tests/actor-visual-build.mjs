import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-actor-visual-'));
try {
 fs.mkdirSync(path.join(temp,'include'));fs.mkdirSync(path.join(temp,'src'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const event=(command,args={})=>({id:command,command,args});
 const emit=script=>builder.processResourceObject({_resourceType:'scene',id:'visual',backgrounds:[],script}).headerContent.toString();
 const codes=['EVENT_ACTOR_SET_TINT','EVENT_ACTOR_SET_SATURATION','EVENT_ACTOR_SET_BRIGHTNESS','EVENT_ACTOR_SET_OPACITY'];
 const defaults=emit(codes.map(code=>event(code)));
 assert.match(defaults,/ActorVisualEventData[^\n]*= \{ "__PLAYER__", 100, 16777215, 1 \}/);
 assert.match(defaults,/ActorVisualEventData[^\n]*= \{ "__PLAYER__", 0, 16777215, 1 \}/);
 assert.match(emit([event(codes[0],{actorId:'npc',value:35,color:'#ff00aa'})]),/ActorVisualEventData[^\n]*= \{ "npc", 35, 16711850, 1 \}/);
 for(const code of codes) {
  assert.match(defaults,new RegExp('"'+code+'", &'));
  assert.throws(()=>emit([event(code,{value:101})]),/Invalid EVENT_ACTOR/);
 }
 assert.match(emit([event(codes[2],{value:-100})]),/"__PLAYER__", -100/);
 assert.match(emit([event(codes[2],{value:{kind:'variable',variableId:'light'}})]),/offsetof\(ActorVisualEventData, value\)/);
 assert.throws(()=>emit([event(codes[0],{color:'not-a-color'})]),/#RRGGBB/);
 assert.throws(()=>emit([event(codes[1],{actorId:''})]),/actorId/);
 const menu=fs.readFileSync('src/renderer/frontend/src/components/events/SelectNewEvent.tsx','utf8');
 const form=fs.readFileSync('src/renderer/frontend/src/components/events/RuntimeEventPanel.tsx','utf8');
 for(const code of codes){const name=code.replace('EVENT_','');assert.match(menu,new RegExp('EEvents\\.'+name));assert.match(form,new RegExp('case EEvents\\.'+name));}
 const native=fs.readFileSync('tools/butano/template/src/graphics_manager.cpp','utf8');
 const method=native.slice(native.indexOf('bool GraphicsManager::set_actor_visual_effect('),native.indexOf('bool GraphicsManager::set_actor_effect('));
 assert.doesNotMatch(method,/create_new|set_palette\(/,'Actor color effects must retain existing palette ownership');
 console.log('Actor visual events passed: defaults, typed ABI, color validation, value bounds, menu/forms and shared palette ownership.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
