import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-music-events-'));
try {
  fs.mkdirSync(path.join(temp, 'include'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const trackerProjectId = 'c42d6a9c-87a5-4c13-976a-6b3fd11fb39b';
  const hbeSource = fs.readFileSync(path.join(root, 'tools/butano/template/src/hbe_manager.cpp'), 'utf8');
  const result = builder.processResourceObject({ _resourceType: 'scene', id: 'music', name: 'music', backgrounds: [], script: [
    { id: 'tracker-project-music', command: 'EVENT_PLAY_MUSIC', args: { musicId: trackerProjectId, volume: 100 } },
    { id: 'sound', command: 'EVENT_PLAY_SOUND', args: { soundId: 'laser', volume: 75, speed: 125, panning: -40, priority: 12, group: 'ui' } },
    { id: 'rumble', command: 'EVENT_RUMBLE', args: { durationFrames: 12, intensity: 70 } },
    { id: 'legacy-sound', command: 'EVENT_PLAY_SOUND', args: { soundId: 'legacy' } },
    { id: 'jingle', command: 'EVENT_MUSIC_PLAY_JINGLE', args: { musicId: 'coin', volume: 80 } },
    { id: 'resume', command: 'EVENT_MUSIC_RESUME', args: {} },
    { id: 'pause', command: 'EVENT_MUSIC_PAUSE', args: {} },
    { id: 'fade', command: 'EVENT_MUSIC_FADE', args: { targetVolume: 25, durationFrames: 40 } },
    { id: 'hbe-enable', command: 'EVENT_HBE_EFFECT_ENABLE', args: { preset: 'palette_wave', intensity: 8, layerId: 1 } },
    { id: 'hbe-disable', command: 'EVENT_HBE_EFFECT_DISABLE', args: {} },
    { id: 'blend-alpha', command: 'EVENT_BLEND_ALPHA', args: { alpha: 50 } },
    { id: 'stop-sound', command: 'EVENT_SOUND_STOP', args: {} },
    { id: 'stop-sound-group', command: 'EVENT_SOUND_STOP', args: { group: 'ui' } },
    { id: 'stop-music-alias', command: 'EVENT_MUSIC_STOP', args: {} },
    { id: 'dialogue-show-alias', command: 'EVENT_DIALOGUE_SHOW', args: { text: 'Ready' } },
    { id: 'menu-open', command: 'EVENT_MENU_OPEN', args: { prompt: 'Title', optionA: 'Play', optionB: 'Exit', resultVariable: 'menu_result' } },
    { id: 'text-scroll', command: 'EVENT_TEXT_SCROLL', args: { text: 'Scrolling' } },
    { id: 'save-write', command: 'EVENT_SAVE_WRITE', args: { slot: 1, variableIds: ['score', 'rumble'], schema: 7 } },
    { id: 'save-load', command: 'EVENT_SAVE_LOAD', args: { slot: 1, variableIds: ['score', 'rumble'], schema: 7 } },
    { id: 'dialogue-close-alias', command: 'EVENT_DIALOGUE_CLOSE', args: {} },
  ] });
  const header = result.headerContent.toString('utf8');
  assert.match(header, /PlaySoundEventData/);
  assert.match(header, /RumbleEventData/);
  assert.match(header, /12, 70/);
  assert.match(header, /\"laser\", 75, 125, -40, 12, \"ui\"/);
  assert.match(header, /\"legacy\", 100, 100, 0, 0/);
  assert.match(header, /PlayJingleEventData/);
  assert.ok(header.includes(`"${trackerProjectId}", 100`), 'Music events preserve the .gbatracker UUID used to materialize the Butano module');
  assert.match(header, /\"coin\", 80/);
  assert.match(header, /MusicFadeEventData/);
  assert.match(header, /25, 40/);
assert.match(header, /HbeEffectEventData/);
assert.match(header, /palette_wave/);
assert.match(header, /BlendAlphaEventData/);
assert.match(header, /"palette_wave", 8, 1, true/);
assert.match(hbeSource, /palette_effect\.reset\(\);/);
assert.match(hbeSource, /bn::green_swap::set_enabled\(false\);/);
  assert.match(header, /EVENT_MUSIC_STOP/);
  assert.match(header, /EVENT_DIALOGUE_SHOW/);
  assert.match(header, /EVENT_MENU_OPEN/);
  assert.match(header, /EVENT_TEXT_SCROLL/);
  assert.match(header, /GameDataEventData/);
  assert.match(header, /GameSavePoint/);
  assert.match(header, /EVENT_DIALOGUE_CLOSE/);
  assert.throws(() => builder.processResourceObject({ _resourceType: 'scene', id: 'bad', backgrounds: [], script: [{ id: 'bad', command: 'EVENT_MUSIC_FADE', args: { targetVolume: 101, durationFrames: 4 } }] }), /above 100/);
  console.log('Music events build contract passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
