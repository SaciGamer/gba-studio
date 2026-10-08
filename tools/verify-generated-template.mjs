import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sampleRoot = fs.existsSync(path.join(root, 'templateEngineGame', 'sample_project_example'))
  ? path.join(root, 'templateEngineGame', 'sample_project_example')
  : path.join(root, 'sample_project_example');
const dist = path.join(root, 'dist', 'main', 'utils', 'builders');
const { default: TemplateBuilder } = await import(pathToFileURL(path.join(dist, 'TemplateBuilder.js')).href);
const { default: ResourceBuilder } = await import(pathToFileURL(path.join(dist, 'ResourceBuilder.js')).href);
const { default: CppBuilder } = await import(pathToFileURL(path.join(dist, 'CppBuilder.js')).href);

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-generated-event-'));
const templateDir = path.join(root, 'tools', 'butano', 'template');
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-fixture-'));
const config = { projectName: 'event_smoke', authorName: 'GBA Studio', version: '1.0.0', useThreads: false, useAudio: true, useGraphics: true };

const templateBuilder = new TemplateBuilder({ templateDir, buildDir: outputDir, romTitle: 'EVENT SMOKE', romCode: 'EVSM' });
await templateBuilder.initializeBuildDirectory({ projectDir, projectName: config.projectName, targetDir: outputDir, romTitle: 'EVENT SMOKE', romCode: 'EVSM' });
fs.copyFileSync(path.join(sampleRoot, 'assets', 'musics', 'cyberrid.mod'), path.join(outputDir, 'audio', 'cyberrid.mod'));

const resourceBuilder = new ResourceBuilder(outputDir, templateDir);
const triggerScript = [{ id: 'branch', command: 'EVENT_IF', args: {
  left: { kind: 'literal', type: 'boolean', value: true }, operator: '==',
  right: { kind: 'literal', type: 'boolean', value: true },
}, children: { then: [
  { id: 'trigger-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 2 } },
  { id: 'trigger-value', command: 'EVENT_VARIABLE', args: { variableId: 'trigger_value', value: { kind: 'literal', type: 'number', value: 7 } } },
], else: [] } }];
const resources = [
  resourceBuilder.processResourceObject({ _resourceType: 'settings', id: 'settings', startSceneId: 'scene', startX: 0, startY: 0, moveSpeed: 1, animSpeed: 1, direction: 'down', colorMode: 'mono', fadeDirection: 1, shooterConfig: { defaultWaveId: 'wave_01', projectileSpriteId: 'player', playerHitPoints: 3, defaultDamage: 1 } }),
  resourceBuilder.processResourceObject({ _resourceType: 'variables', id: 'variables', variables:
    ['loop', 'choice', 'trigger_value'].map(id => ({ id, symbol: `VAR_${id.toUpperCase()}`, type: 'number', initialValue: 0 })),
  }),
  resourceBuilder.processResourceObject({ _resourceType: 'scene', id: 'scene', name: 'scene', sceneType: 'POINTNCLICK', backgrounds: [], script: [
    { id: 'loop', command: 'EVENT_FOR', version: 2, args: { variableId: 'loop', start: 0, end: 1, step: 1 }, children: { then: [
      { id: 'loop-wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1 } },
      { id: 'loop-continue', command: 'EVENT_CONTINUE', args: {} },
    ] } },
    { id: 'music', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'cyberrid', volume: 50 } },
    { id: 'shooter-start', command: 'EVENT_SHOOTER_START', args: { waveId: 'wave_01' } },
    { id: 'shooter-pause', command: 'EVENT_SHOOTER_PAUSE', args: { paused: true } },
    { id: 'shooter-resume', command: 'EVENT_SHOOTER_PAUSE', args: { paused: false } },
    { id: 'shooter-stop', command: 'EVENT_SHOOTER_STOP', args: {} },
    { id: 'ui-title', command: 'EVENT_UI_SET_TEXT', args: { text: 'UI lifecycle', x: 16, y: 16, font: 'fixed8x16' } },
    { id: 'ui-move', command: 'EVENT_UI_ANIMATE', args: { uiId: 'ui-title', animation: 'move', x: 100, y: 32, speed: 1 } },
    { id: 'ui-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-hide', command: 'EVENT_UI_HIDE', args: { uiId: 'ui-title' } },
    { id: 'ui-hidden-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-show', command: 'EVENT_UI_SHOW', args: { uiId: 'ui-title' } },
    { id: 'ui-visible-frame', command: 'EVENT_WAIT', args: { units: 'frames', frames: 4 } },
    { id: 'ui-destroy', command: 'EVENT_UI_DESTROY', args: { uiId: 'ui-title' } },
    { id: 'choice', command: 'EVENT_DIALOGUE_CHOICE', args: { prompt: 'Continue?', optionA: 'Yes', optionB: 'No', resultVariable: 'choice' } },
    { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1, handle: 1 } },
    { id: 'break', command: 'EVENT_BREAK', args: {} },
  ], triggers: [{ id: 'region', x: 0, y: 0, width: 16, height: 16, activation: 'enter', once: true,
    onEnterScript: triggerScript, onLeaveScript: triggerScript,
  }] }),
];
await resourceBuilder.writeResourceHeader(resources);
await resourceBuilder.generateResourceRegistryClass(resources, config);
fs.mkdirSync(path.join(outputDir, 'build'), { recursive: true });
await resourceBuilder.writeGraphicsHeader(path.join(outputDir, 'build'));
await new CppBuilder(outputDir, templateDir, []).generateProjectStructure(config);
console.log(outputDir);

// Optional integration gate: compile the generated project with the installed
// devkitPro, keeping all outputs in this fixture's unique temporary directory.
if (process.argv.includes('--build')) {
  const devkit = process.env.DEVKITPRO;
  assert.ok(devkit, 'DEVKITPRO must point to the installed toolchain');
  const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
  const windows = process.platform === 'win32';
  const make = windows ? path.join(devkit, 'msys2', 'usr', 'bin', 'make.exe') : 'make';
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = [path.join(devkit, 'msys2', 'usr', 'bin'), path.join(devkit, 'tools', 'bin'), path.join(arm, 'bin'), env[pathKey] || ''].join(path.delimiter);
  const slash = value => value.replaceAll('\\', '/');
  env.DEVKITPRO = slash(devkit);
  env.DEVKITARM = slash(arm);
  env.BUTANO = slash(path.join(root, 'tools', 'butano'));
  const result = spawnSync(make, ['-j2'], { cwd: outputDir, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Generated-template ROM build failed in ${outputDir}`);
  const rom = path.join(outputDir, `${config.projectName}.gba`);
  assert.ok(fs.statSync(rom).size > 192, 'ROM must contain more than the GBA header');
  const memory = inspectGbaMemory(path.join(outputDir, `${config.projectName}.elf`));
  console.log(formatGbaMemoryReport(memory));
  assert.equal(memory.errors.length, 0, 'Generated ROM memory layout failed verification');
  console.log(`ROM build passed: ${rom}`);
}
