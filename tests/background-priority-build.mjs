import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')).href);
const graphics = fs.readFileSync(path.join(root, 'tools/butano/template/src/graphics_manager.cpp'), 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-background-priority-'));
try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({ _resourceType: 'scene', id: 'priority', backgrounds: [
    { layerId: 0, backgroundId: 'back' },
    { layerId: 1, backgroundId: 'front', priority: 2, zOrder: -12 },
  ] });
  const output = result.headerContent.toString('utf8');
  assert.match(output, /\{ 0, "back", nullptr, nullptr, nullptr, 0, 0, 3, 0, nullptr, 0 \}/,
    'legacy layers must receive priority 3 and a distinct default z-order');
  assert.match(output, /\{ 1, "front", nullptr, nullptr, nullptr, 0, 0, 2, -12, nullptr, 0 \}/,
    'explicit foreground priority and z-order must survive generation');
  assert.match(graphics, /set_priority\(bn::clamp\(layer\.priority, 0, 3\)\)/);
  assert.match(graphics, /set_z_order\(bn::clamp\(layer\.z_order, -32767, 32767\)\)/);
  assert.doesNotMatch(graphics, /const int priority = bn::clamp\(3 - layer\.layerId/);
  console.log('Background priority/z-order build contract passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
