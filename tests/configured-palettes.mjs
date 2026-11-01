import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const shared = ts.transpileModule(fs.readFileSync('src/shared/defaultPalettes.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sharedUrl = `data:text/javascript;base64,${Buffer.from(shared).toString('base64')}`;
const source = fs.readFileSync('src/renderer/frontend/src/components/resourceEditors/paletteLibrary.ts', 'utf8')
  .replaceAll('../../../../../shared/defaultPalettes', sharedUrl);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getConfiguredPalettes, getPaletteSlotOptions, loadPaletteLibrary, defaultPalettes } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.localStorage = { getItem: () => null };
assert.equal(loadPaletteLibrary().length, 8);
assert.ok(defaultPalettes.some(palette => palette.id === 'preset-nintendo'));
const palettes = ['a', 'b', 'c'].map(id => ({ id, name: id, colors: [] }));

assert.deepEqual(getConfiguredPalettes(palettes, undefined), []);
assert.deepEqual(getConfiguredPalettes(palettes, []), []);
assert.deepEqual(getConfiguredPalettes(palettes, [null, 'b', 'b', 'missing']), [palettes[1]]);
assert.deepEqual(getConfiguredPalettes(palettes, [...Array(15).fill(null), 'c', 'a']), [palettes[2]]);
assert.deepEqual(getConfiguredPalettes(palettes, ['a']), [palettes[0]]);
assert.deepEqual(getConfiguredPalettes(palettes, ['c']), [palettes[2]]);
assert.deepEqual(getPaletteSlotOptions(palettes, ['a', 'a', null, 'b']).map(palette => palette.id), ['__slot__:0', '__slot__:1', '__slot__:3']);
console.log('Configured palette selection passed.');
