import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { toRuntimeResource } from '../dist/main/utils/types/RuntimeResources.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-effects-trigger-'));
const ids = ['12fb7ac1-f9a9-4630-bff4-ff850a8af3d0','de82ab93-5e4d-4883-824c-93034a537cca','471c5677-71c7-47bf-b2e3-d13f94aa5ea1','4b8c8b40-e46c-4689-9dbc-69df593e83ab'];
try {
 fs.mkdirSync(path.join(temp,'include'));fs.mkdirSync(path.join(temp,'src'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const event=(command,args={},id=ids[0])=>({id,command,args,version:1});
 const scene=script=>({_resourceType:'scene',id:ids[1],backgrounds:[],script,triggers:[{id:ids[2],x:0,y:0,width:16,height:16,enabled:false}]});
 const emit=script=>builder.processResourceObject(scene(script)).headerContent.toString();
 const rotation='EVENT_ACTOR_SET_ROTATION',scale='EVENT_ACTOR_SET_SCALE',trigger='EVENT_TRIGGER_SET_ENABLED';
 assert.match(emit([event(rotation)]),/ActorTransformEventData[^\n]*= \{ "__PLAYER__", 0, 1 \}/);
 assert.match(emit([event(scale)]),/ActorTransformEventData[^\n]*= \{ "__PLAYER__", 100, 1 \}/);
 const custom=emit([event(rotation,{actorId:'__SELF__',angle:-90,durationFrames:30}),event(scale,{actorId:'__PLAYER__',scale:200,durationFrames:60},ids[3])]);
 assert.match(custom,/"__SELF__", -90, 30/);assert.match(custom,/"__PLAYER__", 200, 60/);
 assert.match(emit([event(rotation,{angle:{kind:'variable',variableId:'angle'}})]),/offsetof\(ActorTransformEventData, value\)/);
 assert.match(emit([event('EVENT_ACTOR_SET_TINT',{value:75,color:'#000000',durationFrames:20})]),/ActorVisualEventData[^\n]*"__PLAYER__", 75, 0, 20/);
 assert.match(emit([event(trigger,{triggerId:ids[2]})]),/TriggerEnabledEventData[^\n]*true/);
 assert.match(emit([event(trigger,{triggerId:ids[2],enabled:false})]),/TriggerEnabledEventData[^\n]*false/);
 for(const [code,args] of [[rotation,{angle:181}],[rotation,{durationFrames:0}],[scale,{scale:0}],[scale,{actorId:''}],[scale,{scale:Infinity}],[trigger,{}],[trigger,{triggerId:3}],[trigger,{triggerId:ids[2],enabled:1}]]) {
  assert.throws(()=>emit([event(code,args)]),/Invalid|Select a trigger/,`${code}: ${JSON.stringify(args)}`);
 }
 const manifest=createRuntimeFeatureManifest([toRuntimeResource(scene([event(rotation),event(scale),event(trigger,{triggerId:ids[2]})]))]);
 assert.ok(manifest.modules.includes('sprite-effects')&&manifest.modules.includes('triggers'));
 const valid=builder.processResourceObject(scene([event(trigger,{triggerId:ids[2]})]));
 await builder.generateResourceRegistryClass([valid],{projectName:'trigger',authorName:'',version:'1.0.0'});
 const invalid=builder.processResourceObject(scene([event(trigger,{triggerId:ids[3]})]));
 await assert.rejects(()=>builder.generateResourceRegistryClass([invalid],{projectName:'trigger',authorName:'',version:'1.0.0'}),/trigger .* does not exist/);
 // Saved combined commands still compile while new scripts use independent events.
 assert.match(emit([event('EVENT_SPRITE_EFFECT',{actorId:'__PLAYER__',scale:150,visible:false})]),/SpriteEffectEventData/);
 console.log('Independent effect and trigger defaults, ABI, numeric values, validation, references and legacy compilation passed.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
