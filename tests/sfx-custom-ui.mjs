import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await esbuild.build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,Button,ConfigProvider,theme}from'antd';import{I18nProvider}from'./i18n/I18n';import SfxGenerator from'./components/resourceEditors/SfxGenerator';
function ThemeProbe(){const{token}=theme.useToken();return <span data-testid="theme-background">{token.colorBgContainer}</span>};function Fixture(){const[language,setLanguage]=useState('en_US');const[dark,setDark]=useState(false);return <ConfigProvider theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><App><nav style={{position:'fixed',right:4,top:4,zIndex:3000}}>{['en_US','pt_BR','es_ES','fr_FR'].map(lang=><Button key={lang} onClick={()=>setLanguage(lang)}>{lang}</Button>)}<Button onClick={()=>setDark(value=>!value)}>Toggle theme</Button><ThemeProbe/></nav><I18nProvider language={language}><SfxGenerator onSaved={()=>{}}/></I18nProvider></App></ConfigProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);` },
  bundle: true, write: false, outfile: 'fixture.js', format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const app = express();
app.get('/fixture.js', (_request, response) => response.type('js').send(bundle.outputFiles.find(file => file.path.endsWith('.js')).text));
app.get('/fixture.css', (_request, response) => response.type('css').send(bundle.outputFiles.find(file => file.path.endsWith('.css')).text));
app.get('/', (_request, response) => response.type('html').send('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.electronAPI={};</script><script src="/fixture.js"></script>'));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const select = page.getByRole('combobox', { name: 'Waveform', exact: true });
  await select.press('ArrowDown');
  await page.getByText('Custom', { exact: true }).click();
  for (const name of ['Fundamental', '2nd harmonic', '3rd harmonic', '4th harmonic', '5th harmonic', '6th harmonic']) await page.getByRole('slider', { name, exact: true }).waitFor();
  const harmonic = page.getByRole('slider', { name: '2nd harmonic', exact: true });
  await harmonic.press('End');
  assert.equal(await harmonic.getAttribute('aria-valuenow'), '100');
  await page.getByRole('button', { name: 'Reset harmonics' }).click();
  assert.equal(await harmonic.getAttribute('aria-valuenow'), '0');
  await page.getByRole('button', { name: 'pt_BR', exact: true }).click();
  await page.getByRole('slider', { name: 'Fundamental', exact: true }).waitFor();
  for (let i = 2; i <= 6; i++) await page.getByRole('slider', { name: `${i}º harmônico`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.setViewportSize({ width: 700, height: 950 });
  await page.getByRole('combobox', { name: 'Forma de onda', exact: true }).press('ArrowDown');
  await page.getByText('Ruído', { exact: true }).click();
  const frequency = page.locator('.ant-slider-disabled');
  assert.equal(await frequency.count(), 1);
  await frequency.locator('xpath=..').hover();
  await page.getByRole('tooltip').filter({ hasText: 'A frequência não se aplica ao Ruído' }).waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), 'sfx-noise-tooltip.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Forma de onda', exact: true }).press('ArrowDown');
  await page.getByText('Custom', { exact: true }).click();
  await page.getByRole('slider', { name: 'Fundamental', exact: true }).focus();
  await page.getByRole('combobox', { name: 'Forma de onda', exact: true }).press('Escape');
  await page.getByRole('tooltip').waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(os.tmpdir(), 'sfx-custom-controls.png'), fullPage: true });
  const tone = page.getByRole('slider', { name: /^Frequência/ });
  assert.equal(await tone.getAttribute('aria-valuemax'), '7800');
  await tone.press('End');
  await page.getByRole('slider', { name: '2º harmônico', exact: true }).waitFor();
  assert.equal(await page.getByRole('slider', { name: '2º harmônico', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('slider', { name: 'Fundamental', exact: true }).isDisabled(), false);
  const duration = page.getByRole('slider', { name: /^Duração/ });
  assert.equal(await duration.getAttribute('aria-valuemin'), '10');
  assert.equal(await duration.getAttribute('aria-valuemax'), '3000');
  await duration.press('Home');
  assert.equal(await duration.getAttribute('aria-valuenow'), '10');
  assert.deepEqual(errors, []);
  console.log('SFX UI: Custom selection, six keyboard-editable dials, reset, Portuguese localization, dark/narrow layout and Noise tooltip passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
