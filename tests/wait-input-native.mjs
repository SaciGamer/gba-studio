import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'tools/butano/template');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-wait-input-'));
const executable = path.join(output, process.platform === 'win32' ? 'wait-input.exe' : 'wait-input');
try {
  const build = spawnSync(process.env.CXX || 'g++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', path.join(root, 'tests/native/input'), '-I', path.join(root, 'tests/native/support'), '-I', path.join(template, 'include'),
    path.join(template, 'src/input_manager.cpp'), path.join(template, 'src/event_wait_input.cpp'),
    path.join(root, 'tests/native/wait_input_main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Wait input build failed:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Wait input behavior failed:\n${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
