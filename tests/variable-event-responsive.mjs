import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {build}from'esbuild';import express from'express';import {chromium}from'playwright';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider,App} from 'antd';import {I18nProvider} from './i18n/I18n';import VariableEvent from './components/events/VariableEvent';import {EEvents} from './components/events/interfaces/IEvents';
const id='eb2713a1-fc64-46d1-9457-e1ed3b0d30be';
window.testContext={settingUtils:{},variables:{variables:[{id,name:'Very long variable name that must fit the nested event body',symbol:'LONG',type:'number'}]},elementSelected:{},scenes:[]};
createRoot(document.getElementById('root')).render(<ConfigProvider><App><I18nProvider language="en_US"><div id="body" style={{width:240,padding:8,boxSizing:'border-box'}}><VariableEvent event={{id:'7d3bc42a-f793-45ef-b363-aec427f632f8',command:EEvents.VARIABLE,args:{variableId:id,value:{kind:'variable',variableId:id}}}} onValueChange={()=>{}}/></div></I18nProvider></App></ConfigProvider>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ()=>window.testContext;',loader:'js'}));}}]});
const app=express();app.get('/test.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,r)=>r.type('html').send('<html><body><div id="root"></div><script src="/test.js"></script></body></html>'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const browser=await chromium.launch({headless:true});
const preview=path.join(os.tmpdir(),'gba-numeric-values-preview.png');
try {
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('combobox').first().waitFor();
 for (const width of [300,240,180]) {
  await page.locator('#body').evaluate((el,width)=>{el.style.width=width+'px';},width);
  const overflowing=await page.locator('#body').evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   return Array.from(el.querySelectorAll('.ant-select, .ant-input-number, .ant-btn')).filter(control=>control.getBoundingClientRect().right>bounds.right+1).map(control=>control.outerHTML);
  });
  assert.deepEqual(overflowing,[],`Controls must fit a ${width}px nested event body`);
 }
 console.log('Variable Set to Value fits 300px, 240px and 180px event bodies.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
