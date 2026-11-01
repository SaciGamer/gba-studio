import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'./i18n/I18n';import Camera from'./components/events/CameraEvent';import Panel from'./components/events/RuntimeEventPanel';import VariableText from'./components/events/VariableTextEvent';
window.electronAPI=new Proxy({getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:'success',fileImages:[],projects:[],sounds:[],localPath:''}))});
window.context={elementSelected:{id:'f10391c9-68d2-49d3-9167-79b6f45b8d28',sceneType:'TOPDOWN',actors:[],backgrounds:[],script:[]},variables:{variables:[]},settings:{},settingUtils:{},scenes:[],backgrounds:[],palettes:{palettes:[]},spriteResources:[],prefabs:{prefabs:[]}};
function Harness(){const[event,setEvent]=useState({id:'105a9686-2e3f-487e-b226-4627594d34b3',command:'EVENT_PAN_CAMERA',args:{x:3,y:2,layerId:0}});
window.args=event.args;window.setEvent=setEvent;window.reload=()=>setEvent(JSON.parse(JSON.stringify(event)));
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language="en_US"><div style={{width:400,padding:20}}>{event.command==='EVENT_PAN_CAMERA'?<Camera event={event} onValueChange={(_id,args)=>setEvent(old=>({...old,args}))}/>:event.command==='EVENT_DISPLAY_VARIABLE_TEXT'?<VariableText event={event} onValueChange={(_id,args)=>setEvent(old=>({...old,args}))}/>:<Panel event={event} onValueChange={(_id,args)=>setEvent(old=>({...old,args}))}/>}</div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => window.addEventListener('gba-studio:camera-preview', event => window.preview = event.detail));
  for (const command of ['EVENT_PAN_CAMERA', 'EVENT_BACKGROUND_SCROLL', 'EVENT_ACTOR_SET_POSITION', 'EVENT_SPAWN_ACTOR', 'EVENT_UI_SET_TEXT', 'EVENT_UI_SET_VALUE', 'EVENT_UI_ANIMATE', 'EVENT_SHOOTER_SPAWN_BOSS', 'EVENT_DISPLAY_VARIABLE_TEXT']) {
    await page.evaluate(command => window.setEvent(old => ({ ...old, command, args: { x: 3, y: 2, layerId: 0, actorId: '__PLAYER__', animation: 'move', text: 'Test' } })), command);
    const x = page.getByRole('button', { name: 'Unit for X', exact: true });
    const y = page.getByRole('button', { name: 'Unit for Y', exact: true });
    await expect(x, `${command}: pixel default`).toHaveText('px');
    await x.click(); await expect(x).toHaveText('tiles'); await expect(y).toHaveText('px');
    assert.equal(await page.evaluate(() => window.args.xUnit), 'tiles');
    if (command === 'EVENT_PAN_CAMERA') assert.deepEqual(await page.evaluate(() => [window.preview.x, window.preview.y]), [48, 2]);
    await page.evaluate(() => window.reload()); await expect(x).toHaveText('tiles');
    await y.click(); assert.equal(await page.evaluate(() => window.args.yUnit), 'tiles');
    await x.click(); await expect(x).toHaveText('px'); await expect(y).toHaveText('tiles');
  }
  assert.deepEqual(errors, []);
  console.log('Coordinate editors: independent units, legacy pixel defaults, camera preview and JSON persistence passed.');
} finally { await browser.close(); }
