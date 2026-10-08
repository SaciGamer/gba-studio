import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'src/renderer/frontend/src/components/RightPanelGWSettings.tsx',
  'src/renderer/frontend/src/components/events/LayerEvent.tsx',
  'src/renderer/frontend/src/components/events/SceneEvent.tsx',
];

for (const filename of files) {
  const source = fs.readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /<Space\.Addon>\s*[XYWH]\s*<\/Space\.Addon>/,
    `${filename} must use the shared numeric addon instead of a local axis addon`);
}

const settings = fs.readFileSync(files[0], 'utf8');
assert.match(settings, /<InputNumber addonBefore="X"/);
assert.match(settings, /<InputNumber addonBefore="Y"/);
const numericWrapper = fs.readFileSync('src/renderer/frontend/src/components/StepInputNumber.tsx', 'utf8');
assert.match(numericWrapper, /requestedStep > 0/);
assert.match(numericWrapper, /step=\{ctrlPressed \? normalStep \* 8 : normalStep\}/);
const rightPanel = fs.readFileSync('src/renderer/frontend/src/components/RightPanel.tsx', 'utf8');
assert.match(rightPanel, /addonBefore="W"[\s\S]*handleMapSizeChange\('width'/);
assert.match(rightPanel, /addonBefore="H"[\s\S]*handleMapSizeChange\('height'/);
console.log('Numeric axis addon contract passed.');
