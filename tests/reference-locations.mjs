import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/referenceLocations.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { collectReferenceLocations } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const call = { command: 'EVENT_CALL_SCRIPT', args: { scriptId: 'target' } };
const scenes = [
  { id: 'scene-a', name: 'Same name', script: [call], actors: [{ id: 'actor-a', name: 'Object', onInteractScript: [{ command: 'EVENT_IF', children: { then: [call] } }] }], triggers: [{ id: 'trigger-a', name: 'Object', onEnterScript: [call], onLeaveScript: [call] }] },
  { id: 'scene-b', name: 'Same name', actors: [{ id: 'actor-b', name: 'Object', onInitScript: [call] }] },
  { id: 'deleted', _deleted: true, script: [call] },
];
const locations = collectReferenceLocations(scenes, [{ id: 'caller', name: 'Caller', events: [call] }], 'target', 'script');
assert.equal(locations.length, 6);
assert.equal(locations[0].scriptId, 'caller');
assert.equal(locations[1].sceneId, 'scene-a');
assert.equal(locations[1].sceneObject, undefined);
assert.deepEqual(locations[2].sceneObject, { type: 'actor', id: 'actor-a' });
assert.deepEqual(locations[3].sceneObject, { type: 'trigger', id: 'trigger-a' });
assert.deepEqual(locations[4].sceneObject, { type: 'trigger', id: 'trigger-a' });
assert.equal(locations[5].sceneId, 'scene-b');
assert.deepEqual(locations[5].sceneObject, { type: 'actor', id: 'actor-b' });
console.log('Reference locations preserve scene, script and object IDs, including nested calls and duplicate names.');
