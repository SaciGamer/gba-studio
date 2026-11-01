import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-start-position-'));
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, path.resolve('tools/butano/template'));
  for (const [startX, startY] of [[9.75, 4.25], [9, 9], [-0.5, 0], [0.0625, 0.5]]) {
    const settings = { _resourceType: 'settings', id: 'e6521ca6-225c-40c9-903c-5885362ab8fb', startX, startY };
    const original = builder.processResourceObject(settings);
    const runtime = builder.processRuntimeResource(toRuntimeResource(original.jsonContent));
    for (const result of [original, runtime]) {
      const header = result.headerContent.toString('utf8');
      assert.match(header, new RegExp(`_STARTX = ${Math.round(startX * 16)};`));
      assert.match(header, new RegExp(`_STARTY = ${Math.round(startY * 16)};`));
      assert.equal(result.jsonContent.startX, startX, 'Serialized coordinates remain in tiles');
      assert.equal(result.jsonContent.startY, startY);
    }
  }
  console.log('Player start generation: fractional, integer, negative and single-pixel tile positions preserved without changing project data.');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
