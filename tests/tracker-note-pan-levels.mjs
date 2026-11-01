import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerNotePan.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { encodeTrackerNotePan, decodeTrackerNotePan, quantizeTrackerNotePan } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const markedPositions = Array.from({ length: 9 }, (_, index) => index / 4 - 1);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  for (const position of markedPositions) {
    const encoded = encodeTrackerNotePan(format, position);
    const decoded = decodeTrackerNotePan(format, encoded.effect, encoded.parameter);
    assert.equal(quantizeTrackerNotePan(decoded), position,
      `${format} preserves slider position ${position} when a saved pan command is read back`);
    assert.deepEqual(encodeTrackerNotePan(format, decoded), encoded,
      `${format} pan command for ${position} is stable after import and export`);
  }
}
for (const pan of Array.from({ length: 201 }, (_, index) => index / 100 - 1)) {
  const quantized = quantizeTrackerNotePan(pan);
  assert.ok(markedPositions.includes(quantized), `${pan} snaps to one of the nine labeled slider positions`);
  assert.equal(quantizeTrackerNotePan(quantized), quantized, 'snapping is idempotent');
}
assert.equal(quantizeTrackerNotePan(-0.88), -1);
assert.equal(quantizeTrackerNotePan(-0.87), -0.75);
assert.equal(quantizeTrackerNotePan(0), 0);
assert.equal(quantizeTrackerNotePan(0.88), 1);

const modLeftHalf = encodeTrackerNotePan('MOD', -0.5);
const modCenter = encodeTrackerNotePan('MOD', 0);
const modRightHalf = encodeTrackerNotePan('MOD', 0.5);
assert.deepEqual(modLeftHalf, { effect: 14, parameter: 0x84 });
assert.deepEqual(modCenter, { effect: 14, parameter: 0x88 });
assert.deepEqual(modRightHalf, { effect: 14, parameter: 0x8c });
assert.equal(decodeTrackerNotePan('MOD', modCenter.effect, modCenter.parameter), 0);
assert.equal(decodeTrackerNotePan('MOD', modLeftHalf.effect, modLeftHalf.parameter), -0.5);
assert.equal(decodeTrackerNotePan('MOD', modRightHalf.effect, modRightHalf.parameter), 0.5,
  'MOD decodes the Maxmod S8 nibble as a 16-unit linear panning value');

for (const format of ['XM', 'IT']) {
  const half = encodeTrackerNotePan(format, 0.5);
  const quarterLeft = encodeTrackerNotePan(format, -0.25);
  const quarterRight = encodeTrackerNotePan(format, 0.25);
  const center = encodeTrackerNotePan(format, 0);
  assert.equal(half.parameter, 192, `${format} keeps an intermediate level in its 8-bit pan field`);
  assert.equal(decodeTrackerNotePan(format, half.effect, half.parameter), 0.5);
  assert.equal(quarterLeft.parameter, 96, `${format} supports a level between left and center`);
  assert.equal(decodeTrackerNotePan(format, quarterLeft.effect, quarterLeft.parameter), -0.25);
  assert.equal(quarterRight.parameter, 160, `${format} supports a level between center and right`);
  assert.equal(decodeTrackerNotePan(format, quarterRight.effect, quarterRight.parameter), 0.25);
  assert.equal(center.parameter, 128, `${format} preserves the exact center`);
  assert.equal(decodeTrackerNotePan(format, center.effect, center.parameter), 0);
}
for (const pan of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) {
  const encoded = encodeTrackerNotePan('S3M', pan);
  assert.equal(encoded.effect, 19, 'S3M panning uses the format-supported S8x effect');
  assert.equal(encoded.parameter >> 4, 8, 'S3M panning uses the S8x extended command');
  const decoded = decodeTrackerNotePan('S3M', encoded.effect, encoded.parameter);
  assert.ok(Math.abs(decoded - pan) <= 1 / 8, `S3M quantizes ${pan} to its nearest Maxmod S8x level`);
}
assert.equal(decodeTrackerNotePan('S3M', 19, 0x8c), 0.5, 'S3M S8x center-to-right levels use Maxmod 16-unit pan steps');
assert.deepEqual(encodeTrackerNotePan('S3M', -0.5), { effect: 19, parameter: 0x84 });
assert.deepEqual(encodeTrackerNotePan('S3M', 0), { effect: 19, parameter: 0x88 });
assert.deepEqual(encodeTrackerNotePan('S3M', 0.5), { effect: 19, parameter: 0x8c });

assert.deepEqual(encodeTrackerNotePan('XM', -2), { effect: 8, parameter: 0 });
assert.deepEqual(encodeTrackerNotePan('XM', 2), { effect: 8, parameter: 255 });
assert.deepEqual(encodeTrackerNotePan('IT', Number.NaN), { effect: 24, parameter: 128 });
console.log('Tracker note pan snaps to the nine marked positions and encodes their format-supported levels.');
