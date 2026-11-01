import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-text-template-'));
try {
  fs.mkdirSync(path.join(temporary, 'include'));
  const builder = new ResourceBuilder(temporary, path.resolve('tools/butano/template'));
  for (const command of ['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_UI_SET_TEXT']) {
    const make = text => builder.processResourceObject({ _resourceType: 'scene', id: '4d1f964e-a29e-41b8-9ba2-38a31c5621e8', backgrounds: [], script: [{ id: 'c6810dcd-0fc9-430a-bf54-e236bb3bd02e', command, version: 1, args: { text, x: 0, y: 0 } }] });
    const text = 'x'.repeat(253) + '${score}';
    assert.ok(make(text).headerContent.toString().includes(text));
    assert.ok(make('${score}'.repeat(40)).headerContent.toString().includes('${score}'.repeat(40)));
    assert.throws(() => make('x'.repeat(256) + '${score}'), /255 UTF-8 bytes/);
  }
  console.log('Text templates: reference metadata excluded from compiler byte limits; full templates preserved; oversized literals rejected.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
