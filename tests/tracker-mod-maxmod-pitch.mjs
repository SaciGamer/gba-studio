import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerModMaxmodPitch.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: () => ({ TRACKER_MAXMOD_GBA_MIX_RATE: 15_768 }),
};
vm.runInNewContext(compiled, context);
const {
  trackerModMaxmodBasePlaybackScale,
  trackerModMaxmodMixerStepQ12,
  trackerModMaxmodPlaybackRateScale,
} = context.exports;

// The open MOD trace captured Maxmod frequency 2,151 at the root A-3 note.
assert.equal(trackerModMaxmodMixerStepQ12(8_363, 49), 2_151);
assert.equal(trackerModMaxmodMixerStepQ12(8_363, 37), 1_075);
assert.equal(trackerModMaxmodMixerStepQ12(8_363, 61), 4_304);
assert.ok(trackerModMaxmodMixerStepQ12(8_363, 49, 4) > 2_151);
assert.ok(trackerModMaxmodMixerStepQ12(8_363, 49, -4) < 2_151);
assert.equal(trackerModMaxmodMixerStepQ12(Number.NaN, 49), 0);
assert.equal(trackerModMaxmodMixerStepQ12(8_363, Number.NaN), 0);
assert.equal(trackerModMaxmodPlaybackRateScale(8_363, 49), 1);
assert.equal(
  trackerModMaxmodPlaybackRateScale(8_363, 61),
  trackerModMaxmodMixerStepQ12(8_363, 61) / trackerModMaxmodMixerStepQ12(8_363, 49),
);
assert.equal(
  trackerModMaxmodBasePlaybackScale(8_363),
  (2_151 * 15_768) / (4_096 * 8_363),
);

console.log('MOD preview Q12 step matches the captured Maxmod root note and quantizes tuning/pitch.');
