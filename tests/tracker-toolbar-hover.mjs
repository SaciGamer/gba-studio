import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve('src/renderer/frontend/src');
const editor = fs.readFileSync(path.join(root, 'components/resourceEditors/GBABeatEditor.tsx'), 'utf8');
const callbacks = [...editor.matchAll(/^  (on\w+)\??:/gm)].map(match => match[1]);
const template = fs.readFileSync('tests/tracker-fx-grid.mjs', 'utf8').match(/const fixture = `([\s\S]*?)`;\r?\nconst bundle/)[1];
const fixture = Function('callbacks', `return \`${template}\`;`)(callbacks)
  .replace("const [channel, setChannel] = useState(0);", "const [channel, setChannel] = useState(0);const [language,setLanguage]=useState('en_US');const [dark,setDark]=useState(true);window.testLanguage=setLanguage;window.testTheme=setDark;")
  .replace('language="en_US"', 'language={language}')
  .replace('algorithm: theme.darkAlgorithm', 'algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
  outdir: 'toolbar-memory', platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<body style="margin:0"><div id="root" style="height:900px"></div></body>');
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  await page.locator('.gba-music-fx-grid').waitFor();
  const checkTooltip = async (control, text) => {
    await page.mouse.move(1, 899);
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="tooltip"]')].some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'));
    await control.hover();
    try { await page.getByRole('tooltip').filter({ hasText: text }).waitFor({ timeout: 4000 }); }
    catch (error) {
      console.log(await control.evaluate(element => { const box=element.getBoundingClientRect();return { html:element.outerHTML,hit:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.outerHTML,tooltips:[...document.querySelectorAll('[role="tooltip"]')].map(node=>node.textContent) }; }));
      throw error;
    }
  };
  for (const [control, text] of [
    [page.getByRole('button', { name: 'Quick preview', exact: true }), 'Preview the current pattern or song from the playback cursor.'],
    [page.getByRole('button', { name: 'Play in ROM', exact: true }), 'Build and play a GBA ROM preview of this music.'],
    [page.getByRole('button', { name: 'Save', exact: true }), 'Save changes to the current beat.'],
    [page.locator('.gba-music-target-tag'), 'Choose the module format used to export this beat.'],
    [page.getByText('Piano roll', { exact: true }), 'Edit note pitch, position and length on the piano roll.'],
    [page.getByText('Keyboard', { exact: true }), 'Play the virtual keyboard and edit notes on the score.'],
    [page.getByText('Tracker', { exact: true }), 'Edit notes and effect commands by row and channel.'],
    [page.locator('.gba-beat-order-title').getByText('Pattern', { exact: true }), 'Show and preview only the selected pattern.'],
    [page.locator('.gba-beat-order-title').getByText('Song', { exact: true }), 'Show and preview the complete song in order.'],
  ]) await checkTooltip(control, text);
  await checkTooltip(page.getByRole('switch', { name: 'Loop', exact: true }), 'Repeat Quick preview and the ROM preview.');
  assert.equal(await page.locator('.gba-music-target-tag .ant-tag').count(), 0, 'format selection has no tag styling');
  assert.equal(await page.locator('.gba-beat-toolbar-actions').evaluate(actions => {
    const save = actions.querySelector('button[aria-label="Save"]');
    return Math.abs(actions.getBoundingClientRect().right - save.getBoundingClientRect().right) < 2;
  }), true, 'Save aligns to the right edge of the center toolbar');
  assert.equal(await page.locator('.gba-beat-toolbar-actions').evaluate(actions => {
    const rom=actions.querySelector('button[aria-label="Play in ROM"]'), loop=actions.querySelector('button[aria-label="Loop"]');
    return Boolean(rom.compareDocumentPosition(loop) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true, 'Loop follows the ROM preview button');
  for (const [language, patternHint] of [['pt_BR', 'Mostre e ouça apenas o pattern selecionado.'], ['es_ES', 'Muestra y reproduce solo el patrón seleccionado.'], ['fr_FR', 'Affichez et écoutez uniquement le motif sélectionné.']]) {
    await page.evaluate(language => window.testLanguage(language), language);
    await page.getByRole('button', { name: { pt_BR: 'Reproduzir na ROM', es_ES: 'Reproducir en la ROM', fr_FR: 'Lire dans la ROM' }[language], exact: true }).waitFor();
    await checkTooltip(page.locator('.gba-beat-order-title').getByText('Pattern', { exact: true }), patternHint);
    await page.getByText('Piano roll', { exact: true }).hover();
  }
  await page.evaluate(() => window.testLanguage('en_US'));
  await page.mouse.move(1, 899);
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="tooltip"]')].some(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'));
  const grid = await page.locator('.gba-music-fx-grid').boundingBox();
  const fxPoint = row => ({ x: grid.x + row * 20 + 10, y: grid.y + 10 });
  let point = fxPoint(8);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('[data-fx-roll-crosshair]').style.display === 'block');
  assert.equal(await page.locator('[data-fx-roll-crosshair] .gba-roll-hover-column').evaluate(column => column.style.left), '160px', 'Fx hover works before any roll hover');
  const roll = await page.locator('.gba-beat-scroll').boundingBox();
  await page.mouse.move(roll.x + 100, roll.y + 100);
  assert.equal(await page.locator('.gba-beat-grid > .gba-roll-hover-row').count(), 1);
  point = fxPoint(12);
  await page.mouse.move(point.x, point.y);
  assert.equal(await page.locator('[data-fx-roll-crosshair] .gba-roll-hover-column').evaluate(column => column.style.left), '240px');
  assert.equal(await page.locator('[data-fx-roll-crosshair] .gba-roll-hover-row').count(), 0, 'Fx hover shows only the vertical reference in the roll');
  assert.equal(await page.locator('[data-fx-roll-crosshair] .gba-roll-hover-center').count(), 0);
  assert.equal(await page.locator('.gba-beat-grid > .gba-roll-hover-row').count(), 0);
  assert.equal(await page.locator('.gba-music-fx-grid > .gba-roll-hover-column').evaluate(column => column.style.left), '240px');
  const darkShot = path.join(os.tmpdir(), `gba-studio-fx-crosshair-dark-${process.pid}.png`);
  await page.screenshot({ path: darkShot, fullPage: true });
  await page.evaluate(() => window.testTheme(false));
  point = fxPoint(16); await page.mouse.move(point.x, point.y);
  const lightShot = path.join(os.tmpdir(), `gba-studio-fx-crosshair-light-${process.pid}.png`);
  await page.screenshot({ path: lightShot, fullPage: true });
  await page.mouse.move(15, 15);
  assert.equal(await page.locator('[data-fx-roll-crosshair]').evaluate(layer => layer.style.display), 'none');
  assert.deepEqual(errors, []);
  console.log(`Toolbar tooltips and Fx/roll crosshair pass; screenshots: ${darkShot}, ${lightShot}`);
} finally { await browser.close(); }
