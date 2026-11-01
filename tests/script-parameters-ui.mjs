import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const frontend = path.join(root, 'src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React, { useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client'; import { App, ConfigProvider, Button } from 'antd';
import * as Providers from './providers/Providers'; import useAppContexts from './providers/contexts/AppContexts'; import { I18nProvider } from './i18n/I18n';
import ScriptInputs from './components/events/ScriptInputs'; import CallScriptEvent from './components/events/CallScriptEvent'; import VariableEvent from './components/events/VariableEvent';
import { ScriptParameterContext } from './components/events/ScriptParameterContext'; import { exposeScriptInputs, scriptUsesParameter } from '../../../shared/scriptParameters';
function Harness() {
 const ctx = useAppContexts(); const [event, setEvent] = useState({ id:'call', command:'EVENT_CALL_SCRIPT', args:{scriptId:'method',arguments:[]} });
 useEffect(()=>{ctx.setScripts({_resourceType:'scripts',scripts:[{id:'method',name:'Method',events:[],parameters:[]}]}); ctx.setScenes([{id:'scene',actors:[{id:'one',name:'Actor One'},{id:'two',name:'Actor Two'}],triggers:[{id:'zone',name:'Zone'}]}]); ctx.setElementSelected({id:'scene',_resourceType:'scene'}); ctx.setVariables({_resourceType:'variables',variables:[{id:'health',name:'Health',symbol:'health',type:'number',initialValue:5}]}); ctx.setSettingUtils({activeSceneObject:null}); window.setOwner=(type,id)=>ctx.setSettingUtils({activeSceneObject:type?{sceneId:'scene',type,id}:null}); },[]);
 window.callArgs=event.args;
 const script=ctx.scripts.scripts[0];
 const updateScript=patch=>ctx.setScripts(previous=>({...previous,scripts:previous.scripts.map(script=>({...script,...patch}))}));
 return <div style={{padding:16,width:440}}><Button onClick={()=>updateScript(exposeScriptInputs([{id:'assignment',command:'EVENT_VARIABLE',args:{variableId:'',value:{kind:'literal',type:'number',value:0}}}]))}>Create assignment</Button>
 {script&&<><div data-testid="inputs"><ScriptInputs parameters={script.parameters??[]} onChange={parameters=>updateScript({parameters})} canRemove={id=>!scriptUsesParameter(script.events,id)}/></div>
 <div data-testid="assignment"><ScriptParameterContext.Provider value={script.parameters??[]}><VariableEvent event={script.events[0]} onValueChange={(id,args)=>updateScript({events:script.events.map(event=>event.id===id?{...event,args}:event)})}/></ScriptParameterContext.Provider></div></>}
 <div data-testid="call" style={{marginTop:24}}><CallScriptEvent event={event} onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/></div></div>;
}
const providerList=Object.entries(Providers).filter(([name])=>name.endsWith('Provider')).map(([,Provider])=>Provider);
const content=providerList.reduce((child,Provider)=><Provider>{child}</Provider>,<Harness/>);
function Root(){const [language,setLanguage]=useState('en_US');window.setLanguage=setLanguage;return <ConfigProvider><App><I18nProvider language={language}>{content}</I18nProvider></App></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Root/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' } });
const app = express();
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-script-input-ui-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:560,height:760,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try {
  electronApp = await electron.launch({ args: [path.join(temporary, 'main.cjs')] });
  const page = await electronApp.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Create assignment' }).click();
  await expect(page.getByRole('textbox', { name: 'Parameter alias' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Parameter alias' })).toHaveValue('Parameter A');
  const fixedId = await page.getByTestId('inputs').locator('[data-parameter-id]').getAttribute('data-parameter-id');
  await page.getByRole('textbox', { name: 'Parameter alias' }).fill('amount');
  await expect(page.getByTestId('inputs').locator('[data-parameter-id]')).toHaveAttribute('data-parameter-id', fixedId);
  await expect(page.getByTestId('inputs').locator('[data-parameter-id]')).toHaveAttribute('data-parameter-name', 'Parameter A');
  const target = page.getByTestId('assignment').getByRole('combobox', { name: 'Variable', exact: true });
  await target.press('ArrowDown');
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('Parameter', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('Global', { exact: true })).toBeVisible();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'Global: Health' }).click();
  await expect(page.getByRole('textbox', { name: 'Parameter alias' })).toHaveValue('amount');
  await expect(page.getByTestId('assignment')).toContainText('Global: Health');
  await target.press('ArrowDown');
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'Parameter: amount' }).click();
  await expect(page.getByTestId('assignment')).toContainText('Parameter: amount');
  await expect(page.getByTestId('call')).toContainText('amount');
  await expect(page.getByTestId('assignment')).toContainText('amount');
  await page.getByRole('button', { name: 'Passing mode' }).click();
  await page.getByRole('menuitem', { name: 'Reference', exact: true }).click();
  await expect(page.getByTestId('call')).toContainText('Reference');
  await page.getByTestId('call').getByRole('button', { name: 'Choose value type' }).click();
  await expect(page.getByRole('menuitem', { name: 'Number', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('menuitem', { name: 'Property', exact: true }).click();
  const property = page.getByTestId('call').getByRole('combobox', { name: 'Property' });
  await property.press('ArrowDown');
  await expect(page.getByText('Actor One', { exact: true })).toBeVisible();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .rc-virtual-list-holder').evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
  await expect(page.getByText('Actor Two', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.setOwner('actor', 'one'));
  await property.press('ArrowDown');
  await expect(page.getByText('Actor One', { exact: true })).toBeVisible();
  await expect(page.getByText('Actor Two', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.setOwner('trigger', 'zone'));
  await page.getByTestId('call').getByRole('button', { name: 'Choose value type' }).click();
  await expect(page.getByRole('menuitem', { name: 'Property', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem', { name: 'Trigger property', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Property', exact: true }).click();
  await expect(page.getByTestId('call').locator('[data-numeric-value="trigger"]')).toHaveCount(1);
  assert.equal(await page.evaluate(() => window.callArgs.arguments[0].value.triggerId), 'zone');
  for (const [language, inputName, inputMode] of [['pt_BR', 'Alias do parâmetro', 'Modo de passagem'], ['es_ES', 'Alias del parámetro', 'Modo de paso'], ['fr_FR', 'Alias du paramètre', 'Mode de passage']]) {
    await page.evaluate(language => window.setLanguage(language), language);
    await expect(page.getByRole('textbox', { name: inputName })).toHaveValue('amount');
    const button = page.getByRole('button', { name: inputMode });
    await expect(button).toBeVisible();
    const [bounds, container] = await Promise.all([button.boundingBox(), page.getByTestId('inputs').boundingBox()]);
    assert.ok(bounds.x + bounds.width <= container.x + container.width + 1, 'Translated mode button must fit the input row');
  }
  await page.evaluate(() => window.setLanguage('en_US'));
  for (let index = 1; index < 20; index++) await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Parameter alias', exact: true })).toHaveCount(20);
  await expect(page.getByRole('textbox', { name: 'Parameter alias', exact: true }).last()).toHaveValue('Parameter T');
  await expect(page.getByRole('button', { name: 'Add parameter', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => window.callArgs.arguments.length), 20);
  assert.equal(await page.evaluate(() => window.callArgs.arguments[0].parameterId), fixedId);
  assert.deepEqual(errors, []);
  console.log('Script input UI passed: Parameter/Global reselection, persistent declarations, fixed native IDs and engine aliases, 20 parameters, passing modes, domains and all four locales.');
} finally {
  if (electronApp) await electronApp.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-script-input-ui-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
