import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import path from 'node:path';

const root = path.resolve('.');
const bundle = await build({
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { I18nProvider } from './src/renderer/frontend/src/i18n/I18n';
    import PhysicsValueControl from './src/renderer/frontend/src/components/events/PhysicsValueControl';
    function App() {
      const [language, setLanguage] = useState('en_US');
      const [gravity, setGravity] = useState(0.25);
      const [impulse, setImpulse] = useState(-5);
      const [airJumps, setAirJumps] = useState(0);
      return <I18nProvider language={language}>
        <button onClick={() => setLanguage('pt_BR')}>Portuguese</button>
        <section id="gravity"><PhysicsValueControl field="gravity" value={gravity} onChange={setGravity}/><output>{gravity}</output></section>
        <section id="impulse"><PhysicsValueControl field="impulse" value={impulse} onChange={setImpulse}/><output>{impulse}</output></section>
        <section id="airJumps"><PhysicsValueControl field="airJumps" value={airJumps} onChange={setAirJumps}/><output>{airJumps}</output></section>
      </I18nProvider>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `, loader: 'tsx', resolveDir: root },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  tsconfig: path.join(root, 'src/renderer/frontend/tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="root" style="width:400px"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const choose = async (id, text) => {
    await page.locator(`#${id} .ant-select`).click();
    await page.locator('.ant-select-dropdown:visible').getByText(text, { exact: true }).click();
  };
  await page.locator('#gravity .ant-select').waitFor();
  assert.match(await page.locator('#gravity').innerText(), /Normal/);
  await choose('gravity', 'Custom');
  const gravityInput = page.locator('#gravity input[role="spinbutton"]');
  await gravityInput.fill('0.375');
  await gravityInput.press('Tab');
  assert.equal(await page.locator('#gravity output').textContent(), '0.375');
  await choose('gravity', 'Low (0.125)');
  assert.equal(await page.locator('#gravity output').textContent(), '0.125');
  assert.equal(await gravityInput.count(), 0);
  await choose('impulse', 'Down: low (3)');
  assert.equal(await page.locator('#impulse output').textContent(), '3');
  await choose('airJumps', 'Unlimited (-1)');
  assert.equal(await page.locator('#airJumps output').textContent(), '-1');
  await choose('airJumps', 'Custom');
  const jumpsInput = page.locator('#airJumps input[role="spinbutton"]');
  await jumpsInput.fill('4');
  await jumpsInput.press('Tab');
  assert.equal(await page.locator('#airJumps output').textContent(), '4');
  await page.getByRole('button', { name: 'Portuguese' }).click();
  assert.match(await page.locator('#airJumps').innerText(), /Personalizado/);
  await choose('gravity', 'Normal (0.25)');
  assert.equal(await page.locator('#gravity output').textContent(), '0.25');
  console.log('Physics presets: select, custom fractions, preset return, impulse direction, air jumps and locale switching passed in Chromium.');
} finally { await browser.close(); }
