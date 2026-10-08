import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')).href);
const template = path.join(root, 'tools/butano/template');
const scheduler = path.join(root, 'tests/native/scheduler');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-generated-script-test-'));
const mark = (id, value) => ({ id, command: 'EVENT_VARIABLE', args: {
  variableId: 'trace', value: { kind: 'literal', type: 'number', value },
} });
const readIndex = { id: 'index', command: 'EVENT_VARIABLE', args: {
  variableId: 'trace', value: { kind: 'variable', type: 'number', variableId: 'index' },
} };
const branch = [
  { id: 'if', command: 'EVENT_IF', args: {
    left: { kind: 'literal', type: 'boolean', value: true }, operator: '==',
    right: { kind: 'literal', type: 'boolean', value: true },
  }, children: { then: [
    { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 2 } }, mark('then', 11),
  ], else: [mark('else', 99)] } }, mark('after-if', 22),
];
const loop = (id = 'loop') => ({ id, command: 'EVENT_FOR', version: 2, args: { variableId: 'index', start: 1, end: 2, step: 1 },
  children: { then: [readIndex, { id: 'continue', command: 'EVENT_CONTINUE', args: {} }, mark('unreachable', 99)] },
});
try {
  fs.mkdirSync(path.join(output, 'include'));
  const builder = new ResourceBuilder(output, template);
  const scenes = [
    { id: 'attached', triggers: [{ id: 'trigger', activation: 'enter', width: 8, height: 8, once: true,
      onEnterScript: branch, onLeaveScript: branch }], actors: [{ id: 'npc', onInteractScript: branch }] },
    { id: 'loop', script: [loop(), mark('after-loop', 9)] },
    { id: 'late-loop', script: [...Array.from({ length: 20 }, (_, i) => mark(`prefix-${i}`, 0)), loop(), mark('after-loop', 9)] },
    { id: 'break-loop', script: [{ ...loop(), children: { then: [readIndex,
      { id: 'break', command: 'EVENT_BREAK', args: {} }, mark('unreachable', 99)] } }, mark('after-break', 9)] },
    { id: 'while-loop', script: [{ id: 'while', command: 'EVENT_WHILE', args: branch[0].args, children: { then: [
      { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } }, mark('body', 7),
      { id: 'break', command: 'EVENT_BREAK', args: {} },
    ] } }, mark('after-while', 9)] },
    { id: 'nested-loop', script: [{ ...loop(), children: { then: [readIndex, {
      ...loop('inner'), args: { variableId: 'child_index', start: 2, end: 3, step: 1 }, children: { then: [mark('body', 7)] },
    }] } }, mark('after-nested', 9)] },
    { id: 'comments', triggers: [{ id: 'commented', onEnterScript: [{ ...mark('disabled', 99), args: { __comment: true } }] }],
      actors: [{ id: 'npc', onInteractScript: [{ ...mark('disabled', 99), args: { __comment: true } }] }] },
  ];
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'loop-overflow',
    script: Array.from({ length: 17 }, (_, i) => loop(`loop-${i}`)),
  }), /runtime limit of 16 FOR loops/);
  assert.doesNotThrow(() => builder.processResourceObject({ _resourceType: 'scene', id: 'loop-capacity',
    script: Array.from({ length: 16 }, (_, i) => loop(`loop-${i}`)),
  }));
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'loop-version',
    script: [{ ...loop(), version: 3 }],
  }), /unsupported schema version 3/);
  const headers = scenes.map(scene => builder.processResourceObject({ _resourceType: 'scene', ...scene }).headerContent.toString('utf8'));
  fs.writeFileSync(path.join(output, 'include/generated_scripts.h'), headers.join('\n'));
  const executable = path.join(output, process.platform === 'win32' ? 'generated.exe' : 'generated');
  const build = spawnSync(process.env.CXX || 'g++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', path.join(output, 'include'), '-I', scheduler, '-I', path.join(root, 'tests/native/support'),
    '-I', path.join(template, 'include'),
    ...['script_command_manager.cpp', 'event_wait.cpp', 'event_wait_input.cpp', 'variable_manager.cpp', 'script_trigger_manager.cpp'].map(file => path.join(template, 'src', file)),
    path.join(scheduler, 'handlers.cpp'), path.join(root, 'tests/native/generated/main.cpp'), '-o', executable,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Generated program compilation failed:\n${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `Generated program execution failed:\n${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
