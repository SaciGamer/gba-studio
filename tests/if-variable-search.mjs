import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {build}from'esbuild';import express from'express';import {chromium}from'playwright';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,App,Flex}from'antd';import{I18nProvider}from'./i18n/I18n';import NumericValueInput from'./components/NumericValueInput';import {Operand} from './components/events/IfEvent';function Fixture(){const[x,setX]=useState({kind:'variable',variableId:'eb2713a1-fc64-46d1-9457-e1ed3b0d30be'}),[y,setY]=useState(0);window.values={x,y};window.testContext={settingUtils:{},variables:{variables:[{id:'eb2713a1-fc64-46d1-9457-e1ed3b0d30be',name:'Pontua\u00e7\u00e3o',symbol:'SCORE',type:'number'},{id:'54520591-68f7-486d-9248-871ee0a27681',name:'Deleted variable',symbol:'DELETED',type:'number',_deleted:true}]},elementSelected:{id:'current'},scenes:[{id:'current',name:'Current',actors:[{id:'own',name:'Own Actor'}]},{id:'other',name:'Other',actors:[{id:'foreign',name:'Other Actor'}]}]};return <ConfigProvider><App><I18nProvider language="en_US"><Flex gap={12} style={{width:540,padding:24}}><div data-testid="x" style={{flex:1,minWidth:0}}><NumericValueInput label="X px" value={x} onChange={setX}/></div><div data-testid="y" style={{flex:1,minWidth:0}}><Operand value={{kind:"variable",variableId:"eb2713a1-fc64-46d1-9457-e1ed3b0d30be",type:"string"}} variables={[{id:"eb2713a1-fc64-46d1-9457-e1ed3b0d30be",name:"Pontua\u00e7\u00e3o",symbol:"SCORE",type:"string"},{id:"54520591-68f7-486d-9248-871ee0a27681",name:"Deleted variable",symbol:"DELETED",type:"string",_deleted:true}]} buttonOptions={[]} onChange={setY}/></div></Flex></I18nProvider></App></ConfigProvider>}createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,r)=>r.type('html').send('<html><body><div id="root"></div><script src="/test.js"></script></body></html>'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
const preview=path.join(os.tmpdir(),'gba-numeric-values-preview.png');
try {
 const page = await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 for (const field of ['x', 'y']) {
  const input = page.getByTestId(field).getByRole('combobox').last();
  for (const query of ['pontuacao', 'SCORE', 'pontua\u00e7\u00e3o']) {
   await input.fill(query);
   await page.locator('.ant-select-item-option').filter({hasText:'Pontua\u00e7\u00e3o'}).filter({visible:true}).first().waitFor();
  }
  await input.fill('Deleted');
  assert.equal(await page.locator('.ant-select-item-option').filter({hasText:'Deleted variable'}).count(),0,'Deleted variables must not be selectable');
  await input.fill('no_matching_variable');
  await page.locator('.ant-select-item-option').filter({hasText:'Pontua\u00e7\u00e3o'}).filter({visible:true}).waitFor({state:'hidden'});
  await page.keyboard.press('Escape');
 }
 console.log('If/Else variable search: name, symbol, accents and unmatched query passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
