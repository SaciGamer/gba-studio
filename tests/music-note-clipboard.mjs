import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
let systemText = '';
let finishWrite;
globalThis.window = { electronAPI: {
  writeMusicNoteClipboard: text => new Promise(resolve => { finishWrite = () => { systemText = text; resolve(true); }; }),
  readMusicNoteClipboard: async () => systemText,
} };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const bundle = await build({ entryPoints: [path.resolve('src/renderer/frontend/src/utils/musicNoteClipboard.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const notes = { baseNote: 49, notes: [{ rowOffset: 0, noteDelta: 0, instrument: 1, length: 8 }, { rowOffset: 12, noteDelta: 7, instrument: 3, length: 4 }] };
api.copyMusicNotes(notes);
let resolved = false;
const reading = api.readMusicNotes().then(value => { resolved = true; return value; });
await Promise.resolve();
assert.equal(resolved, false, 'paste waits for a pending system clipboard write');
finishWrite();
assert.deepEqual(await reading, notes);
assert.equal(JSON.parse(systemText).kind, 'gba-studio/music-notes');
const validText = systemText;
assert.deepEqual(api.parseMusicNoteClipboard(validText), notes);
for (const text of ['plain text', '{}', JSON.stringify({ ...JSON.parse(validText), version: 2 }), JSON.stringify({ ...JSON.parse(validText), baseNote: 200 }),
  JSON.stringify({ ...JSON.parse(validText), notes: [{ rowOffset: -1, noteDelta: 0, instrument: 1, length: 4 }] }),
  JSON.stringify({ ...JSON.parse(validText), notes: [{ rowOffset: 0, noteDelta: 99, instrument: 1, length: 4 }] })]) assert.equal(api.parseMusicNoteClipboard(text), null);
systemText = 'copied from another app';
assert.equal(await api.readMusicNotes(), null, 'unrelated system text must not paste stale notes');
window.electronAPI.writeMusicNoteClipboard = async () => { throw new Error('unavailable'); };
window.electronAPI.readMusicNoteClipboard = async () => { throw new Error('unavailable'); };
api.copyMusicNotes(notes);
notes.notes[0].length = 20;
assert.equal((await api.readMusicNotes()).notes[0].length, 8, 'session fallback owns its copy and survives editor remounts');

// Exercise the real IPC handlers without touching the user's system clipboard.
const source = fs.readFileSync('src/main/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
const visit = node => {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle' && ts.isStringLiteral(node.arguments[0])
    && ['write-music-note-clipboard', 'read-music-note-clipboard'].includes(node.arguments[0].text)) handlers.set(node.arguments[0].text, node.arguments[1].getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast); assert.equal(handlers.size, 2);
let native = '';
const context = { clipboard: { writeText: value => { native = value; }, readText: () => native } };
vm.createContext(context);
for (const [channel, body] of handlers) {
  vm.runInContext(ts.transpile(`var handle = ${body}`, { target: ts.ScriptTarget.ES2022 }), context);
  if (channel.startsWith('write')) {
    assert.equal(context.handle({}, validText), true);
    assert.equal(context.handle({}, 42), false);
    assert.equal(context.handle({}, 'a'.repeat(2 * 1024 * 1024 + 1)), false);
  } else assert.equal(context.handle(), validText);
}
console.log('Music clipboard system round-trip, pending writes, validation, session fallback and Electron IPC pass.');
