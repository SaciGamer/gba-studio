import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/shared/events/sceneReferenceCleanup.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { clearDeletedSceneReferences } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const source = [
  { id: 'direct', command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'deleted', x: 1 } },
  { id: 'keep', command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'existing' } },
  { id: 'branch', command: 'EVENT_IF', children: { then: [{ command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'deleted' } }] } },
];
const result = clearDeletedSceneReferences(source, new Set(['deleted']));
assert.equal(result.changed, true);
assert.equal(result.value[0].args.sceneId, '');
assert.equal(result.value[1].args.sceneId, 'existing');
assert.equal(result.value[2].children.then[0].args.sceneId, '');
assert.equal(source[0].args.sceneId, 'deleted', 'Input remains immutable');
const unchanged = clearDeletedSceneReferences(source, new Set(['other']));
assert.equal(unchanged.changed, false);
assert.equal(unchanged.value, source, 'Unchanged data retains identity');
console.log('Deleted scene reference cleanup: direct and nested Change Scene events are cleared immutably.');
