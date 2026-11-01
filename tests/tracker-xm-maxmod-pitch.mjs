import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerXmMaxmodPitch.ts', 'utf8');
const maxmodSource = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas_arm.c', 'utf8');
const maxmodCore = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c', 'utf8');
const tremorSource = fs.readFileSync('src/renderer/frontend/src/utils/trackerXmOldTremor.ts', 'utf8');
const tableBody = maxmodSource.match(/IT_PitchTable\[\]\s*=\s*\{([^}]+)\}/)?.[1];
assert.ok(tableBody, 'the Maxmod XM linear pitch table is available for the parity contract');
const tableValues = tableBody.replace(/\/\/[^\n]*/g, '').match(/\d+/g).map(Number);
assert.equal(tableValues.length, 240, 'Maxmod stores 120 32-bit pitch values as low/high halfword pairs');
for (let note = 0; note < 120; note += 1) {
  const sourceValue = (tableValues[note * 2 + 1] * 65_536) + tableValues[note * 2];
  assert.equal(Math.round(2_048 * 2 ** (note / 12)), sourceValue, `linear formula must match Maxmod pitch-table note ${note}`);
}
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: () => ({ TRACKER_MAXMOD_GBA_MIX_RATE: 15_768 }),
  Math,
};
vm.runInNewContext(compiled, context);
const step = context.exports.trackerXmMaxmodMixerStepQ12;
const scale = context.exports.trackerXmMaxmodPlaybackRateScale;
const baseScale = context.exports.trackerXmMaxmodBasePlaybackScale;
const arpeggioPitch = context.exports.trackerXmArpeggioPitchAtTick;
const tremorCompiled = ts.transpileModule(tremorSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tremorContext = { exports: {} };
vm.runInNewContext(tremorCompiled, tremorContext);
const { createTrackerXmOldTremorState, trackerXmOldTremorParameterAt, trackerXmOldTremorTick } = tremorContext.exports;

assert.equal(step(8_363, 48), 2_171, 'XM C-4 uses the source C5 speed in the 15,768 Hz Q12 mixer');
assert.equal(step(8_363, 60), 4_343, 'one octave above XM C-4 doubles the sample rate before Q12 quantization');
assert.equal(scale(8_363, 48, 48), 1);
assert.equal(scale(8_363, 60, 48), 4_343 / 2_171);
assert.notEqual(step(8_363, 48.5), step(8_363, 48), 'fractional XM fine tuning adjusts Maxmod quarter-unit sample speed');
assert.deepEqual(Array.from({ length: 6 }, (_, tick) => arpeggioPitch(48, 0x7c, tick)), [48, 55, 60, 48, 55, 60]);
assert.deepEqual(Array.from({ length: 6 }, (_, tick) => arpeggioPitch(48, 0x77, tick)), [48, 55, 55, 48, 55, 55]);
assert.ok(Math.abs(baseScale(8_363) - (2_171 * 15_768) / (4_096 * 8_363)) < 1e-12);
assert.equal(step(Number.NaN, 48), 0);
assert.equal(scale(8_363, Number.NaN), 1);
assert.match(maxmodCore, /MPP_XM_TREMOR,\s*\/\/ 3 \[30\] \(T\): Tremor/, 'Maxmod maps XM Txy to its legacy tremor handler');
assert.match(maxmodCore, /case 30:[\s\S]*?mppe_OldTremor\(param, channel, layer\);/);
assert.equal(trackerXmOldTremorParameterAt(0, 0x21), 0x21, 'XM Txy remembers non-zero tremor parameters');
assert.equal(trackerXmOldTremorParameterAt(0x21, 0), 0x21, 'XM T00 reuses Maxmod tremor parameter memory');
const cuts = [];
let state = createTrackerXmOldTremorState();
for (let tick = 0; tick < 6; tick += 1) {
  const result = trackerXmOldTremorTick(state, 0x21, tick);
  state = result.state;
  cuts.push(result.cutVolume);
}
assert.deepEqual(cuts, [false, true, false, true, false, true], 'Maxmod XM Txy leaves tick 0 alone, cuts on the first active tick, then alternates');
const maxmodExtendedHandler = maxmodCore.match(/static void mppe_Extended\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodExtendedPanSetter = maxmodCore.match(/static void mppex_SetPanning\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodExtendedHandler && maxmodExtendedPanSetter, 'Maxmod defines the XM extended-effect dispatcher and S8x pan setter');
assert.match(maxmodExtendedHandler, /case 0x8:\s*\/\/ S8x[\s\S]*?mppex_SetPanning\(param, channel\);/,
  'Maxmod routes XM E8x through its S8x extended-pan handler');
assert.match(maxmodExtendedPanSetter, /channel->panning = param << 4;/,
  'Maxmod stores the E8x nibble in the high pan nibble');const playerSource = fs.readFileSync('src/renderer/frontend/src/utils/trackerPreviewPlayer.ts', 'utf8');
assert.match(playerSource, /format === 'XM' && effect === 0x14[\s\S]*?trackerXmOldTremorTick/);assert.match(playerSource, /const trackerPanningNibbleToNormalized = \(nibble: number\) => Math\.max\(-1, Math\.min\(1, \(nibble & 0x0f\) \/ 8 - 1\)\)/,
  'XM E8x Preview maps every pan nibble to its normalized endpoint');
assert.match(playerSource, /format === 'XM' && effect === 0x0e && \(parameter >> 4\) === 0x08[\s\S]*?trackerPanningNibbleToNormalized\(panNibble\)[\s\S]*?activePanner\.pan\.setValueAtTime/,
  'XM E8x updates the active Preview pan at the row boundary');

console.log('XM pitch, Txy tremor, and E8x panning follow Maxmod GBA source contracts.');
