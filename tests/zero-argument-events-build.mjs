import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-zero-args-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  for (const args of [undefined, {}, { __collapse: true }]) {
    const header = builder.processResourceObject({
      _resourceType: 'scene', id: 'zero_args', backgrounds: [],
      script: ['EVENT_HIDE_ALL_SPRITES', 'EVENT_SHOW_ALL_SPRITES', 'EVENT_CAMERA_STOP_FOLLOW'].map((command, index) => ({
        id: `event-${index}`, command, ...(args === undefined ? {} : { args }),
      })),
    }).headerContent.toString();
    assert.match(header, /static const void\* SCENE_ZERO_ARGS_ARGS_0 = nullptr;/);
    assert.match(header, /static const void\* SCENE_ZERO_ARGS_ARGS_1 = nullptr;/);
    assert.match(header, /static const void\* SCENE_ZERO_ARGS_ARGS_2 = nullptr;/);
    const cpp = path.join(temp, 'test.cpp');
    fs.writeFileSync(cpp, header + '\nint main(){return 0;}');
    const build = spawnSync(process.env.CXX || 'g++', [
      '-std=c++17', '-Wall', '-Wextra', '-Werror',
      '-I', 'tests/native/support', '-I', 'tests/native/scheduler',
      '-I', 'tools/butano/template/include', cpp, '-o', path.join(temp, 'test.exe'),
    ], { encoding: 'utf8', windowsHide: true });
    assert.equal(build.status, 0, build.stdout + build.stderr);
  }
  console.log('Zero-argument events: omitted, empty and editor-only arguments compile successfully.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
