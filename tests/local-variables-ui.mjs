import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';
import VariableEvent from './components/events/VariableEvent';import {I18nProvider} from './i18n/I18n';
window.context={variables:{variables:[]},elementSelected:{id:'scene'},settingUtils:{activeSceneObject:{sceneId:'scene',type:'actor',id:'actor'}}};window.changes=[];
function Harness(){const[owner,setOwner]=useState('actor');window.setOwner=setOwner;
window.context.settingUtils.activeSceneObject=owner?{sceneId:'scene',type:owner,id:'owner'}:null;
return <ConfigProvider><I18nProvider language="en_US"><VariableEvent event={{id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_VARIABLE',args:{}}} onValueChange={(id,args)=>window.changes.push(args)}/></I18nProvider></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.png': 'dataurl' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for(const owner of ['actor','trigger']) {
    await page.evaluate(owner=>window.setOwner(owner),owner);
    await page.getByRole('combobox').first().click();
    await expect(page.getByText('Local variables',{exact:true})).toBeVisible();
    for(const slot of 'ABCDEFGH') await expect(page.getByText('Local '+slot,{exact:true})).toBeVisible();
    await page.getByText('Local H',{exact:true}).click();
    assert.equal(await page.evaluate(()=>window.changes.at(-1).variableId),'__LOCAL__:H');
  }
  await page.evaluate(()=>window.setOwner(null));
  await page.getByRole('combobox').first().click();
  await expect(page.getByText('Local variables',{exact:true})).toHaveCount(0);
  console.log('Local UI: eight actor/trigger slots, real Set Variable selection, no scene local slots passed.');
} finally { await browser.close(); }
