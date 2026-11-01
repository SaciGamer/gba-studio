import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-combat-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const resource = builder.processResourceObject({
    _resourceType: 'settings', id: 'settings', startSceneId: '', startX: 0, startY: 0,
    startMoveSpeed: 1, startAnimSpeed: 4, startDirection: 'right', colorMode: 'mono',
    combatConfig: { maxProjectiles: 12, maxEnemies: 7, maxPickups: 3, playerHitPoints: 5, defaultDamage: 2,
      collisionRules: [{ sourceGroup: 'player_projectile', targetGroup: 'enemy' }] },
  });
  const header = resource.headerContent.toString('utf8');
  assert.match(header, /static const CombatConfig SETTINGS_SETTINGS_COMBATCONFIG_COMBAT_CONFIG/);
  assert.match(header, /CombatCollisionRule SETTINGS_SETTINGS_COMBATCONFIG_COLLISION_RULES/);
  await builder.generateResourceRegistryClass([resource], { projectName: 'combat', authorName: 'test', version: '1.0.0' });
  const registry = fs.readFileSync(path.join(temp, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /&SETTINGS_SETTINGS_COMBATCONFIG_COMBAT_CONFIG/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'settings', id: 'bad', combatConfig: { maxEnemies: 65 } }), /combatConfig\.maxEnemies/);
  console.log('Combat config build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
