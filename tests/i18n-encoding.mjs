import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
let checked = 0;
const catalogs = new Map();
for (const filename of ['src/renderer/frontend/src/i18n/I18n.tsx', 'src/main/mainI18n.ts']) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isObjectLiteralExpression(node.initializer)) {
      const entries = new Map();
      let ownValuesSeen = false;
      for (const property of node.initializer.properties) {
        if (ts.isSpreadAssignment(property) && ['enUS', 'ptBR', 'esES', 'frFR'].includes(node.name.getText(source))) {
          assert.equal(ownValuesSeen, false, `${filename} ${node.name.getText(source)}: English fallback must precede translated values`);
        }
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
          ownValuesSeen = true;
          const key = property.name.text;
          const value = property.initializer.text;
          entries.set(key, value);
          // Uppercase Portuguese accents (NÃO, Ângulo) are valid characters.
          // Mojibake has the accent lead character followed by a decoded byte.
          assert.doesNotMatch(value, /\?\?|[\p{L}]\?[\p{L}]|\uFFFD|[\u00c3\u00c2][\u0080-\u00bf]|\u00e2\u20ac/u, `${filename} ${key}: damaged translation encoding`);
          assert.equal(value.replace(/\?\s*$/, '').includes('?'), false, `${filename} ${key}: unexpected replacement question mark`);
          checked++;
        }
      }
      if (filename.endsWith('I18n.tsx')) catalogs.set(node.name.getText(source), entries);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const name of ['ptBR', 'esES', 'frFR']) {
  for (const [key, value] of catalogs.get(name)) {
    if (value.includes('?')) assert.ok(catalogs.get('enUS').get(key)?.includes('?'), `${name} ${key}: a question mark replaced a translated character`);
  }
}
assert.equal(catalogs.get('ptBR').get('settings.demoConfiguration'), 'Configura\u00e7\u00e3o do Demo');
assert.equal(catalogs.get('frFR').get('settings.connectedJoystick'), 'Joystick connect\u00e9');
for (const name of ['enUS', 'ptBR', 'esES', 'frFR']) {
  assert.ok(catalogs.get(name).get('settings.demoStartMuted').trimEnd().endsWith(':'));
  assert.ok(catalogs.get(name).get('settings.demoStartMutedHint'));
  assert.ok(catalogs.get(name).get('music.warning.buildCoreItEffects')?.includes('{effects}'), `${name}: IT build-core warning must exist and preserve its interpolation placeholder`);
  const xmSampleVolumeHelp = catalogs.get(name).get('music.inspector.xmSampleVolumeGbaPreview');
  assert.ok(xmSampleVolumeHelp, `${name}: XM sample-volume preview behavior must be translated`);
  assert.doesNotMatch(xmSampleVolumeHelp, /ignore|ignora|ignore/i, `${name}: XM sample-header volume must not be described as ignored by the preview`);
}
console.log(`Translation encoding passed (${checked} strings); Start muted labels, IT build-core warnings, and XM sample-volume guidance are present in all four locales.`);
