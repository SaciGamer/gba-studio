import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-shooter-config-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({
    _resourceType: 'settings', id: 'settings', startSceneId: 'stage_01',
    startX: 0, startY: 0, startMoveSpeed: 1, startAnimSpeed: 4,
    startDirection: 'right', colorMode: 'mono',
    shooterConfig: { defaultWaveId: 'wave_01', projectileSpriteId: 'bullet', playerHitPoints: 5, defaultDamage: 2, bossHitPoints: 99 },
  });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /ShooterConfig SETTINGS_SETTINGS_SHOOTERCONFIG_SHOOTER_CONFIG/);
  assert.match(header, /"bullet"/);
  assert.match(header, /99/);
  await builder.generateResourceRegistryClass([result], { projectName: 'shooter_config' });
  const registry = fs.readFileSync(path.join(temp, 'src', 'resource_registry.cpp'), 'utf8');
  assert.match(registry, /SHOOTERCONFIG_SHOOTER_CONFIG/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'settings', id: 'bad', shooterConfig: { playerHitPoints: 256 } }), /shooterConfig\.playerHitPoints/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'settings', id: 'bad', shooterConfig: { projectileSpriteId: 'x'.repeat(64) } }), /shooterConfig\.projectileSpriteId/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'settings', id: 'bad', shooterConfig: { bossHitPoints: 65536 } }), /shooterConfig\.bossHitPoints/);
  console.log('Shooter config build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
