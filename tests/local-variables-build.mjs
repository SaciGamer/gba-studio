import assert from 'node:assert/strict';
import { validateRuntimeReferences } from '../dist/main/utils/types/RuntimeResources.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const event={id:'b7d3e912-0cc9-4fa9-8473-9dedc76b837e',version:1,command:'EVENT_VARIABLE',args:{variableId:'__LOCAL__:A',value:{kind:'literal',type:'number',value:5}}};
const reset={...event,command:'EVENT_LOCAL_VARIABLE_RESET',args:{}};
const scene={_resourceType:'scene',id:'8bad1054-fbde-43c4-9f21-42b7abb4919d',name:'Locals',width:240,height:160,backgrounds:[],actors:[],triggers:[],collisions:[],spawnerTimelines:[],script:[]};
for(const owner of ['actor','trigger']) {
 const resource=structuredClone(scene);
 if(owner==='actor') resource.actors=[{id:'f35e0ac1-3eb6-49da-bc48-3a051d5acc32',onInitScript:[event],onUpdateScript:[reset],onInteractScript:[]}];
 else resource.triggers=[{id:'defc7f00-ef9d-4a0c-9a3c-717f28ede0fb',onEnterScript:[event],onLeaveScript:[reset]}];
 validateRuntimeReferences([resource]);
 assert.ok(createRuntimeFeatureManifest([resource]).modules.includes('variables'));
}
for(const command of [event,reset]) assert.throws(()=>validateRuntimeReferences([{...scene,script:[command]}]),/scope|actor or trigger/);
assert.throws(()=>validateRuntimeReferences([{...scene,script:[{...event,command:'EVENT_VARIABLES_SAVE',args:{slot:7,allVariables:false,variableIds:['__LOCAL__:A']}}]}]),/global variables/);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-local-build-'));
try {fs.mkdirSync(path.join(temporary,'include'));const builder=new ResourceBuilder(temporary,path.resolve('tools/butano/template'));
 const header=builder.processResourceObject({...scene,script:[event,reset]}).headerContent.toString();
 assert.ok(header.includes('__LOCAL__:A'));assert.ok(header.includes('EVENT_LOCAL_VARIABLE_RESET'));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
console.log('Local variables: actor/trigger scope, reset registration, generated payload, global-only saves and module selection passed.');
