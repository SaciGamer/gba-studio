import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixture = path.join(root, 'tests/native/input');
const template = path.join(root, 'tools/butano/template');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-input-group-'));
const executable = path.join(output, process.platform === 'win32' ? 'input-group.exe' : 'input-group');
try {
  const build = spawnSync(process.env.CXX || 'g++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', fixture, '-I', path.join(root, 'tests/native/support'), '-I', path.join(template, 'include'),
    path.join(template, 'src/input_manager.cpp'), path.join(fixture, 'main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Input group build failed:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Input group behavior failed:\n${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
