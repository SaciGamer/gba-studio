import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const utils = path.resolve('src/renderer/frontend/src/utils');
const loadTypeScript = async filename => {
  const source = fs.readFileSync(path.join(utils, filename), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};

const previewPan = await loadTypeScript('trackerPreviewPan.ts');
const itPan = await loadTypeScript('trackerItPan.ts');
const notePan = await loadTypeScript('trackerNotePan.ts');
const player = fs.readFileSync(path.join(utils, 'trackerPreviewPlayer.ts'), 'utf8');
const mixer = fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/gba/mixer_asm.s', 'utf8');

assert.match(mixer, /rsb\s+r0, r0, #256[\s\S]*?mul\s+rvolL, r0, rvolR[\s\S]*?mov\s+rvolL, rvolL, lsr #8[\s\S]*?mul\s+rvolR, r0, rvolR[\s\S]*?mov\s+rvolR, rvolR, lsr #8/,
  'the checked-in MAS mixer computes left (256-pan)/256 and right pan/256 gains');
assert.match(player, /trackerPreviewPanPosition\(panAmount\)/);
assert.match(player, /trackerPreviewPanCompensationGain\(panAmount\)/);
assert.doesNotMatch(player, /const previewPanPosition\s*=|const previewPanGain\s*=/,
  'the audio player uses the separately tested pan conversion helpers');

let maximumStereoGainError = 0;
for (let byte = 0; byte <= 255; byte += 1) {
  const pan = itPan.trackerItPanByteToNormalized(byte);
  const position = previewPan.trackerPreviewPanPosition(pan);
  const compensation = previewPan.trackerPreviewPanCompensationGain(pan);
  const angle = (position + 1) * Math.PI / 4;
  const webAudioLeft = Math.cos(angle) * compensation;
  const webAudioRight = Math.sin(angle) * compensation;
  const expectedLeft = (256 - byte) / 256;
  const expectedRight = byte / 256;
  maximumStereoGainError = Math.max(maximumStereoGainError,
    Math.abs(webAudioLeft - expectedLeft), Math.abs(webAudioRight - expectedRight));
  assert.ok(Math.abs(webAudioLeft - expectedLeft) < 1e-12, `left pan gain for Maxmod byte ${byte}`);
  assert.ok(Math.abs(webAudioRight - expectedRight) < 1e-12, `right pan gain for Maxmod byte ${byte}`);
  assert.equal(notePan.decodeTrackerNotePan('XM', 8, byte), pan, `XM pan byte ${byte} preserves the Maxmod ratio`);
  assert.equal(notePan.decodeTrackerNotePan('IT', 24, byte), pan, `IT pan byte ${byte} preserves the Maxmod ratio`);
}

console.log(`Tracker stereo pan matches the MAS linear mixer for all 256 bytes (max gain error ${maximumStereoGainError}).`);
