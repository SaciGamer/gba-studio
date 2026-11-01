import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const frontend = path.resolve('src/renderer/frontend/src');
const source = fs.readFileSync(path.join(frontend, 'components/gameWorld/GameElement.tsx'), 'utf8');
const start = source.indexOf('{sceneElement.showCamera && uiTextEvents.map');
const end = source.indexOf('{!isTileEditingScene && actorPositionPreview', start);
const sceneUiText = source.slice(start, end);
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {resolveTextTemplate} from '../../../shared/textTemplate';
import {coordinatePixels} from '../../../shared/events/coordinateUnits';
import {fontCharacterWidth,fontGlyphIndex,PREVIEW_FONTS} from './utils/fontMetrics';
function Scene(){const[value,setValue]=useState(42);window.setValue=setValue;const sceneElement={showCamera:true,width:240,height:160},commonFontImages={},canvasRef={current:null};
const variables={variables:[{id:'3e089418-5bba-4e48-b24b-3e59e313a9d4',symbol:'score',type:'number',initialValue:value}]};
const uiTextEvents=[{id:'c6810dcd-0fc9-430a-bf54-e236bb3bd02e',args:{text:'Score: \\u0024{score}',x:0,y:0}}];
return <div>${sceneUiText}</div>;}
createRoot(document.getElementById('root')).render(<Scene/>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const glyphs = page.getByLabel('UI text preview').locator(':scope > span > span');
  await expect(glyphs).toHaveCount('Score: 42'.length);
  const initial = await glyphs.last().getAttribute('style');
  await page.evaluate(() => window.setValue(100));await expect(glyphs).toHaveCount('Score: 100'.length);
  assert.notEqual(await glyphs.last().getAttribute('style'), initial);
  console.log('Production scene UI text resolves variable values and updates glyphs when the initial value changes.');
} finally { await browser.close(); }
