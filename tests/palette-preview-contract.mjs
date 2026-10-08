import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/paletteTransparency.ts', 'utf8');
assert.match(source, /quantizeGbaColor/);
assert.match(source, /Math\.round\(Math\.round\(value \* 31 \/ 255\) \* 255 \/ 31\)/);
assert.match(source, /\.map\(quantizeGbaColor\)/);
assert.match(source, /same slot/);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { quantizeGbaColor } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
assert.deepEqual(quantizeGbaColor({ red: 128, green: 64, blue: 250 }), { red: 132, green: 66, blue: 247 });
assert.deepEqual(quantizeGbaColor({ red: 0, green: 255, blue: 255 }), { red: 0, green: 255, blue: 255 });
console.log('Palette preview quantization contract passed.');
