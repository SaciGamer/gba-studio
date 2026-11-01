import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = fs.readFileSync(path.join(root, 'src', 'shared', 'events', 'eventCatalog.ts'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'src', 'main', 'utils', 'builders', 'ResourceBuilder.ts'), 'utf8');
const dispatcher = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'script_command_manager.cpp'), 'utf8');
const compilerRegistry = fs.readFileSync(path.join(root, 'src', 'main', 'utils', 'events', 'EventCompilerRegistry.ts'), 'utf8');
const runtimeScript = fs.readFileSync(path.join(root, 'src', 'main', 'utils', 'types', 'RuntimeScript.ts'), 'utf8');
const codes = [...catalog.matchAll(/code:\s*'([^']+)'/g)].map(match => match[1]);

assert.ok(codes.length > 0, 'event catalog must not be empty');
for (const code of codes) {
  assert.match(builder, new RegExp(code), `${code} must have a ResourceBuilder path`);
  if (code === 'EVENT_SWITCH') {
    assert.match(runtimeScript, /source\?\.command !== 'EVENT_SWITCH'/, `${code} must lower into runtime condition events`);
  } else {
    assert.match(dispatcher, new RegExp(code), `${code} must have a runtime dispatcher path`);
  }
  assert.match(compilerRegistry, new RegExp(`${code}:`), `${code} must have a compiler registry entry`);
}
console.log(`Event catalog coverage passed (${codes.length} events).`);
