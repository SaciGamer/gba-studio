import assert from 'node:assert/strict';
import fs from 'node:fs';

const header = fs.readFileSync('tools/butano/template/include/camera_manager.h', 'utf8');
const source = fs.readFileSync('tools/butano/template/src/camera_manager.cpp', 'utf8');
const handlers = fs.readFileSync('tools/butano/template/src/script_event_handlers.cpp', 'utf8');
const game = fs.readFileSync('tools/butano/template/src/game.cpp', 'utf8');

assert.match(header, /class CameraManager/);
assert.match(header, /follow_player_actor/);
assert.match(header, /void shake\(int frames, int amplitude\)/);
assert.match(source, /GraphicsManager::instance\(\)\.set_camera_position/);
assert.match(source, /get_player_world_x\(\) - 120/);
assert.match(source, /shake_frames/);
assert.match(handlers, /CameraManager::instance\(\)\.set_position/);
assert.match(game, /CameraManager::instance\(\)\.update\(\)/);

console.log('Camera manager contract guard passed.');
