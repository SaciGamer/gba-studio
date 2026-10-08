import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-menu-'));
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
  assert.match(header, /, 4 \};/);
  const runtime = fs.readFileSync(path.join(process.cwd(), 'tools', 'butano', 'template', 'src', 'dialogue_manager.cpp'), 'utf8');
  const runtimeHeader = fs.readFileSync(path.join(process.cwd(), 'tools', 'butano', 'template', 'include', 'dialogue_manager.h'), 'utf8');
  assert.match(runtime, /choice_options_count/);
  assert.match(runtimeHeader, /choice_index = \(choice_index \+ direction \+ choice_options_count\)/);
  console.log('Menu options build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
