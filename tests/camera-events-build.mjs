import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-camera-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'camera', name: 'camera', backgrounds: [],
    script: [
      { id: 'move', command: 'EVENT_CAMERA_MOVE_TO', args: { x: 30, y: 40 } },
      { id: 'follow', command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true } },
      { id: 'shake', command: 'EVENT_CAMERA_SHAKE', args: { frames: 12, amplitude: 4 } },
    ],
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /CameraFollowEventData/);
  assert.match(header, /CameraEventData/);
  assert.match(header, /CameraShakeEventData/);
  const pan = (id, x, y) => ({ id, command: 'EVENT_PAN_CAMERA', args: { x: { type: 'number', value: x }, y: { type: 'number', value: y } } });
  const direct = builder.processResourceObject({ _resourceType: 'scene', id: 'direct-pan', backgrounds: [], script: [pan('pan', 312, -40)] }).headerContent.toString();
  const reusable = builder.processResourceObject({ _resourceType: 'scripts', scripts: [
    { id: 'pan-script', events: [pan('pan', 312, -40)], script: [pan('old-pan', 0, 0)] },
    { id: 'cleared', events: [], script: [pan('deleted-pan', 99, 99)] },
    { id: 'legacy', script: [pan('legacy-pan', 16, 24)] },
  ] }).headerContent.toString();
  assert.match(direct, /CameraEventData[^\n]*= \{ 312, -40 \}/);
  assert.match(reusable, /CameraEventData[^\n]*= \{ 312, -40 \}/);
  assert.match(reusable, /CameraEventData[^\n]*= \{ 16, 24 \}/);
  assert.doesNotMatch(reusable, /old-pan|deleted-pan/);
  assert.match(reusable, /SCRIPT_1_SCRIPTS_COUNT = 0/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad', backgrounds: [], script: [{ id: 'bad', command: 'EVENT_CAMERA_SHAKE', args: { frames: 0, amplitude: 2 } }] }), /below 1/);
  console.log('Camera events build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
