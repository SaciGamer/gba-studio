import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['src/shared/events/sfxGenerator.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { SFX_LIMITS, LEGACY_SFX_MAX_FREQUENCY, generateSfx, defaultSfxParameters, encodePcm16Wav, isSfxWaveform, isSfxHarmonics } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const source = fs.readFileSync('src/main/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const handlers = new Map();
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle' && ts.isStringLiteral(node.arguments[0])) {
    const name = node.arguments[0].text;
    if (['save-generated-sfx', 'load-project-sfx'].includes(name)) handlers.set(name, node.arguments[1].getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(handlers.size, 2);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-independent-export-'));
try {
  const roots = [path.join(temporary, 'original'), path.join(temporary, 'working')];
  const context = vm.createContext({ fs, path, Buffer, process, console, SFX_LIMITS, LEGACY_SFX_MAX_FREQUENCY, generateSfx, isSfxWaveform, isSfxHarmonics, originalProjectDirectory: roots[0], directoryPathProject: roots[1] });
  for (const [name, handler] of handlers) {
    vm.runInContext(ts.transpile(`var ${name === 'save-generated-sfx' ? 'save' : 'load'} = ${handler}`, { target: ts.ScriptTarget.ES2022 }), context);
  }
  const generated = generateSfx(defaultSfxParameters);
  const wav = Buffer.from(encodePcm16Wav(generated.pcm, generated.parameters.sampleRate));
  const document = { schema: 'gba-studio/sfx', version: 1, name: 'effect', parameters: generated.parameters };
  const save = (mode, overwrite = false, doc = document) => context.save(null, 'effect.gbasfx', JSON.stringify(doc), 'effect.wav', wav.toString('base64'), mode, overwrite);
  let result = await save('wav');
  assert.equal(result.status, 'success', 'export does not require saving a source');
  assert.equal(result.filename, 'effect.wav');
  for (const root of roots) {
    assert.deepEqual(fs.readFileSync(path.join(root, 'assets/sounds/effect.wav')), wav);
    assert.ok(!fs.existsSync(path.join(root, 'project/sounds/effect.gbasfx')), 'export does not create a linked source');
  }
  result = await save('source');
  assert.equal(result.status, 'success');
  const sourcePaths = roots.map(root => path.join(root, 'project/sounds/effect.gbasfx'));
  const saved = fs.readFileSync(sourcePaths[0], 'utf8');
  assert.ok(!Object.hasOwn(JSON.parse(saved), 'exportedWav'));
  assert.ok(!Object.hasOwn(JSON.parse(saved), 'wavSha256'));
  // A collision in either mirrored project directory reserves the same suffix.
  fs.writeFileSync(path.join(roots[1], 'assets/sounds/effect_1.wav'), 'existing');
  result = await save('wav', true);
  assert.equal(result.filename, 'effect_2.wav', 'even overwrite=true must create a new WAV');
  assert.equal(fs.readFileSync(path.join(roots[1], 'assets/sounds/effect_1.wav'), 'utf8'), 'existing');
  result = await save('wav');
  assert.equal(result.filename, 'effect_3.wav');
  for (const filename of sourcePaths) assert.equal(fs.readFileSync(filename, 'utf8'), saved, 'export never changes the SFX source');
  fs.rmSync(path.join(roots[0], 'assets/sounds'), { recursive: true });
  result = await context.load(null, 'effect.gbasfx');
  assert.equal(result.status, 'success', 'SFX opens without any exported WAV');
  assert.ok(!Object.hasOwn(result, 'exportedWavChanged'));
  // Legacy files remain readable, but their obsolete WAV metadata is ignored.
  fs.writeFileSync(sourcePaths[0], JSON.stringify({ ...document, exportedWav: 'old.wav', wavSha256: '0'.repeat(64) }));
  result = await context.load(null, 'effect.gbasfx');
  assert.equal(result.status, 'success');
  assert.ok(!Object.hasOwn(result.document, 'exportedWav'));
  fs.writeFileSync(sourcePaths[0], JSON.stringify({ ...document, parameters: { ...document.parameters, frequency: 8000 } }));
  result = await context.load(null, 'effect.gbasfx');
  assert.equal(result.status, 'success', 'legacy 8000 Hz sources remain readable');
  assert.equal(result.document.parameters.frequency, SFX_LIMITS.maxFrequency, 'legacy frequency is normalized for the GBA output rate');
  assert.equal((await save('source', true, { ...document, parameters: { ...document.parameters, frequency: 8000 } })).status, 'error', 'new saves enforce the corrected frequency range');
  assert.equal((await save('source')).status, 'conflict', 'source replacement still requires its existing confirmation');
  const custom = { ...document, parameters: { ...document.parameters, waveform: 'custom', harmonics: [100, 60, 30, 15, 10, 5] } };
  assert.equal((await save('source', true, custom)).status, 'success');
  result = await context.load(null, 'effect.gbasfx');
  assert.equal(result.document.parameters.waveform, 'custom');
  assert.deepEqual(Array.from(result.document.parameters.harmonics), custom.parameters.harmonics);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
const editor = fs.readFileSync('src/renderer/frontend/src/components/resourceEditors/SfxGenerator.tsx', 'utf8');
assert.ok(editor.includes("<Tooltip title={parameters.waveform === 'noise' ? t('sfx.frequencyNoiseHint')"));
assert.ok(editor.includes("tabIndex={parameters.waveform === 'noise' ? 0 : undefined}"), 'disabled frequency explanation is keyboard reachable');
assert.ok(!editor.includes('exportChanged'));
const locales = fs.readFileSync('src/renderer/frontend/src/i18n/I18n.tsx', 'utf8');
assert.equal((locales.match(/'sfx.frequencyNoiseHint':/g) ?? []).length, 4);
assert.equal((locales.match(/'sfx.wavExportedFile':/g) ?? []).length, 4);
console.log('SFX exports are independent, preserve existing WAVs, use numbered filenames across roots, accept legacy sources, and expose a localized Noise frequency tooltip.');
