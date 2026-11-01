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
 window.eventContext={elementSelected:{id:'scene',_resourceType:'scene',sceneType:'Platformer',width:240,height:160,backgrounds:[{layerId:0,backgroundId:'bg',x:0,y:0}],actors:[{id:'other',name:'NPC'}],triggers:[]},scenes:[{id:'scene'}],variables:{variables:[]},scripts:{scripts:[]},settings:{inputMap:{}},settingUtils:{activeSceneObject:{sceneId:'scene',type:'actor',id:'other'},localImagePath:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect x="80" y="50" width="80" height="60" fill="red"/></svg>')+'#'},userSettings:{favoriteEvents:[]},spriteResources:[],palettes:{palettes:[]},backgrounds:[{id:'bg',filename:'fixture.svg',name:'Fixture'}],setScenes:()=>{},setSettingUtils:()=>{},setElementSelected:()=>{},setUserSettings:()=>{}};
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
  const page = await browser.newPage();const errors=[];page.on('pageerror', error=>errors.push(error.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const fields=page.locator('#fields');
  await page.getByRole('menu').getByText('Actor',{exact:true}).click();
  await page.getByText('Set Actor Direction',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe('EVENT_ACTOR_SET_DIRECTION');
  assert.deepEqual(await page.evaluate(()=>window.selectedEvent.args),{actorId:'__PLAYER__',direction:'down'});
  const direction=fields.getByRole('radiogroup',{name:'Direction',exact:true});
  for(const label of ['Up','Right','Down','Left']) {
    await direction.getByRole('radio',{name:label,exact:true}).locator('xpath=ancestor::label').click();
    await expect(direction.getByRole('radio',{name:label,exact:true})).toBeChecked();
    assert.equal(await page.evaluate(()=>window.selectedEvent.args.direction),label.toLowerCase());
  }
  await fields.getByRole('combobox',{name:'Actor',exact:true}).press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible').getByText('NPC',{exact:true}).click();
  assert.equal(await page.evaluate(()=>window.selectedEvent.args.actorId),'other');
  await page.evaluate(()=>window.setLanguage('pt_BR'));
  await expect(fields.getByRole('radiogroup',{name:'Dire\u00e7\u00e3o',exact:true})).toBeVisible();
  await page.evaluate(()=>window.openEvents());
  await page.getByRole('textbox').fill('Definir dire');
  await page.getByRole('menuitem',{name:'Definir dire'}).click();
  await expect(fields.getByRole('radiogroup',{name:'Dire\u00e7\u00e3o',exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('Actor direction event menu, translated search, registered form, defaults, four directions and actor selector passed.');
}finally{await browser.close();}
