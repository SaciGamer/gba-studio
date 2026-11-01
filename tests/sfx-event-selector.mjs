import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await esbuild.build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider,Button,theme}from'antd';import{I18nProvider,useI18n}from'./i18n/I18n';import SoundAssetSelect from'./components/events/SoundAssetSelect';
function Picker(){const{t}=useI18n();const{token}=theme.useToken();const[files,setFiles]=useState([]);const[soundId,setSoundId]=useState('');useEffect(()=>{const reload=()=>setFiles(window.electronAPI.soundFiles);window.addEventListener('gba-studio:assets-reloaded',reload);return()=>window.removeEventListener('gba-studio:assets-reloaded',reload)},[]);window.selectedSoundId=soundId;return <main style={{width:'min(420px, calc(100vw - 32px))',padding:16}}><Button onClick={()=>{window.electronAPI.soundFiles=['generated_pickup.wav'];window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'))}}>Simulate generated WAV</Button><div data-testid="sound-selector"><label>{t('events.sound.assetLabel')}</label><SoundAssetSelect files={files} value={soundId} placeholder={t('events.sound.selectAsset')} onChange={setSoundId}/></div><span data-testid="theme-background">{token.colorBgContainer}</span></main>};function Fixture(){const[language,setLanguage]=useState('en_US');const[dark,setDark]=useState(false);return <ConfigProvider theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><App><nav>{['en_US','pt_BR','es_ES','fr_FR'].map(lang=><Button key={lang} onClick={()=>setLanguage(lang)}>{lang}</Button>)}<Button onClick={()=>setDark(value=>!value)}>Toggle theme</Button></nav><I18nProvider language={language}><Picker/></I18nProvider></App></ConfigProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
});
const app = express();
app.get('/fixture.js', (_request, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_request, response) => response.type('html').send('<div id="root"></div><script>window.electronAPI={soundFiles:[]};</script><script src="/fixture.js"></script>'));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const [language, label, placeholder] of [
    ['en_US', 'Sound', 'Select sound'], ['pt_BR', 'Som', 'Selecionar som'],
    ['es_ES', 'Sonido', 'Seleccionar sonido'], ['fr_FR', 'Son', 'Sélectionner un son'],
  ]) {
    await page.getByRole('button', { name: language }).click();
    assert.equal((await page.getByTestId('sound-selector').innerText()).split('\n')[0], label);
    assert.equal(await page.locator('.ant-select-selection-placeholder').textContent(), placeholder);
  }
  await page.getByRole('button', { name: 'en_US' }).click();
  await page.getByRole('button', { name: 'Simulate generated WAV' }).click();
  const selector = page.getByRole('combobox');
  await selector.click();
  await page.getByText('generated_pickup.wav', { exact: true }).last().click();
  await page.waitForFunction(() => window.selectedSoundId === 'generated_pickup');
  assert.equal(await page.evaluate(() => window.selectedSoundId), 'generated_pickup');
  const lightBackground = await page.getByTestId('theme-background').textContent();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const darkBackground = await page.getByTestId('theme-background').textContent();
  assert.notEqual(darkBackground, lightBackground, 'theme tokens should update when the editor switches to dark mode');
  const wide = await page.getByTestId('sound-selector').evaluate(element => element.getBoundingClientRect().width);
  await page.setViewportSize({ width: 360, height: 640 });
  const narrow = await page.getByTestId('sound-selector').evaluate(element => element.getBoundingClientRect().width);
  assert.ok(wide > narrow && narrow > 250, `selector should adapt to viewport: wide=${wide}, narrow=${narrow}`);
  assert.deepEqual(errors, []);
  console.log('SFX event selector passed: reloaded WAV is selectable, asset ID is stored, and the control adapts to a narrow viewport.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
