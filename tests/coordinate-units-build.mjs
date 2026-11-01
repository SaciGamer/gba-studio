import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export { EVENT_CATALOG } from './src/shared/events/eventCatalog'; export { COORDINATE_EVENTS } from './src/shared/events/coordinateUnits';` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { EVENT_CATALOG, COORDINATE_EVENTS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const percentageEvents = ['EVENT_BACKGROUND_SET_PARALLAX', 'EVENT_BACKGROUND_SET_SCALE', 'EVENT_BACKGROUND_SET_SHEAR'];
for (const event of EVENT_CATALOG.filter(event => event.payload.x && event.payload.y && !percentageEvents.includes(event.code))) {
  assert.ok(COORDINATE_EVENTS.includes(event.code), `${event.code}: coordinate conversion must be registered`);
  for (const field of ['xUnit', 'yUnit']) assert.deepEqual(event.payload[field]?.options, ['pixels', 'tiles'], `${event.code}.${field}`);
}

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-coordinate-units-'));
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, path.resolve('tools/butano/template'));
  for (const command of ['EVENT_ACTOR_SET_POSITION', 'EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN', 'EVENT_BACKGROUND_SCROLL', 'EVENT_SHOOTER_SPAWN_BOSS', 'EVENT_DISPLAY_VARIABLE_TEXT', 'EVENT_UI_SET_TEXT', 'EVENT_UI_SET_VALUE', 'EVENT_UI_ANIMATE']) {
    for (const [xUnit, yUnit, x, y] of [[undefined, undefined, 3, 2], ['tiles', 'pixels', 48, 2], ['pixels', 'tiles', 3, 32], ['tiles', 'tiles', 48, 32]]) {
      const args = { x: { type: 'number', value: 3 }, y: { type: 'number', value: 2 }, xUnit, yUnit,
        actorId: '__PLAYER__', layerId: 0, archetypeId: 'boss', variableId: '50944154-9406-4b71-bb85-ce08e53d85be', text: 'Test', value: 1, uiId: 'label', animation: 'move', speed: 1 };
      const scene = { _resourceType: 'scene', id: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5', backgrounds: [], script: [{ id: 'f693581a-3cfe-4ef5-a062-8cd7182b8cd8', version: 1, command, args }] };
      const source = builder.processResourceObject(scene);
      const runtime = builder.processRuntimeResource(toRuntimeResource(source.jsonContent));
      for (const result of [source, runtime]) {
        const line = result.headerContent.toString('utf8').split('\n').find(line => /EventData .* = \{/.test(line));
        assert.ok(line?.includes(`, ${x}, ${y}`), `${command}: expected (${x}, ${y}) in ${line}`);
      }
      assert.deepEqual(source.jsonContent.script[0].args.x, args.x, 'Serialization retains editor coordinates');
    }
  }
  for (const command of ['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN']) {
    const result = builder.processResourceObject({ _resourceType: 'scene', id: '1d48336d-9f12-4fd0-995e-3fd4033f7bd5', backgrounds: [], script: [{
      id: 'f693581a-3cfe-4ef5-a062-8cd7182b8cd8', version: 1, command,
      args: { text: 'Test', optionA: 'A', optionB: 'B', resultVariable: '50944154-9406-4b71-bb85-ce08e53d85be', avatarPlacement: 'free', avatarX: 3, avatarY: 2, avatarXUnit: 'tiles', avatarYUnit: 'pixels' },
    }] });
    assert.match(result.headerContent.toString('utf8'), /, 48, 2(?:,| \})/);
  }
  console.log('Coordinate compilation: actor placement/spawn, scroll, boss, text/UI and dialogue portrait units passed.');
} finally { fs.rmSync(output, { recursive: true, force: true }); }
