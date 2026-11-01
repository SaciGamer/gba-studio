import assert from 'node:assert/strict';import fs from 'node:fs';import {build} from 'esbuild';
const engine=fs.readFileSync('src/renderer/frontend/src/components/pages/engine/Engine.tsx','utf8');
const start=engine.indexOf('    const activeScenes = scenes.filter');const end=engine.indexOf('\n  }, [loading, scenes,',start);assert.ok(start>0&&end>start);
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import {LOCAL_VARIABLES} from './src/shared/localVariables';
import {clearMissingEventReferences,clearMissingAssetReferences,repairCallScriptArguments} from './src/shared/events/sceneReferenceCleanup';
export function reconcile(scenes, prefabs){let output=scenes;let prefabOutput=prefabs;
const scripts={scripts:[]},variables={variables:[]},availableMusic=new Set(),backgrounds=[],spriteResources=[],settings={};
const setScenes=value=>output=value,setElementSelected=()=>{},setScripts=()=>{},setPrefabs=value=>prefabOutput=value,setSettings=()=>{};
${engine.slice(start,end)}
return {scenes:output,prefabs:prefabOutput};}
`},bundle:true,write:false,format:'esm',platform:'node'});
const {reconcile}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const event=id=>({id:'79a09364-85e8-4545-a011-0a7922d5b066',version:1,command:'EVENT_VARIABLE',args:{variableId:id,value:{kind:'literal',type:'number',value:7}}});
for(const slot of 'ABCDEFGH'){
 const local='__LOCAL__:'+slot;
 const actor={id:'4c8aad40-c559-43cc-b511-bbc7df9fd6f8',onInitScript:[event(local)],onUpdateScript:[event(local)]};
 const trigger={id:'9bb7ff1b-caa0-48cc-b8b6-8b05c461ebd4',onEnterScript:[event(local)]};
 const scene={id:'965a1739-2c74-4f71-bb85-986a3b56de2c',_resourceType:'scene',actors:[actor],triggers:[trigger],script:[]};
 const prefabs={prefabs:[{type:'actor',actor}]};
 const result=reconcile([scene],prefabs);
 assert.equal(result.scenes[0].actors[0].onInitScript[0].args.variableId,local);
 assert.equal(result.scenes[0].actors[0].onUpdateScript[0].args.variableId,local);
 assert.equal(result.scenes[0].triggers[0].onEnterScript[0].args.variableId,local);
 assert.equal(result.prefabs.prefabs[0].actor.onInitScript[0].args.variableId,local);
 const second=reconcile(result.scenes,result.prefabs);assert.equal(second.scenes[0],result.scenes[0],'Reconciliation must stabilize');
 const invalid=reconcile([{...scene,script:[event(local)],actors:[{...actor,onInitScript:[event('removed-global')]}]}],prefabs);
 assert.equal(invalid.scenes[0].script[0].args.variableId,undefined,'Scene scope cannot retain locals');
 assert.equal(invalid.scenes[0].actors[0].onInitScript[0].args.variableId,undefined,'Deleted global references still cleared');
}
console.log('Actual Engine reconciliation: all eight local selections persist in actors, triggers and prefabs; scene scope/deleted references still repaired; repeated updates stabilize.');
