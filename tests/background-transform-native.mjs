import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawnSync}from'node:child_process';
const source=fs.readFileSync('tools/butano/template/src/graphics_manager.cpp','utf8').replaceAll('\r\n','\n');
const method=signature=>{const start=source.indexOf(signature);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}\n',start)+2);};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-bg-transform-native-'));
try{
 const cpp=`#define GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM 1
 #include <cassert>
 #include <optional>
 #include <array>
 #include <vector>
 #include <algorithm>
 #include <string>
 #include <iostream>
 #define BN_LOG(...) ((void)0)
 namespace bn {using fixed=double;using string_view=std::string;template<int N>using string=std::string;template<class T>T clamp(T v,T a,T b){return std::clamp(v,a,b);}}
 struct Background{double sx=1,sy=1,rotation=0,hx=0,hy=0;void set_scale(double x,double y){sx=x;sy=y;}void set_rotation_angle(double v){rotation=v;}void set_shear(double x,double y){hx=x;hy=y;}};
 struct Scene{const char*scene_type;};
 struct GraphicsManager{
 const Scene*currentScene=nullptr;int camera_x=0,camera_y=0,camera_updates=0;
 std::vector<std::optional<Background>>current_bgs=std::vector<std::optional<Background>>(4);
 std::array<std::optional<Background>,4>current_affine_bgs;std::optional<Background>current_bitmap_bgs;
 std::vector<int>current_bgs_x={0,0,0,0},current_bgs_y={0,0,0,0},current_bgs_parallax_x={100,100,100,100},current_bgs_parallax_y={100,100,100,100};
 void set_camera_position(int,int){++camera_updates;}
 bool transform_background(int,int,int,int);void scroll_background(int,int,int);void set_background_parallax(int,int,int);
 };
 ${method('bool GraphicsManager::transform_background(')}
 ${method('void GraphicsManager::scroll_background(')}
 ${method('void GraphicsManager::set_background_parallax(')}
 int main(){GraphicsManager manager;Scene tiled{"Adventure"},bitmap{"Point Click"};manager.currentScene=&tiled;manager.current_affine_bgs[1]=Background{};
 assert(manager.transform_background(1,0,150,80));auto&bg=*manager.current_affine_bgs[1];assert(bg.sx==1.5&&bg.sy==0.8);
 assert(manager.transform_background(1,1,-90,0)&&bg.rotation==270);
 assert(manager.transform_background(1,2,50,-25)&&bg.hx==0.5&&bg.hy==-0.25);
 manager.scroll_background(1,16,-8);assert(manager.current_bgs_x[1]==16&&manager.current_bgs_y[1]==-8&&manager.camera_updates==1);
 manager.set_background_parallax(1,50,100);assert(manager.current_bgs_parallax_x[1]==50&&manager.camera_updates==2);
 assert(!manager.transform_background(2,0,100,100));assert(!manager.transform_background(-1,0,100,100));
 manager.currentScene=&bitmap;manager.current_bitmap_bgs=Background{};
 assert(manager.transform_background(2,0,120,140));assert(manager.current_bitmap_bgs->sx==1.2&&manager.current_bitmap_bgs->sy==1.4);
 assert(manager.transform_background(2,1,450,0)&&manager.current_bitmap_bgs->rotation==90);
 assert(manager.transform_background(2,2,-20,10)&&manager.current_bitmap_bgs->hx==-0.2);
 manager.scroll_background(2,32,16);assert(manager.current_bgs_x[2]==32&&manager.current_bgs_y[2]==16&&manager.camera_updates==3);
 manager.currentScene=nullptr;assert(!manager.transform_background(2,0,100,100));
 std::cout<<"Native affine/direct bitmap transforms passed: independent axes, angle normalization, shear, scroll, parallax and missing targets.\\n";}
 `;
 const file=path.join(temp,'main.cpp'),exe=path.join(temp,process.platform==='win32'?'test.exe':'test');fs.writeFileSync(file,cpp);
 const build=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-Wno-sign-compare',file,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
