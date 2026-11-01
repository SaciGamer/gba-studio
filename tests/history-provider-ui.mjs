import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useContext}from'react';import{createRoot}from'react-dom/client';
import * as P from './providers/Providers';import{HistoryProvider,useHistory}from'./providers/HistoryProvider';
window.electronAPI={loadPreferences:async()=>({historyLimit:50}),subscribe:()=>()=>{}};
const sceneId='52482b06-507a-49f7-806c-61c559c466b3',otherId='838bf911-a22d-4ee8-93d2-7a4fdd845034';
function Harness(){
 const scene=useContext(P.SceneContext),sprite=useContext(P.SpriteContext),project=useContext(P.ProjectContext),selected=useContext(P.ElementContext),variables=useContext(P.VariablesContext),prefabs=useContext(P.PrefabsContext),settings=useContext(P.SettingsContext);
 const history=useHistory();
 window.read=()=>({name:scene.scenes[0]?.name,selected:selected.elementSelected?.id,canUndo:history.canUndo,canRedo:history.canRedo,dirty:scene.scenes[0]?._saved,variable: variables.variables.variables[0]?.initialValue,prefab:prefabs.prefabs.prefabs[0]?.name,limit:history.limit});
 window.seed=()=>{project.setProject({_saved:true,id:'60d0d1d0-d2a3-4ff2-81a9-5b710d565df8'});scene.setScenes([{id:sceneId,name:'Before',_saved:true,actors:[]},{id:otherId,name:'Other',_saved:true,actors:[]}]);sprite.setSpriteResources([{id:'769483f8-9b42-4584-bb11-fc815bc9b49b',_saved:true,tiles:Array(10000).fill(0)}]);selected.setElementSelected({id:sceneId});variables.setVariables({_saved:true,variables:[{id:'0101c128-ea28-4ef1-91fe-63fbc1be30e9',initialValue:0}]});prefabs.setPrefabs({_saved:true,prefabs:[{id:'ddcd732f-9c18-43f8-af66-40d845901f89',name:'Before'}]});};
 window.edit=(name='After')=>{scene.setScenes(previous=>previous.map((item,index)=>index?item:{...item,name,_saved:false}));};
 window.select=()=>selected.setElementSelected({id:otherId});
 window.save=()=>scene.setScenes(previous=>previous.map(item=>({...item,_saved:true})));
 window.editVariable=()=>variables.setVariables(previous=>({...previous,_saved:false,variables:previous.variables.map(item=>({...item,initialValue:10}))}));
 window.editPrefab=()=>prefabs.setPrefabs(previous=>({...previous,_saved:false,prefabs:previous.prefabs.map(item=>({...item,name:'After'}))}));
 window.remember=()=>{window.kept={sprite:sprite.spriteResources,other:scene.scenes[1],settings:settings.settings};};
 window.identities=()=>({sprite:window.kept.sprite===sprite.spriteResources,other:window.kept.other===scene.scenes[1],settings:window.kept.settings===settings.settings});
 window.clear=history.clearHistory;
 return <div tabIndex={0} id='editor'><button onClick={history.undo}>Undo</button><button onClick={history.redo}>Redo</button></div>;
}
const providers=Object.entries(P).filter(([name])=>name.endsWith('Provider')).map(([,Provider])=>Provider);
createRoot(document.getElementById('root')).render(providers.reduce((child,Provider)=><Provider>{child}</Provider>,<HistoryProvider><Harness/></HistoryProvider>));
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>window.seed());await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('Before');
 assert.equal(await page.evaluate(()=>window.read().canUndo),false,'loaded project is the baseline');
 await page.evaluate(()=>window.remember());await page.evaluate(()=>window.edit());await expect.poll(()=>page.evaluate(()=>window.read().canUndo)).toBe(true);
 await page.locator('#editor').focus();await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('Before');
 assert.deepEqual(await page.evaluate(()=>window.identities()),{sprite:true,other:true,settings:true});
 assert.equal(await page.evaluate(()=>window.read().dirty),false);
 await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('After');
 await page.evaluate(()=>window.save());await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('Before');
 await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('After');
 await page.evaluate(()=>window.select());await expect.poll(()=>page.evaluate(()=>window.read().selected)).toBe('838bf911-a22d-4ee8-93d2-7a4fdd845034');
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().selected)).toBe('52482b06-507a-49f7-806c-61c559c466b3');
 await page.evaluate(()=>window.editVariable());await expect.poll(()=>page.evaluate(()=>window.read().variable)).toBe(10);
 assert.equal(await page.evaluate(()=>window.read().canRedo),false,'a new edit clears redo');
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().variable)).toBe(0);
 await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>window.read().variable)).toBe(10);
 await page.evaluate(()=>window.editPrefab());await expect.poll(()=>page.evaluate(()=>window.read().prefab)).toBe('After');
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().prefab)).toBe('Before');
 await page.keyboard.press('Control+Shift+z');await expect.poll(()=>page.evaluate(()=>window.read().prefab)).toBe('After');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('gba-studio:history-limit',{detail:2})));
 await expect.poll(()=>page.evaluate(()=>window.read().limit)).toBe(2);
 for(const name of ['A','B','C']){await page.evaluate(name=>window.edit(name),name);await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe(name);}
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('B');
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.read().name)).toBe('A');
 assert.equal(await page.evaluate(()=>window.read().canUndo),false);
 await page.evaluate(()=>window.clear());await expect.poll(()=>page.evaluate(()=>window.read().canRedo)).toBe(false);
 assert.deepEqual(errors,[]);
 console.log('History UI passed: keyboard undo/redo, saved baseline, save acknowledgements, dirty flags, selection, variables, prefabs, retained resource identities, redo invalidation and history limits.');
}finally{await browser.close();}
