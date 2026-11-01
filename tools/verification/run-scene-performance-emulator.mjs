import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron } from '@playwright/test';

const root = path.resolve('.'), rom = path.resolve(process.argv[2]), report = path.resolve(process.argv[3]);
const frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';import {I18nProvider} from './i18n/I18n';import Emulator from './components/pages/emulator/Emulator';createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="en_US"><Emulator/></I18nProvider></ConfigProvider>);`, resolveDir: frontend, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-origin', setup(bundler) { bundler.onLoad({ filter: /pages[\\/]emulator[\\/]Emulator\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replaceAll('http://localhost:3000', ''), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] });
const app = express();
app.use('/emulatorjs-data', express.static(path.join(root, 'src/renderer/frontend/public/emulatorjs/data')));
app.get('/game.gba', (_, response) => response.sendFile(rom));
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><style>html,body,#root{height:100%;width:100%}</style><body><div id="root"></div><script>window.metrics=[];window.addEventListener("gba-studio:runtime-monitor",event=>window.metrics.push(event.detail));</script><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-scene-performance-emulator-'));
const harness = path.join(temporary, 'main.cjs');
fs.writeFileSync(harness, `const {app,BrowserWindow}=require('electron');app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.whenReady().then(()=>{const win=new BrowserWindow({show:false,width:720,height:480,webPreferences:{preload:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},contextIsolation:true,webSecurity:false,backgroundThrottling:false,offscreen:true}});win.loadURL(${JSON.stringify(origin+'/#/emulator?rom='+encodeURIComponent(origin+'/game.gba'))});});`);
let session;
const messages = [], timings = {};
try {
  session = await electron.launch({ args: [harness] });
  const page = await session.firstWindow();
  page.on('console', message => {
    const line = message.text();messages.push(line);
    const match = line.match(/\[SCENE_PERFORMANCE\] (\w+) ticks=(\d+) checksum=(\d+)/);
    if(match) { timings[match[1]] = { ticks: Number(match[2]), checksum: Number(match[3]) };console.log(match[0]); }
  });
  page.on('pageerror', error => messages.push(error.message));
  const deadline = Date.now() + 60000;
  const capacityRequested = process.argv.includes('--capacity');
  const actorCapacityRequested = process.argv.includes('--actors');
  while((actorCapacityRequested ? !messages.some(line => line.includes('[ACTOR_CAPACITY_OK]')) : Object.keys(timings).length < 7 || (capacityRequested && !messages.some(line => line.includes('[SPRITE_CAPACITY_OK]')))) && Date.now() < deadline) await page.waitForTimeout(100);
  if(actorCapacityRequested) assert.ok(messages.some(line => line.includes('[ACTOR_CAPACITY_OK]')), '127 actors, 32 event spawns and full save/load must complete');
  else {
    assert.equal(Object.keys(timings).length, 7, 'ROM must finish every benchmark phase');
    assert.ok(messages.some(line => line.includes('[SCENE_LOAD] actors=16 sprites=17 colliders=128 triggers=64 tiles=32')));
  }
  if(capacityRequested) assert.ok(messages.some(line => line.includes('[SPRITE_CAPACITY_OK]')), 'Full sprite table must recycle its freed slots');
  assert.ok(messages.every(line => !/ASSERTION FAILED|Illegal opcode|invalid script inputs/.test(line)), messages.filter(line => /ASSERT|opcode/.test(line)).join('\n'));
  await page.waitForFunction(() => window.metrics.length >= 6, null, { timeout: 20000 });
  const metrics = await page.evaluate(() => window.metrics.at(-1));
  const values = metrics.match(/\[GBAS_MONITOR:1\]([^;]+)/)[1].split(',').map(Number);
  assert.ok(values[0] >= 344 && values[4] > 8192 && values[8] > 32768, `Observed runtime headroom: ${metrics}`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify({ samplesPerPhase: 32, capacityVerified: capacityRequested, actorCapacityVerified: actorCapacityRequested, timings, metrics,
    observedMinimumIwramBytes: values[4], observedMinimumHeapBytes: values[8] }, null, 2) + '\n');
  console.log(metrics);
  if(actorCapacityRequested) console.log(messages.find(line => line.includes('[ACTOR_CAPACITY_OK]')));
} catch(error) { console.error(messages.slice(-25).join('\n'));throw error; }
finally {
  if(session) await session.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('gba-scene-performance-emulator-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
