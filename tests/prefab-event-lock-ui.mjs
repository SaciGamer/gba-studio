import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const source = fs.readFileSync(path.join(frontend, 'components/RightPanel.tsx'), 'utf8');
const form = source.slice(source.indexOf('const SceneObjectSettingsForm:'), source.indexOf('const PrefabSettingsForm:'));
// Exercise the production form and updater. The event-editor stand-in includes
// a non-native control and exposes its callback to test late portal callbacks.
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState,useRef} from 'react';import {createRoot} from 'react-dom/client';
import {App,ConfigProvider,Layout,Typography,Input,InputNumber,Flex,Space,Divider,Dropdown,Button,Checkbox,Tabs,Tag,Select,Radio,Tooltip} from 'antd';
import {SettingOutlined,CopyOutlined,DeleteOutlined,ArrowRightOutlined,CaretLeftFilled,CaretRightFilled,CaretUpFilled,CaretDownFilled} from '@ant-design/icons';
import {I18nProvider,useI18n} from './i18n/I18n';
const {Content}=Layout;const useAppContexts=()=>window.context;const useNameHoverStyle=()=>({});const useSceneObjectSnapSize=()=>8;
const countEventAttention=()=>0,attentionLabel=label=>label,hasAssetReferenceWarning=()=>false;
const sceneObjectAxisBounds=()=>({min:0,max:240}),sceneObjectAxisPosition=value=>value,uuidv4=()=>crypto.randomUUID();
const actorMoveSpeedOptions=[{value:2,label:'Normal',ppf:2}],actorAnimationSpeedOptions=[];
const AdditionalEventWarnings=()=>null,ActorSpriteSheetPicker=()=>null,ActorOffscreenControl=()=>null,DirectionRadioGroup=Radio.Group;
function CollapseEventManager({scripts,onScriptsChange,storageKey}){window.attemptEdit=(text='Changed')=>onScriptsChange([{...scripts[0],args:{text}}]);return <div role="button" tabIndex={0} aria-label="Edit event" onClick={()=>window.attemptEdit()}>{scripts[0]?.args?.text}</div>;}
const SelectNewEvent=()=>null;
${form}
const sceneId='03fb9ac7-5667-41ec-b8f5-d07d67993d61',objectId='168c1928-514c-4cfa-a06a-9a4588f52cf5',prefabId='24a5a698-c1bc-4d31-b8be-519a899055af';
const event={id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_UI_SET_TEXT',args:{text:'Original'}};
function Harness(){const[type,setType]=useState('trigger');const[scenes,setScenes]=useState([{id:sceneId,width:240,height:160,triggers:[{id:objectId,prefabId,x:0,y:0,width:16,height:16,onEnterScript:[event]}],actors:[{id:objectId,prefabId,x:0,y:0,onInteractScript:[event]}]}]);
const[prefabs,setPrefabs]=useState({prefabs:[{id:prefabId,name:'Prefab',type,trigger:{onEnterScript:[event]},actor:{onInteractScript:[event]}}]});
const[settingUtils,setSettingUtils]=useState({});window.context={scenes,setScenes,prefabs,setPrefabs,settingUtils,setSettingUtils,setElementSelected:()=>{}};
window.snapshot={scenes,prefabs};window.setMode=(editable,detached)=>setScenes(previous=>previous.map(scene=>({...scene,actors:scene.actors.map(object=>({...object,prefabEditable:editable,prefabEventsDetached:detached})),triggers:scene.triggers.map(object=>({...object,prefabEditable:editable,prefabEventsDetached:detached}))})));
window.switchType=next=>{setType(next);setPrefabs(previous=>({...previous,prefabs:previous.prefabs.map(prefab=>({...prefab,type:next}))}));};
return <ConfigProvider><App><I18nProvider language="en_US"><SceneObjectSettingsForm sceneId={sceneId} objectId={objectId} type={type}/></I18nProvider></App></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();page.setDefaultTimeout(5000);
  await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const type of ['trigger', 'actor']) {
    await page.evaluate(type => { window.switchType(type); window.setMode(false, false); }, type);
    const lock = page.locator('fieldset[inert]');await expect(lock).toHaveCount(1);
    const before = await page.evaluate(() => JSON.stringify(window.snapshot));
    await page.evaluate(() => window.attemptEdit());
    assert.equal(await page.evaluate(() => JSON.stringify(window.snapshot)), before);
    const customControl = page.locator('[aria-label="Edit event"]').first();
    await customControl.click({ force: true });
    assert.equal(await page.evaluate(() => JSON.stringify(window.snapshot)), before);
    await page.evaluate(() => window.setMode(true, false));await expect(page.locator('fieldset[inert]')).toHaveCount(0);
    await customControl.click();
    const field = type === 'trigger' ? 'onEnterScript' : 'onInteractScript';
    assert.equal(await page.evaluate(({type,field}) => window.snapshot.prefabs.prefabs[0][type][field][0].args.text, {type,field}), 'Changed');
    await page.evaluate(() => window.setMode(false, true));await expect(page.locator('fieldset[inert]')).toHaveCount(0);
    await page.evaluate(() => window.attemptEdit('Local'));
    assert.equal(await page.evaluate(({type,field}) => window.snapshot.scenes[0][type === 'actor' ? 'actors' : 'triggers'][0][field][0].args.text, {type,field}), 'Local');
    assert.equal(await page.evaluate(({type,field}) => window.snapshot.prefabs.prefabs[0][type][field][0].args.text, {type,field}), 'Changed');
  }
  console.log('Prefab event locks: actor/trigger inert controls, blocked late mutations, editable propagation and detached local events passed.');
} finally { await browser.close(); }
