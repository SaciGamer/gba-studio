import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { transcodeProject } = await import(pathToFileURL(path.join(root, 'dist/main/utils/projectTranscoder/transcode-project.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-transcode-boundary-'));
const project = path.join(temp, 'project');
const output = path.join(temp, 'output');
const originalWrite = fs.writeFileSync;
const headerWrites = new Map();
try {
  fs.mkdirSync(path.join(project, 'project'), { recursive: true });
  fs.mkdirSync(path.join(project, 'assets', 'backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(project, 'assets', 'musics'), { recursive: true });
  execFileSync(path.join(root, 'bin', 'image-magick', 'magick.exe'), ['-size', '16x16', 'gradient:#284060-#80a040', `BMP3:${path.join(project, 'assets', 'backgrounds', 'background.bmp')}`], { windowsHide: true });
  fs.copyFileSync(path.join(root, 'templateEngineGame', 'sample_project_example', 'assets', 'musics', 'cyberrid.mod'), path.join(project, 'assets', 'musics', 'cyberrid.mod'));
  const fixtures = {
    'settings.gbasres': { _resourceType: 'settings', startSceneId: 'scene', startX: 0, startY: 0, startMoveSpeed: 1, startAnimSpeed: 4, startDirection: 'down', colorMode: 'mono', fadeDirection: 1 },
    'scene.gbasres': { _resourceType: 'scene', id: 'scene', name: 'scene', width: 240, height: 160, sceneType: 'Logo', backgrounds: [{ layerId: 0, backgroundId: 'background-id' }], script: [
      { id: 'play-music', version: 1, command: 'EVENT_PLAY_MUSIC', args: { musicId: 'cyberrid', volume: 80 } },
      { id: 'generated-sfx', version: 1, command: 'EVENT_PLAY_SOUND', args: { soundId: 'generated', soundSource: 'generated', effect: 'laser', pitch: 69, durationFrames: 18, volume: 75, speed: 100, panning: 0, priority: 0, group: 'test' } },
    ] },
    'background.gbasres': { _resourceType: 'background', id: 'background-id', name: 'Background', filename: 'background.bmp', imageWidth: 16, imageHeight: 16 },
    'prefabs.gbasres': { _resourceType: 'prefabs', id: 'prefabs', folders: [], prefabs: [] },
  };
  for (const [name, content] of Object.entries(fixtures)) fs.writeFileSync(path.join(project, 'project', name), JSON.stringify(content, null, 2));
  const before = fs.readdirSync(path.join(project, 'project')).map(name => [name, fs.readFileSync(path.join(project, 'project', name), 'utf8')]);
  fs.writeFileSync = (filename, ...args) => {
    if (typeof filename === 'string' && filename.endsWith('_res.h')) headerWrites.set(filename, (headerWrites.get(filename) ?? 0) + 1);
    return originalWrite(filename, ...args);
  };
  const result = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });
  assert.equal(result.success, true, result.message);
  assert.equal(headerWrites.size, 3, 'Editor-only prefab definitions must not be emitted as runtime resources');
  assert.ok([...headerWrites.values()].every(count => count === 1), 'Each final game header must be emitted only once');
  assert.equal(fs.existsSync(path.join(project, 'assets', 'ui')), false, 'Missing UI defaults must stay outside the saved project');
  for (const [name, content] of before) assert.equal(fs.readFileSync(path.join(project, 'project', name), 'utf8'), content);
  for (const source of result.sourceFiles) assert.ok(fs.existsSync(source));
  assert.ok(result.sourceFiles.every(source => source.endsWith('.cpp')));
  for (const name of ['cursor.bmp', 'frame.bmp', 'dialogue_frame_sprite.bmp', 'menu_frame_side_1_sprite.bmp', 'menu_frame_side_2_sprite.bmp']) assert.ok(fs.existsSync(path.join(output, 'graphics', name)), `Missing prepared default ${name}`);
  const magick = path.join(root, 'bin', 'image-magick', 'magick.exe');
  for (const [name, dimensions] of [['menu_frame_side_1_sprite.bmp', '64x192'], ['menu_frame_side_2_sprite.bmp', '128x192']]) {
    const actual = execFileSync(magick, ['identify', '-format', '%wx%h', path.join(output, 'graphics', name)], { encoding: 'utf8', windowsHide: true });
    assert.equal(actual, dimensions, `${name} must preserve the requested menu proportions as frame tiles`);
  }
  const graphicsHeader = fs.readFileSync(path.join(output, 'include', 'graphics_items.h'), 'utf8');
  const graphicsManager = fs.readFileSync(path.join(output, 'src', 'graphics_manager.cpp'), 'utf8');
  for (const extension of ['bmp', 'json']) assert.equal(fs.existsSync(path.join(output, 'graphics', `menu_frame_fullscreen_sprite.${extension}`)), false);
  assert.doesNotMatch(graphicsHeader + graphicsManager, /menu_frame_fullscreen_sprite/);
  for (const name of ['menu_frame_side_1_sprite', 'menu_frame_side_2_sprite']) {
    assert.ok(graphicsHeader.includes(`bn_sprite_items_${name}.h`), `${name} must be included in the ROM graphics registry`);
    assert.ok(graphicsManager.includes(`bn::sprite_items::${name}`), `${name} must resolve from the runtime sprite loader`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'runtime-feature-manifest.json'), 'utf8'));
  assert.equal(manifest.selectionApplied, true);
  assert.equal(manifest.selectionPhase, 'complete');
  assert.deepEqual(manifest.eventCodes, ['EVENT_PLAY_MUSIC', 'EVENT_PLAY_SOUND']);
  assert.equal(fs.existsSync(path.join(output, 'src/rumble_manager.cpp')), false);
  assert.equal(fs.existsSync(path.join(output, 'src/save_manager.cpp')), false);
  assert.equal(fs.existsSync(path.join(output, 'src/hbe_manager.cpp')), false);
  assert.ok(fs.existsSync(path.join(output, 'build/bn_music_items.h')), 'Music resources must generate their registry header');
  assert.ok(fs.existsSync(path.join(output, 'build/bn_sound_items.h')), 'Generated Play Sound effects must be converted by Maxmod');
  const registry = fs.readFileSync(path.join(output, 'include/audio_registry.h'), 'utf8');
  const soundItems = fs.readFileSync(path.join(output, 'build/bn_sound_items.h'), 'utf8');
  const generatedId = registry.match(/gba_event_sfx_[a-f0-9]{16}/)?.[0];
  assert.ok(generatedId, 'Generated effects must be registered in the runtime sound resolver');
  assert.ok(soundItems.includes(generatedId), 'Maxmod must emit the same sound item referenced by the event');
  const generatedWavPath = path.join(output, 'audio', `${generatedId}.wav`);
  assert.ok(fs.existsSync(generatedWavPath), 'Transcode must materialize the event SFX as a WAV in the build audio directory');
  const generatedWav = fs.readFileSync(generatedWavPath);
  assert.equal(generatedWav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(generatedWav.toString('ascii', 8, 12), 'WAVE');
  assert.ok(generatedWav.length > 44 && generatedWav.subarray(44).some(byte => byte !== 0), 'The build WAV must contain generated PCM, not only a placeholder header');
  const rerun = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });
  assert.equal(rerun.success, true, `A second Play must reuse cached backgrounds: ${rerun.message}`);
  assert.ok(fs.existsSync(path.join(output, 'build/bn_music_items.h')), 'A repeated Play must recreate the registry after cleaning its incremental audio index');
  // A project with only editor preferences still needs a valid empty registry,
  // rather than the template's unexpanded C++ placeholders.
  const emptyProject = path.join(temp, 'empty-project');
  fs.mkdirSync(path.join(emptyProject, 'project'), { recursive: true });
  fs.writeFileSync(path.join(emptyProject, 'project/user_settings.gbasres'), JSON.stringify({ _resourceType: 'user_settings', zoom: 3 }));
  const emptyOutput = path.join(temp, 'empty-output');
  const empty = await transcodeProject({ projectDir: emptyProject, outputDir: emptyOutput, includeAssets: false });
  assert.equal(empty.success, true, empty.message);
  assert.ok(fs.existsSync(path.join(emptyOutput, 'include/resources.h')));
  assert.doesNotMatch(fs.readFileSync(path.join(emptyOutput, 'src/resource_registry.cpp'), 'utf8'), /\{\{/);
  const missingProject = path.join(temp, 'missing-asset-project');
  fs.mkdirSync(path.join(missingProject, 'project'), { recursive: true });
  fs.writeFileSync(path.join(missingProject, 'project/background.gbasres'), JSON.stringify({ _resourceType: 'background', id: 'absent', filename: 'absent.bmp', imageWidth: 256, imageHeight: 256 }));
  fs.writeFileSync(path.join(missingProject, 'project/scene.gbasres'), JSON.stringify({ _resourceType: 'scene', id: 'missing-scene', width: 256, height: 256, backgrounds: [{ layerId: 0, backgroundId: 'absent' }] }));
  const missing = await transcodeProject({ projectDir: missingProject, outputDir: path.join(temp, 'missing-asset-output') });
  assert.equal(missing.success, false, 'A declared background without a materialized image must fail before export');
  assert.match(missing.message, /background absent.*materialized graphic.*absent\.bmp/);
  assert.equal(fs.existsSync(path.join(temp, 'missing-asset-output/include/background_absent_res.h')), false,
    'The missing asset must be rejected before final resource headers are written');
  const staleGraphics = path.join(temp, 'missing-asset-output/graphics');
  fs.copyFileSync(path.join(output, 'graphics/cursor.bmp'), path.join(staleGraphics, 'absent.bmp'));
  fs.writeFileSync(path.join(staleGraphics, 'absent.json'), JSON.stringify({ type: 'regular_bg' }));
  const stale = await transcodeProject({ projectDir: missingProject, outputDir: path.join(temp, 'missing-asset-output') });
  assert.equal(stale.success, false, 'Stale output files must not substitute for preparation from current inputs');
  assert.match(stale.message, /background absent.*materialized graphic/);
  console.log('Real transcode pipeline passed: prepared defaults, Butano asset generation, one final header per resource and unchanged saved project.');
} finally {
  fs.writeFileSync = originalWrite;
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-transcode-boundary-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
