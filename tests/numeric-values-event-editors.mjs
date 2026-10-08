import assert from 'node:assert/strict';import path from 'node:path';
import {build}from'esbuild';import express from'express';import {chromium}from'playwright';
const frontend=path.resolve('src/renderer/frontend/src');
const js=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import {motionEventTitle} from './components/events/motionEventTitle';import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button,Space}from'antd';import{I18nProvider}from'./i18n/I18n';import Runtime from'./components/events/RuntimeEventPanel';import Camera from'./components/events/CameraEvent';import{SceneEvent}from'./components/events/SceneEvent';import Variable from'./components/events/VariableEvent';import If from'./components/events/IfEvent';import{WaitEvent}from'./components/events/WaitEvent';
const scenes=[{id:'target',name:'Target',width:730,height:200,backgrounds:[],actors:[]},{id:'other',name:'Other',width:256,height:256,backgrounds:[],actors:[]}];
const initial={PropertyMove:{command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:3,xUnit:'tiles',yUnit:'tiles',y:{kind:'expression',operation:'add',left:{kind:'property',actorId:'__PLAYER__',property:'y'},right:{kind:'number',value:2}}}},Move:{command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:3,y:5,xUnit:'tiles',yUnit:'tiles'}},LegacyMove:{command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:48,y:80}},Actor:{command:'EVENT_ACTOR_SET_POSITION',args:{actorId:'__PLAYER__',x:0,y:0}},Camera:{command:'EVENT_PAN_CAMERA',args:{x:{type:'number',value:0},y:{type:'number',value:0}}},Scene:{command:'EVENT_CHANGE_SCENE',args:{sceneId:'target',x:{type:'number',value:0},y:{type:'number',value:0},direction:'right',fadeSpeed:2}},Variable:{command:'EVENT_VARIABLE',args:{variableId:'flag',value:{kind:'literal',type:'boolean',value:false}}},If:{command:'EVENT_IF',args:{left:{kind:'literal',type:'number',value:0},operator:'==',right:{kind:'literal',type:'number',value:1}}},Wait:{command:'EVENT_WAIT',args:{units:'frames',time:1,frames:30}}};
function Fixture(){const[mode,setMode]=useState('Actor'),[event,setEvent]=useState({id:'event',...initial.Actor});window.eventValue=event;window.motionLabel=motionEventTitle(event,code=>code==='EVENT_PAN_CAMERA'?'Pan Camera':'Move Actor');window.reloadEvent=()=>setEvent(JSON.parse(JSON.stringify(event)));
window.testContext={variables:{variables:[{id:'local-0',name:'Local 0',symbol:'LOCAL0',type:'number',initialValue:20},{id:'flag',name:'Flag',symbol:'FLAG',type:'boolean',initialValue:false}]},scenes,elementSelected:scenes[0],backgrounds:[],settings:{},settingUtils:{localImagePath:'',localImagePathHD:''}};
const props={event,customTitle:()=>{},onValueChange:(id,args)=>setEvent({...event,args})};const content=mode==='Camera'?<Camera {...props}/>:mode==='Scene'?<SceneEvent {...props}/>:mode==='Variable'?<Variable {...props}/>:mode==='If'?<If {...props}/>:mode==='Wait'?<WaitEvent {...props}/>:<Runtime {...props}/>;
return <ConfigProvider><App><I18nProvider language="en_US"><Space>{Object.keys(initial).map(name=><Button key={name} onClick={()=>{setMode(name);setEvent({id:'event',...structuredClone(initial[name])});}}>{name}</Button>)}</Space><div key={mode} data-testid="event-panel" style={{width:420,padding:20}}>{content}</div></I18nProvider></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'ctx',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'ctx',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(js.outputFiles[0].text));app.get('/',(_,r)=>r.type('html').send('<html><body><div id="root"></div><script>window.electronAPI={getCommonFontImages:async()=>({}),fetchImages:async()=>({status:"success",fileImages:[],localPath:""})};</script><script src="/test.js"></script></body></html>'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);await page.goto(`http://127.0.0.1:${server.address().port}`);
 const panel=page.getByTestId('event-panel');
 await page.evaluate(()=>window.addEventListener('gba-studio:actor-position-preview',event=>window.actorPreview=event.detail));await page.getByRole('button',{name:'Move',exact:true}).click();await panel.getByRole('spinbutton').first().hover();assert.equal(await page.evaluate(()=>window.actorPreview.x),48);assert.equal(await page.evaluate(()=>window.actorPreview.y),80);assert.equal(await panel.getByRole('button',{name:'Unit for X'}).textContent(),'tiles');await panel.getByRole('button',{name:'Unit for X'}).click();assert.equal(await panel.getByRole('button',{name:'Unit for X'}).textContent(),'px');assert.equal(await page.evaluate(()=>window.actorPreview.x),3);assert.equal(await page.evaluate(()=>window.actorPreview.y),5);assert.equal(await page.evaluate(()=>window.eventValue.args.yUnit),'pixels');assert.equal(await panel.getByRole('button',{name:'Unit for Y'}).textContent(),'px');await panel.getByRole('button',{name:'Unit for Y'}).click();assert.equal(await page.evaluate(()=>window.eventValue.args.xUnit),'tiles');await page.evaluate(()=>window.reloadEvent());assert.equal(await page.evaluate(()=>window.eventValue.args.xUnit),'tiles');

 await page.getByRole('button',{name:'PropertyMove',exact:true}).click();
 assert.equal(await panel.getByRole('button',{name:'Unit for Y'}).textContent(),'tiles');
 assert.equal(await panel.getByRole('button',{name:'Unit for Y'}).isDisabled(),false);
 await panel.getByRole('button',{name:'Unit for X'}).click();
 assert.equal(await page.evaluate(()=>window.eventValue.args.yUnit),'pixels');
 await panel.getByRole('button',{name:'Unit for X'}).click();
 assert.equal(await page.evaluate(()=>window.eventValue.args.xUnit),'tiles');
 assert.equal(await page.evaluate(()=>window.eventValue.args.yUnit),'tiles');
 await page.getByRole('button',{name:'LegacyMove',exact:true}).click();await panel.getByRole('spinbutton').first().hover();assert.equal(await panel.getByRole('button',{name:'Unit for X'}).textContent(),'px');assert.equal(await page.evaluate(()=>window.actorPreview.x),48);assert.equal(await page.evaluate(()=>window.actorPreview.y),80);assert.equal(await page.evaluate(()=>window.eventValue.args.x),48);
 await page.getByRole('button',{name:'Actor',exact:true}).hover();assert.equal(await page.evaluate(()=>window.actorPreview),null);await page.getByRole('button',{name:'Actor',exact:true}).click();
 async function choose(index,group,item){await panel.getByRole('button',{name:'Choose value type'}).nth(index).click();await page.getByText(group,{exact:true}).filter({visible:true}).last().hover();await page.getByText(item,{exact:true}).filter({visible:true}).last().click();}
 await choose(0,'Math','Add');await page.waitForFunction(()=>window.eventValue.args.x.kind==='expression');
 await panel.getByRole('button',{name:'Choose value type'}).nth(1).click();await page.getByRole('menuitem',{name:'Variable',exact:true}).filter({visible:true}).last().click();await page.waitForFunction(()=>window.eventValue.args.x.right.kind==='variable');
 const saved=await page.evaluate(()=>JSON.stringify(window.eventValue));await page.evaluate(()=>window.reloadEvent());assert.equal(await page.evaluate(()=>JSON.stringify(window.eventValue)),saved);
 await page.getByRole('button',{name:'Camera',exact:true}).click();await panel.getByRole('button',{name:'Choose value type'}).first().click();await page.getByRole('menuitem',{name:'Variable',exact:true}).filter({visible:true}).last().click();await page.waitForFunction(()=>window.eventValue.args.x.kind==='variable');
 await page.getByRole('button',{name:'Scene',exact:true}).click();await choose(0,'Math','Modulus');await page.waitForFunction(()=>window.eventValue.args.x.operation==='modulo');
 await page.getByRole('button',{name:'Variable',exact:true}).click();await choose(0,'Boolean','NOT');await page.waitForFunction(()=>window.eventValue.args.value.operation==='not');assert.equal(await page.evaluate(()=>window.eventValue.args.variableId),'flag');
 await page.getByRole('button',{name:'If',exact:true}).click();await choose(0,'Comparison','Greater Than');await page.waitForFunction(()=>window.eventValue.args.left.operation==='greater');
 await page.getByRole('button',{name:'Wait',exact:true}).click();await panel.getByRole('button',{name:'Choose value type'}).first().click();await page.getByRole('menuitem',{name:'Variable',exact:true}).filter({visible:true}).last().click();await page.waitForFunction(()=>window.eventValue.args.frames.kind==='variable');

 await page.getByRole('button',{name:'Camera',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.motionLabel),'Pan Camera');
 await panel.getByRole('checkbox',{name:'Move to destination with speed'}).check();
 await page.waitForFunction(()=>window.eventValue.args.animated===true);
 assert.equal(await page.evaluate(()=>window.motionLabel),'Pan Camera To {0, 0}');
 await panel.getByRole('spinbutton',{name:'Speed (pixels per frame)'}).fill('2');await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>window.eventValue.args.speed),2);
 await panel.getByRole('checkbox',{name:'Move to destination with speed'}).uncheck();
 assert.equal(await page.evaluate(()=>window.motionLabel),'Pan Camera');
 await page.getByRole('button',{name:'Move',exact:true}).click();
 await panel.getByRole('checkbox',{name:'Move to destination with speed'}).check();
 assert.equal(await page.evaluate(()=>window.motionLabel),'Move Actor To {3, 5}');
 await page.evaluate(()=>window.reloadEvent());assert.equal(await panel.getByRole('checkbox',{name:'Move to destination with speed'}).isChecked(),true);
 await panel.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'Movement speed',exact:true})}).locator('.ant-select-selector').click();
 await page.getByText('Speed \u00bd',{exact:true}).filter({visible:true}).click();
 assert.equal(await page.evaluate(()=>window.eventValue.args.speed),0.5);
 await panel.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'Animation speed',exact:true})}).locator('.ant-select-selector').click();
 await page.getByText('Speed 8 (Faster)',{exact:true}).filter({visible:true}).click();
 assert.equal(await page.evaluate(()=>window.eventValue.args.animationSpeed),8);
 await panel.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'Movement speed',exact:true})}).locator('.ant-select-selector').click();
 await page.getByText('Custom speed',{exact:true}).filter({visible:true}).click();
 await panel.getByRole('spinbutton',{name:'Movement speed',exact:true}).fill('0.75');await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>window.eventValue.args.speed),0.75);
 assert.equal(await page.evaluate(()=>window.eventValue.args.animationSpeed),8);

 assert.deepEqual(errors,[]);console.log('Actual event editors passed: Actor/Camera/Change Scene X-Y, boolean variable logic, numeric IF operand, WAIT variation and JSON save/reload.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
