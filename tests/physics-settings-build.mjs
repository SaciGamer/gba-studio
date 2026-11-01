import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
import { toRuntimeResource } from '../dist/main/utils/types/RuntimeResources.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-physics-settings-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const sceneId = randomUUID();
  const event = (command, args = {}) => ({ id: randomUUID(), version: 1, command, args });
  const resource = script => ({ _resourceType: 'scene', id: sceneId, backgrounds: [], script });
  const emit = script => builder.processResourceObject(resource(script)).headerContent.toString();
  const entries = [
    ['EVENT_PHYSICS_SET_GRAVITY', 'gravity', 'gravity', 64, 0.5, 128],
    ['EVENT_PHYSICS_SET_JUMP_SPEED', 'jumpSpeed', 'jump_speed', 1280, 7.5, 1920],
    ['EVENT_PHYSICS_SET_MAX_FALL_SPEED', 'maxFallSpeed', 'max_fall_speed', 1536, 8, 2048],
    ['EVENT_PHYSICS_SET_AIR_JUMPS', 'airJumps', 'air_jumps', 0, -1, -1],
    ['EVENT_PHYSICS_SET_DIAGONAL', 'allowDiagonal', 'allow_diagonal', 1, false, 0],
  ];
  for (const [command, field, native, initial, value, expected] of entries) {
    assert.match(emit([event(command)]), new RegExp(`PhysicsSettingEventData .* = \\{ "__PLAYER__", PhysicsSetting::${native}, ${initial} \\};`));
    const source = builder.processResourceObject(resource([event(command, { [field]: value })]));
    const runtime = builder.processRuntimeResource(toRuntimeResource(source.jsonContent));
    assert.match(runtime.headerContent.toString(), new RegExp(`PhysicsSetting::${native}, ${expected} \\}`));
    assert.equal(source.jsonContent.script[0].args[field], value, 'Saved values retain editor units');
    const manifest = createRuntimeFeatureManifest([toRuntimeResource(resource([event(command)]))]);
    assert.ok(manifest.modules.includes('physics'));
    assert.ok(manifest.headerFiles.includes('include/player_physics.h'));
  }
  assert.match(emit([event('EVENT_PHYSICS_RESET')]), /MovementEventData .* = \{ "__PLAYER__", true,/);
  for (const [command, args] of [
    ['EVENT_PHYSICS_SET_GRAVITY', { gravity: -1 }], ['EVENT_PHYSICS_SET_GRAVITY', { gravity: NaN }],
    ['EVENT_PHYSICS_SET_JUMP_SPEED', { jumpSpeed: 17 }], ['EVENT_PHYSICS_SET_JUMP_SPEED', { actorId: randomUUID() }],
    ['EVENT_PHYSICS_SET_MAX_FALL_SPEED', { maxFallSpeed: Infinity }], ['EVENT_PHYSICS_SET_AIR_JUMPS', { airJumps: 0.5 }],
    ['EVENT_PHYSICS_SET_AIR_JUMPS', { airJumps: -2 }], ['EVENT_PHYSICS_SET_DIAGONAL', { allowDiagonal: 'false' }],
    ['EVENT_PHYSICS_RESET', { actorId: '' }], ['EVENT_PHYSICS_SET_GRAVITY', { gravity: null }],
  ]) assert.throws(() => emit([event(command, args)]), /Invalid/, `${command}: ${JSON.stringify(args)}`);
  const actorId = randomUUID();
  assert.match(emit([event('EVENT_PHYSICS_SET_GRAVITY', { actorId, gravity: 1 })]), new RegExp(`${actorId}", PhysicsSetting::gravity, 256`));
  const nested = event('EVENT_IF', { left: { kind: 'literal', type: 'number', value: 1 }, operator: '==', right: { kind: 'literal', type: 'number', value: 1 } });
  nested.children = { then: [event(entries[0][0])], else: [event(entries[1][0])] };
  const reusable = builder.processResourceObject({ _resourceType: 'scripts', scripts: [{ id: randomUUID(), events: [nested, event('EVENT_PHYSICS_RESET')] }] }).headerContent.toString();
  assert.match(reusable, /PhysicsSetting::gravity/); assert.match(reusable, /PhysicsSetting::jump_speed/);
  assert.match(reusable, /"EVENT_PHYSICS_RESET"/);
  console.log('Independent physics events: Q8 ABI, defaults, validation, player-only settings, nested/reusable scripts and runtime selection passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
