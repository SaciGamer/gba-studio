import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const site = path.resolve(root, '../gba-studio-site');
const build = path.join(site, 'build');
assert.ok(fs.existsSync(path.join(build, 'docs/guides/save-and-load/index.html')), 'Build the site before reviewing it');
const app = express();app.use(express.static(build));
const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
const browser = await chromium.launch({ headless: true });
const output = path.join(root, 'test-results/site-docs');fs.mkdirSync(output, { recursive: true });
const routes = [
  'docs/guides/save-and-load', 'docs/guides/controls', 'docs/guides/physics',
  'docs/guides/actors-and-interactions', 'docs/guides/dialogue', 'docs/guides/prefabs',
  'docs/guides/sound-effects', 'docs/guides/music-editor', 'docs/guides/ui-and-fonts',
  'docs/reference/events', 'docs/reference/limits-and-compatibility',
  'pt/docs/guides/save-and-load', 'es/docs/guides/save-and-load',
  'pt/docs/guides/camera-and-fades', 'es/docs/guides/camera-and-fades',
  'pt/docs/guides/controls', 'es/docs/guides/physics',
];
try {
  const page = await browser.newPage();
  const errors = [];page.on('pageerror', error => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(`http://127.0.0.1:${server.address().port}/${route}/`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      await page.locator('main h1').waitFor({ state: 'visible' });
      const body = await page.locator('main').innerText();
      assert.ok(body.length > 150, `Missing article content: ${route}`);
      assert.ok(!/Save Write|Save Read|0\.5\.0-beta/.test(body), `Stale user instructions: ${route}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 2, `${route}: page overflows viewport at ${width}px by ${overflow}px`);
      if (route.endsWith('guides/save-and-load')) {
        assert.ok(body.includes('Game Data Save') && body.includes('Game Data Load'), route);
        assert.ok(body.includes('On Save') && body.includes('On Load'), route);
      }
      if (['docs/guides/controls', 'docs/guides/save-and-load', 'pt/docs/guides/save-and-load'].includes(route)) {
        await page.screenshot({ path: path.join(output, `${route.replaceAll('/', '-')}-${width}.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify({ routes, widths: [1280, 390], passed: true, screenshots: fs.readdirSync(output).filter(name => name.endsWith('.png')) }, null, 2));
  console.log(`Local site review passed: ${routes.length} routes, desktop/mobile, locale fallback, current instructions and no page overflow or JavaScript errors.`);
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
