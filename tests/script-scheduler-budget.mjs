import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'tools', 'butano', 'template', 'src', 'script_command_manager.cpp'),
  'utf8',
);

assert.match(source, /constexpr int instruction_budget\s*=\s*16/);
assert.match(source, /for\s*\(int step = 0; step < instruction_budget/);
assert.match(source, /previous_data.*active_data/);
assert.match(source, /EventStatus status = EventStatus::running/);
assert.match(source, /status == EventStatus::failed/);
assert.match(source, /EVENT_BREAK/);
assert.match(source, /loop_remaining/);
assert.doesNotMatch(source, /bn::core::update\s*\(/);

console.log('Script scheduler budget guard passed.');
