import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { catalog } from './helpers/event-catalog.mjs';
import { toRuntimeScripts } from '../dist/main/utils/types/RuntimeScript.js';
const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({ entryPoints: [path.join(frontend, 'components/events/eventGraph.ts')], alias: { '@': frontend }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { migrateScriptEvent } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for (const event of catalog.EVENT_CATALOG) {
 assert.equal(event.version, 1, event.code);
 const input = { id: 'f1b41cf8-928f-4d77-878f-aeb267920b77', command: event.code, version: 1, args: {} };
 assert.equal(migrateScriptEvent(input).version, 1);
 for (const version of [2, 3, 4]) {
  assert.throws(() => migrateScriptEvent({ ...input, version }), /Unsupported event schema version/);
  assert.throws(() => toRuntimeScripts([{ ...input, version }]), /unsupported schema version/);
 }
}
for (const command of ['EVENT_SAVE_WRITE', 'EVENT_SAVE_LOAD']) {
 const event = migrateScriptEvent({ id: 'c6f22f44-285f-40cc-bc41-e704441bdc09', command, args: { slot: 7 } });
 assert.equal(event.version, 1);assert.equal(event.args.slot, 7);
 assert.equal(toRuntimeScripts([event])[0].version, 1);
}
let events = 0;
function visit(value, file) {
 if (Array.isArray(value)) { for (const item of value) visit(item, file); return; }
 if (!value || typeof value !== 'object') return;
 if (typeof value.command === 'string' && value.command.startsWith('EVENT_')) {
  assert.equal(value.version, 1, `${file}: ${value.id} ${value.command}`); events++;
 }
 for (const item of Object.values(value)) visit(item, file);
}
function walk(directory) {
 for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) walk(file);
  else if (/\.(gbasres|gbaproj)$/.test(entry.name)) visit(JSON.parse(fs.readFileSync(file, 'utf8')), file);
 }
}
walk('templateEngineGame');assert.ok(events > 0);
console.log(`Schema 1 verified: ${catalog.EVENT_CATALOG.length} contracts and ${events} shipped example events; future versions rejected.`);
