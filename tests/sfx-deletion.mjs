import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const mainSource = fs.readFileSync('src/main/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true);
let handler;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle' && node.arguments[0]?.text === 'delete-project-sound') handler = node.arguments[1].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-deletion-'));
try {
  const roots = [path.join(temporary, 'original'), path.join(temporary, 'working')];
  for (const root of roots) {
    fs.mkdirSync(path.join(root, 'project/sounds'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets/sounds'), { recursive: true });
    fs.writeFileSync(path.join(root, 'project/sounds/effect.gbasfx'), 'source');
    fs.writeFileSync(path.join(root, 'assets/sounds/effect.wav'), 'wav');
  }
  const context = vm.createContext({ fs, path, console, originalProjectDirectory: roots[0], directoryPathProject: roots[1] });
  vm.runInContext(ts.transpile(`var remove = ${handler}`, { target: ts.ScriptTarget.ES2022 }), context);
  for (const [filename, source] of [['../effect.gbasfx', true], ['effect.wav', true], ['effect.gbasfx', false], ['', true], ['effect.wav', 'false']]) {
    assert.equal((await context.remove(null, filename, source)).status, 'error', 'reject paths, wrong extensions and invalid source flags');
  }
  assert.equal((await context.remove(null, 'effect.gbasfx', true)).status, 'success');
  for (const root of roots) {
    assert.ok(!fs.existsSync(path.join(root, 'project/sounds/effect.gbasfx')));
    assert.equal(fs.readFileSync(path.join(root, 'assets/sounds/effect.wav'), 'utf8'), 'wav', 'deleting SFX preserves exported WAV');
    fs.writeFileSync(path.join(root, 'project/sounds/effect.gbasfx'), 'source');
  }
  assert.equal((await context.remove(null, 'effect.wav', false)).status, 'success');
  for (const root of roots) {
    assert.ok(!fs.existsSync(path.join(root, 'assets/sounds/effect.wav')));
    assert.equal(fs.readFileSync(path.join(root, 'project/sounds/effect.gbasfx'), 'utf8'), 'source', 'deleting WAV preserves SFX');
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

const historySource = fs.readFileSync('src/renderer/frontend/src/providers/HistoryProvider.tsx', 'utf8');
const history = ts.createSourceFile('history.tsx', historySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let keyHandler, menuHandler;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.initializer?.getText(history).includes('gba-studio:sound-delete-request')) {
    if (node.name.getText(history) === 'onKeyDown') keyHandler = node.initializer.getText(history);
    if (node.name.getText(history) === 'onDelete') menuHandler = node.initializer.getText(history);
  }
  ts.forEachChild(node, find);
}
find(history);
assert.ok(keyHandler && menuHandler);
const events = [];
let activeKind = 'sounds';
class Input {}
const context = vm.createContext({ isModalOpen: () => false, HTMLInputElement: Input, HTMLTextAreaElement: class {},
  document: { querySelector: selector => selector.includes(`data-asset-kind="${activeKind}"`) ? {} : null },
  window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type; } } });
vm.runInContext(ts.transpile(`var key = ${keyHandler};var menu = ${menuHandler}`, { target: ts.ScriptTarget.ES2022 }), context);
context.key({ key: 'Delete', target: { closest() {} }, preventDefault() {} });
context.menu();
assert.deepEqual(events, ['gba-studio:sound-delete-request', 'gba-studio:sound-delete-request']);
context.key({ key: 'Delete', target: new Input(), preventDefault() { throw new Error('must preserve text deletion'); } });
assert.equal(events.length, 2);
activeKind = 'palettes';
context.key({ key: 'Delete', target: { closest() {} }, preventDefault() {} });
context.menu();
assert.deepEqual(events.slice(2), ['gba-studio:palette-delete-request', 'gba-studio:palette-delete-request']);
console.log('Sound deletion: both project roots, SFX/WAV independence, path validation, Delete key, menu routing and text editing protection passed.');
