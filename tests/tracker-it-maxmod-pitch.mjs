import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerItMaxmodPitch.ts', 'utf8');
const masArm = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas_arm.c', 'utf8');
const masCore = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c', 'utf8');
const channelTypes = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/channel_types.h', 'utf8');
const mixer = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/gba/mixer_asm.s', 'utf8');
const pitchTableBody = masArm.match(/IT_PitchTable\[\]\s*=\s*\{([^}]+)\}/)?.[1];
assert.ok(pitchTableBody, 'the IT linear pitch table is present in the checked-in Maxmod core');
const pitchTable = pitchTableBody.replace(/\/\/[^\n]*/g, '').match(/\d+/g).map(Number);
assert.equal(pitchTable.length, 240);
const amigaPeriodBody = masArm.match(/ST3_FREQTABLE\[\]\s*=\s*\{([^}]+)\}/)?.[1];
assert.ok(amigaPeriodBody, 'the Maxmod Amiga period table is present in the checked-in core');
const amigaPeriodTable = Array.from(amigaPeriodBody.replace(/\/\/[^\n]*/g, '').matchAll(/(\d+)\s*\*\s*8/g), match => Number(match[1]) * 8).slice(0, 12);
const fineSineBody = masCore.match(/mpp_TABLE_FineSineData\[\]\s*=\s*\{([^}]+)\}/)?.[1];
assert.ok(fineSineBody, 'Maxmod fine vibrato sine table is present in the checked-in core');
const fineSineTable = fineSineBody.replace(/\/\/[^\n]*/g, '').match(/-?\d+/g).map(Number);
const multiplier = Number(masArm.match(/#define MULT_PERIOD\s+(\d+)/)?.[1]);
assert.equal(amigaPeriodTable.length, 12);
assert.equal(multiplier, 133_808);
for (let note = 0; note < 120; note += 1) {
  const tableValue = pitchTable[note * 2] + pitchTable[note * 2 + 1] * 65_536;
  assert.equal(tableValue, Math.round(2_048 * 2 ** (note / 12)), `IT note ${note} matches the Maxmod linear pitch table`);
}
assert.match(masCore, /mm_hword speed = sample->frequency; \/\/ Get C5SPEED/);
assert.match(masCore, /\(\(period >> 8\) \* \(speed << 2\)\) >> 8/);
assert.match(channelTypes, /#define MP_SAMPFRAC\s+12/);
assert.match(mixer, /ldrb\s+rsampa, \[rsrc, rread, lsr #MP_SAMPFRAC\]/, 'Maxmod uses a nearest-neighbor sample read');

const itVibratoBody = masCore.match(/static mm_word mppe_Vibrato\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const itVibratoVolumeBody = masCore.match(/static mm_word mppe_VibratoVolume\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(itVibratoBody && itVibratoVolumeBody, 'Maxmod defines the IT Hxy and Kxy handlers');
assert.match(itVibratoBody, /if \(layer->tick != 0\)\s*return mppe_DoVibrato\(period, channel, layer\);[\s\S]*?mm_word x = param >> 4;[\s\S]*?mm_word y = param & 0xF;[\s\S]*?channel->vibspd = x \* 4;[\s\S]*?mm_word depth = y \* 4;[\s\S]*?channel->vibdep = depth << layer->oldeffects;[\s\S]*?return mppe_DoVibrato\(period, channel, layer\);/,
  'IT Hxy stores nonzero speed/depth in Maxmod units and applies the current tick through the core vibrato routine');
assert.match(itVibratoVolumeBody, /mppe_DoVibrato\(period, channel, layer\)[\s\S]*?mppe_VolumeSlide\(param, channel, layer\)/,
  'IT Kxy combines the remembered Maxmod vibrato state with the standard volume-slide routine');
assert.match(masCore, /case 8:\s*return mppe_Vibrato\(param, period, channel, layer\);[\s\S]*?case 11:\s*return mppe_VibratoVolume\(param, period, channel, layer\);/,
  'Maxmod dispatches IT Hxy and Kxy to the audited handlers');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: () => ({ TRACKER_MAXMOD_GBA_MIX_RATE: 15_768 }),
  Math,
};
vm.runInNewContext(compiled, context);
const step = context.exports.trackerItMaxmodMixerStepQ12;
const scale = context.exports.trackerItMaxmodPlaybackRateScale;
const amigaPeriod = context.exports.trackerItMaxmodAmigaPeriod;
const fineSineAt = context.exports.trackerItMaxmodFineSineAt;
const fineVibratoPitch = context.exports.trackerItMaxmodFineVibratoPitch;
const tremoloVolumeAt = context.exports.trackerItMaxmodTremoloVolumeAt;

const expectedAmigaPeriod = (sampleRate, pitch, rootNote) => {
  const note = Math.max(0, Math.min(119, Math.floor(pitch - 1)));
  const c5Speed = Math.max(1, Math.min(9_999_999, Math.round(sampleRate * 2 ** ((61 - rootNote) / 12))));
  const tuning = Math.floor(c5Speed / 4) * 4;
  if (!tuning) return 0;
  const numerator = Math.floor((amigaPeriodTable[note % 12] * multiplier) / (2 ** Math.floor(note / 12)));
  return Math.floor(numerator / tuning);
};
assert.equal(fineSineTable.length, 256, 'Maxmod IT vibrato uses a 256-step sine table');
assert.match(masCore, /mm_word depth = y \* 4;[\s\S]*?channel->vibdep = depth << layer->oldeffects;/);
assert.match(masCore, /value = \(value \* depth\) >> 8;/);
assert.match(masCore, /mm_word delta = slide_value << 4;/);
const tremoloBody = masCore.match(/static void mppe_Tremolo\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(tremoloBody, 'the checked-in Maxmod core contains its Rxy tremolo routine');
assert.match(tremoloBody, /position \+= speed \* 4;[\s\S]*?sine = mpp_TABLE_FineSineData\[position\];[\s\S]*?\(sine \* depth\) >> 6;[\s\S]*?result >>= 1;[\s\S]*?mpp_vars\.volplus = result;/,
  'Maxmod advances Rxy by speed * 4, uses signed fixed-point sine addition, and halves only XM tremolo');
for (let phase = 0; phase < 256; phase += 1) {
  assert.equal(fineSineAt(phase), fineSineTable[phase], `IT fine vibrato phase ${phase} matches the Maxmod table`);
  for (const volume of [0, 1, 32, 64, 127, 128]) {
    for (const depth of [1, 4, 8, 15]) {
      const addition = (fineSineTable[phase] * depth) >> 6;
      const expectedVolume = Math.max(0, Math.min(128, volume + (addition << 3)));
      assert.equal(tremoloVolumeAt(volume, phase, depth), expectedVolume,
        `IT Rxy phase ${phase}, depth ${depth}, volume ${volume} follows Maxmod volplus`);
    }
  }
}

const mixerScale = Math.floor((4096 * 65_536) / 15_768);
const expectedStep = (sampleRate, pitch) => {
  const itNote = Math.max(0, Math.min(119, pitch - 1));
  const period = Math.round(2_048 * 2 ** (itNote / 12));
  const masFrequency = Math.floor(sampleRate / 4);
  const maxmodFrequency = Math.imul(Math.floor(period / 256), masFrequency * 4) >>> 8;
  return Math.imul(mixerScale, maxmodFrequency) >>> 16;
};
for (const sampleRate of [4_000, 8_363, 11_025, 22_050, 44_100]) {
  for (let pitch = 1; pitch <= 120; pitch += 1) {
    assert.equal(step(sampleRate, pitch), expectedStep(sampleRate, pitch), `IT rate follows Maxmod for sample ${sampleRate} Hz, pitch ${pitch}`);
    for (const rootNote of [49, 61, 73]) {
      assert.equal(amigaPeriod(sampleRate, pitch, rootNote), expectedAmigaPeriod(sampleRate, pitch, rootNote), `IT E/F period follows Maxmod for sample ${sampleRate} Hz, pitch ${pitch}, root ${rootNote}`);
      for (const depth of [1, 4, 8, 15]) {
        for (let phase = 0; phase < 256; phase += 17) {
          const sine = fineSineTable[phase];
          const slideValue = Math.floor((sine * depth * 4) / 256);
          const period = expectedAmigaPeriod(sampleRate, pitch, rootNote);
          if (period > 32_768) continue;
          const shiftedPeriod = slideValue > 0 ? period - (slideValue << 4) : period + ((-slideValue) << 4);
          if (shiftedPeriod <= 0) continue;
          const expectedPitch = pitch + 12 * Math.log2(period / shiftedPeriod);
          assert.ok(Math.abs(fineVibratoPitch(sampleRate, pitch, rootNote, phase * 2 * Math.PI / 256, depth) - expectedPitch) < 1e-10,
            `IT Uxy period vibrato follows Maxmod for sample ${sampleRate} Hz, pitch ${pitch}, root ${rootNote}, depth ${depth}, phase ${phase}`);
        }
      }
    }
  }
}
assert.equal(step(11_025, 61), expectedStep(11_025, 61));
assert.ok(Math.abs(scale(11_025, 61, 61) - 1) < 0.001, 'the C5 reference note stays at unity rate');
assert.ok(Math.abs(scale(11_025, 73, 61) - 1) < 0.001, 'octave transposition keeps the same semitone rate after Q12 quantization');
assert.equal(step(1, 61), 0);
assert.equal(step(131_072, 61), 0);
assert.equal(scale(Number.NaN, 61), 1);
assert.equal(amigaPeriod(1, 61), 0);
const e2Period = amigaPeriod(8_363, 49, 49);
const f02Period = e2Period - (5 * (0x02 << 4));
assert.ok(Math.abs(12 * Math.log2(e2Period / f02Period) - 0.4093) < 0.002, 'five Maxmod F02 ticks reproduce the captured ~0.41 semitone rise at the canonical root pitch');

console.log('IT preview pitch, Amiga E/F slides, Amiga-period Uxy vibrato, and nearest-neighbor sample step follow the checked-in Maxmod core.');
