import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';
import VariableEvent from './components/events/VariableEvent';import {I18nProvider} from './i18n/I18n';
window.context={variables:{variables:[]}};window.changes=0;
function Harness(){const[language,setLanguage]=useState('en_US');window.setLanguage=setLanguage;const[command,setCommand]=useState('EVENT_VARIABLE_RESET_ALL');window.setCommand=setCommand;
return <ConfigProvider><I18nProvider language={language}><VariableEvent event={{id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command,args:{scope:'LOCAL'}}} onValueChange={()=>window.changes++}/></I18nProvider></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.png': 'dataurl' }, plugins: [{ name: 'context', setup(builder) {
  builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default()=>window.context;', loader: 'js' }));
} }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText('Restores every global variable to its configured initial value. Script parameters are unchanged.')).toBeVisible();
  await page.evaluate(() => window.setLanguage('pt_BR'));
  await expect(page.getByText(/Restaura todas as vari.*globais aos valores iniciais/)).toBeVisible();
  await page.evaluate(() => window.setCommand('EVENT_LOCAL_VARIABLE_RESET'));
  await expect(page.getByText('Zera Local A a Local H deste actor ou trigger.')).toBeVisible();
  assert.equal(await page.evaluate(() => window.changes), 0);
  console.log('Variable reset UI: accurate global/default behavior, no unsupported scope selector, legacy payload and translation passed.');
} finally { await browser.close(); }
