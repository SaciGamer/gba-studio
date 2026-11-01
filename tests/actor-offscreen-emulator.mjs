import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const rom = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2] && fs.existsSync(rom), 'Pass the ROM built with tools/verification/verify-actor-offscreen.mjs');
const frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';import {I18nProvider} from './i18n/I18n';import Emulator from './components/pages/emulator/Emulator';createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="en_US"><Emulator/></I18nProvider></ConfigProvider>);`, resolveDir: frontend, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-origin', setup(bundler) { bundler.onLoad({ filter: /pages[\\/]emulator[\\/]Emulator\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replaceAll('http://localhost:3000', ''), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] });
const app = express();
app.use('/emulatorjs-data', express.static(path.join(root, 'src/renderer/frontend/public/emulatorjs/data')));
app.get('/game.gba', (_, response) => response.sendFile(rom));
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><style>html,body,#root{height:100%;width:100%}</style><body><div id="root"></div><script>window.metrics=[];window.addEventListener("gba-studio:runtime-monitor",event=>window.metrics.push(event.detail));</script><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-actor-offscreen-emulator-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.whenReady().then(()=>{const window=new BrowserWindow({width:720,height:480,show:false,webPreferences:{preload:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},contextIsolation:true,webSecurity:false,backgroundThrottling:false,offscreen:true}});window.loadURL(${JSON.stringify(origin+'/#/emulator?rom='+encodeURIComponent(origin+'/game.gba'))});});`);
let electronApp;
const logs = [];
try {
  electronApp = await electron.launch({ args: [path.join(temporary, 'main.cjs')] });
  const page = await electronApp.firstWindow();
  page.on('console', message => {logs.push(message.text());if(message.text().includes('[ACTOR_OFFSCREEN_FAIL]')||message.text().includes('[ACTOR_OFFSCREEN_STAGE]'))console.log(message.text());});
  page.on('pageerror', error => logs.push(error.message));
  const deadline=Date.now()+(process.argv.includes('--diagnose')?30000:60000);
  while(!logs.some(message=>/\[ACTOR_OFFSCREEN_(OK|FAIL)\]/.test(message))&&Date.now()<deadline)await page.waitForTimeout(50);
  assert.ok(logs.some(message=>message.includes('[ACTOR_OFFSCREEN_OK]')), 'Actor lifecycle verification marker missing');
  await page.waitForFunction(()=>window.metrics.length>=10,null,{timeout:45000});
  assert.ok(logs.every(message=>!/ASSERTION FAILED|Illegal opcode|event failed|invalid script inputs/.test(message)),logs.filter(message=>/failed|opcode/i.test(message)).join('\n'));
  const latest=await page.evaluate(()=>window.metrics.at(-1).match(/\[GBAS_MONITOR:1\]([^;]+)/)[1].split(',').map(Number));
  assert.ok(latest[0]>=600&&latest[4]>8192&&latest[8]>32768,`Runtime headroom: ${JSON.stringify(latest)}`);
  console.log(`Real mGBA actor lifecycle passed: 200 camera crossings, fresh/preserved instances, On Init/Update, button cleanup, prefab pools, save/load and legacy world; ${latest[0]} frames, observed IWRAM minimum ${latest[4]} bytes, EWRAM heap minimum ${latest[8]} bytes.`);

} catch (error) { console.error([...logs.filter(message=>/ASSERT|Assertion|OFFSCREEN_STAGE|failed/i.test(message)).slice(-15),...logs.slice(-10)].join('\n')); throw error; }
finally {
  if (electronApp) await electronApp.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-actor-offscreen-emulator-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
