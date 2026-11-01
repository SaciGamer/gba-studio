import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const [{ ResourceBuilder }, audio, { toRuntimeScene }, { EVENT_DEFAULTS }] = await Promise.all([
  import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href),
  import(pathToFileURL(path.join(root, 'dist', 'shared', 'events', 'generatedEventSound.js')).href),
  import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'types', 'RuntimeResources.js')).href),
  import(pathToFileURL(path.join(root, 'dist', 'shared', 'events', 'eventCatalog.js')).href),
]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-generated-event-sound-'));
try {
  assert.deepEqual(EVENT_DEFAULTS.EVENT_PLAY_SOUND, {
    soundId: 'generated', soundSource: 'generated', effect: 'tone', pitch: 60, durationFrames: 12,
    volume: 100, speed: 100, panning: 0, priority: 0, group: '',
  }, 'new Play Sound events should work as generated effects without requiring an asset');
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools', 'butano', 'template'));
  const args = { soundId: 'generated', soundSource: 'generated', effect: 'laser', pitch: 72, durationFrames: 18, volume: 80, speed: 125, panning: -20, priority: 3, group: 'fx' };
  const parameters = audio.normalizeGeneratedSoundParameters(args);
  const id = `gba_event_sfx_${crypto.createHash('sha256').update(JSON.stringify(parameters)).digest('hex').slice(0, 16)}`;
  const event = { id: 'generated-fx', command: 'EVENT_PLAY_SOUND', args };
  const emitted = builder.processResourceObject({ _resourceType: 'scene', id: 'sound-test', name: 'Sound test', backgrounds: [], script: [event] });
  assert.match(emitted.headerContent.toString('utf8'), new RegExp(`"${id}", 80, 125, -20, 3, "fx"`), 'runtime event should reference the deterministic generated sound item');
  const runtimeScene = toRuntimeScene({ _resourceType: 'scene', id: 'sound-test', name: 'Sound test', backgrounds: [], script: [event] });
  assert.equal(runtimeScene.script[0].args.soundSource, 'generated', 'event synthesis settings should survive runtime projection');
  const runtimeFile = builder.processRuntimeResource(runtimeScene);
  await builder.generateResourceRegistryClass([runtimeFile], { projectName: 'generated-sound' });
  const registry = fs.readFileSync(path.join(temp, 'include', 'audio_registry.h'), 'utf8');
  assert.ok(registry.includes(id), 'generated sound item should be registered for the Maxmod soundbank');

  const audioDir = path.join(temp, 'audio');
  const copiedArgs = { ...args, effect: 'coin', pitch: 81 };
  const generatedCount = builder.prepareGeneratedEventSounds([
    { jsonContent: { _resourceType: 'scene', script: [event, { ...event, id: 'duplicate' }, { ...event, id: 'second', args: copiedArgs }] } },
  ], audioDir);
  assert.equal(generatedCount, 2, 'identical effect parameters should share one Maxmod WAV asset');
  const wav = fs.readFileSync(path.join(audioDir, `${id}.wav`));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), audio.GENERATED_SOUND_SAMPLE_RATE);
  assert.equal(wav.readUInt16LE(22), 1, 'generated sound should be mono');
  assert.equal(wav.readUInt16LE(34), 16, 'generated sound should use signed 16-bit PCM');
  assert.equal(wav.length, 44 + Math.round(18 * audio.GENERATED_SOUND_SAMPLE_RATE / 60) * 2);
  assert.ok(wav.subarray(44).some(byte => byte !== 0), 'generated effect PCM should not be silent');

  const samples = audio.generateEventSoundSamples(args);
  const previewPcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) previewPcm.writeInt16LE(Math.round(samples[index] * 32767), index * 2);
  assert.deepEqual(wav.subarray(44), previewPcm, 'event preview and exported Maxmod WAV should use the same PCM samples');

  const customArgs = { ...args, sfxParameters: JSON.stringify({ waveform: 'sawtooth', frequency: 290, durationMs: 160, fadeInMs: 8, fadeOutMs: 60, volume: 70, sampleRate: 22050, seed: 7 }) };
  const customScene = toRuntimeScene({ _resourceType: 'scene', id: 'custom', script: [{ ...event, args: customArgs }] });
  assert.equal(customScene.script[0].args.sfxParameters, customArgs.sfxParameters, 'SFX Generator parameters survive runtime projection');
  const customResource = builder.processRuntimeResource(customScene);
  assert.equal(builder.prepareGeneratedEventSounds([customResource], audioDir), 1);
  const customId = `gba_event_sfx_${crypto.createHash('sha256').update(JSON.stringify(audio.normalizeGeneratedSoundParameters(customArgs))).digest('hex').slice(0, 16)}`;
  const customWav = fs.readFileSync(path.join(audioDir, `${customId}.wav`));
  const customPcm = audio.generateEventSoundSamples(customArgs);
  const expected = Buffer.alloc(customPcm.length * 2);
  for (let index = 0; index < customPcm.length; index++) expected.writeInt16LE(Math.round(customPcm[index] * 32767), index * 2);
  assert.deepEqual(customWav.subarray(44), expected, 'custom modal sound preview and build use identical PCM');
  for (const value of ['invalid json', '{}', 'null', JSON.stringify({ waveform: 'bad' })]) {
    assert.throws(() => audio.normalizeGeneratedSoundParameters({ sfxParameters: value }), /Invalid event SFX parameters/);
  }
  builder.prepareGeneratedEventSounds([], audioDir);
  assert.equal(fs.readdirSync(audioDir).filter(name => name.startsWith('gba_event_sfx_')).length, 0, 'stale generated WAVs should be removed when their events are deleted');
  console.log('Generated event sounds use deterministic PCM WAV assets and match editor preview samples.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
