import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
  import React, { useEffect, useRef, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import RightPanelScroll from './components/RightPanelScroll';
  function Fixture() {
    const [id, setId] = useState('a'), [settings, setSettings] = useState({}), [mount, setMount] = useState(0);
    const [object, setObject] = useState(null), [short, setShort] = useState(false);
    const ref = useRef(settings); ref.current = settings;
    useEffect(() => { window.settingsWrites = (window.settingsWrites ?? 0) + 1; }, [settings]);
    window.testContext = { scenes: [{id:'a'}, {id:'b'}], elementSelected: {id},
      settingUtils: {projectPathFile:'project', activeSceneObject:object}, userSettingsRef:ref, setUserSettings:setSettings };
    window.saved = settings;
    return <><button onClick={() => {setId('a');setObject(null);}}>A</button>
      <button onClick={() => {setId('b');setObject(null);}}>B</button>
      <button onClick={() => setObject({sceneId:'a',type:'trigger',id:'t'})}>Trigger</button>
      <button onClick={() => setMount(mount+1)}>Remount</button>
      <button onClick={() => {setShort(true);setId('a');setObject(null);setTimeout(() => setShort(false), 100);}}>Deferred A</button>
      <div style={{height:200}}><RightPanelScroll key={mount}><div style={{height:short?100:1400}}>Scene {id}</div></RightPanelScroll></div></>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default () => window.testContext;', loader: 'js' }));
} }] });
const app = express();
app.get('/fixture.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.type('html').send('<div id="root"></div><script src="/fixture.js"></script>'));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const panel = page.getByTestId('right-panel-scroll');
  await panel.waitFor();
  const scroll = async (top, key) => {
    await panel.evaluate((element, value) => { element.scrollTop = value; }, top);
    await page.waitForFunction(({key, top}) => window.saved.rightPanelScrollPositions?.[key] === top, {key, top});
  };
  await scroll(620, 'a');
  await page.getByRole('button', {name:'B', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 0);
  await scroll(310, 'b');
  await page.getByRole('button', {name:'A', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 620);
  await page.getByRole('button', {name:'Trigger', exact:true}).click();
  await scroll(120, 'a:trigger:t');
  await page.getByRole('button', {name:'A', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 620);
  await page.getByRole('button', {name:'Remount', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 620);
  await page.getByRole('button', {name:'B', exact:true}).click();
  await page.getByRole('button', {name:'Deferred A', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="right-panel-scroll"]').scrollTop === 620);
  assert.equal(await page.evaluate(() => window.saved.rightPanelScrollPositions.a), 620);
  const writes = await page.evaluate(() => window.settingsWrites);
  const duringScroll = await panel.evaluate(async element => {
    for (const top of [630,640,650]) {
      element.scrollTop = top;
      element.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return window.settingsWrites;
  });
  assert.equal(duringScroll, writes, 'Scrolling must not rerender settings on every scroll event');
  await page.waitForFunction(() => window.saved.rightPanelScrollPositions.a === 650);
  assert.equal(await page.evaluate(() => window.settingsWrites), writes + 1);
  await panel.evaluate(element => { element.scrollTop = 700; element.dispatchEvent(new Event('scroll')); });
  await page.getByRole('button', {name:'B', exact:true}).click();
  await page.getByRole('button', {name:'A', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 700, 'Switching scenes flushes the pending position');
  await panel.evaluate(element => { element.scrollTop = 730; element.dispatchEvent(new Event('scroll')); });
  await page.getByRole('button', {name:'Remount', exact:true}).click();
  assert.equal(await panel.evaluate(element => element.scrollTop), 730, 'Remounting flushes the pending position before restoration');
  console.log('Right panel scroll: batched settings updates, pending-position flush, independent scenes/objects, remount and deferred content restoration passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
