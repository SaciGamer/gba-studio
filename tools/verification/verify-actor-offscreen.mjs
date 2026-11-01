import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { transcodeProject } from '../../dist/main/utils/projectTranscoder/transcode-project.js';
import { encodeSpriteBmp } from '../../dist/main/utils/builders/spriteCanvasPixels.js';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';

const root = path.resolve('.');
const reuseIndex = process.argv.indexOf('--reuse');
const reused = reuseIndex < 0 ? null : path.resolve(process.argv[reuseIndex + 1]);
const temporary = reused ? path.dirname(reused) : fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-offscreen-'));
assert.ok(temporary.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-actor-offscreen-'));
if (reused) assert.equal(reused, path.join(temporary, 'output'));
const project = path.join(temporary, 'project'), output = path.join(temporary, 'output');
try {
  for (const folder of ['project', 'assets/sprites', 'assets/musics']) fs.mkdirSync(path.join(project, folder), { recursive: true });
  fs.writeFileSync(path.join(project, 'offscreen.gbaproj'), JSON.stringify({ name: 'actor_offscreen' }));
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let index = 0; index < 256; ++index) pixels.set([32, index % 2 ? 220 : 64, 32, 255], index * 4);
  fs.writeFileSync(path.join(project, 'assets/sprites/hero.bmp'), encodeSpriteBmp(pixels, 16, 16));
  fs.copyFileSync(path.join(root, 'templateEngineGame/sample_project_example/assets/musics/cyberrid.mod'), path.join(project, 'assets/musics/cyberrid.mod'));
  let serial = 0;
  const event = (command, args, children) => ({ id: `e${serial++}`, command, args, ...(children ? { children } : {}) });
  const increment = id => event('EVENT_VARIABLE', { variableId: id, value: { kind: 'expression', operation: 'add', left: { kind: 'variable', variableId: id }, right: { kind: 'number', value: 1 } } });
  const actor = (id, x, keep = false) => ({ id, spriteId: 'hero', anchor: 'center', x, y: 48, keepRunningWhileOffscreen: keep,
    onInitScript: [increment(`${id}_init`)], onUpdateScript: [increment(`${id}_ticks`)], onInteractScript: [] });
  const normal = actor('normal', 32), keep = actor('keep', 64, true), far = actor('far', 640);
  const interactionVariable = 'fdabfb32-4983-4b2f-a875-a438ea005cf6';
  keep.onInteractScript = [{ ...increment(interactionVariable), id: 'c551ea4d-c610-47bb-90ad-0f61d4b0da43', version: 1 }];
  normal.onUpdateScript.push(event('EVENT_WAIT_FOR_BUTTON', { buttons: ['A'], overrideButton: true }, { then: [increment('input_ticks')] }));
  // These remain unexecuted but include movement and save support in the ROM.
  normal.onInteractScript.push(event('EVENT_SPRITE_EFFECT', { actorId: '__SELF__', scale: 200, rotation: 0, visible: true, fadeColor: 'none', fadeIntensity: 0, durationFrames: 1 }), event('EVENT_SPAWN_ACTOR', { source: 'prefab', prefabId: 'pool', x: 1000, y: 48 }), event('EVENT_ACTOR_MOVE_TO', { actorId: '__SELF__', x: 80, y: 48, speed: 1 }), event('EVENT_SAVE_WRITE', { slot: 0 }));
  const resources = [
    { _resourceType: 'sprite', id: 'hero', name: 'hero', filename: 'hero.bmp', imageWidth: 16, imageHeight: 16, playerFrameWidth: 16, playerFrameHeight: 16 },
    { _resourceType: 'settings', id: 'settings', startSceneId: 'stage', startX: 2, startY: 2, colorMode: 'mono', playerSpriteId: 'hero' },
    { _resourceType: 'variables', id: 'variables', variables: ['normal_init', 'normal_ticks', 'keep_init', 'keep_ticks', 'far_init', 'far_ticks', 'input_ticks', interactionVariable].map(id => ({ id, symbol: id.replaceAll('-', '_'), type: 'number', initialValue: 0 })) },
    { _resourceType: 'prefabs', id: 'prefabs', prefabs: [{ id: 'pool', name: 'Pool', type: 'actor', actor: { spriteId: 'hero', keepRunningWhileOffscreen: false } }] },
    { _resourceType: 'scene', id: 'stage', name: 'Actor offscreen', sceneType: 'Adventure', width: 1280, height: 160, backgrounds: [], triggers: [{ id: "8d650072-7876-463d-a70d-d2560a9795ad", x: 0, y: 0, width: 16, height: 16, enabled: false }],
      actors: [normal, keep, far],
      script: [event('EVENT_PLAY_MUSIC', { musicId: 'cyberrid', volume: 50 }), event('EVENT_FADE_IN', { speed: 1 })] },
  ];
  for (let index = 0; index < resources.length; ++index) fs.writeFileSync(path.join(project, 'project', `${index}.gbasres`), JSON.stringify(resources[index]));
  const result = await transcodeProject({ projectDir: project, outputDir: output, parallel: 2 });
  assert.ok(result.success, result.message);
  const header = path.join(output, 'include/graphics_manager.h');
  fs.writeFileSync(header, fs.readFileSync(header, 'utf8').replace('public:', 'public:\n    void verify_actor_offscreen();'));
  fs.appendFileSync(path.join(output, 'src/graphics_manager.cpp'), `
#include "bn_sprites.h"
#include "save_manager.h"
#include "variable_manager.h"
#define OFFSCREEN_CHECK(condition,message) do { if(!(condition)) { BN_LOG("[ACTOR_OFFSCREEN_FAIL]",message); BN_ASSERT(false,message); } } while(false)
void GraphicsManager::verify_actor_offscreen() {
 static int stage=0,ticks=0,normal_ticks=0,keep_ticks=0,cycles=0,peak=0;
 static bool done=false;
 if(done || !currentScene) return;
 const auto number=[](const char* id){return VariableManager::instance().get_number(id);};
 static int trace=0;if(++trace%60==0)BN_LOG("[ACTOR_OFFSCREEN_STAGE]",stage,",",number("normal_init"),",",number("keep_init"),",",camera_x);
 const auto active=[&](const char* id){for(int i=0;i<actor_count;++i)if(actor_ids[i]==id)return true;return false;};
 const auto* hero=get_sprite_by_id(bn::string<64>("hero"));
 const int normal_edge=32-hero->canvas_origin_x+hero->frame_width*bn::max(1,hero->composite_columns);
 const auto view=[&](int x){CameraManager::instance().follow_player_actor(false);CameraManager::instance().set_position(x,0);set_camera_position(x,0);};
 if(stage==0){
  if(number("normal_init")==0||number("keep_init")==0)return;
  OFFSCREEN_CHECK(actor_count==2&&!active("far")&&number("far_init")==0,"Offscreen actor was instantiated at scene load");
  OFFSCREEN_CHECK(number("normal_init")==1&&number("keep_init")==1,"Initial actors must initialize once");
  const int saved_player_x=player_world_x,saved_player_y=player_world_y;
  const int keep_x=read_numeric_actor_property("keep",0),keep_y=read_numeric_actor_property("keep",1);
  const auto* player_body=sprite_resources[player_slot];
  const int contact_x=keep_x+hero->collision_x+hero->collision_width-player_body->collision_x;
  const int contact_y=keep_y+hero->collision_y-player_body->collision_y;
  OFFSCREEN_CHECK(move_actor("__PLAYER__",contact_x+1,contact_y),"Could not place player near actor collider");
  OFFSCREEN_CHECK(!update_actor_interaction(true)&&number("fdabfb32-4983-4b2f-a875-a438ea005cf6")==0,"Actor interaction extended beyond its collider");
  OFFSCREEN_CHECK(move_actor("__PLAYER__",contact_x,contact_y),"Could not place player at actor collider contact");
  OFFSCREEN_CHECK(update_actor_interaction(true)&&number("fdabfb32-4983-4b2f-a875-a438ea005cf6")==1,"Actor interaction failed at collider contact");
  OFFSCREEN_CHECK(move_actor("__PLAYER__",saved_player_x,saved_player_y),"Could not restore player after collider test");
  for(const char* target : {"__PLAYER__", "keep"}) {
   const int x=read_numeric_actor_property(target,0),y=read_numeric_actor_property(target,1);
   for(int direction=0;direction<4;++direction) {
    OFFSCREEN_CHECK(write_numeric_actor_property(target,2,direction),"Direction update failed");
    OFFSCREEN_CHECK(read_numeric_actor_property(target,2)==direction,"Direction update was not applied");
    OFFSCREEN_CHECK(read_numeric_actor_property(target,0)==x&&read_numeric_actor_property(target,1)==y,"Direction update moved the actor");
   }
  }
  OFFSCREEN_CHECK(set_actor_transform("keep",0,-90,4),"Rotation event could not target actor");
  OFFSCREEN_CHECK(set_actor_transform("keep",1,100,600),"Scale event could not target actor");
  OFFSCREEN_CHECK(set_actor_transform("keep",2,80,3,0xff0000),"Tint event could not target actor");
  OFFSCREEN_CHECK(set_actor_visible("keep",false),"Hide actor failed");
  OFFSCREEN_CHECK(set_actor_transform("__PLAYER__",1,150,3),"Scale event could not target player");
  OFFSCREEN_CHECK(!read_numeric_trigger_property("8d650072-7876-463d-a70d-d2560a9795ad",4),"Trigger must start disabled");
  OFFSCREEN_CHECK(write_numeric_trigger_property("8d650072-7876-463d-a70d-d2560a9795ad",4,1)&&read_numeric_trigger_property("8d650072-7876-463d-a70d-d2560a9795ad",4),"Trigger could not enable at runtime");
  OFFSCREEN_CHECK(write_numeric_trigger_property("8d650072-7876-463d-a70d-d2560a9795ad",4,0)&&!read_numeric_trigger_property("8d650072-7876-463d-a70d-d2560a9795ad",4),"Trigger could not disable at runtime");
  peak=bn::sprites::used_items_count();keep_ticks=number("keep_ticks");view(normal_edge-1);stage=1;ticks=0;return;
 }
 if(stage==1&&++ticks>=5){
  OFFSCREEN_CHECK(active("normal")&&number("normal_init")==1,"Partially visible actor was recreated");
  OFFSCREEN_CHECK(int(sprites[actor_slots[1]]->rotation_angle())==270,"Independent negative rotation did not finish");
  OFFSCREEN_CHECK(int(sprites[actor_slots[1]]->palette().fade_intensity()*100)>=79,"Independent tint did not finish");
  OFFSCREEN_CHECK(!sprites[actor_slots[1]]->visible(),"Visual effects changed actor visibility");
  OFFSCREEN_CHECK(int(sprites[player_slot]->horizontal_scale()*100)==150,"Independent player scale did not finish");
  normal_ticks=number("normal_ticks");view(normal_edge);stage=2;ticks=0;return;
 }
 if(stage==2&&++ticks>=5){
  OFFSCREEN_CHECK(!active("normal")&&number("normal_ticks")==normal_ticks,"Offscreen actor kept running");
  OFFSCREEN_CHECK(sprite_effect_states[0].channels[1].active&&sprite_effect_states[0].channels[1].frame>=5,"Removing an actor lost another actor's effect job");
  OFFSCREEN_CHECK(!InputManager::instance().is_overridden("A"),"Offscreen actor retained its attached button binding");
  OFFSCREEN_CHECK(number("keep_ticks")>keep_ticks&&number("keep_init")==1,"Preserved actor stopped or restarted");
  view(600);stage=3;ticks=0;return;
 }
 if(stage==3&&++ticks>=5){
  OFFSCREEN_CHECK(active("far")&&active("keep")&&!active("normal")&&number("far_init")==1,"Camera entry did not instantiate its actor");
  OFFSCREEN_CHECK(remove_actor("far")&&remove_actor("normal"),"Explicit despawn must also handle dormant actors");
  OFFSCREEN_CHECK(spawn_actor("pool",1000,48,true)&&spawn_actor("pool",1100,48,true),"Dormant prefab instances must reserve distinct pool entries");
  int enabled_pool=0;for(const auto& residence:actor_residences)if(residence.definition->spawn_prefab_id&&residence.enabled)++enabled_pool;
  OFFSCREEN_CHECK(enabled_pool==2,"Dormant prefab pool was reused");
  view(0);stage=4;ticks=0;return;
 }
 if(stage==4&&++ticks>=5){
  OFFSCREEN_CHECK(!active("normal")&&!actor_residence("normal")->enabled,"Despawned actor reappeared");
  OFFSCREEN_CHECK(spawn_actor("normal",32,48),"Explicit respawn failed");stage=5;ticks=0;return;
 }
 if(stage==5&&++ticks>=5){
  OFFSCREEN_CHECK(number("normal_init")==2&&number("keep_init")==1,"Recreated actor must run On Init again");
  OFFSCREEN_CHECK(!sprite_effect_states[1].channels[1].active,"New actor inherited an old effect job");
  OFFSCREEN_CHECK(InputManager::instance().is_overridden("A"),"New actor did not recreate its button binding");
  static MotionEventState motion;
  ActorMoveEventData movement{"normal",80,48};
  ActorMotionManager::instance().advance(movement,motion);
  OFFSCREEN_CHECK(ActorMotionManager::instance().controls_actor("normal"),"Motion job was not started");
  normal_ticks=number("normal_ticks");view(600);stage=6;return;
 }
 if(stage==6){
  const bool inside=cycles%2!=0;
  if(cycles==0)OFFSCREEN_CHECK(!ActorMotionManager::instance().controls_actor("normal"),"Offscreen actor retained its motion job");
  OFFSCREEN_CHECK(active("normal")==inside&&active("keep")&&!active("far"),"Actor residency did not follow the camera");
  OFFSCREEN_CHECK(bn::sprites::used_items_count()<=peak,"Camera crossings leaked sprites");
  OFFSCREEN_CHECK(number("keep_init")==1,"Preserved actor restarted during camera crossings");
  ++cycles;
  if(cycles<200){view(inside?600:0);return;}
  OFFSCREEN_CHECK(number("normal_init")==102,"Each fresh instance must run On Init exactly once");
  OFFSCREEN_CHECK(move_actor("normal",400,48),"Actor position update failed");stage=7;ticks=0;return;
 }
 if(stage==7&&++ticks>=5){
  OFFSCREEN_CHECK(!active("normal")&&actor_residence("normal")->x==400,"Dormant position was lost");
  OFFSCREEN_CHECK(SaveManager::instance().save_game(0),"Saving actor residency failed");
  OFFSCREEN_CHECK(move_actor("normal",64,48)&&spawn_actor("far",64,48),"World mutation failed");
  OFFSCREEN_CHECK(SaveManager::instance().load_game(0),"Loading actor residency failed");
  OFFSCREEN_CHECK(!actor_residence("far")->enabled&&actor_residence("normal")->x==400,"Save lost despawn/dormant state");
  OFFSCREEN_CHECK(!active("normal")&&active("keep")&&number("keep_init")==1,"Load recreated offscreen/default actor or reset preserved actor");
  view(400);stage=8;ticks=0;return;
 }
 if(stage==8&&number("normal_init")>=103){
  OFFSCREEN_CHECK(active("normal")&&!active("far")&&number("normal_init")==103&&number("keep_init")==1,"Restored dormant actor did not create a new instance");
  GameWorldState legacy{};OFFSCREEN_CHECK(capture_game_world(legacy),"Legacy setup failed");
  legacy.actor_residency=0;int retained=0;
  for(int i=0;i<legacy.actors_count;++i)if(legacy.actors[i].mode<3&&legacy.actors[i].id!=game_save_key("normal"))legacy.actors[retained++]=legacy.actors[i];
  legacy.actors_count=retained;
  OFFSCREEN_CHECK(restore_game_world(legacy)&&!actor_residence("normal")->enabled,"Legacy saves must retain removed actors");
  OFFSCREEN_CHECK(spawn_actor("normal",camera_x+239,48),"Affine test spawn failed");
  int root=-1;for(int i=0;i<actor_count;++i)if(actor_ids[i]=="normal")root=actor_slots[i];
  OFFSCREEN_CHECK(root>=0,"Affine test actor missing");sprites[root]->set_scale(2);
  OFFSCREEN_CHECK(move_actor("normal",camera_x+244,48),"Affine test move failed");update_actor_residency();
  OFFSCREEN_CHECK(active("normal"),"Partially visible affine actor was culled");
  OFFSCREEN_CHECK(move_actor("normal",camera_x+304,48),"Affine test exit failed");update_actor_residency();
  OFFSCREEN_CHECK(!active("normal"),"Offscreen affine actor retained sprites");
  BN_LOG("[ACTOR_OFFSCREEN_OK]200 camera crossings; fresh/preserved instances; bindings; prefabs; save/load; legacy world; sprites=",bn::sprites::used_items_count());done=true;
 }
}
`);
  const game = path.join(output, 'src/game.cpp');
  const gameSource = fs.readFileSync(game, 'utf8');
  assert.ok(gameSource.includes('        update();'));
  fs.writeFileSync(game, gameSource.replace('        update();', '        update();\n        GraphicsManager::instance().verify_actor_offscreen();'));
  const devkit = process.env.DEVKITPRO;
  assert.ok(devkit);
  const arm = process.env.DEVKITARM || path.join(devkit, 'devkitARM'), env = { ...process.env };
  const key = Object.keys(env).find(key => key.toUpperCase() === 'PATH');
  env[key] = [path.join(devkit, 'msys2/usr/bin'), path.join(devkit, 'tools/bin'), path.join(arm, 'bin'), env[key]].join(path.delimiter);
  env.DEVKITPRO = devkit.replaceAll('\\', '/'); env.DEVKITARM = arm.replaceAll('\\', '/'); env.BUTANO = path.join(root, 'tools/butano').replaceAll('\\', '/');
  const compiled = spawnSync(path.join(devkit, 'msys2/usr/bin/make.exe'), ['-j2'], { cwd: output, env, stdio: 'inherit', windowsHide: true });
  assert.equal(compiled.status, 0, 'Actor offscreen ROM build failed');
  const elf = fs.readdirSync(output).find(file => file.endsWith('.elf'));
  assert.ok(elf);
  const memory = inspectGbaMemory(path.join(output, elf));
  console.log(formatGbaMemoryReport(memory)); assert.deepEqual(memory.errors, []);
  const rom = path.join(output, path.basename(elf, '.elf') + '.gba');
  console.log(rom);
  if (process.argv.includes('--emulate')) {
    const run = spawnSync(process.execPath, ['tests/actor-offscreen-emulator.mjs', rom], { cwd: root, stdio: 'inherit', windowsHide: true });
    assert.equal(run.status, 0, 'Actor offscreen emulator scenarios failed');
  }
} finally {
  if (!process.argv.includes('--keep')) {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-actor-offscreen-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
