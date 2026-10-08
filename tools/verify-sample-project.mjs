import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const migratedRoot = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
const legacyRoot = path.join(repositoryRoot, 'sample_project_example');
const root = fs.existsSync(path.join(migratedRoot, 'sample_project.gbaproj')) ? migratedRoot : legacyRoot;
const projectFile = path.join(root, 'sample_project.gbaproj');
const romFile = path.join(root, 'Build', 'sample_project.gba');
const resources = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.gbasres') || file.endsWith('.gbaproj')) resources.push(file);
  }
}

if (!fs.existsSync(projectFile)) throw new Error(`Missing sample project: ${projectFile}`);
walk(root);
for (const file of resources) JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync(romFile)) {
  console.warn(`Generated ROM not found (JSON validation still passed): ${romFile}`);
}

console.log(`Sample project validation passed (${resources.length} JSON resources${fs.existsSync(romFile) ? ', ROM present' : ''}).`);
