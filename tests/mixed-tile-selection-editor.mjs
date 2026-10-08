import assert from 'node:assert/strict';import path from 'node:path';
import {build} from 'esbuild';import express from 'express';import {chromium} from 'playwright';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,App}from'antd';import{DndContext}from'@dnd-kit/core';import GameElement from'./components/gameWorld/GameElement';
const empty=()=>Array.from({length:12},()=>Array(16).fill(-1));
const map=empty(),autoTileMap=empty(),ids=Array.from({length:12},()=>Array(16).fill(null));
autoTileMap[2][2]=0;for(let y=2;y<4;y++)for(let x=2;x<4;x++){map[y][x]=0;ids[y][x]='auto-tile:auto';}
map[2][5]=0;ids[2][5]='tiles';
const initial={id:'scene',name:'Mixed',x:40,y:40,width:128,height:96,gridSize:8,sceneType:'Top Down',backgrounds:[{layerId:0,tileMap:map,tileMapTilesetIds:ids,autoTileMap,tileMapCellOverrides:[{index:37,tileIndex:0,horizontalFlip:true}]}],actors:[],triggers:[],collisions:[]};
function Fixture(){const[scenes,setScenes]=useState([initial]);const[utils,setUtils]=useState({tileEditSceneId:'scene',tileEditLayerId:0,activeButton:'select',activeSubButton:'',localImagePath:location.origin,projectPathFile:'fixture'});
window.scenes=scenes;window.reset=()=>setScenes([structuredClone(initial)]);
window.testContext={backgrounds:[],spriteResources:[],variables:{variables:[]},palettes:{palettes:[]},settingUtils:utils,setSettingUtils:setUtils,settings:{autoTileSlots:[{autoTileId:'auto',tileSize:16,parts:Array(47).fill(0)}]},setSettings:()=>{},setScenes,setElementSelected:()=>{},userSettings:{zoom:100,showTileEditorGrid:true}};
return <ConfigProvider><App><DndContext><GameElement sceneElement={scenes[0]} isSelected={true} onSelect={()=>{}} onMoveChangeScenePreview={()=>{}}/></DndContext></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));
for(const name of ['auto','tiles'])app.get('/'+name+'.svg',(_,r)=>r.type('svg').send(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path fill="${name==='auto'?'green':'blue'}" d="M0 0h64v64H0z"/></svg>`));
app.get('/',(_,r)=>r.type('html').send(`<html><body><div id="root"></div><script>window.electronAPI={getCommonFontImages:async()=>({}),fetchImages:async folder=>({status:'success',localPath:location.origin,fileImages:folder==='auto-tiles'?['auto.svg']:folder==='tilesets'?['tiles.svg']:[]}),readImageBytes:async src=>Array.from(new Uint8Array(await(await fetch(src)).arrayBuffer()))};</script><script src="/test.js"></script></body></html>`));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const canvas=page.locator('canvas[data-scene-id="scene"]');await canvas.waitFor();await page.waitForFunction(()=>document.querySelector('canvas[data-scene-id]')?.width===128);
 const box=await canvas.boundingBox(),point=(col,row)=>({x:box.x+col*8+4,y:box.y+row*8+4});
 async function drag(a,b){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();}
 // Start the area directly on an occupied autotile, ending on a regular tile.
 await drag(point(2,2),point(5,3));await page.keyboard.press('Control+c');
 await page.mouse.move(point(8,4).x,point(8,4).y);await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>window.scenes[0].backgrounds[0].autoTileMap[4]?.[8]===0);
 let layer=await page.evaluate(()=>window.scenes[0].backgrounds[0]);assert.equal(layer.autoTileMap[2][2],0);assert.equal(layer.tileMapTilesetIds[4][11],'tiles');assert.ok(layer.tileMapCellOverrides.some(item=>item.index===75&&item.horizontalFlip));
 // Drag the selected mixed area; source units disappear and destination retains identity.
 await drag(point(8,4),point(10,6));await page.waitForFunction(()=>window.scenes[0].backgrounds[0].autoTileMap[6]?.[10]===0);
 layer=await page.evaluate(()=>window.scenes[0].backgrounds[0]);assert.equal(layer.autoTileMap[4][8],-1);assert.equal(layer.tileMapTilesetIds[6][13],'tiles');assert.equal(layer.autoTileMap[2][2],0);
 await page.keyboard.press('Control+x');await page.waitForFunction(()=>window.scenes[0].backgrounds[0].autoTileMap[6]?.[10]===-1);
 await page.mouse.move(point(6,8).x,point(6,8).y);await page.keyboard.press('Control+v');await page.waitForFunction(()=>window.scenes[0].backgrounds[0].autoTileMap[8]?.[6]===0);
 await page.keyboard.press('Delete');await page.waitForFunction(()=>window.scenes[0].backgrounds[0].autoTileMap[8]?.[6]===-1);
 assert.deepEqual(errors,[]);
 console.log('Real map editor mixed selection passed: rectangle from occupied autotile, tileset/autotile copy, paste, drag move, cut, delete and preserved flips.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
