import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const graph = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'eventGraph.ts'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'src', 'renderer', 'frontend', 'src', 'components', 'events', 'FlowEditorManager.tsx'), 'utf8');
assert.match(graph, /export function validateScriptGraph/);
assert.match(graph, /duplicate node id/);
assert.match(graph, /orphan edge/);
assert.match(graph, /cycle edge/);
assert.match(flow, /validateScriptGraph\(graph\)/);
console.log('Event graph validation guard passed.');
