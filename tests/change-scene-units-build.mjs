import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-scene-units-'));
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, path.resolve('tools/butano/template'));
  for (const [xUnit, yUnit, expectedX, expectedY] of [
    ['pixels', 'tiles', 16, 160],
    ['tiles', 'pixels', 256, 10],
    ['pixels', 'pixels', 16, 10],
    ['tiles', 'tiles', 256, 160],
    [undefined, undefined, 256, 160],
  ]) {
    for (const wrapped of [false, true]) {
      const args = { sceneId: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5',
        x: wrapped ? { type: 'number', value: 16 } : 16,
        y: wrapped ? { type: 'number', value: 10 } : 10,
        xUnit, yUnit, direction: 'right', fadeSpeed: 2 };
      const event = { id: 'f693581a-3cfe-4ef5-a062-8cd7182b8cd8', version: 1, command: 'EVENT_CHANGE_SCENE', args };
      for (const resource of [
        { _resourceType: 'scene', id: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5', backgrounds: [], script: [event] },
        { _resourceType: 'scripts', id: 'ce738717-d102-4bf5-9254-63af2eeefb45', scripts: [{ id: '87de1e70-376a-4b96-bd5f-a0ebd61d47e2', events: [event] }] },
      ]) {
        const source = builder.processResourceObject(structuredClone(resource));
        const runtime = builder.processRuntimeResource(toRuntimeResource(source.jsonContent));
        for (const result of [source, runtime]) {
          assert.match(result.headerContent.toString('utf8'), new RegExp(`SceneChangeEventData .* = \\{ "${args.sceneId}", ${expectedX}, ${expectedY}, "right", 2 \\};`));
        }
      }
    }
  }
  console.log('Change Scene: independent axis units, tile defaults, numeric fields, scene/reusable scripts and runtime projection passed.');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
