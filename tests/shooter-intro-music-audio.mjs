import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'templateEngineGame/shooter_game');
const temporaryProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-shooter-intro-audio-'));

try {
  for (const directory of [
    'project/scenes/intro', 'project/backgrounds/butano_background', 'project/sprites/hero_bullets',
    'assets/musics', 'assets/backgrounds', 'assets/sprites',
  ]) fs.mkdirSync(path.join(temporaryProject, directory), { recursive: true });
  for (const relativePath of [
    'shooter_game.gbaproj', 'project/settings.gbasres', 'project/scenes/intro/scene.gbasres',
    'project/backgrounds/butano_background/background.gbasres', 'project/sprites/hero_bullets/sprite.gbasres',
    'assets/musics/battle_clean.it', 'assets/backgrounds/butano_background.bmp', 'assets/sprites/hero_bullets.bmp',
  ]) {
    const destination = path.join(temporaryProject, relativePath);
    fs.copyFileSync(path.join(source, relativePath), destination);
  }

  const settingsPath = path.join(temporaryProject, 'project/settings.gbasres');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.playerSpriteId = '';
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const scenePath = path.join(temporaryProject, 'project/scenes/intro/scene.gbasres');
  const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  const musicEvent = scene.script.find(event => event.command === 'EVENT_PLAY_MUSIC');
  assert.equal(musicEvent?.args?.musicId, 'battle_clean', 'Shooter Intro must use the real battle_clean.it track');
  assert.equal(musicEvent?.args?.volume, 60, 'Preserve the volume configured by the real Intro scene');
  // Retain the actual Intro scene and Play Music event, while removing the later
  // transition so there is enough time to measure sustained Maxmod output.
  scene.script = scene.script.filter(event => !['EVENT_WAIT', 'EVENT_CHANGE_SCENE'].includes(event.command));
  fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2) + '\n');

  const result = spawnSync('rtk', [
    'node', 'tools/verification/verify-runtime-project.mjs', temporaryProject, '--full', '--build', '--emulate', '--music-audio',
  ], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Shooter Intro must compile and emit Maxmod PCM in EmulatorJS');
} finally {
  const resolved = path.resolve(temporaryProject);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(resolved).startsWith('gba-shooter-intro-audio-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
