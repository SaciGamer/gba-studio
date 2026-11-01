import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import{useSceneTileAnimationFrames}from'./utils/tileAnimationPreview';import{usePanelResizeHandlers,setPanelResizeActive,isPanelResizing}from'./utils/panelResize';
const animations=[{id:'animation',layerId:0,targetTileIndex:0,frameTileIndices:[0,1,2,3],durationFrames:1,loop:true}],external=Symbol('external');
window.updates=0;window.externalResize=active=>setPanelResizeActive(external,active);window.isResizing=isPanelResizing;
function Scene(){const resize=usePanelResizeHandlers();window.startResize=resize.start;window.endResize=resize.end;const frames=useSceneTileAnimationFrames('selected',animations,[],true);useEffect(()=>{window.updates++;},[frames]);return <div data-testid="frame">{frames[0]?.frame}</div>;}
function App(){const[shown,setShown]=useState(true);window.showScene=setShown;return shown?<Scene/>:null;}createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect.poll(() => page.evaluate(() => window.updates)).toBeGreaterThan(3);
  await page.evaluate(() => window.startResize());
  const paused = await page.evaluate(() => window.updates);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.updates), paused, 'Selected scene freezes during panel resize');
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('gba-studio:world-pan', { detail: { paused: true } })); window.endResize(); });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.updates), paused, 'Ending resize must not resume a scene still paused for pan');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:world-pan', { detail: { paused: false } })));
  await expect.poll(() => page.evaluate(() => window.updates)).toBeGreaterThan(paused);
  await page.evaluate(() => { window.startResize(); window.externalResize(true); window.endResize(); });
  const nested = await page.evaluate(() => window.updates);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.updates), nested, 'Another active splitter keeps the scene paused');
  await page.evaluate(() => window.externalResize(false));
  await expect.poll(() => page.evaluate(() => window.updates)).toBeGreaterThan(nested);
  await page.evaluate(() => { window.startResize(); window.dispatchEvent(new Event('pointercancel')); });
  assert.equal(await page.evaluate(() => window.isResizing()), false, 'Cancelled resize releases the pause');
  await page.evaluate(() => { window.startResize(); window.showScene(false); });
  await expect(page.getByTestId('frame')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.isResizing()), false, 'Unmount releases an interrupted splitter');
  await page.evaluate(() => { window.externalResize(true); window.showScene(true); });
  await expect(page.getByTestId('frame')).toHaveCount(1);
  const initial = await page.evaluate(() => window.updates);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.updates), initial, 'New preview respects an already active resize');
  await page.evaluate(() => window.externalResize(false));
  await expect.poll(() => page.evaluate(() => window.updates)).toBeGreaterThan(initial);
  console.log('Panel resize pauses/resumes previews, preserves pan pauses and handles nested/cancelled/unmounted splitters.');
} finally { await browser.close(); }
