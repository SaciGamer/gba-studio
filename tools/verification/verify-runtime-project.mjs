import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const project = path.resolve(process.argv[2] ?? 'templateEngineGame/sample_project_example');
const reportIndex = process.argv.indexOf('--report');
const reportFile = reportIndex < 0 ? null : path.resolve(process.argv[reportIndex + 1]);
const { transcodeProject } = await import(pathToFileURL(path.join(root, 'dist/main/utils/projectTranscoder/transcode-project.js')));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-runtime-project-'));
const snapshot = directory => {
  const files = {};
  const walk = location => {
    if (!fs.existsSync(location)) return;
    for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
      const file = path.join(location, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files[path.relative(directory, file).replaceAll('\\', '/')] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  };
  for (const category of ['project', 'assets']) walk(path.join(directory, category));
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.gbaproj'))) files[name] = createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
  return files;
};
const before = snapshot(project);
const snapshotHash = files => createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([left], [right]) => left.localeCompare(right, 'en')))).digest('hex');
try {
  const started = performance.now();
  const result = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2, runtimeMode: process.argv.includes('--full') ? 'full' : 'selective' });
  assert.equal(result.success, true, result.message);
  const preparationSeconds = (performance.now() - started) / 1000;
  assert.deepEqual(snapshot(project), before, 'Saved inputs changed during transcode');
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'runtime-feature-manifest.json'), 'utf8'));
  const headerFiles = fs.readdirSync(path.join(output, 'include')).filter(name => name.endsWith('_res.h'));
  let generatedBytes = 0;
  for (const name of headerFiles) {
    const file = fs.readFileSync(path.join(output, 'include', name)); generatedBytes += file.length;
    assert.doesNotMatch(file.toString(), /SpriteCanvasPiece|SpriteCanvasFrameDefinition|_JSON\[\]|_NO_PARSER\[\]|_EDITORPOSITION|_SAVED\s*=/, name);
  }
  const report = { project: path.relative(root, project).replaceAll('\\', '/'), sourceSnapshotHash: snapshotHash(before),
    preparationSeconds, generatedHeaderBytes: generatedBytes, generatedHeaderCount: headerFiles.length, savedFileCount: Object.keys(before).length, manifest };
  if (process.argv.includes('--build')) {
    const devkit = process.env.DEVKITPRO; assert.ok(devkit);
    const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
    const env = { ...process.env }; const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'PATH';
    env[key] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(arm, 'bin'), env[key]].join(path.delimiter);
    env.DEVKITPRO = devkit.replaceAll('\\', '/'); env.DEVKITARM = arm.replaceAll('\\', '/'); env.BUTANO = path.join(root, 'tools/butano').replaceAll('\\', '/');
    const started = performance.now();
    const build = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: output, env, stdio: 'inherit', windowsHide: true });
    assert.equal(build.status, 0, build.error?.message ?? 'Representative project ROM build failed');
    report.compileSeconds = (performance.now() - started) / 1000;
    const elf = fs.readdirSync(output).find(name => name.endsWith('.elf')); assert.ok(elf);
    const memory = inspectGbaMemory(path.join(output, elf)); assert.deepEqual(memory.errors, []); console.log(formatGbaMemoryReport(memory));
    report.memory = { regions: memory.regions, singletons: memory.singletons };
    const rom = path.join(output, path.basename(elf, '.elf') + '.gba'); report.romBytes = fs.statSync(rom).size; report.elfBytes = fs.statSync(path.join(output, elf)).size;
    if (process.argv.includes('--emulate')) {
      const emulatorArgs = [path.join(root, 'tests/runtime-monitor-emulator.mjs'), rom];
      if (process.argv.includes('--music-audio')) emulatorArgs.push('--music-audio');
      if (process.argv.includes('--sfx-audio')) emulatorArgs.push('--sfx-audio');
      const run = spawnSync(process.execPath, emulatorArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
      assert.equal(run.status, 0, 'Representative project emulator failed'); report.emulatorPassed = true;
    }
  }
  report.sourceSnapshotMatchesAtCompletion = snapshotHash(snapshot(project)) === report.sourceSnapshotHash;
  if (reportFile) { fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Representative runtime projection passed: ${headerFiles.length} headers, ${generatedBytes} bytes; ${Object.keys(before).length} saved files unchanged.`);
} finally {
  assert.ok(path.resolve(output).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(output).startsWith('gba-studio-runtime-project-'));
  fs.rmSync(output, { recursive: true, force: true });
}
