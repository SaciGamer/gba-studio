import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const utilSource = fs.readFileSync('src/renderer/frontend/src/utils/demoControls.ts', 'utf8');
const compiled = ts.transpileModule(utilSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { normalizeDemoControls } = context.exports;
const migrated = normalizeDemoControls({ 0: { 8: { value: 'z', value2: 'BUTTON_1', value3: 'D', value4: 'q' }, 4: { value: 'ArrowUp', value2: 'DPAD_UP' } } });
assert.deepEqual(Array.from(migrated[0][8].keyboardValues), ['z', 'd', 'q']);
assert.equal(migrated[0][8].value2, 'BUTTON_1');
assert.equal(migrated[0][4].value, 'up arrow');
assert.deepEqual(JSON.parse(JSON.stringify(normalizeDemoControls(migrated))), JSON.parse(JSON.stringify(migrated)));
const cleared = normalizeDemoControls({ 0: { 8: { value: '', value2: '', keyboardValues: [] } } });
assert.equal(cleared[0][8].value2, '');
assert.equal(cleared[0][8].keyboardValues.length, 0);
let source = fs.readFileSync('src/renderer/frontend/public/emulatorjs/data/src/emulator.js', 'utf8');
source = source.replace(/^import .*;\r?\n/gm, '').replace('export default EmulatorJS;', 'globalThis.EmulatorJS = EmulatorJS;');
const runtime = {};
vm.runInNewContext(source, runtime);
const emulator = Object.create(runtime.EmulatorJS.prototype);
const inputs = [];
Object.assign(emulator, {
  started: true, controls: migrated, analogAxes: [], keyMap: { 90: 'z', 68: 'd', 81: 'q', 38: 'up arrow' },
  controlPopup: { parentElement: { parentElement: { getAttribute: () => '' } } },
  settingsMenu: { style: { display: 'none' } }, isPopupOpen: () => false,
  getSettingValue: () => 'disabled', isAutofireEnabled: () => false,
  gameManager: { simulateInput: (...args) => inputs.push(args) },
  gamepadSelection: ['pad'], getGamepadSelectionValue: () => 'pad'
});
const key = (keyCode, type) => emulator.keyChange({ keyCode, type, preventDefault() {} });
const button = type => emulator.gamepadEvent({ type, gamepadIndex: 0, label: 'BUTTON_1', index: 0 });
key(90, 'keydown'); key(68, 'keydown'); key(81, 'keydown');
button('buttondown');
key(90, 'keyup'); key(68, 'keyup'); key(81, 'keyup');
assert.deepEqual(inputs.map(args => Array.from(args)), [[0, 8, 1]]);
button('buttonup');
assert.deepEqual(inputs.map(args => Array.from(args)), [[0, 8, 1], [0, 8, 0]]);
key(38, 'keydown');
emulator.gamepadEvent({ type: 'axischanged', gamepadIndex: 0, axis: 'LEFT_STICK_Y', value: -1, oldValue: 0, label: 'LEFT_STICK_Y:-1' });
emulator.releaseMappedInputs();
assert.deepEqual(Array.from(inputs.at(-1)), [0, 4, 0]);
emulator.controls[0][4].value2 = 'LEFT_STICK_Y:-1';
inputs.length = 0;
const axis = (value, oldValue) => emulator.gamepadEvent({ type: 'axischanged', gamepadIndex: 0, axis: 'LEFT_STICK_Y', value, oldValue, label: value < -0.5 ? 'LEFT_STICK_Y:-1' : value > 0.5 ? 'LEFT_STICK_Y:+1' : null });
axis(-1, 0); key(38, 'keydown'); axis(0, -1);
assert.deepEqual(inputs.map(args => Array.from(args)), [[0, 4, 1]]);
key(38, 'keyup');
assert.deepEqual(Array.from(inputs.at(-1)), [0, 4, 0]);
axis(-1, 0); axis(1, -1);
assert.deepEqual(Array.from(inputs.at(-1)), [0, 4, 0]);
axis(-1, 1); emulator.releaseMappedInputs('gamepad:0:');
assert.deepEqual(Array.from(inputs.at(-1)), [0, 4, 0]);
// Project demo input requires the explicitly configured physical controller.
emulator.gamepad = { gamepads: [{ id: 'First', index: 0 }, { id: 'Second', index: 1 }] };
emulator.config = { gbaStudioGamepad: null };
inputs.length = 0;
button('buttondown');
assert.equal(inputs.length, 0);
key(90, 'keydown'); key(90, 'keyup');
assert.deepEqual(inputs.map(args => Array.from(args)), [[0, 8, 1], [0, 8, 0]]);
emulator.config.gbaStudioGamepad = { id: 'Second', index: 1 };
inputs.length = 0;
button('buttondown'); assert.equal(inputs.length, 0);
emulator.gamepadEvent({ type: 'buttondown', gamepadIndex: 1, label: 'BUTTON_1', index: 0 });
emulator.gamepadEvent({ type: 'buttonup', gamepadIndex: 1, label: 'BUTTON_1', index: 0 });
assert.deepEqual(inputs.map(args => Array.from(args)), [[0, 8, 1], [0, 8, 0]]);
emulator.gamepad.gamepads = [{ id: 'First', index: 0 }];
inputs.length = 0; button('buttondown'); assert.equal(inputs.length, 0);
emulator.gamepad.gamepads = [{ id: 'Second', index: 3 }];
assert.equal(emulator.getConfiguredGamepad().index, 3);
emulator.gamepad.gamepads = [{ id: 'Second', index: 0 }, { id: 'Second', index: 2 }];
assert.equal(emulator.getConfiguredGamepad(), null); // Ambiguous identical devices need selection.
console.log('Demo controls migration and simultaneous keyboard/joystick input passed.');
