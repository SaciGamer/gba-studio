import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,Form}from'antd';import{I18nProvider}from'./i18n/I18n';import Controls from'./components/events/SoundPlaybackControls';
window.context={variables:{variables:[]},scenes:[],elementSelected:null,settingUtils:{}};
function Harness(){const[args,setArgs]=useState({}),[language,setLanguage]=useState('en_US');window.args=args;window.setArgs=setArgs;window.reload=()=>setArgs(JSON.parse(JSON.stringify(args)));window.setLanguage=setLanguage;
return <ConfigProvider><I18nProvider language={language}><Form layout="vertical" style={{width:320,padding:16}}><Controls args={args} onChange={patch=>setArgs(old=>({...old,...patch}))}/></Form></I18nProvider></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'components/resourceEditors/MusicDial.css'), 'utf8') });
  for (const [field, initial, min, max] of [['volume', 100, 0, 100], ['speed', 100, 25, 400], ['panning', 0, -100, 100]]) {
    const control = page.getByTestId(`sound-control-${field}`), dial = control.getByRole('slider');
    await expect(dial).toHaveAttribute('aria-valuenow', String(initial));
    await dial.press('Home'); assert.equal(await page.evaluate(field => window.args[field], field), min);
    await dial.press('End'); assert.equal(await page.evaluate(field => window.args[field], field), max);
    await dial.press('ArrowDown'); assert.equal(await page.evaluate(field => window.args[field], field), max - (field === 'panning' ? 25 : 1));
    await page.evaluate(({field, initial}) => window.setArgs(old => ({...old, [field]: initial})), {field, initial});
    await expect(dial).toHaveAttribute('aria-valuenow', String(initial));
    await expect(control.getByText(field === 'panning' ? 'Center' : `${initial}%`, {exact:true})).toBeVisible();
    const title = await control.locator('.ant-typography').first().boundingBox();
    const knob = await dial.boundingBox();
    const value = await control.locator('.ant-typography').last().boundingBox();
    assert.ok(title.y + title.height <= knob.y && knob.y + knob.height <= value.y, 'Title sits above the dial and its value below');
    await page.evaluate(() => window.reload()); await expect(dial).toHaveAttribute('aria-valuenow', String(initial));
  }
  const pan = page.getByTestId('sound-control-panning');
  await expect(pan.locator('.gba-music-dial-pan-scale')).toHaveCount(1);
  for (const label of ['L', 'C', 'R']) await expect(pan.locator('svg text').filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  const panDial = pan.getByRole('slider');
  for (const [key, value, text] of [['ArrowRight',25,'R 25%'],['ArrowRight',50,'R 50%'],['Home',-100,'L 100%'],['ArrowRight',-75,'L 75%'],['End',100,'R 100%'],['Home',-100,'L 100%']]) {
    await panDial.press(key);
    assert.equal(await page.evaluate(()=>window.args.panning), value);
    await expect(pan.getByText(text,{exact:true})).toBeVisible();
  }
  await page.evaluate(()=>window.setArgs(old=>({...old,panning:0})));
  await expect(pan.getByText('Center',{exact:true})).toBeVisible();
  const dial = pan.getByRole('slider'), box = await dial.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => window.args.panning > 0));
  assert.equal(await page.evaluate(()=>window.args.panning % 25),0,'Pan drag snaps to the marked points');
  await page.screenshot({ path: path.join(os.tmpdir(), 'gba-play-sound-dials.png') });
  await page.evaluate(() => window.setArgs({ volume: { kind: 'variable', variableId: '54520591-68f7-486d-9248-871ee0a27681' } }));
  await expect(page.getByTestId('sound-control-volume').getByText('—', {exact:true})).toBeVisible();
  await page.getByTestId('sound-control-volume').getByRole('slider').press('Home');
  assert.equal(await page.evaluate(() => window.args.volume), 0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Choose value type',exact:true})).toHaveCount(0);
  await page.evaluate(() => { window.setArgs({}); window.setLanguage('pt_BR'); });
  await expect(page.getByRole('slider', { name: 'Pan', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Play Sound dials: SFX title/dial/value layout, music pan L/C/R, keyboard/drag, ranges, persistence and no input/variable selectors passed.');
} finally { await browser.close(); }
