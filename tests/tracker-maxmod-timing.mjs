import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerMaxmodTiming.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { maxmodGbaMixRateHz, maxmodGbaTickDurationSeconds, maxmodGbaTickSamples16Khz } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.equal(maxmodGbaMixRateHz, 15_768);
assert.equal(maxmodGbaTickSamples16Khz(125), 314, 'Maxmod rounds the sample count down to even');
assert.equal(maxmodGbaTickSamples16Khz(115), 342);
assert.equal(maxmodGbaTickSamples16Khz(200), 196);
assert.equal(maxmodGbaTickSamples16Khz(1), maxmodGbaTickSamples16Khz(32), 'BPM is clamped to Maxmod’s supported minimum');
assert.equal(maxmodGbaTickSamples16Khz(300), maxmodGbaTickSamples16Khz(255), 'BPM is clamped to the S3M/Maxmod maximum');
assert.ok(maxmodGbaTickDurationSeconds(125) < 2.5 / 125, 'The GBA tick is shorter than the idealized tracker tick after Maxmod quantization');
assert.ok(Math.abs(maxmodGbaTickDurationSeconds(125) * 192 - 3.82344) < 0.001, '32 rows at speed 6 use 192 quantized Maxmod ticks');

console.log('Maxmod GBA timing: 16 kHz mixing timer quantization and tempo bounds verified.');
