import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalog } from './helpers/event-catalog.mjs';
const { ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-ui-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const commands = ['EVENT_UI_HIDE', 'EVENT_UI_SHOW', 'EVENT_UI_DESTROY'];
  for (const command of commands) {
    assert.equal(catalog.EVENT_CATALOG_BY_CODE[command].execution, 'instant');
    assert.deepEqual(catalog.EVENT_DEFAULTS[command], { uiId: '' });
    for (const args of [{}, { uiId: '' }, { uiId: ' ' }, { uiId: 1 }]) {
      assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'invalid', backgrounds: [], script: [{ id: 'bad', command, args }] }), /uiId/);
    }
    assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'invalid', backgrounds: [], script: [{ id: 'bad', command, version: 3, args: { uiId: 'text' } }] }), /version/);
  }
  const result = builder.processResourceObject({ _resourceType: 'scene', id: 'ui_lifecycle', backgrounds: [], script: [
    { id: 'text', command: 'EVENT_UI_SET_TEXT', args: { text: 'Test', x: 0, y: 0, font: 'fixed8x16' } },
    { id: 'branch', command: 'EVENT_IF', args: { left: { kind: 'literal', type: 'boolean', value: true }, operator: '==', right: { kind: 'literal', type: 'boolean', value: true } }, children: {
      then: [{ id: 'hide', command: commands[0], args: { uiId: 'text' } }, { id: 'show', command: commands[1], args: { uiId: 'text' } }],
      else: [{ id: 'destroy', command: commands[2], args: { uiId: 'text' } }]
    } },
    { id: 'after', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } }
  ] });
  const header = result.headerContent.toString('utf8');
  for (const command of commands) {
    assert.match(header, new RegExp(`"${command}", &SCENE_UI_LIFECYCLE_ARGS_\\d+`));
  }
  assert.equal([...header.matchAll(/static const UiTargetEventData .* = \{ "text" \};/g)].length, 3);
  console.log('UI lifecycle schemas, defaults, malformed payloads, typed ABI and branch generation passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
