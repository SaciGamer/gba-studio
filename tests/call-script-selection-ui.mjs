import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import express from 'express';
import path from 'node:path';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {App,ConfigProvider} from 'antd';
import * as Providers from './providers/Providers';import useAppContexts from './providers/contexts/AppContexts';
import {I18nProvider} from './i18n/I18n';import CallScriptEvent from './components/events/CallScriptEvent';
function Harness(){const ctx=useAppContexts();const [event,setEvent]=useState({id:'call',command:'EVENT_CALL_SCRIPT',args:{scriptId:'active',arguments:[]}});
 useEffect(()=>{ctx.setScripts({_resourceType:'scripts',scripts:[{id:'active',name:'Active',events:[],parameters:[
 {id:'__PARAM__:A',name:'Flag',type:'boolean',mode:'local'},{id:'__PARAM__:B',name:'Count',type:'number',mode:'local'},{id:'__PARAM__:C',name:'Text',type:'string',mode:'local'}]},
 {id:'deleted',name:'Deleted script',_deleted:true,events:[],parameters:[]}]});
 ctx.setScenes([{id:'scene',actors:[],triggers:[]}]);ctx.setElementSelected({id:'scene',_resourceType:'scene'});ctx.setSettingUtils({activeSceneObject:null});
 ctx.setVariables({_resourceType:'variables',variables:[{id:'flag',name:'Global Flag',symbol:'flag',type:'boolean',initialValue:false},{id:'count',name:'Global Count',symbol:'count',type:'number',initialValue:0}]});},[]);
 window.callArgs=event.args;
 window.setDeleted=value=>ctx.setScripts(previous=>({...previous,scripts:previous.scripts.map(script=>script.id==='active'?{...script,_deleted:value}:script)}));
 window.setReference=value=>ctx.setScripts(previous=>({...previous,scripts:previous.scripts.map(script=>script.id==='active'?{...script,parameters:script.parameters.map(parameter=>parameter.id==='__PARAM__:A'?{...parameter,mode:value?'reference':'local'}:parameter)}:script)}));
 window.setLegacyBoolean=()=>setEvent(previous=>({...previous,args:{...previous.args,arguments:previous.args.arguments.map(argument=>argument.parameterId==='__PARAM__:A'?{...argument,value:{kind:'number',value:0}}:argument)}}));
 return <div id="call" style={{padding:20,width:440}}><CallScriptEvent event={event} onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/></div>;
}
const content=Object.entries(Providers).filter(([name])=>name.endsWith('Provider')).reduce((child,[,Provider])=><Provider>{child}</Provider>,<Harness/>);
createRoot(document.getElementById('root')).render(<ConfigProvider><App><I18nProvider language="en_US">{content}</I18nProvider></App></ConfigProvider>);
` }, bundle: true, write: false, outfile: 'call-script-selection-test.js', format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' } });
const app = express();
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<div id="root"></div><script src="/app.js"></script>'));
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const selector = page.getByRole('combobox', { name: 'Select script', exact: true });
  await expect(page.locator('#call')).toContainText('Active');
  await expect.poll(() => page.evaluate(() => window.callArgs.arguments.length)).toBe(3);
  const args = await page.evaluate(() => window.callArgs.arguments);
  assert.deepEqual(args.map(argument => argument.value), [{ kind: 'constant', constant: 'false' }, { kind: 'number', value: 0 }, { kind: 'literal', type: 'string', value: '' }]);
  await expect(page.getByText('Choose a compatible value for this input.', { exact: true })).toHaveCount(0);
  const boolean = page.getByRole('combobox', { name: 'Boolean', exact: true });
  await boolean.press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible').getByText('True', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.callArgs.arguments[0].value.constant)).toBe('true');
  await page.evaluate(() => window.setLegacyBoolean());
  await expect.poll(() => page.evaluate(() => window.callArgs.arguments[0].value.constant)).toBe('false');
  await page.evaluate(() => window.setReference(true));
  await expect.poll(() => page.evaluate(() => window.callArgs.arguments[0].value.variableId)).toBe('flag');
  await expect(page.getByText('Choose a compatible value for this input.', { exact: true })).toHaveCount(0);
  await selector.press('ArrowDown');
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Deleted script', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.setDeleted(true));
  await expect(page.locator('#call')).not.toContainText('Active');
  await expect(page.locator('#call [data-numeric-value]')).toHaveCount(0);
  await selector.press('ArrowDown');
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.setDeleted(false));
  await expect(page.locator('#call')).toContainText('Active');
  await expect.poll(() => page.evaluate(() => window.callArgs.arguments[0].value.variableId)).toBe('flag');
  assert.deepEqual(errors, []);
  console.log('Call Script UI: typed defaults, boolean editing, legacy repair, compatible boolean references, soft deletion and restoration passed.');
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
