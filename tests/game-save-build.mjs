import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';
const {default:ResourceBuilder}=await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const {createRuntimeFeatureManifest}=await import(pathToFileURL(path.resolve('dist/main/utils/builders/RuntimeFeatureManifest.js')));
const{toRuntimeResource}=await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-game-save-build-'));
try{
 fs.mkdirSync(path.join(temp,'include'));fs.mkdirSync(path.join(temp,'src'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const wait=id=>({id,command:'EVENT_WAIT',args:{units:'frames',frames:2}});
 const scene={_resourceType:'scene',id:'room',width:256,height:256,backgrounds:[],actors:[],script:[{id:'save',version:1,command:'EVENT_SAVE_WRITE',args:{slot:7},children:{then:[wait('on-save')],else:[wait('on-load')]}},{id:'load',command:'EVENT_SAVE_LOAD',args:{slot:7},children:{then:[wait('load-own-actions')]}},{id:'callback',command:'EVENT_SAVE_ON_LOAD',args:{}},{id:'remove',command:'EVENT_SAVE_REMOVE',args:{slot:7}}]};
 const file=builder.processResourceObject(scene);const header=file.headerContent.toString();
 assert.match(header,/GameDataEventData/);assert.match(header,/GameSavePoint/);assert.match(header,/SAVE_POINTS_COUNT = 1/);assert.match(header,/GameDataEventData[^\n]+true/);
 assert.doesNotMatch(header,/SaveEventData/);assert.match(header,/EVENT_SAVE_ON_LOAD/);assert.match(header,/EVENT_SAVE_REMOVE/);
 await builder.generateResourceRegistryClass([file],{projectName:'save',authorName:'test'});
 const registry=fs.readFileSync(path.join(temp,'src/resource_registry.cpp'),'utf8');assert.match(registry,/SAVE_POINTS\[index\]\.key == key/);assert.doesNotMatch(registry,/\{\{GAME_SAVE_LOOKUPS\}\}/);
 const features=createRuntimeFeatureManifest([toRuntimeResource(scene)]);for(const name of ['save','actors','variables'])assert.ok(features.modules.includes(name));assert.ok(features.sourceFiles.includes('src/save_game.cpp'));
 for(const command of ['EVENT_SAVE_WRITE','EVENT_SAVE_LOAD','EVENT_SAVE_REMOVE'])for(const slot of [-1,8,1.5,'first'])assert.throws(()=>builder.processResourceObject({...scene,script:[{id:'bad',version:1,command,args:{slot}}]}));
 console.log('Game save compiler passed: separate local Save/Load actions and legacy compatibility, typed payloads, remove, source registry, feature selection, malformed slots.');
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-game-save-build-'));fs.rmSync(temp,{recursive:true,force:true});}
