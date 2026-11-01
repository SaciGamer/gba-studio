import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { toRuntimeScripts } from '../dist/main/utils/types/RuntimeScript.js';
import { EVENT_DEFAULTS } from '../dist/shared/events/eventCatalog.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-emote-distance-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const emit = args => builder.processResourceObject({ _resourceType: 'scene', id: 'emote', script: [
    { id: 'emote', command: 'EVENT_SHOW_EMOTE', args: { actorId: '__PLAYER__', emoteId: 'happy', ...args } },
  ] }).headerContent.toString();
  assert.equal(EVENT_DEFAULTS.EVENT_SHOW_EMOTE.distance, 12);
  assert.match(emit({}), /ShowEmoteEventData[^\n]+"happy", 12/);
  assert.match(emit({ distance: 30 }), /ShowEmoteEventData[^\n]+"happy", 30/);
  assert.match(emit({ distance: 0 }), /ShowEmoteEventData[^\n]+"happy", 0/);
  for (const distance of [-1, 257, 1.5, '12']) assert.throws(() => emit({ distance }));
  const projected = toRuntimeScripts([{ id: 'emote', command: 'EVENT_SHOW_EMOTE', args: { actorId: '__PLAYER__', emoteId: 'happy', distance: 30 } }]);
  assert.equal(projected[0].args.distance, 30);
  const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
  const extract = start => {
    const offset = source.indexOf(start);
    const open = source.indexOf('{', offset);
    let depth = 1, end = open + 1;
    while (depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
    return source.slice(offset, end);
  };
  fs.writeFileSync(path.join(temp, 'main.cpp'), `
#include <algorithm>
#include <array>
#include <optional>
#include <string>
#include <cassert>
namespace bn { template<int N> using string = std::string; }
struct Sprite { int x=0,y=0; void set_z_order(int){} void set_position(int a,int b){x=a;y=b;} };
struct GraphicsManager {
  struct EmoteAnimationState { bn::string<64> actor_id; std::optional<Sprite> sprite; int elapsed_frames=0; int distance=12; bool occupied=false; };
  std::array<EmoteAnimationState,16> emote_animations;
  int player_slot=0,sprite_count=1,player_world_x=100,player_world_y=100,camera_x=0,camera_y=0,actor_count=1;
  std::array<std::optional<Sprite>,1> sprites{Sprite{}};
  std::array<bn::string<64>,1> actor_ids{"npc"};
  std::array<int,1> actor_world_x{80},actor_world_y{90};
  std::optional<int> get_sprite_item_from_name(const bn::string<64>&){return 1;}
  std::optional<Sprite> create_sprite(int,int x,int y){return Sprite{x,y};}
  void remove_sprite(Sprite&){}
  bool show_emote(const char*,const char*,int=12);
  void update_emote_animations();
};
${extract('bool GraphicsManager::show_emote(')}
${extract('void GraphicsManager::update_emote_animations()')}
int main(){
 GraphicsManager gm;
 assert(gm.show_emote("__PLAYER__","happy"));
 auto& state=gm.emote_animations[0]; assert(state.sprite->y==8);
 assert(gm.show_emote("__PLAYER__","happy",30)); assert(state.sprite->y==-10);
 gm.player_world_y=120; gm.update_emote_animations(); assert(state.sprite->y==9);
 for(int i=1;i<8;i++)gm.update_emote_animations(); assert(state.sprite->y==2);
 assert(gm.show_emote("__PLAYER__","happy",0)); assert(state.sprite->y==40);
 assert(gm.show_emote("npc","happy",25)); assert(gm.emote_animations[1].sprite->y==-15);
 for(int i=0;i<36;i++)gm.update_emote_animations(); assert(!state.occupied);
}
`);
  const executable = path.join(temp, 'emote.exe');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', path.join(temp, 'main.cpp'), '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  console.log('Emote distance passed: default, validation, runtime projection, actor following, hop and expiry.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
