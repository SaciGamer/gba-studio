import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend=path.resolve('src/renderer/frontend/src');
const ids=JSON.parse(fs.readFileSync('tools/verification/fixtures/actor-capacity-ids.json','utf8'));
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';import{DndContext}from'@dnd-kit/core';
import{I18nProvider}from'./i18n/I18n';import GameElement from'./components/gameWorld/GameElement';
const ids=${JSON.stringify(ids)};const sceneId=ids[0],spriteId=ids[1],prefabId=ids[2];
const spawn=id=>({id,version:1,command:'EVENT_SPAWN_ACTOR',args:{source:'prefab',prefabId,x:16,y:16}});
window.electronAPI=new Proxy({getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:'success',fileImages:[],images:[],projects:[],sounds:[],localPath:''}))});
function Harness(){
 const[scenes,setScenes]=useState([{id:sceneId,name:'Budget',x:16,y:16,width:240,height:160,gridSize:8,sceneType:'Adventure',backgrounds:[],actors:[],triggers:[],script:[spawn(ids[3]),spawn(ids[4])]}]);
 const[settingUtils,setSettingUtils]=useState({tileEditSceneId:sceneId,tileEditLayerId:4,activeButton:'add',activeSubButton:'Actor',localImagePath:''});
 const scene=scenes[0];window.scenes=scenes;window.replaceScene=changes=>setScenes(previous=>[{...previous[0],...changes}]);
 window.fullScene=()=>setScenes(previous=>[{...previous[0],script:[],actors:ids.slice(5,132).map(id=>({id,spriteId,x:16,y:16,width:16,height:8,anchor:'center'}))}]);
 window.repeated=()=>setScenes(previous=>[{...previous[0],actors:[],script:[{id:ids[3],command:'EVENT_WAIT_FOR_BUTTON',args:{buttons:['A']},children:{then:[spawn(ids[4])]}}]}]);
 window.context={scenes,setScenes,settingUtils,setSettingUtils,settings:{startSceneId:sceneId,playerSpriteId:spriteId,startX:0,startY:0},setSettings:()=>{},setElementSelected:()=>{},userSettings:{},palettes:{palettes:[]},spriteResources:[{id:spriteId,name:'Hero',filename:'hero.bmp',imageWidth:16,imageHeight:16,playerFrameWidth:16,playerFrameHeight:16}],variables:{variables:[]},prefabs:{prefabs:[{id:prefabId,type:'actor',actor:{id:ids[140],spriteId}}]},scripts:{scripts:[]},backgrounds:[]};
 return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language="pt_BR"><DndContext><GameElement sceneElement={scene} isSelected onSelect={()=>{}} onMoveChangeScenePreview={()=>{}}/></DndContext></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useAppContexts=()=>window.context;export default useAppContexts;',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:650}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.getByText('Sprites: 3/128',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.fullScene());await expect(page.getByText('Sprites: 128/128',{exact:true})).toBeVisible();
 await page.locator('canvas[data-scene-id]').evaluate(canvas=>{
  const rect=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,button:0,clientX:rect.left+220,clientY:rect.top+140}));
 });
 await expect.poll(()=>page.evaluate(()=>window.scenes[0].actors.length)).toBe(128);
 await expect(page.getByText('Sprites: 129/128',{exact:true})).toBeVisible();
 await expect(page.getByText('Esta cena já atingiu o limite de 128 sprites, incluindo o Player inicial.',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.repeated());await expect(page.getByText(/^Sprites: ≥\d+\/128$/)).toBeVisible();
 assert.deepEqual(errors,[]);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/scene-sprite-budget-ui.png'});
 console.log('Scene sprite budget UI passed: event-created sprites, initial player, 128/128 warning, placement beyond the warning and recurring button spawns.');
}finally{await browser.close();}
