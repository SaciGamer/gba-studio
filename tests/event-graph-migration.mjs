import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'eventGraph.ts'),
  'utf8',
);

assert.match(source, /export function migrateScriptEvent/);
assert.match(source, /EVENT_MIGRATORS/);
assert.match(source, /version === undefined \|\| version === 1/);
assert.match(source, /Unsupported event schema version/);
assert.match(source, /migrateScriptEvent\(event\)/);

console.log('Event graph schema migration guard passed.');
