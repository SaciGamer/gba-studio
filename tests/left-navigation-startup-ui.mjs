import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';
import LeftPanel from './components/LeftPanel';import{I18nProvider}from'./i18n/I18n';import{loadWorkspaceLayout,workspaceLayoutKey}from'./utils/workspaceLayout';
window.loadCalls=[];window.saves=[];window.resolvers={};window.samples=[];
window.electronAPI={loadLastPositionSplitters:key=>{window.loadCalls.push(key);return new Promise(resolve=>window.resolvers[key]=resolve);},saveLastPositionSplitters:async value=>{window.saves.push(value);}};
function Fixture(){const[deleted,setDeleted]=useState(true);window.setDeleted=setDeleted;const[project,setProject]=useState('project-a');const[ready,setReady]=useState(null);const[visible,setVisible]=useState(true);
window.setProject=setProject;window.showWorld=setVisible;
window.navigationContext={scenes:[{id:'scene',name:'Scene',actors:[{id:'actor',name:'Actor'}],triggers:[]}],variables:{variables:[{id:'variable',name:'Very long variable name for narrow panels',symbol:'variable',type:'number',initialValue:0},{id:'54520591-68f7-486d-9248-871ee0a27681',name:'Deleted variable',symbol:'deleted_variable',type:'number',initialValue:0,_deleted:deleted}]},scripts:{scripts:[{id:'script',name:'Very long script name for narrow panels',events:[]},{id:'c2d15146-f824-4401-8d4a-08e92e2ef6ab',name:'Deleted script',events:[],_deleted:deleted}]},prefabs:{prefabs:[{id:'prefab',name:'Very long prefab name for narrow panels',type:'actor',actor:{}}]},settingUtils:{projectPathFile:project},elementSelected:null,setVariables:()=>{},setScripts:()=>{},setPrefabs:()=>{},setSettingUtils:()=>{},setElementSelected:()=>{}};
useEffect(()=>{let cancelled=false;loadWorkspaceLayout(project).then(()=>{if(!cancelled)setReady(project);});return()=>{cancelled=true;};},[project]);
return <ConfigProvider theme={{token:{motion:false}}}><I18nProvider language="en_US">{visible&&ready===project?<div style={{display:'flex',height:640}}><div style={{width:320,height:'100%'}}><LeftPanel/></div><div data-testid="world">World</div></div>:<div data-testid="loading">Loading</div>}</I18nProvider></ConfigProvider>;
}
function sample(){if(document.querySelector('[data-testid="world"]')){const panels=[...document.querySelector('[data-testid="left-panel"] > .ant-splitter').children].filter(node=>node.classList.contains('ant-splitter-panel'));window.samples.push(panels.map(node=>Math.round(node.getBoundingClientRect().height)));}requestAnimationFrame(sample);}requestAnimationFrame(sample);
createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl','.jpg':'dataurl'},plugins:[{name:'fixture-context',setup(build){
  build.onResolve({filter:/providers\/contexts\/AppContexts$/},()=>({path:'context',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.navigationContext;',loader:'js'}));
}}] });
const app=express();app.get('/app.js',(_,r)=>r.type('js').send(bundle.outputFiles[0].text));app.get('/',(_,r)=>r.send('<html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'));
const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-navigation-startup-'));
fs.writeFileSync(path.join(temporary,'main.cjs'),`const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:1000,height:900,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try{
  electronApp=await electron.launch({args:[path.join(temporary,'main.cjs')]});const page=await electronApp.firstWindow();page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addStyleTag({content:fs.readFileSync(path.join(frontend,'components/themes/globalStyles.css'),'utf8')});
  await expect.poll(()=>page.evaluate(()=>window.loadCalls?.length)).toBe(1);
  await expect(page.getByTestId('world')).toHaveCount(0);
  await page.evaluate(()=>window.resolvers['project-a']({leftNavigation:{sizes:[300,40,180,120],sections:{scenes:true,prefabs:false,scripts:true,variables:true},expandedKeys:{scenes:[],prefabs:[],scripts:[],variables:[]}}}));
  const panels=()=>page.getByTestId('left-panel').locator(':scope > .ant-splitter > .ant-splitter-panel');
  const heights=()=>panels().evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
  await expect(page.getByTestId('world')).toBeVisible();
  await expect.poll(heights).toEqual([300,40,180,120]);
  assert.deepEqual(await page.evaluate(()=>window.saves),[],'mounting must not overwrite preferences');
  await expect(page.getByRole('treeitem',{name:'$ Deleted variable',exact:true})).toHaveCount(0);
  await expect(page.getByRole('treeitem',{name:'file Deleted script',exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.setDeleted(false));
  await expect(page.getByRole('treeitem',{name:'$ Deleted variable',exact:true})).toBeVisible();
  await expect(page.getByRole('treeitem',{name:'file Deleted script',exact:true})).toBeVisible();
  await page.evaluate(()=>window.setDeleted(true));
  await expect(page.getByRole('treeitem',{name:'$ Deleted variable',exact:true})).toHaveCount(0);
  await expect(page.getByRole('treeitem',{name:'file Deleted script',exact:true})).toHaveCount(0);

  await expect(page.getByText('Actor',{exact:true})).toBeHidden();
  await page.getByText('SCRIPTS',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.saves.at(-1)?.leftNavigation.sections.scripts)).toBe(false);
  const savedHeights=await heights();
  await page.evaluate(()=>window.showWorld(false));await expect(page.getByTestId('world')).toHaveCount(0);
  await page.evaluate(()=>{window.samples=[];window.showWorld(true);});
  await expect.poll(heights).toEqual(savedHeights);
  assert.equal(await page.evaluate(()=>window.loadCalls.length),1,'returning to world must use updated cache');
  await expect.poll(()=>page.evaluate(()=>window.samples.length)).toBeGreaterThan(0);
  assert.deepEqual(await page.evaluate(()=>window.samples[0]),savedHeights,'first visible frame must already have restored sizes');
  await page.evaluate(()=>window.setProject('project-b'));
  await expect(page.getByTestId('world')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.loadCalls.length)).toBe(2);
  await page.evaluate(()=>window.resolvers['project-b'](null));
  await expect.poll(heights).toEqual([160,160,160,160]);
  const sectionHeights = await heights();
  for (const width of [200,120,80]) {
    await page.getByTestId('left-panel').evaluate((node,width)=>node.parentElement.style.width=width+'px',width);
    const sections = await page.locator('.project-hierarchy .left-navigation-section > .ant-collapse-item > .ant-collapse-header').evaluateAll(nodes=>nodes.map(node=>{
      const title=node.querySelector('.ant-collapse-header-text'),style=getComputedStyle(title);
      return {height:node.getBoundingClientRect().height,whiteSpace:style.whiteSpace,overflow:style.overflow,textOverflow:style.textOverflow};
    }));
    assert.equal(sections.length,4);
    for(const section of sections){assert.equal(section.height,40);assert.equal(section.whiteSpace,'nowrap');assert.equal(section.overflow,'hidden');assert.equal(section.textOverflow,'clip');}
    assert.deepEqual(await heights(),sectionHeights,'Narrowing the hierarchy must not create extra panel space');
    const labels=await page.locator('.project-hierarchy .custom-tree .ant-tree-title .ant-typography').evaluateAll(nodes=>nodes.map(node=>({whiteSpace:getComputedStyle(node).whiteSpace,textOverflow:getComputedStyle(node).textOverflow})));
    assert.ok(labels.length>=3);
    for(const label of labels){assert.equal(label.whiteSpace,'nowrap');assert.equal(label.textOverflow,'clip');}
  }
  assert.deepEqual(errors,[]);
  console.log('Left navigation startup: deferred preferences, first visible frame, restored heights/sections/tree keys, no startup saves, cached return and project defaults passed.');
}finally{await electronApp?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
