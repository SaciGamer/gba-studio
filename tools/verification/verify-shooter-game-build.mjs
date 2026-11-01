import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const projectDir = path.join(root, 'templateEngineGame', 'shooter_game');
assert.equal(fs.existsSync(path.join(projectDir, 'reference_assets')), false, 'Reference assets must remain outside the project package');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-shooter-build-'));
const { transcodeProject } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'projectTranscoder', 'transcode-project.js')).href);

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const fullPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(fullPath) : [fullPath];
});
const projectAssets = walk(path.join(projectDir, 'assets'));
assert.ok(projectAssets.filter(file => /[\\/]musics[\\/].+\.(mod|xm|s3m|it)$/i.test(file)).length >= 4, 'Shooter package must contain original tracker music in assets/musics');
assert.ok(projectAssets.filter(file => /[\\/]sounds[\\/].+\.wav$/i.test(file)).length >= 40, 'Shooter package must contain original sound effects in assets/sounds');
const resourceFiles = walk(path.join(projectDir, 'project')).filter(file => file.endsWith('.gbasres'));
const readResource = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sceneResources = resourceFiles.filter(file => {
  try { return readResource(file)._resourceType === 'scene'; } catch { return false; }
});
assert.ok(sceneResources.length >= 2, 'Shooter package must contain multiple authored scenes');
assert.ok(sceneResources.length >= 4, 'Shooter reconstruction must contain the four original stage scenes');
const scenes = sceneResources.map(file => readResource(file));
assert.ok(scenes.some(scene => scene.name === 'Intro'), 'Shooter package must contain an intro scene');
assert.ok(scenes.some(scene => scene.name === 'Title'), 'Shooter package must contain a title scene');
for (const scene of scenes) {
  assert.equal(scene.width, 256, `Scene ${scene.name} must use the GBA width limit`);
  assert.equal(scene.height, 256, `Scene ${scene.name} must use the GBA height limit`);
  assert.deepEqual(scene.editorPosition, { x: scene.x, y: scene.y }, `Scene ${scene.name} must define its editor position`);
  assert.equal(scene.renderMode, 'regular_tilemap', `Scene ${scene.name} must use the regular tilemap editor mode`);
  assert.equal(scene.gridSize, 8, `Scene ${scene.name} must use the 8px editor grid`);
  assert.ok(Array.isArray(scene.backgrounds), `Scene ${scene.name} must define background layers`);
  assert.ok(Array.isArray(scene.actors), `Scene ${scene.name} must define actors as an array`);
  for (const actor of scene.actors ?? []) {
    assert.ok(actor.x >= 0 && actor.x < scene.width && actor.y >= 0 && actor.y < scene.height, `Actor ${actor.id} is outside scene bounds`);
    assert.ok(typeof actor.spriteId === 'string' && actor.spriteId.length > 0, `Actor ${actor.id} must reference a sprite`);
  }
  for (const timeline of scene.spawnerTimelines ?? []) for (const entry of timeline.entries ?? []) {
    assert.ok(entry.x >= 0 && entry.x < scene.width && entry.y >= 0 && entry.y < scene.height, `Spawner entry in ${scene.name} is outside scene bounds`);
  }
}
const spriteResources = resourceFiles.filter(file => {
  try { return readResource(file)._resourceType === 'sprite'; } catch { return false; }
}).map(readResource);
assert.ok(spriteResources.length > 0, 'Shooter package must contain sprite resources');
for (const sprite of spriteResources) {
  assert.ok(Array.isArray(sprite.playerAnimationStates) && sprite.playerAnimationStates.length > 0, `Sprite ${sprite.name} must define editor animation states`);
  assert.ok(sprite.playerAnimationStates.some(state => state.animations?.some(animation => animation.canvasFrames?.length)), `Sprite ${sprite.name} must define at least one canvas preview frame`);
}
const eventIds = new Set();
const collectEventIds = (events = []) => events.forEach(event => {
  assert.match(String(event.id ?? ''), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i, `Event ${event.command} must have a generated UUID`);
  assert.equal(eventIds.has(event.id), false, `Event id ${event.id} must be unique`);
  eventIds.add(event.id);
  collectEventIds(event.children?.then);
  collectEventIds(event.children?.else);
});
scenes.forEach(scene => collectEventIds(scene.script));
const settingsFile = resourceFiles.find(file => path.basename(file) === 'settings.gbasres');
assert.ok(settingsFile, 'Shooter package must contain settings.gbasres');
const settings = readResource(settingsFile);
assert.ok(scenes.some(scene => scene.id === settings.startSceneId), 'Shooter startSceneId must resolve to an authored scene');
assert.equal(scenes.find(scene => scene.id === settings.startSceneId)?.name, 'Intro', 'Shooter must start through the intro scene');
assert.ok(scenes.some(scene => Array.isArray(scene.spawnerTimelines) && scene.spawnerTimelines.length > 0), 'Shooter package must contain a spawner timeline');

