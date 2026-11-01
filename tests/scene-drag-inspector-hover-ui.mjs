import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{resolveDir:path.resolve('src/renderer/frontend/src'),loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';import{suspendInspectorHover}from'./utils/sceneDragInteraction';
window.moves=0;document.addEventListener('pointermove',()=>window.moves++);
function Harness(){const[preview,setPreview]=useState(false);window.addEventListener('gba-studio:event-preview-open',()=>setPreview(false));window.startDrag=()=>window.finishDrag=suspendInspectorHover();return <><div id="world" style={{width:400,height:200}}>World</div><div data-testid="right-panel-scroll" style={{position:'absolute',left:500,top:0,width:300,height:400}}><div id="event" onMouseEnter={()=>setPreview(true)} onMouseLeave={()=>setPreview(false)} style={{height:100}}>Event</div></div>{preview&&createPortal(<div role="region" aria-label="preview" style={{position:'fixed',left:240,top:10}}>Preview</div>,document.body)}</>;}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.locator('#event').hover();await expect(page.getByRole('region',{name:'preview'})).toBeVisible();
 await page.evaluate(()=>window.startDrag());await expect(page.getByRole('region',{name:'preview'})).toHaveCount(0);
 await page.locator('#world').hover();const before=await page.evaluate(()=>window.moves);await page.locator('#event').hover();
 await expect(page.getByRole('region',{name:'preview'})).toHaveCount(0);assert.ok(await page.evaluate(()=>window.moves)>before,'Document pointer movement must still reach the drag sensor');
 await page.evaluate(()=>window.finishDrag());await page.locator('#world').hover();await page.locator('#event').hover();await expect(page.getByRole('region',{name:'preview'})).toBeVisible();
 console.log('Scene drag hover isolation passed: existing previews close, inspector hover stays suspended, drag pointer movement continues, hover resumes after release.');
} finally {await browser.close();}
