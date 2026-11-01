import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const rom = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2] && fs.existsSync(rom), 'Pass the ROM built with --menu-emulator');
const frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';import {I18nProvider} from './i18n/I18n';import Emulator from './components/pages/emulator/Emulator';createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="en_US"><Emulator/></I18nProvider></ConfigProvider>);`, resolveDir: frontend, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-origin', setup(bundler) { bundler.onLoad({ filter: /pages[\\/]emulator[\\/]Emulator\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replaceAll('http://localhost:3000', ''), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] });
const app = express();
app.use('/emulatorjs-data', express.static(path.join(root, 'src/renderer/frontend/public/emulatorjs/data')));
app.get('/game.gba', (_, response) => response.sendFile(rom));
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><style>html,body,#root{height:100%;width:100%}</style><body><div id="root"></div><script>window.metrics=[];window.addEventListener("gba-studio:runtime-monitor",event=>window.metrics.push(event.detail));</script><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-menu-emulator-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.whenReady().then(()=>{const window=new BrowserWindow({width:720,height:480,show:false,webPreferences:{preload:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},contextIsolation:true,webSecurity:false,backgroundThrottling:false,offscreen:true}});window.loadURL(${JSON.stringify(origin+'/#/emulator?rom='+encodeURIComponent(origin+'/game.gba'))});});`);
let electronApp;
const logs = [];
try {
  electronApp = await electron.launch({ args: [path.join(temporary, 'main.cjs')] });
  const page = await electronApp.firstWindow();
  page.on('console', message => logs.push(message.text()));
  page.on('pageerror', error => logs.push(error.message));
  const ready = () => logs.filter(message => message.includes('[MENU_READY]'));
  const results = () => logs.filter(message => message.includes('[MENU_RESULT]'));
  const waitFor = async (predicate, label) => {
    const deadline = Date.now() + 45000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(predicate(), label);
  };
  const press = async button => {
    await page.evaluate(button => window.EJS_emulator.gameManager.simulateInput(0, button, 1), button);
    await page.waitForTimeout(80);
    await page.evaluate(button => window.EJS_emulator.gameManager.simulateInput(0, button, 0), button);
    await page.waitForTimeout(80);
  };
  await waitFor(() => ready().length >= 1, '32-option menu must open');
  assert.ok(ready()[0].includes('32'));
  if (process.argv.includes('--sprite-pressure')) {
    await waitFor(() => logs.some(message => message.includes('[MENU_PRESSURE_READY]')), 'Pressure fixture must fill all 128 sprite slots');
    await press(8);
    assert.equal(results().length, 0, 'An invisible page must not accept confirmation');
    await waitFor(() => logs.some(message => message.includes('[MENU_PRESSURE_RELEASED]')) && logs.some(message => message.includes('[MENU_SPRITES]')), 'Menu must recover when 32 sprite slots become available');
    assert.ok(logs.some(message => message.includes('[MENU] Not enough sprite resources')), 'OAM exhaustion must be reported');
  }

  // Row order: right, down, left, up returns to 0. Left wraps to option 31 on page 3.
  for (const button of [7, 5, 6, 4, 6, 8]) await press(button);
  await waitFor(() => results().length >= 1 && ready().length >= 2, 'First menu must complete and next menu must open');
  assert.ok(results()[0].includes('[MENU_RESULT]31'), results()[0]);
  await waitFor(() => logs.filter(message => message.includes('[MENU_OPTION_REVEALED]')).length >= 32, 'Animated menu reveals all options after its two-line title');
  const optionRevealOrder = logs.filter(message => message.includes('[MENU_OPTION_REVEALED]')).map(message => Number(message.match(/\[MENU_OPTION_REVEALED\](\d+)/)?.[1]));
  assert.deepEqual(optionRevealOrder, Array.from({ length: 32 }, (_, index) => index + 1), 'Animated options appear one at a time in the saved sequence');
  // Column order: down, right, up, left returns to 0. Up wraps to option 31.
  for (const button of [5, 7, 4, 6, 4, 8]) await press(button);
  await waitFor(() => results().length >= 2 && ready().length >= 3, 'Column menu must complete');
  assert.ok(results()[1].includes('[MENU_RESULT]31'), results()[1]);
  await press(0); // B must not cancel a required Choice.
  assert.equal(results().length, 2);
  for (const button of [5, 8]) await press(button);
  await waitFor(() => results().length >= 3 && ready().length >= 4, 'Choice must select its second page');
  assert.ok(results()[2].includes('[MENU_RESULT]1'), results()[2]);
  await press(0);
  await waitFor(() => results().length >= 4, 'Optional menu must cancel with B');
  assert.ok(results()[3].includes('[MENU_RESULT]-1'), results()[3]);
  await waitFor(() => ready().length >= 5, 'Full-screen menu with an initial selection must open');
  await press(8);
  await waitFor(() => results().length >= 5 && ready().length >= 6, 'Full-screen menu should accept its configured initial option');
  assert.ok(results()[4].includes('[MENU_RESULT]31'), results()[4]);
  await press(8);
  await waitFor(() => results().length >= 6 && ready().length >= 7, 'Left-side menu should open and accept input');
  assert.ok(results()[5].includes('[MENU_RESULT]7'), results()[5]);
  await press(8);
  await waitFor(() => results().length >= 7, 'Right-side menu should open and accept input');
  assert.ok(results()[6].includes('[MENU_RESULT]0'), results()[6]);
  await page.waitForFunction(() => window.metrics.length >= 10, null, { timeout: 45000 });
  assert.ok(logs.every(message => !/ASSERTION FAILED|Illegal opcode|event failed|invalid script inputs/.test(message)), logs.filter(message => /failed|opcode/i.test(message)).join('\n'));
  if (process.argv.includes('--sprite-pressure')) {
    const allocations = logs.filter(message => message.includes('[MENU_SPRITES]')).map(message => message.match(/\[MENU_SPRITES\](\d+),(\d+)/).slice(1).map(Number));
    assert.ok(allocations.length >= 10, 'Multiple page/selection changes must be measured');
    assert.ok(allocations.every(([total, menu]) => total <= 128 && total - menu === 96 && menu <= 32), `Menus must share OAM with 96 other sprites and release prior pages: ${JSON.stringify(allocations)}`);
    console.log(`Menu OAM pressure passed: refused confirmation with 128 occupied slots; recovered with 96 occupied slots; ${allocations.length} selections/pages without accumulating sprites.`);
  }
  const latest = await page.evaluate(() => window.metrics.at(-1).match(/\[GBAS_MONITOR:1\]([^;]+)/)[1].split(',').map(Number));
  assert.ok(latest[0] >= 600 && latest[4] > 8192 && latest[8] > 32768, `ROM must keep advancing with stack and heap headroom: ${JSON.stringify(latest)}`);
  console.log(`Real mGBA menu navigation passed: 32 options, all four directions, row/column order, partial last page, binary Choice, saved initial selection, full-screen/left/right layouts, required selection and cancellation; ${latest[0]} frames, observed IWRAM minimum ${latest[4]} bytes, EWRAM heap minimum ${latest[8]} bytes.`);

} catch (error) { console.error(logs.slice(-25).join('\n')); throw error; }
finally {
  if (electronApp) await electronApp.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-menu-emulator-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
