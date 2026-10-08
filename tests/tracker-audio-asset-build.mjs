import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-tracker-assets-'));
const source = path.join(temp, 'assets');
const output = path.join(temp, 'build');
try {
  fs.mkdirSync(source, { recursive: true });
  const mod = Buffer.alloc(600);
  const xm = Buffer.alloc(80); Buffer.from('Extended Module: ').copy(xm, 0); xm.writeUInt32LE(20, 60);
  const s3m = Buffer.alloc(96); Buffer.from('SCRM').copy(s3m, 44);
  const it = Buffer.alloc(192); Buffer.from('IMPM').copy(it, 0);
  for (const [extension, bytes] of [['mod', mod], ['xm', xm], ['s3m', s3m], ['it', it]]) fs.writeFileSync(path.join(source, `module.${extension}`), bytes);
  const result = await new AssetBuilder(root, output).copyAssets(source, [], { preserveStructure: false });
  assert.equal(result.copiedCount, 4);
  for (const extension of ['mod', 'xm', 's3m', 'it']) assert.equal(fs.existsSync(path.join(output, 'audio', `module.${extension}`)), true, `${extension} must be copied as audio`);
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
