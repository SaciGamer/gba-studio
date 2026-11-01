import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: [path.resolve('src/renderer/frontend/src/components/events/eventTree.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { EVENT_BRANCHES, findEventLocation, insertEvent, eventInsertionError, cloneEventTree } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const wait = id => ({ id, command: 'EVENT_WAIT', args: { frames: 10, __collapse: true } });
const parent = (id, command, children = { then: [], else: [] }) => ({ id, command, args: { __collapse: true, value: { type: 'number', value: 0 } }, children });

// Every branch rendered by the editor accepts round trips without losing data.
for (const [command, branches] of Object.entries(EVENT_BRANCHES)) {
  for (const branch of branches) {
    if (command === 'EVENT_SWITCH' && branch === 'then') continue;
    const container = parent('parent', command);
    const events = command === 'EVENT_SWITCH_CASE'
      ? [parent('switch', 'EVENT_SWITCH', { then: [container], else: [] }), wait('moving')]
      : [container, wait('moving')];
    const before = structuredClone(events);
    const inside = insertEvent(events, events.at(-1), { parentId: 'parent', branch }, true);
    assert.equal(findEventLocation(inside, 'moving').ancestors.at(-1).event.id, 'parent', `${command}.${branch}: internalize`);
    const outside = insertEvent(inside, findEventLocation(inside, 'moving').event, {}, true);
    assert.equal(findEventLocation(outside, 'moving').ancestors.length, 0, `${command}.${branch}: externalize to root end`);
    assert.deepEqual(events, before, 'source tree must remain immutable');
  }
}
const initial = [parent('if', 'EVENT_IF', { then: [wait('a'), wait('b')], else: [wait('c')] }), wait('root')];
const reordered = insertEvent(initial, findEventLocation(initial, 'a').event, { siblingId: 'b', position: 'after' }, true);
assert.deepEqual(reordered[0].children.then.map(event => event.id), ['b', 'a']);
const crossed = insertEvent(initial, findEventLocation(initial, 'a').event, { siblingId: 'c', position: 'after' }, true);
assert.deepEqual(crossed[0].children.else.map(event => event.id), ['c', 'a']);
assert.deepEqual(crossed[0].children.then.map(event => event.id), ['b']);
assert.equal(insertEvent(initial, initial[0], { siblingId: 'a' }, true), initial, 'cannot put a parent inside itself');
assert.equal(insertEvent(initial, initial[0], { parentId: 'if', branch: 'then' }, true), initial);
assert.equal(insertEvent(initial, initial[1], { parentId: 'root', branch: 'then' }, true), initial);

const caseEvent = parent('case', 'EVENT_SWITCH_CASE', { then: [wait('body')], else: [] });
const switchEvents = [parent('switch', 'EVENT_SWITCH', { then: [caseEvent], else: [] }), wait('root')];
assert.equal(eventInsertionError(switchEvents, switchEvents[1], { parentId: 'switch', branch: 'then' }), 'caseOnly');
assert.equal(eventInsertionError(switchEvents, caseEvent, {}), 'caseOutside');
assert.equal(eventInsertionError(switchEvents, { ...caseEvent, id: 'new', args: { value: { type: 'string', value: 'x' } } }, { siblingId: 'case' }), 'caseType');
const caseCopy = cloneEventTree(caseEvent, () => crypto.randomUUID());
const casePaste = insertEvent(switchEvents, caseCopy, { siblingId: 'case', position: 'after' });
assert.equal(casePaste[0].children.then.length, 2);
assert.notEqual(caseCopy.children.then[0].id, 'body');

const stop = { id: 'break', command: 'EVENT_BREAK', args: {} };
const loop = parent('loop', 'EVENT_WHILE', { then: [parent('if', 'EVENT_IF', { then: [stop], else: [] })] });
assert.equal(eventInsertionError([loop], stop, {}), 'loopOnly');
assert.equal(eventInsertionError([loop], loop.children.then[0], {}), 'loopOnly', 'nested break cannot escape its loop');
assert.equal(eventInsertionError([loop], loop, {}), undefined, 'whole loops may move');
const save = parent('save', 'EVENT_SAVE_WRITE');
const loopWithSave = parent('loop', 'EVENT_FOR', { then: [save] });
assert.equal(eventInsertionError([loopWithSave], stop, { parentId: 'save', branch: 'then' }), undefined);
assert.equal(eventInsertionError([loopWithSave], stop, { parentId: 'save', branch: 'else' }), 'invalidBranch', 'Save has only its own On Save actions');

const source = { ...initial[0], args: { __automatic: true, value: { nested: [1, 2] } } };
const copy = cloneEventTree(source, () => crypto.randomUUID());
copy.args.value.nested.push(3);
assert.deepEqual(source.args.value.nested, [1, 2]);
assert.equal(copy.args.__automatic, undefined);
assert.notEqual(copy.id, source.id);
console.log('Event tree editing: all branches, reorder, internalize/externalize, cycles, Switch, loop scopes and independent copies passed.');
