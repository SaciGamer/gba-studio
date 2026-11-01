import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{build}from'esbuild';import{chromium,expect}from'@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import PanelEvents from './components/events/PanelEvents';
function sheet(w,h,vertical){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,w,h);x.fillStyle='lime';if(vertical)x.fillRect(0,h/2,w,h/2);else x.fillRect(w/2,0,w/2,h);return c.toDataURL()+'#';}
const normal=sheet(512,256,false),hd=sheet(240,320,true);
function Harness(){const[event,setEvent]=useState({id:'animation',command:'EVENT_BACKGROUND_ANIMATE',args:{layerId:0,backgroundId:'normal',direction:'horizontal',frameWidth:0,frameHeight:0,step:0,frameCount:0,durationFrames:10,loop:true}}),[language,setLanguage]=useState('en_US'),[sceneType,setSceneType]=useState('Adventure');window.setSceneType=setSceneType;window.selectedEvent=event;window.setLanguage=setLanguage;
window.context={elementSelected:{id:'scene',sceneType},backgrounds:[{id:'normal',name:'Normal sheet',filename:'normal.png',hd:false,imageWidth:512,imageHeight:256},{id:'hd',name:'HD sheet',filename:'hd.png',hd:true,imageWidth:240,imageHeight:320}],settingUtils:{localImagePath:normal,localImagePathHD:hd}};
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div id="fields" data-event-preview-area="animation" style={{marginLeft:400,width:350,padding:10}}><div id="event-title" tabIndex={0} style={{height:32}}>Animate Background</div><PanelEvents event={event} onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/></div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl','.jpg':'dataurl'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function useAppContexts(){return window.context}',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
await page.locator('#event-title').hover();const preview=page.getByLabel('Background animation preview',{exact:true});await expect(preview).toBeVisible();
assert.ok((await preview.boundingBox()).x<400,'Preview must be outside the inspector');
await page.evaluate(()=>{const toolbar=document.createElement('div');toolbar.dataset.previewTopbar='';toolbar.id='fixture-topbar';Object.assign(toolbar.style,{position:'fixed',top:'0',height:'74px',width:'100%',pointerEvents:'none'});document.body.append(toolbar);window.dispatchEvent(new Event('resize'));});
await expect.poll(async()=>(await preview.boundingBox()).y).toBe(82);
await page.evaluate(()=>{document.getElementById('fixture-topbar').style.height='98px';window.dispatchEvent(new Event('resize'));});
await expect.poll(async()=>(await preview.boundingBox()).y).toBe(106);
await page.evaluate(()=>{document.getElementById('fixture-topbar').remove();window.dispatchEvent(new Event('resize'));});

await page.getByRole('spinbutton',{name:'Frame width (px)',exact:true}).hover();await expect(preview).toBeVisible();await page.locator('#event-title').hover();await expect(preview).toBeVisible();await page.mouse.move(950,900);await expect(preview).toHaveCount(0);await page.locator('#event-title').hover();await expect(preview).toBeVisible();

await page.getByRole('spinbutton',{name:'Frame width (px)',exact:true}).hover();
const tooltip=page.getByRole('tooltip');await expect(tooltip).toBeVisible();await tooltip.hover();await page.waitForTimeout(180);await expect(preview).toBeVisible();
await page.mouse.move(950,900);await expect(preview).toHaveCount(0);await page.locator('#event-title').hover();
await expect(page.getByText('2 frames',{exact:true})).toBeVisible();
await expect.poll(()=>preview.getAttribute('data-frame')).toBe('1');
await page.getByRole('button',{name:'Pause preview',exact:true}).click();const held=await preview.getAttribute('data-frame');await page.waitForTimeout(250);assert.equal(await preview.getAttribute('data-frame'),held);
await page.getByRole('button',{name:'Play preview',exact:true}).click();
await page.getByRole('combobox',{name:'Animation speed',exact:true}).press('ArrowDown');await page.getByText('Fast (5 frames)',{exact:true}).click();assert.equal(await page.evaluate(()=>window.selectedEvent.args.durationFrames),5);
await page.getByRole('switch',{name:'Loop playback',exact:true}).click();await page.getByRole('button',{name:'Restart preview',exact:true}).click();await expect.poll(()=>preview.getAttribute('data-frame')).toBe('1');await page.waitForTimeout(200);assert.equal(await preview.getAttribute('data-frame'),'1');
await page.getByRole('combobox',{name:'Source image',exact:true}).press('ArrowDown');await expect(page.getByText('HD sheet',{exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await page.evaluate(()=>window.setSceneType('Logo'));await page.getByRole('combobox',{name:'Source image',exact:true}).press('ArrowDown');await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({hasText:'Normal sheet'})).toHaveCount(0);await page.getByText('HD sheet',{exact:true}).last().click();await expect(page.getByRole('spinbutton',{name:'Frame width (px)',exact:true})).toHaveValue('240');
await page.getByText('Vertical',{exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Frame displacement (px)',exact:true})).toHaveValue('160');await expect(page.getByText('2 frames',{exact:true})).toBeVisible();
const step=page.getByRole('spinbutton',{name:'Frame displacement (px)',exact:true});await step.fill('80');await step.press('Tab');await expect(page.getByText('3 frames',{exact:true})).toBeVisible();
await page.getByRole('combobox',{name:'Animation speed',exact:true}).press('ArrowDown');await page.getByText('Custom',{exact:true}).click();const ticks=page.getByRole('spinbutton',{name:'Animation speed',exact:true});await ticks.fill('2');await ticks.press('Tab');assert.equal(await page.evaluate(()=>window.selectedEvent.args.durationFrames),2);
await page.getByRole('button',{name:'Animation time unit',exact:true}).click();await page.getByRole('menuitem',{name:'Seconds',exact:true}).click();
assert.equal(await page.evaluate(()=>window.selectedEvent.args.durationFrames),2,'Changing the display unit must preserve the playback speed');
const seconds=page.getByRole('spinbutton',{name:'Animation speed',exact:true});await seconds.fill('0.25');await seconds.press('Tab');
assert.equal(await page.evaluate(()=>window.selectedEvent.args.durationFrames),15,'A quarter second must compile to 15 ticks per frame');
await page.getByRole('button',{name:'Animation time unit',exact:true}).click();await page.getByRole('menuitem',{name:'Frames',exact:true}).click();
const restored=page.getByRole('spinbutton',{name:'Animation speed',exact:true});await expect(restored).toHaveValue('15');await restored.fill('2');await restored.press('Tab');

await page.getByRole('button',{name:'Pause preview',exact:true}).click();
const start=page.getByRole('spinbutton',{name:'Start frame',exact:true}),end=page.getByRole('spinbutton',{name:'End frame (0 = last)',exact:true});
await end.fill('3');await end.press('Tab');await start.fill('2');await start.press('Tab');
await page.getByRole('switch',{name:'Play backwards',exact:true}).click();
await expect(preview).toHaveAttribute('data-source-frame','3');
await expect(page.getByText('2 frames',{exact:true})).toBeVisible();
await page.getByRole('button',{name:'Play preview',exact:true}).click();
await expect.poll(()=>preview.getAttribute('data-source-frame')).toBe('2');await page.waitForTimeout(150);await expect(preview).toHaveAttribute('data-source-frame','2');
assert.deepEqual(await page.evaluate(()=>[window.selectedEvent.args.startFrame,window.selectedEvent.args.endFrame,window.selectedEvent.args.reverse]),[2,3,true]);
await page.getByRole('button',{name:'Animation time unit',exact:true}).click();await page.getByRole('menuitem',{name:'Frames',exact:true}).click();
await page.getByRole('button',{name:'Choose a speed preset',exact:true}).click();await page.getByRole('menuitem',{name:'Fast (5 frames)',exact:true}).click();await expect(page.getByRole('button',{name:'Animation time unit',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Animation time unit',exact:true})).toHaveText('Frames');
await page.evaluate(()=>window.setLanguage('pt_BR'));await expect(page.getByText('Deslocamento entre frames (px)',{exact:true})).toBeVisible();
await expect(page.getByText('Direção dos frames',{exact:true})).toBeVisible();
await expect(page.getByRole('combobox',{name:'Velocidade da animação',exact:true})).toBeVisible();
await page.getByRole('spinbutton',{name:'Deslocamento entre frames (px)',exact:true}).hover();fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/background-animation-preview.png'});
assert.deepEqual(errors,[]);console.log('Background animation UI passed: normal/HD selection, external animated preview, pause/restart, once hold, default steps, custom displacement/speed and localization.');
}catch(error){console.error(error);throw error;}finally{await browser.close();}
