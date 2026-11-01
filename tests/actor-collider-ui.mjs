import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState,useCallback,useEffect}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,App}from'antd';import{DndContext}from'@dnd-kit/core';import GameElement from'./components/gameWorld/GameElement';import{useSceneTileAnimationFrames}from'./utils/tileAnimationPreview';import{isPlayerTargetDragging}from'./utils/playerTargetDrag';
const animations=[{id:'anim',layerId:0,targetTileIndex:0,frameTileIndices:[0,1,2,3],durationFrames:1,loop:true}];
const initialPreviews=()=>[{id:'one',target:'a',x:4,y:4,direction:'right'},{id:'two',target:'a',x:6,y:6,direction:'right'}];
const initialSettings=()=>({startSceneId:'a',startX:2,startY:2,startDirection:'right'});
const initialScenes=()=>['a','b'].map((id,index)=>({id,name:id,x:40+index*350,y:80,width:240,height:160,gridSize:8,sceneType:'Top Down',backgrounds:[],actors:id==='a'?[{id:'105a9686-2e3f-487e-b226-4627594d34b3',spriteId:'f10391c9-68d2-49d3-9167-79b6f45b8d28',name:'Collider actor',anchor:'center',x:160,y:80,width:16,height:8}]:[],triggers:id==='a'?[{id:'013d6cd9-7244-4b7a-a5e1-f3cc25dc94ed',x:40,y:100,width:32,height:16}]:[],collisions:[],tileAnimations:animations}));
function Monitor(){const frames=useSceneTileAnimationFrames('monitor',animations,[],true);useEffect(()=>{window.animationUpdates=(window.animationUpdates??0)+1;},[frames]);return null;}
function Fixture(){const[scenes,setScenes]=useState(initialScenes);const[settings,setSettings]=useState(initialSettings),[previews,setPreviews]=useState(initialPreviews),[layer,setLayer]=useState(null),[scale,setScale]=useState(1),[snap,setSnap]=useState(8),[utils,setUtils]=useState({tileEditSceneId:'a',tileEditLayerId:4,activeButton:'select',activeSubButton:'',localImagePath:'/images'});
window.setSnap=setSnap;window.setEditing=editing=>setUtils(previous=>({...previous,tileEditSceneId:editing?'a':null}));window.scenes=scenes;window.reloadActors=()=>setScenes(JSON.parse(JSON.stringify(window.scenes)));window.toggleColliders=show=>setScenes(previous=>previous.map(scene=>({...scene,actors:scene.actors.map(actor=>({...actor,showCollider:show}))})));window.settings=settings;window.previews=previews;window.setLayer=layer=>setUtils(previous=>({...previous,tileEditLayerId:layer}));window.targetDragging=isPlayerTargetDragging;window.setSettings=setSettings;window.reset=zoom=>{setSettings(initialSettings());setPreviews(initialPreviews());setScale(zoom);};
window.testContext={settings,setSettings:update=>setSettings(update),settingUtils:utils,setSettingUtils:setUtils,backgrounds:[],spriteResources:[{id:'f10391c9-68d2-49d3-9167-79b6f45b8d28',playerCollisionX:-4,playerCollisionY:2,playerCollisionWidth:12,playerCollisionHeight:6}],variables:{variables:[]},palettes:{palettes:[]},scenes,setScenes:()=>{},setElementSelected:()=>{},userSettings:{zoom:scale*100},prefabs:{prefabs:[]}};
const move=(id,target,x,y)=>setPreviews(previous=>previous.map(item=>item.id===id?{...item,target,x,y}:item));
return <ConfigProvider><App><DndContext><Monitor/><div style={{position:'relative',width:900,height:500,transform:'scale('+scale+')',transformOrigin:'top left'}}><div ref={setLayer} style={{position:'absolute',inset:0,zIndex:11,pointerEvents:'none'}}/>{scenes.map(scene=><GameElement key={scene.id} sceneObjectSnapSize={snap} sceneElement={scene} isSelected={scene.id==='a'} isDimmed={scene.id!=='a'} changeScenePreviews={previews.filter(item=>item.target===scene.id)} changeScenePreviewLayer={layer} onMoveChangeScenePreview={move} onSelectObject={(type,id)=>window.actorSelection={type,id}} onSelect={()=>window.selections=(window.selections??0)+1}/>)}</div></DndContext></App></ConfigProvider>;}createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.testContext;' }));
} }] });
const browser = await chromium.launch({headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="root"></div>');
 await page.evaluate(()=>window.electronAPI={getCommonFontImages:async()=>({}),fetchImages:async()=>({status:'success',fileImages:[],localPath:'/images'})});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const selector=page.locator('[id="scene-edit-target-a-105a9686-2e3f-487e-b226-4627594d34b3"]');
 await expect(selector).toHaveCSS('pointer-events','auto');
 await expect(selector.locator('svg rect')).toHaveAttribute('fill','rgba(22,119,255,.18)');
 await selector.click();assert.deepEqual(await page.evaluate(()=>window.actorSelection),{type:'actor',id:'105a9686-2e3f-487e-b226-4627594d34b3'});
 const trigger=page.locator('[id="scene-edit-target-a-013d6cd9-7244-4b7a-a5e1-f3cc25dc94ed"]');
 await expect(trigger).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(trigger.locator('rect')).toHaveAttribute('fill','rgba(82,196,26,.16)');
 await expect(trigger.locator('rect')).toHaveAttribute('width','31');
 await expect(trigger.locator('rect')).toHaveAttribute('height','15');
 for(const grid of [8,16]) {
   await page.evaluate(grid=>window.setSnap(grid),grid);await page.waitForTimeout(30);
   const box=await selector.boundingBox(),canvas=await page.locator('canvas[data-scene-id="a"]').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(canvas.x+41,canvas.y+41,{steps:4});
   await expect(selector).toHaveCSS('left','32px');await expect(selector).toHaveCSS('top',grid===8?'40px':'32px');
   await page.mouse.up();
 }
 const collider=page.getByTestId('actor-collider-105a9686-2e3f-487e-b226-4627594d34b3');
 await expect(collider).toHaveCount(0);
 await page.evaluate(()=>window.toggleColliders(true));await expect(collider).toBeVisible();
 await expect(collider).toHaveCSS('left','4px');await expect(collider).toHaveCSS('top','6px');
 await expect(collider).toHaveCSS('width','12px');await expect(collider).toHaveCSS('height','6px');
 await expect(collider.locator('rect')).toHaveAttribute('stroke-dasharray','3 2');await expect(collider.locator('rect')).toHaveAttribute('stroke-width','0.5');await expect(collider.locator('rect')).toHaveAttribute('fill','rgba(255,77,79,.18)');
 await page.evaluate(()=>window.reloadActors());await expect(collider).toBeVisible();
 await page.evaluate(()=>window.setEditing(false));await expect(collider).toHaveCount(0);
 await page.evaluate(()=>window.setEditing(true));await expect(collider).toBeVisible();
 await page.evaluate(()=>window.toggleColliders(false));await expect(collider).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('Actor collider preview passed: off by default, toggle, sprite collision offsets and dimensions, hide again.');
} finally {await browser.close();}
