import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-background-event-'));

try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools', 'butano', 'template'));
  const result = builder.processResourceObject({
    _resourceType: 'scene',
    id: 'scene-layer-events',
    script: [
      { id: 'change', command: 'EVENT_CHANGE_LAYER', args: { layerId: 2, backgroundId: null } },
      { id: 'visible', command: 'EVENT_VISIBLE_BACKGROUND', args: { layerId: 2, visible: false } },
    ],
  });

  const output = result.headerContent.toString('utf8');
  assert.match(output, /static const LayerChangeEventData SCENE_SCENE_LAYER_EVENTS_ARGS_1 = \{ 2, "" \};/);
  assert.match(output, /static const LayerVisibilityEventData SCENE_SCENE_LAYER_EVENTS_ARGS_0 = \{ 2, false \};/);
  console.log('Background-layer event ABI smoke test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
