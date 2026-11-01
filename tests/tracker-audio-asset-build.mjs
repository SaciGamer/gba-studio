import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const { readTrackerProjectForBuild } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'TrackerProjectPackage.js')).href);
const packageSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'utils', 'trackerProjectPackage.ts'), 'utf8');
const packageModule = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(packageSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-tracker-assets-'));
const source = path.join(temp, 'assets');
const output = path.join(temp, 'build');
const projectMusic = path.join(temp, 'project', 'musics');
try {
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(projectMusic, { recursive: true });
  fs.mkdirSync(path.join(output, 'graphics'), { recursive: true });
  const mod = Buffer.alloc(600);
  const xm = Buffer.alloc(80); Buffer.from('Extended Module: ').copy(xm, 0); xm.writeUInt32LE(20, 60);
  const s3m = Buffer.alloc(96); Buffer.from('SCRM').copy(s3m, 44);
  const it = Buffer.alloc(192); Buffer.from('IMPM').copy(it, 0);
  const itInstrument = Buffer.alloc(1_088);
  Buffer.from('IMPM').copy(itInstrument, 0);
  itInstrument.writeUInt16LE(1, 0x20); itInstrument.writeUInt16LE(1, 0x22); itInstrument.writeUInt16LE(1, 0x24); itInstrument.writeUInt16LE(1, 0x26);
  itInstrument.writeUInt16LE(0x04, 0x2c);
  itInstrument[192] = 0;
  itInstrument.writeUInt32LE(256, 193); itInstrument.writeUInt32LE(560, 197); itInstrument.writeUInt32LE(704, 201);
  Buffer.from('IMPI').copy(itInstrument, 256); Buffer.from('TestVoice').copy(itInstrument, 260);
  for (let note = 0; note < 120; note += 1) { itInstrument[320 + note * 2] = note; itInstrument[321 + note * 2] = 1; }
  Buffer.from('IMPS').copy(itInstrument, 560); itInstrument[560 + 0x12] = 1; itInstrument[560 + 0x13] = 64;
  itInstrument.writeUInt32LE(64, 560 + 0x30); itInstrument.writeUInt32LE(8_363, 560 + 0x3c); itInstrument.writeUInt32LE(1_024, 560 + 0x48);
  itInstrument.writeUInt16LE(5, 704); itInstrument.writeUInt16LE(1, 706); itInstrument.set([0x81, 0x03, 60, 1, 0], 712);
  itInstrument.fill(0x30, 1_024, 1_088);
  for (const [extension, bytes] of [['mod', mod], ['xm', xm], ['s3m', s3m], ['it', it]]) fs.writeFileSync(path.join(source, `module.${extension}`), bytes);
  fs.writeFileSync(path.join(source, 'instrument-mode.it'), itInstrument);
  const result = await new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false });
  assert.equal(result.copiedCount, 5);
  for (const extension of ['mod', 'xm', 's3m', 'it']) assert.equal(fs.existsSync(path.join(output, 'audio', `module.${extension}`)), true, `${extension} must be copied as audio`);
  const canonicalProjects = [];
  for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
    const makeId = () => randomUUID();
    const channelId = makeId();
    const instrumentId = makeId();
    const sampleId = makeId();
    const patternId = makeId();
    const composition = {
      schema: 'gba-studio/music-composition', version: 1, id: makeId(), title: `Canonical ${format}`,
      profile: format === 'MOD' ? 'retro' : format === 'XM' ? 'beat' : format === 'S3M' ? 'tracker' : 'advanced',
      targetFormat: format, tempoBpm: 125, ticksPerRow: 6,
      channels: [{ id: channelId, index: 0, name: 'Channel 01', volume: 1, pan: 0, muted: false }],
      instruments: [{ id: instrumentId, index: 0, name: 'Instrument 01', sampleIds: [sampleId], noteMap: [{ low: 0, high: 95, sampleId }],
        volumeEnvelope: { points: [], sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 0, enabled: false, sustainEnabled: false, loopEnabled: false },
        panningEnvelope: { points: [], sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 0, enabled: false, sustainEnabled: false, loopEnabled: false }, fadeout: 0 }],
      samples: [{ id: sampleId, name: `PCM ${format}`, sampleRate: 8363, channels: 1, bitDepth: 8,
        pcmData: Buffer.from([0, 32, 64, 96, 127, 96, 64, 32, 0, -32, -64, -96, -128, -96, -64, -32]).toString('base64'),
        volume: 1, panning: 0, rootNote: 48, fineTune: 0, loopStart: 0, loopEnd: 16, loopType: 'forward' }],
      patterns: [{ id: patternId, index: 0, name: 'Pattern 01', rows: 64,
        notes: [{ id: makeId(), row: 0, channelId, pitch: 49, durationRows: 2, instrumentId, volume: 1, pan: 0.25 }], commands: [] }],
      order: [{ id: makeId(), index: 0, patternId }],
      sourceModules: [{ id: makeId(), format, fileName: `original.${format.toLowerCase()}`,
        fingerprint: 'test-source', parserVersion: 'test', moduleData: Buffer.from('original imported module').toString('base64'), warnings: [] }],
    };
    const id = format === 'IT' ? '12485796-1228-4ce3-8378-f73611f72504' : makeId();
    const projectPackage = packageModule.createTrackerProjectPackage({ schema: 'gba-studio/music-project', version: 1, id, origin: 'scratch', composition });
    assert.deepEqual(readTrackerProjectForBuild(Buffer.from(projectPackage), `canonical-${format}.gbatracker`).composition, composition,
      'the build reader must restore imported module and sample binaries as canonical base64 strings');
    fs.writeFileSync(path.join(projectMusic, `canonical-${format.toLowerCase()}.gbatracker`), projectPackage);
    canonicalProjects.push({ id, format, composition });
  }
  const noCacheComposition = structuredClone(canonicalProjects.find(project => project.format === 'XM').composition);
  noCacheComposition.id = randomUUID();
  noCacheComposition.title = 'Canonical XM without module cache';
  const noCacheId = randomUUID();
  fs.writeFileSync(path.join(projectMusic, 'canonical-xm-no-cache.gbatracker'), packageModule.createTrackerProjectPackage({
    schema: 'gba-studio/music-project', version: 1, id: noCacheId, origin: 'scratch', composition: noCacheComposition,
  }));
  canonicalProjects.push({ id: noCacheId, format: 'XM', composition: noCacheComposition });
  const assetBuilder = new AssetBuilder(root, output);
  const stalePath = path.join(output, 'audio', '12485796-1228-4ce3-8378-f73611f72504.it');
  fs.writeFileSync(stalePath, it);
  assert.equal(assetBuilder.materializeTrackerProjects(projectMusic), canonicalProjects.length);
  assert.equal(fs.existsSync(stalePath), false, 'legacy UUID filenames must be removed from cached builds');
  for (const { id, format } of canonicalProjects) {
    const stem = `${/^[a-z]/.test(id) ? '' : 'a_'}${id.replaceAll('-', '_')}`;
    assert.match(stem, /^[a-z][a-z0-9_]*$/);
    const builtBytes = fs.readFileSync(path.join(output, 'audio', `${stem}.${format.toLowerCase()}`));
    const signatureOffset = format === 'MOD' ? 1080 : format === 'S3M' ? 44 : 0;
    const signature = format === 'MOD' ? 'M.K.' : format === 'XM' ? 'Extended Module: ' : format === 'S3M' ? 'SCRM' : 'IMPM';
    assert.equal(builtBytes.subarray(signatureOffset, signatureOffset + signature.length).toString('ascii'), signature, `${format} build output must use the canonical target`);
    assert.ok(builtBytes.length > 128, `${format} canonical export must contain its generated pattern and sample data`);
  }
  const legacyProject = packageModule.createTrackerProjectPackage({ schema: 'gba-studio/music-project', version: 1,
    id: randomUUID(), origin: 'scratch', format: 'XM', moduleData: xm.toString('base64') });
  fs.writeFileSync(path.join(projectMusic, 'legacy-no-composition.gbatracker'), legacyProject);
  assert.throws(() => assetBuilder.materializeTrackerProjects(projectMusic), /legacy root-level target\/cache fields|canonical music composition is required for build materialization/,
    'the build must reject old module-only .gbatracker packages instead of treating cached module bytes as source');
  fs.rmSync(path.join(projectMusic, 'legacy-no-composition.gbatracker'), { force: true });
  const legacyCache = packageModule.createTrackerProjectPackage({ schema: 'gba-studio/music-project', version: 1,
    id: randomUUID(), origin: 'scratch', format: 'XM', moduleData: xm.toString('base64'),
    originalModuleData: xm.toString('base64'), moduleFingerprint: 'a'.repeat(64), composition: noCacheComposition });
  fs.writeFileSync(path.join(projectMusic, 'legacy-root-cache.gbatracker'), legacyCache);
  assert.throws(() => assetBuilder.materializeTrackerProjects(projectMusic), /legacy root-level target\/cache fields/,
    'the build must reject redundant root-level format and module cache fields');
  const builtItInstrument = fs.readFileSync(path.join(output, 'audio', 'instrument-mode.it'));
  assert.equal(itInstrument.readUInt16LE(0x22), 1, 'the source IT instrument module remains unchanged');
  assert.equal(builtItInstrument.readUInt16LE(0x22), 0, 'build assets flatten IT instruments into explicit sample references');
  assert.equal(builtItInstrument.readUInt16LE(0x2c) & 0x04, 0, 'build output is in IT sample mode');
  const builtPatternOffset = builtItInstrument.readUInt32LE(197);
  assert.deepEqual([...builtItInstrument.subarray(builtPatternOffset + 8, builtPatternOffset + 13)], [0x81, 0x03, 60, 1, 0], 'build pattern keeps the mapped note and sample ID');
  assert.equal(fs.existsSync(path.join(output, 'assets', 'module.xm')), false);
  fs.writeFileSync(path.join(source, 'broken.xm'), Buffer.from([0x00, 0x01]));
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /Invalid tracker module broken\.xm/);
  fs.unlinkSync(path.join(source, 'broken.xm'));
  const brokenXmPattern = Buffer.alloc(100); Buffer.from('Extended Module: ').copy(brokenXmPattern, 0); brokenXmPattern.writeUInt32LE(20, 60); brokenXmPattern.writeUInt16LE(1, 70); brokenXmPattern.writeUInt32LE(9, 80); brokenXmPattern.writeUInt16LE(64, 85); brokenXmPattern.writeUInt16LE(80, 87);
  fs.writeFileSync(path.join(source, 'broken-pattern.xm'), brokenXmPattern);
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /pattern 0 data exceeds file size/);
  fs.unlinkSync(path.join(source, 'broken-pattern.xm'));
  const brokenS3m = Buffer.alloc(98); Buffer.from('SCRM').copy(brokenS3m, 44); brokenS3m.writeUInt16LE(1, 36);
  fs.writeFileSync(path.join(source, 'broken.s3m'), brokenS3m);
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /pattern 0 parapointer/);
  fs.unlinkSync(path.join(source, 'broken.s3m'));
  const brokenS3mData = Buffer.alloc(114); Buffer.from('SCRM').copy(brokenS3mData, 44); brokenS3mData.writeUInt16LE(1, 36); brokenS3mData.writeUInt16LE(7, 96); brokenS3mData.writeUInt16LE(8, 112);
  fs.writeFileSync(path.join(source, 'broken-pattern.s3m'), brokenS3mData);
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /pattern 0 data exceeds file size/);
  fs.unlinkSync(path.join(source, 'broken-pattern.s3m'));
  const brokenIt = Buffer.alloc(196); Buffer.from('IMPM').copy(brokenIt, 0); brokenIt.writeUInt16LE(1, 0x26);
  fs.writeFileSync(path.join(source, 'broken.it'), brokenIt);
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /pattern 0 pointer/);
  fs.unlinkSync(path.join(source, 'broken.it'));
  const brokenItData = Buffer.alloc(210); Buffer.from('IMPM').copy(brokenItData, 0); brokenItData.writeUInt16LE(1, 0x26); brokenItData.writeUInt32LE(200, 0xC0); brokenItData.writeUInt16LE(100, 200); brokenItData.writeUInt16LE(1, 202);
  fs.writeFileSync(path.join(source, 'broken-pattern.it'), brokenItData);
  await assert.rejects(() => new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false }), /pattern 0 data exceeds file size/);
  fs.unlinkSync(path.join(source, 'broken-pattern.it'));
  console.log('Tracker audio asset build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
