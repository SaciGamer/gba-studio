import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const helperPath = path.resolve('src/renderer/frontend/src/utils/trackerMaxmodGbaVolume.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerMaxmodGbaMixerVolume, trackerMaxmodGbaOutputGain } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const playerSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerPreviewPlayer.ts'), 'utf8');
const masArm = fs.readFileSync(path.resolve('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas_arm.c'), 'utf8');
const mas = fs.readFileSync(path.resolve('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c'), 'utf8');
assert.match(playerSource, /trackerMaxmodGbaMixerVolume/);
assert.match(playerSource, /const maxmodMasterVolume = 1024;/);
assert.match(playerSource, /trackerMaxmodGbaOutputGain\(maxmodVoiceVolume, format\)/);
assert.match(playerSource, /trackerMaxmodGbaOutputGain\(mixerVolume, 'MOD'\)/);
assert.match(playerSource, /trackerMaxmodGbaMixerVolume\(\{[\s\S]*?channelBaseVolume,[\s\S]*?fade: maxmodMasterVolume,[\s\S]*?moduleVolume: maxmodMasterVolume/);
assert.match(masArm, /int volume = \(module_channel->volume \* module_channel->cvolume\) >> 5;/);
assert.match(masArm, /volume \+= vol_addition << 3;/);
assert.match(masArm, /if \(volume > 128\)\s+volume = 128;/);
assert.match(mas, /vol = sample->global_volume;/);
assert.match(mas, /vol \*= inst->global_volume;/);
assert.match(mas, /vol \*= mpp_vars\.afvol;/);
assert.match(mas, /global_volume <<= 1; \/\/ XM mode global volume is only 0->64, shift to 0->128/);
assert.match(mas, /vol = \(vol \* global_volume\) >> 10;[\s\S]*?vol = \(vol \* act_ch->fade\) >> 10;[\s\S]*?vol \*= layer->volume;[\s\S]*?vol = vol >> 19;[\s\S]*?if \(vol > 255\)/);
assert.match(mas, /mix_ch->vol = volume;/);

const fullScale = {
  sampleGlobalVolume: 64,
  instrumentGlobalVolume: 128,
  channelVolume: 64,
  channelBaseVolume: 64,
  moduleGlobalVolume: 128,
  xmGlobalVolume: false,
  fade: 1024,
  moduleVolume: 1024,
};
assert.equal(trackerMaxmodGbaMixerVolume(fullScale), 255, 'Maxmod clamps full-scale voices to the GBA mixer maximum');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, moduleGlobalVolume: 64, xmGlobalVolume: true }), 255, 'XM 0..64 global volume is shifted to the common 0..128 domain');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, sampleGlobalVolume: 32 }), 128, 'sample global volume scales the final integer mixer level');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, channelVolume: 48, volumeCommandDelta: -2 }), 160, 'channel scaling and signed volume commands follow MAS integer shifts');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, channelBaseVolume: 0 }), 0, 'zero channel volume is silent');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, channelVolume: 0, volumeCommandDelta: -1 }), 0, 'negative effective channel volume clamps to zero');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, fade: 512 }), 128, 'fade uses integer shift truncation');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, moduleGlobalVolume: 64, xmGlobalVolume: false }), 128, 'mmutil MOD defaults reach mixer volume 128 at full note volume');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, moduleGlobalVolume: 64, xmGlobalVolume: true }), 255, 'mmutil XM defaults reach the clamped mixer maximum');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, moduleGlobalVolume: 128, xmGlobalVolume: false }), 255, 'mmutil S3M defaults reach the clamped mixer maximum after global-volume doubling');
assert.equal(trackerMaxmodGbaMixerVolume({ ...fullScale, sampleGlobalVolume: 48, instrumentGlobalVolume: 96, channelVolume: 32, moduleGlobalVolume: 128, xmGlobalVolume: false }), 72, 'IT preserves independent sample, instrument and channel header volumes');
assert.equal(trackerMaxmodGbaOutputGain(128, 'MOD'), 1, 'MOD uses its native 0..128 mixer range as full scale');
assert.equal(trackerMaxmodGbaOutputGain(64, 'MOD'), 0.5, 'MOD half volume stays half-scale after normalization');
for (const format of ['XM', 'S3M', 'IT']) assert.equal(trackerMaxmodGbaOutputGain(255, format), 1, `${format} keeps its native 0..255 mixer range`);
assert.equal(trackerMaxmodGbaOutputGain(128, 'XM'), 128 / 255, 'XM normalization remains unchanged from its 0..255 scale');

console.log('Maxmod GBA voice volume: MAS integer stages and format-specific XM scaling verified.');
