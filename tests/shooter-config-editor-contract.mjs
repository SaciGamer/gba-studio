import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const panel = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/RightPanelGWSettings.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/providers/contexts/interfaces/ISettingElement.tsx'), 'utf8');
assert.match(panel, /ShooterConfigEditor/);
assert.match(panel, /Shooter projectile sprite/);
assert.match(panel, /Shooter boss HP/);
assert.match(panel, /Default shooter wave/);
assert.match(panel, /Shooter player HP/);
assert.match(settings, /shooterConfig\?:/);
console.log('Shooter config editor contract passed.');
