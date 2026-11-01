import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'tools/butano/template');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-save-'));
const executable = path.join(output, process.platform === 'win32' ? 'save.exe' : 'save');
try {
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++23', '-Wall', '-Wextra', '-Werror', '-I', path.join(template, 'include'), '-I', path.join(root, 'tools/butano/butano/include'), path.join(template, 'src/variable_manager.cpp'), path.join(template, 'src/save_manager.cpp'), path.join(root, 'tests/native/save_manager_main.cpp'), '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Save manager build failed:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Save manager behavior failed:\n${run.stdout}${run.stderr}`);
  console.log('Save manager native contract passed.');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
