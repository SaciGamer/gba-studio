import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Collapse, ConfigProvider, Select, Tabs, theme } from 'antd';
    import WarningIndicator, { AttentionLabel, WarningField } from './src/renderer/frontend/src/components/WarningIndicator';
    import { BackgroundSelector } from './src/renderer/frontend/src/components/BackgroundSelector';
    const dark = new URLSearchParams(location.search).has('dark');
    createRoot(document.getElementById('root')).render(<ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <div style={{ width: 320, padding: 20, background: dark ? '#141414' : '#fff' }}>
        <Tabs className="gba-background-tabs" type="card" size="small" items={[{key:'1', label:<AttentionLabel label="Layer 0" count={2}/>, children:<WarningField warning message="Missing background"><Select style={{width:'100%'}} placeholder="Background"/></WarningField>}, {key:'2',label:'Layer 1'}]} />
        <div className="gba-event-list"><Collapse items={[{ key:'event',label:'Event',extra:<div style={{position:'static'}}><span style={{position:'absolute',top:0,right:0,zIndex:5}}><WarningIndicator message="Missing event input"/></span></div>,children:'Editor' }]} /></div>
        <div className="background-test"><BackgroundSelector selectedElementId="scene" layerKey={0} showPreviewVisibilityToggle /></div>
        <div className="background-test"><BackgroundSelector selectedElementId="scene" layerKey={0} showPreviewVisibilityToggle hasTilesetTag /></div>
        <div id="border-overlay" style={{position:'absolute',top:0,left:0,width:360,height:4,zIndex:2000,background:'#888'}} />
        <div id="menu-scroll" style={{position:'absolute',top:400,left:20,width:220,height:60,overflow:'auto'}}><WarningField overlay warning message="Missing Settings palette"><Select style={{width:'100%'}} placeholder="Editor menu" /></WarningField></div>
        <div style={{position:'absolute',top:396,left:230,width:30,height:12,zIndex:9000,background:'#888'}} />
      </div>
    </ConfigProvider>);
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  alias: { '@': path.resolve('src/renderer/frontend/src') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'fixture-context', setup(builder) {
    builder.onResolve({ filter: /^@\/providers\/contexts\/AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export default () => ({ scenes: [{id:'scene',backgrounds:[{layerId:0,backgroundId:null,__referenceWarnings:{backgroundId:'Missing'}}]}],setScenes:()=>{}, backgroundsRef:{current:[]},settingUtils:{},setElementSelected:()=>{},setSettingUtils:()=>{},userSettings:{},setUserSettings:()=>{} });` }));
  }}],
});
const browser = await chromium.launch({ headless: true });
try {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 480, height: 620 } });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(`about:blank${dark ? '?dark' : ''}`);
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.addStyleTag({ content: fs.readFileSync('src/renderer/frontend/src/components/events/eventHeaders.css', 'utf8') });
    await page.addStyleTag({ content: fs.readFileSync('src/renderer/frontend/src/components/themes/globalStyles.css', 'utf8') });
    const badges = page.locator('.ant-badge-count');
    await badges.first().waitFor();
    await page.locator('[data-warning-overlay]').waitFor({ state: 'attached' });
    assert.equal(await badges.count(), 6, 'Tabs, fields, menus and events use actual Ant Design badges');
    for (const row of await page.locator('.background-test').all()) {
      const selector = await row.locator('.ant-select').boundingBox();
      const indicator = await row.locator('.ant-badge-count').boundingBox();
      const eye = await row.locator('button').last().boundingBox();
      assert.ok(Math.abs(indicator.x + indicator.width / 2 - selector.x - selector.width) < 2, 'Background warning anchors to the select, including with custom tiles');
      assert.ok(indicator.x + indicator.width / 2 < eye.x + eye.width / 2, 'Background warning must not anchor to the eye suffix');
    }
    const field = page.locator('.ant-select').first();
    const control = await field.boundingBox();
    const badge = await badges.nth(1).boundingBox();
    assert.ok(badge.x < control.x + control.width && badge.x + badge.width > control.x + control.width, 'Field badge straddles the right border');
    assert.ok(badge.y < control.y && badge.y + badge.height > control.y, 'Field badge straddles the top border');
    const tabBadge = await badges.first().boundingBox();
    const tab = await page.locator('.ant-tabs-tab').first().boundingBox();
    assert.ok(tabBadge.y < tab.y && tabBadge.y + tabBadge.height > tab.y, 'Layer badge straddles the external top border of the tab');
    assert.ok(tabBadge.x < tab.x + tab.width && tabBadge.x + tabBadge.width > tab.x + tab.width, 'Layer badge straddles the external right border of the tab');
    assert.ok(await badges.first().evaluate(node => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 2));
    }), 'The upper part of the tab badge is not clipped');
    const header = await page.locator('.ant-collapse-header').boundingBox();
    const eventBadge = await badges.nth(2).boundingBox();
    assert.ok(eventBadge.x < header.x + header.width && eventBadge.x + eventBadge.width > header.x + header.width);
    assert.ok(eventBadge.y < header.y && eventBadge.y + eventBadge.height > header.y, 'Event badge straddles the header corner');
    await badges.nth(1).hover();
    const tooltip = page.getByRole('tooltip', { name: 'Missing background' });
    await tooltip.waitFor();
    assert.ok(await tooltip.evaluate(node => Number(getComputedStyle(node.closest('.ant-tooltip')).zIndex) > 2000));
    assert.equal(await field.locator('.ant-badge').count(), 0, 'Badge is outside the input');
    assert.ok(await page.locator('#menu-scroll').evaluate(node => node.scrollWidth === node.clientWidth && node.scrollHeight === node.clientHeight), 'Overlay badge creates no menu scrollbar');
    assert.equal(await page.locator('#menu-scroll .ant-badge').count(), 0, 'Menu badge is rendered outside the clipped menu');
    assert.ok(await page.locator('[data-warning-overlay] .ant-badge-count').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), 'Overlay badge stays above the screen menu');
    await page.mouse.move(450, 300);
    await page.getByRole('img', { name: 'Missing background' }).focus();
    await tooltip.waitFor({ state: 'visible' });
    const screenshot = path.join(os.tmpdir(), `gba-warning-badge-${dark ? 'dark' : 'light'}.png`);
    await page.screenshot({ path: screenshot });
    assert.deepEqual(failures, []);
    console.log(`Badge corner placement, tab clipping, tooltip priority and keyboard focus passed: ${screenshot}`);
    await page.close();
  }
} finally { await browser.close(); }
