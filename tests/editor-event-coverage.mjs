import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { catalog as sharedCatalog } from './helpers/event-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const catalog = fs.readFileSync(path.join(root, 'src', 'shared', 'events', 'eventCatalog.ts'), 'utf8');
const events = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'interfaces', 'IEvents.tsx'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'SelectNewEvent.tsx'), 'utf8');
const codes = [...catalog.matchAll(/code:\s*'([^']+)'/g)].map(match => match[1]);
const categoryLine = menu.match(/const CATEGORIES = \[([^\]]+)\]/)?.[1] ?? '';
for (const category of ['Audio', 'Dialogue']) {
  assert.ok(categoryLine.includes(`"${category}"`) || /const CATEGORIES = Object\.keys\(FUNCTIONS_BY_CATEGORY\)/.test(menu), `${category} must be visible in the category selector`);
  assert.match(menu, new RegExp(`^  ${category}:`, 'm'), `${category} must have grouped menu entries`);
}
assert.doesNotMatch(categoryLine, /"Conditions"/, 'Conditions must not be a top-level category');
assert.match(menu, /Scripts:[\s\S]*["']Control Flow["']:\s*\[[\s\S]*EEvents\.IF/, 'IF / Else must be grouped under Scripts');
assert.doesNotMatch(menu, /Variables:[\s\S]*["']Control Flow["']:\s*\[[\s\S]*EEvents\.IF/, 'Variables must not expose a generic IF / Else');
const enumEntries = new Map([...events.matchAll(/\s([A-Z0-9_]+)\s*=\s*'([^']+)'/g)].map(match => [match[2], match[1]]));
// Ignore commented-out entries: they are not available in the creation menu.
const activeMenu = menu.replace(/^\s*\/\/.*$/gm, '');
for (const code of codes) {
  assert.match(events, new RegExp(`${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${code} missing from event enum/labels`);
  const creationCodes = sharedCatalog.EVENT_CREATION_REPLACEMENTS[code] ?? [code];
  for (const creationCode of creationCodes) {
    assert.ok(codes.includes(creationCode), `${code} replacement must exist in the catalog`);
    const menuToken = enumEntries.get(creationCode) ? `EEvents\\.${enumEntries.get(creationCode)}` : creationCode;
    assert.ok(new RegExp(menuToken).test(activeMenu), `${code} missing creation entry ${creationCode}`);
  }
}
console.log(`Editor event coverage passed (${codes.length} events).`);
