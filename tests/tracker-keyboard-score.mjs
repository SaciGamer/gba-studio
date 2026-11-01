import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Reuse the full editor fixture, without replaying unrelated Fx gestures.
const root = path.resolve('src/renderer/frontend/src');
const editor = fs.readFileSync(path.join(root, 'components/resourceEditors/GBABeatEditor.tsx'), 'utf8');
const callbacks = [...editor.matchAll(/^  (on\w+)\??:/gm)].map(match => match[1]);
const test = fs.readFileSync('tests/tracker-fx-grid.mjs', 'utf8');
const template = test.match(/const fixture = `([\s\S]*?)`;\r?\nconst bundle/)[1];
const fixture = Function('callbacks', `return \`${template}\`;`)(callbacks)
  .replace("const [channel, setChannel] = useState(0);", "const [channel, setChannel] = useState(0); const [playing, setPlaying] = useState(false); window.__scorePlaying=setPlaying; const [language,setLanguage]=useState('en_US'); window.__scoreLanguage=setLanguage;")
  .replace('window.__fxBatches =', `window.__scoreRegressions=()=>setProject(old=>{
    let next=C.editMusicCompositionNotes(old,0,[{start:0,end:4,pitch:61,channelIndex:0,instrumentIndex:1},{start:8,end:16,pitch:61,channelIndex:0,instrumentIndex:1}]);
    next=C.setMusicCompositionPatternEffect(next,0,1,0,'XM',14,0xc1,true);
    return C.setMusicCompositionPatternEffect(next,0,8,0,'XM',0,0x36,true);
  }); window.__fxBatches =`)
  .replace('language="en_US"', 'language={language}')
  .replace('playing={false}', 'playing={playing} onPlay={(mode,start,onRow)=>{window.__scoreOnRow=onRow;setPlaying(true)}}');
