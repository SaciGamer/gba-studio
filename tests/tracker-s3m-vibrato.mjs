import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerS3mVibrato.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { s3mVibratoPeriodOffset, s3mVibratoSemitoneOffset } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.equal(s3mVibratoPeriodOffset(0, 60), 0, 'zero phase leaves the tracker period unchanged');
assert.equal(s3mVibratoPeriodOffset(64, 60), 15, 'quarter-cycle uses Maxmod fixed-point depth scaling');
assert.equal(s3mVibratoPeriodOffset(192, 60), -15, 'negative sine follows Maxmod arithmetic-shift rounding');
assert.ok(Math.abs(s3mVibratoSemitoneOffset(49, 8363, 64, 60) - 2.612) < 0.01, 'period decrease converts to the expected pitch-up offset');
assert.ok(Math.abs(s3mVibratoSemitoneOffset(49, 8363, 192, 60) + 2.271) < 0.01, 'period increase converts to the expected pitch-down offset');
assert.ok(Math.abs(s3mVibratoSemitoneOffset(49, 16726, 64, 60)) > Math.abs(s3mVibratoSemitoneOffset(49, 8363, 64, 60)), 'sample C5 speed scales the period-based vibrato depth');
console.log('S3M Maxmod vibrato math contract passed.');
