import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import{spawnSync}from'node:child_process';
const source=fs.readFileSync('tools/butano/template/src/graphics_manager.cpp','utf8').replaceAll('\r\n','\n');
const method=name=>{const start=source.indexOf(name);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}\n',start)+2);};
const waitSource=fs.readFileSync('tools/butano/template/src/event_wait.cpp','utf8').replaceAll('\r\n','\n');const waitStart=waitSource.indexOf('EventStatus run_wait_status('),waitMethod=waitSource.slice(waitStart,waitSource.indexOf('\n}\n',waitStart)+2);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-bg-animation-native-'));
try{
const cpp=`#include <cassert>
#include <optional>
#include <array>
#include <vector>
#include <string>
#include <algorithm>
#include <iostream>
#include "${path.resolve('tools/butano/template/include/background_animation_clock.h').replaceAll('\\','/')}"
#define GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM 1
int item_lookups=0,blits=0,last_blit_x=0,last_blit_y=0;
struct Item{std::string name;};
struct Background{bool shown=true;int x=0,y=0;bool visible()const{return shown;}void set_position(int a,int b){x=a;y=b;}};
namespace bn {using string_view=std::string;template<int N>using string=std::string;struct color{color(int,int,int){}};struct sp_direct_bitmap_bg_painter{explicit sp_direct_bitmap_bg_painter(Background&){}void fill(color){}void blit(int x,int y,const Item&){++blits;last_blit_x=x;last_blit_y=y;}};}
namespace background_animation { void paint_bitmap(bn::sp_direct_bitmap_bg_painter& painter,const Item&item,int x,int y){painter.blit(x,y,item);} }
struct BackgroundAnimationEventData{int layer_id;const char*regular_background_id;const char*bitmap_background_id;int frame_count;int start_frame;int frame_delta;int step_x;int step_y;int duration_frames;bool loop;};
struct Scene{const char*scene_type;};struct Backgrounds{const char*name;};const Backgrounds resource{"hd"};
const Backgrounds*get_background_by_id(const std::string&id){return id=="missing"?nullptr:&resource;}
std::optional<Item>get_bitmap_bg_item_from_name(const char*name){++item_lookups;return Item{name};}
struct GraphicsManager{
struct BackgroundAnimationState{const BackgroundAnimationEventData*data=nullptr;int frame=0,ticks=0,offset_x=0,offset_y=0;std::optional<Item>bitmap_item;bool active=false;};
BackgroundAnimationState background_animations[4];const Scene*currentScene=nullptr;
std::vector<std::optional<Background>>current_bgs=std::vector<std::optional<Background>>(4);std::array<std::optional<Background>,4>current_affine_bgs;std::optional<Background>current_bitmap_bgs;
std::vector<std::string>current_bgs_id=std::vector<std::string>(4);std::vector<int>current_bgs_x={0,0,0,0},current_bgs_y={0,0,0,0},current_bgs_parallax_x={100,100,100,100},current_bgs_parallax_y={100,100,100,100};
int camera_x=0,camera_y=0,bitmap_paint_x=0,bitmap_paint_y=0,loads=0,camera_updates=0;
void set_camera_position(int,int){++camera_updates;}
void change_single_layer(int layer,const std::string&id,bool visible,bool=false){const auto&old=background_animations[layer];if(old.data){current_bgs_x[layer]+=old.offset_x;current_bgs_y[layer]+=old.offset_y;}background_animations[layer]={};if(id=="missing")return;current_bgs_id[layer]=id;++loads;if(currentScene&&std::string(currentScene->scene_type)=="Logo"){if(!current_bitmap_bgs)current_bitmap_bgs=Background{};current_bitmap_bgs->shown=visible;}else{if(!current_bgs[layer])current_bgs[layer]=Background{};current_bgs[layer]->shown=visible;}}
bool animate_background(const BackgroundAnimationEventData&);bool paint_background_animation_frame(int,const BackgroundAnimationEventData&,int);void update_background_animations();};
${method('bool GraphicsManager::paint_background_animation_frame(')}
${method('bool GraphicsManager::animate_background(')}
${method('void GraphicsManager::update_background_animations(')}
enum class EventStatus{completed,running,failed};enum class WaitType{TIME,FRAMES};struct WaitEventData{int seconds,frames;const char*units;};struct Wait{int seconds=0,frames=0,countInt=0;bool active=false;WaitType type=WaitType::TIME;};
${waitMethod}
int main(){GraphicsManager gm;Scene regular{"Adventure"},bitmap{"Logo"};
BackgroundAnimationEventData once{1,"sheet","hd",3,1,1,80,0,2,false};assert(!gm.animate_background(once));gm.currentScene=&regular;
assert(gm.animate_background(once));assert(gm.current_bgs_x[1]==-80);gm.update_background_animations();for(int i=0;i<4;i++)gm.update_background_animations();assert(gm.current_bgs_x[1]==-240);
for(int i=0;i<50;i++)gm.update_background_animations();assert(!gm.background_animations[1].active&&gm.current_bgs_x[1]==-240&&gm.loads==1);
BackgroundAnimationEventData reverse{1,"sheet","hd",2,3,-1,0,160,1,false};gm.current_bgs[1]->shown=false;assert(gm.animate_background(reverse));assert(gm.current_bgs_x[1]==0&&gm.current_bgs_y[1]==-480&&!gm.current_bgs[1]->shown);
gm.current_bgs_y[1]+=5;for(int i=0;i<5;i++)gm.update_background_animations();assert(gm.current_bgs_y[1]==-315&&!gm.background_animations[1].active);gm.change_single_layer(1,"static",true);assert(gm.current_bgs_y[1]==5&&!gm.background_animations[1].data);
gm.currentScene=&bitmap;BackgroundAnimationEventData loop{1,"sheet","hd",3,0,1,80,0,1,true};assert(gm.animate_background(loop));const auto*bg=&*gm.current_bitmap_bgs;const int initial_loads=gm.loads,lookups=item_lookups;
gm.update_background_animations();for(int i=0;i<7;i++)gm.update_background_animations();assert(gm.background_animations[2].active&&gm.current_bgs_id[2]=="hd");assert(gm.loads==initial_loads&&item_lookups==lookups&&bg==&*gm.current_bitmap_bgs&&blits>=7);assert(last_blit_x==-80&&last_blit_y==0);
gm.change_single_layer(2,"static",true);assert(gm.current_bgs_x[2]==0&&!gm.background_animations[2].data);
BackgroundAnimationEventData bad=once;bad.frame_count=0;assert(!gm.animate_background(bad));bad=once;bad.bitmap_background_id=nullptr;assert(!gm.animate_background(bad));
for(const char*unit:{"frames","ticks"}){Wait wait;WaitEventData data{5,3,unit};assert(run_wait_status(data,wait)==EventStatus::running&&wait.frames==3);assert(run_wait_status(data,wait)==EventStatus::running);assert(run_wait_status(data,wait)==EventStatus::running);assert(run_wait_status(data,wait)==EventStatus::completed);}
Wait seconds;WaitEventData data{1,3,"time"};assert(run_wait_status(data,seconds)==EventStatus::running&&seconds.frames==60);
std::cout<<"Native whole-sheet animation and Wait ticks passed: one source load, cached bitmap blits, pan offsets, range/reverse, loop/once, visibility, preserved scroll and cancellation.\\n";
}`;
const file=path.join(temp,'test.cpp'),exe=path.join(temp,process.platform==='win32'?'test.exe':'test');fs.writeFileSync(file,cpp);
const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-Wno-sign-compare','-Wno-misleading-indentation',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stderr);
const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
