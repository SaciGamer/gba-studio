import assert from 'node:assert/strict';
import fs from 'node:fs';

const rightPanel = fs.readFileSync('src/renderer/frontend/src/components/RightPanel.tsx', 'utf8');
const eventPanel = fs.readFileSync('src/renderer/frontend/src/components/events/CollapseEventManager.tsx', 'utf8');
const spriteEditor = fs.readFileSync('src/renderer/frontend/src/components/SpriteEditor.tsx', 'utf8');
const assetLibrary = fs.readFileSync('src/renderer/frontend/src/components/resourceEditors/AssetLibraryEditor.tsx', 'utf8');

assert.match(rightPanel, /<ResourceNameInput[^>]*label="Variable name"/);
assert.match(rightPanel, /<ResourceNameInput[^>]*onChange=\{name => updateScript/);
assert.match(rightPanel, /<ResourceNameInput[^>]*onChange=\{handleSceneNameChange/);
assert.match(eventPanel, /<Input[^>]*size="small" variant="borderless"/);
assert.match(spriteEditor, /aria-label=\{t\('sprites.tileName'\)\}/);
assert.match(spriteEditor, /aria-label=\{t\('sprites.stateName'\)\}/);
assert.match(spriteEditor, /onFocus=\{\(\) => setIsSpriteNameEditing\(true\)\}/);
assert.match(spriteEditor, /onFocus=\{\(\) => setIsStateNameEditing\(true\)\}/);
assert.match(spriteEditor, /commitStateName/);
assert.match(assetLibrary, /onFocus=\{\(\) => setIsPaletteNameEditing\(true\)\}/);
assert.match(assetLibrary, /aria-label=\{t\('resources.paletteName'\)\}/);
assert.match(assetLibrary, /commitPaletteName/);

console.log('Editor name input contract passed.');
