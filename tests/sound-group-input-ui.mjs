import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import GroupInput from'./components/events/SoundGroupInput';import GroupSelect from'./components/events/SoundGroupSelect';
window.commits=[];
function Harness(){const[event,setEvent]=useState({id:'c2d15146-f824-4401-8d4a-08e92e2ef6ab',group:'UI'});window.event=event;window.setEvent=setEvent;
window.context={scenes:[{script:[{command:'EVENT_PLAY_SOUND',args:{group:event.group}}]}],scripts:{scripts:[]},prefabs:{prefabs:[]},elementSelected:null};
return <ConfigProvider><I18nProvider language="en_US"><main style={{width:400,padding:20}}><GroupInput eventId={event.id} value={event.group} onCommit={group=>{window.commits.push(group);setEvent(old=>({...old,group}));}}/><button>Outside</button><GroupSelect onChange={()=>{}}/></main></I18nProvider></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const input = page.getByRole('textbox', { name: 'Group', exact: true });
  await input.fill('Enemies'); await expect(input).toHaveValue('Enemies');
  assert.deepEqual(await page.evaluate(() => window.commits), []);
  assert.equal(await page.evaluate(() => window.event.group), 'UI', 'Typing does not update the group available to Stop Sound');
  await page.getByRole('button', { name: 'Outside', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.commits), ['Enemies']);
  const select = page.getByRole('combobox', { name: 'Group', exact: true });
  await select.press('ArrowDown'); await expect(page.locator('.ant-select-item-option').filter({ hasText: /^Enemies$/ })).toBeVisible();
  await select.press('Escape');
  await input.fill('Boss'); await input.press('Enter');
  await expect(input).not.toBeFocused();
  assert.deepEqual(await page.evaluate(() => window.commits), ['Enemies', 'Boss']);
  await input.focus(); await page.getByRole('button', { name: 'Outside', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.commits), ['Enemies', 'Boss'], 'Unchanged blur does not create an edit');
  await page.evaluate(() => window.setEvent({ id: '54520591-68f7-486d-9248-871ee0a27681', group: 'Other' }));
  await expect(input).toHaveValue('Other');
  await input.fill(''); await input.press('Tab');
  assert.equal(await page.evaluate(() => window.event.group), '');
  assert.deepEqual(errors, []);
  console.log('Play Sound Group: local typing, single blur commit, Stop Sound discovery after commit, Enter, unchanged blur and event switching passed.');
} finally { await browser.close(); }
