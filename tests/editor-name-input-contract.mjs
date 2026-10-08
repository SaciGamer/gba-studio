import assert from 'node:assert/strict';
import fs from 'node:fs';

const rightPanel = fs.readFileSync('src/renderer/frontend/src/components/RightPanel.tsx', 'utf8');
const eventPanel = fs.readFileSync('src/renderer/frontend/src/components/events/CollapseEventManager.tsx', 'utf8');
const spriteEditor = fs.readFileSync('src/renderer/frontend/src/components/SpriteEditor.tsx', 'utf8');
const assetLibrary = fs.readFileSync('src/renderer/frontend/src/components/resourceEditors/AssetLibraryEditor.tsx', 'utf8');

assert.match(rightPanel, /variant="borderless"[\s\S]*aria-label="Variable name"/);
assert.match(rightPanel, /isEditingName \? <Input autoFocus variant="borderless"/);
assert.match(rightPanel, /isEditingTitle \? \([\s\S]*variant="borderless"/);
assert.match(eventPanel, /<Input size="small" variant="borderless"/);
assert.match(spriteEditor, /variant="borderless"[\s\S]*placeholder=\{selectedSprite\.name\.replace/);
assert.match(spriteEditor, /variant="borderless"[\s\S]*placeholder=\{defaultStateName\}/);
assert.match(spriteEditor, /isSpriteNameEditing \? <Input/);
assert.match(spriteEditor, /isStateNameEditing \? <Input/);
assert.match(spriteEditor, /commitStateName/);
assert.match(assetLibrary, /isPaletteNameEditing \? <Input/);
assert.match(assetLibrary, /variant="borderless"[\s\S]*placeholder=\{defaultPaletteName\}/);
assert.match(assetLibrary, /commitPaletteName/);

console.log('Editor name input contract passed.');
