import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: `
  export * from './src/renderer/frontend/src/utils/trackerComposition';
  export * from './src/renderer/frontend/src/utils/trackerCompositionExport';
  export * from './src/renderer/frontend/src/utils/trackerCompositionImport';
  export * from './src/renderer/frontend/src/utils/trackerModule';
  export * from './src/renderer/frontend/src/utils/trackerMixerState';
`, loader: 'ts', resolveDir: path.resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node' });
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const first = lib.createMusicCompositionWithStarterBank('XM');
const second = lib.createMusicCompositionWithStarterBank('XM');
const url = 'tracker-project://new-beat-1/new-beat-1.gbatracker';
const cache = new Map([[lib.trackerMixerStorageKey(url, first.id), { volumes: [0.2], muted: [true], pans: [-1] }]]);
assert.equal(cache.get(lib.trackerMixerStorageKey(url, second.id)), undefined, 'a new UUID at the same path must not inherit the previous mixer');
assert.ok(second.channels.every(channel => channel.volume === 1 && channel.pan === 0 && channel.muted === false));
assert.equal(lib.trackerMixerStorageKey('original.xm'), 'gba-studio-tracker-mixer:original.xm');

let composition = lib.editMusicCompositionNotes(first, 0, [{ start: 0, end: 48, pitch: 49, channelIndex: 0, instrumentIndex: 1 }]);
const bytes = lib.exportMusicComposition(composition, 'XM').moduleData;
const source = fs.readFileSync('src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx', 'utf8');
const ast = ts.createSourceFile('TrackerModuleViewer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'playMaxmodRomPreview') handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast);
const actions = [];
let romBytes;
const context = {
  moduleBytes: bytes, info: { format: 'XM' }, projectPackage: true, musicComposition: { current: composition },
  exportMusicComposition: lib.exportMusicComposition, mod: null, settings: {}, Uint8Array,
  trackerGeneration: { current: 0 }, trackerTimer: { current: 123 },
  trackerPreviewLoop: { current: false },
  trackerPlayer: { current: { stop: () => actions.push('stop-browser-player') } },
  stopSelectedNotePreview: () => actions.push('stop-note'), setTrackerPlaying: value => { assert.equal(value, false); actions.push('stop-ui'); },
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  window: { clearTimeout: () => actions.push('cancel-loop'), electronAPI: { playTrackerModulePreview: async encoded => {
    actions.push('launch-rom'); romBytes = Buffer.from(encoded, 'base64'); return { status: 'success' };
  } } },
};
vm.createContext(context);
vm.runInContext(ts.transpile(`var playMaxmodRomPreview = ${handler};`, { target: ts.ScriptTarget.ES2022 }), context);
await context.playMaxmodRomPreview();
assert.deepEqual(actions, ['cancel-loop', 'stop-browser-player', 'stop-note', 'stop-ui', 'launch-rom']);
assert.equal(context.trackerTimer.current, null);
assert.equal(context.trackerGeneration.current, 1);
assert.deepEqual(romBytes, Buffer.from(bytes), 'Play ROM must receive the canonical sample and loop data');
const sample = lib.parseXmSamples(bytes).get(1);
assert.equal(sample.loopStart, 1984);
assert.equal(sample.loopEnd, 2048);
assert.equal(sample.loopType, 1);
assert.equal(lib.parseXmPatternRows(bytes, 0, 64)[48][0].note, 97);
assert.equal(lib.parseXmPatternRows(bytes, 0, 64)[48][0].volume, 0x10,
  'a looping instrument without envelope/fadeout needs an explicit native volume cut at note-off');
let reimported = lib.importTrackerModuleComposition(bytes, 'long-note.xm');
reimported = lib.editMusicCompositionNotes(reimported, 0, [{ oldRow: 0, start: 0, end: 55, pitch: 49, channelIndex: 0, instrumentIndex: 1 }]);
const resized = lib.parseXmPatternRows(lib.exportMusicComposition(reimported, 'XM').moduleData, 0, 64);
assert.equal(resized[48][0].note, 0);
assert.equal(resized[48][0].volume, 0, 'resizing must remove the former note-off volume cut');
assert.equal(resized[55][0].volume, 0x10);
const withFadeout = { ...composition, instruments: composition.instruments.map(instrument => ({ ...instrument, fadeout: 256 })) };
assert.equal(lib.parseXmPatternRows(lib.exportMusicComposition(withFadeout, 'XM').moduleData, 0, 64)[48][0].volume, 0,
  'instruments with their own release must retain it');
console.log('Mixer UUID isolation, new-beat defaults, Play ROM audio handoff and XM sustain export passed.');

const mmutil = path.join(process.env.DEVKITPRO ?? '', 'tools', 'bin', process.platform === 'win32' ? 'mmutil.exe' : 'mmutil');
assert.ok(fs.existsSync(mmutil), 'DEVKITPRO must provide mmutil for the native sustain check');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-sustain-'));
try {
  const input = path.join(directory, 'duty-long-note.xm');
  const output = path.join(directory, 'soundbank.bin');
  fs.writeFileSync(input, new Uint8Array(lib.exportMusicComposition(composition, 'XM').moduleData));
  const result = spawnSync(mmutil, [input, `-o${output}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const bank = fs.readFileSync(output);
  const songOffset = bank.readUInt32LE(12 + bank.readUInt16LE(0) * 4);
  const header = songOffset + 8;
  const patternTable = header + 276 + (bank[header + 1] + bank[header + 2]) * 4;
  let cursor = header + bank.readUInt32LE(patternTable) + 1;
  const masks = new Uint8Array(32);
  const events = [];
  for (let row = 0; row <= 48; row += 1) {
    for (;;) {
      const byte = bank[cursor++];
      if (!(byte & 0x7f)) break;
      const channel = (byte & 0x7f) - 1;
      if (byte & 0x80) masks[channel] = bank[cursor++];
      const event = { row, channel, flags: masks[channel] >> 4 };
      if (masks[channel] & 1) event.note = bank[cursor++];
      if (masks[channel] & 2) event.instrument = bank[cursor++];
      if (masks[channel] & 4) event.volume = bank[cursor++];
      if (masks[channel] & 8) { event.effect = bank[cursor++]; event.parameter = bank[cursor++]; }
      events.push(event);
    }
  }
  assert.equal(events.filter(event => event.flags & 1).length, 1, 'native pattern must trigger the long note only once, without playing empty cells on any channel');
  assert.equal(events.find(event => event.row === 48 && event.channel === 0)?.volume, 0x10,
    'mmutil must pass the key-off volume cut to the native Maxmod pattern');
  const sampleOffset = bank.readUInt32LE(12);
  const length = bank.readUInt32LE(sampleOffset + 8);
  const loopLength = bank.readUInt32LE(sampleOffset + 12);
  assert.equal(length - loopLength, 1984, 'native loop must skip the attack');
  assert.ok(loopLength >= 64 && loopLength % 64 === 0, 'mmutil may repeat short loops without changing their cycles');
  const pcm = bank.subarray(sampleOffset + 20, sampleOffset + 20 + length);
  const cycle = pcm.subarray(length - loopLength, length - loopLength + 64);
  for (let offset = length - loopLength; offset < length; offset += 64) assert.deepEqual(pcm.subarray(offset, offset + 64), cycle,
    'every native sustain cycle must be identical, without restarting the attack envelope');
  const attackPeak = Math.max(...pcm.subarray(0, 64).map(value => Math.abs(value - 128)));
  const sustainPeak = Math.max(...cycle.map(value => Math.abs(value - 128)));
  assert.ok(attackPeak > sustainPeak * 2, 'the attack must occur before the stable sustain region');
  console.log(`Native mmutil sustain: attack ends at ${length - loopLength}, ${loopLength / 64} identical loop cycles passed.`);
} finally {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('gba-studio-sustain-'));
  fs.rmSync(directory, { recursive: true, force: true });
}
