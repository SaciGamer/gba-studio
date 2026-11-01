import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { catalog as sharedCatalog } from './helpers/event-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const panel = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/events/PanelEvents.tsx'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/events/RuntimeEventPanel.tsx'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'src/shared/events/eventCatalog.ts'), 'utf8');
const commands = [...catalog.matchAll(/code:\s*'(EVENT_[A-Z0-9_]+)'/g)].map(match => match[1]);
assert.deepEqual(sharedCatalog.EVENT_CATALOG.map(event => event.code), commands, 'Inspector coverage must use the shared TypeScript catalog');

for (const command of commands) {
  const suffix = command.replace(/^EVENT_/, '');
  const route = new RegExp(`(?:${command}|EEvents\\.${suffix})`);
  assert.match(`${panel}\n${runtime}`, route, `${command} must have an inspector route`);
}

assert.match(panel, /RuntimeEventPanel/);
assert.match(panel, /BACKGROUND_SCROLL/);
assert.match(panel, /BACKGROUND_SET_PARALLAX/);
assert.match(runtime, /Factor X/);
assert.match(runtime, /Factor Y/);
assert.match(runtime, /onValueChange/);
console.log(`Panel event coverage passed (${commands.length} events).`);
