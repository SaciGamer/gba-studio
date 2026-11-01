import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerMaxmodSamplePcm.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { convertTrackerSampleToMaxmodGbaPcm } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const trackerSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const xmTemplateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const instrumentLibrarySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts'), 'utf8');
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const xmTemplateCompiled = ts.transpileModule(xmTemplateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibraryCompiled = ts.transpileModule(instrumentLibrarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const trackerCompiled = inlineTrackerIdentity(ts.transpileModule(trackerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace(/from ['"]\.\/xmBeatTemplate['"];?/g, `from 'data:text/javascript;base64,${Buffer.from(xmTemplateCompiled).toString('base64')}';`)
  .replace(/from ['"]\.\/trackerInstrumentLibrary['"];?/g, `from 'data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}';`)
  .replace(/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/trackerItBuildCompatibility['"];?/g, `from 'data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}';`);
assert.doesNotMatch(trackerCompiled, /from ['"]\.\/trackerInstrumentLibrary/);
const { parseS3mSamples, parseXmSamples } = await import(`data:text/javascript;base64,${Buffer.from(trackerCompiled).toString('base64')}`);

const pcm8Input = new Float32Array([-1, -127 / 128, -1 / 128, 0, 1 / 128, 127 / 128]);
assert.deepEqual(
  [...convertTrackerSampleToMaxmodGbaPcm(pcm8Input, false)],
  [-127 / 128, -127 / 128, -1 / 128, 0, 1 / 128, 127 / 128],
  'GBA sample sign conversion maps the PCM8 minimum from -128 to -127 and preserves the other source steps',
);

const pcm16Values = [-32768, -32767, -32512, -1, 0, 255, 256, 32767];
const pcm16Input = new Float32Array(pcm16Values.map(value => value / 32768));
const actualPcm16 = [...convertTrackerSampleToMaxmodGbaPcm(pcm16Input, true)];
const expectedPcm16 = pcm16Values.map(value => Math.max(-127, Math.min(127, Math.floor((value + 32768) / 256) - 128)) / 128);
assert.deepEqual(actualPcm16, expectedPcm16, 'GBA conversion keeps the high byte of signed PCM16 and applies mmutil’s -127 clamp');
assert.ok(actualPcm16.some((value, index) => value !== pcm16Input[index]), '16-bit source samples are quantized to PCM8 for the GBA preview');
assert.deepEqual([...convertTrackerSampleToMaxmodGbaPcm(new Float32Array([Number.NaN, Number.POSITIVE_INFINITY]), false)], [0, 0], 'non-finite samples cannot enter the GBA preview buffer');

const realXmPath = path.resolve('templateEngineGame/shooter_game/assets/musics/galgox_snowheart_melody.xm');
const realXmBytes = fs.readFileSync(realXmPath);
const realXmBuffer = realXmBytes.buffer.slice(realXmBytes.byteOffset, realXmBytes.byteOffset + realXmBytes.byteLength);
const realXmSamples = parseXmSamples(realXmBuffer);
let realSampleCount = 0;
let realPcm8Count = 0;
let realPcm16Count = 0;
for (const [instrument, sample] of realXmSamples) {
  for (const [variantIndex, variant] of (sample.variants ?? [sample]).entries()) {
    if (!variant.samples.length || !variant.encodedPcm) continue;
    const expected = [];
    if (variant.sixteenBit) {
      let accumulator = 0;
      assert.equal(variant.encodedPcm.length, variant.samples.length * 2, `real XM instrument ${instrument} variant ${variantIndex} keeps its PCM16 source bytes`);
      for (let index = 0; index < variant.samples.length; index += 1) {
        const raw = variant.encodedPcm.readUInt16LE?.(index * 2)
          ?? (variant.encodedPcm[index * 2] | (variant.encodedPcm[index * 2 + 1] << 8));
        const delta = raw & 0x8000 ? raw - 0x10000 : raw;
        accumulator = (accumulator + delta) << 16 >> 16;
        const highByte = Math.floor((accumulator + 32768) / 256) - 128;
        expected.push(Math.max(-127, Math.min(127, highByte)) / 128);
      }
      realPcm16Count += 1;
    } else {
      let accumulator = 0;
      assert.equal(variant.encodedPcm.length, variant.samples.length, `real XM instrument ${instrument} variant ${variantIndex} keeps its PCM8 source bytes`);
      for (const raw of variant.encodedPcm) {
        const delta = raw & 0x80 ? raw - 0x100 : raw;
        accumulator = (accumulator + delta) << 24 >> 24;
        expected.push(Math.max(-127, Math.min(127, accumulator)) / 128);
      }
      realPcm8Count += 1;
    }
    assert.deepEqual(
      [...convertTrackerSampleToMaxmodGbaPcm(variant.samples, variant.sixteenBit)],
      expected,
      `real XM instrument ${instrument} variant ${variantIndex} matches direct mmutil signed PCM8 conversion`,
    );
    realSampleCount += 1;
  }
}
assert.ok(realSampleCount > 0, 'the imported XM contributes real sample variants to the conversion audit');

const realS3mPath = path.resolve('templateEngineGame/shooter_game/assets/musics/soda7_xcopy_ohc.s3m');
const realS3mBytes = fs.readFileSync(realS3mPath);
const realS3mBuffer = realS3mBytes.buffer.slice(realS3mBytes.byteOffset, realS3mBytes.byteOffset + realS3mBytes.byteLength);
const realS3mSamples = parseS3mSamples(realS3mBuffer);
const s3mUnsigned = realS3mBytes.readUInt16LE(42) === 2;
const s3mOrders = realS3mBytes.readUInt16LE(32);
const s3mInstrumentCount = realS3mBytes.readUInt16LE(34);
let realS3mSampleCount = 0;
let realS3mPcm8Count = 0;
let realS3mPcm16Count = 0;
for (let instrumentIndex = 0; instrumentIndex < s3mInstrumentCount; instrumentIndex += 1) {
  const sample = realS3mSamples.get(instrumentIndex + 1);
  if (!sample?.samples.length) continue;
  const headerOffset = realS3mBytes.readUInt16LE(96 + s3mOrders + instrumentIndex * 2) * 16;
  const flags = realS3mBytes[headerOffset + 0x1f] ?? 0;
  if (flags & 0x02) continue; // mmutil rejects stereo S3M samples for GBA.
  const sixteenBit = (flags & 0x04) !== 0;
  assert.equal(sample.sixteenBit, sixteenBit, `real S3M sample ${instrumentIndex + 1} keeps its source PCM depth`);
  const sampleDataOffset = ((((realS3mBytes[headerOffset + 0x0d] ?? 0) << 16)
    | realS3mBytes.readUInt16LE(headerOffset + 0x0e)) >>> 0) * 16;
  const sampleLength = realS3mBytes.readUInt32LE(headerOffset + 0x10);
  const expected = [];
  for (let index = 0; index < sampleLength; index += 1) {
    if (sixteenBit) {
      const raw = realS3mBytes.readUInt16LE(sampleDataOffset + index * 2);
      const signed16 = s3mUnsigned ? raw - 0x8000 : (raw & 0x8000) ? raw - 0x10000 : raw;
      const signed8 = Math.floor((signed16 + 32768) / 256) - 128;
      expected.push(Math.max(-127, Math.min(127, signed8)) / 128);
    } else {
      const raw = realS3mBytes[sampleDataOffset + index] ?? 0;
      const signed8 = s3mUnsigned ? raw - 0x80 : (raw & 0x80) ? raw - 0x100 : raw;
      expected.push(Math.max(-127, Math.min(127, signed8)) / 128);
    }
  }
  assert.deepEqual(
    [...convertTrackerSampleToMaxmodGbaPcm(sample.samples, sixteenBit)],
    expected,
    `real S3M instrument ${instrumentIndex + 1} matches mmutil's unsigned-to-signed GBA PCM conversion`,
  );
  realS3mSampleCount += 1;
  if (sixteenBit) realS3mPcm16Count += 1;
  else realS3mPcm8Count += 1;
}
assert.ok(realS3mSampleCount > 0, 'the imported S3M contributes real mono samples to the conversion audit');

console.log(`Maxmod GBA sample PCM conversion: PCM8 asymmetry, PCM16 high-byte quantization, invalid values, ${realSampleCount} XM variants (${realPcm8Count} PCM8, ${realPcm16Count} PCM16), and ${realS3mSampleCount} real S3M samples (${realS3mPcm8Count} PCM8, ${realS3mPcm16Count} PCM16) verified.`);
