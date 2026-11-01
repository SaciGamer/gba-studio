import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const root = path.resolve('src/renderer/frontend/src');
const editor = fs.readFileSync(path.join(root, 'components/resourceEditors/GBABeatEditor.tsx'), 'utf8');
const callbacks = [...editor.matchAll(/^  (on\w+)\??:/gm)].map(match => match[1]);
const template = fs.readFileSync('tests/tracker-fx-grid.mjs', 'utf8').match(/const fixture = `([\s\S]*?)`;\r?\nconst bundle/)[1];
const fixture = Function('callbacks', `return \`${template}\`;`)(callbacks)
  .replace("const [channel, setChannel] = useState(0);", `const [channel, setChannel] = useState(0); const [beat,setBeat]=useState(0);
    window.switchBeat=()=>{let next=C.createMusicCompositionWithStarterBank('XM'); while(next.instruments.length>1) next=C.deleteMusicCompositionInstrument(next,next.instruments.length-1); setProject(next);setBeat(value=>value+1)};
    window.seedCopyNotes=()=>setProject(old=>C.editMusicCompositionNotes(old,0,[{start:28,end:32,pitch:65,channelIndex:0,instrumentIndex:1}]));`)
  .replace('<GBABeatEditor {...handlers}', '<GBABeatEditor key={beat} {...handlers}')
  .replace('filename="Fx grid"', 'filename={"Beat "+beat}');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'clipboard-memory',
  platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<body style="margin:0"><div id="root" style="height:1000px"></div></body>');
  await page.addScriptTag({ content: `window.systemClipboard='';window.electronAPI={writeMusicNoteClipboard:async value=>{window.systemClipboard=value;return true},readMusicNoteClipboard:async()=>window.systemClipboard};` });
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  await page.evaluate(() => window.seedCopyNotes());
  await page.getByText('Keyboard', { exact: true }).click();
  await page.locator('[data-score-note="0"] [data-score-notehead]').first().click();
  await page.locator('[data-score-note="28"] [data-score-notehead]').first().click({ modifiers: ['Control'] });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:gba-editor-command', { detail: { command: 'copy' } })));
  await page.waitForFunction(() => window.systemClipboard.length > 0);
  const copied = await page.evaluate(() => JSON.parse(window.systemClipboard));
  assert.equal(copied.notes.length, 2);
  assert.deepEqual(copied.notes.map(note => [note.rowOffset, note.noteDelta, note.length]), [[0, 0, 24], [28, 4, 4]]);
  await page.evaluate(() => { const value=JSON.parse(window.systemClipboard);value.notes[1].instrument=255;window.systemClipboard=JSON.stringify(value);window.switchBeat(); });
  await page.getByText('Keyboard', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Keyboard insertion row' }).fill('4');
  await page.getByRole('spinbutton', { name: 'Keyboard insertion row' }).press('Enter');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:gba-editor-command', { detail: { command: 'paste' } })));
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.length === 2);
  const result = await page.evaluate(() => window.__fxProject.patterns[0].notes.map(note => [note.row,note.pitch,note.durationRows,note.instrumentId]));
  assert.deepEqual(result.map(note => note.slice(0,3)), [[4,61,24],[32,65,4]]);
  assert.equal(result[0][3], result[1][3], 'missing source instruments use the selected destination instrument');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('Copying selected notes survives beat/editor remounts and system clipboard reads; destination preserves intervals/durations and resolves unavailable instruments.');
