import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { App, ConfigProvider } from 'antd';
  import { I18nProvider } from './i18n/I18n';
  import SelectNewEvent from './components/events/SelectNewEvent';
  import VariableEvent from './components/events/VariableEvent';
  function Fixture() {
    const [event, setEvent] = useState(null);
    window.currentEvent = event;
    window.testContext = {
      scenes: [], variables: { variables: [{ id:'flag', name:'Flag', symbol:'FLAG', type:'boolean' }] },
      elementSelected: { id:'scene', script:[] }, userSettings: {favoriteEvents:[]},
      setUserSettings:()=>{}, setSettingUtils:()=>{}, setScenes:()=>{}, setElementSelected:()=>{},
    };
    return <ConfigProvider><App><I18nProvider language="en_US">
      <SelectNewEvent showFlowButton={false} onEventCreated={setEvent}/>
      {event && <div data-testid="variable-event"><VariableEvent event={event}
        onValueChange={(id,args)=>setEvent(previous=>({...previous,args}))}/></div>}
    </I18nProvider></App></ConfigProvider>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.png': 'dataurl' },
alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path:'context', namespace:'fixture' }));
  builder.onResolve({ filter: /FlowEditorManager$/ }, () => ({ path:'flow', namespace:'fixture' }));
  builder.onLoad({ filter: /.*/, namespace:'fixture' }, ({path}) => ({ contents: path === 'flow' ? 'export default () => null;' : 'export default () => window.testContext;', loader:'js' }));
} }] });
const app = express();
app.get('/fixture.js', (_,response)=>response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_,response)=>response.type('html').send('<div id="root"></div><script src="/fixture.js"></script>'));
const server = await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',error=>errors.push(error.stack));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForTimeout(100);
  assert.deepEqual(errors, [], 'Fixture must render');
  await page.getByText('Add Event',{exact:true}).click();
  await page.getByPlaceholder('Search...').fill('Variable Set');
  for (const text of ['Variable Set to Value','Variable Set to True','Variable Set to False'])
    await page.getByText(text,{exact:true}).waitFor({state:'visible'});
  await page.getByText('Variable Set to True',{exact:true}).click();
  await page.waitForFunction(()=>window.currentEvent?.args.value.value===true);
  const field=page.getByTestId('variable-event');
  const prefix=field.getByRole('button',{name:'Choose value type',exact:true});
  assert.equal(await prefix.textContent(),'T');
  assert.equal(await field.getByRole('textbox',{name:'Boolean',exact:true}).inputValue(),'true');
  await field.getByRole('combobox',{name:'Variable',exact:true}).click();
  await page.getByText('GLOBAL: Flag',{exact:true}).filter({visible:true}).click();
  await page.waitForFunction(()=>window.currentEvent.args.variableId==='flag');
  assert.deepEqual(await page.evaluate(()=>window.currentEvent.args.value),{kind:'literal',type:'boolean',value:true});
  await prefix.click();
  await page.getByText('Boolean',{exact:true}).filter({visible:true}).last().hover();
  await page.getByRole('menuitem',{name:'False',exact:true}).filter({visible:true}).click();
  await page.waitForFunction(()=>window.currentEvent.args.value.value===false);
  assert.equal(await prefix.textContent(),'F');
  assert.equal(await field.getByRole('textbox',{name:'Boolean',exact:true}).inputValue(),'false');
  assert.equal(await field.getByRole('button',{name:'Change or remove operator'}).count(),0);
  assert.deepEqual(await page.evaluate(()=>window.currentEvent.args.value),{kind:'literal',type:'boolean',value:false});
  assert.deepEqual(errors,[]);
  console.log('Variable boolean editor: distinct search presets, retained True, Boolean menu False and T/F prefixes passed.');
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
