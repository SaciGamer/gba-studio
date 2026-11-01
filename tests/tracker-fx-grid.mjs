import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';

const root = path.resolve('src/renderer/frontend/src');
const antdEntry = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const load = async filename => {
  const result = await build({ entryPoints: [path.join(root, 'utils', filename)], bundle: true,
    write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [composition, exporter, tracker, visuals, packages, fxEditing] = await Promise.all([
  'trackerComposition.ts', 'trackerCompositionExport.ts', 'trackerModule.ts', 'trackerFxVisuals.ts', 'trackerProjectPackage.ts', 'trackerFxEditing.ts',
].map(load));
let project = composition.createMusicCompositionWithStarterBank('XM');
project = composition.setMusicCompositionPatternEffect(project, 0, 4, 0, 'XM', 8, 255, true);
project = composition.setMusicCompositionPatternEffect(project, 0, 6, 0, 'XM', 14, 0xc1, true);
project = composition.setMusicCompositionPatternEffect(project, 0, 8, 1, 'XM', 0, 0x37, true);
const commands = structuredClone(project.patterns[0].commands);
let edited = composition.editMusicCompositionNotes(project, 0, [{ start: 4, end: 12, pitch: 61, channelIndex: 0, instrumentIndex: 1 }]);
assert.deepEqual(edited.patterns[0].commands, commands, 'adding a note keeps independently positioned Fx, including note cuts');
assert.equal(edited.patterns[0].notes[0].pan, 127 / 128, 'a note placed on a pan effect inherits the native FF position');
assert.equal(edited.patterns[0].notes[0].panMode, 'absolute');
let bytes = exporter.exportMusicComposition(edited, 'XM').moduleData;
let rows = tracker.parseXmPatternRows(bytes, 0, 64);
assert.equal(rows[4][0].effect, 8);
assert.equal(rows[4][0].parameter, 255, 'native playback retains the pan already present in the grid');
assert.equal(rows[6][0].parameter, 0xc1, 'explicit grid cuts survive insertion and reach the module');
edited = composition.editMusicCompositionNotes(edited, 0, [{ oldRow: 4, start: 16, end: 24, pitch: 61, channelIndex: 0, instrumentIndex: 1 }]);
assert.deepEqual(edited.patterns[0].commands, commands, 'moving a note leaves Fx at their grid addresses');
assert.notEqual(tracker.parseXmPatternRows(exporter.exportMusicComposition(edited, 'XM').moduleData, 0, 64)[16][0].effect, 8,
  'a grid pan is not duplicated at the destination when a note moves away');
edited = composition.deleteMusicCompositionNotes(edited, 0, [{ row: 16, channelIndex: 0 }]);
assert.deepEqual(edited.patterns[0].commands, commands, 'deleting a note preserves independent Fx');
const restored = packages.parseTrackerProjectPackage(packages.createTrackerProjectPackage({ composition: edited }));
assert.deepEqual(restored.composition.patterns[0].commands, commands, 'row ownership survives save/load');
let panMove = composition.editMusicCompositionNotes(composition.createMusicCompositionWithStarterBank('XM'), 0,
  [{ start: 0, end: 16, pitch: 61, channelIndex: 0, instrumentIndex: 1 }]);
panMove = composition.setMusicCompositionPatternEffect(panMove, 0, 0, 0, 'XM', 8, 255, true);
assert.equal(tracker.parseXmPatternRows(exporter.exportMusicComposition(panMove, 'XM').moduleData, 0, 64)[0][0].parameter, 255);
panMove = composition.setMusicCompositionPatternEffect(panMove, 0, 0, 0, 'XM', 0, 0, true);
panMove = composition.setMusicCompositionPatternEffect(panMove, 0, 4, 0, 'XM', 8, 255, true);
const movedPanRows = tracker.parseXmPatternRows(exporter.exportMusicComposition(panMove, 'XM').moduleData, 0, 64);
assert.notEqual(movedPanRows[0][0].effect, 8, 'moving a pan effect detaches its note mirror instead of recreating it');
assert.equal(movedPanRows[4][0].effect, 8);
const event = (effect = 0, parameter = 0) => ({ note: 0, instrument: 0, volume: 0, effect, parameter });
const visualRows = Array.from({ length: 12 }, () => [event(), event()]);
visualRows[0][0] = event(4, 0x47); visualRows[4][0] = event(8, 255); visualRows[8][0] = event(0, 0x37);
visualRows[2][1] = event(1, 4);
const prefix = visuals.trackerFxPresencePrefix(visualRows, 0);
assert.equal(prefix[4] - prefix[0], 1);
assert.equal(prefix[12] - prefix[4], 2);
assert.equal(prefix[3] - prefix[1], 0, 'another channel does not mark this channel note');
assert.ok(visuals.trackerFxVisuals('XM', 4, 0x47).every(fx => /^[A-Z]{2}$/.test(fx.code)));
assert.equal(visuals.trackerFxVisuals('XM', 4, 0x47)[0].color, visuals.trackerFxVisuals('XM', 4, 0x47)[0].color);
const fxSegments = [{ start: 0, end: 64, patternIndex: 0 }, { start: 64, end: 128, patternIndex: 1 }];
const fxGroup = [{ timelineRow: 62, effect: 4, parameter: 0x47 }, { timelineRow: 63, effect: 0, parameter: 0x37 }];
assert.equal(fxEditing.clampTrackerFxDelta(fxGroup, 999, 128), 64);
assert.equal(fxEditing.clampTrackerFxDelta(fxGroup, -999, 128), -62);
assert.deepEqual(fxEditing.trackerFxPlacementUpdates(fxSegments, 1, fxGroup, 1, true), [
  { patternIndex: 0, row: 62, channel: 1, effect: 0, parameter: 0 },
  { patternIndex: 0, row: 63, channel: 1, effect: 4, parameter: 0x47 },
  { patternIndex: 1, row: 0, channel: 1, effect: 0, parameter: 0x37 },
], 'overlapping moves across pattern boundaries clear sources before filling destinations');

const componentSource = fs.readFileSync(path.join(root, 'components/resourceEditors/GBABeatEditor.tsx'), 'utf8');
const callbacks = [...componentSource.matchAll(/^  (on\w+)\??:/gm)].map(match => match[1]);
const fixture = `
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { I18nProvider } from '@/i18n/I18n';
import GBABeatEditor from '@/components/resourceEditors/GBABeatEditor';
import '@/components/resourceEditors/GBABeatEditor.css';
import '@/components/resourceEditors/TrackerOrder.css';
import '@/components/resourceEditors/TrackerScale.css';
import * as C from '@/utils/trackerComposition';
import { exportMusicComposition } from '@/utils/trackerCompositionExport';
import { parseTrackerModule, parseXmPatternRows, parseXmSamples } from '@/utils/trackerModule';
import { trackerScoreDeletion } from '@/utils/trackerScoreDeletion';
let initial = C.createMusicCompositionWithStarterBank('XM');
initial = C.editMusicCompositionNotes(initial, 0, [{ start: 0, end: 24, pitch: 61, channelIndex: 0, instrumentIndex: 1 }]);
for (const [row, effect, parameter] of [[0,4,71],[4,8,255],[8,0,55],[12,10,1],[16,14,96],[24,14,98]]) {
  initial = C.setMusicCompositionPatternEffect(initial, 0, row, 0, 'XM', effect, parameter, true);
}
initial = C.setMusicCompositionPatternEffect(initial, 0, 2, 1, 'XM', 1, 4, true);
function Fixture() {
  const [project, setProject] = useState(initial);
  const [channel, setChannel] = useState(0);
  window.__fxProject = project;
  window.__fxChannel = setChannel;
  window.__fxSetProject = setProject;
  window.__fxSeed = (row, effect, parameter) => setProject(old => C.setMusicCompositionPatternEffect(old, 0, row, 0, 'XM', effect, parameter, true));
  window.__fxBatches = window.__fxBatches || [];
  const projection = useMemo(() => {
    const bytes = exportMusicComposition(project, 'XM').moduleData;
    return { bytes, info: parseTrackerModule(bytes, 'XM'), rows: parseXmPatternRows(bytes, 0, 64), samples: parseXmSamples(bytes) };
  }, [project]);
  const handlers = Object.fromEntries(${JSON.stringify(callbacks)}.map(name => [name, () => false]));
  return <I18nProvider language="en_US"><ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    <GBABeatEditor {...handlers} externalWorkspacePanels info={projection.info} rows={projection.rows} patternRowsByIndex={[projection.rows]}
      format="XM" filename="Fx grid" moduleBytes={projection.bytes} samples={projection.samples} pattern={0} patternRowCount={64}
      patternCount={1} order={[0]} selectedOrder={0} selectedChannel={channel} instrumentCount={project.instruments.length}
      muted={Array.from({length:project.channels.length},()=>false)} volumes={Array.from({length:project.channels.length},()=>1)} pans={Array.from({length:project.channels.length},()=>0)}
      playing={false} onChannelChange={setChannel} onEffectChange={(row, channel, pattern, effect, parameter) => setProject(old => C.setMusicCompositionPatternEffect(old, pattern, row, channel, 'XM', effect, parameter, true))}
      onEffectsChange={updates => { window.__fxBatches.push(updates); setProject(old => updates.reduce((next, item) => C.setMusicCompositionPatternEffect(next, item.patternIndex, item.row, item.channel, 'XM', item.effect, item.parameter, true), old)); }}
      onCreateNotes={notes => setProject(old => C.editMusicCompositionNotes(old,0,notes.map(note=>({start:note.start,end:note.end,pitch:note.note,channelIndex:note.channel,instrumentIndex:note.instrument}))))}
      onEditNotes={notes => setProject(old => C.editMusicCompositionNotes(old,0,notes.map(note=>({oldRow:note.oldRow,start:note.start,end:note.end,pitch:note.note,channelIndex:note.channel,instrumentIndex:note.instrument}))))}
      onDeleteNotes={(notes,noteEffects)=>setProject(old=>{
        let next=C.deleteMusicCompositionNotes(old,0,notes.map(note=>({row:note.row,channelIndex:note.channel})));
        if(noteEffects) for(const update of trackerScoreDeletion(projection.rows,'XM',notes,{bpm:125,speed:6})) if(update.patch.effect!==undefined) next=C.setMusicCompositionPatternEffect(next,0,update.row,update.channel,'XM',0,0,true);
        return next;
      })}
      onNote={(start,end,note,channel,instrument) => setProject(old => C.editMusicCompositionNotes(old,0,[{start,end,pitch:note,channelIndex:channel,instrumentIndex:instrument}]))} />
  </ConfigProvider></I18nProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outdir: 'fx-grid-memory', platform: 'browser', format: 'iife', alias: { '@': root, antd: antdEntry },
  define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><body style="margin:0;background:#141414"><div id="root" style="height:760px"></div></body></html>');
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  const historyText = fs.readFileSync(path.join(root, 'providers/HistoryProvider.tsx'), 'utf8');
  const historySource = ts.createSourceFile('HistoryProvider.tsx', historyText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let musicKeyHandler;
  function findKeyHandler(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(historySource) === 'onKeyDown'
      && node.initializer?.getText(historySource).includes('gba-studio:editor-undo')) musicKeyHandler = node.initializer.getText(historySource);
    ts.forEachChild(node, findKeyHandler);
  }
  findKeyHandler(historySource);
  assert.ok(musicKeyHandler);
  await page.addScriptTag({ content: ts.transpile(`{
    const clearSceneClipboard = () => {};
    const keyHandler = ${musicKeyHandler};
    document.addEventListener('keydown', keyHandler, true);
    window.addEventListener('gba-studio:music-edit-command', event => window.dispatchEvent(new CustomEvent('gba-studio:gba-editor-command', { detail: event.detail })));
  }`, { target: ts.ScriptTarget.ES2022 }) });
  await page.waitForSelector('.gba-music-fx-grid');
  assert.equal(await page.locator('.gba-music-fx-cell[data-fx-channel="1"]').count(), 0, 'only the selected channel is shown');
  assert.ok(await page.locator('.gba-music-fx-badge').count() >= 6);
  assert.ok(await page.locator('.gba-note-fx-mark').count() >= 1, 'affected notes get a visible signal');
  assert.equal(await page.locator('.gba-note-fx-spectrum,.gba-note-fx-layers').count(), 0, 'notes contain no spectrum layers or animated bars');
  assert.ok(!(await page.locator('.gba-music-fx-heading').innerText()).includes('Rows'), 'obsolete note/row labels are removed');
  await page.locator('.gba-music-fx-cell[data-fx-row="24"] .gba-music-fx-badge').click();
  await page.getByText('Extra repetitions', { exact: true }).waitFor();
  assert.equal(await page.getByRole('slider', { name: 'Extra repetitions', exact: true }).getAttribute('aria-valuenow'), '2');
  await page.getByRole('slider', { name: 'Extra repetitions', exact: true }).press('ArrowRight');
  await page.waitForFunction(() => window.__fxProject.patterns[0].commands.some(command => command.row === 24 && command.parameter === 0x63));
  await page.keyboard.press('Escape');
  await page.locator('.gba-music-fx-config').waitFor({ state: 'hidden' });
  await page.locator('.gba-music-fx-cell[data-fx-row="4"] .gba-music-fx-badge').click();
  await page.locator('.gba-fx-design-panel .gba-music-fader.gba-sample-volume-fader').waitFor();
  assert.equal(await page.getByRole('slider', { name: 'Stereo position', exact: true }).getAttribute('aria-valuenow'), '255');
  await page.waitForFunction(() => { const el = document.querySelector('.gba-music-fx-config')?.closest('.ant-popover'); return el && getComputedStyle(el).opacity === '1' && el.getBoundingClientRect().x >= 0; });
  const configScreenshot = path.join(os.tmpdir(), `gba-studio-fx-config-${process.pid}.png`);
  await page.screenshot({ path: configScreenshot, fullPage: true, animations: 'disabled' });
  console.log(`Fx settings screenshot: ${configScreenshot}`);
  await page.keyboard.press('Escape');
  await page.locator('.gba-music-fx-config').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.__fxChannel(1));
  await page.waitForFunction(() => document.querySelectorAll('.gba-music-fx-cell[data-fx-channel="0"]').length === 0);
  assert.equal(await page.locator('.gba-music-fx-badge').innerText(), 'PU', 'channel changes replace the visible Fx');
  await page.evaluate(() => window.__fxChannel(0));
  await page.locator('.gba-music-fx-cell[data-fx-row="0"] .gba-music-fx-badge').waitFor();
  const grid = await page.locator('.gba-music-fx-grid').boundingBox();
  await page.mouse.click(grid.x + 32 * 20 + 10, grid.y + 14);
  await page.locator('.gba-fx-design-panel .ant-select-selector').click();
  await page.getByText('AR - Alternating notes (arpeggio)', { exact: true }).click();
  await page.locator('.gba-music-fx-cell[data-fx-row="32"] .gba-music-fx-badge').waitFor();
  assert.ok(await page.getByText('Interval 1 (semitones)', { exact: true }).isVisible(), 'arpeggio opens its own interval settings');
  await page.keyboard.press('Escape');
  await page.locator('.gba-music-fx-config').waitFor({ state: 'hidden' });
  await page.locator('.gba-music-fx-cell[data-fx-row="0"] .gba-music-fx-badge').click();
  await page.locator('.gba-fx-design-panel .ant-select-selector').click();
  await page.getByRole('combobox', { name: 'Effect' }).fill('VV');
  await page.getByText('VV - Vibrato and volume slide', { exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gba-music-fx-cell[data-fx-row="0"] .gba-music-fx-badge').length === 2);
  await page.keyboard.press('Escape');
  await page.locator('.gba-music-fx-config').waitFor({ state: 'hidden' });
  await page.locator('.gba-music-fx-cell[data-fx-row="0"] .gba-music-fx-badge').filter({ hasText: 'VS' }).click();
  await page.getByRole('slider', { name: 'Increase', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Remove effect', exact: true }).count(), 0);
  assert.equal(await page.locator('.gba-fx-design-panel .ant-select-selection-overflow').count(), 0, 'effect selector is single');
  assert.ok(await page.locator('.gba-fx-design-panel').evaluate(element => getComputedStyle(element).backgroundImage.includes('linear-gradient')), 'Fx settings reuse the SFX panel gradient');
  await page.locator('.gba-fx-design-panel .ant-select').hover();
  await page.locator('.gba-fx-design-panel .ant-select-clear').click();
  await page.waitForFunction(() => document.querySelectorAll('.gba-music-fx-cell[data-fx-row="0"] .gba-music-fx-badge').length === 0);
  await page.keyboard.press('Escape');
  await page.locator('.gba-music-fx-config').waitFor({ state: 'hidden' });
  await page.mouse.click(5, 5);
  await page.locator('button.gba-beat-note[data-note]').first().scrollIntoViewIfNeeded();
  const pianoGrid = await page.locator('.gba-beat-grid').boundingBox();
  await page.mouse.click(pianoGrid.x + 32 * 20 + 10, pianoGrid.y + (96 - 61) * 20 + 10);
  await page.waitForFunction(() => window.__fxProject.patterns[0].notes.some(note => note.row === 32));
  assert.ok(await page.evaluate(() => window.__fxProject.patterns[0].commands.some(command => command.row === 32 && command.command === 'XM:effect-0' && command.parameter === 0x37)),
    'creating a musical note on an existing Fx cell keeps the effect');
  assert.ok(await page.locator('.gba-note-fx-mark').count() >= 2, 'the newly added note receives its Fx signal');
  assert.equal(await page.locator('.gba-note-fx-spectrum,.gba-note-fx-layers').count(), 0);
  // Shared tools operate on the Fx grid without touching any musical note.
  const notesBeforeFxEdits = await page.evaluate(() => JSON.stringify(window.__fxProject.patterns[0].notes));
  const command = name => page.keyboard.press(({ copy: 'Control+c', cut: 'Control+x', paste: 'Control+v' })[name]);
  const fxPoint = async row => {
    const bounds = await page.locator('.gba-music-fx-grid').boundingBox();
    return { x: bounds.x + row * 20 + 10, y: bounds.y + 14 };
  };
  const dragFx = async (start, end) => {
    const from = await fxPoint(start), to = await fxPoint(end);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
  };
  const hasFx = row => page.evaluate(row => window.__fxProject.patterns[0].commands.some(command => command.row === row && command.channelId === window.__fxProject.channels[0].id), row);
  await page.keyboard.press('3');
  await dragFx(7, 13);
  await page.mouse.up();
  assert.equal(await page.locator('.gba-music-fx-cell.fx-selected').count(), 2, 'select tool selects an Fx range');
  await command('copy');
  let point = await fxPoint(20); await page.mouse.move(point.x, point.y);
  await command('paste');
  await page.locator('.gba-music-fx-cell.fx-ghost').first().waitFor();
  assert.equal(await page.locator('.gba-music-fx-cell.fx-ghost').count(), 2, 'pasted effects follow the mouse before committing');
  assert.equal(await hasFx(20), false);
  point = await fxPoint(22); await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  assert.ok(await hasFx(8) && await hasFx(12) && await hasFx(22) && await hasFx(26), 'copy keeps originals and relative spacing');
  const batchesBeforeCut = await page.evaluate(() => window.__fxBatches.length);
  await command('cut');
  assert.equal(await hasFx(22), false); assert.equal(await hasFx(26), false);
  assert.equal(await page.evaluate(() => window.__fxBatches.length), batchesBeforeCut + 1, 'a group cut is one transaction');
  point = await fxPoint(40); await page.mouse.move(point.x, point.y);
  await command('paste'); await page.mouse.click(point.x, point.y);
  assert.ok(await hasFx(40) && await hasFx(44));
  const batchesBeforeMove = await page.evaluate(() => window.__fxBatches.length);
  await dragFx(40, 42);
  assert.equal(await page.locator('.gba-music-fx-cell.fx-ghost').count(), 2);
  assert.equal(await page.locator('.gba-music-fx-cell[data-fx-timeline-row="40"]').count(), 0, 'moving effects hide their original cells');
  await page.mouse.up();
  assert.ok(await hasFx(42) && await hasFx(46));
  assert.equal(await hasFx(40), false); assert.equal(await hasFx(44), false);
  assert.equal(await page.evaluate(() => window.__fxBatches.length), batchesBeforeMove + 1, 'a group move is one transaction');
  await page.keyboard.press('2');
  point = await fxPoint(42); await page.mouse.click(point.x, point.y);
  assert.equal(await hasFx(42), false, 'eraser click clears an entire Fx cell');
  await dragFx(10, 17);
  assert.equal(await page.locator('.gba-music-fx-cell.fx-erased').count(), 2, 'eraser previews its range before release');
  assert.ok(await hasFx(12) && await hasFx(16));
  await page.mouse.up();
  assert.equal(await hasFx(12), false); assert.equal(await hasFx(16), false);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__fxProject.patterns[0].notes)), notesBeforeFxEdits, 'Fx edits never alter notes');
  await page.keyboard.press('3');
  point = await fxPoint(46); await page.mouse.click(point.x, point.y);
  await page.keyboard.press('Delete');
  assert.equal(await hasFx(46), false, 'Delete uses the active Fx selection');
  await page.evaluate(() => window.__fxSeed(63, 4, 71));
  const bufferedEnd = await page.locator('.gba-beat-scroll').evaluate(scroll => (Math.ceil((scroll.scrollLeft + scroll.clientWidth) / 20 / 32) + 1) * 32);
  if (63 < bufferedEnd) await page.locator('.gba-music-fx-cell[data-fx-row="63"]').waitFor();
  assert.equal(await page.locator('.gba-music-fx-cell[data-fx-row="63"]').count(), 63 < bufferedEnd ? 1 : 0, 'neighboring Fx are ready before entering the viewport');
  await page.locator('.gba-beat-scroll').evaluate(scroll => { scroll.scrollLeft = scroll.scrollWidth; });
  await page.locator('.gba-music-fx-cell[data-fx-row="63"]').waitFor();
  const viewportBounds = await page.locator('.gba-beat-scroll').evaluate(scroll => ({ start: Math.floor(scroll.scrollLeft / 20), end: Math.ceil((scroll.scrollLeft + scroll.clientWidth) / 20) }));
  const renderedRows = await page.locator('.gba-music-fx-cell').evaluateAll(cells => cells.map(cell => Number(cell.dataset.fxTimelineRow)));
  const bufferedStart = Math.max(0, (Math.floor(viewportBounds.start / 32) - 1) * 32);
  const bufferedLimit = (Math.ceil(viewportBounds.end / 32) + 1) * 32;
  assert.ok(renderedRows.every(row => row >= bufferedStart && row < bufferedLimit), 'Fx mounting stays within the bounded scroll buffer');
  assert.deepEqual(errors, []);
  await page.keyboard.press('2');
  const eraseNote = page.locator('button.gba-beat-note[data-note]').first();
  await eraseNote.scrollIntoViewIfNeeded();
  const eraseBounds = await eraseNote.boundingBox();
  const beforeErase = await page.evaluate(() => window.__fxProject.patterns[0].notes.length);
  // Click near the edge, with small hand jitter across the grid-cell boundary.
  await page.mouse.move(eraseBounds.x + 1, eraseBounds.y + 1);
  await page.mouse.down();
  assert.equal(await page.locator('.gba-roll-selection-box').count(), 0, 'Erase click does not open a selection rectangle');
  await page.mouse.move(eraseBounds.x - 1, eraseBounds.y + 1);
  assert.equal(await page.locator('.gba-roll-selection-box').count(), 0, 'small pointer jitter remains a click');
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__fxProject.patterns[0].notes.length), beforeErase - 1, 'Erase deletes the clicked note');
  const screenshot = path.join(os.tmpdir(), `gba-studio-fx-grid-${process.pid}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(`Fx grid browser check passed; screenshot: ${screenshot}`);
} finally {
  await browser.close();
}
console.log('Independent Fx insertion, pan inheritance, note edits, persistence, two-letter badges, lightweight indicators and browser configuration pass.');
