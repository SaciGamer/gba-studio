import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
async function load(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const sfx = await load('src/shared/events/sfxGenerator.ts');
const events = await load('src/shared/events/generatedEventSound.ts');
const base = { ...sfx.defaultSfxParameters, fadeInMs: 0, fadeOutMs: 0 };
const sine = sfx.generateSfx({ ...base, waveform: 'sine' });
const custom = sfx.generateSfx({ ...base, waveform: 'custom' });
assert.deepEqual(custom.pcm, sine.pcm, 'default Custom is a fundamental sine');
const mix = sfx.generateSfx({ ...base, waveform: 'custom', harmonics: [100, 60, 30, 15, 10, 5] });
assert.notDeepEqual(mix.pcm, sine.pcm);
assert.ok(mix.pcm.every(value => Number.isFinite(value) && Math.abs(value) <= 0.85));
assert.deepEqual(sfx.generateSfx(JSON.parse(JSON.stringify(mix.parameters))).pcm, mix.pcm, 'custom harmonics survive serialization');
assert.equal(sfx.generateSfx({ ...base, waveform: 'custom', harmonics: [0, 0, 0, 0, 0, 0] }).peak, 0);
assert.equal(sfx.generateSfx({ ...base, waveform: 'custom', frequency: 8000, harmonics: [0, 100, 100, 100, 100, 100] }).peak, 0, 'partials above Nyquist are omitted');
assert.equal(sfx.generateSfx({ ...base, waveform: 'custom', frequency: 2000, harmonics: [0, 0, 0, 100, 0, 0] }).peak, 0, '8000 Hz partial is omitted even though it fits inside the WAV Nyquist range');
function amplitude(pcm, frequency, rate) {
  let real = 0, imaginary = 0;
  for (let index = 0; index < pcm.length; index++) {
    const angle = index * 2 * Math.PI * frequency / rate;
    real += pcm[index] * Math.cos(angle); imaginary += pcm[index] * Math.sin(angle);
  }
  return Math.hypot(real, imaginary) * 2 / pcm.length;
}
for (const waveform of ['square', 'sawtooth', 'triangle']) {
  const generated = sfx.generateSfx({ ...base, waveform, frequency: 3000, durationMs: 200 });
  assert.ok(amplitude(generated.pcm, 3000, 22050) > 0.2);
  assert.ok(amplitude(generated.pcm, 9000, 22050) < 0.001, `${waveform} omits the third harmonic above the GBA output range`);
}
const triangle = sfx.generateSfx({ ...base, waveform: 'triangle' });
assert.notDeepEqual(triangle.pcm, sine.pcm);
assert.ok(triangle.peak > 0.8 && triangle.peak <= 0.85);
for (const generated of [mix, triangle]) {
  const args = { sfxParameters: JSON.stringify(generated.parameters) };
  assert.deepEqual(events.generateEventSoundSamples(args), generated.pcm, 'event audio is the same PCM as the editor');
  const wav = new DataView(sfx.encodePcm16Wav(generated.pcm, generated.parameters.sampleRate));
  for (let index = 0; index < generated.pcm.length; index++) assert.equal(wav.getInt16(44 + index * 2, true), Math.round(generated.pcm[index] * 32767));
}
for (const harmonics of [[1], [100, 0, 0, 0, 0, 101], [100, 0, 0, 0, 0, null], 'invalid']) {
  assert.equal(sfx.isSfxHarmonics(harmonics), false);
  assert.throws(() => events.normalizeGeneratedSoundParameters({ sfxParameters: JSON.stringify({ ...base, waveform: 'custom', harmonics }) }), /Invalid event SFX/);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-custom-build-'));
try {
  const sourceDirectory = path.join(temporary, 'sounds');
  const audioDirectory = path.join(temporary, 'audio');
  fs.mkdirSync(sourceDirectory);
  const builder = new ResourceBuilder(temporary, path.resolve('tools/butano/template'));
  for (const generated of [mix, triangle]) {
    fs.writeFileSync(path.join(sourceDirectory, 'custom.gbasfx'), JSON.stringify({ schema: 'gba-studio/sfx', version: 1, name: 'custom', parameters: generated.parameters }));
    const resources = [{ jsonContent: { _resourceType: 'scene', script: [{ command: 'EVENT_PLAY_SOUND', args: { soundSource: 'project', soundId: 'custom' } }] } }];
    assert.equal(builder.prepareProjectSfxSounds(resources, sourceDirectory, audioDirectory), 1);
    const output = fs.readdirSync(audioDirectory).filter(file => file.endsWith('.wav'));
    assert.equal(output.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(audioDirectory, output[0])), Buffer.from(sfx.encodePcm16Wav(generated.pcm, generated.parameters.sampleRate)), 'project build preserves the custom waveform PCM');
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log('Triangle and Custom: harmonic mixing, amplitude, Nyquist, serialization, validation, WAV and event PCM passed.');
