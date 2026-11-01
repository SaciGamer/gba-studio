import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-animation-pixels-'));
try {
 const helper=fs.readFileSync('tools/butano/template/include/background_animation_bitmap.h','utf8').replace(/^#include .*$/gm,'');
 const cpp=`#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <vector>
#include <array>
int words=0,halves=0,cleared=0;
namespace _bn::memory { void unsafe_copy_words(const void*s,int n,void*d){++words;std::memcpy(d,s,n*4);} void unsafe_copy_half_words(const void*s,int n,void*d){++halves;std::memcpy(d,s,n*2);} }
namespace bn::hdma {bool busy=false;bool running(){return busy;}}
namespace bn::hw::dma {void copy_words(const void*s,int n,void*d){_bn::memory::unsafe_copy_words(s,n,d);}void copy_half_words(const void*s,int n,void*d){_bn::memory::unsafe_copy_half_words(s,n,d);}}
namespace bn {
using std::max;using std::min;
struct color { uint16_t value; color(int=0,int=0,int=0):value(0){} };
struct Dimensions {int w,h;int width()const{return w;}int height()const{return h;}};
struct direct_bitmap_item {Dimensions size;std::vector<color>pixels;direct_bitmap_item(int w,int h):size{w,h},pixels(w*h){for(int i=0;i<w*h;i++)pixels[i].value=1+i%65534;}Dimensions dimensions()const{return size;}const color*colors_ptr()const{return pixels.data();}};
struct sp_direct_bitmap_bg_painter {std::array<color,240*160>pixels;struct View{color*p;auto data(){return p;}};struct Bg{color*p;View page(){return {p};}};Bg bg(){return {pixels.data()};}void fill(color c){cleared+=pixels.size();pixels.fill(c);}void rectangle(int x1,int y1,int x2,int y2,color c){for(int y=y1;y<=y2;y++)for(int x=x1;x<=x2;x++){assert(x>=0&&x<240&&y>=0&&y<160);pixels[y*240+x]=c;++cleared;}}};
}
${helper}
int main(){
 for(bool busy:{false,true}) {bn::hdma::busy=busy;
 for(auto size:{bn::Dimensions{24960,160},bn::Dimensions{241,170},bn::Dimensions{80,60}}){
  bn::direct_bitmap_item item(size.w,size.h);bn::sp_direct_bitmap_bg_painter painter;
  for(auto pos:{std::pair{0,0},std::pair{-240,0},std::pair{-1,-3},std::pair{25,12},std::pair{500,200},std::pair{-30000,-200}}){
   for(auto&p:painter.pixels)p.value=65535;
   int before=cleared;background_animation::paint_bitmap(painter,item,pos.first,pos.second);
   if(pos.first==0&&pos.second==0&&size.w>=240&&size.h>=160)assert(cleared==before);
   for(int y=0;y<160;y++)for(int x=0;x<240;x++){int sx=x-pos.first,sy=y-pos.second;uint16_t expected=sx>=0&&sy>=0&&sx<size.w&&sy<size.h?item.pixels[sy*size.w+sx].value:0;assert(painter.pixels[y*240+x].value==expected);}
  }
 }
 }
 assert(words>0&&halves>0);
}`;
 fs.writeFileSync(path.join(temp,'test.cpp'),cpp);
 const exe=path.join(temp,'test.exe');
 const built=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror',path.join(temp,'test.cpp'),'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
 console.log('Bitmap animation pixels passed: full startup-sized sheet, clipped edges, offscreen windows, aligned/unaligned copies and no clear for opaque full-screen frames.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
