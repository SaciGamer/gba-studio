import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'sample_project_example');
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
if (!fs.existsSync(romFile)) throw new Error(`Missing generated ROM: ${romFile}`);

console.log(`Sample project validation passed (${resources.length} JSON resources, ROM present).`);
