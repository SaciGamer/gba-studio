import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron } from '@playwright/test';
const rom = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2] && fs.existsSync(rom), 'Pass a monitoring-enabled .gba ROM');
const root = path.resolve('.'), frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ConfigProvider } from 'antd'; import { I18nProvider } from './i18n/I18n'; import RuntimeMonitor from './components/pages/emulator/RuntimeMonitor'; import Emulator from './components/pages/emulator/Emulator'; const monitor = location.hash.includes('runtime-monitor'); createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="pt_BR">{monitor ? <RuntimeMonitor/> : <Emulator/>}</I18nProvider></ConfigProvider>);`, resolveDir: frontend, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-origin', setup(bundler) { bundler.onLoad({ filter: /pages[\\/]emulator[\\/]Emulator\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replaceAll('http://localhost:3000', ''), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] });
const serverApp = express();
serverApp.use('/emulatorjs-data', express.static(path.join(root, 'src/renderer/frontend/public/emulatorjs/data')));
serverApp.get('/game.gba', (_, response) => response.sendFile(rom));
serverApp.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
serverApp.get('/', (_, response) => response.type('html').send(`<!doctype html><html><meta charset="utf-8"><body style="margin:0;background:#202020"><div id="root"></div><script>window.metrics=[];window.addEventListener('gba-studio:runtime-monitor',e=>window.metrics.push(e.detail));if(!location.hash.includes('runtime-monitor'))localStorage.setItem('appSettings',JSON.stringify({demoShowMenu:!location.hash.includes('hide-menu')}));</script><script src="/app.js"></script></body></html>`));
const server = await new Promise(resolve => { const listener = serverApp.listen(0, '127.0.0.1', () => resolve(listener)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-monitor-window-'));
const harness = path.join(temp, 'main.cjs');
fs.writeFileSync(harness, `const {app,BrowserWindow,ipcMain}=require('electron');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const {RuntimeMonitorWindow,registerRuntimeMonitorIpc}=await import(${JSON.stringify(pathToFileURL(path.join(root,'dist/main/managers/RuntimeMonitorWindow.js')).href)});
 global.owner = new BrowserWindow({width:720,height:480,show:false,webPreferences:{preload:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},nodeIntegration:false,contextIsolation:true,webSecurity:false,backgroundThrottling:false}});
 global.manager=new RuntimeMonitorWindow({preloadPath:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},iconPath:${JSON.stringify(path.join(root,'icon/defaultImgIcon.png'))},rendererUrl:${JSON.stringify(origin+'/#/runtime-monitor')},onWindowChange:win=>{global.monitor=win;}});
 global.manager.attach(global.owner);registerRuntimeMonitorIpc(ipcMain,global.manager);
 await global.owner.loadURL(${JSON.stringify(origin+'/#/emulator?rom='+encodeURIComponent(origin+'/game.gba'))});
});`);
let electronApp;
const logs = [];
const numericMessages = [];
try {
 electronApp = await electron.launch({args:[harness]});
 const emulator = await electronApp.firstWindow();
 emulator.on('console', message=>{logs.push(message.text());if(message.text().includes('[NUMERIC_TEST:'))numericMessages.push(message.text());if(logs.length>25)logs.shift();});
 emulator.on('pageerror', error=>logs.push(error.message));
 await emulator.waitForFunction(()=>window.metrics.length>=2,null,{timeout:45000});
 if(process.argv.includes('--motion')) {
  const deadline=Date.now()+15000;
  while(!numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]8'))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  for(const coordinate of [200,72,104,240,248,0,8]) assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]'+coordinate)), 'Scripted motion must reach '+coordinate);
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')));
  console.log('Real mGBA motion passed: camera, actor detour, blocked target, Property offsets and sprite bounds for instant/animated moves.');
 }
 if(process.argv.includes('--numeric-values')) {
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:VARIABLE]20')), 'ROM must read the selected variable');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]128')), 'ROM must read the current player X');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:CAMERA]21')), 'ROM must apply (20 % 7) + 15 to camera X before the next expression');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:BOOLEAN]1')), 'ROM must assign and read a computed boolean');
  if(process.argv.includes('--actor-move')) for(const coordinate of [48,80,64,96]) assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]'+coordinate)), 'Move Actor must reach '+coordinate+' in pixels and tiles');
  console.log('Real mGBA numeric expressions passed: variable 20, player property 128 and computed camera X 21.');
 }
 await emulator.evaluate(()=>window.EJS_emulator.menu.open(true));
 const icon=emulator.getByRole('button',{name:'Monitor de recursos',exact:true});
 await icon.waitFor({state:'attached'});
 const monitorPromise=electronApp.waitForEvent('window');
 monitorPromise.catch(()=>{});
 await icon.evaluate(element=>element.click());
 const monitor=await monitorPromise;
 await monitor.getByRole('region',{name:'Monitor de recursos'}).waitFor();
 await monitor.getByText('Pico de pilha observado:',{exact:false}).waitFor();
 const props=await electronApp.evaluate(()=>({resizable:global.monitor.isResizable(),maximizable:global.monitor.isMaximizable(),fullscreenable:global.monitor.isFullScreenable(),parent:global.monitor.getParentWindow()===global.owner}));
 assert.deepEqual(props,{resizable:false,maximizable:false,fullscreenable:false,parent:true});
 const firstId=await electronApp.evaluate(()=>global.monitor.id);
 await icon.evaluate(element=>element.click());assert.equal(await electronApp.evaluate(()=>global.monitor.id),firstId);
 const messages=await emulator.evaluate(()=>window.metrics.slice(-2));
 await emulator.evaluate(()=>window.EJS_emulator.gameManager.toggleMainLoop(0));
 await emulator.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,2000,64000,240000,8000,8000,120,8,1000,24,31,1,120,1000,31;'));
 await monitor.getByText('Uso cr\u00edtico de recursos',{exact:true}).waitFor();
 fs.mkdirSync('test-results',{recursive:true});await monitor.screenshot({path:'test-results/runtime-monitor-window.png'});
 const monitorClosed=monitor.waitForEvent('close');
 await electronApp.evaluate(()=>global.monitor.close());
 await monitorClosed;
 assert.equal(await electronApp.evaluate(()=>global.monitor),null);
 const reopenedPromise=electronApp.waitForEvent('window');reopenedPromise.catch(()=>{});await icon.evaluate(element=>element.click());const reopened=await reopenedPromise;
 await reopened.getByText('Uso cr\u00edtico de recursos',{exact:true}).waitFor();
 // Forged telemetry from the monitor itself must not overwrite emulator data.
 await reopened.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,6000,64000,160000,40000,40000,104,24,820,204,26,6,104,820,26;'));
 assert.equal(await reopened.getByText('Uso cr\u00edtico de recursos',{exact:true}).count(),1);
 await emulator.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,6000,64000,160000,40000,40000,104,24,820,204,26,6,104,820,26;'));
 await reopened.getByText('Recursos pr\u00f3ximos do limite',{exact:true}).waitFor();
 await emulator.evaluate(()=>window.EJS_emulator.toggleMainLoop?.(0));
 // Menu hidden: reload only the renderer and wait until the core has started.
 await emulator.goto(origin+'/#/emulator?hide-menu=1&rom='+encodeURIComponent(origin+'/game.gba'));
 await emulator.reload();await emulator.waitForFunction(()=>window.EJS_emulator?.started===true,null,{timeout:45000});
 assert.equal(await emulator.getByRole('button',{name:'Monitor de recursos',exact:true}).count(),0);
 const closed=reopened.waitForEvent('close');await electronApp.evaluate(()=>global.owner.destroy());await closed;
 assert.equal(await electronApp.evaluate(()=>global.monitor),null);
 console.log('Real Electron/EmulatorJS monitor passed: menu visibility, metrics IPC, fixed window, singleton/reopen, retained sample, alert states and emulator-owned destruction.');
 console.log(messages.join('\n'));
} catch(error) { console.error(logs.join('\n'));throw error; }
finally { if(electronApp)await electronApp.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true}); }
