import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const filename = 'src/renderer/frontend/src/components/gameWorld/GameWorld.tsx';
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleKeyDown') handler = node.getText(source); ts.forEachChild(node, visit); }
visit(source); assert.ok(handler);
const bundle = await build({ stdin: { resolveDir: path.resolve('src/renderer/frontend/src'), loader: 'tsx', contents: `
import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import PreferencesModal from './components/PreferencesModal';import{I18nProvider}from'./i18n/I18n';import{isModalOpen}from'./utils/isModalOpen';import{ETypeScene}from'./providers/contexts/interfaces/ISceneElement';
window.electronAPI=new Proxy({loadPreferences:async()=>({sceneObjectSnapSize:8}),getCpuCount:async()=>4},{get:(target,key)=>target[key]??(async()=>undefined)});
function Harness(){const[open,setOpen]=useState(false),[settingUtils,setSettingUtils]=useState({tileEditSceneId:'105a9686-2e3f-487e-b226-4627594d34b3',tileEditLayerId:4,activeButton:'select',activeSubButton:''});
const selectedScene={id:settingUtils.tileEditSceneId,sceneType:'Adventure'},scenes=[selectedScene],settingUtilsRef={current:settingUtils};
const ${handler};
useEffect(()=>{document.addEventListener('keydown',handleKeyDown);return()=>document.removeEventListener('keydown',handleKeyDown);},[settingUtils]);
return <ConfigProvider><App><I18nProvider language="en_US"><button onClick={()=>setOpen(true)}>Open preferences</button><output>{settingUtils.tileEditLayerId}</output><PreferencesModal open={open} onClose={()=>setOpen(false)}/></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': path.resolve('src/renderer/frontend/src') }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: 'Open preferences' }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).press('1');
  await expect(page.locator('output')).toHaveText('4');
  await dialog.getByRole('button', { name: 'Close', exact: true }).press('Escape');
  await expect(dialog).toBeHidden(); await expect(page.locator('output')).toHaveText('4');
  await page.getByRole('button', { name: 'Open preferences' }).focus(); await page.keyboard.press('1');
  await expect(page.locator('output')).toHaveText('0');
  assert.deepEqual(errors, []);
  console.log('Preferences preserve scene Events layer while open/closing; world shortcuts resume after closing.');
} finally { await browser.close(); }
