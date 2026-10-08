import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawnSync}from'node:child_process';
const{default:ResourceBuilder}=await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-state-build-'));
try{fs.mkdirSync(path.join(temp,'include'));const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
const emit=args=>builder.processResourceObject({_resourceType:'scene',id:'states',backgrounds:[],script:[{id:'set-state',command:'EVENT_ACTOR_SET_STATE',args}]}).headerContent.toString();
assert.match(emit({actorId:'__PLAYER__',stateId:'state-b'}),/ActorStateEventData[^\n]*"__PLAYER__", "state-b"/);
assert.match(emit({actorId:'npc',stateId:'state-b'}),/"set-state", "EVENT_ACTOR_SET_STATE"/);
const header=emit({actorId:'npc',stateId:'state-b'});assert.match(header,/"EVENT_ACTOR_SET_STATE", &SCENE_STATES_ARGS_/);
const cpp=path.join(temp,'test.cpp');fs.writeFileSync(cpp,header+'\nint main(){return 0;}');
const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-I','tests/native/support','-I','tests/native/scheduler','-I','tools/butano/template/include',cpp,'-o',path.join(temp,'test.exe')],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
for(const args of [{},{actorId:'npc'},{stateId:'state-b'},{actorId:'npc',stateId:''},{actorId:'npc',stateId:2}])assert.throws(()=>emit(args));
console.log('Actor state compilation: typed payload, player/NPC targets and malformed inputs passed.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
