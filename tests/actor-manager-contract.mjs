import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const header = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'include', 'actor_manager.h'), 'utf8');
const source = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'actor_manager.cpp'), 'utf8');
for (const method of ['spawn', 'remove', 'set_position', 'set_visible', 'get_position']) assert.match(header, new RegExp(`${method}\\(`));
assert.match(header, /bn::array<Slot, MAX_ACTORS>/);
assert.match(header, /MAX_ACTORS = GBA_STUDIO_MAX_ACTORS/);
assert.match(source, /generation/);
assert.match(source, /animation_speed = speed/);
assert.match(source, /if\(!slot\.occupied\)/);
console.log('Actor manager contract guard passed.');
