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
 window.eventContext={elementSelected:{id:'scene',_resourceType:'scene',sceneType:'Platformer',width:240,height:160,backgrounds:[{layerId:0,backgroundId:'bg',x:0,y:0}],actors:[{id:'other',name:'NPC'}],triggers:[]},scenes:[{id:'scene'}],variables:{variables:[]},scripts:{scripts:[]},settings:{inputMap:{}},settingUtils:{activeSceneObject:null,localImagePath:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect x="80" y="50" width="80" height="60" fill="red"/></svg>')+'#'},userSettings:{favoriteEvents:[]},spriteResources:[],palettes:{palettes:[]},backgrounds:[{id:'bg',filename:'fixture.svg',name:'Fixture'}],setScenes:()=>{},setSettingUtils:()=>{},setElementSelected:()=>{},setUserSettings:()=>{}};
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
  await page.getByText('Joypad Input',{exact:true}).click();
  await page.getByText('Run Button Action',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe('EVENT_RUN_BUTTON_ACTION');
  const fields=page.locator('#fields');
  await expect(fields.getByRole('combobox',{name:'Source button',exact:true})).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>window.selectedEvent.args),{button:'B',mode:'default'});
  await fields.getByRole('combobox',{name:'Action type',exact:true}).press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible').getByText('Custom action',{exact:true}).click();
  await fields.getByRole('combobox',{name:'Source button',exact:true}).press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible .rc-virtual-list-holder').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.locator('.ant-select-dropdown:visible').getByText('RIGHT',{exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.selectedEvent.args),{button:'RIGHT',mode:'custom'});
  await page.evaluate(()=>window.openEvents());
  await page.getByText('Actor',{exact:true}).click();
  await page.getByText('Stop Physics',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe('EVENT_STOP_PHYSICS');
  await expect(fields.getByRole('combobox',{name:'Actor',exact:true})).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>window.selectedEvent.args),{actorId:'__PLAYER__'});
  await fields.getByRole('combobox',{name:'Actor',exact:true}).press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible').getByText('NPC',{exact:true}).click();
  assert.equal(await page.evaluate(()=>window.selectedEvent.args.actorId),'other');
  await page.evaluate(()=>window.setLanguage('pt_BR'));
  await expect(fields).toContainText('Zera a velocidade');
  await page.evaluate(()=>window.setLanguage('en_US'));
  for (const [label, command, field] of [
    ['Set Gravity','EVENT_PHYSICS_SET_GRAVITY','Gravity'],
    ['Set Jump Speed','EVENT_PHYSICS_SET_JUMP_SPEED','Jump speed'],
    ['Set Maximum Fall Speed','EVENT_PHYSICS_SET_MAX_FALL_SPEED','Maximum fall speed'],
    ['Set Air Jumps','EVENT_PHYSICS_SET_AIR_JUMPS','Extra air jumps'],
    ['Set Diagonal Movement','EVENT_PHYSICS_SET_DIAGONAL','Allow diagonal movement'],
    ['Reset Physics','EVENT_PHYSICS_RESET','default physics'],
  ]) {
    await page.evaluate(()=>window.openEvents());
    await page.getByRole('textbox').fill('');
    await page.getByRole('menu').getByText('Actor',{exact:true}).click();
    await expect(page.getByText('Configure Physics',{exact:true})).toHaveCount(0);
    await page.getByText(label,{exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe(command);
    await expect(fields).toContainText(field);
    await expect(fields.getByRole('switch')).toHaveCount(command==='EVENT_PHYSICS_SET_DIAGONAL'?1:0);
  }
  for(const [category,label,command,field] of [
    ['Scene','Animate Background','EVENT_BACKGROUND_ANIMATE','Source image'],
    ['Scene','Scale Background','EVENT_BACKGROUND_SET_SCALE','Scale X (%)'],
    ['Scene','Rotate Background','EVENT_BACKGROUND_SET_ROTATION','Angle (degrees)'],
    ['Scene','Shear Background','EVENT_BACKGROUND_SET_SHEAR','Shear X (%)'],
    ['Actor','Actor Color Overlay','EVENT_ACTOR_SET_TINT','Color overlay (%)'],
    ['Actor','Actor Saturation','EVENT_ACTOR_SET_SATURATION','Saturation (%)'],
    ['Actor','Actor Brightness','EVENT_ACTOR_SET_BRIGHTNESS','Brightness (%)'],
    ['Actor','Actor Opacity','EVENT_ACTOR_SET_OPACITY','Opacity (%)'],
  ]) {
    await page.evaluate(()=>window.openEvents());
    await page.getByRole('textbox').fill('');
    await page.getByRole('menu').getByText(category,{exact:true}).click();
    await page.getByText(label,{exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.selectedEvent?.command)).toBe(command);
    await expect(fields).toContainText(field).catch(error=>{console.error(errors.join('\n'));throw error;});
    if(command.startsWith('EVENT_BACKGROUND_SET_')) {
      await fields.getByText(field,{exact:true}).hover();
      await expect(page.getByLabel('Background transform preview',{exact:true})).toBeVisible();
      const pixels = () => page.getByLabel('Background transform preview',{exact:true}).evaluate(canvas=>{
        const data=canvas.getContext('2d').getImageData(0,0,240,160).data;
        let count=0,signature=0;for(let i=0;i<data.length;i+=4) if(data[i+3]){count++;signature+=i;}
        return [count,signature];
      });
      await expect.poll(async()=>(await pixels())[0]).toBeGreaterThan(100);
      const original=await pixels();
      await page.evaluate(command=>window.setPreviewEvent(previous=>({...previous,args:{...previous.args,...(command==='EVENT_BACKGROUND_SET_ROTATION'?{angle:45}:{x:150,y:50})}})),command);
      await expect.poll(pixels).not.toEqual(original);

      await page.mouse.move(900,650);
      await expect(page.getByLabel('Background transform preview',{exact:true})).toHaveCount(0);
    }

  }
  await page.evaluate(()=>window.setLanguage('pt_BR'));
  await expect(fields).toContainText('Opacidade (%)');
  await expect(fields).toContainText('compartilham o último valor alpha');
  await page.evaluate(()=>{window.setLanguage('pt_BR');window.openEvents();});
  await page.getByRole('textbox').fill('Definir gravidade');
  await page.getByRole('menuitem',{name:'Definir gravidade',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.selectedEvent.command),'EVENT_PHYSICS_SET_GRAVITY');
  await page.evaluate(()=>window.setLanguage('en_US'));
  assert.deepEqual(errors,[]);
  console.log('Event picker and forms passed: button actions, physics, background scale/rotation/shear, actor tint/saturation/brightness/opacity, defaults and localization.');
} finally {await browser.close();}
