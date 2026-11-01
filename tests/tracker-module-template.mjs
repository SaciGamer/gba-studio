import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const compile = filename => ts.transpileModule(fs.readFileSync(path.resolve(filename), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const templateUrl = `data:text/javascript;base64,${Buffer.from(compile('src/renderer/frontend/src/utils/xmBeatTemplate.ts')).toString('base64')}`;
const instrumentLibraryUrl = `data:text/javascript;base64,${Buffer.from(compile('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts')).toString('base64')}`;
const compatibilityUrl = `data:text/javascript;base64,${Buffer.from(compile('src/shared/trackerItBuildCompatibility.ts')).toString('base64')}`;
const parserSource = inlineTrackerIdentity(compile('src/renderer/frontend/src/utils/trackerModule.ts')
  .replace("from './xmBeatTemplate'", `from '${templateUrl}'`)
  .replaceAll("from './trackerInstrumentLibrary'", `from '${instrumentLibraryUrl}'`));
const bundledParserSource = parserSource.replace("from '../../../../shared/trackerItBuildCompatibility'", `from '${compatibilityUrl}'`);
const writerSource = compile('src/renderer/frontend/src/utils/trackerModuleTemplate.ts').replace("from './xmBeatTemplate'", `from '${templateUrl}'`);
const modParserSource = compile('src/renderer/frontend/src/utils/modPlayer.ts');
const parser = await import(`data:text/javascript;base64,${Buffer.from(bundledParserSource).toString('base64')}`);
const { createTrackerModuleTemplate } = await import(`data:text/javascript;base64,${Buffer.from(writerSource).toString('base64')}`);
const { parseModModule } = await import(`data:text/javascript;base64,${Buffer.from(modParserSource).toString('base64')}`);

for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const bytes = createTrackerModuleTemplate(format, 'Template Check');
  const info = parser.parseTrackerModule(bytes, format.toLowerCase());
  assert.equal(info.format, format, `${format} template identifies as its selected format`);
  assert.equal(info.title, 'Template Check');
  assert.ok(info.patterns >= 1);
  if (format !== 'MOD') assert.ok(parser.parseTrackerOrderTable(bytes, format).length >= 1);
  if (format === 'MOD') {
    assert.equal(parseModModule(bytes)?.patterns.length, 1);
    assert.deepEqual(info.channelPans, [-0.5, 0.5, 0.5, -0.5], 'MOD editor default pans match Maxmod’s standard 64/192 channel matrix');
    assert.deepEqual(parser.restoreTrackerChannelPans('MOD', info.channelPans, [-1, 1, 1, -1]), info.channelPans, 'the obsolete auto-saved MOD default migrates to the Maxmod matrix');
    assert.deepEqual(parser.restoreTrackerChannelPans('MOD', info.channelPans, [-1, 1, 1, -1], 2), [-1, 1, 1, -1], 'an explicitly retained hard-pan setting remains unchanged after the migration');
    assert.deepEqual(parser.restoreTrackerChannelPans('MOD', info.channelPans, [-0.25, 0.25, 0.25, -0.25]), [-0.25, 0.25, 0.25, -0.25], 'custom MOD channel pans are preserved');
  } else if (format === 'XM') {
    assert.equal(parser.parseXmPatternRows(bytes, 0, 64).length, 64);
  } else if (format === 'S3M') {
    const rows = parser.parseS3mPatternRows(bytes, 0, 64);
    assert.equal(rows.length, 64);
    assert.ok(rows.flat().every(event => !event.note && !event.instrument && !event.volume && !event.effect && !event.parameter), 'S3M template pattern pointer resolves to the blank pattern data');
    assert.deepEqual(parser.parseTrackerOrderTable(bytes, 'S3M'), [0, 0]);
  } else {
    assert.equal(parser.parseItPatternRows(bytes, 0, 64).length, 64);
  }
}

const scratchBytes = createTrackerModuleTemplate('XM', 'Instrument Preset Check');
const importedScratch = parser.createMusicEditorSourceDocument(scratchBytes, 'instrument-preset-check.xm');
let scratchSource = { ...importedScratch, origin: 'scratch' };
for (const preset of ['sine-lead', 'pulse-lead', 'triangle-bass', 'noise-hit']) {
  const before = scratchSource;
  scratchSource = parser.applyMusicEditorSourceCommand(scratchSource, { type: 'append-instrument', preset }, `preset-${preset}`);
  assert.equal(scratchSource.instruments.length, before.instruments.length + 1, `${preset} adds one ready-to-play instrument`);
  const added = scratchSource.samples.find(sample => sample.index === scratchSource.instruments.length);
  assert.ok(added?.encodedPcm, `${preset} includes reproducible delta-encoded PCM`);
  assert.equal(added.sampleRate, 8363);
  assert.equal(added.length, 2048);
  assert.equal(added.loopType === 1, preset !== 'noise-hit', `${preset} loop policy matches its sound`);
  assert.ok(added.id && added.id !== before.samples.at(-1)?.id, `${preset} sample has a distinct UUID`);
}
const compiledPresets = parser.compileMusicEditorSourceDocument(scratchSource);
const compiledPresetInfo = parser.parseTrackerModule(compiledPresets, 'xm');
assert.equal(compiledPresetInfo.instruments, 5, 'the presets compile into the actual XM module');
assert.equal(parser.parseXmSamples(compiledPresets).size, 5);


assert.throws(() => createTrackerModuleTemplate('WAV'), /Unsupported tracker module format/);
console.log('Blank MOD/XM/S3M/IT templates and ready-to-use XM instrument presets pass the parser/compiler contract.');
