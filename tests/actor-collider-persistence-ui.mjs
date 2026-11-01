import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button}from'antd';import{I18nProvider}from'./i18n/I18n';
import{SceneObjectSettingsForm,PrefabSettingsForm}from'./components/RightPanel';
function Harness(){
 const[mode,setMode]=useState('normal'),[language,setLanguage]=useState('en_US');
 const[scenes,setScenes]=useState([{id:'scene',width:640,height:160,actors:[{id:'normal',name:'Normal',x:32,y:48,width:16,height:16,spriteId:'hero'},{id:'linked',name:'Linked',prefabId:'prefab',prefabEditable:true,x:64,y:48,width:16,height:16,spriteId:'hero'}],triggers:[{id:'trigger',name:'Trigger',x:0,y:0,width:16,height:16,enabled:true}]}]);
 const[prefabs,setPrefabs]=useState({prefabs:[{id:'prefab',name:'Prefab',type:'actor',actor:{spriteId:'hero'}}]});
 window.reloadActorData=()=>setScenes(JSON.parse(JSON.stringify(window.scenes)));window.setSceneData=setScenes;window.scenes=scenes;window.prefabs=prefabs;window.setMode=setMode;window.setLanguage=setLanguage;
 window.context={scenes,setScenes,prefabs,setPrefabs,setElementSelected:()=>{},settingUtils:{},setSettingUtils:()=>{},settings:{},variables:{variables:[]},spriteResources:[]};
 return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div data-testid="panel" style={{width:280}}>{mode==='prefab'?<PrefabSettingsForm prefab={prefabs.prefabs[0]} availableSprites={[]} availableTilesets={[]}/>:<SceneObjectSettingsForm key={mode} sceneId="scene" type={mode==='trigger'?'trigger':'actor'} objectId={mode}/>}</div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
  builder.onLoad({ filter: /components[\\/]RightPanel\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8') + '\nexport { SceneObjectSettingsForm, PrefabSettingsForm };', loader: 'tsx', resolveDir: path.dirname(args.path) }));
  builder.onLoad({ filter: /(?:SelectNewEvent|ActorSpriteSheetPicker)\.tsx$/ }, () => ({ contents: 'export default()=>null;', loader: 'tsx' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const collider=()=>page.getByRole('checkbox',{name:'Show actor colliders',exact:true});
  await expect(collider()).not.toBeChecked();await collider().check();
  assert.equal(await page.evaluate(()=>window.scenes[0].actors[0].showCollider),true);
  assert.equal(await page.evaluate(()=>window.scenes[0]._saved),false);
  assert.equal(await page.evaluate(()=>window.scenes[0].actors[1].showCollider),undefined);
  await page.evaluate(()=>window.setMode('linked'));await expect(collider()).not.toBeChecked();
  await page.evaluate(()=>window.reloadActorData());
  await page.evaluate(()=>window.setMode('normal'));await expect(collider()).toBeChecked();
  await collider().uncheck();await page.evaluate(()=>window.reloadActorData());await expect(collider()).not.toBeChecked();
  assert.deepEqual(errors,[]);
  console.log('Collider visibility is saved on the actor, marks the scene dirty, survives reload and remains independent per actor.');
}finally{await browser.close();}
