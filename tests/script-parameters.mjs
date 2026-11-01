import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const load = file => import(pathToFileURL(path.join(root, 'dist', file)).href);
const { ResourceBuilder } = await load('main/utils/builders/ResourceBuilder.js');
const { toRuntimeResource, validateRuntimeReferences } = await load('main/utils/types/RuntimeResources.js');
const { exposeScriptInputs, validateScriptParameters, createScriptParameter } = await load('shared/scriptParameters.js');
const { createRuntimeFeatureManifest, selectNativeRuntime } = await load('main/utils/builders/RuntimeFeatureManifest.js');
const parameter = (id, mode = 'local', type = 'number') => ({ id: '__PARAM__:' + id, name: id, mode, type });
const local = parameter('local'), reference = parameter('reference', 'reference');
const outerLocal = parameter('outerLocal'), outerReference = parameter('outerReference', 'reference');
const textLocal = parameter('textLocal', 'local', 'string'), textRef = parameter('textRef', 'reference', 'string');
const booleanRef = parameter('booleanRef', 'reference', 'boolean');
const variable = variableId => ({ kind: 'variable', variableId });
const literal = value => ({ kind: 'number', value });
const set = (id, target, value) => ({ id, command: 'EVENT_VARIABLE', args: { variableId: target, value } });
const call = (id, scriptId, values) => ({ id, command: 'EVENT_CALL_SCRIPT', args: { scriptId, arguments: values.map(([parameter, value]) => ({ parameterId: parameter.id, value })) } });
const scripts = { _resourceType: 'scripts', id: 'scripts', scripts: [
  { id: 'child', parameters: [local, reference], events: [
    set('increment', local.id, { kind: 'expression', operation: 'add', left: variable(local.id), right: literal(1) }),
    { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 2 } },
    { id: 'choose', command: 'EVENT_IF', args: { left: { kind: 'literal', type: 'boolean', value: true }, operator: '==', right: { kind: 'literal', type: 'boolean', value: true } }, children: {
      then: [set('publish', reference.id, variable(local.id))], else: [set('zero', reference.id, literal(0))] } },
  ] },
  { id: 'outer', parameters: [outerLocal, outerReference], events: [
    call('nested', 'child', [[local, variable(outerLocal.id)], [reference, variable(outerReference.id)]]),
    set('restore-parent', outerReference.id, { kind: 'expression', operation: 'add', left: variable(outerLocal.id), right: literal(100) }),
  ] },
  { id: 'text', parameters: [textLocal, textRef, booleanRef], events: [
    set('change-copy', textLocal.id, { kind: 'literal', type: 'string', value: 'copy' }),
    set('change-original', textRef.id, { kind: 'literal', type: 'string', value: 'reference' }),
    set('publish-text', 'textResult', { kind: 'variable', type: 'string', variableId: textLocal.id }),
    set('boolean', booleanRef.id, { kind: 'constant', constant: 'false' }),
  ] },
] };
const twentyParameters = Array.from({ length: 20 }, (_, i) => ({ id: `__PARAM__:${String.fromCharCode(65 + i)}`, name: `Parameter ${String.fromCharCode(65 + i)}`, type: 'number', mode: i === 19 ? 'reference' : 'local' }));
scripts.scripts.push({ id: 'twentyChild', parameters: twentyParameters, events: [
  set('twenty-publish', '__PARAM__:T', { kind: 'expression', operation: 'add', left: variable('__PARAM__:A'), right: literal(20) }),
  set('twenty-local-copy', '__PARAM__:A', literal(99)),
  { id: 'twenty-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } },
] }, { id: 'twentyOuter', parameters: structuredClone(twentyParameters), events: [
  call('nested-twenty', 'twentyChild', twentyParameters.map(parameter => [parameter, variable(parameter.id)])),
  set('twenty-restore', '__PARAM__:T', { kind: 'expression', operation: 'add', left: variable('__PARAM__:A'), right: literal(1) }),
] });
const variables = { _resourceType: 'variables', id: 'variables', variables: [
  ...[['inputA', 2], ['inputB', 20], ['outputA', 0], ['outputB', 0], ['outputOuter', 0], ['outputTwenty', 0]].map(([id, initialValue]) => ({ id, symbol: id, type: 'number', initialValue })),
  { id: 'text', symbol: 'text', type: 'string', initialValue: 'original' },
  { id: 'textResult', symbol: 'textResult', type: 'string', initialValue: '' },
  { id: 'flag', symbol: 'flag', type: 'boolean', initialValue: true },
] };
const scene = (id, event) => ({ _resourceType: 'scene', id, width: 240, height: 160, backgrounds: [], actors: [], triggers: [], script: [event] });
const callers = [
  scene('a', call('call-a', 'child', [[local, variable('inputA')], [reference, variable('outputA')]])),
  scene('b', call('call-b', 'child', [[local, variable('inputB')], [reference, variable('outputB')]])),
  scene('outer', call('call-outer', 'outer', [[outerLocal, literal(7)], [outerReference, variable('outputOuter')]])),
  scene('property', call('call-property', 'child', [[local, literal(4)], [reference, { kind: 'property', actorId: '__PLAYER__', property: 'x' }]])),
  scene('engine', call('call-engine', 'child', [[local, literal(8)], [reference, { kind: 'engine', field: 'cameraX' }]])),
  scene('text', call('call-text', 'text', [[textLocal, { kind: 'variable', type: 'string', variableId: 'text' }], [textRef, { kind: 'variable', type: 'string', variableId: 'text' }], [booleanRef, variable('flag')]])),
  scene('twenty', call('call-twenty', 'twentyOuter', twentyParameters.map((parameter, index) => [parameter, index === 19 ? variable('outputTwenty') : literal(index === 0 ? 22 : index)]))),
];
const resources = [variables, scripts, ...callers].map(toRuntimeResource);
validateRuntimeReferences(resources);
const manifest = createRuntimeFeatureManifest(resources);
assert.ok(manifest.modules.includes('numeric') && manifest.modules.includes('variables'));
assert.ok(manifest.modules.includes('script-inputs'));
assert.ok(manifest.modules.includes('actors'), 'A Player property passed by reference must retain the actor write backend');
assert.match(selectNativeRuntime(manifest).featureHeader, /GBA_STUDIO_FEATURE_SCRIPT_INPUTS 1/);
const legacyManifest = createRuntimeFeatureManifest([toRuntimeResource({ _resourceType: 'scripts', scripts: [{ id: 'legacy', events: [] }] })]);
assert.match(selectNativeRuntime(legacyManifest).featureHeader, /GBA_STUDIO_FEATURE_SCRIPT_INPUTS 0/);
const newInput = exposeScriptInputs([set('new', '', literal(0))]);
assert.equal(newInput.parameters.length, 1);
assert.equal(newInput.events[0].args.variableId, newInput.parameters[0].id);
assert.equal(newInput.parameters[0].name, 'Parameter A');
assert.equal(newInput.parameters[0].id, '__PARAM__:A');
assert.equal(exposeScriptInputs([], newInput.parameters).parameters.length, 1);
const globalTarget = [{ ...newInput.events[0], args: { ...newInput.events[0].args, variableId: 'inputA' } }];
assert.deepEqual(exposeScriptInputs(globalTarget, newInput.parameters).parameters, newInput.parameters, 'Selecting Global must preserve the parameter declaration');
const twenty = exposeScriptInputs(Array.from({ length: 20 }, (_, i) => set('parameter-' + i, '', literal(0))));
assert.equal(twenty.parameters.length, 20);
assert.equal(twenty.parameters[19].name, 'Parameter T');
assert.equal(twenty.parameters[19].id, '__PARAM__:T');
assert.equal(createScriptParameter(twenty.parameters), null);
assert.throws(() => validateScriptParameters([local, { ...reference, alias: local.name }]), /unique aliases/);
assert.throws(() => validateScriptParameters(Array.from({ length: 21 }, (_, i) => parameter('p' + i))), /at most 20/);
assert.throws(() => toRuntimeResource({ _resourceType: 'scripts', scripts: [{ id: 'bad', events: [], parameters: {} }] }), /expected an array/);
const invalid = event => assert.throws(() => validateRuntimeReferences([toRuntimeResource(variables), toRuntimeResource(scripts), toRuntimeResource(scene('bad', event))]));
invalid(call('missing', 'child', [[local, literal(0)]]));
invalid(call('literal-reference', 'child', [[local, literal(0)], [reference, literal(1)]]));
invalid(call('wrong-type', 'child', [[local, literal(0)], [reference, variable('flag')]]));
invalid(call('text-as-number', 'child', [[local, { kind: 'literal', type: 'string', value: '123' }], [reference, variable('outputA')]]));
invalid(call('read-only', 'child', [[local, literal(0)], [reference, { kind: 'engine', field: 'sceneWidth' }]]));
invalid(call('outside-domain', 'child', [[local, literal(0)], [reference, { kind: 'property', actorId: 'outsider', property: 'x' }]]));
invalid(call('outside-scope', 'child', [[local, variable(outerLocal.id)], [reference, variable('outputA')]]));
const owned = { ...scene('owned', null), script: [], actors: [{ id: 'npc', spriteId: '', anchor: 'center', onInitScript: [call('actor', 'child', [[local, literal(0)], [reference, { kind: 'property', actorId: 'npc', property: 'x' }]])] }], triggers: [{ id: 'zone', width: 8, height: 8, onEnterScript: [call('trigger', 'child', [[local, literal(0)], [reference, { kind: 'trigger', triggerId: 'zone', property: 'width' }]])] }] };
validateRuntimeReferences([toRuntimeResource(variables), toRuntimeResource(scripts), toRuntimeResource(owned)]);
owned.actors[0].onInitScript[0].args.arguments[1].value.actorId = '__PLAYER__';
assert.throws(() => validateRuntimeReferences([toRuntimeResource(variables), toRuntimeResource(scripts), toRuntimeResource(owned)]), /outside the caller domain/);
const attached = structuredClone(scripts);
attached.scripts[0].events = [{ id: 'attach', command: 'EVENT_WAIT_FOR_BUTTON', args: { button: 'A' }, children: { then: [set('escaped-input', reference.id, literal(1))], else: [] } }];
assert.throws(() => validateRuntimeReferences([toRuntimeResource(variables), toRuntimeResource(attached)]), /outside its script scope/);
attached.scripts[0].events[0].children.then = [set('global-button-value', 'outputA', literal(1))];
validateRuntimeReferences([toRuntimeResource(variables), toRuntimeResource(attached)]);

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-script-parameters-'));
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, path.join(root, 'tools/butano/template'));
  const headers = [scripts, ...callers].map(resource => builder.processResourceObject(resource).headerContent.toString('utf8'));
  const renamed = structuredClone(scripts);
  renamed.scripts[0].parameters[0].alias = 'Health alias';
  assert.equal(builder.processResourceObject(renamed).headerContent.toString('utf8'), headers[0], 'Changing an engine alias must not change the native ABI');
  assert.equal(toRuntimeResource(renamed).scripts[0].parameters[0].alias, undefined, 'Engine aliases must not enter runtime data');
  assert.match(headers[0], /ScriptParameterDefinition/);
  assert.match(headers[1], /CallScriptEventData/);
  fs.writeFileSync(path.join(output, 'include/generated_parameters.h'), headers.join('\n').replaceAll('SCRIPT_DEFINITIONS', 'PARAM_SCRIPT_DEFINITIONS'));
  fs.writeFileSync(path.join(output, 'native-features.h'), fs.readFileSync(path.join(root, 'tools/butano/template/include/gba_studio_features.h'), 'utf8').replace('#define GBA_STUDIO_FEATURE_SAVE 1', '#define GBA_STUDIO_FEATURE_SAVE 0'));
  const executable = path.join(output, 'parameters.exe');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-include', path.join(output, 'native-features.h'),
    '-I', path.join(output, 'include'), '-I', path.join(root, 'tests/native/scheduler'), '-I', path.join(root, 'tests/native/support'), '-I', path.join(root, 'tools/butano/template/include'),
    ...['script_command_manager.cpp', 'event_wait.cpp', 'event_wait_input.cpp', 'variable_manager.cpp'].map(file => path.join(root, 'tools/butano/template/src', file)),
    path.join(root, 'tests/native/scheduler/handlers.cpp'), path.join(root, 'tests/native/script-parameters/main.cpp'), '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  process.stdout.write(run.stdout);
} finally {
  assert.ok(path.resolve(output).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(output).startsWith('gba-studio-script-parameters-'));
  fs.rmSync(output, { recursive: true, force: true });
}
