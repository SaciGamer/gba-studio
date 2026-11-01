import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = 'src/renderer/frontend/src/components/resourceEditors/AssetLibraryEditor.tsx';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'createNewBeat') callback = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast);
assert.ok(callback);
let files = [];
let listFailed = false;
const saved = [];
const packages = [];
const errors = [];
const context = {
  createBeatQueue: { current: Promise.resolve() }, console,
  createMusicCompositionWithStarterBank: format => ({ format }),
  exportMusicComposition: () => ({ moduleData: new ArrayBuffer(1) }),
  createMusicEditorSourceDocument: () => ({}),
  createTrackerProjectPackage: project => { packages.push(project); return new Uint8Array([1]); },
  uuidv4: () => `test-${packages.length}`, btoa: value => Buffer.from(value, 'binary').toString('base64'),
  t: key => key, message: { error: message => errors.push(message), success() {} },
  load: async () => {}, assetSelectionExplicit: { current: false }, setSelected() {},
  musicWorkspaceMode: false, musicWorkspace: null,
  window: { electronAPI: {
    listTrackerProjects: async () => listFailed ? { status: 'error' } : { status: 'success', files: [...files] },
    saveTrackerProject: async filename => {
      // Saving is asynchronous and the main process returns a nested path.
      await new Promise(resolve => setTimeout(resolve, 1));
      const relative = `${filename.replace(/\.gbatracker$/, '')}/${filename}`;
      assert.ok(!files.includes(relative), `duplicate project path: ${relative}`);
      files.push(relative); saved.push(filename);
      return { status: 'success', filename: relative };
    },
  } },
};
vm.createContext(context);
vm.runInContext(ts.transpile(`var createNewBeat = ${callback};`, { target: ts.ScriptTarget.ES2022 }), context);
await Promise.all(['MOD', 'XM', 'S3M', 'IT'].map(format => context.createNewBeat(format)));
assert.deepEqual(saved, ['new-beat-1.gbatracker', 'new-beat-2.gbatracker', 'new-beat-3.gbatracker', 'new-beat-4.gbatracker']);
assert.deepEqual(packages.map(project => project.sourceFilename), ['new-beat-1.mod', 'new-beat-2.xm', 'new-beat-3.s3m', 'new-beat-4.it']);
files = ['new-beat-1/new-beat-1.gbatracker', 'new-beat-1_2/new-beat-1.gbatracker',
  'nested/music/new-beat-4.gbatracker', 'folder\\NEW-BEAT-7.GBATRACKER', 'custom.gbatracker'];
await context.createNewBeat('XM');
assert.equal(saved.at(-1), 'new-beat-8.gbatracker', 'sequence must advance past the highest nested basename, including gaps and Windows paths');
assert.equal(packages.at(-1).sourceFilename, 'new-beat-8.xm');
const count = saved.length;
listFailed = true;
await context.createNewBeat('MOD');
assert.equal(saved.length, count, 'a failed listing must not create another beat 1');
assert.equal(errors.at(-1), 'music.create.failed');
console.log('New beats: nested filenames, Windows paths, mixed formats, gaps, rapid concurrent clicks and listing failure passed.');
