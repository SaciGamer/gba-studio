import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/butano/template/src/graphics_manager.cpp'), 'utf8');
const start = source.indexOf('void GraphicsManager::update_tile_animations()');
const end = source.indexOf('\n#if GBA_STUDIO_FEATURE_SHOOTER', start);
assert.ok(start >= 0 && end > start);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-tile-runtime-'));
try {
  const fixture = `
#define GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM 1
#include <algorithm>
#include <array>
#include <cassert>
#include <memory>
#include <optional>
#include <vector>
#include <string>
#include <iostream>
namespace bn {
enum class bpp_mode { BPP_4, BPP_8 };
template<class T> T min(T a,T b){return std::min(a,b);}
template<class T> T max(T a,T b){return std::max(a,b);}
template<class T> T clamp(T v,T a,T b){return std::clamp(v,a,b);}
struct tile { int value; };
struct Storage { std::vector<tile> source; std::array<int,16> destination{}; bpp_mode mode=bpp_mode::BPP_4; bool available=true; int writes=0; };
struct Span { const std::vector<tile>* data; int size()const{return data->size();} const tile& operator[](int i)const{return (*data)[i];} };
struct regular_bg_tiles_ptr {
 std::shared_ptr<Storage> data;
 std::optional<Span> tiles_ref()const{return data->available?std::optional<Span>(Span{&data->source}):std::nullopt;}
 bpp_mode bpp()const{return data->mode;}
 void overwrite_tile(int target,const tile& first){
  int stride=bpp()==bpp_mode::BPP_8?2:1;
  for(int i=0;i<stride;i++)data->destination[target*stride+i]=(&first)[i].value;
  ++data->writes;
 }
};
struct Background { regular_bg_tiles_ptr item; regular_bg_tiles_ptr tiles()const{return item;} };
}
struct TileAnimation {int layer_id;int target_tile_index;const int* frame_tile_indices;int frames_count;int duration_frames;bool loop;int initial_frame;};
struct SceneLayer {int layerId;const char*backgroundId;};
struct Scenes {const TileAnimation* tile_animations;int tile_animations_count;const SceneLayer*backgrounds_layers=nullptr;int backgrounds_layers_size=0;};
struct GraphicsManager {
 const Scenes* currentScene=nullptr;const Scenes* tile_animation_scene=nullptr;
 std::vector<std::optional<bn::Background>> current_bgs;
 std::array<std::optional<bn::Background>,4> current_affine_bgs;
 std::vector<std::string> current_bgs_id;
 int tile_animation_frames[32]{},tile_animation_ticks[32]{};bool tile_animation_initialized[32]{};
 void update_tile_animations();
};
${source.slice(start, end)}
int main(){
 auto storage=std::make_shared<bn::Storage>();storage->source={{0},{11},{22},{33},{44},{55}};
 GraphicsManager manager;manager.current_bgs.push_back(bn::Background{{storage}});
 const int frames[]={1,2,3};const TileAnimation loop{0,0,frames,3,2,true,1};const Scenes scene{&loop,1};manager.currentScene=&scene;
 manager.update_tile_animations();assert(storage->destination[0]==22);
 manager.update_tile_animations();assert(storage->destination[0]==33);
 manager.update_tile_animations();assert(storage->destination[0]==33);
 manager.update_tile_animations();assert(storage->destination[0]==11);
 const TileAnimation once{0,0,frames,3,2,false,0};const Scenes second{&once,1};manager.currentScene=&second;
 manager.update_tile_animations();assert(storage->destination[0]==11); // scene reset
 for(int i=0;i<12;i++)manager.update_tile_animations();assert(storage->destination[0]==33);
 int writes=storage->writes;for(int i=0;i<8;i++)manager.update_tile_animations();assert(storage->writes==writes);
 storage->mode=bn::bpp_mode::BPP_8;
 const int pairFrames[]={1,2};const TileAnimation pairs{0,1,pairFrames,2,2,true,0};const Scenes eight{&pairs,1};manager.currentScene=&eight;
 manager.update_tile_animations();assert(storage->destination[2]==22&&storage->destination[3]==33);
 manager.update_tile_animations();assert(storage->destination[2]==44&&storage->destination[3]==55);
 const SceneLayer layer{0,"original"};const Scenes replaced{&pairs,1,&layer,1};manager.currentScene=&replaced;manager.current_bgs_id={"replacement"};
 writes=storage->writes;manager.update_tile_animations();assert(storage->writes==writes);
 manager.current_bgs_id[0]="original";manager.update_tile_animations();assert(storage->writes>writes);
 manager.current_bgs[0].reset();manager.current_affine_bgs[0]=bn::Background{{storage}};
 const Scenes affine{&pairs,1};manager.currentScene=&affine;
 manager.update_tile_animations();assert(storage->destination[2]==22&&storage->destination[3]==33);
 manager.update_tile_animations();assert(storage->destination[2]==44&&storage->destination[3]==55);
 storage->available=false;writes=storage->writes;manager.update_tile_animations();assert(storage->writes==writes);
 manager.currentScene=nullptr;manager.update_tile_animations();assert(storage->writes==writes);
 std::cout<<"Production tile animation passed: initial frame, duration, loop, one-shot, scene reset, 4bpp/8bpp source stride and unavailable data.\\n";
}
`;
  const cpp = path.join(temp, 'main.cpp');const executable = path.join(temp, process.platform === 'win32' ? 'test.exe' : 'test');
  fs.writeFileSync(cpp, fixture);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', cpp, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `${build.error ?? ''}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `${run.error ?? ''}${run.stderr}`);process.stdout.write(run.stdout);
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('gba-studio-tile-runtime-'));
  fs.rmSync(temp, { recursive: true, force: true });
}
