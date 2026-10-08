import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = fs.readFileSync(path.join(root, 'src/shared/events/eventCatalog.ts'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'src/main/utils/builders/ResourceBuilder.ts'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'tools/butano/template/src/script_event_handlers.cpp'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'tools/butano/template/src/script_command_manager.cpp'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'tools/butano/template/src/input_manager.cpp'), 'utf8');
for (const code of ['EVENT_INPUT_ENABLE', 'EVENT_INPUT_DISABLE']) assert.match(catalog, new RegExp(code));
assert.match(builder, /InputGroupEventData/);
assert.match(handler, /set_group_enabled/);
assert.match(manager, /EVENT_INPUT_ENABLE.*EVENT_INPUT_DISABLE/s);
assert.match(runtime, /disabled_groups/);
console.log('Input group event contract passed.');
