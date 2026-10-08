import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'tests/native/triggers');
const template = path.join(root, 'tools/butano/template');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-trigger-test-'));
const executable = path.join(output, process.platform === 'win32' ? 'triggers.exe' : 'triggers');
// A native host compiler is required; do not silently skip behavioral coverage.
const compiler = process.env.CXX || 'g++';
try {
  const build = spawnSync(compiler, [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', fixtures, '-I', path.join(root, 'tests/native/support'), '-I', path.join(template, 'include'),
    path.join(template, 'src/script_trigger_manager.cpp'),
    path.join(fixtures, 'main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Native trigger build failed (${compiler}):\n${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Native trigger behavior failed:\n${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  // Only the unique directory created by this test is removed.
  fs.rmSync(output, { recursive: true, force: true });
}
