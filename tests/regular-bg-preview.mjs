import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `import { drawSceneBackground } from './src/renderer/frontend/src/utils/drawSceneBackground'; window.drawSceneBackground = drawSceneBackground;`, loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(() => {
    const image = document.createElement('canvas'); image.width = image.height = 8;
    const imageContext = image.getContext('2d'); imageContext.fillStyle = '#ff0000'; imageContext.fillRect(0, 0, 8, 8);
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 16;
    const context = canvas.getContext('2d');
    const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
    const draw = (x, y, repeat, highlight) => { context.clearRect(0, 0, 24, 16); window.drawSceneBackground(context, image, x, y, 24, 16, repeat, highlight); };
    draw(0, 0, true, false); const repeated = pixel(23, 15);
    draw(8, 0, true, true); const original = pixel(9, 1), replica = pixel(1, 1);
    draw(-4, -4, true, true); const negativeOriginal = pixel(1, 1), negativeReplica = pixel(5, 1);
    draw(0, 0, false, false); const bitmapOutside = pixel(9, 1);
    return { repeated, original, replica, negativeOriginal, negativeReplica, bitmapOutside, filter: context.filter };
  });
  assert.deepEqual(results.repeated, [255, 0, 0, 255]);
  assert.deepEqual(results.original, [255, 0, 0, 255]);
  assert.deepEqual(results.negativeOriginal, [255, 0, 0, 255]);
  for (const pixel of [results.replica, results.negativeReplica]) { assert.equal(pixel[0], pixel[1]); assert.equal(pixel[1], pixel[2]); assert.equal(pixel[3], 255); }
  assert.deepEqual(results.bitmapOutside, [0, 0, 0, 0]);
  assert.equal(results.filter, 'none');
  console.log('Regular BG preview: scene coverage, grayscale replicas, positive/negative positions and bitmap exclusion passed.');
} finally { await browser.close(); }
