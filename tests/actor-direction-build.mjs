import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { toRuntimeResource } from '../dist/main/utils/types/RuntimeResources.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-actor-direction-'));
const code='EVENT_ACTOR_SET_DIRECTION',id='9174e7bb-fd6d-42ae-9227-cf5335311cd3';
try {
 fs.mkdirSync(path.join(temp,'include'));fs.mkdirSync(path.join(temp,'src'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const event=(args={})=>({id,command:code,version:1,args});
 const scene=script=>({_resourceType:'scene',id:'da6829a4-c61a-4946-aea2-e8e5f2d1ef40',backgrounds:[],script});
 const emit=events=>builder.processResourceObject(scene(events)).headerContent.toString();
 assert.match(emit([event()]),/ActorDirectionEventData[^\n]*= \{ "__PLAYER__", 2 \}/);
 for(const [index,direction] of ['up','right','down','left'].entries()) {
  const result=emit([event({actorId:'__SELF__',direction})]);
  assert.match(result,new RegExp(`ActorDirectionEventData[^\\n]*= \\{ "__SELF__", ${index} \\}`));
  assert.match(result,/"EVENT_ACTOR_SET_DIRECTION", &/);
 }
 for(const args of [{actorId:''},{actorId:1},{direction:'north'},{direction:3}]) assert.throws(()=>emit([event(args)]),/Invalid/);
 assert.throws(()=>emit([{...event(),version:2}]),/unsupported schema version/);
 const resource=scene([{id:'e713f79e-e3a1-4e7e-94b3-07dbbb131d10',command:'EVENT_IF',args:{left:{kind:'literal',type:'number',value:1},right:{kind:'literal',type:'number',value:1},operator:'=='},children:{then:[event({direction:'left'})],else:[{...event({direction:'right'}),id:'e6a9e49e-cc66-4b44-8424-3c27e9df0b9c'}]}}]);
 const nested=builder.processResourceObject(resource).headerContent.toString();
 assert.equal([...nested.matchAll(/"EVENT_ACTOR_SET_DIRECTION", &/g)].length,2);
 const manifest=createRuntimeFeatureManifest([toRuntimeResource(scene([event()]))]);
 assert.ok(manifest.modules.includes('actors')&&manifest.modules.includes('graphics'));
 console.log('Direction event defaults, four typed directions, Self, malformed payloads, schema 1, nested branches and runtime features passed.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
