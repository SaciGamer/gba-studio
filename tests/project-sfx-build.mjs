import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { defaultSfxParameters, generateSfx, encodePcm16Wav } from '../dist/shared/events/sfxGenerator.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-project-sfx-'));
try {
  const sourceDir = path.join(temp, 'sounds');
  const audioDir = path.join(temp, 'audio');
  fs.mkdirSync(sourceDir);
  const { fadeInMs, ...legacyParameters } = defaultSfxParameters;
  const document = { schema: 'gba-studio/sfx', version: 1, name: 'jump', parameters: { ...legacyParameters, frequency: 8000 } };
  const sourcePath = path.join(sourceDir, 'jump.gbasfx');
  fs.writeFileSync(sourcePath, JSON.stringify(document));
  const resources = [{ jsonContent: { _resourceType: 'scene', script: [
    { command: 'EVENT_PLAY_SOUND', args: { soundSource: 'project', soundId: 'jump' } },
  ] } }];
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  assert.equal(builder.prepareProjectSfxSounds(resources, sourceDir, audioDir), 1);
  const generated = generateSfx({ ...defaultSfxParameters, ...document.parameters });
  const wav = fs.readFileSync(path.join(audioDir, fs.readdirSync(audioDir)[0]));
  assert.deepEqual(wav, Buffer.from(encodePcm16Wav(generated.pcm, generated.parameters.sampleRate)),
    'legacy SFX build must match the editor defaults and PCM');
  for (const parameters of [
    { ...document.parameters, volume: 101 },
    { ...document.parameters, fadeInMs: -1 },
    { ...document.parameters, frequency: '290' },
  ]) {
    fs.writeFileSync(sourcePath, JSON.stringify({ ...document, parameters }));
    assert.throws(() => builder.prepareProjectSfxSounds(resources, sourceDir, audioDir), /invalid parameters/);
  }
  console.log('Legacy project SFX builds match editor PCM; invalid parameters remain rejected.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
