import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { toRuntimeResource, validateRuntimeReferences } from '../dist/main/utils/types/RuntimeResources.js';
import { createRuntimeFeatureManifest } from '../dist/main/utils/builders/RuntimeFeatureManifest.js';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-variable-save-'));
try {
  fs.mkdirSync(path.join(temporary, 'include'));
  const builder = new ResourceBuilder(temporary, path.resolve('tools/butano/template'));
  const variableId = '3e089418-5bba-4e48-b24b-3e59e313a9d4';
  const variables = { _resourceType: 'variables', id: '8ef704a3-7ca0-4e09-af41-c49783b842b8', variables: [{ id: variableId, symbol: 'deaths', name: 'Deaths', type: 'number', initialValue: 0 }] };
  for (const command of ['EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD']) {
    const scene = { _resourceType: 'scene', id: '4d1f964e-a29e-41b8-9ba2-38a31c5621e8', backgrounds: [], script: [{ id: 'c6810dcd-0fc9-430a-bf54-e236bb3bd02e', version: 1, command, args: { slot: 7, allVariables: false, variableIds: [variableId] } }] };
    const header = builder.processResourceObject(scene).headerContent.toString();
    assert.match(header, /VariablesSaveEventData/);assert.match(header, /&SCENE_[A-Z0-9_]+_ARGS_0/);
    assert.ok(header.includes(variableId));
    validateRuntimeReferences([toRuntimeResource(scene), toRuntimeResource(variables)]);
    assert.ok(createRuntimeFeatureManifest([toRuntimeResource(scene), toRuntimeResource(variables)]).modules.includes('save'));
    for (const invalid of [{ slot: 8 }, { slot: -1 }, { slot: 1.5 }, { variableIds: [] }, { variableIds: [variableId, variableId] }, { variableIds: ['__PARAM__:A'] }, { variableIds: 'bad' }]) {
      assert.throws(() => builder.processResourceObject({ ...scene, script: [{ ...scene.script[0], args: { ...scene.script[0].args, ...invalid } }] }));
    }
    const all = { ...scene, script: [{ ...scene.script[0], args: { slot: 7, allVariables: true, variableIds: [] } }] };
    assert.match(builder.processResourceObject(all).headerContent.toString(), /7, true, nullptr, 0/);
    assert.throws(() => validateRuntimeReferences([toRuntimeResource(scene)]), /existing global variables/);
  }
  console.log('Variable save compiler: typed ABI pointers, selected/all globals, module selection, references and malformed payloads passed.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
