import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')));
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/AssetBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-preparation-boundary-'));
try {
  const project = path.join(temp, 'project');
  const output = path.join(temp, 'output');
  fs.mkdirSync(project);
  fs.mkdirSync(path.join(output, 'include'), { recursive: true });
  fs.mkdirSync(path.join(output, 'src'));
  const settings = { _resourceType: 'settings', id: 'settings', name: 'Original Display Name', inputMap: {} };
  const original = JSON.stringify(settings, null, 2);
  fs.writeFileSync(path.join(project, 'z.gbasres'), original);
  fs.writeFileSync(path.join(project, 'a.gbasres'), JSON.stringify({ _resourceType: 'scene', id: 'scene', name: 'Scene', sceneType: 'LOGO', backgrounds: [] }));
  const builder = new ResourceBuilder(output, path.join(root, 'tools/butano/template'));
  const files = await builder.processResourceFiles(project);
  assert.deepEqual(files.map(file => file.jsonContent.id), ['scene', 'settings']);
  assert.deepEqual(fs.readdirSync(path.join(output, 'include')), [], 'Preparation must not write game headers');
  assert.ok(files.every(file => file.headerContent.length === 0));
  await assert.rejects(builder.writeResourceHeader(files), /preparation data requires processRuntimeResource/);
  await assert.rejects(builder.generateResourceRegistryClass(files, { projectName: 'invalid-preparation' }), /preparation data requires processRuntimeResource/);
  assert.ok(files[1].jsonContent.inputMap.move_up, 'Legacy defaults are resolved in the independent build copy');
  files[1].jsonContent.name = 'prepared_name';
  files[1].jsonContent.startSceneId = 'scene';
  const emitted = files.map(file => builder.processRuntimeResource(toRuntimeResource(file.jsonContent)));
  assert.match(emitted[1].headerContent.toString(), /STARTSCENEID\[\] = "scene"/);
  assert.doesNotMatch(emitted[1].headerContent.toString(), /prepared_name/);
  assert.equal(fs.readFileSync(path.join(project, 'z.gbasres'), 'utf8'), original);
  fs.writeFileSync(path.join(project, 'bad.gbasres'), '{ invalid');
  await assert.rejects(builder.processResourceFiles(project), /bad.gbasres.*Invalid resource JSON/);

  const defaults = path.join(temp, 'defaults');
  fs.mkdirSync(defaults);
  for (const name of ['cursor.png', 'frame.png']) fs.writeFileSync(path.join(defaults, name), name);
  const savedAssets = path.join(temp, 'saved-assets');
  const assets = new AssetBuilder(root, output);
  // Exercise destination and source selection independently of ImageMagick.
  const processed = [];
  assets.processAssets = async (source, destination, category) => processed.push({ source, destination, category });
  await assets.prepareUiDefaults(savedAssets, [defaults]);
  assert.equal(fs.existsSync(savedAssets), false, 'Build must not create saved asset directories');
  assert.equal(processed.length, 2);
  assert.ok(processed.every(item => item.category === 'ui' && item.destination.startsWith(output + path.sep)));
  fs.mkdirSync(path.join(savedAssets, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(savedAssets, 'ui', 'frame.png'), 'custom');
  processed.length = 0;
  await assets.prepareUiDefaults(savedAssets, [defaults]);
  assert.equal(processed.length, 1);
  assert.equal(fs.readFileSync(path.join(savedAssets, 'ui', 'frame.png'), 'utf8'), 'custom');
  await assert.rejects(assets.prepareUiDefaults(path.join(temp, 'missing-assets'), []), /Default UI asset not found/);
  console.log('Preparation boundary passed: no preliminary headers, stable order, legacy build copies, invalid JSON errors and UI defaults outside saved assets.');
} finally {
  const resolved = path.resolve(temp);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(resolved).startsWith('gba-studio-preparation-boundary-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
