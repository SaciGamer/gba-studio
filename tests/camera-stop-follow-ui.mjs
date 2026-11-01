import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {App,ConfigProvider} from 'antd';
import {I18nProvider} from './i18n/I18n';import SelectNewEvent from './components/events/SelectNewEvent';import PanelEvents from './components/events/PanelEvents';
window.electronAPI={fetchImages:async()=>({status:'success',fileImages:[]}),listTrackerProjects:async()=>({status:'success',projects:[]}),listProjectSfx:async()=>({status:'success',projects:[]}),getCommonFontImages:async()=>({})};
function Harness(){const [open,setOpen]=useState(true),[event,setEvent]=useState(null),[language,setLanguage]=useState('en_US');window.selectedEvent=event;window.setPreviewEvent=setEvent;window.openEvents=()=>setOpen(true);window.setLanguage=setLanguage;
 window.eventContext={elementSelected:{id:'c8de5a4d-2bc6-402c-a2cd-7387d4eb29b7',_resourceType:'scene',sceneType:'Platformer',width:240,height:160,backgrounds:[{layerId:0,backgroundId:'4b0516f7-661d-41ff-8e82-473dac9283f1',x:0,y:0}],actors:[{id:'53626226-d1eb-4513-9c9e-96f642e0dd03',name:'NPC'}],triggers:[]},scenes:[{id:'c8de5a4d-2bc6-402c-a2cd-7387d4eb29b7'}],variables:{variables:[]},scripts:{scripts:[]},settings:{inputMap:{}},settingUtils:{activeSceneObject:{sceneId:'c8de5a4d-2bc6-402c-a2cd-7387d4eb29b7',type:'actor',id:'53626226-d1eb-4513-9c9e-96f642e0dd03'},localImagePath:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect x="80" y="50" width="80" height="60" fill="red"/></svg>')+'#'},userSettings:{favoriteEvents:[]},spriteResources:[],palettes:{palettes:[]},backgrounds:[{id:'4b0516f7-661d-41ff-8e82-473dac9283f1',filename:'fixture.svg',name:'Fixture'}],setScenes:()=>{},setSettingUtils:()=>{},setElementSelected:()=>{},setUserSettings:()=>{}};
 return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><SelectNewEvent tabIndex={0} subTabIndex={0} open={open} onOpenChange={setOpen} hideTrigger showFlowButton={false} onEventCreated={setEvent}/>
 <div id="fields" style={{width:380,padding:16}}>{event&&<PanelEvents event={event} onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/>}</div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, plugins: [{ name: 'event-test-context', setup(bundler) {
  bundler.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  bundler.onResolve({ filter: /^\.\/FlowEditorManager$/ }, () => ({ path: 'flow', namespace: 'fixture' }));
  bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', contents: args.path === 'context' ? 'export default function useAppContexts(){return window.eventContext;}' : 'export default function Flow(){return null;}' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('menu').getByText('Camera',{exact:true}).click();
  await page.getByText('Camera: Stop Follow',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe('EVENT_CAMERA_STOP_FOLLOW');
  assert.deepEqual(await page.evaluate(()=>window.selectedEvent.args),{});
  await expect(page.locator('#fields')).toContainText('Stops camera follow');
  await expect(page.locator('#fields').getByRole('textbox')).toHaveCount(0);
  await page.evaluate(()=>{window.setLanguage('pt_BR');window.openEvents();});
  await page.getByRole('textbox').fill('parar de seguir');
  await page.getByRole('menuitem',{name:'C\u00e2mera: parar de seguir',exact:true}).click();
  await expect(page.locator('#fields')).toContainText('Para o Follow');
  for(const [language,description] of [['es_ES','Detiene el seguimiento'],['fr_FR','Arr\u00eate le suivi']]) {
    await page.evaluate(language=>window.setLanguage(language),language);
    await expect(page.locator('#fields')).toContainText(description);
  }
  assert.deepEqual(errors,[]);
  console.log('Camera Stop Follow: Camera category, translated search, no-parameter form and all locale descriptions passed.');
} finally {await browser.close();}
