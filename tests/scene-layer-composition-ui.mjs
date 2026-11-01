import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import express from 'express';
import {chromium,expect} from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const sceneId='9b546bda-e28f-4950-89a4-010b7b180e28';
const tileId='e320cba3-5821-4fdf-8b3d-6d25c7d8dc72';
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,App}from'antd';import{DndContext}from'@dnd-kit/core';import GameElement from'./components/gameWorld/GameElement';
import{getCachedSceneCanvas,deleteCachedSceneCanvas,getCachedSceneRenderParts}from'./utils/sceneRenderCache';
const scene={id:'${sceneId}',name:'Layer composition',x:20,y:20,width:32,height:16,gridSize:8,sceneType:'Adventure',backgrounds:[{layerId:3,backgroundId:'a761fbb9-77ab-4cb4-996f-e5bb3d31e7f9',x:0,y:0},{layerId:2,selectedTilesetId:'${tileId}',tileMap:[[0,-1,0,-1]],tileMapTilesetIds:[['${tileId}',null,'${tileId}',null]]},{layerId:0,backgroundId:'71fd274f-cefd-46b7-b6a9-2a7945a53f44',x:0,y:0}],actors:[],triggers:[],collisions:[]};
function Fixture(){const[utils,setUtils]=useState({tileEditSceneId:null,tileEditLayerId:4,activeButton:'select',localImagePath:location.origin,projectPathFile:'fixture'});const[hidden,setHidden]=useState([]);
window.setEdit=layer=>setUtils(previous=>({...previous,tileEditSceneId:layer===null?null:scene.id,tileEditLayerId:layer??4}));window.setHidden=setHidden;
window.layerOrder=()=>scene.backgrounds.map(layer=>layer.layerId);
window.cachePixel=(x,y)=>Array.from(getCachedSceneCanvas(scene.id)?.getContext('2d').getImageData(x,y,1,1).data??[]);
window.cacheParts=()=>Boolean(getCachedSceneRenderParts(scene.id)?.foreground);
window.testContext={backgrounds:[{id:'a761fbb9-77ab-4cb4-996f-e5bb3d31e7f9',filename:'front.svg'},{id:'71fd274f-cefd-46b7-b6a9-2a7945a53f44',filename:'back.svg'}],spriteResources:[],variables:{variables:[]},palettes:{palettes:[]},settingUtils:utils,setSettingUtils:setUtils,settings:{},setSettings:()=>{},setScenes:()=>{},setElementSelected:()=>{},userSettings:{zoom:100,hiddenBackgroundLayers:hidden}};
return <ConfigProvider><App><DndContext><GameElement sceneElement={scene} isSelected={true} onSelect={()=>{}}/></DndContext></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));
app.get('/:file.svg',(req,r)=>r.type('svg').send(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="${req.params.file==='front'?'red':req.params.file==='back'?'green':'blue'}" d="M0 0h${req.params.file==='front'?8:32}v16H0z"/></svg>`));
app.get('/',(_,r)=>r.type('html').send(`<html><body><div id="root"></div><script>window.electronAPI={getCommonFontImages:async()=>({}),fetchImages:async folder=>({status:'success',localPath:location.origin,fileImages:folder==='tilesets'?['${tileId}.svg']:[]}),readImageBytes:async src=>Array.from(new Uint8Array(await(await fetch(src)).arrayBuffer()))};</script><script src="/test.js"></script></body></html>`));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await expect.poll(()=>page.evaluate(()=>window.cachePixel(0,0))).toEqual([255,0,0,255]);
 await expect.poll(()=>page.evaluate(()=>window.cachePixel(16,0))).toEqual([0,0,255,255]);
 assert.deepEqual(await page.evaluate(()=>window.cachePixel(8,0)),[0,128,0,255]);
 assert.equal(await page.evaluate(()=>window.cacheParts()),true);
 assert.deepEqual(await page.evaluate(()=>window.layerOrder()),[3,2,0],'Rendering must not reorder saved layers');
 await expect(page.getByTestId('scene-foreground-layers')).toBeAttached();
 await page.evaluate(()=>window.setEdit(2));
 const pixel=()=>page.locator('canvas[data-scene-id]').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,1,1).data));
 await expect.poll(async()=> (await pixel())[0]).toBeGreaterThan(0);
 await expect.poll(async()=> (await pixel())[2]).toBeGreaterThan(0);
 await page.evaluate(()=>window.setEdit(null));
 await expect.poll(()=>page.evaluate(()=>window.cachePixel(0,0))).toEqual([255,0,0,255]);
 await page.evaluate(id=>window.setHidden([id+':3']),sceneId);
 await expect.poll(()=>page.evaluate(()=>window.cachePixel(0,0))).toEqual([0,0,255,255]);
 assert.deepEqual(errors,[]);
 console.log('Real scene preview passed: custom layer 2 below background 3, transparency, complete cache, hidden layers, edit/world transitions and immutable order.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
