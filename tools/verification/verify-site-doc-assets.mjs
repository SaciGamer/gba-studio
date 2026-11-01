import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(import.meta.dirname, '../..');
const site = path.join(workspace, '..', 'gba-studio-site');
const imageRoot = path.join(site, 'static', 'img', 'screenshots', 'gba-studio');
const manifestPath = path.join(site, 'CAPTURAS_DOCUMENTACAO_MANIFEST.json');
const markdownFiles = [];
const imageReferences = new Set();

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.md') || file.endsWith('.mdx')) markdownFiles.push(file);
  }
}

walk(path.join(site, 'docs'));
for (const locale of ['pt', 'es']) {
  walk(path.join(site, 'i18n', locale, 'docusaurus-plugin-content-docs', 'current'));
}

for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/!\[([^\]]*)\]\((\/img\/screenshots\/gba-studio\/[^\s)]+)(?:\s+[^)]*)?\)/g)) {
    if (!match[1].trim()) throw new Error(`Screenshot missing alt text in ${file}: ${match[2]}`);
    imageReferences.add(decodeURIComponent(path.basename(match[2])));
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.images)) throw new Error('Invalid screenshot manifest schema');
const manifestFiles = new Set();
for (const image of manifest.images) {
  if (!image.file || manifestFiles.has(image.file)) throw new Error(`Invalid or duplicate manifest image: ${image.file}`);
  manifestFiles.add(image.file);
  if (!fs.existsSync(path.join(imageRoot, image.file))) throw new Error(`Manifest image missing: ${image.file}`);
  if (image.status === 'captured' && (!image.test || !image.scenario || !image.sha256 || !image.actualPng?.width || !image.actualPng?.height || !image.locale || !image.theme || !image.appRevision || !image.siteRevision)) {
    throw new Error(`Captured image lacks traceability fields: ${image.file}`);
  }
  if (image.status === 'captured') {
    const actualImageHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(imageRoot, image.file))).digest('hex');
    if (actualImageHash !== image.sha256) throw new Error(`Screenshot hash differs from manifest: ${image.file}`);
    for (const [article, expectedHash] of Object.entries(image.articleHashes ?? {})) {
      const articlePath = path.resolve(site, article);
      if (!articlePath.startsWith(`${site}${path.sep}`) || !fs.existsSync(articlePath)) throw new Error(`Manifest article is missing or outside site: ${article}`);
      const actualArticleHash = crypto.createHash('sha256').update(fs.readFileSync(articlePath)).digest('hex');
      if (actualArticleHash !== expectedHash) throw new Error(`Article hash differs from manifest: ${article}`);
    }
  }
}

const missing = [...imageReferences].filter((file) => !fs.existsSync(path.join(imageRoot, file)));
const untracked = [...imageReferences].filter((file) => !manifestFiles.has(file));
if (missing.length) throw new Error(`Missing documentation images: ${missing.join(', ')}`);
if (untracked.length) throw new Error(`Documentation images missing from manifest: ${untracked.join(', ')}`);

console.log(`Site documentation assets passed (${markdownFiles.length} locale articles, ${imageReferences.size} referenced images, ${manifest.images.length} manifest entries).`);
