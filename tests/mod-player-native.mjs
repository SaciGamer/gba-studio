import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/renderer/frontend/src/utils/modPlayer.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { parseModModule, updateModEvent } = await import(moduleUrl);

const patternSize = 64 * 4 * 4;
const bytes = new Uint8Array(1084 + patternSize + 4);
const writeText = (offset, value, length) => bytes.set([...value].slice(0, length).map(character => character.charCodeAt(0)), offset);
writeText(0, 'native-test', 20);
writeText(1080, 'M.K.', 4);
bytes[950] = 1;
bytes[952] = 0;
// Sample 1: four unsigned 8-bit PCM bytes, volume 64.
bytes[20 + 22] = 0;
bytes[20 + 23] = 2;
bytes[20 + 25] = 64;
// Pattern 0, row 0, channel 0: sample 1, period 428, Cxx volume.
bytes[1084] = 0x01;
bytes[1085] = 0xac;
bytes[1086] = 0x1c;
bytes[1087] = 32;
bytes.set([128, 160, 192, 224], 1084 + patternSize);

const parsed = parseModModule(bytes.buffer);
assert.equal(parsed.channels, 4);
assert.equal(parsed.title, 'native-test');
assert.deepEqual(parsed.patterns[0][0][0], { period: 428, sample: 1, effect: 12, parameter: 32 });
const edited = updateModEvent(parsed, 0, 0, 0, { period: 300, effect: 9, parameter: 2 });
assert.equal(edited.patterns[0][0][0].period, 300);
assert.equal(edited.patterns[0][0][0].effect, 9);
assert.equal(edited.bytes[1084], 0x01);
assert.equal(edited.bytes[1085], 300 & 0xff);
assert.equal(edited.bytes[1086], 0x19);
assert.equal(edited.bytes[1087], 2);
assert.equal(parsed.bytes[1085], 0xac, 'editing must not mutate the source module');

console.log('MOD parser/editor native contract passed.');
