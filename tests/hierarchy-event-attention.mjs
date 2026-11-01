import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/shared/events/eventAttention.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { countScriptAttention, countPrefabAttention, countObjectAttention, countSceneAttention, getAdditionalEventWarnings } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const missing = { id: 'missing', command: 'EVENT_CALL_SCRIPT', args: { scriptId: '' } };
const warning = { id: 'warning', command: 'EVENT_WAIT', args: { __referenceWarnings: { variableId: 'Removed variable' } } };
const nested = { id: 'parent', command: 'TEST_CONTAINER', children: { then: [missing], else: [warning] } };
assert.equal(countScriptAttention({ events: [nested], eventGraphs: { init: { nodes: [missing, warning] } } }), 2, 'Nested and graph events are counted once per ID');
assert.equal(countScriptAttention({ events: [{ ...missing, args: { scriptId: 'valid' } }] }), 0, 'Correcting the event clears the indicator');
assert.equal(countScriptAttention({ events: [{ ...nested, args: { __comment: true } }] }), 0, 'Disabled branches do not contribute pending events');
assert.equal(countPrefabAttention({ type: 'actor', actor: { onInitScript: [nested], onInteractScript: [missing], onUpdateScript: [warning] } }), 2);
assert.equal(countPrefabAttention({ type: 'trigger', trigger: { script: [missing], onEnterScript: [missing], onLeaveScript: [warning] } }), 2);
assert.equal(countPrefabAttention({ type: 'trigger', trigger: { onInteractScript: [missing], onInitScript: [warning] } }), 2);
assert.equal(countPrefabAttention({ type: 'actor' }), 0);
assert.equal(countScriptAttention({}), 0);
const actor = { spriteId: null, __referenceWarnings: { spriteId: 'Removed sprite' }, onInitScript: [missing], eventGraphs: { update: { nodes: [missing, warning] } } };
const triggerEvent = { ...missing, id: 'trigger-missing' };
const trigger = { onEnterScript: [triggerEvent], eventGraphs: { enter: { nodes: [triggerEvent] } } };
assert.equal(countObjectAttention(actor), 3, 'Actor includes its sprite and unique events across lists and graphs');
assert.equal(countObjectAttention(trigger), 1, 'Trigger shares the same graph and list counting');
const scene = { id: 'scene', actors: [actor], triggers: [trigger], backgrounds: [{ backgroundId: null, __referenceWarnings: { backgroundId: 'Removed background' } }] };
assert.equal(countSceneAttention(scene), 5, 'Scene aggregates layers, actors and triggers');
assert.equal(countPrefabAttention({ type: 'actor', actor }), countObjectAttention(actor));
assert.equal(countPrefabAttention({ type: 'trigger', trigger }), countObjectAttention(trigger));
const settings = { startSceneId: 'scene', playerSpriteId: null, __referenceWarnings: { playerSpriteId: 'Removed player' } };
assert.equal(countSceneAttention(scene, settings), 6, 'Canvas and sidebar include the initial player warning');
assert.equal(countSceneAttention({ ...scene, id: 'other' }, settings), 5);
assert.equal(countObjectAttention({ ...actor, spriteId: 'replacement', onInitScript: [], eventGraphs: {} }), 0, 'Repair clears the object indicator');
const hidden = { onInitScript: [warning], onEnterScript: [missing], eventGraphs: { init: { nodes: [warning] }, draft: { nodes: [{ ...missing, id: 'graph-only' }] } } };
assert.deepEqual(getAdditionalEventWarnings(hidden, ['onEnterScript', 'onLeaveScript']), [
  { key: 'onInitScript', graph: false, count: 1 },
  { key: 'draft', graph: true, count: 1 },
], 'Every warning in an unlisted trigger slot or graph gets a visible editor, without duplicating list events');
assert.deepEqual(getAdditionalEventWarnings({ ...hidden, onInitScript: [], eventGraphs: {} }, ['onEnterScript']), [], 'Warnings already visible in ordinary tabs need no duplicate editor');
console.log('Script and prefab hierarchy attention: passed');
