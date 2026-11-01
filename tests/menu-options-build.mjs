import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-menu-'));
const testSceneId = '4d1f964e-a29e-41b8-9ba2-38a31c5621e8';
const testChoiceId = 'c6810dcd-0fc9-430a-bf54-e236bb3bd02e';
assert.match(testSceneId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.match(testChoiceId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.notEqual(testSceneId, testChoiceId);
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(process.cwd(), 'tools', 'butano', 'template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'menu-scene', name: 'menu-scene', backgrounds: [],
    script: [{ id: 'menu', command: 'EVENT_MENU_OPEN', version: 1, args: {
      prompt: 'Title', options: ['START', 'HOW TO PLAY', 'CREDITS', 'RUMBLE ON/OFF'],
      resultVariable: 'menu-result',
    } }],
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /DialogueChoiceEventData/);
  assert.ok(header.includes('START\\nHOW TO PLAY\\nCREDITS\\nRUMBLE ON/OFF'));
  assert.match(header, /RUMBLE ON\/OFF", "fixed8x16".*1, false, 0, 0 \};/);
  const runtime = fs.readFileSync(path.join(process.cwd(), 'tools', 'butano', 'template', 'src', 'dialogue_manager.cpp'), 'utf8');
  const runtimeHeader = fs.readFileSync(path.join(process.cwd(), 'tools', 'butano', 'template', 'include', 'dialogue_manager.h'), 'utf8');
  assert.match(runtime, /choice_options_count/);
  assert.match(runtimeHeader, /choice_index = menu_layout::move/);
  const emit = args => builder.processResourceObject({ _resourceType: 'scene', id: 'grid', name: 'Grid', backgrounds: [], script: [{ id: 'grid-menu', command: 'EVENT_MENU_OPEN', args: { resultVariable: 'menu-result', ...args } }] }).headerContent.toString('utf8');
  const labels = Array.from({ length: 32 }, (_, index) => `A${index}`);
  const grid = emit({ showTitle: false, prompt: 'hidden title', columns: 4, optionOrder: 'columns', options: labels });
  assert.ok(grid.includes(JSON.stringify(labels.join('\n'))));
  assert.match(grid, /DialogueChoiceEventData.*= \{ "",/);
  assert.match(grid, /4, true, 0, 0 \};/);
  const right = emit({ position: 'right', showTitle: false, options: ['R'], initialSelection: 0 });
  assert.match(right, /1, false, 0, 3 \};/);
  const choice = builder.processResourceObject({ _resourceType: 'scene', id: testSceneId, name: 'Binary', backgrounds: [], script: [{ id: testChoiceId, command: 'EVENT_DIALOGUE_CHOICE', args: { columns: 4, optionOrder: 'columns', optionA: 'Yes', optionB: 'No', initialSelection: 1, resultVariable: 'menu-result' } }] }).headerContent.toString('utf8');
  assert.match(choice, /1, false, 1, 0 \};/, 'Choice must stay in one column and compile its initial selection');
  assert.throws(() => emit({ options: [...labels, 'extra'] }), /optionCount/);
  assert.throws(() => emit({ columns: 4, options: ['Long label'] }), /optionWidth/);
  assert.throws(() => emit({ prompt: 'A'.repeat(57), options: ['Yes'] }), /promptRows/);
  assert.throws(() => emit({ options: [] }), /emptyOptions/);
  console.log('Menu options build contract passed.');
} finally {
  assert.ok(path.resolve(tempDir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(tempDir).startsWith('gba-studio-menu-'));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
