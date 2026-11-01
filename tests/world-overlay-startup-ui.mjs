import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useRef,useState}from'react';import{FloatButton}from'antd';import{createRoot}from'react-dom/client';import useWorldOverlayPosition from './components/gameWorld/useWorldOverlayPosition';
window.frames=[];
function World(){const ref=useRef(null);const[loading,setLoading]=useState(true);const[selected,setSelected]=useState(false);window.selectScene=setSelected;const[layout,setLayout]=useState({left:260,top:80,width:600,height:420});const position=useWorldOverlayPosition(ref,loading,selected);window.finishLoading=()=>setLoading(false);window.resizeWorld=setLayout;
if(loading)return <div>Loading</div>;
return <><div ref={ref} data-testid="viewport" style={{position:'absolute',...layout,background:'#333'}}/><div ref={position.overlayRef} data-testid="overlays" style={{visibility:position.measured?'visible':'hidden'}}>
<div data-testid="floating" style={{position:'fixed',left:'var(--gba-world-left)',top:'var(--gba-world-top)',width:40,height:40}}><FloatButton.Group style={{position:'absolute',inset:0}}><FloatButton/></FloatButton.Group></div>
<div data-testid="coordinates" style={{position:'fixed',left:'var(--gba-world-left)',bottom:'var(--gba-world-bottom)',width:'max-content',maxWidth:'var(--gba-hud-info-width)',display:'var(--gba-hud-info-display)',height:16,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>Very long scene name / Global world position / Tile X: 200 / Tile Y: 300 / Scale 100% / Snap Free</div>
<div data-testid="estimates" style={{position:'fixed',right:'var(--gba-world-right)',bottom:'var(--gba-world-bottom)',width:selected&&layout.width>=390?346:168,display:'var(--gba-hud-usage-display)',height:selected&&layout.width<390?106:44}}/>
<div data-testid="minimap" style={{position:'fixed',right:'var(--gba-world-right)',bottom:'calc(var(--gba-world-bottom) + var(--gba-hud-minimap-bottom))',width:'var(--gba-hud-minimap-width)',height:'calc(var(--gba-hud-minimap-height) + 52px)',display:'var(--gba-hud-minimap-display)'}}/>
</div></>;}
function frame(){const viewport=document.querySelector('[data-testid="viewport"]');if(viewport){const group=document.querySelector('[data-testid="overlays"]');if(getComputedStyle(group).visibility==='visible'){const rect=viewport.getBoundingClientRect();const ids=['floating','coordinates','estimates','minimap'];window.frames.push({viewport:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},hud:Object.fromEntries(ids.map(id=>{const r=document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();return[id,{left:r.left,top:r.top,right:r.right,bottom:r.bottom}];}))});}}requestAnimationFrame(frame);}requestAnimationFrame(frame);createRoot(document.getElementById('root')).render(<World/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const app=express();app.get('/app.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,r)=>r.send('<html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'));
const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-world-overlay-'));
fs.writeFileSync(path.join(temporary,'main.cjs'),`const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try{electronApp=await electron.launch({args:[path.join(temporary,'main.cjs')]});const page=await electronApp.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.waitForFunction(()=>window.finishLoading);await expect(page.getByTestId('floating')).toHaveCount(0);
await page.evaluate(()=>window.finishLoading());await expect.poll(()=>page.evaluate(()=>window.frames.length)).toBeGreaterThan(0);
function check(frame){assert.equal(frame.hud.floating.left,frame.viewport.left+12);assert.equal(frame.hud.floating.top,frame.viewport.top+15);assert.equal(frame.hud.coordinates.left,frame.viewport.left+12);assert.equal(frame.hud.coordinates.bottom,frame.viewport.bottom-12);assert.equal(frame.hud.estimates.right,frame.viewport.right-12);assert.equal(frame.hud.estimates.bottom,frame.viewport.bottom-12);assert.equal(frame.hud.minimap.right,frame.viewport.right-12);assert.equal(frame.hud.minimap.bottom,frame.viewport.bottom-74);}
check(await page.evaluate(()=>window.frames[0]));
await page.evaluate(()=>window.resizeWorld({left:300,top:90,width:500,height:350}));
await expect.poll(()=>page.getByTestId('floating').evaluate(node=>Math.round(node.getBoundingClientRect().left))).toBe(312);
await expect.poll(()=>page.evaluate(()=>window.frames.at(-1).hud.minimap.right)).toBe(788);
check(await page.evaluate(()=>window.frames.at(-1)));
// Inspect in ResizeObserver itself, before a queued React render can repair lag.
const resizeFrames = await page.evaluate(async () => {
  const viewport = document.querySelector('[data-testid="viewport"]');
  const frames = [];
  const read = node => { const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; };
  const observer = new ResizeObserver(() => frames.push({ viewport: read(viewport), hud: Object.fromEntries(['floating','coordinates','estimates','minimap'].map(id => [id, read(document.querySelector('[data-testid="'+id+'"]'))])) }));
  observer.observe(viewport);
  for (let index = 0; index < 20; index++) {
    await new Promise(requestAnimationFrame);
    Object.assign(viewport.style, { left: (200 + index * 4) + 'px', top: (60 + index * 2) + 'px', width: (620 - index * 5) + 'px', height: (440 - index * 3) + 'px' });
  }
  await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  observer.disconnect(); return frames;
});
assert.ok(resizeFrames.length >= 15, 'Continuous resize captures enough intermediate layouts');
resizeFrames.forEach(check);
for (const selected of [false,true]) {
await page.evaluate(selected => window.selectScene(selected), selected);
for (const size of [{width:120,height:100},{width:230,height:160},{width:280,height:320},{width:600,height:120},{width:600,height:500}]) {
  await page.evaluate(size => window.resizeWorld({left:200,top:60,...size}), size);
  await expect.poll(() => page.getByTestId('viewport').evaluate(node => Math.round(node.getBoundingClientRect().width))).toBe(size.width);
  await expect.poll(() => page.getByTestId('overlays').evaluate(node => node.style.getPropertyValue('--gba-hud-minimap-width'))).toBe(Math.min(192, Math.max(0,size.width-98))+'px');
  const boxes = await page.evaluate(() => {
    const rect = node => {const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
    return {viewport:rect(document.querySelector('[data-testid="viewport"]')),items:['coordinates','estimates','minimap'].flatMap(id=>{const node=document.querySelector('[data-testid="'+id+'"]');return getComputedStyle(node).display==='none'?[]:[{id,...rect(node)}];})};
  });
  for(const item of boxes.items){assert.ok(item.left>=boxes.viewport.left && item.right<=boxes.viewport.right,item.id+' stays inside a narrow viewport');assert.ok(item.top>=boxes.viewport.top && item.bottom<=boxes.viewport.bottom,item.id+' stays inside a short viewport');}
  if(size.width<180){await expect(page.getByTestId('minimap')).toBeHidden();await expect(page.getByTestId('coordinates')).toBeHidden();}
  const info=boxes.items.find(item=>item.id==='coordinates'),usage=boxes.items.find(item=>item.id==='estimates');if(info&&usage)assert.ok(info.right<usage.left,'Global info and resource counters do not overlap');
}
}

assert.deepEqual(errors,[]);
console.log('World overlays: floating controls, coordinates, estimates and minimap positioned correctly on first visible frame and during continuous viewport resize, before React commits, passed.');
}finally{await electronApp?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
