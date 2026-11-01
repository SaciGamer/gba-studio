import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(import.meta.dirname, '../..');
const site = path.join(workspace, '..', 'gba-studio-site');
const docsRoot = path.join(site, 'docs');
const buildRoot = path.join(site, 'build');
const routes = [];
const assetRoot = path.join(buildRoot, 'assets');

function walk(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(file, next);
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      routes.push(next.replace(/\.mdx?$/, '').split(path.sep).join('/'));
    }
  }
}

walk(docsRoot);
for (const locale of ['', 'pt', 'es']) {
  for (const route of routes) {
    const file = path.join(buildRoot, locale, 'docs', route, 'index.html');
    if (!fs.existsSync(file)) throw new Error(`Missing generated route: ${locale || 'en'}/docs/${route}`);
    const html = fs.readFileSync(file, 'utf8');
    for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
      if (!/\balt\s*=\s*"[^"]*"/i.test(image[0]) && !/\balt\s*=\s*'[^']*'/i.test(image[0])) {
        throw new Error(`Image without alt in ${file}`);
      }
    }
  }
}

const assetFiles = [];
function collectAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectAssets(file);
    else assetFiles.push(file);
  }
}
collectAssets(assetRoot);
const jsHasSearch = assetFiles.filter((file) => file.endsWith('.js')).some((file) => fs.readFileSync(file, 'utf8').includes('search-local'));
const cssHasResponsiveRules = assetFiles.filter((file) => file.endsWith('.css')).some((file) => fs.readFileSync(file, 'utf8').includes('@media'));
if (!jsHasSearch) throw new Error('Local search bundle was not generated');
if (!cssHasResponsiveRules) throw new Error('Responsive CSS rules were not generated');

console.log(`Site build verification passed (${routes.length} routes across en, pt and es, local search and responsive CSS present).`);
