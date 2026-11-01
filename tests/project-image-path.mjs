import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync('src/main/utils/projectImagePath.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveProjectImagePath: resolve } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const original = path.resolve('test-project');
const working = path.resolve('test-sandbox');
const roots = [original, working];
for (const root of roots) {
  const image = path.join(root, 'assets', 'backgrounds', 'image name.png');
  assert.equal(resolve(image, roots), image);
  assert.equal(resolve(`local://${encodeURIComponent(image)}`, roots), image);
  if (process.platform === 'win32') {
    assert.equal(resolve(image.toUpperCase(), roots), image.toUpperCase());
    assert.equal(resolve(`local://${image.replace(':', '').replaceAll('\\', '/')}`, roots), image);
  }
  for (const invalid of [path.join(root, 'assets-other', 'image.png'), path.join(root, 'assets', '..', 'secret.png'), path.join(root, 'assets')]) {
    assert.throws(() => resolve(invalid, roots), /outside project assets/);
  }
}
assert.throws(() => resolve(path.resolve('unrelated/assets/image.png'), roots), /outside project assets/);
assert.throws(() => resolve('image.png', []), /directory is unavailable/);
console.log('Project image path validation passed.');
