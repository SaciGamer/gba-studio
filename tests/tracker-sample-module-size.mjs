import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSampleEstimate.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateTrackerSampleModuleSize } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.deepEqual(estimateTrackerSampleModuleSize('MOD', 1200, 4, 3), { beforeBytes: 1200, afterBytes: 1200, deltaBytes: 0 }, 'MOD replacement pads odd PCM to a word without changing this file size');
assert.deepEqual(estimateTrackerSampleModuleSize('MOD', 1200, 4, 5), { beforeBytes: 1200, afterBytes: 1202, deltaBytes: 2 }, 'MOD replacement includes its even-byte padding');
assert.deepEqual(estimateTrackerSampleModuleSize('XM', 2048, 512, 120), { beforeBytes: 2048, afterBytes: 1656, deltaBytes: -392 }, 'XM replacement removes the old sample payload before inserting the new payload');
assert.deepEqual(estimateTrackerSampleModuleSize('S3M', 521, 4, 120), { beforeBytes: 521, afterBytes: 648, deltaBytes: 127 }, 'S3M replacement includes the paragraph alignment gap and appended payload');
assert.deepEqual(estimateTrackerSampleModuleSize('IT', 521, 4, 120), { beforeBytes: 521, afterBytes: 644, deltaBytes: 123 }, 'IT sample-mode replacement includes four-byte alignment and appended payload');
assert.deepEqual(estimateTrackerSampleModuleSize('IT', 521, 4, 120, true), { beforeBytes: 521, afterBytes: 728, deltaBytes: 207 }, 'IT instrument-mode replacement includes the relocated pointer, sample header, alignment, and payload');
assert.equal(estimateTrackerSampleModuleSize('MOD', 1200, 4, 131_071), null, 'oversized PCM has no writable output-size estimate');
assert.equal(estimateTrackerSampleModuleSize('XM', 100, 101, 2), null, 'an invalid replaced sample size cannot produce a file estimate');
assert.equal(estimateTrackerSampleModuleSize('S3M', 100, 0, 0), null, 'an empty take cannot produce a file estimate');

console.log('Tracker sample module-size estimates passed for MOD, XM, S3M, IT sample mode, and IT instrument mode.');
