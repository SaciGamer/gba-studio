import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { toRuntimeResource } from '../dist/main/utils/types/RuntimeResources.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-facing-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  fs.mkdirSync(path.join(temp, 'src'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const branch = { id: '3a8d95bb-f625-4a68-81d4-623e9d1cbff1', command: 'EVENT_IF_ACTOR_FACING', version: 1 };
  const resource = script => ({ _resourceType: 'scene', id: '380d3a34-1145-41c4-ab1f-f9fce18b36e9', backgrounds: [], script });
  const emit = script => builder.processResourceObject(resource(script)).headerContent.toString();
  assert.match(emit([branch]), /ActorFacingEventData[^\n]*= \{ "__SELF__", "__PLAYER__", true, true, 0, 0 \}/);
  for (const args of [{ actorId: '' }, { targetActorId: '' }, { actorId: 2 }, { targetActorId: false }, { targetActorId: ' ' }, { lookX: 'yes' }, { lookY: 1 }, { distanceX: -1 }, { distanceY: 1.5 }, { distanceXUnit: 'meters' }]) {
    assert.throws(() => emit([{ ...branch, args }]), /Invalid|requires/);
  }
  assert.throws(() => emit([{ ...branch, version: 2 }]), /unsupported schema version/);
  assert.match(emit([{ ...branch, args: { lookX: true, lookY: false, distanceX: { type: 'number', value: 4 }, distanceY: 12, distanceXUnit: 'tiles' } }]), /"__SELF__", "__PLAYER__", true, false, 64, 12/);
  assert.match(emit([{ ...branch, args: { lookX: false, lookY: true, distanceX: 4, distanceY: 3, distanceYUnit: 'tiles' } }]), /"__SELF__", "__PLAYER__", false, true, 4, 48/);
  const dynamic = emit([{ ...branch, args: { distanceX: { kind: 'variable', variableId: '54520591-68f7-486d-9248-871ee0a27681' }, distanceXUnit: 'tiles' } }]);
  assert.match(dynamic, /offsetof\(ActorFacingEventData, distance_x\)/);
  assert.match(dynamic, /NumericOperation::op_number, 16,/);
  assert.match(dynamic, /NumericOperation::op_multiply/);

  const wait = (id, frames) => ({ id, command: 'EVENT_WAIT', args: { units: 'frames', frames } });
  const nested = emit([{ ...branch, children: {
    then: [wait('41fac50a-19d9-43ce-ac4c-f15ae3f48dad', 2)],
    else: [{ ...branch, id: '330058fe-7266-48aa-a963-136cb1fa5822', children: { then: [wait('d226423f-96d7-42d5-b21a-c335bb879324', 3)] } }],
  } }, wait('6a2366e3-cb25-4692-8a4c-e01daa8ea45d', 4)]);
  const commands = [...nested.matchAll(/\{ "(EVENT_[A-Z_]+)", [^\n]*?, (-?\d+), (-?\d+), (-?\d+) \}/g)];
  assert.ok(commands.length >= 5, nested);
  const facing = commands.filter(c => c[1] === branch.command);
  assert.equal(facing.length, 2);
  assert.notEqual(facing[0][2], facing[0][3], 'then and else have distinct destinations');
  assert.equal(commands[Number(facing[0][2])][1], 'EVENT_WAIT');
  assert.equal(commands[Number(facing[0][3])][1], branch.command);
  assert.equal(commands[Number(facing[0][2])][2], facing[1][3], 'both paths rejoin the continuation');
  const manifest = createRuntimeFeatureManifest([toRuntimeResource(resource([branch]))]);
  assert.ok(manifest.modules.includes('graphics'));
  assert.ok(manifest.modules.includes('scripts'));
  console.log('Facing defaults, malformed payloads, ABI, nested branches and runtime selection passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
