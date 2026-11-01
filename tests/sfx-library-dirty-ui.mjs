import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('src/renderer/frontend/src');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'@/i18n/I18n';import AssetLibraryEditor from'@/components/resourceEditors/AssetLibraryEditor';
import{generateSfx,defaultSfxParameters}from'@/utils/sfxGenerator';
const parameters=generateSfx(defaultSfxParameters).parameters;
window.sources={'first.gbasfx':{schema:'gba-studio/sfx',version:1,name:'first',parameters}};window.exports=[];window.failSave=false;window.wavFiles=['existing.wav'];
window.electronAPI={fetchImages:async()=>({status:'success',fileImages:[...window.wavFiles],localPath:'local://sounds'}),
listProjectSfx:async()=>({status:'success',files:Object.keys(window.sources)}),
loadProjectSfx:async filename=>({status:'success',document:structuredClone(window.sources[filename])}),
deleteProjectSound:async(filename,projectSource)=>{if(projectSource)delete window.sources[filename];else window.wavFiles=window.wavFiles.filter(name=>name!==filename);return{status:'success'}},
saveGeneratedSfx:async(filename,json,wavFilename,data,mode,overwrite)=>{
if(window.failSave)return{status:'error',message:'Simulated save failure'};
if(mode==='wav'){window.exports.push(wavFilename);return{status:'success',filename:wavFilename};}
if(window.sources[filename]&&!overwrite)return{status:'conflict'};
window.sources[filename]=JSON.parse(json);return{status:'success'};
}};
createRoot(document.getElementById('root')).render(<I18nProvider language="en_US"><ConfigProvider><App><AssetLibraryEditor kind="sounds"/></App></ConfigProvider></I18nProvider>);
`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'sfx-ui-fixture',
  platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'sfx-library-fixture', setup(plugin) {
    plugin.onResolve({ filter: /TrackerModuleViewer$/ }, () => ({ path: 'viewer', namespace: 'fixture' }));
    plugin.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents: args.path === 'viewer' ? 'export default function Viewer(){return null}'
      : 'export default function useAppContexts(){return {userSettings:{zoom:100},settingUtils:{projectPathFile:"test"},setUserSettings:()=>{},setSettingUtils:()=>{}}}' }));
  } }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  page.setDefaultTimeout(8_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root" style="height:900px"></div>');
  await page.addScriptTag({ content: 'window.AudioWorkletProcessor=class {};window.registerProcessor=()=>{};' });
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  const create = page.getByRole('button', { name: 'Generate SFX', exact: true });
  const name = page.getByRole('textbox', { name: 'SFX file name', exact: true });
  await create.waitFor();
  assert.equal(await create.innerText(), '', 'create is an icon button');
  const plusBox = await create.boundingBox();
  const searchBox = await page.locator('.anticon-search').boundingBox();
  assert.ok(plusBox.x < searchBox.x, 'plus appears before the search icon');
  await create.click();
  await expect(name).toHaveValue('new_effect');
  assert.ok(await page.evaluate(() => Boolean(window.sources['new_effect.gbasfx'])), 'plus immediately saves a source file');
  assert.deepEqual(await page.evaluate(() => window.exports), [], 'plus does not export a WAV');
  await expect(create).toBeVisible();
  const frequency = () => page.getByRole('slider', { name: /^Frequency/ });
  await frequency().press('ArrowRight');
  await expect(page.getByText('new_effect.gbasfx *', { exact: true })).toBeVisible();
  await create.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Unsaved SFX changes');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(name).toHaveValue('new_effect');
  assert.ok(!await page.evaluate(() => window.sources['new_effect_1.gbasfx']));
  await create.click();
  await dialog.getByRole('button', { name: 'Continue without saving', exact: true }).click();
  await expect(name).toHaveValue('new_effect_1');
  assert.equal(await page.evaluate(() => window.sources['new_effect.gbasfx'].parameters.frequency), 440, 'discard preserves the saved source');
  await frequency().press('ArrowRight');
  await page.locator('.ant-list-item').filter({ hasText: /^first/ }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(name).toHaveValue('first');
  assert.equal(await page.evaluate(() => window.sources['new_effect_1.gbasfx'].parameters.frequency), 450, 'save persists before switching');
  await frequency().press('ArrowRight');
  await page.evaluate(() => { window.failSave = true; });
  await create.click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Simulated save failure', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(name).toHaveValue('first');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('first.gbasfx *', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.failSave = false; });
  await page.locator('.ant-list-item').filter({ hasText: /^existing/ }).click();
  await dialog.getByRole('button', { name: 'Continue without saving', exact: true }).click();
  await expect(page.getByTestId('sfx-generator-workspace')).toHaveCount(0);
  await create.click();
  await expect(name).toHaveValue('new_effect_2');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('aside .ant-tag')).toHaveCount(0, 'sound source groups do not need project tags');
  await frequency().press('ArrowRight');
  await expect(page.locator('.anticon-delete')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:sound-delete-request')));
  await expect(dialog).toContainText('discard its unsaved changes');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(name).toHaveValue('new_effect_2');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:sound-delete-request')));
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.ant-list-item').filter({ hasText: /^new_effect_2/ })).toHaveCount(0);
  assert.ok(!await page.evaluate(() => window.sources['new_effect_2.gbasfx']));
  await expect(page.getByTestId('sfx-generator-workspace')).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await page.locator('.ant-list-item').filter({ hasText: /^existing/ }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:sound-delete-request')));
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.ant-list-item').filter({ hasText: /^existing/ })).toHaveCount(0);
  assert.ok(await page.evaluate(() => Boolean(window.sources['first.gbasfx'])));
  assert.deepEqual(errors, []);
  console.log('SFX library: persistent plus before search, immediate file creation, unique names, dirty star, cancel/discard/save navigation and failed-save protection passed.');
} finally { await browser.close(); }
