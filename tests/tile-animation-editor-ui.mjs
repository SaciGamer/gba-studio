import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve('.');
const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState,useMemo,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';
import {I18nProvider} from './src/renderer/frontend/src/i18n/I18n';import TileAnimationEditor from './src/renderer/frontend/src/components/TileAnimationEditor';
import {useSceneTileAnimationFrames,paintAnimatedTileset} from './src/renderer/frontend/src/utils/tileAnimationPreview';
function Harness(){
 const [language,setLanguage]=useState('en_US');const [hidden,setHidden]=useState([]);
 const [scene,setScene]=useState({id:'scene',selectedTilesetId:'test-tileset',width:16,height:16,backgrounds:[{layerId:0,tileMap:[[0,1],[2,3]],tileMapTilesetIds:[['test-tileset','alt-tileset'],['test-tileset','alt-tileset']]}],tileAnimations:[{id:'one',layerId:0,targetTileIndex:0,frameTileIndices:[1,2],durationFrames:120,initialFrame:0,loop:true},{id:'two',layerId:1,targetTileIndex:2,frameTileIndices:[0,1],durationFrames:8,initialFrame:0,loop:true}]});
 const tileset=useMemo(()=>{const image=document.createElement('canvas');image.width=16;image.height=16;const c=image.getContext('2d');['#ff0000','#00ff00','#0000ff','#ffff00'].forEach((color,i)=>{c.fillStyle=color;c.fillRect((i%2)*8,Math.floor(i/2)*8,8,8)});return {image,tileWidth:8,tileHeight:8,columns:2,rows:2};},[]);
 const frames=useSceneTileAnimationFrames(scene.id,scene.tileAnimations,hidden.map(id=>'scene:'+id),true,{0:'test-tileset'});const canvas=useRef(null);
 useEffect(()=>{const c=canvas.current.getContext('2d');c.clearRect(0,0,16,16);c.drawImage(paintAnimatedTileset(tileset.image,0,frames,'test-tileset'),0,0);},[frames,tileset]);
 window.tileScene=scene;window.hiddenAnimations=hidden;window.setLanguage=setLanguage;window.sourceIsolation=paintAnimatedTileset(tileset.image,0,frames,'alt-tileset')===tileset.image;
 return <ConfigProvider><I18nProvider language={language}><canvas id="scene-canvas" ref={canvas} width={16} height={16}/>
 <div id="scroll" style={{position:'absolute',top:30,right:20,width:380,height:300,overflow:'auto'}}><TileAnimationEditor scene={scene} layerId={0} tileset={tileset} loadedLayerTilesets={[{...tileset,id:'test-tileset',name:'Test Tileset'},{...tileset,id:'alt-tileset',name:'Alt Tileset'}]} hiddenAnimationIds={hidden} onToggleAnimation={id=>setHidden(previous=>previous.includes(id)?previous.filter(item=>item!==id):[...previous,id])} onChange={tileAnimations=>setScene(previous=>({...previous,tileAnimations}))} onSceneChange={setScene}/></div></I18nProvider></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.join(root, 'src/renderer/frontend/tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const first = page.getByTestId('tile-animation-0');
  await expect(first.getByRole('button', { name: 'Animation 1', exact: true })).toBeVisible();
  await expect(page.getByTestId('tile-animation-1')).toHaveCount(0);
  await expect(first.getByRole('combobox')).toHaveCount(0);
  const scenePixel = () => page.locator('#scene-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0,0,1,1).data]);
  await expect.poll(scenePixel).toEqual([0,255,0,255]);
  assert.equal(await page.evaluate(() => window.sourceIsolation),true,'An animation must not paint another source tileset (including an autotile sheet).');
  await first.getByRole('button', { name: 'Hide Animation 1 in Scene preview' }).click();
  await expect.poll(scenePixel).toEqual([255,0,0,255]);
  assert.equal(await page.evaluate(() => window.tileScene.tileAnimations.length),2);
  await first.getByRole('button', { name: 'Show Animation 1 in Scene preview' }).click();
  await expect.poll(scenePixel).toEqual([0,255,0,255]);
  await first.getByRole('button', { name: 'Choose tile: Destination tile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Destination tile' });
  await expect(dialog.getByRole('button', { name: /^Choose tile \d$/ })).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Choose tile 0', exact: true })).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button', { name: 'Choose tile 3', exact: true }).click();
  assert.equal(await page.evaluate(() => window.tileScene.tileAnimations.find(animation=>animation.id==='one').targetTileIndex),3);
  await first.getByRole('button', { name: 'Frame 1: tile 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Choose tile 2', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.tileScene.tileAnimations.find(animation=>animation.id==='one').frameTileIndices),[2,2]);
  await first.getByRole('button', { name: 'Add frame', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Frame source tileset' }).getByRole('button', { name: 'Alt Tileset' })).toBeVisible();
  await page.getByRole('group', { name: 'Frame source tileset' }).getByRole('button', { name: 'Alt Tileset' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Choose tile 1', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.tileScene.tileAnimations.find(animation=>animation.id==='one').frameTileIndices),[2,2,1]);
  assert.deepEqual(await page.evaluate(() => window.tileScene.tileAnimations.find(animation=>animation.id==='one').frameTilesetIds),['test-tileset','test-tileset','alt-tileset']);
  // All numeric fields use the same composed addon/input as Image position.
  for(const name of ['Destination tile','Duration in frames','Initial frame']) {
    const input=first.getByRole('spinbutton',{name,exact:true});
    assert.ok(await input.evaluate(element=>Boolean(element.closest('.ant-space-compact'))),name);
  }
  // TODO: Restore assertions when Map cell attributes editing resumes.
//   for(const name of ['Map cell index','Map cell tile','Map cell palette']) {
//     const input=page.getByRole('spinbutton',{name,exact:true});
//     assert.equal(await input.evaluate(element=>Boolean(element.closest('[data-testid="tile-animation-0"]'))),false,name);
//   }
  await first.hover();
  const preview=page.getByRole('region',{name:'Tile animation preview'});
  await expect(preview).toBeVisible();
  assert.equal(await preview.evaluate(element=>element.parentElement===document.body),true);
  const [cardBounds,previewBounds]=await Promise.all([first.boundingBox(),preview.boundingBox()]);
  assert.ok(previewBounds.x+previewBounds.width<=cardBounds.x-8,'Preview must stay outside the inspector');
  const top=previewBounds.y;
  await page.locator('#scroll').evaluate(element=>element.scrollTop=50);
  await expect.poll(async()=>Math.round((await preview.boundingBox()).y)).toBeLessThan(Math.round(top));
  await page.locator('#scroll').evaluate(element=>element.scrollTop=0);
  fs.mkdirSync('.tmp', { recursive: true });
  await page.screenshot({ path: '.tmp/tile-animation-editor.png' });
  await first.getByRole('button',{name:'Animation 1',exact:true}).click();
  await expect(first.getByRole('button',{name:'Animation 1',exact:true})).toHaveAttribute('aria-expanded','false');
  await expect(first.getByRole('spinbutton')).toHaveCount(0);
  await expect(first.getByRole('button',{name:'Remove Animation 1',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Tile animation preview'})).toHaveCount(0);
  await first.getByRole('button',{name:'Animation 1',exact:true}).click();
  await expect(first.getByRole('spinbutton',{name:'Destination tile',exact:true})).toHaveValue('3');
  await page.evaluate(()=>window.setLanguage('pt_BR'));
  await expect(first.getByRole('button',{name:'Animação 1',exact:true})).toBeVisible();
  await first.getByTestId('tile-animation-title').click();
  const renameInput = first.getByRole('textbox', { name: 'Renomear Animação 1' });
  await renameInput.fill('Água');
  await first.getByRole('textbox', { name: 'Renomear Água' }).press('Enter');
  assert.equal(await page.evaluate(() => window.tileScene.tileAnimations.find(animation=>animation.id==='one').name),'Água');
  await first.getByRole('button',{name:'Remover Água',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.tileScene.tileAnimations.length),1);
  assert.deepEqual(errors,[]);
  console.log('Tile animations UI: visual picker, frames, collapse/remove, themed numeric fields, external preview, scrolling, Scene visibility and localization passed.');
} finally { await browser.close(); }
