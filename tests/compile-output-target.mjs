import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { makeTargetName, default: TemplateBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/TemplateBuilder.js')));
const { locateCompiledOutput } = await import(pathToFileURL(path.resolve('dist/main/utils/gbaCompiler/compiledOutput.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-output-target-'));
try {
  assert.equal(makeTargetName('Sample Project'), 'Sample_Project');
  assert.equal(makeTargetName('Meu Jogo: ação!'), 'Meu_Jogo_acao');
  assert.equal(makeTargetName('  '), 'gba-project');
  assert.equal(makeTargetName('safe-target_1'), 'safe-target_1');
  const template = path.join(temp, 'template'), output = path.join(temp, 'output');
  fs.mkdirSync(template);fs.mkdirSync(output);
  fs.writeFileSync(path.join(template, 'Makefile'), 'TARGET := $(notdir $(CURDIR))\nROMTITLE := DEFAULT\nROMCODE := GBAS\n');
  await new TemplateBuilder({ templateDir: template, buildDir: output }).initializeBuildDirectory({ projectDir: template, targetDir: output, projectName: 'Sample Project' });
  assert.match(fs.readFileSync(path.join(output, 'Makefile'), 'utf8'), /^TARGET\s*:= Sample_Project$/m);
  fs.mkdirSync(path.join(output, 'build'), { recursive: true });
  for(const extension of ['gba','elf','map']) fs.writeFileSync(path.join(output, 'build', 'old.' + extension), 'stale');
  assert.equal(locateCompiledOutput(output).gbaPath, null, 'Old ROM must not hide missing output from the current target');
  for(const extension of ['gba','elf']) fs.writeFileSync(path.join(output, 'Sample_Project.' + extension), 'new');
  fs.writeFileSync(path.join(output, 'build', 'Sample_Project.map'), 'new');
  assert.deepEqual(locateCompiledOutput(output), { gbaPath: path.join(output,'Sample_Project.gba'), elfPath: path.join(output,'Sample_Project.elf'), mapPath: path.join(output,'build','Sample_Project.map') });
  console.log('Make output: safe target names, project configuration, missing ROM and matching ROM/ELF/MAP passed.');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-output-target-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
