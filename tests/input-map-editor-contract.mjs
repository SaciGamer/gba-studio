import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/renderer/frontend/src/components/RightPanelGWSettings.tsx', 'utf8');
const ifEvent = fs.readFileSync('src/renderer/frontend/src/components/events/IfEvent.tsx', 'utf8');
assert.match(source, /New logical input action/);
assert.match(source, /Add logical input action/);
assert.match(source, /Remove logical input action/);
assert.match(source, /Object\.keys\(inputMap\)\.length >= 32/);
assert.match(source, /\^\[A-Za-z\]\[A-Za-z0-9_\]\{0,31\}\$/);
assert.match(source, /delete nextMap\[action\]/);
assert.match(source, /CombatConfigEditor/);
assert.match(source, /maxProjectiles/);
assert.match(source, /Player HP/);
assert.match(ifEvent, /Object\.keys\(settings\?\.inputMap \?\? \{\}\)/);
assert.match(ifEvent, /Action: \$\{action\}/);
assert.match(ifEvent, /buttonOptions/);
console.log('Input map editor contract passed.');
