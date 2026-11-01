import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';

const root = path.resolve('.'), frontend = path.join(root, 'src/renderer/frontend/src');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-palette-editor-'));
const paletteA = 'b26458cb-5e43-4bd6-abaa-f320cd768bc9', paletteB = '9452dc69-7e0d-4d16-b86c-ec3d955886d8';
let app;
try {
  const bundle = await build({ stdin: { contents: `
import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {ConfigProvider} from 'antd'; import {I18nProvider} from './i18n/I18n';
import {ChangePaletteBackgroundEvent} from './components/events/BackgroundEvents';
function Test() { const [args,setArgs]=useState({paletteIds:[]}); return <ConfigProvider><I18nProvider language="pt_BR"><div style={{padding:24,width:300}}><ChangePaletteBackgroundEvent event={{id:'bb6267c2-aa6b-43da-a8e0-09c5cf162876',args}} onValueChange={(_,value)=>setArgs(value)}/><output>{JSON.stringify(args)}</output></div></I18nProvider></ConfigProvider>; }
createRoot(document.getElementById('root')).render(<Test/>);`, resolveDir: frontend, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-context', setup(bundler) { bundler.onLoad({ filter: /providers[\\/]contexts[\\/]AppContexts\.tsx$/ }, () => ({ contents: `export default function useAppContexts(){return {palettes:{palettes:[{id:'${paletteA}',name:'Red',colors:Array(16).fill('#f00')},{id:'${paletteB}',name:'Blue',colors:Array(16).fill('#00f')}]},elementSelected:{sceneType:'Adventure',script:[],backgrounds:[]},backgrounds:[],settingUtils:{},settings:{colorPaletteIds:['${paletteA}','${paletteB}']}}}`, loader: 'tsx' })); } }] });
  fs.writeFileSync(path.join(temp, 'app.js'), bundle.outputFiles[0].text);
  fs.writeFileSync(path.join(temp, 'index.html'), '<meta charset="utf-8"><div id="root"></div><script src="app.js"></script>');
  fs.writeFileSync(path.join(temp, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const win=new BrowserWindow({width:500,height:500,show:false,webPreferences:{offscreen:true}});win.loadFile(${JSON.stringify(path.join(temp, 'index.html'))});});`);
  app = await electron.launch({ args: [path.join(temp, 'main.cjs')] });
  const page = await app.firstWindow();
  await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'components/themes/globalStyles.css'), 'utf8') });
  await page.getByText('Palette overrides (16 slots)', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox').count(), 16);
  assert.equal(await page.locator('.ant-select-clear').count(), 0);
  const defaultItem = page.locator('.palette-slot-select').first().locator('.ant-select-selection-item');
  assert.equal(await defaultItem.evaluate(element => getComputedStyle(element).opacity), '0.35');
  const swatch = await defaultItem.locator(':scope > span').boundingBox();
  assert.ok(swatch.width >= 44 && swatch.height >= 44, 'Palette preview must fill the square: '+JSON.stringify(swatch));
  for (const box of await page.locator('.palette-slot-select').all()) {
    const rect = await box.boundingBox(); assert.equal(rect.width, 48); assert.equal(rect.height, 48);
  }
  await page.locator('.palette-slot-select').first().click();
  await page.getByText('1: Blue', { exact: true }).click();
  assert.equal(JSON.parse(await page.locator('output').innerText()).paletteIds[0], '__slot__:1');
  await expect(page.locator('.palette-slot-select').first().locator('.ant-select-selection-item')).toHaveCSS('opacity', '1');
  await page.locator('.palette-slot-select').first().click();
  await page.getByText('Usar paleta padrão', { exact: true }).click();
  assert.equal(JSON.parse(await page.locator('output').innerText()).paletteIds[0], null);
  assert.equal(await page.locator('.palette-slot-select').first().locator('.ant-select-selection-item i').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 0, 0)');
  console.log('Background palette editor passed: translated labels, 16 square slots, configured choices, selection and Settings fallback after clear.');
} finally {
  if (app) await app.close();
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-palette-editor-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
