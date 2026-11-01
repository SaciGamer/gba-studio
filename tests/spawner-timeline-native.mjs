import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-spawner-native-'));
try {
  const exe = path.join(temp, process.platform === 'win32' ? 'spawner.exe' : 'spawner');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', path.join(root, 'tools/butano/template/include'),
    path.join(root, 'tools/butano/template/src/spawner_timeline_manager.cpp'),
    path.join(root, 'tests/native/spawner/main.cpp'), '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Spawner timeline compilation failed:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Spawner timeline execution failed:\n${run.stdout}${run.stderr}`);
  console.log('Spawner timeline native contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
