import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const compile = filename => ts.transpileModule(fs.readFileSync(path.resolve(filename), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const xmTemplateCompiled = compile('src/renderer/frontend/src/utils/xmBeatTemplate.ts');
const instrumentLibraryCompiled = compile('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts');
const compatibilityCompiled = compile('src/shared/trackerItBuildCompatibility.ts');
const trackerCompiled = inlineTrackerIdentity(compile('src/renderer/frontend/src/utils/trackerModule.ts'))
  .replace("from './xmBeatTemplate'", `from '${dataUrl(xmTemplateCompiled)}'`)
  .replaceAll("from './trackerInstrumentLibrary'", `from '${dataUrl(instrumentLibraryCompiled)}'`)
  .replace("from '../../../../shared/trackerItBuildCompatibility'", `from '${dataUrl(compatibilityCompiled)}'`);
const tracker = await import(dataUrl(trackerCompiled));
const { createXmBeatTemplate } = await import(dataUrl(xmTemplateCompiled));
const mod = await import(dataUrl(compile('src/renderer/frontend/src/utils/modPlayer.ts')));
const packageModule = await import(dataUrl(compile('src/renderer/frontend/src/utils/trackerProjectPackage.ts')));

const pcm = Int8Array.from([-127, -1, 0, 1, 126]);
const expectedFloats = Array.from(pcm, value => value / 128);
const exportedModules = new Map();
const encodeXmDelta = values => {
  const encoded = new Uint8Array(values.length);
  let previous = 0;
  for (let index = 0; index < values.length; index += 1) {
    encoded[index] = (values[index] - previous) & 0xff;
    previous = values[index];
  }
  return encoded;
};

const modSampleOffset = 1084 + 64 * 4 * 4;
const modSourceBytes = Buffer.alloc(modSampleOffset + 8);
modSourceBytes.write('M.K.', 1080, 4, 'ascii');
modSourceBytes[950] = 1;
modSourceBytes.writeUInt16BE(4, 42);
modSourceBytes.set([11, 12, 13, 14, 15, 16, 17, 18], modSampleOffset);
const parsedMod = mod.parseModModule(modSourceBytes.buffer.slice(modSourceBytes.byteOffset, modSourceBytes.byteOffset + modSourceBytes.byteLength));
assert.ok(parsedMod);
const modOutput = mod.replaceModSamplePcm(parsedMod, 0, pcm, 'shared take');
assert.ok(modOutput);
assert.deepEqual(Array.from(modOutput.bytes.slice(modOutput.samples[0].dataOffset, modOutput.samples[0].dataOffset + pcm.length)), Array.from(pcm, value => value & 0xff), 'MOD stores the prepared PCM bytes directly');
assert.equal(modOutput.samples[0].name, 'shared take');
assert.equal(modOutput.samples[0].loopLength, 0);
exportedModules.set('MOD', modOutput.bytes);

const xmSource = createXmBeatTemplate('Shared Take');
const xmOutput = tracker.replaceXmSamplePcm(xmSource, 1, encodeXmDelta(pcm), 'shared take');
assert.ok(xmOutput);
const xmSample = tracker.parseXmSamples(xmOutput).get(1);
assert.deepEqual(Array.from(xmSample.samples.slice(0, pcm.length)), expectedFloats, 'XM delta decoding restores the same prepared PCM values');
assert.equal(xmSample.variants[0].name, 'shared take');
assert.equal(xmSample.variants[0].loopEnd, 0);
exportedModules.set('XM', new Uint8Array(xmOutput));

const s3mSource = new Uint8Array(520);
s3mSource.set([... 'SCRM'].map(character => character.charCodeAt(0)), 44);
const s3mU16 = (offset, value) => { s3mSource[offset] = value & 0xff; s3mSource[offset + 1] = value >> 8; };
s3mU16(34, 1); s3mU16(42, 1); s3mU16(96, 16);
s3mSource[256] = 1;
s3mSource[270] = 32;
s3mSource[272] = 4;
s3mSource[284] = 48;
s3mSource.set([11, 12, 13, 14], 512);
const s3mOutput = tracker.replaceS3mSamplePcm(s3mSource.buffer, 0, pcm, 'shared take');
assert.ok(s3mOutput);
const s3mSample = tracker.parseS3mSamples(s3mOutput).get(1);
assert.deepEqual(Array.from(s3mSample.samples), expectedFloats, 'S3M decoding restores the same prepared PCM values');
assert.equal(s3mSample.name, 'shared take');
assert.equal(s3mSample.loopEnd, 0);
exportedModules.set('S3M', new Uint8Array(s3mOutput));

const itSampleSource = new Uint8Array(604);
itSampleSource.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
itSampleSource[0x24] = 1;
itSampleSource[192] = 0;
itSampleSource[193] = 2;
itSampleSource.set([... 'IMPS'].map(character => character.charCodeAt(0)), 512);
itSampleSource[530] = 1;
itSampleSource[531] = 48;
itSampleSource[560] = 4;
itSampleSource[584] = 0x58;
itSampleSource[585] = 0x02;
itSampleSource.set([11, 12, 13, 14], 600);
const itSampleOutput = tracker.replaceItSamplePcm(itSampleSource.buffer, 0, pcm, 'shared take');
assert.ok(itSampleOutput);
const itSample = tracker.parseItSamples(itSampleOutput).get(1);
assert.deepEqual(Array.from(itSample.samples), expectedFloats, 'IT sample-mode decoding restores the same prepared PCM values');
assert.equal(itSample.name, 'shared take');
assert.equal(itSample.loopEnd, 0);
exportedModules.set('IT', new Uint8Array(itSampleOutput));

const sourceFloats = Float32Array.from(expectedFloats);
const sourceFloatBytes = Buffer.from(sourceFloats.buffer, sourceFloats.byteOffset, sourceFloats.byteLength);
const sourceWav = Buffer.alloc(44 + pcm.length);
sourceWav.write('RIFF', 0, 4, 'ascii'); sourceWav.writeUInt32LE(sourceWav.length - 8, 4); sourceWav.write('WAVEfmt ', 8, 8, 'ascii');
sourceWav.writeUInt32LE(16, 16); sourceWav.writeUInt16LE(1, 20); sourceWav.writeUInt16LE(1, 22); sourceWav.writeUInt32LE(8363, 24);
sourceWav.writeUInt32LE(8363, 28); sourceWav.writeUInt16LE(1, 32); sourceWav.writeUInt16LE(8, 34); sourceWav.write('data', 36, 4, 'ascii');
sourceWav.writeUInt32LE(pcm.length, 40);
for (let index = 0; index < pcm.length; index += 1) sourceWav[44 + index] = (pcm[index] + 128) & 0xff;
for (const [format, bytes] of exportedModules) {
  const sourceDocument = {
    schema: 'gba-studio/music-source',
    version: 1,
    assetFileName: `shared-take.${format.toLowerCase()}`,
    format,
    origin: 'imported',
    moduleData: Buffer.from(bytes).toString('base64'),
    samples: [{ index: 1, encodedPcm: Buffer.from(pcm).toString('base64') }],
    importedAudioSources: [{
      fileName: 'shared-take.wav', mimeType: 'audio/wav',
      sourceAudioData: sourceWav.toString('base64'), sourcePcmData: sourceFloatBytes.toString('base64'),
      pcmFrames: pcm.length, pcmEncoding: 'float32le-interleaved', sampleRate: 8363, channels: 1,
      durationSeconds: pcm.length / 8363, trimStart: 0, trimEnd: pcm.length / 8363, gain: 1,
      removeDc: false, fadeInMs: 0, fadeOutMs: 0, instrumentIndex: 1,
    }],
  };
  const archive = packageModule.createTrackerProjectPackage(sourceDocument);
  const restoredDocument = packageModule.parseTrackerProjectPackage(archive);
  assert.deepEqual(restoredDocument, sourceDocument, `${format} .gbatracker round-trip preserves the shared take and exported module bytes`);
}

console.log('One prepared PCM take exports with matching decoded values and metadata in MOD, XM, S3M, and IT; each exported module and source take survives a .gbatracker round-trip.');
