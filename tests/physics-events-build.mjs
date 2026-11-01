import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { toRuntimeResource } from '../dist/main/utils/types/RuntimeResources.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-physics-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  fs.mkdirSync(path.join(temp, 'src'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const event = (command, args = {}, id = command) => ({ id, command, args });
  const emit = script => builder.processResourceObject({ _resourceType: 'scene', id: 'physics', backgrounds: [], script }).headerContent.toString();
  const config = 'EVENT_CONFIGURE_MOVEMENT', impulse = 'EVENT_APPLY_VERTICAL_IMPULSE';
  const defaults = emit([event(config), event(impulse)]);
  assert.match(defaults, /MovementEventData[^\n]*= \{ "__PLAYER__", false, true, 64, 1280, 1536, 0 \}/);
  assert.match(defaults, /VerticalImpulseEventData[^\n]*= \{ "__PLAYER__", -1280, false \}/);
  assert.match(defaults, /"EVENT_CONFIGURE_MOVEMENT", &/);
  assert.match(defaults, /"EVENT_APPLY_VERTICAL_IMPULSE", &/);
  assert.match(emit([event(config, { speed: 12 })]), /MovementEventData[^\\n]*= \{ "__PLAYER__", false, true, 64, 1280, 1536, 0 \}/);
  const custom = emit([event(config, { actorId: "enemy", allowDiagonal: false, gravity: 0, jumpSpeed: 7.5, maxFallSpeed: 8, airJumps: -1 }), event(impulse, { impulse: -2.25, mode: 'add' })]);
  assert.match(custom, /MovementEventData[^\n]*= \{ "enemy", false, false, 0, 1920, 2048, -1 \}/);
  assert.match(custom, /VerticalImpulseEventData[^\n]*= \{ "__PLAYER__", -576, true \}/);
  assert.match(emit([event(config, { reset: true })]), /MovementEventData[^\n]*= \{ "__PLAYER__", true,/);
  for(const [command, args] of [
    [config, { gravity: -1 }], [config, { gravity: 17 }], [config, { gravity: NaN }],
    [config, { jumpSpeed: Infinity }], [config, { airJumps: 0.5 }], [config, { airJumps: -2 }],
    [config, { actorId: '' }], [impulse, { actorId: 1 }], [config, { allowDiagonal: 'false' }], [config, { jumpSpeed: '2' }],
    [impulse, { mode: 'unknown' }], [impulse, { impulse: -17 }], [impulse, { impulse: Infinity }],
  ]) assert.throws(() => emit([event(command, args)]), /Invalid EVENT_/);
  assert.throws(() => emit([{ ...event(config), version: 2 }]), /unsupported schema version/);
  const nested = builder.processResourceObject({ _resourceType: 'scripts', scripts: [{ id: 'physics-script', events: [
    { id: 'loop', command: 'EVENT_FOR', args: { variableId: 'counter', start: 0, end: 2, step: 1 }, children: { then: [event(config), event(impulse)] } },
    event(config, { reset: true }, 'restore'),
  ] }] }).headerContent.toString();
  assert.match(nested, /MovementEventData/);
  assert.match(nested, /VerticalImpulseEventData/);
  const manifest = createRuntimeFeatureManifest([toRuntimeResource({ _resourceType: 'scene', id: 'physics', backgrounds: [], script: [event(config), event(impulse)] })]);
  assert.ok(manifest.headerFiles.includes('include/player_physics.h'));
  assert.ok(manifest.modules.includes('graphics'));
  console.log('Physics event defaults, Q8 ABI, malformed payloads, reusable scripts and selective runtime headers passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
