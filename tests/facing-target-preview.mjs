import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/renderer/frontend/src/components/events/facingTargetPreviewModel.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { facingTargetPreview } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const source = { x: 0, y: 0, direction: 'right', name: 'Source' };
const target = { x: 32, y: -80, direction: 'down', name: 'Target' };
assert.equal(facingTargetPreview({}, source, target).matches, false);
let model = facingTargetPreview({ lookY: false, distanceX: 2, distanceXUnit: 'tiles' }, source, target);
assert.equal(model.matches, true); assert.equal(model.distanceX, 32);
assert.ok(model.points); assert.equal(model.dy, -80);
assert.equal(facingTargetPreview({ lookY: false, distanceX: 31 }, source, target).matches, false);
assert.equal(facingTargetPreview({ lookX: false, lookY: false }, source, target).matches, false);
assert.equal(facingTargetPreview({ lookX: false, lookY: false }, source, target).points, '');
assert.equal(facingTargetPreview({}, source, source).matches, false);
assert.equal(facingTargetPreview({}, null, target).matches, null);
model = facingTargetPreview({ distanceX: { kind: 'variable', variableId: '54520591-68f7-486d-9248-871ee0a27681' } }, source, target);
assert.equal(model.matches, null); assert.equal(model.dynamic, true); assert.equal(model.points, '');
assert.equal(facingTargetPreview({ lookX: false, distanceX: { kind: 'variable', variableId: '54520591-68f7-486d-9248-871ee0a27681' } }, source, target).dynamic, false);
// The four dominant-direction sectors and their disabled-axis variants.
for (const [direction, x, y] of [['right', 20, 10], ['left', -20, 10], ['up', 10, -20], ['down', 10, 20]]) {
  const actor = { ...source, direction };
  assert.equal(facingTargetPreview({}, actor, { ...target, x, y }).matches, true);
  const horizontal = direction === 'left' || direction === 'right';
  assert.equal(facingTargetPreview({ lookX: horizontal, lookY: !horizontal }, actor, { ...target, x, y }).matches, true);
  assert.equal(facingTargetPreview({ lookX: !horizontal, lookY: horizontal }, actor, { ...target, x, y }).matches, false);
}
model = facingTargetPreview({ distanceX: 200, distanceY: 100 }, source, { ...target, x: 500, y: 300 });
assert.ok(model.scale < 1);
for (const point of model.points.split(' ').filter(Boolean)) {
  const [x, y] = point.split(',').map(Number);
  assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 160, 'Area remains inside the viewport after zooming');
}
console.log('Facing preview: axis rules, units, range boundaries, direction sectors, unknown values and zoom passed.');
