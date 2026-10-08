import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-shooter-events-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const result = builder.processResourceObject({ _resourceType: 'scene', id: 'shooter', name: 'shooter', backgrounds: [], script: [
    { id: 'start', command: 'EVENT_SHOOTER_START', args: { waveId: 'wave_01' } },
    { id: 'spawn-wave', command: 'EVENT_SHOOTER_SPAWN_WAVE', args: { waveId: 'wave_02' } },
    { id: 'load-stage', command: 'EVENT_SHOOTER_LOAD_STAGE', args: { waveId: 'wave_03', musicId: 'stage_music', musicVolume: 80, backgroundId: 'stage_bg', backgroundLayer: 1 } },
    { id: 'background-mode', command: 'EVENT_SHOOTER_SET_BACKGROUND_MODE', args: { layerId: 2, visible: false, scrollX: 12, scrollY: -8, parallaxX: 75, parallaxY: 125 } },
    { id: 'ui-score', command: 'EVENT_UI_SET_TEXT', args: { text: 'SCORE 0010', x: -96, y: -72, font: 'fixed8x8' } },
    { id: 'ui-value', command: 'EVENT_UI_SET_VALUE', args: { label: 'HP', value: 3, x: -112, y: -60, font: 'fixed8x8' } },
    { id: 'ui-animate', command: 'EVENT_UI_ANIMATE', args: { uiId: 'ui-score', animation: 'move', x: 80, y: 60, speed: 2 } },
    { id: 'sprite-effect', command: 'EVENT_SPRITE_EFFECT', args: { actorId: 'player', rotation: 15, scale: 125, visible: true, fadeColor: 'white', fadeIntensity: 40, durationFrames: 30 } },
    { id: 'pause', command: 'EVENT_SHOOTER_PAUSE', args: { paused: true } },
    { id: 'player-disabled', command: 'EVENT_SHOOTER_SET_PLAYER_ENABLED', args: { enabled: false } },
    { id: 'stop', command: 'EVENT_SHOOTER_STOP', args: {} },
    { id: 'clear', command: 'EVENT_SHOOTER_CLEAR_ENEMIES', args: {} },
    { id: 'boss', command: 'EVENT_SHOOTER_SPAWN_BOSS', args: { archetypeId: 'boss_sprite', x: 120, y: 32, dropId: 'powerup' } },
    { id: 'boss-phase', command: 'EVENT_SHOOTER_SET_BOSS_PHASE', args: { phase: 2 } },
    { id: 'wait-signal', command: 'EVENT_SHOOTER_WAIT_SIGNAL', args: { signal: 'wave_cleared', timeoutFrames: 30 } },
    { id: 'grant', command: 'EVENT_SHOOTER_GRANT', args: { grant: 'score', value: 100 } },
    { id: 'set-stat', command: 'EVENT_SHOOTER_SET_STAT', args: { stat: 'score', value: 700 } },
    { id: 'add-stat', command: 'EVENT_SHOOTER_ADD_STAT', args: { stat: 'bombs', value: 2 } },
  ] });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /ShooterStartEventData/);
  assert.match(header, /ShooterLoadStageEventData/);
  assert.match(header, /stage_music/);
  assert.match(header, /stage_bg/);
  assert.match(header, /ShooterBackgroundModeEventData/);
  assert.match(header, /background-mode/);
  assert.match(header, /UiSetTextEventData/);
  assert.match(header, /SCORE 0010/);
  assert.match(header, /UiSetValueEventData/);
  assert.match(header, /HP/);
  assert.match(header, /UiAnimateEventData/);
  assert.match(header, /SpriteEffectEventData/);
  assert.match(header, /"white", 40, 30/);
  assert.match(header, /EVENT_SHOOTER_SPAWN_WAVE/);
  assert.match(header, /EVENT_SHOOTER_CLEAR_ENEMIES/);
  assert.match(header, /ShooterBossSpawnEventData/);
  assert.match(header, /ShooterBossPhaseEventData/);
  assert.match(header, /ShooterWaitSignalEventData/);
  assert.match(header, /ShooterGrantEventData/);
  assert.match(header, /ShooterStatEventData/);
  assert.match(header, /wave_01/);
  assert.match(header, /ShooterPauseEventData/);
  assert.match(header, /true/);
  assert.match(header, /ShooterPlayerEnabledEventData/);
  assert.match(header, /false/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad', backgrounds: [], script: [{ id: 'bad', command: 'EVENT_SHOOTER_PAUSE', args: {} }] }), /paused is required/);
  console.log('Shooter events build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
