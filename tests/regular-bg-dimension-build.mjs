import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'AssetBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-regular-bg-'));
try {
  const magick = path.join(root, 'bin', 'image-magick', 'magick.exe');
  const source = path.join(tempDir, 'source.bmp');
  const destination = path.join(tempDir, 'converted.bmp');
  execFileSync(magick, ['-size', '300x260', 'xc:#223344', `BMP3:${source}`]);
  const builder = new AssetBuilder(path.join(root, 'dist'), tempDir, magick);
  await builder.convertWithMagick(source, destination, 'backgrounds', {
    jsonContent: { _resourceType: 'background', imageWidth: 300, imageHeight: 260 },
  });
  const dimensions = execFileSync(magick, [destination, '-format', '%wx%h', 'info:'], { encoding: 'utf8' });
  assert.equal(dimensions, '512x512', 'regular backgrounds must be padded to 256-pixel blocks');
  assert.ok(fs.existsSync(source), 'source asset must remain untouched');
  console.log('Regular background dimension contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
