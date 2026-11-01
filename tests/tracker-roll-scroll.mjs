import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve('src/renderer/frontend/src');
const load = async name => {
  const result = await build({ entryPoints: [path.join(root, 'utils', name)], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const tracker = await load('trackerModule.ts');
const mod = await load('modPlayer.ts');
const piano = await load('trackerPianoRollModel.ts');
const songs = [];
for (const filename of ['cyberrid.mod', 'galgox_snowheart_melody.xm']) {
  const data = fs.readFileSync(path.join('templateEngineGame/sample_project_example/assets/musics', filename));
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const format = path.extname(filename).slice(1).toUpperCase();
  const info = tracker.parseTrackerModule(bytes, format);
  const parsedMod = format === 'MOD' ? mod.parseModModule(bytes) : null;
  const order = parsedMod ? parsedMod.patternTable.slice(0, parsedMod.orders) : new Uint8Array(bytes).slice(80, 80 + info.orders);
  const patterns = parsedMod ? parsedMod.patterns.map(rows => rows.map(row => row.map(event => ({
    ...event, note: event.period ? piano.trackerPeriodToPitch(event.period) : 0, instrument: event.sample, volume: 0,
  })))) : Array.from({ length: info.patterns }, (_, index) => tracker.parseXmPatternRows(bytes, index, 256));
  const notes = [];
  let offset = 0;
  for (const index of order) {
    const rows = patterns[index];
    if (!rows) continue;
    rows.forEach((row, rowIndex) => {
      const event = row[0];
      if (event?.note >= 13 && event.note <= 96) notes.push({ row: offset + rowIndex, length: tracker.inferXmNoteLength(rows, rowIndex, 0, rows.length - rowIndex) });
    });
    offset += rows.length;
  }
  songs.push({ filename, notes, rows: offset });
}
assert.ok(songs.every(song => song.notes.length > 0));
const fixture = `
import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Layer from '@/components/resourceEditors/TrackerRollNoteLayer';
const songs = ${JSON.stringify(songs)};
function Fixture() {
  const scroll = useRef(null);
  const [index, setIndex] = useState(0);
  window.selectSong = setIndex;
  const song = songs[index];
  return <div ref={scroll} id="scroll" style={{width:800,height:200,overflow:'auto'}}>
    <div style={{position:'relative',width:song.rows*20,height:180}}>
      <Layer scrollRef={scroll} gridWidth={20}>{song.notes.map((note,i)=><button key={i} data-row={note.row}
        className="note" style={{position:'absolute',left:note.row*20+2,width:Math.max(16,note.length*20-4),top:20,height:20}}>N</button>)}</Layer>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
  platform: 'browser', format: 'iife', alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForSelector('.note');
  for (let index = 0; index < songs.length; index++) {
    await page.evaluate(index => window.selectSong(index), index);
    const song = songs[index];
    let maximumMounted = 0;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1, 0]) {
      await page.locator('#scroll').evaluate(async (scroll, fraction) => {
        scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * fraction;
        for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      }, fraction);
      const viewport = await page.locator('#scroll').evaluate(scroll => ({ start: scroll.scrollLeft / 20, end: (scroll.scrollLeft + scroll.clientWidth) / 20 }));
      const mounted = await page.locator('.note').evaluateAll(notes => notes.map(note => Number(note.dataset.row)));
      maximumMounted = Math.max(maximumMounted, mounted.length);
      for (const note of song.notes.filter(note => note.row < viewport.end && note.row + note.length > viewport.start)) {
        assert.ok(mounted.includes(note.row), `${song.filename}: visible and sustaining notes remain mounted`);
      }
      assert.ok(mounted.length < song.notes.length, `${song.filename}: distant notes are not mounted`);
    }
    console.log(`${song.filename}: ${song.notes.length} channel notes; at most ${maximumMounted} mounted during scroll.`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
