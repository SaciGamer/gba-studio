import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-input-group-build-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools', 'butano', 'template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene', id: 'input-groups',
    script: [
      { id: 'disable', command: 'EVENT_INPUT_DISABLE', args: { group: 'gameplay' } },
      { id: 'enable', command: 'EVENT_INPUT_ENABLE', args: { group: 'menu' } },
    ],
  });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /InputGroupEventData SCENE_INPUT_GROUPS_ARGS_\d+ = \{ "gameplay", false \}/);
  assert.match(output, /InputGroupEventData SCENE_INPUT_GROUPS_ARGS_\d+ = \{ "menu", true \}/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid-input-group',
    script: [{ id: 'bad', command: 'EVENT_INPUT_DISABLE', args: { group: 'unknown' } }],
  }), /group must be one of gameplay, menu, interaction, all/);
  console.log('Input group build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