try {
  const result = await transcodeProject({
    projectDir,
    outputDir,
    projectName: 'shooter_game',
    includeAssets: true,
  });
  assert.equal(result.success, true, result.message);
  // The package contains real regular-background assets. Keep the tile
  // animation validation tied to the headers emitted by Butano's converter,
  // rather than only synthetic fixtures. The converter may reduce a source
  // title with <=16 colors to 4 bpp, so assert the emitted metadata instead
  // of assuming the intermediate BMP depth.
  const readGraphicsHeader = name => fs.readFileSync(path.join(outputDir, 'build', name), 'utf8');
  const backgroundHeader = readGraphicsHeader('bn_regular_bg_items_stage_1.h');
  const titleHeader = readGraphicsHeader('bn_regular_bg_items_stage_2.h');
  assert.match(backgroundHeader, /regular_bg_tiles_item\([\s\S]*bpp_mode::BPP_[48]/);
  assert.match(backgroundHeader, /regular_bg_map_item\([\s\S]*size\((32|64), (32|64)\)/);
  assert.match(titleHeader, /regular_bg_tiles_item\([\s\S]*bpp_mode::BPP_[48]/);
  assert.match(titleHeader, /regular_bg_map_item\([\s\S]*size\((32|64), (32|64)\)/);
  console.log('Real regular-background tile metadata passed (converted bpp, 32x32 maps).');
  // Exercise the same public Butano/Maxmod conversion path with every
  // tracker format supported by the engine. These are copied only into the
  // disposable build and never mutate either project or source assets.
  const trackerFixtures = [
    ['galgox_snowheart_melody.xm', 'xm_fixture.xm'],
    ['soda7_xcopy_ohc.s3m', 's3m_fixture.s3m'],
    ['battle_clean.it', 'it_fixture.it'],
  ];
  const fixtureSourceDir = path.join(root, 'templateEngineGame', 'sample_project_example', 'assets', 'musics');
  const buildAudioDir = path.join(outputDir, 'audio');
  for (const [sourceName, targetName] of trackerFixtures) {
    const source = path.join(fixtureSourceDir, sourceName);
    assert.ok(fs.existsSync(source), `Tracker fixture is missing: ${sourceName}`);
    fs.copyFileSync(source, path.join(buildAudioDir, targetName));
  }
  const devkit = process.env.DEVKITPRO;
  assert.ok(devkit, 'DEVKITPRO must point to the installed toolchain');
  const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM');
  const make = path.join(devkit, 'msys2', 'usr', 'bin', 'make.exe');
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = [path.join(devkit, 'msys2', 'usr', 'bin'), path.join(devkit, 'tools', 'bin'), path.join(arm, 'bin'), env[pathKey] || ''].join(path.delimiter);
  env.DEVKITPRO = devkit.replaceAll('\\', '/');
  env.DEVKITARM = arm.replaceAll('\\', '/');
  env.BUTANO = path.join(root, 'tools', 'butano').replaceAll('\\', '/');
  const build = spawnSync(make, ['-j2'], { cwd: outputDir, env, stdio: 'inherit', windowsHide: true });
  if (build.error) throw build.error;
  assert.equal(build.status, 0, `Shooter ROM build failed in ${outputDir}`);
  const rom = fs.readdirSync(outputDir)
    .filter(file => file.toLowerCase().endsWith('.gba'))
    .map(file => path.join(outputDir, file))[0];
  assert.ok(rom, 'Shooter build must produce a GBA ROM');
  assert.ok(fs.statSync(rom).size > 192, 'Shooter ROM must contain more than the GBA header');
  console.log(`Shooter game ROM build passed: ${rom}`);
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
