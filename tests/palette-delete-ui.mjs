import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('src/renderer/frontend/src');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'@/i18n/I18n';import AssetLibraryEditor from'@/components/resourceEditors/AssetLibraryEditor';
createRoot(document.getElementById('root')).render(<I18nProvider language="en_US"><ConfigProvider><App><AssetLibraryEditor kind="palettes"/></App></ConfigProvider></I18nProvider>);
`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'sfx-ui-fixture',
  platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'sfx-library-fixture', setup(plugin) {
    plugin.onResolve({ filter: /TrackerModuleViewer$/ }, () => ({ path: 'viewer', namespace: 'fixture' }));
    plugin.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents: args.path === 'viewer' ? 'export default function Viewer(){return null}'
      : 'import{useState}from"react";export default function useAppContexts(){const[resource,setResource]=useState({palettes:[]});window.paletteState=resource.palettes;return{palettes:resource,setPalettes:setResource}}' }));
  } }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  page.setDefaultTimeout(8_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root" style="height:900px"></div>');
  await page.addScriptTag({ content: 'window.AudioWorkletProcessor=class {};window.registerProcessor=()=>{};' });
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  const rows = page.locator('.ant-list-item');
  await rows.first().waitFor();
  const defaultCount = await rows.count();
  await expect(page.locator('.anticon-delete')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create 16-color palette', exact: true }).click();
  await expect(rows).toHaveCount(defaultCount + 1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:palette-delete-request')));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete the custom palette');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(defaultCount + 1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:palette-delete-request')));
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(defaultCount);
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:palette-delete-request')));
  await expect(page.getByText('Default palettes cannot be deleted. Only custom palettes can be deleted.', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  assert.ok((await page.evaluate(() => window.paletteState)).every(palette => !palette.custom), 'default palettes remain protected');
  assert.deepEqual(errors, []);
  console.log('Palettes: no trash icons, selected custom palette deletion, cancellation and default-palette protection passed.');
} finally { await browser.close(); }
