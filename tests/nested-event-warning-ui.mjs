import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const frontend = path.resolve('src/renderer/frontend/src');
const result = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,theme}from'antd';import{I18nProvider}from'./i18n/I18n';import CollapseEventManager from'./components/events/CollapseEventManager';
const leaf={id:'leaf',command:'EVENT_CALL_SCRIPT',args:{scriptId:'',__collapse:true}};
const branch=(id,child)=>({id,command:'EVENT_IF',args:{__name:id,__collapse:true},children:{then:[child],else:[]}});
function App(){const[events,setEvents]=useState([branch('outer',branch('inner',leaf))]);window.replaceEvents=setEvents;window.renderedEvents=events;window.eventContext={elementSelected:{id:'scene',_resourceType:'scene',script:events,actors:[],triggers:[]},settingUtils:{},scenes:[],scripts:{scripts:[]},variables:{variables:[]},userSettings:{favoriteEvents:[]},setUserSettings:()=>{},setSettingUtils:()=>{},setScenes:update=>setEvents(previous=>update([{id:'scene',_resourceType:'scene',script:previous}])[0].script),setElementSelected:()=>{}};return <ConfigProvider theme={{algorithm:new URLSearchParams(location.search).has('dark')?theme.darkAlgorithm:theme.defaultAlgorithm,token:{motion:false}}}><I18nProvider language="en_US"><div id="inspector" style={{width:360,padding:20}}><CollapseEventManager scripts={events}/></div></I18nProvider></ConfigProvider>;}createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture', setup(builder) {
  builder.onResolve({ filter: /providers\/contexts\/AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onResolve({ filter: /^\.\/PanelEvents$|^\.\/FlowEditorManager$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: frontend, contents: args.path === 'context' ? 'export default()=>window.eventContext;' : args.path.includes('PanelEvents') ? 'export default()=> <div style={{height:40}}>Event fields</div>;' : 'export default()=>null;' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 600, height: 1400 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto(`http://fixture.test/${dark ? '?dark' : ''}`);
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'components/events/eventHeaders.css'), 'utf8') });
    await page.locator('[data-reference-event="leaf"]').waitFor();
    for (const width of [360, 280]) {
      await page.locator('#inspector').evaluate((node, width) => node.style.width = width + 'px', width);
      const notifications = await page.locator('.gba-event-list .ant-collapse-header .ant-badge-count').evaluateAll(nodes => nodes.map(node => {
        const badge = node.getBoundingClientRect(), header = node.closest('.ant-collapse-header').getBoundingClientRect();
        const hit = document.elementFromPoint(badge.x + badge.width / 2, badge.y + 2);
        return { centerX: badge.x + badge.width / 2, centerY: badge.y + badge.height / 2, right: header.right, top: header.top, visible: !!hit && (node.contains(hit) || hit.contains(node)) };
      }));
      assert.ok(notifications.length >= 5, 'Includes root, nested event and branch-body notifications');
      for (const badge of notifications) {
        assert.ok(Math.abs(badge.centerX - badge.right) < 2, 'Each nested badge anchors to its own header right edge');
        assert.ok(Math.abs(badge.centerY - badge.top) < 2, 'Each nested badge anchors to its own header top edge');
        assert.ok(badge.visible, 'The upper half of every nested badge must remain visible and hoverable');
      }
    }
    await page.screenshot({ path: path.join(os.tmpdir(), `gba-nested-warning-${dark ? 'dark' : 'light'}.png`) });
    await page.evaluate(() => window.replaceEvents([{id:'fade',command:'EVENT_FADE_IN',args:{speed:2,__automatic:true,__comment:true}}]));
    await page.locator('[data-reference-event="fade"]').waitFor();
    const fadeHeader = page.locator('[data-reference-event="fade"]').locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-collapse-header ")][1]');
    await fadeHeader.locator('.ant-badge-count').click();
    await page.waitForFunction(() => window.renderedEvents[0].args.__comment === false);
    assert.equal(await fadeHeader.locator('.ant-badge-count').count(), 0, 'Clicking the Fade In badge reactivates the event and removes its warning');
    await page.evaluate(() => window.replaceEvents([{...window.renderedEvents[0],args:{...window.renderedEvents[0].args,__comment:true}}]));
    await fadeHeader.locator('span[role="button"][tabindex="0"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.renderedEvents[0].args.__comment === false);
    assert.equal(await page.evaluate(() => window.renderedEvents[0].args.speed), 2);
    await page.evaluate(() => window.replaceEvents([{id:'automatic',command:'EVENT_FADE_IN',args:{speed:2,__automatic:true,__comment:false}}]));
    const sceneHeader = () => page.locator('[data-reference-event]').first().locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-collapse-header ")][1]');
    await sceneHeader().getByRole('button', {name:'Event options',exact:true}).click();
    await page.getByRole('menuitem', {name:'Add Event After',exact:true}).click();
    await page.locator('.ant-drawer-open input').first().fill('Fade In');
    await page.getByRole('menuitem').filter({hasText:/^Fade In$/}).click();
    await page.waitForFunction(() => window.renderedEvents.length === 1 && window.renderedEvents[0].command === 'EVENT_FADE_IN' && !window.renderedEvents[0].args.__automatic);
    await sceneHeader().getByRole('button', {name:'Event options',exact:true}).click();
    await page.getByRole('menuitem', {name:'Delete Event',exact:true}).click();
    await page.waitForFunction(() => window.renderedEvents.length === 1 && window.renderedEvents[0].args.__automatic === true && window.renderedEvents[0].args.__comment === false);
    assert.equal(await sceneHeader().locator('.ant-badge-count').count(), 0, 'Deleting the replacement restores an active automatic Fade In without a creation badge');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Nested event and branch badges anchor to their own title corner without clipping, in light/dark and narrow inspectors.');
} finally { await browser.close(); }
