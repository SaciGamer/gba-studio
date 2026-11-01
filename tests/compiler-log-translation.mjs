import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/renderer/frontend/src/utils/compilerLogTranslation.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { translateCompilerLog } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source = ts.createSourceFile('I18n.tsx', fs.readFileSync('src/renderer/frontend/src/i18n/I18n.tsx', 'utf8'), ts.ScriptTarget.Latest, true);
const catalogs = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['enUS', 'ptBR', 'esES', 'frFR'].includes(node.name.getText(source))) {
    const dictionary = {};
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) dictionary[property.name.text] = property.initializer.text;
    }
    catalogs[node.name.getText(source)] = dictionary;
  }
  ts.forEachChild(node, visit);
}
visit(source);
for (const dictionary of Object.values(catalogs)) {
  const t = (key, params = {}) => {
    assert(dictionary[key], `missing translation: ${key}`);
    return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[key]);
  };
  assert.equal(translateCompilerLog({ messageKey: 'compiler.asset', messageParams: { name: 'tiles/a.png' } }, t), `>> ${t('compiler.asset', { name: 'tiles/a.png' })}\n`);
  const header = translateCompilerLog({ message: '    a.bmp item header written in C:/build/a.h (graphics size: 42 bytes)\n' }, t);
  assert(header.includes('C:/build/a.h'));
  assert(header.includes(t('compiler.graphicsSize', { size: '42 bytes' })));
  assert(!header.includes('header written'));
  assert.equal(translateCompilerLog({ message: '    Processed graphics size: 42 bytes\n' }, t), t('compiler.processed', { kind: t('compiler.graphics'), size: '42 bytes' }) + '\n');
  assert.equal(translateCompilerLog({ message: 'file.cpp:30: error: unknown symbol' }, t), 'file.cpp:30: error: unknown symbol');
}
console.log('Compiler logs: four locales, interpolation, Butano messages and preserved diagnostics passed.');
