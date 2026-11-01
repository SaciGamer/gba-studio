import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ConfigProvider} from 'antd';
import {I18nProvider} from './i18n/I18n';import InputGroupsTable from './components/pages/engine/InputGroupsTable';
function Harness(){const [language,setLanguage]=useState('en_US'),[groups,setGroups]=useState({});window.setLanguage=setLanguage;window.groups=groups;
return <ConfigProvider><I18nProvider language={language}><div style={{width:350}}><InputGroupsTable value={groups} onChange={setGroups}/></div></I18nProvider></ConfigProvider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' } });
const runtime = await readFile('tools/butano/template/src/input_manager.cpp', 'utf8');
const masks = [0x3cf, 0x3f3, 1, 0x3ff];
for (const expression of ['configured_group_masks[0] : 0x3cf', 'configured_group_masks[1] : 0x3f3', 'configured_group_masks[2] : 1', 'return 0x3ff']) assert.ok(runtime.includes(expression));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const table = page.getByRole('table', { name: 'Input groups' });
  await expect(table.getByRole('columnheader')).toHaveText(['Button', 'Gameplay', 'Menu', 'Interaction', 'All']);
  await expect(table.getByRole('checkbox')).toHaveCount(40);
  const buttons = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  for (let index = 0; index < buttons.length; index++) {
    const row = table.getByRole('row').nth(index + 1);
    await expect(row.getByRole('rowheader')).toHaveText(buttons[index]);
    for (let group = 0; group < masks.length; group++) {
      const checkbox = row.getByRole('checkbox').nth(group);
      if (group === 3) await expect(checkbox).toBeDisabled(); else await expect(checkbox).toBeEnabled();
      await expect(checkbox).toBeChecked({ checked: Boolean(masks[group] & (1 << index)) });
    }
  }
  await table.getByRole('row').nth(1).getByRole('checkbox').nth(0).uncheck();
  await expect(table.getByRole('row').nth(1).getByRole('checkbox').nth(0)).not.toBeChecked();
  assert.deepEqual(await page.evaluate(()=>window.groups.gameplay), ['B','L','R','UP','DOWN','LEFT','RIGHT']);
  assert.equal(await table.evaluate(el => el.parentElement.scrollWidth > el.parentElement.clientWidth), true);
  await page.evaluate(() => window.setLanguage('pt_BR'));
  await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Bot\u00e3o', 'Gameplay', 'Menu', 'Intera\u00e7\u00e3o', 'Todos']);
  assert.deepEqual(errors, []);
  console.log('Input groups: runtime button masks, editable checkbox matrix with fixed All, narrow layout and translations passed.');
} finally { await browser.close(); }
