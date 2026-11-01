import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const types = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')));
const { toRuntimeScripts } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeScript.js')));
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-runtime-projection-'));
try {
  const wait = { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 3 } };
  const scene = { _resourceType: 'scene', id: 'scene', name: 'Scene', width: 240, height: 160, sceneType: 'Top Down',
    x: 500, y: 800, editorPosition: { x: 400, y: 400 }, showCamera: true,
    backgrounds: [{ layerId: 2, backgroundId: 'bg', x: -4, y: 8, selectedTiles: [99], tileMap: [[2]], autoTileMap: [[1]], tileMapCellOverrides: [{ index: 0, tileIndex: 1, horizontalFlip: true }] }],
    actors: [{ id: 'npc', spriteId: 'sprite', x: 20, y: 40, width: 32, height: 16, onInteractScript: [wait], editorDescription: 'extra' }],
    triggers: [{ id: 'trigger', x: 1, y: 2, width: 3, height: 4, onEnterScript: [wait], onLeaveScript: [wait] }],
    collisions: [{ id: 'ladder', x: 4, y: 5, width: 6, height: 7, collisionSide: 'ladder' }],
    tileAnimations: [{ layerId: 2, targetTileIndex: 1, frameTileIndices: [1, 2], durationFrames: 3, loop: true }], script: [wait] };
  const original = structuredClone(scene);
  const runtime = types.toRuntimeScene(scene);
  assert.deepEqual(scene, original);
  assert.equal(runtime.actors[0].x, 36); assert.equal(runtime.actors[0].y, 48); assert.equal(runtime.actors[0].anchor, 'center');
  assert.equal(runtime.backgrounds[0].zOrder, 2);
  const orphanAnimationScene = types.toRuntimeScene({ _resourceType: 'scene', id: 'orphan-animation', name: 'Scene',
    backgrounds: [{ layerId: 1, backgroundId: '' }], tileAnimations: [{ layerId: 1, targetTileIndex: 0, frameTileIndices: [0] }] });
  assert.equal(orphanAnimationScene.tileAnimations.length, 0, 'Animations on layers without a generated background are excluded from runtime');
  assert.equal(runtime.backgrounds[0].x, -4); assert.equal(runtime.collisions[0].collisionSide, 'ladder');
  assert.doesNotMatch(JSON.stringify(runtime), /editorPosition|selectedTiles|autoTileMap|tileMap"|showCamera|editorDescription/);
  const enriched = structuredClone(scene);
  enriched.unknownEditorField = { nested: 'sentinel' };
  enriched.script[0].args.unknownEditorField = { nested: 'sentinel' };
  enriched.actors[0].onInteractScript[0].args.unknownEditorField = 'sentinel';
  assert.deepEqual(types.toRuntimeScene(enriched), runtime);
  assert.deepEqual(types.toRuntimeScene({ ...scene, selectedTilesetId: 'editor-tiles', imageType: 'palette_bitmap' }), runtime,
    'Retired scene fields must not enter the final runtime contract');
  const prepared = { graphicsName: 'baked', width: 32, height: 16, frameWidth: 16, frameHeight: 16, idleFrame: 1,
    animations: [{ stateId: 'main', stateType: 'fixed-direction', id: 'idle', type: 'idle', frames: [0, 1], flipRightToCreateLeftFrames: false }] };
  const sprite = types.toRuntimeSprite({ _resourceType: 'sprite', id: 'sprite', name: 'Hero', filename: 'sheet.png', playerCanvasOriginX: 4, playerCollisionWidth: 10, playerAnimationStates: [{ canvasFrames: [{ pieces: [{ sourceX: 12 }] }] }] }, prepared);
  assert.equal(sprite.graphicsName, 'baked'); assert.equal(sprite.playerIdleFrame, 1); assert.equal(sprite.playerCanvasOriginX, 4); assert.equal(sprite.playerCollisionWidth, 10);
  assert.doesNotMatch(JSON.stringify(sprite), /sourceX|canvasFrames|pieces/);
  assert.doesNotMatch(JSON.stringify(sprite), /sheet\.png|filename/);
  assert.doesNotMatch(JSON.stringify(sprite), /stateType/);
  sprite.animations[0].frames.push(2); assert.deepEqual(prepared.animations[0].frames, [0, 1]);
  assert.throws(() => types.toRuntimeSprite({ id: 'sprite' }), /materialized asset required/);
  const bg = types.toRuntimeBackground({ id: 'bg', name: 'Background', filename: 'ground.bmp', imageWidth: 256, imageHeight: 256, autoColor: false, editorZoom: 2 });
  assert.equal(bg.graphicsName, 'ground');
  assert.doesNotMatch(JSON.stringify(bg), /filename|autoColor|tileColors|Background/);
  assert.deepEqual(types.toRuntimeBackground({ id: 'bg', name: 'Renamed in editor', filename: 'ground.bmp', imageWidth: 256, imageHeight: 256 }), bg);
  const settings = types.toRuntimeSettings({ startSceneId: 'scene', playerSpriteId: 'sprite', demoShowFPS: true, font8x8Image: 'recipe.png', inputMap: { interact: ['A'] } });
  assert.doesNotMatch(JSON.stringify(settings), /demoShowFPS|font8x8Image|recipe/);
  assert.deepEqual(types.toRuntimeSettings({ startSceneId: 'scene', playerSpriteId: 'sprite', inputMap: { interact: ['A'] }, colorMode: 'mixed' }), settings);
  assert.deepEqual(types.toRuntimeSettings({ shooterConfig: { playerHitPoints: 9 } }), types.toRuntimeSettings({ shooterConfig: {} }),
    'Shooter HP is supplied by CombatConfig; the retired duplicate must not enter runtime settings');
  assert.deepEqual(types.toRuntimeSettings({ startSceneId: 'scene', playerSpriteId: 'sprite', inputMap: { interact: ['A'] }, playerFrameWidth: 64, playerFrameHeight: 32, playerFramesPerDirection: 9, playerAnimSpeed: 55, playerIdleFrame: 7 }), settings,
    'Unused legacy Settings frame fields must stay outside the runtime projection');
  types.validateRuntimeReferences([runtime, sprite, bg, settings]);
  assert.throws(() => types.validateRuntimeReferences([{ ...runtime, name: 'Castle Entrance' }]), /Scene Castle Entrance layer 2: missing background/);
  assert.throws(() => types.validateRuntimeReferences([{ ...runtime, name: ' ' }]), /Scene scene layer 2: missing background/);
  assert.throws(() => types.validateRuntimeReferences([runtime, settings]), /missing sprite|missing background/);
  assert.throws(() => types.validateRuntimeReferences([bg, bg]), /Duplicate .*resource/);
  assert.throws(() => types.validateRuntimeReferences([{ ...bg, id: '../escape' }]), /Invalid generated resource symbol/);
  assert.throws(() => types.validateRuntimeReferences([{ ...bg, id: 'a-b' }, { ...bg, id: 'a_b' }]), /Duplicate generated resource symbol/);
  assert.throws(() => types.validateRuntimeReferences([{ ...bg, id: 'hero' }, { ...bg, id: 'HERO' }]), /Duplicate generated resource symbol/);
  assert.throws(() => types.toRuntimeScene({ ...scene, width: Infinity }), /finite number/);
  assert.throws(() => types.toRuntimeResource({ _resourceType: 'unknown' }), /Unsupported resource type/);
  assert.equal(types.toRuntimeResource({ _resourceType: 'user_settings', arbitrary: 'editor' }), null);
  const command = { id: 'call', command: 'EVENT_CALL_SCRIPT', args: { unknownBefore: 123, scriptId: 'sub', unknownAfter: 456 }, position: { x: 9, y: 9 } };
  assert.deepEqual(toRuntimeScripts([command]), [{ id: 'call', command: 'EVENT_CALL_SCRIPT', args: { scriptId: 'sub' } }]);
  assert.deepEqual(toRuntimeScripts([{ ...wait, disabled: true }, { ...wait, args: { __comment: true } }, { ...wait, enabled: false }]), []);
  assert.throws(() => toRuntimeScripts([{ id: 'bad', command: 'EVENT_UNKNOWN' }]), /Unsupported runtime command/);
  assert.throws(() => types.validateRuntimeReferences([{ ...runtime, script: toRuntimeScripts([command]) }, bg, sprite]), /missing script 'sub'/);
  const branch = { id: 'if', command: 'EVENT_IF', args: { left: { kind: 'literal', type: 'number', value: 1, editorSymbol: 'sentinel' }, operator: '==', right: { kind: 'literal', type: 'number', value: 1 } }, children: { then: [command], else: [wait], thenCollapsed: true } };
  assert.equal(toRuntimeScripts([branch])[0].children.then[0].args.scriptId, 'sub');
  assert.doesNotMatch(JSON.stringify(toRuntimeScripts([branch])), /Collapsed|editorSymbol|sentinel/);
  fs.mkdirSync(path.join(temp, 'include')); fs.mkdirSync(path.join(temp, 'src'));
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const finalScene = builder.processRuntimeResource(runtime);
  assert.doesNotMatch(finalScene.headerContent.toString(), /EDITORPOSITION|SELECTEDTILES\[|AUTOTILEMAP|_JSON/);
  assert.throws(() => builder.processRuntimeResource({ ...runtime, arbitraryRuntimeField: 42 }), /Unexpected runtime field scene.arbitraryRuntimeField/);
  const finalSprite = builder.processRuntimeResource(sprite);
  assert.doesNotMatch(finalSprite.headerContent.toString(), /SpriteCanvasPiece|SpriteCanvasFrameDefinition|SOURCE_X|_JSON/);
  const emitted = scripts => builder.processResourceObject({ _resourceType: 'scene', id: 'payload', backgrounds: [], script: scripts }).headerContent.toString();
  assert.equal(emitted([command]), emitted([{ id: 'call', command: 'EVENT_CALL_SCRIPT', args: { scriptId: 'sub' } }]));
  const clean = { _resourceType: 'scene', id: 'clean', name: 'Scene', backgrounds: [], script: [wait] };
  assert.equal(builder.processResourceObject(clean).headerContent.toString(), builder.processResourceObject({ ...clean, unknownPrimitive: 123, unknownObject: { sentinel: true }, _saved: true, editorPosition: { x: 20, y: 30 } }).headerContent.toString());
  assert.doesNotMatch(emitted([command]), /UNKNOWNBEFORE|UNKNOWNAFTER|123|456/);
  assert.match(emitted([command]), /CallScriptEventData SCENE_PAYLOAD_ARGS_0 = \{ "sub", nullptr, 0 \}/);
  assert.match(emitted([command]), /"EVENT_CALL_SCRIPT", &SCENE_PAYLOAD_ARGS_0/);
  const audioScene = types.toRuntimeScene({ ...scene,
    actors: [{ ...scene.actors[0], onInteractScript: [{ id: 'actor-audio', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'actor_music' } }] }],
    triggers: [{ ...scene.triggers[0], onLeaveScript: [{ id: 'trigger-audio', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'trigger_music' } }] }],
    script: [{ id: 'stage', command: 'EVENT_SHOOTER_LOAD_STAGE', args: { musicId: 'stage_music' } }],
  });
  const reusable = types.toRuntimeResource({ _resourceType: 'scripts', scripts: [{ id: 'sub', events: [
    { id: 'reusable-music', command: 'EVENT_PLAY_MUSIC', args: { musicId: 'reusable_music' } },
    { id: 'reusable-sound', command: 'EVENT_PLAY_SOUND', args: { soundId: 'reusable_sound' } },
  ] }] });
  const audioFiles = [audioScene, reusable, bg, sprite].map(resource => builder.processRuntimeResource(resource));
  await builder.generateResourceRegistryClass(audioFiles, { projectName: 'projection' });
  const audioRegistry = fs.readFileSync(path.join(temp, 'include/audio_registry.h'), 'utf8');
  for (const sound of ['actor_music', 'trigger_music', 'stage_music', 'reusable_music', 'reusable_sound']) assert.ok(audioRegistry.includes(sound), `Missing transitive audio ${sound}`);
  fs.mkdirSync(path.join(temp, 'build'));
  const musicHeader = path.join(temp, 'build/bn_music_items.h');
  fs.writeFileSync(musicHeader, ['actor_music', 'trigger_music', 'stage_music', 'reusable_music'].map(sound => `music_item ${sound}();`).join('\n'));
  builder.validateMusicReferences(audioFiles, path.join(temp, 'build'));
  fs.writeFileSync(musicHeader, 'music_item actor_music();');
  assert.throws(() => builder.validateMusicReferences(audioFiles, path.join(temp, 'build')), /trigger_music.*stage_music.*reusable_music|stage_music.*trigger_music.*reusable_music/);
  await builder.writeResourceHeader(audioFiles);
  const unrelated = path.join(temp, 'include/unrelated_res.h');
  fs.writeFileSync(unrelated, 'user-provided header');
  const registryOnly = audioFiles.filter(file => file.jsonContent._resourceType !== 'scripts');
  await builder.writeResourceHeader(registryOnly);
  assert.equal(fs.existsSync(path.join(temp, 'include/scripts_res.h')), false, 'Incremental export must retire previously registered project headers');
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'user-provided header');
  const emptyScene = types.toRuntimeScene({ _resourceType: 'scene', id: 'empty', name: 'Empty', width: 730, height: 200, backgrounds: [], tileMap: [] });
  const emptyFile = builder.processRuntimeResource(emptyScene);
  assert.match(emptyFile.headerContent.toString(), /SceneLayer SCENE_EMPTY_BACKGROUNDS_LAYERS\[1\] = \{\}/);
  await builder.generateResourceRegistryClass([emptyFile], { projectName: 'empty' });
  const emptyRegistry = fs.readFileSync(path.join(temp, 'src/resource_registry.cpp'), 'utf8');
  assert.match(emptyRegistry, /SCENE_EMPTY_WIDTH, SCENE_EMPTY_HEIGHT/);
  assert.doesNotMatch(emptyRegistry, /SCENE_EMPTY_TILEMAP/);
  console.log('Runtime projection passed: explicit resources, preserved geometry/dynamic data, independent prepared sprites, event contracts, branches, disabled commands and references.');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-runtime-projection-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
