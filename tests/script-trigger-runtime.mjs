import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'script_trigger_manager.cpp'), 'utf8');
const game = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'game.cpp'), 'utf8');
for (const activation of ['enter', 'exit', 'stay', 'interact', 'touch', 'input', 'timer']) {
  assert.match(source, new RegExp(`TriggerActivation::${activation}`));
}
assert.match(source, /cooldown_frames/);
assert.match(source, /trigger\.once && state\.fired/);
assert.match(source, /trigger\.activation == TriggerActivation::exit \? trigger\.on_leave/);
assert.match(source, /cancel_scene\(scene_id\)/);
assert.match(game, /trigger_manager\.update/);
console.log('Script trigger runtime guard passed.');
