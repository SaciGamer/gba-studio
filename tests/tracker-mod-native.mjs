import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/modPlayer.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseModModule, replaceModSamplePcm, updateModEvents, updateModSample } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const modVolumeSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModVolume.ts'), 'utf8');
const modVolumeCompiled = ts.transpileModule(modVolumeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerModVolumeRow } = await import(`data:text/javascript;base64,${Buffer.from(modVolumeCompiled).toString('base64')}`);
const estimateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSampleEstimate.ts'), 'utf8');
const previewSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerPreviewPlayer.ts'), 'utf8');
const estimateCompiled = ts.transpileModule(estimateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateTrackerSampleModuleSize } = await import(`data:text/javascript;base64,${Buffer.from(estimateCompiled).toString('base64')}`);

const bytes = new Uint8Array(1084 + 64 * 4 * 4);
bytes.set([... 'M.K.'].map(character => character.charCodeAt(0)), 1080);
bytes[950] = 1;
bytes[44] = 0x0f;
bytes.set([0x01, 0xac, 0x1f, 0x06], 1084);
bytes.set([0x01, 0x90, 0x04, 0x42], 1084 + 4 * 4);
const module = parseModModule(bytes.buffer);
assert.ok(module);
assert.equal(module.patterns[0][0][0].period, 428);
assert.equal(module.samples[0].finetune, -1);
assert.deepEqual(trackerModVolumeRow(64, 0x0c, 32, 6), { rowStartVolume: 32, endingVolume: 32, steps: [] }, 'MOD C20 sets channel volume on row entry');
assert.deepEqual(trackerModVolumeRow(64, 0x0a, 0x0f, 6), {
  rowStartVolume: 64,
  endingVolume: 0,
  steps: [{ tick: 1, value: 49 }, { tick: 2, value: 34 }, { tick: 3, value: 19 }, { tick: 4, value: 4 }, { tick: 5, value: 0 }],
}, 'MOD A0F preserves row-entry volume and decrements by 15 on following ticks');
assert.deepEqual(trackerModVolumeRow(40, 0x05, 0x30, 4), {
  rowStartVolume: 40,
  endingVolume: 49,
  steps: [{ tick: 1, value: 43 }, { tick: 2, value: 46 }, { tick: 3, value: 49 }],
}, 'MOD 5xy applies regular volume slides on nonzero ticks');
assert.deepEqual(trackerModVolumeRow(40, 0x06, 0x2f, 6), { rowStartVolume: 42, endingVolume: 42, steps: [] }, 'MOD 6xF applies a fine slide on row entry only');
assert.deepEqual(trackerModVolumeRow(40, 0x0a, 0xf2, 6), { rowStartVolume: 38, endingVolume: 38, steps: [] }, 'MOD AFx applies a fine slide on row entry only');
assert.deepEqual(trackerModVolumeRow(52, 0x0a, 0xf0, 6), { rowStartVolume: 64, endingVolume: 64, steps: [] }, 'MOD AF0 fine slide saturates at the channel-volume maximum');
assert.deepEqual(trackerModVolumeRow(40, 0x00, 0, 6), { rowStartVolume: 40, endingVolume: 40, steps: [] }, 'unrelated MOD commands leave channel volume unchanged');
const fineTunedModule = updateModSample(module, 0, { fineTune: -2 });
assert.equal(parseModModule(fineTunedModule.bytes.buffer)?.samples[0].finetune, -2);
assert.equal(module.bytes[44], 0x0f, 'source MOD finetune remains unchanged');
const loopFixture = new Uint8Array(1084 + 64 * 4 * 4 + 8);
loopFixture.set([... 'M.K.'].map(character => character.charCodeAt(0)), 1080);
loopFixture[950] = 1;
loopFixture[42] = 0;
loopFixture[43] = 4;
loopFixture[44] = 0x0f;
loopFixture[45] = 32;
loopFixture[48] = 0;
loopFixture[49] = 2;
const loopModule = parseModModule(loopFixture.buffer);
assert.ok(loopModule);
assert.equal(loopModule.samples[0].length, 8);
assert.equal(loopModule.samples[0].loopLength, 4);
const renamedLoopModule = updateModSample(loopModule, 0, { name: 'Renamed fixture' });
assert.equal(parseModModule(renamedLoopModule.bytes.buffer)?.samples[0].loopLength, 4, 'renaming a MOD sample preserves its loop length');
assert.equal(parseModModule(renamedLoopModule.bytes.buffer)?.samples[0].finetune, -1, 'renaming a MOD sample preserves its finetune');
const edited = updateModEvents(module, 0, [
  { row: 0, channel: 0, patch: { period: 381 } },
  { row: 1, channel: 0, patch: { sample: 2 } },
]);
assert.equal(edited.patterns[0][0][0].period, 381);
assert.equal(edited.patterns[0][0][0].effect, 15);
assert.equal(edited.patterns[0][0][0].parameter, 6);
assert.equal(edited.patterns[0][1][0].sample, 2);
assert.equal(edited.patterns[0][1][0].effect, 4);
assert.equal(edited.patterns[0][1][0].parameter, 0x42);
assert.match(previewSource, /if \(format === 'MOD' && event\.instrument > 0\) \{[\s\S]*?modChannelVolumes\[channel\] = selectedSample\?\.volume \?\? 64;/, 'a MOD instrument selection restores the selected sample header volume');
assert.match(previewSource, /const modVolumeStart = format === 'MOD' && event\.note > 0 && event\.instrument > 0[\s\S]*?samples\.get\(channelInstruments\[channel\] \?\? event\.instrument\)\?\.volume \?\? 64/, 'a new MOD note starts from its selected sample volume after an earlier Cxx');
assert.match(previewSource, /trackerModVolumeRow\(modVolumeStart, effect, parameter, currentTickCount\)[\s\S]*?modVolumeRow\.steps\.map\(\(\{ tick, value \}\) => \(\{ time: tick \* tickDuration, value \}\)\)[\s\S]*?modChannelVolumes\[channel\] = modVolumeRow\.endingVolume;/,
  'MOD playback uses the tested pure volume-row calculation and maps its steps to the quantized tick duration');
assert.equal(module.patterns[0][0][0].period, 428, 'batch edit does not mutate the original parsed MOD');
assert.equal(bytes[1084 + 1], 0xac, 'batch edit does not mutate the source MOD bytes');

const sampleDataOffset = 1084 + 64 * 4 * 4;
const replaceFixture = Buffer.alloc(sampleDataOffset + 12);
replaceFixture.write('M.K.', 1080, 4, 'ascii');
replaceFixture[950] = 1;
replaceFixture.write('first', 20, 22, 'ascii');
replaceFixture.writeUInt16BE(4, 42);
replaceFixture.write('second', 50, 22, 'ascii');
replaceFixture.writeUInt16BE(2, 72);
replaceFixture.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], sampleDataOffset);
const replaceSource = parseModModule(replaceFixture.buffer.slice(replaceFixture.byteOffset, replaceFixture.byteOffset + replaceFixture.byteLength));
assert.ok(replaceSource);
const replaced = replaceModSamplePcm(replaceSource, 0, Int8Array.from([0, -64, 64]), 'kick');
assert.ok(replaced);
assert.equal(estimateTrackerSampleModuleSize('MOD', replaceFixture.length, replaceSource.samples[0].length, 3)?.afterBytes, replaced.bytes.length, 'MOD file-size estimate matches the replacement writer including word padding');
assert.equal(replaced.samples[0].name, 'kick');
assert.equal(replaced.samples[0].length, 4, 'odd MOD sample lengths are padded to the required word boundary');
assert.equal(replaced.samples[0].loopLength, 0, 'replacement PCM is one-shot until a loop is explicitly configured');
assert.deepEqual(Array.from(replaced.bytes.slice(replaced.samples[0].dataOffset, replaced.samples[0].dataOffset + 4)), [0, 192, 64, 0]);
assert.deepEqual(Array.from(replaced.bytes.slice(replaced.samples[1].dataOffset, replaced.samples[1].dataOffset + 4)), [9, 10, 11, 12], 'later sample data moves without changing its bytes');
assert.deepEqual(Array.from(replaced.bytes.slice(1084, sampleDataOffset)), Array.from(replaceFixture.slice(1084, sampleDataOffset)), 'pattern bytes remain unchanged');
assert.equal(replaceSource.samples[0].name, 'first', 'replacing a sample does not mutate the source module');
assert.equal(replaceModSamplePcm(replaceSource, 0, new Int8Array(131_071), 'too-long'), null, 'MOD rejects samples above its 65535-word header limit');

const flowSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModPlaybackFlow.ts'), 'utf8');
const flowCompiled = ts.transpileModule(flowSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createModPlaybackSequence } = await import(`data:text/javascript;base64,${Buffer.from(flowCompiled).toString('base64')}`);
const flowRows = Array.from({ length: 192 }, () => Array.from({ length: 4 }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 })));
flowRows[2][0] = { ...flowRows[2][0], effect: 0x0b, parameter: 1 };
assert.deepEqual(createModPlaybackSequence(flowRows).slice(0, 5), [0, 1, 2, 64, 65], 'Bxx should jump to the requested order');
flowRows[2][0] = { ...flowRows[2][0], effect: 0x0d, parameter: 0x12 };
assert.deepEqual(createModPlaybackSequence(flowRows).slice(0, 4), [0, 1, 2, 76], 'Dxx should break to the BCD row of the next order');
flowRows[2][0] = { ...flowRows[2][0], effect: 0x0e, parameter: 0x60 };
flowRows[5][0] = { ...flowRows[5][0], effect: 0x0e, parameter: 0x62 };
assert.deepEqual(createModPlaybackSequence(flowRows).slice(0, 16), [0, 1, 2, 3, 4, 5, 2, 3, 4, 5, 2, 3, 4, 5, 6, 7], 'E6x should repeat the current pattern loop the requested number of times');
flowRows[2][0] = { ...flowRows[2][0], effect: 0x0b, parameter: 0 };
assert.equal(createModPlaybackSequence(flowRows, 128).length, 128, 'self-jumps must be bounded to prevent a runaway preview');
if (process.argv.includes('--audit-real-modules')) {
  const musicDirectory = path.resolve('templateEngineGame/shooter_game/assets/musics');
  for (const filename of ['basic_instinct.mod', 'fruit.mod', 'stardstm.mod', 'cyberrid.mod']) {
    const file = fs.readFileSync(path.join(musicDirectory, filename));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const parsed = parseModModule(buffer);
    if (!parsed) throw new Error(`Could not parse real MOD module ${filename}.`);
    const effects = new Map();
    let noteEvents = 0;
    for (const order of parsed.patternTable.slice(0, parsed.orders)) {
      for (const row of parsed.patterns[order] ?? []) {
        for (const event of row) {
          if (event.period > 0) noteEvents += 1;
          if (event.effect || event.parameter) effects.set(event.effect, (effects.get(event.effect) ?? 0) + 1);
        }
      }
    }
    console.log(`${filename} real MOD coverage: ${JSON.stringify({ channels: parsed.channels, orders: parsed.orders, patterns: parsed.patterns.length, samples: parsed.samples.length, sampleFrames: parsed.samples.reduce((total, sample) => total + sample.length, 0), noteEvents, effects: [...effects].sort((a, b) => a[0] - b[0]) })}.`);
  }
}
console.log('MOD tracker batch edit contract passed.');