const antdEntry = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
  outdir: 'score-memory', platform: 'browser', format: 'iife', alias: { '@': root, antd: antdEntry }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><body style="margin:0;background:#141414"><div id="root" style="height:900px"></div></body></html>');
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  await page.getByText('Keyboard', { exact: true }).click();
  await page.locator('.gba-keyboard-score').waitFor();
  assert.ok(await page.locator('[data-score-note]').count() > 0);
  assert.equal(await page.locator('.gba-keyboard-readout').count(), 0);
  // C5 is sustained for 24 rows: it must be tied over a 4/4 bar line.
  assert.equal(await page.locator('[data-score-note="0"]').count(), 2);
  const system = page.locator('.gba-score-system').first();
  const bounds = await system.boundingBox();
  await page.mouse.click(bounds.x + 590 / 820 * bounds.width, bounds.y + 190 / 320 * bounds.height);
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.some(note => note.row === 22 && note.pitch === 39));
  await page.locator('[data-score-note="22"]').first().click();
  assert.ok((await page.locator('[data-score-note="22"]').first().getAttribute('class')).includes('selected'));
  // The existing piano keyboard and the score share the same composition.
  await page.locator('.gba-keyboard-keys button').first().click();
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.some(note => note.pitch === 37));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-score-note]')].some(note => note.getAttribute('aria-label')?.startsWith('C3,')));
  assert.ok(await page.locator('.gba-score-effect').count() > 0);
  assert.ok(await page.locator('[data-score-clef="treble"]').count() > 0);
  assert.ok(await page.locator('[data-score-clef="bass"]').count() > 0);
  assert.ok(await page.locator('[data-score-brace]').count() > 0);
  assert.ok(await page.locator('[data-score-repeat="start"]').count() > 0);
  assert.ok(await page.locator('[data-score-repeat="end"]').count() > 0);
  assert.ok(await page.locator('[data-score-direction="vibrato"] path').count() > 0);
  assert.ok(await page.locator('[data-score-arpeggio]').count() > 0);
  // Drag the selected note two rows later and two staff positions higher.
  await page.locator('.gba-score-systems').evaluate(scroll => { scroll.scrollTop = 0; });
  const dragBounds = await system.boundingBox();
  const point = (x, y) => ({ x: dragBounds.x + x / 820 * dragBounds.width, y: dragBounds.y + y / 320 * dragBounds.height });
  let start = point(595.25, 195), end = point(639, 185);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.some(note => note.row === 24 && note.pitch === 41));
  // Cursor has an explicit drag affordance and remains separate from note entry.
  assert.equal(await page.locator('[data-score-cursor-handle]').first().evaluate(handle => getComputedStyle(handle).cursor), 'ew-resize');
  start = point(625, 90); end = point(581.25, 90);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[aria-label="Keyboard insertion row"]').value === '22');
  const keyPoint = async pitch => {
    const key = await page.locator(`[data-keyboard-pitch="${pitch}"]`).boundingBox();
    return { x: key.x + key.width / 2, y: key.y + key.height - 12 };
  };
  start = await keyPoint(49);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.waitForTimeout(850); await page.mouse.up();
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.some(note => note.row === 22 && note.pitch === 49 && note.durationRows > 4));
  // A back-and-forth keyboard trace in Vibrato mode records actual Fx commands.
  const vibRow = Number(await page.getByRole('spinbutton', { name: 'Keyboard insertion row' }).inputValue());
  await page.locator('.gba-keyboard-gesture-toolbar .ant-select-selector').click();
  await page.locator('.ant-select-item-option-content').getByText('Vibrato', { exact: true }).click();
  start = await keyPoint(49); end = await keyPoint(53);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 3 }); await page.mouse.move(start.x, start.y, { steps: 3 }); await page.mouse.up();
  await page.waitForFunction(row => window.__fxProject.patterns[0].commands.some(command => command.row === row && command.command === 'XM:effect-4'), vibRow);
  assert.ok(await page.locator('[data-score-direction="vibrato"]').count() > 0);
  await page.locator('[data-keyboard-pitch="50"]').click();
  await page.locator('.gba-score-note.selected .gba-score-accidental').waitFor();
  assert.equal(await page.locator('.gba-score-note.selected .gba-score-accidental').first().evaluate(mark => getComputedStyle(mark).fill === getComputedStyle(mark.closest('[data-score-note]')).color), true, 'accidentals inherit the selected note color');
  await page.locator('.gba-score-toolbar .ant-select-selector').click();
  await page.getByText('3/4', { exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('.gba-score-meter')?.textContent === '3');
  await page.locator('.gba-score-toolbar .ant-select-selector').click();
  await page.getByText('4/4', { exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('.gba-score-meter')?.textContent === '4');
  await page.getByRole('button', { name: 'Quick preview', exact: true }).click();
  await page.evaluate(() => window.__scoreOnRow(30));
  await page.waitForFunction(() => Number(document.querySelector('[data-score-playhead]').getAttribute('x1')) === 756.25);
  assert.notEqual(await page.locator('.gba-score-bar-label').first().evaluate(text => getComputedStyle(text).fill), 'rgb(0, 0, 0)', 'measure labels remain readable in the dark theme');
  for (const [language, title] of [['es_ES', 'Partitura del teclado'], ['fr_FR', 'Partition du clavier'], ['pt_BR', 'Partitura do teclado']]) {
    await page.evaluate(language => window.__scoreLanguage(language), language);
    await page.getByText(title, { exact: true }).waitFor();
    assert.equal(await page.locator('.gba-keyboard-score').getByText(/music\.score\./).count(), 0);
  }
  await page.evaluate(() => { window.__scorePlaying(false); window.__scoreRegressions(); });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-score-note="0"]')].map(note => note.dataset.scoreFragmentTicks).join(',') === '6,1');
  assert.equal(await page.locator('[data-score-note="0"] [data-score-notehead]').count(), 2, 'seven ticks are written with two oval note heads');
  assert.equal(await page.locator('[data-score-note="0"] [data-score-tie="internal"]').count(), 1);
  assert.equal(await page.locator('[data-score-note="0"] [data-score-tuplet="3:2"]').count(), 1);
  const spacing = await page.locator('[data-score-arpeggio-accidental]').evaluateAll(accidentals => accidentals.map(mark => {
    const head = mark.parentElement.querySelector('ellipse').getBBox();
    const glyph = mark.getBBox();
    return { gap: head.x - glyph.x - glyph.width, x: glyph.x };
  }));
  assert.ok(spacing.length >= 2);
  assert.ok(spacing.every(mark => mark.gap >= 4), 'arpeggio accidentals keep clear of their note heads');
  assert.ok(new Set(spacing.map(mark => mark.x)).size > 1, 'close accidentals use separate columns');
  const directionLabels = await page.locator('[data-score-direction-label]').evaluateAll(labels => labels.filter(label => getComputedStyle(label).display !== 'none').map(label => {
    const box = label.getBoundingClientRect();
    return { text: label.textContent, x: box.x, y: box.y, right: box.right, bottom: box.bottom };
  }));
  assert.ok(directionLabels.every(label => !/Definir|Cortar o som/.test(label.text)), 'long native effect names stay in tooltips');
  for (let index = 0; index < directionLabels.length; index++) for (const other of directionLabels.slice(index + 1)) {
    const label = directionLabels[index];
    assert.ok(label.right <= other.x || other.right <= label.x || label.bottom <= other.y || other.bottom <= label.y, 'direction labels do not overlap');
  }
  assert.equal(await page.locator('[data-score-note="0"] .gba-score-pitch-label').count(), 1, 'tied fragments share one note label');
  await page.evaluate(() => window.__fxSeed(9, 15, 150));
  await page.locator('[data-score-note="8"] [data-score-notehead]').first().click();
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => !window.__fxProject.patterns[0].notes.some(note => note.row === 8));
  assert.equal(await page.evaluate(() => window.__fxProject.patterns[0].commands.some(command => command.row === 8 && command.command === 'XM:effect-0')), false, 'Delete also clears the note arpeggio');
  assert.equal(await page.evaluate(() => window.__fxProject.patterns[0].commands.some(command => command.row === 9 && command.command === 'XM:effect-f' && command.parameter === 150)), true, 'Delete preserves tempo changes inside the note span');
  assert.equal(await page.evaluate(() => window.__fxProject.patterns[0].commands.some(command => command.row === 16 && command.command === 'XM:effect-e' && command.parameter === 0x60)), true, 'Delete preserves repeat markers');
  const screenshot = path.join(os.tmpdir(), `gba-studio-keyboard-score-${process.pid}.png`);
  await page.keyboard.press('Escape');
  await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' });
  await page.locator('.gba-score-systems').evaluate(scroll => { scroll.scrollTop = 0; });
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(`Keyboard score screenshot: ${screenshot}`);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Keyboard score renders ties and Fx; staff insertion, selection and keyboard-to-score editing pass.');
