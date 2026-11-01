import assert from 'node:assert/strict';
import { DEFAULT_INPUT_MAP, withDefaultInputMap } from '../dist/shared/inputMap.js';

const defaults=withDefaultInputMap();
assert.deepEqual(Object.keys(defaults),['move_left','move_right','move_up','move_down','confirm','cancel','jump','start','select','left_button','right_button']);
assert.deepEqual([...new Set(Object.values(defaults).flat())].sort(),['A','B','DOWN','L','LEFT','R','RIGHT','SELECT','START','UP'].sort());
assert.equal(defaults.shoot,undefined);assert.equal(defaults.menu,undefined);
const old={menu:['R'],move_left:['A'],saved_action:['L'],shoot:['B']};
const normalized=withDefaultInputMap(old);
assert.deepEqual(normalized.select,['R']);assert.equal(normalized.menu,undefined);
assert.deepEqual(normalized.move_left,['A']);assert.deepEqual(normalized.saved_action,['L']);assert.deepEqual(normalized.shoot,['B']);
assert.deepEqual(old.menu,['R']);assert.deepEqual(withDefaultInputMap({...old,select:['B']}).select,['B']);
assert.deepEqual(withDefaultInputMap({pause:['L']}).start,['L']);
assert.equal(withDefaultInputMap({pause:['L']}).pause,undefined);
assert.deepEqual(withDefaultInputMap({pause:['L'],start:['R']}).start,['R']);
defaults.move_left.push('A');assert.deepEqual(DEFAULT_INPUT_MAP.move_left,['LEFT']);
console.log('Standard input defaults cover all GBA buttons, migrate menu to Select and preserve saved associations.');
