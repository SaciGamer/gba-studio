import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { transcodeProject, cancelActiveAssetGeneration } = await import(pathToFileURL(path.join(root, 'dist/main/utils/projectTranscoder/transcode-project.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-asset-cancel-'));
const project = path.join(temp, 'project');
const output = path.join(temp, 'output');
let cancellation;
try {
  fs.mkdirSync(path.join(project, 'project'), { recursive: true });
  const source = JSON.stringify({ _resourceType: 'user_settings', zoom: 2 });
  const sourceFile = path.join(project, 'project/user_settings.gbasres');
  fs.writeFileSync(sourceFile, source);
  assert.equal(await cancelActiveAssetGeneration(), false);
  const result = await transcodeProject({ projectDir: project, outputDir: output, includeAssets: false,
    onProgress: (message, key) => {
      // Python stdout confirms a real owned process is running, not merely a
      // phase notification sent before spawn. Cancel its own process tree.
      if (!key && message.includes('gba_startup.wav') && !cancellation) cancellation = cancelActiveAssetGeneration();
    },
  });
  assert.ok(cancellation, 'Expected live asset process output before cancellation');
  assert.equal(await cancellation, true);
  assert.equal(result.success, false);
  assert.match(result.message, /asset generation cancelled/);
  assert.equal(await cancelActiveAssetGeneration(), false, 'Cancelled process handle must be released');
  assert.equal(fs.readFileSync(sourceFile, 'utf8'), source);
  const retry = await transcodeProject({ projectDir: project, outputDir: output, includeAssets: false });
  assert.equal(retry.success, true, retry.message);
  assert.equal(await cancelActiveAssetGeneration(), false);
  assert.equal(fs.readFileSync(sourceFile, 'utf8'), source);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'runtime-feature-manifest.json'), 'utf8'));
  assert.equal(manifest.selectionPhase, 'complete');
  console.log('Real asset cancellation passed: owned Python tree stopped, failure reported, handle released, same-directory retry passed and saved data unchanged.');
} finally {
  await cancelActiveAssetGeneration();
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-asset-cancel-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
