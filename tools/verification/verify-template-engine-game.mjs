import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const { ResourceBuilder } = await import(pathToFileURL(path.resolve(import.meta.dirname, '../..', 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);

const root = path.resolve(import.meta.dirname, '../..', 'templateEngineGame');
const projects = [
  { id: 'sample_project_example', file: 'sample_project.gbaproj', requireShooter: false },
  { id: 'shooter_game', file: 'shooter_game.gbaproj', requireShooter: true },
];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (file.endsWith('.gbasres') || file.endsWith('.gbaproj')) files.push(file);
  }
  return files;
}

for (const project of projects) {
  const directory = path.join(root, project.id);
  const projectFile = path.join(directory, project.file);
  if (!fs.existsSync(projectFile)) throw new Error(`Missing template-engine project: ${projectFile}`);
  const resources = walk(directory);
  const textArtifacts = walk(directory).filter(file => /\.(?:gbasres|gbaproj|json|bak)$/i.test(file));
  for (const file of textArtifacts) {
    const text = fs.readFileSync(file, 'utf8');
    if (/local:\/\/|file:\/\/|[A-Za-z]:[\\/]|GameBoyProjetos/i.test(text)) {
      throw new Error(`Template artifact contains a machine-specific path: ${file}`);
    }
  }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), `gba-studio-${project.id}-`));
  try {
    fs.mkdirSync(path.join(output, 'include'), { recursive: true });
    fs.mkdirSync(path.join(output, 'src'), { recursive: true });
    const builder = new ResourceBuilder(output, path.resolve(import.meta.dirname, '../..', 'tools', 'butano', 'template'));
    for (const file of resources) {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      const serialized = JSON.stringify(value);
      if (/local:\/\/|[A-Za-z]:[\\/]/.test(serialized)) {
        throw new Error(`Template resource contains a machine-specific path: ${file}`);
      }
      if (value._resourceType && value._resourceType !== 'project') builder.processResourceObject(value, file);
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
  if (project.requireShooter) {
    const settings = JSON.parse(fs.readFileSync(path.join(directory, 'project', 'settings.gbasres'), 'utf8'));
    if (!settings.shooterConfig?.defaultWaveId || !settings.shooterConfig?.projectileSpriteId) {
      throw new Error('Shooter project is missing shooterConfig defaults');
    }
    const sceneFiles = resources.filter(file => file.includes(`${path.sep}scenes${path.sep}`));
    const scenes = sceneFiles.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    const entries = scenes.flatMap(scene => scene.spawnerTimelines?.flatMap(timeline => timeline.entries ?? []) ?? []);
    if (!entries.some(entry => entry.patternId === 'boss') || !entries.some(entry => entry.dropId)) {
      throw new Error('Shooter project is missing boss/drop timeline entries');
    }
  }
  console.log(`${project.id}: ${resources.length} JSON resources validated.`);
}

console.log('Template engine game package validation passed.');
