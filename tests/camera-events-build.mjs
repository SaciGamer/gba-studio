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
      { id: 'follow-actor', command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true, actorId: '013d6cd9-7244-4b7a-a5e1-f3cc25dc94ed', clampToScene: true, deadZoneWidth: 80, deadZoneHeight: 40 } },
      { id: 'shake', command: 'EVENT_CAMERA_SHAKE', args: { frames: 12, amplitude: 4 } },
      { id: 'horizontal', command: 'EVENT_CAMERA_SHAKE', args: { frames: 30, amplitude: 8, axis: 'horizontal', customShake: true } },
      { id: 'vertical', command: 'EVENT_CAMERA_SHAKE', args: { frames: 20, amplitude: 16, axis: 'vertical', customShake: true } },
    ],
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /CameraFollowEventData/);
  assert.match(header, /CameraFollowEventData[^\n]*= \{ true, "__PLAYER__", false, 0, 0, false, false, false \}/);
  assert.match(header, /CameraFollowEventData[^\n]*= \{ true, "013d6cd9-7244-4b7a-a5e1-f3cc25dc94ed", true, 80, 40, false, false, false \}/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-follow', backgrounds: [], script: [{ id: 'bad', command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true, deadZoneWidth: 241 } }] }), /deadZoneWidth/);
  for (const [lockX, lockY] of [[true, false], [false, true], [true, true], [false, false]]) {
    const result = builder.processResourceObject({ _resourceType: 'scene', id: 'fac33e5f-6c80-4b29-8073-ef5bbc0487dc', backgrounds: [], script: [{ id: '5d3cf831-a5c6-41d0-8b31-bf7979db35db', version: 1, command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true, lockX, lockY } }] });
    assert.match(result.headerContent.toString(), new RegExp(`CameraFollowEventData[^\\n]*= \\{ true, "__PLAYER__", false, 0, 0, ${lockX}, ${lockY}, false \\}`));
  }
  for (const field of ['lockX', 'lockY', 'persistAcrossScenes']) assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: '2b43d608-9c44-41b6-a48d-0d622493938c', backgrounds: [], script: [{ id: 'e815f3a4-1420-47fd-80a3-3416596694d0', command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true, [field]: 'yes' } }] }), new RegExp(field));
  const persistent = builder.processResourceObject({ _resourceType: 'scene', id: 'cc692d22-f32d-45bc-805f-60d2a466c586', backgrounds: [], script: [{ id: 'eb024683-e340-4711-84fa-bb73654863c2', command: 'EVENT_CAMERA_FOLLOW', args: { enabled: true, persistAcrossScenes: true, lockX: true } }] });
  assert.match(persistent.headerContent.toString(), /CameraFollowEventData[^\n]*= \{ true, "__PLAYER__", false, 0, 0, true, false, true \}/);
  assert.match(header, /CameraEventData/);
  assert.match(header, /CameraShakeEventData/);
  assert.match(header, /CameraShakeEventData[^\n]*= \{ 12, 4, 0 \}/);
  assert.match(header, /CameraShakeEventData[^\n]*= \{ 30, 8, 1 \}/);
  assert.match(header, /CameraShakeEventData[^\n]*= \{ 20, 8, 2 \}/);
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
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad-axis', backgrounds: [], script: [{ id: 'bad', command: 'EVENT_CAMERA_SHAKE', args: { frames: 8, amplitude: 2, axis: 'diagonal' } }] }), /axis/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bd308c49-753d-4b2e-b3c5-f37eb9e52f86', backgrounds: [], script: [{ id: 'c7c6155d-796d-40e2-b935-29154dc902dd', command: 'EVENT_CAMERA_STOP_FOLLOW', version: 2, args: {} }] }), /schema version/);
  for (const args of [{ actorId: '__PLAYER__' }, { actorId: '013d6cd9-7244-4b7a-a5e1-f3cc25dc94ed' }, { actorId: '__PLAYER__', enabled: false }]) {
    const follow = builder.processResourceObject({ _resourceType: 'scene', id: '4b90dc83-1794-4fa4-80a1-fc66c071ab89', backgrounds: [], script: [{ id: '50378f0b-d1c6-454e-82d6-1cd507c27966', version: 1, command: 'EVENT_CAMERA_FOLLOW', args }] });
    assert.match(follow.headerContent.toString(), /CameraFollowEventData[^\n]*= \{ true,/);
  }
  console.log('Camera events build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
