import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-button-action-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));fs.mkdirSync(path.join(temp, 'src'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const event = (id, command, args = {}, children) => ({ id, command, args, ...(children ? { children } : {}) });
  const emit = script => builder.processResourceObject({ _resourceType: 'scene', id: 'buttons', backgrounds: [], script }).headerContent.toString();
  const code = emit([
    event('attach', 'EVENT_WAIT_FOR_BUTTON', { buttons: ['A'], overrideButton: true }, { then: [event('default', 'EVENT_RUN_BUTTON_ACTION', { button: 'B', mode: 'default' })] }),
    event('custom', 'EVENT_RUN_BUTTON_ACTION', { button: 'RIGHT', mode: 'custom' }),
    event('stop', 'EVENT_STOP_PHYSICS', { actorId: '__PLAYER__' }),
  ]);
  assert.match(code, /ButtonActionEventData[^\n]*= \{ "B", false \}/);
  assert.match(code, /ButtonActionEventData[^\n]*= \{ "RIGHT", true \}/);
  assert.match(code, /StopPhysicsEventData[^\n]*= \{ "__PLAYER__" \}/);
  assert.match(code, /"EVENT_RUN_BUTTON_ACTION", &/);
  assert.match(code, /"EVENT_STOP_PHYSICS", &/);
  const defaults = emit([event('action', 'EVENT_RUN_BUTTON_ACTION'), event('stop', 'EVENT_STOP_PHYSICS')]);
  assert.match(defaults, /ButtonActionEventData[^\n]*= \{ "B", false \}/);
  assert.match(defaults, /StopPhysicsEventData[^\n]*= \{ "__PLAYER__" \}/);
  for(const args of [{ button: 'INVALID' }, { mode: 'other' }, { button: 12 }])
    assert.throws(() => emit([event('bad', 'EVENT_RUN_BUTTON_ACTION', args)]), /Invalid EVENT_RUN_BUTTON_ACTION/);
  assert.throws(() => emit([event('bad', 'EVENT_STOP_PHYSICS', { actorId: '' })]), /actorId must select an actor/);
  console.log('Button Action / Stop Physics: defaults, typed ABI, attach branch integration and malformed payloads passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
