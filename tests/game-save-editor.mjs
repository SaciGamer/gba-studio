import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{build}from'esbuild';import express from'express';import{chromium}from'playwright';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button}from'antd';import{I18nProvider}from'./i18n/I18n';import CollapseEvents from'./components/events/CollapseEventManager';import Add from'./components/events/SelectNewEvent';import{migrateScriptsToGraph,graphToScripts}from'./components/events/eventGraph';
const wait=(id,name)=>({id,command:'EVENT_WAIT',version:1,args:{units:'frames',frames:2,__name:name,__collapse:false}});
function Fixture(){const[scripts,setScripts]=useState([{id:'save',command:'EVENT_SAVE_WRITE',version:1,args:{slot:0,__collapse:true},children:{then:[wait('first','First Save'),wait('second','Second Save')]}},{id:'load',command:'EVENT_SAVE_LOAD',version:1,args:{slot:0,__collapse:true},children:{then:[wait('loaded','Load First')]}}]);window.savedEvents=scripts;
const scene={id:'room',_resourceType:'scene',sceneType:'Top Down',actors:[],triggers:[],script:scripts};window.testContext={elementSelected:scene,scenes:[scene],settings:{},spriteResources:[],backgrounds:[],variables:{variables:[]},settingUtils:{},userSettings:{favoriteEvents:[]},setUserSettings:()=>{},setSettingUtils:()=>{},setElementSelected:()=>{},setScenes:()=>{}};
window.roundtrip=()=>{const graph=migrateScriptsToGraph(scripts);const restored=graphToScripts(graph);window.graphResult=restored;setScripts(restored);};
return <ConfigProvider><App><I18nProvider language="en_US"><div style={{width:440,padding:20}} data-testid="panel"><Button onClick={()=>window.roundtrip()}>Graph roundtrip</Button><Add compact showFlowButton={false} onEventCreated={event=>setScripts([...scripts,event])}/><CollapseEvents scripts={scripts} onScriptsChange={setScripts}/></div></I18nProvider></App></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/fixture.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,r)=>r.type('html').send('<div id="root"></div><script>window.electronAPI=new Proxy({fetchImages:async()=>({status:"success",fileImages:[],localPath:""}),getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:"success",fileImages:[],localPath:"",projects:[],sounds:[]}))});</script><script src="/fixture.js"></script>'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.setDefaultTimeout(8000);await page.goto('http://127.0.0.1:'+server.address().port);const panel=page.getByTestId('panel');
 await panel.getByRole('tab',{name:'On Save',exact:true}).waitFor();assert.equal(await panel.getByRole('tab',{name:'On Load',exact:true}).count(),1);
 await panel.getByRole('tab',{name:'On Load',exact:true}).click();await panel.getByText('Load First',{exact:true}).waitFor();
 await panel.getByRole('button',{name:/Add Event/}).last().click();await page.getByText('Timer',{exact:true}).filter({visible:true}).click();await page.getByText('Wait',{exact:true}).filter({visible:true}).last().click();
 await page.waitForFunction(()=>window.savedEvents[1].children.then.length===2);
 await panel.getByRole('button',{name:/Add Event/}).first().click();await page.getByText('Save Data',{exact:true}).filter({visible:true}).click();
 for(const name of ['Game Data Save','Game Data Load','Game Data Remove','Variables Save','Variables Load'])assert.ok(await page.getByText(name,{exact:true}).filter({visible:true}).count()>0);
 assert.equal(await page.locator('.ant-dropdown:visible').getByText('On Load',{exact:true}).count(),0);
 await page.getByRole('menuitem',{name:'Game Data Load',exact:true}).click();await page.waitForFunction(()=>window.savedEvents.length===3);
 await panel.getByText('Game Data Load',{exact:true}).last().click();
 assert.equal(await panel.getByText('Variable(s)',{exact:true}).count(),0);assert.equal(await panel.getByText('Schema version',{exact:true}).count(),0);
 await panel.getByRole('tab',{name:'On Save',exact:true}).click();
 const first=panel.getByRole('button',{name:'Reorder First Save',exact:true}),second=panel.getByRole('button',{name:'Reorder Second Save',exact:true});
 await panel.getByText('First Save',{exact:true}).hover();const a=await first.boundingBox(),b=await second.boundingBox();assert.ok(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2,a.y+a.height/2+10);await page.mouse.move(b.x+b.width/2,b.y+b.height/2+5,{steps:20});await page.mouse.up();
 await page.waitForFunction(()=>window.savedEvents[0].children.then[0].id==='second');
 await page.evaluate(()=>window.roundtrip());assert.equal(await page.evaluate(()=>window.graphResult[0].children.then[0].id),'second');assert.equal(await page.evaluate(()=>window.graphResult[1].children.then.length),2);
 fs.mkdirSync('test-results',{recursive:true});await panel.screenshot({path:'test-results/game-save-editor.png'});assert.deepEqual(errors,[]);
 console.log('Game save editor passed: Save Data menu, separate Save/Load actions, removed standalone event, child editing, reorder and graph roundtrip.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
