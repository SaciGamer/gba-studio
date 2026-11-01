import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import Facing from'./components/events/FacingTargetPreview';import Follow from'./components/events/CameraFollowPreview';
window.context={elementSelected:{id:'e8ab1fac-29d7-423e-a6fd-4ee600b0437d',actors:[]},settings:{},settingUtils:{}};
const parent={id:'c2d15146-f824-4401-8d4a-08e92e2ef6ab',command:'EVENT_IF_ACTOR_FACING',args:{__collapse:true}};
const child={id:'54520591-68f7-486d-9248-871ee0a27681',command:'EVENT_CAMERA_FOLLOW',args:{__collapse:true}};
createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="en_US"><div data-testid="scroll" style={{marginLeft:500,marginTop:20,width:440,height:500,overflow:'auto'}}>
<div className="ant-collapse-item" style={{height:1500,padding:12}}><Facing event={parent}><button type="button" data-testid="parent-button">Parent</button></Facing><div style={{height:300}}/>
<div className="ant-collapse-item" style={{padding:12,height:160,border:'1px solid'}}><Follow event={child}><input aria-label="Child input"/><button type="button">Child</button></Follow></div>
</div></div></I18nProvider></ConfigProvider>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const parent = page.getByTestId('facing-preview');
  const child = page.getByRole('region', { name: 'Camera central area', exact: true });
  const pointer = { x: 640, y: 180 };
  const original = await page.getByRole('textbox', { name: 'Child input' }).boundingBox();
  const offset = original.y + original.height / 2 - pointer.y;
  await page.mouse.move(pointer.x, pointer.y); await expect(parent).toBeVisible();
  await page.evaluate(() => {
    window.overlappingFrames = 0;
    const sample = () => {
      if (document.querySelector('[data-testid="facing-preview"]') && document.querySelector('[role="region"][aria-label="Camera central area"]')) ++window.overlappingFrames;
      window.previewFrame = requestAnimationFrame(sample);
    };
    window.previewFrame = requestAnimationFrame(sample);
  });
  for (let iteration = 0; iteration < 3; ++iteration) {
    if (iteration === 0) await page.mouse.wheel(0, offset);
    else await page.getByTestId('scroll').evaluate((element, offset) => { element.scrollTop = offset; }, offset);
    await expect(child).toBeVisible(); await expect(parent).toHaveCount(0);
    // Extra scroll notifications must never revive an inactive preview underneath.
    await page.getByTestId('scroll').evaluate(element => { element.scrollTop += 1; });
    await expect(child).toBeVisible(); await expect(parent).toHaveCount(0);
    if (iteration === 0) {
      await page.setViewportSize({ width: 1280, height: 920 });
      await expect(child).toBeVisible(); await expect(parent).toHaveCount(0);
    }
    await page.getByTestId('scroll').evaluate(element => { element.scrollTop = 0; });
    await expect(parent).toBeVisible(); await expect(child).toHaveCount(0);
    await page.getByTestId('parent-button').focus();
  }
  assert.equal(await page.evaluate(() => { cancelAnimationFrame(window.previewFrame); return window.overlappingFrames; }), 0, 'No frame displays both previews');
  assert.deepEqual(errors, []);
  console.log('Stationary-pointer scroll: child priority, no revived parent, reverse scrolling and focused-parent precedence passed.');
} finally { await browser.close(); }
