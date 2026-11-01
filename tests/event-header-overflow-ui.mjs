import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd'; import { I18nProvider } from './i18n/I18n';
import CollapseEventManager from './components/events/CollapseEventManager';
const wait=(id)=>({id,command:'EVENT_WAIT',args:{__name:id,__collapse:true,frames:10}});
const initial=()=>[wait('first'), {id:'outer',command:'EVENT_IF',args:{__name:'outer',__collapse:true},children:{then:[wait('nested'),wait('nested-two')],else:[]}}, wait('last')];
function Harness(){
 const [resource,setResource]=useState('scene'); const [lists,setLists]=useState({scene:initial(),actor:[wait('actor-target')],trigger:[wait('trigger-target')],other:[wait('scene-target')]});
 const [language,setLanguage]=useState('en_US'); const [visible,setVisible]=useState(true);
 window.selectResource=setResource; window.setLanguage=setLanguage; window.showEditor=setVisible;
 window.resetEvents=()=>{setLists({scene:initial(),actor:[wait('actor-target')],trigger:[wait('trigger-target')],other:[wait('scene-target')]});setResource('scene');};
 window.lists=lists;
 window.replaceEvents=events=>setLists(previous=>({...previous,[resource]:events}));
 window.eventContext={elementSelected:{id:resource==='other'?'other-scene':'scene',_resourceType:'scene',actors:resource==='other'?[]:[{id:'actor',name:'Actor'}],triggers:[{id:'trigger'}]},settingUtils:{activeSceneObject:resource==='actor'?{sceneId:'scene',type:'actor',id:'actor'}:resource==='trigger'?{sceneId:'scene',type:'trigger',id:'trigger'}:null},scenes:[{id:'scene'},{id:'other-scene'}],scripts:{scripts:[]},variables:{variables:[]},userSettings:{favoriteEvents:[]},setUserSettings:()=>{},setSettingUtils:()=>{},setScenes:()=>{},setElementSelected:()=>{}};
 return <ConfigProvider theme={{token:{motion:false}}}><I18nProvider language={language}><div style={{width:480,padding:20}}>{visible&&<CollapseEventManager key={resource} scripts={lists[resource]} onScriptsChange={events=>setLists(previous=>({...previous,[resource]:events}))}/>}</div></I18nProvider></ConfigProvider>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{ name: 'isolated-event-forms', setup(build) {
    build.onResolve({ filter: /providers\/contexts\/AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/PanelEvents$|^\.\/FlowEditorManager$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: frontend, contents: args.path === 'context'
      ? 'export default function useAppContexts(){return window.eventContext;}'
      : args.path.includes('PanelEvents') ? 'export default function Panel(){return <div style={{height:90}}>Event fields</div>;}'
        : 'export default function Flow(){return null;}' }));
  } }],
});
const app = express();
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-event-organize-ui-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:800,height:1400,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try {
  electronApp=await electron.launch({args:[path.join(temporary,'main.cjs')]});
  const page=await electronApp.firstWindow();page.setDefaultTimeout(8000);
  await page.locator('[data-reference-event="first"]').waitFor();
  await page.addStyleTag({content:fs.readFileSync(path.join(frontend,'components/events/eventHeaders.css'),'utf8')});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const panel=id=>page.locator(`[data-reference-event="${id}"]`).locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-collapse-item ")][1]');
  // Long titles must share the available width without displacing the menu.
  await page.evaluate(() => window.replaceEvents([{id:'long-title',command:'EVENT_WAIT',args:{__collapse:true,__name:'Long event title '.repeat(30),frames:10}}]));
  const title = page.locator('[data-reference-event="long-title"] .gba-event-title');
  const header = panel('long-title').locator(':scope > .ant-collapse-header');
  const menuButton = header.getByRole('button',{name:'Event options',exact:true});
  for(const width of [480,280]) {
    await page.locator('#root > div').first().evaluate((element,width)=>{element.style.width=width+'px';},width);
    await expect(title).toBeVisible();
    const geometry=await title.evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth,overflow:getComputedStyle(element).textOverflow}));
    assert.ok(geometry.scroll>geometry.width);assert.equal(geometry.overflow,'ellipsis');
    const button=await menuButton.boundingBox(),bounds=await header.boundingBox();
    assert.ok(button.x+button.width<=bounds.x+bounds.width+1,'Event options must remain inside the header');
  }
  await page.mouse.move(1000,700);await title.hover();
  const fullTitle=page.getByRole('tooltip').filter({hasText:'Long event title'});
  await page.waitForTimeout(150);await expect(fullTitle).toHaveCount(0);await expect(fullTitle).toBeVisible();
  await menuButton.click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');

  await page.evaluate(() => window.replaceEvents([{id:'outer',command:'EVENT_IF',args:{__collapse:true},children:{then:[{id:'nested-long',command:'EVENT_WAIT',args:{__name:'Nested long title '.repeat(30),frames:10}}],else:[]}}]));
  const nestedTitle=page.locator('[data-reference-event="nested-long"] .gba-event-title');
  await expect(nestedTitle).toBeVisible();
  assert.ok(await nestedTitle.evaluate(element=>element.scrollWidth>element.clientWidth));
  const nestedHeader=panel('nested-long').locator(':scope > .ant-collapse-header');
  const nestedMenu=nestedHeader.getByRole('button',{name:'Event options',exact:true});
  const before=await nestedMenu.boundingBox();
  await page.evaluate(() => window.replaceEvents([{id:'outer',command:'EVENT_IF',args:{__collapse:true},children:{then:[{id:'nested-long',command:'EVENT_WAIT',args:{__name:'Short',frames:10}}],else:[]}}]));
  await expect(nestedTitle).toHaveText('Short');
  const after=await nestedMenu.boundingBox();assert.ok(Math.abs(before.x-after.x)<1,'Nested gear must stay fixed when title length changes');
  await nestedMenu.click();await expect(page.getByRole('menu')).toBeVisible();

  assert.deepEqual(errors,[]);
  console.log('Event title layout passed: ellipsis, delayed full-title tooltip and usable fixed menu in wide/narrow inspectors.');
} finally {await electronApp?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
