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
const scenes=['a','b'].map((id,index)=>({id,name:id,x:40+index*350,y:80,width:240,height:160,gridSize:8,sceneType:'Top Down',backgrounds:[],actors:[],triggers:[],collisions:[],tileAnimations:animations}));
function Monitor(){const frames=useSceneTileAnimationFrames('monitor',animations,[],true);useEffect(()=>{window.animationUpdates=(window.animationUpdates??0)+1;},[frames]);return null;}
function Fixture(){const[settings,setSettings]=useState(initialSettings),[previews,setPreviews]=useState(initialPreviews),[layer,setLayer]=useState(null),[scale,setScale]=useState(1),[snap,setSnap]=useState(8),[utils,setUtils]=useState({tileEditSceneId:'a',tileEditLayerId:4,activeButton:'select',activeSubButton:'',localImagePath:'/images'});
window.setSnap=setSnap;window.setPreviews=setPreviews;window.settings=settings;window.previews=previews;window.setLayer=layer=>setUtils(previous=>({...previous,tileEditLayerId:layer}));window.targetDragging=isPlayerTargetDragging;window.setSettings=setSettings;window.reset=zoom=>{setSettings(initialSettings());setPreviews(initialPreviews());setScale(zoom);};
window.testContext={settings,setSettings:update=>setSettings(update),settingUtils:utils,setSettingUtils:setUtils,backgrounds:[],spriteResources:[],variables:{variables:[]},palettes:{palettes:[]},scenes,setScenes:()=>{},setElementSelected:()=>{},userSettings:{zoom:scale*100},prefabs:{prefabs:[]}};
const move=(id,target,x,y)=>setPreviews(previous=>previous.map(item=>item.id===id?{...item,target,x,y}:item));
return <ConfigProvider><App><DndContext><Monitor/><div style={{position:'relative',width:900,height:500,transform:'scale('+scale+')',transformOrigin:'top left'}}><div ref={setLayer} style={{position:'absolute',inset:0,zIndex:11,pointerEvents:'none'}}/>{scenes.map(scene=><GameElement key={scene.id} sceneObjectSnapSize={snap} sceneElement={scene} isSelected={scene.id==='a'} isDimmed={scene.id!=='a'} changeScenePreviews={previews.filter(item=>item.target===scene.id)} changeScenePreviewLayer={layer} onMoveChangeScenePreview={move} onSelect={()=>window.selections=(window.selections??0)+1}/>)}</div></DndContext></App></ConfigProvider>;}createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.testContext;' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://fixture.test/');
  await page.evaluate(() => window.electronAPI = { getCommonFontImages: async () => ({}), fetchImages: async () => ({ status: 'success', fileImages: [], localPath: '/images' }) });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const canvas = id => page.locator('canvas[data-scene-id="' + id + '"]');
  await page.waitForFunction(() => document.querySelector('canvas[data-scene-id="b"]')?.width === 240);
  const marker = id => page.getByTestId('scene-arrival-target-' + id);
  const samePosition = (a,b) => { assert.ok(Math.abs(a.x-b.x)<1); assert.ok(Math.abs(a.y-b.y)<1); };
  const destination = async (id,x,y) => { const r=await canvas(id).boundingBox();return {x:r.x+(x*16+8)/240*r.width,y:r.y+y*16/160*r.height}; };
  const start = async node => {const r=await node.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.waitForFunction(()=>window.targetDragging());};
  for (const zoom of [1,0.75,1.5]) {
    await page.evaluate(zoom => window.reset(zoom), zoom);
    await expect.poll(() => canvas('a').evaluate(node => Math.round(node.getBoundingClientRect().width))).toBe(240*zoom);
    await page.evaluate(() => window.setLayer(0));
    await expect(page.getByTestId('initial-player-target')).toBeVisible();
    await start(page.getByTestId('initial-player-target'));
    const frozen = await page.evaluate(() => window.animationUpdates);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.animationUpdates), frozen, 'Target drag pauses animated selected previews');
    const next = await destination('a',3,3);await page.mouse.move(next.x,next.y,{steps:4});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.targetDragging()),true,'State updates during movement must not release the drag pause');
    assert.equal(await page.evaluate(() => window.animationUpdates),frozen,'Animation remains frozen after target coordinates update');
    const edge = await canvas('a').boundingBox();
    await page.mouse.move(edge.x - 20, edge.y + edge.height + 20, { steps: 4 });
    await expect.poll(() => page.evaluate(() => [window.settings.startSceneId, window.settings.startX, window.settings.startY])).toEqual(['a', 0, 9.5]);
    assert.equal(await page.evaluate(() => window.targetDragging()), true, 'Dragging outside keeps the player active at the scene edge');
    await page.mouse.move(next.x, next.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => [window.settings.startX,window.settings.startY])).toEqual([3,3]);
    await expect.poll(() => page.evaluate(() => window.animationUpdates)).toBeGreaterThan(frozen);
    await page.evaluate(() => window.setLayer(4));
    const stationary = await marker('two').boundingBox();
    await start(marker('one'));
    const arrivalFrozen=await page.evaluate(()=>window.animationUpdates);
    const arrivalEdge = await canvas('a').boundingBox();
    await page.mouse.move(arrivalEdge.x - 20, arrivalEdge.y + arrivalEdge.height + 20, { steps: 4 });
    await expect.poll(() => page.evaluate(() => [window.previews[0].target, window.previews[0].x, window.previews[0].y])).toEqual(['a', 0, 9.5]);
    assert.equal(await page.evaluate(() => window.targetDragging()), true, 'Arrival target stays active at the scene edge outside the canvas');
    const other = await destination('b',4,4);await page.mouse.move(other.x,other.y,{steps:8});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.targetDragging()),true);
    assert.equal(await page.evaluate(()=>window.animationUpdates),arrivalFrozen,'Arrival target movement remains paused despite changing callbacks');
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.previews[0].target)).toBe('b');
    samePosition(await marker('two').boundingBox(),stationary);
    assert.deepEqual(await page.evaluate(() => [window.previews[1].x,window.previews[1].y]),[6,6]);
    await start(marker('one'));
    const overlap = await destination('a',6,6);await page.mouse.move(overlap.x,overlap.y,{steps:8});await page.mouse.up();
    await expect.poll(() => page.evaluate(() => [window.previews[0].target,window.previews[0].x,window.previews[0].y])).toEqual(['a',6,6]);
    samePosition(await marker('one').boundingBox(),await marker('two').boundingBox());
    await page.evaluate(() => window.setSettings(previous=>({...previous,startX:6,startY:6})));
    await expect.poll(async () => {
      const a = await page.getByTestId('initial-player-target').boundingBox(), b = await marker('two').boundingBox();
      return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
    }).toBeLessThan(1);
    assert.equal(await page.evaluate(() => window.targetDragging()),false);
  }
  for (const snap of [8,16]) {
    await page.evaluate(snap=>{window.reset(1);window.setSnap(snap);window.setPreviews(previous=>previous.map(item=>({...item,xUnit:'pixels',yUnit:'pixels'})));},snap);
    await expect.poll(()=>page.evaluate(()=>[window.settings.startX,window.previews[0].x])).toEqual([2,4]);
    const expected=snap===8?3.5:3;
    await start(page.getByTestId('initial-player-target'));
    const point=await destination('a',3.3,3.3);await page.mouse.move(point.x,point.y,{steps:4});await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>[window.settings.startX,window.settings.startY])).toEqual([expected,expected]);
    await start(marker('one'));await page.mouse.move(point.x,point.y,{steps:4});await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>[window.previews[0].x,window.previews[0].y])).toEqual([expected,expected]);
  }
  assert.equal(await page.evaluate(() => window.selections??0),0,'Target drags must not select a different scene on release');
  assert.deepEqual(errors,[]);
  console.log('Player targets: edit-mode dragging, animation pause/resume, dimmed scene transfer, stationary siblings, exact overlap and zoom passed.');
} finally { await browser.close(); }
