import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerS3mMaxmodPitch.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const scale = context.exports.trackerS3mMaxmodPlaybackRateScale;
const step = context.exports.trackerS3mMaxmodMixerStepQ12;
const stepFromPeriod = context.exports.trackerS3mMaxmodMixerStepQ12FromPeriod;
const amigaPeriod = context.exports.trackerS3mMaxmodAmigaPeriod;
const slidePeriod = context.exports.trackerS3mMaxmodSlidePeriod;
const slidePeriods = context.exports.trackerS3mMaxmodSlidePeriods;

assert.equal(step(16_777, 49), 4_319);
assert.equal(step(16_726, 49), 4_305);
assert.equal(scale(16_726, 49, 49), (4_305 * 15_768 / 4_096) / 16_726);
assert.equal(scale(16_777, 49, 49), (4_319 * 15_768 / 4_096) / 16_777);
assert.ok(Math.abs(scale(8_388, 61, 49) / scale(16_777, 49, 49) - 1) < 0.001);
assert.ok(Math.abs(scale(8_360, 49, 49) / scale(16_724, 37, 49) - 1) < 0.001);
assert.equal(scale(Number.NaN, 49, 49), 1);
assert.equal(scale(16_726, Number.NaN, 49), 1);
assert.equal(amigaPeriod(8_363, 49), Math.floor(((1_712 * 8 * 133_808) >> Math.floor((49 + 11) / 12)) / (Math.floor(8_363 / 4) * 4)));
assert.equal(stepFromPeriod(amigaPeriod(8_363, 49)), step(8_363, 49));
assert.deepEqual(Array.from(slidePeriods(amigaPeriod(8_363, 49), 6, 0x02, 4), stepFromPeriod), [2_151, 2_162, 2_172, 2_182], 'S3M slides update mixer rate directly from MAS period, preserving sub-semitone changes');
assert.equal(slidePeriod(1_000, 6, 0x02), 968, 'Maxmod regular F02 subtracts 2 << 4 from the MAS period');
assert.equal(slidePeriod(1_000, 5, 0x02), 1_032, 'Maxmod regular E02 adds 2 << 4 to the MAS period');
assert.equal(slidePeriod(1_000, 6, 0xf2), 992, 'Maxmod fine F2 subtracts 2 << 2 once on tick zero');
assert.equal(slidePeriod(1_000, 5, 0xe2), 1_008, 'Maxmod extra-fine E2 adds 2 << 2 once on tick zero');
assert.equal(slidePeriod(1_000, 6, 0x00), 1_000, 'a zero slide retains the previous period');
assert.deepEqual(Array.from(slidePeriods(1_000, 6, 0x02, 4)), [1_000, 968, 936, 904], 'regular F02 skips tick 0 and updates on each later tick');
assert.deepEqual(Array.from(slidePeriods(1_000, 6, 0xf2, 4)), [992, 992, 992, 992], 'fine F2 updates only on tick 0');
assert.deepEqual(Array.from(slidePeriods(1_000, 5, 0xe2, 0)), [], 'a zero-tick row has no slide updates');

console.log('S3M preview pitch, E/F period increments and tick scheduling follow Maxmod MAS behavior.');
