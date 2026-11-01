import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-deleted-entries-'));
globalThis.saveFixture = { sandbox: path.join(temporary, 'working'), original: path.join(temporary, 'original') };
const mocks = {
  '@/main': 'export const directoryPathProject=globalThis.saveFixture.sandbox; export const originalProjectDirectory=globalThis.saveFixture.original; export const windows={};',
  '@/controllers/SettingsController': 'export const SettingsController={getInstance:()=>({setIsSaved:()=>{},isSaved:()=>false})};',
  '@/handlers/preferenceHandlers': 'export const getPreferences=()=>({}); export const updatePreferences=()=>{};',
  '@/states/tempProjectState': 'export const setCurrentActiveSandboxDirectory=()=>{};',
  '@/mainI18n': 'export const formatMainWindowTitle=()=>"";',
};
try {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export {saveChanges} from './src/main/services/saveSettingsService'; export * from './src/shared/projectCollectionEntries';` }, bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': path.resolve('src/main') }, plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }] });
  const { saveChanges, pruneDeletedProjectEntries, hasDeletedProjectEntries } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const aliveId = 'c2d15146-f824-4401-8d4a-08e92e2ef6ab';
  const deletedId = '54520591-68f7-486d-9248-871ee0a27681';
  for (const root of Object.values(globalThis.saveFixture)) fs.mkdirSync(path.join(root, 'project'), { recursive: true });
  for (const type of ['variables', 'scripts']) {
    const entry = type === 'variables' ? { symbol: 'score', type: 'number', initialValue: 0 } : { events: [] };
    const resource = { _resourceType: type, _saved: true, [type]: [{ ...entry, id: aliveId, name: 'Active' }, { ...entry, id: deletedId, name: 'Deleted', _deleted: true }] };
    const originalSnapshot = structuredClone(resource);
    assert.equal(hasDeletedProjectEntries(resource), true, 'Old saved collections with tombstones must still be sent');
    assert.equal(pruneDeletedProjectEntries(resource)[type].length, 1);
    const payload = [resource, { _resourceType: 'setting-utils' }];
    assert.equal(saveChanges(payload, { persistToOriginal: true }), true);
    assert.deepEqual(resource, originalSnapshot, 'Saving never mutates the editor snapshot');
    for (const root of Object.values(globalThis.saveFixture)) {
      const saved = JSON.parse(fs.readFileSync(path.join(root, 'project', `${type}.gbasres`), 'utf8'));
      assert.deepEqual(saved[type].map(item => item.id), [aliveId]);
      assert.equal(hasDeletedProjectEntries(saved), false);
    }
    resource[type][0]._deleted = true;
    assert.equal(saveChanges(payload, { persistToOriginal: true }), true);
    for (const root of Object.values(globalThis.saveFixture)) {
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'project', `${type}.gbasres`), 'utf8'))[type], [], 'Deleting the final entry writes an empty collection');
    }
  }
  console.log('Deleted project entries: saved collections, sandbox/original writes, reload, empty collections and snapshot preservation passed.');
} finally {
  delete globalThis.saveFixture;
  fs.rmSync(temporary, { recursive: true, force: true });
}
