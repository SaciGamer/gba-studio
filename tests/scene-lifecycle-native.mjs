import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'tools/butano/template');
const scenes = path.join(root, 'tests/native/scenes');
const scheduler = path.join(root, 'tests/native/scheduler');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-scene-test-'));
try {
  // This lifecycle harness has no SRAM/resource save registry.
  fs.writeFileSync(path.join(output, 'native-features.h'), fs.readFileSync(path.join(template, 'include/gba_studio_features.h'), 'utf8').replace('#define GBA_STUDIO_FEATURE_SAVE 1', '#define GBA_STUDIO_FEATURE_SAVE 0'));
  // Materialize the real template header's project-name placeholder, as build does.
  fs.writeFileSync(path.join(output, 'game.h'), fs.readFileSync(path.join(template, 'include/game.h'), 'utf8')
    .replaceAll('{{PROJECT_NAME_UPPER}}', 'NATIVE_TEST'));
  const executable = path.join(output, process.platform === 'win32' ? 'scenes.exe' : 'scenes');
  const build = spawnSync(process.env.CXX || 'g++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror', '-DGBA_STUDIO_NATIVE_SCENE_LIFECYCLE', '-include', path.join(output, 'native-features.h'),
    '-I', output, '-I', scenes, '-I', scheduler, '-I', path.join(root, 'tests/native/support'), '-I', path.join(template, 'include'),
      ...['game.cpp', 'actor_manager.cpp', 'combat_manager.cpp', 'shooter_kit.cpp', 'spawner_timeline_manager.cpp', 'script_command_manager.cpp', 'event_wait.cpp', 'event_wait_input.cpp', 'variable_manager.cpp', 'script_trigger_manager.cpp', 'event_change_scene.cpp']
      .map(file => path.join(template, 'src', file)),
    path.join(scheduler, 'handlers.cpp'), path.join(scenes, 'fade.cpp'), path.join(scenes, 'main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Scene lifecycle compilation failed:\n${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `Scene lifecycle execution failed:\n${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
