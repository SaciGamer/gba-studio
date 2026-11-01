import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import express from 'express';
import {chromium,expect} from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const sceneId='9b546bda-e28f-4950-89a4-010b7b180e28';
const tileId='e320cba3-5821-4fdf-8b3d-6d25c7d8dc72';
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,App}from'antd';import SettingsPanel from'./components/RightPanelGWSettings';
const scene={id:'${sceneId}',name:'Layer composition',x:20,y:20,width:32,height:16,gridSize:8,sceneType:'Adventure',backgrounds:[{layerId:3,backgroundId:'a761fbb9-77ab-4cb4-996f-e5bb3d31e7f9',x:0,y:0},{layerId:2,selectedTilesetId:'${tileId}',tileMap:[[0,-1,0,-1]],tileMapTilesetIds:[['${tileId}',null,'${tileId}',null]]},{layerId:0,backgroundId:'71fd274f-cefd-46b7-b6a9-2a7945a53f44',x:0,y:0}],actors:[],triggers:[],collisions:[]};
function Fixture(){const[scenes,setScenes]=useState([scene,{...scene,id:'d4612b62-7678-46d2-98f4-d8d7d80c4a98',name:'Tiles only',backgrounds:[scene.backgrounds[1]]}]);const[settings,setSettings]=useState({startSceneId:scene.id,startX:0,startY:0,startMoveSpeed:1,startAnimSpeed:4,startDirection:'down',colorMode:'mono'});const[project,setProject]=useState({name:'Test',author:'Test'});
window.moveCamera=()=>setScenes(previous=>previous.map(item=>({...item,cameraPosition:{x:16,y:0}})));
window.testContext={settings,setSettings,project,setProject,scenes,backgrounds:[{id:'a761fbb9-77ab-4cb4-996f-e5bb3d31e7f9',filename:'front.svg'},{id:'71fd274f-cefd-46b7-b6a9-2a7945a53f44',filename:'back.svg'}],spriteResources:[],palettes:{palettes:[]},settingUtils:{localImagePath:location.origin,projectPathFile:'fixture'}};
return <ConfigProvider><App><div style={{width:420}}><SettingsPanel controllerView={()=>{}}/></div></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.css':'empty','.png':'dataurl','.jpg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));
app.get('/:file.svg',(req,r)=>r.type('svg').send(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="${req.params.file==='front'?'red':req.params.file==='back'?'green':'blue'}" d="M0 0h${req.params.file==='front'?8:32}v16H0z"/></svg>`));
app.get('/',(_,r)=>r.type('html').send(`<html><body><div id="root"></div><script>window.electronAPI={loadPreferences:async()=>({}),getCommonFontImages:async()=>({}),fetchImages:async folder=>({status:'success',localPath:location.origin,fileImages:folder==='tilesets'?['${tileId}.svg']:[]}),readImageBytes:async src=>Array.from(new Uint8Array(await(await fetch(src)).arrayBuffer()))};</script><script src="/test.js"></script></body></html>`));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const selected=page.getByRole('img',{name:'Layer composition',exact:true}).locator('img');
 const pixel=(locator,x,y)=>locator.evaluate((image,{x,y})=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;canvas.getContext('2d').drawImage(image,0,0,240,160);return Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);},{x,y});
 await expect.poll(()=>pixel(selected,16,0)).toEqual([0,0,255,255]);
 assert.deepEqual(await pixel(selected,0,0),[255,0,0,255]);
 assert.deepEqual(await pixel(selected,8,0),[0,128,0,255]);
 await page.getByRole('combobox',{name:'Starting Scene',exact:true}).press('ArrowDown');
 const tileOnly=page.locator('.ant-select-dropdown:visible').getByRole('img',{name:'Tiles only',exact:true}).locator('img');
 await expect.poll(()=>pixel(tileOnly,0,0)).toEqual([0,0,255,255]);
 await page.locator('.ant-select-dropdown:visible').getByText('Tiles only',{exact:true}).click();
 const tileSelected=page.getByRole('img',{name:'Tiles only',exact:true}).locator('img').first();
 await expect.poll(()=>pixel(tileSelected,16,0)).toEqual([0,0,255,255]);
 await page.evaluate(()=>window.moveCamera());
 await expect.poll(()=>pixel(tileSelected,0,0)).toEqual([0,0,255,255]);
 await expect.poll(()=>pixel(tileSelected,16,0)).toEqual([0,0,0,0]);
 assert.deepEqual(errors,[]);
 console.log('Starting Scene selected label and dropdown passed: custom tiles without Game World, tile-only scenes, layer order, transparency and camera crop.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
