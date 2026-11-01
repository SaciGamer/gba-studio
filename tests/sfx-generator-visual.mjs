import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await esbuild.build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,Button,ConfigProvider,theme}from'antd';import{I18nProvider}from'./i18n/I18n';import SfxGenerator from'./components/resourceEditors/SfxGenerator';
function ThemeProbe(){const{token}=theme.useToken();return <span data-testid="theme-background">{token.colorBgContainer}</span>};function Fixture(){const[language,setLanguage]=useState('en_US');const[dark,setDark]=useState(false);return <ConfigProvider theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><App><nav style={{position:'fixed',right:4,top:4,zIndex:3000}}>{['en_US','pt_BR','es_ES','fr_FR'].map(lang=><Button key={lang} onClick={()=>setLanguage(lang)}>{lang}</Button>)}<Button onClick={()=>setDark(value=>!value)}>Toggle theme</Button><ThemeProbe/></nav><I18nProvider language={language}><SfxGenerator onClose={()=>{}} onSaved={()=>{}}/></I18nProvider></App></ConfigProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const app = express();
app.get('/fixture.js', (_request, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_request, response) => response.type('html').send('<div id="root"></div><script>window.electronAPI={};</script><script src="/fixture.js"></script>'));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const workspace = page.getByTestId('sfx-generator-workspace');
  const localizedTitles = { en_US: 'SFX Generator', pt_BR: 'Gerador de SFX', es_ES: 'Generador de SFX', fr_FR: 'Générateur SFX' };
  const localizedWaveforms = {
    en_US: 'Generated SFX waveform preview', pt_BR: 'Prévia da forma de onda SFX gerada',
    es_ES: 'Vista previa de la forma de onda SFX generada', fr_FR: 'Aperçu de la forme d’onde SFX générée',
  };
  for (const language of Object.keys(localizedTitles)) {
    await page.getByRole('button', { name: language }).click();
    await workspace.getByText(localizedTitles[language], { exact: true }).waitFor();
    assert.equal(await workspace.locator('canvas').last().getAttribute('aria-label'), localizedWaveforms[language]);
  }
  assert.equal(await page.getByRole('dialog').count(), 0, 'SFX creation should stay in the central editor view, not open a modal');
  assert.equal(await workspace.locator('canvas').count(), 2, 'waveform and spectrum canvases should both render');
  assert.equal(await workspace.getByRole('slider').count(), 5, 'frequency, duration, fade-in, fade-out and volume should be editable');
  assert.equal(await workspace.locator('.ant-slider.gba-music-fader').count(), 4, 'frequency, duration and fade controls should use the shared illuminated fader style');
  assert.equal(await workspace.getByRole('slider', { name: 'Volume 100' }).getAttribute('aria-valuetext'), '100%', 'SFX volume should render as an accessible circular dial with a directional indicator');
  const lightBackground = await page.getByTestId('theme-background').textContent();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const darkBackground = await page.getByTestId('theme-background').textContent();
  assert.notEqual(darkBackground, lightBackground, 'SFX visualization should receive changed theme tokens');
  const initialSize = await workspace.locator('canvas').evaluateAll(canvases => canvases.map(canvas => canvas.clientWidth));
  await page.setViewportSize({ width: 700, height: 800 });
  const narrowSize = await workspace.locator('canvas').evaluateAll(canvases => canvases.map(canvas => canvas.clientWidth));
  assert.ok(narrowSize.every((width, index) => width > 300 && width < initialSize[index]));
  assert.deepEqual(errors, []);
  console.log('SFX visual UI passed: all locale titles/accessible graph labels, light/dark theme tokens, and responsive waveform/spectrum layout verified.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
