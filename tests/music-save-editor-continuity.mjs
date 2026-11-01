import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve('src/renderer/frontend/src');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const fixture = `
import React from 'react';import {createRoot} from 'react-dom/client';import {App,ConfigProvider} from 'antd';
import {I18nProvider} from '@/i18n/I18n';import AssetLibraryEditor from '@/components/resourceEditors/AssetLibraryEditor';
import {MusicEditorWorkspaceProvider,useMusicEditorWorkspace} from '@/components/resourceEditors/MusicEditorWorkspace';
function Selection(){const workspace=useMusicEditorWorkspace();window.chooseBeat=id=>workspace.selectAsset(id);return null;}
window.mounts=[];window.listings=0;
window.electronAPI={fetchImages:async()=>({status:'success',fileImages:[],localPath:'local://music'}),listTrackerProjects:async()=>{window.listings++;return {status:'success',files:['first.gbatracker','second.gbatracker']}}};
createRoot(document.getElementById('root')).render(<I18nProvider language="en_US"><ConfigProvider><App><MusicEditorWorkspaceProvider><Selection/><AssetLibraryEditor kind="music" musicWorkspaceMode/></MusicEditorWorkspaceProvider></App></ConfigProvider></I18nProvider>);
`;
const viewer = `
import React,{useEffect,useState} from 'react';import {useOptionalMusicEditorWorkspace} from '@/components/resourceEditors/MusicEditorWorkspace';
export default function Viewer({filename,onSaved}){const workspace=useOptionalMusicEditorWorkspace();const [value,setValue]=useState('');
useEffect(()=>{window.mounts.push(filename)},[]);
return <section data-editor-file={filename}><input aria-label="Editor state" value={value} onChange={e=>{setValue(e.target.value);workspace.setNoteSelection({row:3,note:49});workspace.setAssetDirty(workspace.selectedAssetId,true)}}/><button onClick={()=>{workspace.setAssetDirty(workspace.selectedAssetId,false);onSaved()}}>Save</button></section>;}
`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'save-memory',
  platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'editor-continuity-fixture', setup(plugin) {
    plugin.onResolve({ filter: /TrackerModuleViewer$/ }, () => ({ path: 'viewer', namespace: 'fixture' }));
    plugin.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents: args.path === 'viewer' ? viewer
      : 'export default function useAppContexts(){return {userSettings:{zoom:100},settingUtils:{projectPathFile:"test"},setUserSettings:()=>{},setSettingUtils:()=>{}}}' }));
  } }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root" style="height:700px"></div>');
  await page.addScriptTag({ content: 'window.AudioWorkletProcessor=class {};window.registerProcessor=()=>{};' });
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  try { await page.locator('[data-editor-file="first.gbatracker"]').waitFor({ timeout: 4000 }); }
  catch(error) { console.log({ errors, body: await page.locator('body').innerText() }); throw error; }
  await page.evaluate(() => window.chooseBeat('project:second.gbatracker'));
  await page.locator('[data-editor-file="second.gbatracker"]').waitFor();
  await page.getByRole('textbox', { name: 'Editor state' }).fill('pattern 3, channel 2, zoom 32, scroll 900');
  const before = await page.evaluate(() => ({ mounts: window.mounts.length, listings: window.listings }));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(count => window.listings > count, before.listings);
  await page.evaluate(async () => { for(let frame=0;frame<4;frame++) await new Promise(requestAnimationFrame); });
  assert.equal(await page.evaluate(() => window.mounts.length), before.mounts, 'Save must refresh the library without remounting another beat');
  assert.equal(await page.getByRole('textbox', { name: 'Editor state' }).inputValue(), 'pattern 3, channel 2, zoom 32, scroll 900');
  assert.equal(await page.locator('[data-editor-file="second.gbatracker"]').count(), 1);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Saving a non-first beat after note selection preserves the editor instance and its local state while refreshing the asset list.');
