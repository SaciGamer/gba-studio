import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-shooter-native-'));
try {
  const exe = path.join(temp, process.platform === 'win32' ? 'shooter.exe' : 'shooter');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', path.join(root, 'tools/butano/template/include'),
    path.join(root, 'tools/butano/template/src/combat_manager.cpp'),
    path.join(root, 'tools/butano/template/src/spawner_timeline_manager.cpp'),
    path.join(root, 'tools/butano/template/src/shooter_kit.cpp'),
    path.join(root, 'tests/native/shooter/main.cpp'), '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Shooter kit compilation failed:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `Shooter kit execution failed:\n${run.stdout}${run.stderr}`);
  console.log('Shooter kit native contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
