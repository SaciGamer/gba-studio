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
      { id: 'scroll', command: 'EVENT_BACKGROUND_SCROLL', args: { layerId: 1, x: 8, y: -4 } },
      { id: 'parallax', command: 'EVENT_BACKGROUND_SET_PARALLAX', args: { layerId: 1, x: 50, y: 125 } },
    ],
  });

  const output = result.headerContent.toString('utf8');
  assert.match(output, /static const LayerChangeEventData SCENE_SCENE_LAYER_EVENTS_ARGS_3 = \{ 2, "" \};/);
  assert.match(output, /static const LayerVisibilityEventData SCENE_SCENE_LAYER_EVENTS_ARGS_2 = \{ 2, false \};/);
  assert.match(output, /static const BackgroundScrollEventData SCENE_SCENE_LAYER_EVENTS_ARGS_1 = \{ 1, 8, -4 \};/);
  assert.match(output, /static const BackgroundParallaxEventData SCENE_SCENE_LAYER_EVENTS_ARGS_0 = \{ 1, 50, 125 \};/);
  const eventSource = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'script_command_manager.cpp'), 'utf8');
  const graphicsSource = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'graphics_manager.cpp'), 'utf8');
  assert.match(eventSource, /EVENT_BACKGROUND_SCROLL.*run_background_scroll/);
  assert.match(graphicsSource, /void GraphicsManager::scroll_background/);
  assert.match(graphicsSource, /current_bgs_parallax_x/);
  assert.match(graphicsSource, /\(camera_x \* parallax_x\) \/ 100/);
  assert.match(graphicsSource, /set_background_parallax/);
  console.log('Background-layer event ABI smoke test passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
