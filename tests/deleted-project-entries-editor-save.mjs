import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/shared/projectCollectionEntries.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const helpers = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const source = fs.readFileSync('src/renderer/frontend/src/components/pages/engine/Engine.tsx', 'utf8');
const ast = ts.createSourceFile('Engine.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const prepareForBackend')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert.ok(effect);
const liveId = 'c2d15146-f824-4401-8d4a-08e92e2ef6ab', deletedId = '54520591-68f7-486d-9248-871ee0a27681';
for (const scenario of ['success', 'dirty', 'failed', 'concurrent-edit']) {
  let callback, payload;
  const fixture = { ...helpers, console: { log() {}, error() {} }, project: null, setSettingUtils() {} };
  const names = ['scenes', 'project', 'settings', 'userSettings', 'backgrounds', 'spriteResources', 'variables', 'scripts', 'palettes', 'prefabs', 'settingUtils'];
  for (const name of names) {
    const array = ['scenes', 'backgrounds', 'spriteResources'].includes(name);
    fixture[name + 'Ref'] = { current: array ? [] : { _resourceType: name, _saved: true } };
    fixture['ignoredFields' + name[0].toUpperCase() + name.slice(1)] = ['_saved'];
    fixture['set' + name[0].toUpperCase() + name.slice(1)] = next => {
      const ref = fixture[name + 'Ref']; ref.current = typeof next === 'function' ? next(ref.current) : next;
    };
  }
  for (const name of ['variables', 'scripts']) fixture[name + 'Ref'].current[name] = [{ id: liveId, name: 'Live' }, { id: deletedId, name: 'Deleted', _deleted: true }];
  if (scenario === 'dirty' || scenario === 'failed') for (const name of ['variables', 'scripts']) fixture[name + 'Ref'].current._saved = false;
  fixture.window = { electronAPI: {
    onRequestProjectToSave: fn => { callback = fn; }, subscribe() {},
    responseProjectToSave: async data => {
      payload = data;
      if (scenario === 'concurrent-edit') fixture.variablesRef.current = { ...fixture.variablesRef.current, _saved: false, variables: fixture.variablesRef.current.variables.map(item => item.id === liveId ? { ...item, name: 'Edited during save' } : item) };
      return scenario !== 'failed';
    },
  } };
  const context = vm.createContext(fixture);
  vm.runInContext(ts.transpileModule(`var setup=${effect}; setup();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await callback({ type: 'SAVE_DATA' });
  for (const name of ['variables', 'scripts']) {
    const saved = payload.find(item => item._resourceType === name);
    assert.ok(saved, 'Saved legacy tombstones are submitted even when the collection was clean');
    assert.equal(saved[name].length, 1);
    const current = fixture[name + 'Ref'].current;
    assert.equal(current[name].length, 2, 'Saving preserves in-memory deletion markers for Undo without adding a history edit');
    assert.equal(current._saved, scenario !== 'failed' && !(scenario === 'concurrent-edit' && name === 'variables'));
    if (scenario === 'concurrent-edit' && name === 'variables') {
      assert.equal(current._saved, false); assert.equal(current.variables[0].name, 'Edited during save');
    }
  }
}
console.log('Editor save cleanup: legacy collections, clean payloads, Undo preservation, failed saves and concurrent edits passed.');
