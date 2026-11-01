import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({ entryPoints: [path.join(root, 'src/main/utils/types/RuntimeScript.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const source = bundled.outputFiles[0].text;
const { toRuntimeScripts } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const literal = (type, value) => ({ kind: 'literal', type, value });
const command = (id, command) => ({ id, command, args: {} });
const input = [{ id: 'switch', command: 'EVENT_SWITCH', args: { value: literal('string', 'mode') }, children: {
  then: [
    { id: 'case-number', command: 'EVENT_SWITCH_CASE', args: { value: literal('string', 'slow') }, children: { then: [command('one', 'EVENT_BREAK')] } },
    { id: 'case-text', command: 'EVENT_SWITCH_CASE', args: { value: literal('string', 'fast') }, children: { then: [command('two', 'EVENT_CONTINUE')] } },
    { id: 'case-last', command: 'EVENT_SWITCH_CASE', args: { value: literal('string', 'yes') }, children: { then: [] } },
  ],
  else: [command('default', 'EVENT_BREAK')],
} }];
const [first] = toRuntimeScripts(input);
assert.equal(first.command, 'EVENT_IF');
assert.deepEqual(first.args.left, literal('string', 'mode'));
assert.deepEqual(first.args.right, literal('string', 'slow'));
assert.equal(first.children.then[0].command, 'EVENT_BREAK');
const [second] = first.children.else;
assert.equal(second.command, 'EVENT_IF');
assert.deepEqual(second.args.right, literal('string', 'fast'));
const [third] = second.children.else;
assert.equal(third.command, 'EVENT_IF');
assert.deepEqual(third.args.right, literal('string', 'yes'));
assert.equal(third.children.else[0].id, 'default');
assert.equal(input[0].children.then[0].command, 'EVENT_SWITCH_CASE', 'lowering must not mutate authored events');
for (const [type, value] of [['number', 2], ['boolean', true]]) {
  const [typedSwitch] = toRuntimeScripts([{ id: `switch-${type}`, command: 'EVENT_SWITCH', args: { value: literal(type, value) }, children: {
    then: [{ id: `case-${type}`, command: 'EVENT_SWITCH_CASE', args: { value: literal(type, value) }, children: { then: [] } }], else: [],
  } }]);
  assert.deepEqual(typedSwitch.args.left, literal(type, value));
  assert.deepEqual(typedSwitch.args.right, literal(type, value));
}
const [coerced] = toRuntimeScripts([{ id: 'switch-coerce', command: 'EVENT_SWITCH', args: { value: literal('number', 2) }, children: {
  then: [{ id: 'case-coerce', command: 'EVENT_SWITCH_CASE', args: { value: literal('string', '2') }, children: { then: [] } }], else: [],
} }]);
assert.deepEqual(coerced.args.right, literal('number', 2), 'case values follow the selected Switch value type');
const [legacyCase] = toRuntimeScripts([{ id: 'switch-legacy', command: 'EVENT_SWITCH', args: { value: { kind: 'variable', type: 'number', variableId: 'scene-index' } }, children: {
  then: [{ id: 'case-legacy', command: 'EVENT_SWITCH_CASE', args: { value: { kind: 'variable', type: 'number', variableId: 'scene-index', value: 0 } }, children: { then: [] } }], else: [],
} }]);
assert.deepEqual(legacyCase.args.right, literal('number', 0), 'legacy cases with a scalar editor value migrate to literals');
console.log('Switch event lowering passed: multiple typed cases, matching bodies, default branch and immutable editor data.');
