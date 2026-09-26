import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(import.meta.dirname, '..');
const site = path.join(workspace, '..', 'gba-studio-site');
const docsRoot = path.join(site, 'docs');
const imageRoot = path.join(site, 'static', 'img', 'screenshots', 'gba-studio');
const markdownFiles = [];
const imageReferences = new Set();

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.md') || file.endsWith('.mdx')) markdownFiles.push(file);
  }
}

walk(docsRoot);
for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\/img\/screenshots\/gba-studio\/([^\s)]+)/g)) {
    imageReferences.add(decodeURIComponent(match[1]));
  }
}

const available = fs.readdirSync(imageRoot).filter((file) => file.toLowerCase().endsWith('.png'));
const publishedAliases = [
  'scene-editing-mode.png', 'settings.png', 'sprite-editor.png', 'actor-interaction.png',
  'dialogue-editor.png', 'audio-editor.png', 'scene-editing-menu.png', 'palettes-editor.png',
  'scene-actions.png', 'trigger-event.png', 'image-visualize.png', 'event-editors.png',
];
const missing = [...imageReferences].filter((file) => !fs.existsSync(path.join(imageRoot, file)));
const missingAliases = publishedAliases.filter((file) => !fs.existsSync(path.join(imageRoot, file)));
if (missing.length > 0) throw new Error(`Missing documentation images: ${missing.join(', ')}`);
if (missingAliases.length > 0) throw new Error(`Missing ASCII screenshot aliases: ${missingAliases.join(', ')}`);
if (available.length < 24) throw new Error(`Expected original and ASCII screenshot assets, found ${available.length}`);

console.log(`Site documentation assets passed (${markdownFiles.length} articles, ${imageReferences.size} referenced images, ${publishedAliases.length} published aliases and ${available.length} total screenshots).`);
