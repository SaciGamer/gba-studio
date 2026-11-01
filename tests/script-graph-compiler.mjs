import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'main', 'utils', 'events', 'ScriptGraphCompiler.ts'), 'utf8');
assert.match(source, /export function compileScriptGraph/);
assert.match(source, /entry node does not exist/);
assert.match(source, /references a missing node/);
assert.match(source, /Script graph cycle/);
assert.match(source, /Duplicate script graph handle/);
assert.match(source, /compileScriptGraphWithSourceMap/);
assert.match(source, /sourceMap: new Map/);
console.log('Script graph compiler guard passed.');
