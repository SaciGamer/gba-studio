import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparePrefabSpawns, PREFAB_SPAWN_CAPACITY } from '../dist/main/utils/builders/PrefabSpawns.js';
import ResourceBuilder from '../dist/main/utils/builders/ResourceBuilder.js';
import { toRuntimeResource, toRuntimeScene } from '../dist/main/utils/types/RuntimeResources.js';

const resource=jsonContent=>({jsonContent,resourceName:'',resourceType:'gbasres',headerContent:Buffer.alloc(0)});
const spawn=(id,prefabId='prefab')=>({id,version:1,command:'EVENT_SPAWN_ACTOR',args:{source:'prefab',prefabId,x:32,y:48}});
const library=resource({_resourceType:'prefabs',prefabs:[{id:'prefab',name:'Enemy',type:'actor',actor:{id:'source-actor',spriteId:'hero',animationSpeed:3,onInitScript:[{id:'init',command:'EVENT_ACTOR_SET_STATE',args:{actorId:'source-actor',stateId:'walk'}}],onUpdateScript:[{id:'wait',command:'EVENT_WAIT',args:{units:'frames',frames:10}}]}},{id:'trigger',type:'trigger',trigger:{}}]});
const scene=resource({_resourceType:'scene',id:'scene',name:'Scene',sceneType:'Adventure',width:240,height:160,actors:[{id:'placed',spriteId:'hero'}],backgrounds:[],script:[spawn('first'),spawn('second')]});
const originalScene=scene.jsonContent,original=JSON.stringify(originalScene),prefabOriginal=JSON.stringify(library.jsonContent);
const files=[library,scene];preparePrefabSpawns(files);
assert.equal(PREFAB_SPAWN_CAPACITY,128);
assert.equal(scene.jsonContent.actors.length,3);
assert.equal(JSON.stringify(library.jsonContent),prefabOriginal);
assert.equal(JSON.stringify(originalScene),original,'Preparation must not mutate the saved scene object');
const actors=scene.jsonContent.actors.slice(1);
assert.equal(new Set(actors.map(actor=>actor.id)).size,2);
assert.ok(actors.every(actor=>actor.spriteId==='hero'&&actor.spawnPrefabId==='prefab'&&actor.onInitScript[0].args.actorId==='__SELF__'));
assert.notEqual(actors[0].onInitScript[0].id,actors[1].onInitScript[0].id);
preparePrefabSpawns(files);assert.equal(scene.jsonContent.actors.length,3,'Repeated preparation must not duplicate the pool');
const runtime=toRuntimeScene(scene.jsonContent);
assert.equal(runtime.actors.filter(actor=>actor.spawnPrefabId==='prefab').length,2);
for (const command of ['EVENT_SPAWN_ACTOR','EVENT_ACTOR_SPAWN']) {
 const event={...spawn('shared-prefab'),command,args:{source:'prefab',prefabId:'prefab',x:{kind:'property',actorId:'__PLAYER__',property:'xPixels'},y:{kind:'property',actorId:'__PLAYER__',property:'yPixels'}}};
 const shared=toRuntimeResource({_resourceType:'scripts',id:'scripts',scripts:[{id:'dead-zone',name:'s_dead_zone',events:[event]}]});
 assert.equal(shared.scripts[0].events[0].version,1,'Reusable scripts must accept prefab spawn schema version 1');
 assert.deepEqual(shared.scripts[0].events[0].args,event.args,'Player-property spawn coordinates must survive runtime projection');
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-prefab-spawn-'));
try{
 fs.mkdirSync(path.join(temp,'include'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const header=builder.processRuntimeResource(runtime).headerContent.toString();
 assert.match(header,/ActorSpawnEventData[^\n]*"prefab", 32, 48, true/);
 assert.match(header,/ACTORS_COUNT = 3/);
 assert.ok(header.includes(`"${actors[0].id}", "walk"`));
 const legacy=builder.processResourceObject({_resourceType:'scene',id:'legacy',script:[{id:'old',command:'EVENT_SPAWN_ACTOR',args:{actorId:'placed',x:1,y:2}}]}).headerContent.toString();
 assert.match(legacy,/ActorSpawnEventData[^\n]*"placed", 1, 2, false/);
 assert.throws(()=>builder.processResourceObject({_resourceType:'scene',id:'invalid',script:[{id:'bad',command:'EVENT_SPAWN_ACTOR',args:{source:'prefab',x:0,y:0}}]}),/prefabId is required/);
 for (const command of ['EVENT_REMOVE_ACTOR','EVENT_ACTOR_DESPAWN']) {
  const removal=toRuntimeScene({_resourceType:'scene',id:'remove-scene',actors:[],script:[{id:'remove',command,args:{source:'prefab',prefabId:'prefab'}}]});
  const generated=builder.processRuntimeResource(removal).headerContent.toString();
  assert.match(generated,/ActorRemoveEventData[^\n]*"prefab", true/);
  const legacyRemoval=builder.processResourceObject({_resourceType:'scene',id:'legacy-remove',script:[{id:'remove',command,args:{actorId:'placed'}}]}).headerContent.toString();
  assert.match(legacyRemoval,/ActorRemoveEventData[^\n]*"placed", false/);

  assert.throws(()=>builder.processResourceObject({_resourceType:'scene',id:'bad-remove',script:[{id:'remove',command,args:{source:'prefab'}}]}),/prefabId is required/);
 }
 assert.throws(()=>preparePrefabSpawns([library,resource({_resourceType:'scene',script:[spawn('missing','missing')]})]),/missing actor prefab/);
 assert.throws(()=>preparePrefabSpawns([library,resource({_resourceType:'scene',script:[spawn('trigger','trigger')]})]),/missing actor prefab/);
 assert.throws(()=>preparePrefabSpawns([resource({_resourceType:'prefabs',prefabs:[{id:'prefab',type:'actor',actor:{spriteId:''}}]}),resource({_resourceType:'scene',script:[spawn('no-sprite')]})]),/has no sprite/);
 const reusable=resource({_resourceType:'scripts',scripts:[{id:'method',events:[spawn('library-spawn')]}]});
 const blank=resource({_resourceType:'scene',id:'blank',actors:[],script:[{id:'call',command:'EVENT_CALL_SCRIPT',args:{scriptId:'method'}}]});
 const unused=resource({_resourceType:'scene',id:'unused',actors:[],script:[]});preparePrefabSpawns([library,reusable,blank,unused]);assert.equal(blank.jsonContent.actors.length,1);assert.equal(unused.jsonContent.actors.length,0);
 console.log('Prefab spawning: independent prepared actors/scripts, Self binding, reusable scripts, legacy payloads, idempotence and invalid resources passed.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
