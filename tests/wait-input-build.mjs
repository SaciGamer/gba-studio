import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-wait-input-build-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'wait_input', sceneType: 'Top Down', sceneWidth: 256, sceneHeight: 256,
    script: [{ id: 'wait', command: 'EVENT_WAIT_INPUT', args: { action: 'confirm', timeoutFrames: 12 } }],
  });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /static const WaitInputEventData SCENE_WAIT_INPUT_ARGS_0 = \{ "confirm", 12 \};/);
  assert.match(output, /\{ "wait", "EVENT_WAIT_INPUT", &SCENE_WAIT_INPUT_ARGS_0/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid', script: [{ id: 'bad', command: 'EVENT_WAIT_INPUT', args: { action: '', timeoutFrames: -1 } }],
  }), /action|required|timeout/i);
  console.log('Wait input build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
