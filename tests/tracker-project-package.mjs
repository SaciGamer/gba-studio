import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const filename = 'src/renderer/frontend/src/utils/trackerProjectPackage.ts';
const source = ts.transpileModule(fs.readFileSync(path.resolve(filename), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const document = {
  schema: 'gba-studio/music-source',
  version: 1,
  assetFileName: 'cyberrid.mod',
  moduleFingerprint: 'test-fingerprint',
  format: 'XM',
  origin: 'imported',
  importedAudioSources: [{ id: '8e2ce5df-8f38-4329-9a6d-289d4460bfa2', fileName: 'voice.wav', mimeType: 'audio/wav', sourceAudioData: Buffer.from('raw audio source').toString('base64'), sourcePcmData: Buffer.from([0, 0, 128, 63]).toString('base64'), pcmFrames: 1, pcmEncoding: 'float32le-interleaved', trimStart: 0.1, trimEnd: 0.8, gain: 1.2 }],
  samples: [{ id: '8e2ce5df-8f38-4329-9a6d-289d4460bfa3', encodedPcm: Buffer.from([0, 1, 127, 128, 255]).toString('base64'), pcmData: Buffer.from([0, 0, 128, 63]).toString('base64') }],
  history: { undo: [{ moduleData: Buffer.from('original module').toString('base64') }], redo: [] },
};

const archive = module.createTrackerProjectPackage(document);
assert.equal(archive[0], 0x50);
assert.equal(archive[1], 0x4b);
const restored = module.parseTrackerProjectPackage(archive);
assert.deepEqual(restored, document);
assert.match(restored.importedAudioSources[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.ok(!Buffer.from(archive).includes(Buffer.from(document.samples[0].encodedPcm)), 'PCM bytes are stored outside the JSON manifest');
assert.ok(!Buffer.from(archive).includes(Buffer.from(document.samples[0].pcmData)), 'canonical PCM bytes are stored outside the JSON manifest');
assert.ok(!Buffer.from(archive).includes(Buffer.from(document.importedAudioSources[0].sourceAudioData)), 'original audio source bytes are stored outside the JSON manifest');
assert.ok(!Buffer.from(archive).includes(Buffer.from(document.importedAudioSources[0].sourcePcmData)), 'decoded float PCM bytes are stored outside the JSON manifest');
assert.throws(() => module.parseTrackerProjectPackage(archive.subarray(0, archive.length - 5)), /truncated|schema/i);

const corrupt = archive.slice();
const manifestNameLength = corrupt[26] | (corrupt[27] << 8);
const manifestByteOffset = 30 + manifestNameLength;
corrupt[manifestByteOffset] ^= 1;
assert.throws(() => module.parseTrackerProjectPackage(corrupt), /CRC check/);
console.log('GBA Tracker ZIP package round-trip, binary separation, truncation, and CRC checks passed.');
