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
 window.setSceneData=setScenes;window.scenes=scenes;window.prefabs=prefabs;window.setMode=setMode;window.setLanguage=setLanguage;
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
  await page.getByRole('heading',{name:'Normal',exact:true}).click();
  const nameInput=page.locator('input:focus');await nameInput.fill('Renamed actor without global updates per key');
  assert.equal(await page.evaluate(()=>window.scenes[0].actors[0].name),'Normal');
  await nameInput.press('Enter');assert.equal(await page.evaluate(()=>window.scenes[0].actors[0].name),'Renamed actor without global updates per key');
  const x=page.getByRole('spinbutton').nth(0),y=page.getByRole('spinbutton').nth(1);
  await x.fill('9999');await x.press('Tab');await y.fill('9999');await y.press('Tab');
  assert.deepEqual(await page.evaluate(()=>[window.scenes[0].actors[0].x,window.scenes[0].actors[0].y]),[624,144]);
  await page.evaluate(()=>window.setSceneData(previous=>previous.map(scene=>({...scene,actors:scene.actors.map((actor,index)=>index===0?{...actor,anchor:'center',width:16,height:8,x:8,y:4}:actor)}))));
  for(const grid of [8,16]) {
    await page.evaluate(grid=>window.dispatchEvent(new CustomEvent('gba-studio:game-world-preferences',{detail:{sceneObjectSnapSize:grid}})),grid);
    await expect(x).toHaveAttribute('step',String(grid));
    await x.fill('17');await x.press('Tab');await y.fill('13');await y.press('Tab');
    assert.deepEqual(await page.evaluate(()=>[window.scenes[0].actors[0].x,window.scenes[0].actors[0].y]),grid===8?[16,12]:[24,20]);
    await x.fill('-100');await x.press('Tab');await y.fill('9999');await y.press('Tab');
    assert.deepEqual(await page.evaluate(()=>[window.scenes[0].actors[0].x,window.scenes[0].actors[0].y]),[8,156]);
  }
  const checkbox = () => page.getByRole('checkbox', { name: 'Keep Running While Offscreen', exact: true });
  await expect(checkbox()).toHaveCount(0);
  await page.getByRole('tab', { name: 'On Init', exact: true }).click(); await expect(checkbox()).toHaveCount(0);
  await page.getByRole('tab', { name: 'On Update', exact: true }).click(); await expect(checkbox()).not.toBeChecked();
  await expect(page.locator('.ant-alert-description')).toHaveCount(0);
  await page.getByText('Keep Running While Offscreen',{exact:true}).hover();
  await expect(page.getByRole('tooltip')).toContainText('preserves this actor');
  assert.ok((await page.getByRole('tooltip').textContent()).includes('\nOff:'));
  assert.equal(await page.getByRole('tooltip').locator('span').evaluate(element=>getComputedStyle(element).whiteSpace),'pre-line');
  await page.mouse.move(1000,700);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await checkbox().focus();
  await expect(page.getByRole('tooltip')).toContainText('running On Init again');
  await checkbox().check(); assert.equal(await page.evaluate(() => window.scenes[0].actors[0].keepRunningWhileOffscreen), true);
  await page.evaluate(() => window.setMode('linked')); await page.getByRole('tab', { name: 'On Update', exact: true }).click();
  await expect(checkbox()).not.toBeChecked(); await checkbox().check();
  assert.equal(await page.evaluate(() => window.prefabs.prefabs[0].actor.keepRunningWhileOffscreen), true);
  assert.equal(await page.evaluate(() => window.scenes[0].actors[1].keepRunningWhileOffscreen), true);
  await page.evaluate(() => window.setMode('prefab')); await page.getByRole('tab', { name: 'On Update', exact: true }).click();
  await expect(checkbox()).toBeChecked(); await checkbox().uncheck();
  assert.equal(await page.evaluate(() => window.scenes[0].actors[1].keepRunningWhileOffscreen), false);
  assert.equal(await page.evaluate(() => window.scenes[0].actors[0].keepRunningWhileOffscreen), true);
  await page.evaluate(() => window.setLanguage('pt_BR'));
  await expect(page.getByRole('checkbox', { name: 'Continuar executando fora da tela' })).toBeVisible();
  const overflow = await page.locator('.ant-alert').evaluate(node => node.scrollWidth > node.clientWidth + 1);
  assert.equal(overflow, false, 'The banner must fit a narrow right panel');
  await page.evaluate(() => window.setMode('trigger'));
  await expect(page.locator('.ant-alert')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('Actor On Update banner passed: default off, correct tab, scene save, linked prefab inheritance/propagation, independent actor state, Portuguese, narrow panel and no trigger control.');
} finally { await browser.close(); }
