import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const magick = path.join(root, 'bin', 'image-magick', 'magick.exe');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-background-bpp-'));

function bitsPerPixel(filename) {
  const header = fs.readFileSync(filename);
  assert.equal(header.toString('ascii', 0, 2), 'BM', 'conversion must produce a BMP');
  return header.readUInt16LE(28);
}

try {
  const source = path.join(tempDir, 'source.png');
  const background = path.join(tempDir, 'background.bmp');
  const title = path.join(tempDir, 'title.bmp');
  execFileSync(magick, ['-size', '256x256', 'gradient:#102030-#f0e0d0', source]);

  const builder = new AssetBuilder(path.join(root, 'dist'), tempDir, magick);
  await builder.convertWithMagick(source, background, 'backgrounds', {
    jsonContent: { _resourceType: 'background', imageWidth: 256, imageHeight: 256 },
  });
  await builder.convertWithMagick(source, title, 'title');

  assert.equal(bitsPerPixel(background), 4, 'regular backgrounds must be emitted as 4 bpp BMP');
  assert.equal(bitsPerPixel(title), 8, 'title images must be emitted as 8 bpp BMP');
  assert.ok(fs.existsSync(source), 'source image must remain untouched');
  console.log('Background/title BMP depth contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
