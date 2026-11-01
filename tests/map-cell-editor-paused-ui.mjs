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
  await expect(page.getByTestId('tile-animation-0')).toBeVisible();
  await expect(page.getByRole('spinbutton',{name:'Map cell index',exact:true})).toHaveCount(0);
  await expect(page.getByRole('spinbutton',{name:'Map cell palette',exact:true})).toHaveCount(0);
  await expect(page.getByText('Map cell attributes (regular_bg)',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'plus Add',exact:true}).click();
  await expect(page.getByTestId('tile-animation-1')).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('Map cell attributes editor is paused; tile animations remain available.');
} finally {await browser.close();}
