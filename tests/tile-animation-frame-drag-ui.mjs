import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('.');
const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState,useMemo} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';
import {I18nProvider} from './src/renderer/frontend/src/i18n/I18n';
import TileAnimationEditor from './src/renderer/frontend/src/components/TileAnimationEditor';
function Harness(){
 const [scene,setScene]=useState({id:'scene',selectedTilesetId:'a',backgrounds:[{layerId:0,tileMap:[[0]]}],tileAnimations:[{id:'one',layerId:0,targetTileIndex:0,frameTileIndices:[0,1,2],frameTilesetIds:['a','b','a'],durationFrames:8,initialFrame:0,loop:true}]});
 const tileset=useMemo(()=>{const image=document.createElement('canvas');image.width=24;image.height=8;return {image,tileWidth:8,tileHeight:8,columns:3,rows:1};},[]);
 window.animation=scene.tileAnimations[0];
 return <ConfigProvider><I18nProvider language="en_US"><div style={{width:380}}><TileAnimationEditor scene={scene} layerId={0} tileset={tileset} loadedLayerTilesets={[{...tileset,id:'a',name:'A'},{...tileset,id:'b',name:'B'}]} onChange={tileAnimations=>setScene(previous=>({...previous,tileAnimations}))}/></div></I18nProvider></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.join(root, 'src/renderer/frontend/tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const frames = page.getByTestId('tile-animation-0').locator('[data-frame-index]');
  await expect(frames).toHaveCount(3);
  const frame = index => frames.locator(`xpath=self::*[@data-frame-index="${index}"]`);
  const order = () => frames.evaluateAll(elements => elements.map(element => Number(element.dataset.frameIndex)));
  const original = await frame(0).boundingBox();
  const destination = await frame(2).boundingBox();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await frame(0).dispatchEvent('dragstart', { dataTransfer: transfer });
  await frame(2).dispatchEvent('mouseover');
  await expect(frame(2).getByRole('button', { name: 'Copy frame 3', exact: true })).toHaveCSS('opacity', '0');
  await expect(frame(2).getByRole('button', { name: 'Frame 3: tile 2', exact: true })).toHaveCSS('pointer-events', 'none');
  await frame(2).dispatchEvent('dragover', { dataTransfer: transfer });
  await expect.poll(order).toEqual([1,2,0]);
  const placeholder = page.locator('[data-drag-placeholder="true"]');
  await expect(placeholder).toHaveCSS('opacity', '0');
  const reserved = await placeholder.boundingBox();
  assert.equal(reserved.width, original.width);
  assert.equal(reserved.height, original.height);
  assert.equal(reserved.x, destination.x);
  assert.equal(reserved.y, destination.y);
  assert.deepEqual(await page.evaluate(() => window.animation.frameTileIndices), [0,1,2], 'Preview must not save the order');
  await placeholder.dispatchEvent('drop', { dataTransfer: transfer });
  await expect.poll(() => page.evaluate(() => window.animation.frameTileIndices)).toEqual([1,2,0]);
  assert.deepEqual(await page.evaluate(() => window.animation.frameTilesetIds), ['b','a','a']);
  assert.equal(await page.evaluate(() => window.animation.initialFrame), 2);
  await expect(placeholder).toHaveCount(0);
  await frame(0).dispatchEvent('dragstart', { dataTransfer: transfer });
  await frame(2).dispatchEvent('dragover', { dataTransfer: transfer });
  await expect.poll(order).toEqual([1,2,0]);
  await frame(0).dispatchEvent('dragend', { dataTransfer: transfer });
  await expect.poll(order).toEqual([0,1,2]);
  assert.deepEqual(await page.evaluate(() => window.animation.frameTileIndices), [1,2,0]);
  assert.deepEqual(errors, []);
  console.log('Background frame drag: full-size destination placeholder, live order, commit, tileset/initial-frame references and cancellation passed.');
} finally { await browser.close(); }
