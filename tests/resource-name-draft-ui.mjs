import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const bundle = await build({ stdin: { resolveDir: path.resolve('src/renderer/frontend/src'), loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import ResourceNameInput from './components/ResourceNameInput';
function Harness(){const[name,setName]=useState('Scene');window.nameValue=name;window.setName=setName;return <ConfigProvider><ResourceNameInput name={name} defaultName="Default" label="Name" onChange={value=>{window.commits=(window.commits??0)+1;setName(value);}}/><button>Other control</button></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const input = page.getByRole('textbox', { name: 'Name', exact: true });
  await input.focus(); await input.press('End'); await input.pressSequentially(' with a longer title');
  await expect(input).toHaveValue('Scene with a longer title');
  assert.equal(await page.evaluate(() => window.nameValue), 'Scene'); assert.equal(await page.evaluate(() => window.commits ?? 0), 0);
  await input.press('Enter'); assert.equal(await page.evaluate(() => window.commits), 1);
  assert.equal(await page.evaluate(() => window.nameValue), 'Scene with a longer title');
  await input.focus(); await input.fill('Next title'); await page.getByRole('button', { name: 'Other control' }).click();
  assert.equal(await page.evaluate(() => window.nameValue), 'Next title'); assert.equal(await page.evaluate(() => window.commits), 2);
  await input.focus(); await input.fill('  '); await input.press('Enter'); await expect(input).toHaveValue('Default');
  await page.evaluate(() => window.setName('External rename')); await expect(input).toHaveValue('External rename');
  console.log('Name drafting passed: no global updates while typing, one commit on Enter/blur, empty-name fallback and external updates.');
} finally { await browser.close(); }
