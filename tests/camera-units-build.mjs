import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-camera-units-'));
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, path.resolve('tools/butano/template'));
  for (const command of ['EVENT_PAN_CAMERA', 'EVENT_CAMERA_MOVE_TO']) {
    for (const [xUnit, yUnit, x, y] of [
      [undefined, undefined, 3, -2], ['pixels', 'tiles', 3, -32],
      ['tiles', 'pixels', 48, -2], ['tiles', 'tiles', 48, -32],
    ]) {
      for (const wrapped of [false, true]) {
        const scene = { _resourceType: 'scene', id: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5', backgrounds: [], script: [{
          id: 'f693581a-3cfe-4ef5-a062-8cd7182b8cd8', version: 1, command,
          args: { x: wrapped ? { type: 'number', value: 3 } : 3, y: wrapped ? { type: 'number', value: -2 } : -2, xUnit, yUnit },
        }] };
        const source = builder.processResourceObject(scene);
        const runtime = builder.processRuntimeResource(toRuntimeResource(source.jsonContent));
        for (const result of [source, runtime]) {
          assert.match(result.headerContent.toString('utf8'), new RegExp(`CameraEventData .* = \\{ ${x}, ${y}(?:, true, 256)? \\};`));
        }
      }
    }
    const dynamic = builder.processResourceObject({ _resourceType: 'scene', id: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5', backgrounds: [], script: [{
      id: 'f693581a-3cfe-4ef5-a062-8cd7182b8cd8', version: 1, command,
      args: { x: { kind: 'variable', variableId: '50944154-9406-4b71-bb85-ce08e53d85be' }, y: 0, xUnit: 'tiles' },
    }] }).headerContent.toString('utf8');
    assert.match(dynamic, /NumericOperation::op_multiply/);
    assert.match(dynamic, /NumericOperation::op_number, 16,/);
  }
  console.log('Camera units: per-axis conversion, legacy pixel defaults, negative values, wrapped fields, dynamic variables and runtime projection passed.');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
