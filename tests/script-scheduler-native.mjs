import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'tests/native/scheduler');
const template = path.join(root, 'tools/butano/template');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-scheduler-test-'));
const executable = path.join(output, process.platform === 'win32' ? 'scheduler.exe' : 'scheduler');
const compiler = process.env.CXX || 'g++';
try {
  const build = spawnSync(compiler, [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', fixtures, '-I', path.join(root, 'tests/native/support'), '-I', path.join(template, 'include'),
    ...['script_command_manager.cpp', 'event_wait.cpp', 'event_wait_input.cpp', 'variable_manager.cpp', 'script_trigger_manager.cpp']
      .map(file => path.join(template, 'src', file)),
    path.join(fixtures, 'handlers.cpp'), path.join(fixtures, 'main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Native scheduler build failed (${compiler}):\n${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `Native scheduler behavior failed:\n${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
