import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';

const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button}from'antd';
 import Settings from'./components/RightPanelGWSettings';
 function Fixture(){const[settings,setSettings]=useState({startSceneId:'scene',startX:0,startY:0,startMoveSpeed:1,startAnimSpeed:6,startDirection:'down',colorMode:'mono'});
 const[project,setProject]=useState({name:'Test',author:'Test'});window.savedSettings=settings;
 window.testContext={settings,setSettings,project,setProject,scenes:[{id:'scene',name:'Scene',width:256,height:256,backgrounds:[]}],backgrounds:[],settingUtils:{}};
 return <ConfigProvider><App><Button onClick={()=>setSettings(previous=>({...previous,startAnimSpeed:7}))}>External update</Button><div style={{width:420}}><Settings controllerView={()=>{}}/></div></App></ConfigProvider>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/fixture.js',(_,response)=>response.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,response)=>response.type('html').send('<div id="root"></div><script src="/fixture.js"></script>'));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const selector=page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'Movement Speed',exact:true})});
 await selector.locator('.ant-select-selector').click();await page.getByText('Custom Speed',{exact:true}).filter({visible:true}).click();
 const input=page.getByRole('spinbutton',{name:'Movement Speed',exact:true});await input.waitFor();
 assert.equal(await page.evaluate(()=>window.savedSettings.startMoveSpeed),1,'Opening Custom Speed retains its numeric value');
 await page.getByRole('button',{name:'External update',exact:true}).click();assert.equal(await input.count(),1,'Settings updates keep the custom editor open');
 await input.fill('0.75');await page.keyboard.press('Tab');await page.waitForFunction(()=>window.savedSettings.startMoveSpeed===0.75);
 assert.equal(await input.inputValue(),'0.75');assert.equal(await page.evaluate(()=>window.savedSettings._saved),false);
 await input.fill('1.25');await page.keyboard.press('Tab');await page.waitForFunction(()=>window.savedSettings.startMoveSpeed===1.25);
 assert.equal(await page.evaluate(()=>window.savedSettings.colorMode),'mono','Editing speed must preserve the color mode enum');
 assert.deepEqual(errors,[]);console.log('Project movement speed: Custom Speed opens, survives settings updates and saves fractional edits.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
