import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'input_manager.cpp'), 'utf8');
const game = fs.readFileSync(path.join(root, 'tools', 'butano', 'template', 'src', 'game.cpp'), 'utf8');
assert.match(input, /InputSnapshot/);
assert.match(input, /a_pressed/);
assert.match(input, /b_pressed/);
assert.match(game, /InputManager::instance\(\)\.poll\(\)/);
assert.match(game, /input\.touch_active/);
assert.match(game, /DialogueManager::instance\(\)\.acknowledge\(\)/);
console.log('Input-trigger integration guard passed.');
