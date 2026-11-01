import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gba-sfx-unit-'));
try {
  const output = path.join(temp, 'sfxGenerator.mjs');
  await build({ entryPoints: [path.join(root, 'src/renderer/frontend/src/utils/sfxGenerator.ts')], bundle: true, format: 'esm', platform: 'node', outfile: output });
  const { generateSfx, encodePcm16Wav, defaultSfxParameters } = await import(pathToFileURL(output).href);
  const sine = generateSfx({ ...defaultSfxParameters, waveform: 'sine', durationMs: 200, fadeInMs: 25, fadeOutMs: 100, volume: 60, seed: 7 });
  assert.equal(sine.pcm.length, 4410);
  assert.ok(sine.peak > 0.45 && sine.peak <= 0.51, 'volume should scale peak amplitude while respecting the 0.85 output ceiling');
  assert.ok(sine.rms > 0.2);
  assert.equal(sine.pcm[0], 0, 'fade-in should begin at silence');
  assert.equal(sine.pcm.at(-1), 0, 'fade-out should reach digital silence at the end');
  const fullVolume = generateSfx({ ...defaultSfxParameters, waveform: 'sine', durationMs: 200, fadeInMs: 0, fadeOutMs: 0, volume: 100, seed: 7 });
  const halfVolume = generateSfx({ ...defaultSfxParameters, waveform: 'sine', durationMs: 200, fadeInMs: 0, fadeOutMs: 0, volume: 50, seed: 7 });
  assert.ok(Math.abs(halfVolume.pcm[10] / fullVolume.pcm[10] - 0.5) < 0.001, 'volume control should scale the exported PCM by its percentage');
  assert.ok(sine.pcm.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.85), 'PCM should be finite and remain below its output ceiling');
  const seededNoise = generateSfx({ ...defaultSfxParameters, waveform: 'noise', seed: 19 });
  assert.deepEqual(seededNoise.pcm, generateSfx({ ...defaultSfxParameters, waveform: 'noise', seed: seededNoise.parameters.seed }).pcm, 'noise should be repeatable after saving and reopening its seed');
  assert.notDeepEqual(generateSfx({ ...defaultSfxParameters, waveform: 'noise', seed: 19 }).pcm, generateSfx({ ...defaultSfxParameters, waveform: 'noise', seed: 20 }).pcm);
  for (const waveform of ['square', 'sine', 'sawtooth', 'noise']) {
    const generated = generateSfx({ ...defaultSfxParameters, waveform });
    assert.ok(generated.pcm.length > 0 && generated.peak > 0, `${waveform} should produce audible PCM`);
    const wav = new DataView(encodePcm16Wav(generated.pcm, generated.parameters.sampleRate));
    assert.equal(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...new Uint8Array(wav.buffer, 8, 4)), 'WAVE');
    assert.equal(wav.getUint32(40, true), generated.pcm.length * 2);
    const pcmView = new DataView(wav.buffer);
    for (let index = 0; index < Math.min(64, generated.pcm.length); index += 1) {
      assert.equal(pcmView.getInt16(44 + index * 2, true), Math.round(generated.pcm[index] * 32767), `${waveform} preview PCM should quantize exactly to the saved WAV`);
    }
  }
  const bounded = generateSfx({ ...defaultSfxParameters, durationMs: Number.NaN, fadeInMs: Number.POSITIVE_INFINITY, fadeOutMs: Number.POSITIVE_INFINITY, volume: Number.NaN, sampleRate: Number.NaN, seed: Number.NaN });
  assert.equal(bounded.parameters.durationMs, defaultSfxParameters.durationMs, 'invalid duration should fall back to the product default');
  assert.equal(bounded.parameters.fadeInMs, defaultSfxParameters.fadeInMs, 'invalid fade-in should fall back to the product default');
  assert.equal(bounded.parameters.fadeOutMs, defaultSfxParameters.fadeOutMs, 'invalid fade should fall back to the product default');
  assert.equal(bounded.parameters.volume, defaultSfxParameters.volume, 'invalid volume should fall back to the product default');
  assert.equal(bounded.parameters.sampleRate, defaultSfxParameters.sampleRate, 'invalid sample rate should fall back to the product default');
  assert.ok(bounded.pcm.every(Number.isFinite), 'invalid inputs must never produce NaN/Inf samples');
  assert.equal(generateSfx({ ...defaultSfxParameters, durationMs: 100, fadeOutMs: 500 }).parameters.fadeOutMs, 100, 'fade is clamped to effect duration');
  assert.equal(generateSfx({ ...defaultSfxParameters, durationMs: 100, fadeInMs: 500 }).parameters.fadeInMs, 100, 'fade-in is clamped to effect duration');
  assert.equal(generateSfx({ ...defaultSfxParameters, volume: 500 }).parameters.volume, 100, 'volume is clamped to the supported percentage range');
  const productLimits = generateSfx({ ...defaultSfxParameters, frequency: 90_000, durationMs: 90_000, sampleRate: 48_000 });
  assert.deepEqual({ frequency: productLimits.parameters.frequency, durationMs: productLimits.parameters.durationMs, sampleRate: productLimits.parameters.sampleRate }, { frequency: 7_800, durationMs: 3_000, sampleRate: 22_050 }, 'product limits are fixed and bounded before allocation');
  const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
  const projectAssets = path.join(temp, 'project-assets');
  const sounds = path.join(projectAssets, 'sounds');
  const buildDirectory = path.join(temp, 'build');
  await fs.mkdir(sounds, { recursive: true });
  await fs.mkdir(path.join(buildDirectory, 'graphics'), { recursive: true });
  const exported = encodePcm16Wav(sine.pcm, sine.parameters.sampleRate);
  await fs.writeFile(path.join(sounds, 'generated-sfx.wav'), new Uint8Array(exported));
  const assetBuilder = new AssetBuilder(root, buildDirectory);
  const copyResult = await assetBuilder.copyAssets(projectAssets, [], { preserveStructure: false });
  assert.equal(copyResult.copiedCount, 1, 'an exported SFX WAV should enter the ordinary project audio asset pipeline');
  assert.deepEqual(await fs.readFile(path.join(buildDirectory, 'audio', 'generated-sfx.wav')), Buffer.from(exported), 'the soundbank input should use the exact exported preview WAV');
  const mmutil = process.platform === 'win32'
    ? path.join(process.env.DEVKITPRO ?? '', 'tools', 'bin', 'mmutil.exe')
    : 'mmutil';
  if (process.platform !== 'win32' || await fs.stat(mmutil).then(() => true, () => false)) {
    const soundbankPath = path.join(buildDirectory, 'bn_audio_soundbank.bin');
    const headerPath = path.join(buildDirectory, 'bn_audio_soundbank.h');
    const conversion = spawnSync(mmutil, [path.join(buildDirectory, 'audio', 'generated-sfx.wav'), `-o${soundbankPath}`, `-h${headerPath}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(conversion.status, 0, `Maxmod mmutil should accept the exported SFX WAV: ${conversion.stderr || conversion.stdout}`);
    assert.ok((await fs.stat(soundbankPath)).size > 0, 'Maxmod should produce a non-empty soundbank for the exported WAV');
    assert.match(await fs.readFile(headerPath, 'utf8'), /SFX_GENERATED_SFX/, 'Maxmod should expose the exported WAV as a sound item');
    for (const durationMs of [10, 3000]) for (const frequency of [40, 7800]) {
      const boundary = generateSfx({ ...defaultSfxParameters, durationMs, frequency });
      const filename = path.join(buildDirectory, `boundary_${durationMs}_${frequency}.wav`);
      await fs.writeFile(filename, new Uint8Array(encodePcm16Wav(boundary.pcm, boundary.parameters.sampleRate)));
      const result = spawnSync(mmutil, [filename, `-o${soundbankPath}`, `-h${headerPath}`], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, `Maxmod accepts ${durationMs} ms at ${frequency} Hz: ${result.stderr || result.stdout}`);
      assert.ok((await fs.stat(soundbankPath)).size > 0);
    }
  }
  console.log('SFX generator: deterministic PCM, envelope, metrics, and valid PCM16 WAV verified.');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
