import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
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
fs.copyFileSync(path.join(root, 'projeto_exemplo', 'audio', 'cyberrid.mod'), path.join(outputDir, 'audio', 'cyberrid.mod'));

const resourceBuilder = new ResourceBuilder(outputDir, templateDir);
const resources = [
  resourceBuilder.processResourceObject({ _resourceType: 'settings', id: 'settings', startSceneId: 'scene', startX: 0, startY: 0, moveSpeed: 1, animSpeed: 1, direction: 'down', colorMode: 'mono', fadeDirection: 1 }),
  resourceBuilder.processResourceObject({ _resourceType: 'scene', id: 'scene', name: 'scene', sceneType: 'POINTNCLICK', backgrounds: [], script: [
    { id: 'music', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'cyberrid', volume: 50 } },
    { id: 'choice', command: 'EVENT_DIALOGUE_CHOICE', args: { prompt: 'Continue?', optionA: 'Yes', optionB: 'No', resultVariable: 'choice' } },
    { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 1, handle: 1 } },
    { id: 'break', command: 'EVENT_BREAK', args: {} },
  ] }),
];
await resourceBuilder.writeResourceHeader(resources);
await resourceBuilder.generateResourceRegistryClass(resources, config);
fs.mkdirSync(path.join(outputDir, 'build'), { recursive: true });
await resourceBuilder.writeGraphicsHeader(path.join(outputDir, 'build'));
await new CppBuilder(outputDir, templateDir, []).generateProjectStructure(config);
console.log(outputDir);
