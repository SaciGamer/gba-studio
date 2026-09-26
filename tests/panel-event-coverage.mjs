import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EVENT_CATALOG as runtimeCatalog } from '../src/shared/events/eventCatalog.js';

const root = path.resolve(import.meta.dirname, '..');
const panel = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/events/PanelEvents.tsx'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/events/RuntimeEventPanel.tsx'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src/shared/events/eventCatalog.ts'), 'utf8');
const commands = [...catalog.matchAll(/code:\s*'(EVENT_[A-Z0-9_]+)'/g)].map(match => match[1]);
assert.deepEqual(runtimeCatalog.map(event => event.code), commands, 'JavaScript catalog must mirror TypeScript catalog');

for (const command of commands) {
  const suffix = command.replace(/^EVENT_/, '');
  const route = new RegExp(`(?:${command}|EEvents\\.${suffix})`);
  assert.match(`${panel}\n${runtime}`, route, `${command} must have an inspector route`);
}

assert.match(panel, /RuntimeEventPanel/);
assert.match(runtime, /onValueChange/);
console.log(`Panel event coverage passed (${commands.length} events).`);
