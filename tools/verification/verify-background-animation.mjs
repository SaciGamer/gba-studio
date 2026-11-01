import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawnSync}from'node:child_process';
import{transcodeProject}from'../dist/main/utils/projectTranscoder/transcode-project.js';
import{encodeSpriteBmp}from'../dist/main/utils/builders/spriteCanvasPixels.js';
import{inspectGbaMemory,formatGbaMemoryReport}from'./verify-gba-memory.mjs';
const reuseIndex=process.argv.indexOf('--reuse');
const temp=reuseIndex>=0?path.dirname(path.resolve(process.argv[reuseIndex+1])):fs.mkdtempSync(path.join(os.tmpdir(),'gba-background-animation-smoke-'));
assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-background-animation-smoke-'));
const root=path.resolve('.'),project=path.join(temp,'project'),output=path.join(temp,'output');
if(reuseIndex>=0)assert.equal(path.resolve(process.argv[reuseIndex+1]),output);
try{
 fs.mkdirSync(path.join(project,'project'),{recursive:true});
 for(const category of ['backgrounds','backgrounds-hd'])fs.mkdirSync(path.join(project,'assets',category),{recursive:true});
 fs.writeFileSync(path.join(project,'animation.gbaproj'),JSON.stringify({name:'background_animation_smoke'}));
 const sheet=(width,height,step)=>{const rgba=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;rgba[i]=x<step?240:32;rgba[i+1]=x<step?32:240;rgba[i+2]=64;rgba[i+3]=255;}return encodeSpriteBmp(rgba,width,height);};
 fs.writeFileSync(path.join(project,'assets/backgrounds/normal.bmp'),sheet(512,256,256));
 fs.writeFileSync(path.join(project,'assets/backgrounds-hd/hd.bmp'),sheet(480,160,240));
 const stress=process.argv.includes('--startup-stress');
 if(stress)fs.copyFileSync('tools/butano/template/graphics/gba_studio_startup_anim.bmp',path.join(project,'assets/backgrounds-hd/startup.bmp'));
 let serial=0;const event=(command,args,id=String(++serial))=>({id,command,args});const wait=frames=>event('EVENT_WAIT',{units:'ticks',frames});
 const resources=[
 {_resourceType:'background',id:'normal',filename:'normal.bmp',name:'normal',imageWidth:512,imageHeight:256},
 {_resourceType:'background',id:'hd',filename:'hd.bmp',name:'hd',imageWidth:480,imageHeight:160,hd:true},
 {_resourceType:'settings',id:'settings',startSceneId:'stage',startX:0,startY:0},
 {_resourceType:'scene',id:'stage',name:'Sheet Tiled',sceneType:'Adventure',width:256,height:256,backgrounds:[],actors:[],triggers:[],script:[
 event('EVENT_FADE_IN',{speed:1}),event('EVENT_BACKGROUND_ANIMATE',{backgroundId:'normal',layerId:0,startFrame:1,endFrame:2,reverse:true,durationFrames:3,loop:false}),event('EVENT_BACKGROUND_SET_SCALE',{layerId:0,x:120,y:120}),wait(24),
 event('EVENT_BACKGROUND_ANIMATE',{backgroundId:'hd',layerId:1,durationFrames:4,loop:true}),wait(24),event('EVENT_CHANGE_LAYER',{layerId:1,backgroundId:''}),wait(8),event('EVENT_CHANGE_SCENE',{sceneId:'bitmap',x:0,y:0,direction:'right',fadeSpeed:1})]},
 {_resourceType:'scene',id:'bitmap',name:'Sheet Bitmap',sceneType:'Logo',width:240,height:160,backgrounds:[],actors:[],triggers:[],script:[
 event('EVENT_BACKGROUND_ANIMATE',{backgroundId:'normal',layerId:2,durationFrames:4,loop:true}),event('EVENT_FADE_IN',{speed:1}),wait(24),event('EVENT_BACKGROUND_ANIMATE',{backgroundId:'hd',layerId:2,durationFrames:3,loop:false}),wait(40)]}
 ];
 if(stress){const bytes=fs.readFileSync(path.join(project,'assets/backgrounds-hd/startup.bmp'));resources.push({_resourceType:'background',id:'startup',filename:'startup.bmp',name:'startup',imageWidth:bytes.readInt32LE(18),imageHeight:Math.abs(bytes.readInt32LE(22)),hd:true});const scene=resources.find(r=>r.id==='bitmap');const animation=scene.script.findLast(e=>e.command==='EVENT_BACKGROUND_ANIMATE');Object.assign(animation.args,{backgroundId:'startup',durationFrames:1,endFrame:104});scene.script[scene.script.length-1]=wait(150);}
 for(let i=0;i<resources.length;i++)fs.writeFileSync(path.join(project,'project',i+'.gbasres'),JSON.stringify(resources[i]));
 const result=await transcodeProject({projectDir:project,outputDir:output,parallel:2});assert.ok(result.success,result.message);
 const generated=fs.readdirSync(path.join(output,'graphics'));assert.ok(generated.some(file=>/^bg_anim_.*_r.bmp$/.test(file)));assert.ok(generated.some(file=>/^bg_anim_.*_b.bmp$/.test(file)));
 assert.ok(!generated.includes('normal.bmp')&&!generated.includes('hd.bmp'),'Editor-only source sheets must not be compiled as complete backgrounds');
 const header=path.join(output,'include/graphics_manager.h');fs.writeFileSync(header,fs.readFileSync(header,'utf8').replace('public:','public:\n    void verify_background_animation();'));
 fs.appendFileSync(path.join(output,'src/graphics_manager.cpp'),`
void GraphicsManager::verify_background_animation(){
 static int samples=0,cpu_sum=0,cpu_peak=0;
 static bool once=false,loop0=false,loop1=false,cancelled=false,bitmap_loop=false,done=false;
 if(!currentScene||done)return;
 if(bn::string_view(currentScene->id)=="stage"){
   const auto&s0=background_animations[0];const auto&s1=background_animations[1];
   if(s0.data&&!s0.active&&s0.frame==1){once=true;BN_ASSERT(s0.offset_x==0&&current_bgs_id[0]==s0.data->regular_background_id,"Reverse range did not hold its first source window");BN_ASSERT(current_affine_bgs[0]&&current_affine_bgs[0]->horizontal_scale()==bn::fixed(120)/100,"Affine transform was lost on frame replacement");}
   if(s1.data&&s1.data->loop){BN_ASSERT(current_bgs_id[1]==s1.data->regular_background_id,"Animation replaced the source instead of panning it");BN_ASSERT(current_bgs[1]&&current_bgs[1]->x()==136-s1.offset_x&&current_bgs[1]->y()==48&&current_bgs_x[1]==-s1.offset_x,"Full sheet viewport offset is incorrect");if(s1.frame==0)loop0=true;if(s1.frame==1)loop1=true;}
   if(loop0&&loop1&&!s1.data&&current_bgs_id[1].empty())cancelled=true;
 }
 if(bn::string_view(currentScene->id)=="bitmap"){
   BN_ASSERT(!background_animations[0].data&&!background_animations[1].data,"Scene transition retained old animation jobs");
   const auto&s=background_animations[2];if(s.data&&s.bitmap_item){auto bg=*current_bitmap_bgs;auto page=bg.page();const auto&item=*s.bitmap_item;const int source_frame=s.data->start_frame+s.frame*s.data->frame_delta;const int sx=source_frame*s.data->step_x,sy=source_frame*s.data->step_y;const auto*colors=item.colors_ptr();const int width=item.dimensions().width();for(int py=8;py<160;py+=23)for(int px=8;px<240;px+=29){BN_ASSERT(page[py*240+px]==colors[(sy+py)*width+sx+px],"Animation VRAM pixels do not match the selected source frame");}}if(s.data&&s.data->loop&&s.frame==1)bitmap_loop=true;
   if(s.data&&!s.data->loop&&s.active&&s.frame>0){int cpu=bn::core::last_cpu_usage().data()*1000/bn::fixed::scale();cpu_sum+=cpu;cpu_peak=bn::max(cpu_peak,cpu);++samples;}
   if(s.data&&!s.data->loop&&!s.active&&s.frame==s.data->frame_count-1){
     BN_ASSERT(once&&loop0&&loop1&&cancelled&&bitmap_loop,"Sheet playback stages did not complete");
     BN_ASSERT(current_bitmap_bgs.has_value(),"Missing direct bitmap layer");
     BN_LOG("[ANIMATION_CPU] samples=",samples," avg_tenths=",samples?cpu_sum/samples:0," peak_tenths=",cpu_peak);
     BN_LOG("[BACKGROUND_ANIMATION_OK]");done=true;
   }
 }
}
`);
 const game=path.join(output,'src/game.cpp');fs.writeFileSync(game,fs.readFileSync(game,'utf8').replace('        update();','        update();\n        GraphicsManager::instance().verify_background_animation();'));
 if(process.argv.includes('--build')){
   const devkit=process.env.DEVKITPRO;assert.ok(devkit);const arm=process.env.DEVKITARM||path.join(devkit,'devkitARM');const env={...process.env};const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';
   env[key]=[path.join(devkit,'msys2/usr/bin'),path.join(devkit,'tools/bin'),path.join(arm,'bin'),env[key]].join(path.delimiter);env.DEVKITPRO=devkit.replaceAll('\\','/');env.DEVKITARM=arm.replaceAll('\\','/');env.BUTANO=path.join(root,'tools/butano').replaceAll('\\','/');
   const build=spawnSync(path.join(devkit,'msys2/usr/bin/make.exe'),['-j2'],{cwd:output,env,stdio:'inherit',windowsHide:true});assert.equal(build.status,0,'Background animation ROM compilation failed');
   const elf=fs.readdirSync(output).find(file=>file.endsWith('.elf'));assert.ok(elf);const memory=inspectGbaMemory(path.join(output,elf));console.log(formatGbaMemoryReport(memory));assert.deepEqual(memory.errors,[]);
   if(process.argv.includes('--emulate')){const run=spawnSync(process.execPath,['tests/runtime-monitor-emulator.mjs',path.join(output,path.basename(elf,'.elf')+'.gba'),'--background-animation','--hud'],{cwd:root,stdio:'inherit',windowsHide:true});assert.equal(run.status,0);}
 }
 console.log('Background sheet animation ROM passed: normal/HD sources in tiled and bitmap scenes, affine transforms, once/loop playback, cancellation and scene cleanup.');console.log(output);
}finally{if(!process.argv.includes('--keep')){assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-background-animation-smoke-'));fs.rmSync(temp,{recursive:true,force:true});}}
