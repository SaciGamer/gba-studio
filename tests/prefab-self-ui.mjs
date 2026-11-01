import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React, { useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client'; import { App, ConfigProvider } from 'antd';
import * as Providers from './providers/Providers'; import useAppContexts from './providers/contexts/AppContexts'; import { I18nProvider } from './i18n/I18n';
import ActorStateEvent from './components/events/ActorStateEvent';
function Harness() { const ctx = useAppContexts(); const [event,setEvent] = useState({id:'state',command:'EVENT_ACTOR_SET_STATE',args:{actorId:'',stateId:''}});
 useEffect(()=>{ctx.setElementSelected({_resourceType:'prefab',id:'door-prefab',name:'Door Prefab',type:'actor',actor:{spriteId:'door-sprite'}});ctx.setSpriteResources([{id:'door-sprite',playerAnimationStates:[{id:'closed',name:'Closed'}]}]);},[]);
 window.currentEventArgs=event.args; return <div data-testid="event"><ActorStateEvent event={event} onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/></div>; }
const providerList=Object.entries(Providers).filter(([name])=>name.endsWith('Provider')).map(([,Provider])=>Provider);
const content=providerList.reduce((child,Provider)=><Provider>{child}</Provider>,<Harness/>);
function Root(){return <ConfigProvider><App><I18nProvider language="en_US">{content}</I18nProvider></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Root/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' } });
const serverApp = express();
serverApp.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
serverApp.get('/', (_, response) => response.send('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const instance = serverApp.listen(0, '127.0.0.1', () => resolve(instance)); });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-prefab-self-ui-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:560,height:600,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try {
  electronApp = await electron.launch({ args: [path.join(temporary, 'main.cjs')] });
  const page = await electronApp.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const actorPicker = page.getByRole('combobox').nth(0);
  await actorPicker.click();
  const selfOption = page.getByRole('option', { name: 'Self (Door Prefab)', exact: true });
  await expect(selfOption).toHaveCount(1);
  await actorPicker.press('Enter');
  const statePicker = page.getByRole('combobox').nth(1);
  await expect(statePicker).toBeEnabled();
  assert.equal(await page.evaluate(() => window.currentEventArgs.actorId), '__SELF__');
  await statePicker.click();
  await expect(page.getByRole('option', { name: 'Closed', exact: true })).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log('Prefab self UI passed: the prefab actor exposes Self and its sprite animation states in actor events.');
} finally {
  if (electronApp) await electronApp.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-prefab-self-ui-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
