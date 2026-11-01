import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const helper = await build({ entryPoints: ['src/shared/events/soundGroups.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { collectSoundGroups } = await import(`data:text/javascript;base64,${Buffer.from(helper.outputFiles[0].text).toString('base64')}`);
const sound = group => ({ command: 'EVENT_PLAY_SOUND', args: { group } });
assert.deepEqual(collectSoundGroups(
  { script: [sound('UI'), { children: { then: [sound('Enemies')], else: [sound('UI')] } }], eventGraphs: { update: { nodes: [sound('World')] } } },
  { scripts: [{ events: [sound('Reusable')] }, { _deleted: true, events: [sound('Deleted')] }] },
  { prefabs: [{ actor: { onInitScript: [sound('Prefab')] } }] },
  { _deleted: true, script: [sound('Deleted scene')] }, sound(''), sound('   '),
), ['Enemies', 'Prefab', 'Reusable', 'UI', 'World']);
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import SoundGroupSelect from'./components/events/SoundGroupSelect';
function Harness(){const[group,setGroup]=useState(''),[groups,setGroups]=useState(['UI','Enemies']),[language,setLanguage]=useState('en_US');window.group=group;window.setGroup=setGroup;window.addGroup=value=>setGroups(old=>[...old,value]);window.setLanguage=setLanguage;
window.context={scenes:[{script:groups.map(group=>({command:'EVENT_PLAY_SOUND',args:{group}}))}],scripts:{scripts:[{_deleted:true,events:[{command:'EVENT_PLAY_SOUND',args:{group:'Deleted'}}]}]},prefabs:{prefabs:[]},elementSelected:null};
return <ConfigProvider><I18nProvider language={language}><div style={{width:320,padding:16}}><SoundGroupSelect value={group} onChange={setGroup}/></div></I18nProvider></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const select = page.getByRole('combobox', { name: 'Group', exact: true });
  await expect(page.locator('.ant-select-selection-item')).toHaveText('All sounds');
  await select.press('ArrowDown');
  await expect(page.locator('.ant-select-item-option').filter({ hasText: 'Deleted' })).toHaveCount(0);
  await page.locator('.ant-select-item-option').filter({ hasText: /^Enemies$/ }).click();
  assert.equal(await page.evaluate(() => window.group), 'Enemies');
  await page.evaluate(() => window.addGroup('Boss'));
  await select.fill('Boss'); await page.locator('.ant-select-item-option').filter({ hasText: /^Boss$/ }).click();
  assert.equal(await page.evaluate(() => window.group), 'Boss');
  await select.press('ArrowDown'); await page.locator('.ant-select-item-option').filter({ hasText: /^All sounds$/ }).click();
  assert.equal(await page.evaluate(() => window.group), '');
  await page.evaluate(() => window.setGroup('Existing group without Play Sound'));
  await expect(page.locator('.ant-select-selection-item')).toHaveText('Existing group without Play Sound');
  await page.evaluate(() => { window.setGroup(''); window.setLanguage('pt_BR'); });
  await expect(page.getByRole('combobox', { name: 'Grupo', exact: true })).toBeVisible();
  await expect(page.locator('.ant-select-selection-item')).toHaveText('Todos os sons');
  assert.deepEqual(errors, []);
  console.log('Stop Sound groups: nested/graph/reusable/prefab discovery, deleted filtering, group selection, all sounds, search and updates passed.');
} finally { await browser.close(); }
