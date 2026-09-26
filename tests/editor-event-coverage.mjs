import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = fs.readFileSync(path.join(root, 'src', 'shared', 'events', 'eventCatalog.ts'), 'utf8');
const events = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'interfaces', 'IEvents.tsx'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'SelectNewEvent.tsx'), 'utf8');
const codes = [...catalog.matchAll(/code:\s*'([^']+)'/g)].map(match => match[1]);
const categoryLine = menu.match(/const CATEGORIES = \[([^\]]+)\]/)?.[1] ?? '';
for (const category of ['Audio', 'Dialogue']) {
  assert.match(categoryLine, new RegExp(`"${category}"`), `${category} must be visible in the category selector`);
  assert.match(menu, new RegExp(`^  ${category}:`, 'm'), `${category} must have grouped menu entries`);
}
assert.doesNotMatch(categoryLine, /"Conditions"/, 'Conditions must not be a top-level category');
assert.match(menu, /Scripts:[\s\S]*["']Control Flow["']:\s*\[[\s\S]*EEvents\.IF/, 'IF / Else must be grouped under Scripts');
assert.doesNotMatch(menu, /Variables:[\s\S]*["']Control Flow["']:\s*\[[\s\S]*EEvents\.IF/, 'Variables must not expose a generic IF / Else');
const enumEntries = new Map([...events.matchAll(/\s([A-Z0-9_]+)\s*=\s*'([^']+)'/g)].map(match => [match[2], match[1]]));
for (const code of codes) {
  assert.match(events, new RegExp(`${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${code} missing from event enum/labels`);
  const menuToken = enumEntries.get(code) ? `EEvents\\.${enumEntries.get(code)}` : code;
  assert.match(menu, new RegExp(menuToken), `${code} missing from creation menu`);
}
console.log(`Editor event coverage passed (${codes.length} events).`);
