import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Tooltip}from'antd';
import{I18nProvider}from'./i18n/I18n';import Facing from'./components/events/FacingTargetPreview';import Follow from'./components/events/CameraFollowPreview';import Panel from'./components/events/RuntimeEventPanel';
window.electronAPI=new Proxy({getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:'success',fileImages:[],projects:[],sounds:[],localPath:''}))});
window.context={elementSelected:{id:'e8ab1fac-29d7-423e-a6fd-4ee600b0437d',actors:[],backgrounds:[]},variables:{variables:[]},settings:{},settingUtils:{},scenes:[],backgrounds:[],spriteResources:[],prefabs:{prefabs:[]},palettes:{palettes:[]}};
const outer={id:'c2d15146-f824-4401-8d4a-08e92e2ef6ab',command:'EVENT_IF_ACTOR_FACING',args:{__collapse:true,lookY:false}};
const inner={id:'54520591-68f7-486d-9248-871ee0a27681',command:'EVENT_CAMERA_FOLLOW',args:{__collapse:true,actorId:'__PLAYER__',deadZoneWidth:32,deadZoneHeight:16}};
function Harness(){const[value,setValue]=useState(''),[clicks,setClicks]=useState(0),[showInner,setShowInner]=useState(true),[event,setEvent]=useState({id:'7d8e8d48-6b83-4f31-bfe7-bbfbe9dd8acb',command:'EVENT_UI_SET_TEXT',args:{text:'Test',__collapse:true}});
window.setShowInner=setShowInner;window.setGrandEvent=setEvent;
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language="en_US"><div className="ant-collapse-item" data-testid="outer" style={{marginLeft:500,width:440,padding:12,minHeight:620,border:'1px solid #aaa'}}>
<Facing event={outer}><button type="button" data-testid="outer-button">Outer header</button></Facing>
{showInner&&<div className="ant-collapse-item" data-testid="inner" style={{padding:12,marginTop:16,border:'1px solid #aaa'}}>
<Follow event={inner}><button type="button" data-testid="inner-button" onClick={()=>setClicks(clicks+1)}>Inner button {clicks}</button><input aria-label="Inner input" value={value} onChange={event=>setValue(event.target.value)}/><Tooltip title="Nested tooltip"><button type="button">Inner help</button></Tooltip></Follow>
<div className="ant-collapse-item" data-testid="grandchild" style={{padding:12,marginTop:16,border:'1px solid #aaa'}}><Panel event={event} onValueChange={(_id,args)=>setEvent(old=>({...old,args}))}/></div>
</div>}
</div><button type="button" data-testid="outside" style={{position:'fixed',left:1050,top:20}}>Outside</button></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const outer = page.getByTestId('facing-preview');
  const inner = page.getByRole('region', { name: 'Camera central area', exact: true });
  const grandchild = page.getByLabel('UI text preview', { exact: true });
  await page.getByTestId('outer-button').hover(); await expect(outer).toBeVisible(); await expect(inner).toHaveCount(0);
  await page.getByTestId('inner-button').hover(); await expect(inner).toBeVisible(); await expect(outer).toHaveCount(0);
  await page.getByTestId('inner-button').click(); await expect(inner).toBeVisible(); await expect(outer).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Inner input', exact: true }).fill('Typing inside the nested event');
  await expect(inner).toBeVisible(); await expect(outer).toHaveCount(0);
  const text = page.getByTestId('grandchild').locator('textarea');
  await text.click(); await text.fill('Changed text');
  await expect(grandchild).toBeVisible(); await expect(inner).toHaveCount(0); await expect(outer).toHaveCount(0);
  await page.getByTestId('grandchild').locator('.ant-select').first().click();
  await page.locator('.ant-select-item-option:visible').first().click();
  await expect(grandchild).toBeVisible(); await expect(inner).toHaveCount(0); await expect(outer).toHaveCount(0);
  await page.evaluate(() => window.setGrandEvent(old => ({ ...old, command: 'EVENT_HBE_EFFECT_ENABLE', args: { preset: 'mosaic_wave', intensity: 8, layerId: 0, __collapse: true } })));
  await page.getByTestId('grandchild').locator('.ant-select').first().click();
  await page.locator('.ant-select-item-option:visible').first().click();
  await expect(page.getByLabel('H-Blank effect preview', { exact: true })).toBeVisible();
  await expect(inner).toHaveCount(0); await expect(outer).toHaveCount(0);
  await page.getByTestId('inner-button').hover(); await expect(inner).toBeVisible(); await expect(grandchild).toHaveCount(0);
  await expect(page.getByLabel('H-Blank effect preview', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inner help', exact: true }).hover();
  await page.getByRole('tooltip', { name: 'Nested tooltip', exact: true }).hover();
  await expect(inner).toBeVisible(); await expect(outer).toHaveCount(0);
  await page.getByTestId('outer-button').hover(); await expect(outer).toBeVisible(); await expect(inner).toHaveCount(0);
  // Keyboard focus in a descendant must win even though focusin bubbles to its ancestors.
  await page.getByRole('textbox', { name: 'Inner input', exact: true }).focus();
  await expect(inner).toBeVisible(); await expect(outer).toHaveCount(0);
  await page.getByTestId('inner-button').hover();
  await page.evaluate(() => window.setShowInner(false));
  await expect(outer).toBeVisible(); await expect(inner).toHaveCount(0);
  await page.getByTestId('outside').click(); await expect(outer).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('Nested previews: deepest hover/focus, button clicks, typing, dropdowns, tooltip portals, parent restoration and unmount cleanup passed.');
} finally { await browser.close(); }
