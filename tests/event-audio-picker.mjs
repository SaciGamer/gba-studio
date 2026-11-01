import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await esbuild.build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button}from'antd';import{I18nProvider}from'./i18n/I18n';import Panel from'./components/events/RuntimeEventPanel';
function Fixture(){const[event,setEvent]=useState({id:'audio',command:'EVENT_PLAY_SOUND',args:{soundSource:'asset',soundId:'click',volume:100}});window.currentEvent=event;return <ConfigProvider><App><I18nProvider language="en_US"><Button onClick={()=>setEvent({id:'music',command:'EVENT_PLAY_MUSIC',args:{}})}>Music event</Button><Button onClick={()=>setEvent({id:'emote',command:'EVENT_SHOW_EMOTE',args:{actorId:'__PLAYER__',emoteId:'happy'}})}>Emote event</Button><div style={{width:400,padding:20}}><Panel event={event} onValueChange={(_,args)=>setEvent(current=>({...current,args}))}/></div></I18nProvider></App></ConfigProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'context-fixture', setup(build) {
    build.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const value={elementSelected:{id:'scene',actors:[],triggers:[],backgrounds:[]},variables:{variables:[]},settings:{},settingUtils:{},spriteResources:[]};export default ()=>value;` }));
  } }],
});
const app = express();
app.get('/fixture.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.type('html').send(`<div id="root"></div><script>window.electronAPI={getCommonFontImages:async()=>({status:'success',images:[]}),fetchImages:async kind=>({status:'success',fileImages:kind==='musics'?['original.mod']:kind==='sounds'?['click.wav']:[],localPath:'/assets'}),listTrackerProjects:async()=>({status:'success',projects:[{id:'music-uuid',filename:'folder/song.gbatracker',format:'MOD'}]}),listProjectSfx:async()=>({status:'success',files:['jump.gbasfx']}),loadProjectSfx:async()=>({status:'success',document:{parameters:{waveform:'square',frequency:290,durationMs:160,fadeOutMs:60,sampleRate:22050,seed:7}}})};</script><script src="/fixture.js"></script>`));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('.ant-select-selector').first().click({timeout:5000});
  await page.getByText('Originals', { exact: true }).waitFor();
  await page.getByText('Sound Projects', { exact: true }).waitFor();
  await page.getByText('jump.gbasfx', { exact: true }).click();
  assert.equal(await page.evaluate(() => window.currentEvent.args.soundSource), 'project');
  assert.equal(await page.evaluate(() => window.currentEvent.args.soundId), 'jump');
  await page.getByRole('button', { name: /Preview/ }).click();
  await page.getByRole('button', { name: 'Create sound', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('slider').first().waitFor();
  assert.equal(await dialog.getByRole('slider').count(), 5);
  await dialog.getByRole('slider').nth(1).focus();
  await page.keyboard.press('ArrowRight');
  await dialog.getByRole('button', { name: 'Use in event' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const stored = await page.evaluate(() => window.currentEvent.args);
  assert.equal(stored.soundSource, 'generated');
  assert.equal(JSON.parse(stored.sfxParameters).waveform, 'square');
  assert.equal(JSON.parse(stored.sfxParameters).durationMs, 310);
  await page.getByRole('button', { name: /Preview/ }).click();
  await page.getByRole('button', { name: 'Edit sound', exact: true }).click();
  await dialog.getByRole('slider').first().waitFor();
  await dialog.screenshot({ path: '.tmp/event-sfx-generator.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.currentEvent.args), stored, 'cancel preserves the event');
  await page.getByRole('button', { name: 'Music event', exact: true }).click();
  await page.locator('.ant-select-selector').first().click({timeout:5000});
  await page.getByText('Music Projects', { exact: true }).waitFor();
  await page.getByText('song.gbatracker (MOD)', { exact: true }).click();
  assert.equal(await page.evaluate(() => window.currentEvent.args.musicId), 'music-uuid');
  await page.getByRole('button', { name: 'Emote event', exact: true }).click();
  await page.getByText('Vertical distance (pixels)', { exact: true }).waitFor();
  assert.equal(await page.getByRole('spinbutton').inputValue(), '12');
  await page.getByRole('spinbutton').fill('30');
  await page.getByRole('spinbutton').press('Tab');
  assert.equal(await page.evaluate(() => window.currentEvent.args.distance), 30);
  assert.deepEqual(errors, []);
  console.log('Audio event UI passed: grouped selections, project identity, SFX modal apply/cancel, and music labels.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
