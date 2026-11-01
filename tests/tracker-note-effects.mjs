import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { build } from 'esbuild';

const load = async filename => {
  const result = await build({ entryPoints: [path.resolve('src/renderer/frontend/src/utils', filename)],
    bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [fx, composition, exporter, tracker, packages] = await Promise.all([
  'trackerNoteEffects.ts', 'trackerComposition.ts', 'trackerCompositionExport.ts', 'trackerModule.ts', 'trackerProjectPackage.ts',
].map(load));
const i18n = ts.createSourceFile('I18n.tsx', fs.readFileSync('src/renderer/frontend/src/i18n/I18n.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const catalogs = new Map();
for (const statement of i18n.statements) if (ts.isVariableStatement(statement)) {
  for (const declaration of statement.declarationList.declarations) {
    if (!['enUS', 'ptBR', 'esES', 'frFR'].includes(declaration.name.getText(i18n)) || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
    catalogs.set(declaration.name.getText(i18n), new Set(declaration.initializer.properties.filter(ts.isPropertyAssignment).map(item => item.name.text)));
  }
}
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const catalog = fx.trackerNoteEffectCatalog(format);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length, `${format} effect identities are unique`);
  for (const definition of catalog) {
    const encoded = fx.encodeTrackerNoteEffects(format, [{ id: definition.id, parameter: definition.defaultParameter }]);
    assert.deepEqual(fx.encodeTrackerNoteEffects(format, fx.decodeTrackerNoteEffects(format, encoded.effect, encoded.parameter)), encoded,
      `${format} ${definition.id} retains its native effect and parameter`);
    for (const [locale, keys] of catalogs) assert.ok(keys.has(`music.effects.${definition.name}`), `${locale} translates ${definition.name}`);
    if (['patternLoop', 'patternBreak', 'orderJump', 'speed', 'tempo'].includes(definition.name)) assert.equal(definition.scope, 'row');
    if (['arpeggio', 'vibrato', 'portamento', 'pitchUp', 'pitchDown'].includes(definition.name)) assert.equal(definition.scope, 'note');
  }
  for (const base of ['portamento', 'vibrato']) {
    const combined = [{ id: base, parameter: 0 }, { id: 'volumeSlide', parameter: 0x12 }];
    const encoded = fx.encodeTrackerNoteEffects(format, combined);
    assert.deepEqual(fx.decodeTrackerNoteEffects(format, encoded.effect, encoded.parameter), combined);
  }
  assert.equal(fx.encodeTrackerNoteEffects(format, [{ id: 'arpeggio', parameter: 0x37 }, { id: 'vibrato', parameter: 0x47 }]), null,
    'incompatible effects are rejected rather than silently discarding one');
}
let project = composition.createMusicCompositionWithStarterBank('XM');
project = composition.editMusicCompositionNotes(project, 0, [{ start: 0, end: 4, pitch: 49, channelIndex: 0, instrumentIndex: 1 }]);
const snapshot = JSON.stringify(project);
let edited = composition.setMusicCompositionPatternEffect(project, 0, 0, 0, 'XM', 0, 0x37);
assert.equal(JSON.stringify(project), snapshot, 'effect edits preserve the undo snapshot');
assert.ok(edited.patterns[0].commands.some(command => command.command === 'XM:effect-0' && command.parameter === 0x37), 'arpeggio has opcode zero but is still an active effect');
let bytes = exporter.exportMusicComposition(edited, 'XM').moduleData;
assert.equal(tracker.parseXmPatternRows(bytes, 0, 64)[0][0].parameter, 0x37, 'note effects reach the native XM projection');
const restored = packages.parseTrackerProjectPackage(packages.createTrackerProjectPackage({ composition: edited }));
assert.deepEqual(restored.composition.patterns[0].commands, edited.patterns[0].commands, 'effect commands survive project save/load');
edited = composition.setMusicCompositionPatternEffect(edited, 0, 0, 0, 'XM', 0, 0);
assert.ok(!edited.patterns[0].commands.some(command => command.command === 'XM:effect-0'), 'clearing the selector removes arpeggio');
edited = { ...edited, patterns: [{ ...edited.patterns[0], rows: 32 }] };
edited = composition.setMusicCompositionPatternEffect(edited, 0, 1, 1, 'XM', 14, 0x60);
edited = composition.setMusicCompositionPatternEffect(edited, 0, 16, 1, 'XM', 14, 0x62);
edited = composition.setMusicCompositionPatternEffect(edited, 0, 31, 1, 'XM', 13, 0);
assert.ok(!edited.patterns[0].notes.some(note => note.row === 1 || note.row === 16 || note.row === 31), 'row commands need no musical note');
bytes = exporter.exportMusicComposition(edited, 'XM').moduleData;
const positions = [];
tracker.parseTrackerPlaybackRows(bytes, 'XM', 65536, position => positions.push(position));
assert.equal(positions.filter(position => position.row === 1).length, 3, 'E62 repeats the marked fragment twice after its initial playback');
assert.equal(positions.filter(position => position.row === 17).length, 1, 'playback proceeds after the loop');

const galgox = packages.parseTrackerProjectPackage(fs.readFileSync('templateEngineGame/sample_project_example/project/musics/galgox_snowheart_melody/galgox_snowheart_melody.gbatracker'));
const pattern = galgox.composition.patterns.find(item => item.index === 0);
assert.equal(pattern.rows, 32);
assert.ok(pattern.commands.some(command => command.row === 1 && command.command === 'XM:effect-e' && command.parameter === 0x60));
assert.ok(pattern.commands.some(command => command.row === 16 && command.command === 'XM:effect-e' && command.parameter === 0x62));
assert.ok(pattern.commands.some(command => command.row === 31 && command.command === 'XM:effect-d' && command.parameter === 0));
console.log('Effect catalogs, four-locale labels, note/row scopes, native combinations, arpeggio editing, undo snapshots, save/load and Galgox pattern looping pass.');
