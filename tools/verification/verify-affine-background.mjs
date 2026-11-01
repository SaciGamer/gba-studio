import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { transcodeProject } from '../../dist/main/utils/projectTranscoder/transcode-project.js';
import { encodeSpriteBmp } from '../../dist/main/utils/builders/spriteCanvasPixels.js';
import { inspectGbaMemory, formatGbaMemoryReport } from './verify-gba-memory.mjs';
const reuseIndex=process.argv.indexOf('--reuse');
const reused=reuseIndex>=0?path.resolve(process.argv[reuseIndex+1]):null;
const root=path.resolve('.'), temp=reused?path.dirname(reused):fs.mkdtempSync(path.join(os.tmpdir(),'gba-affine-smoke-'));
assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-affine-smoke-'),'Reuse only this verifier\'s own temporary fixture');
const project=path.join(temp,'project'), output=path.join(temp,'output');
if(reused)assert.equal(reused,output);
try {
 fs.mkdirSync(path.join(project,'project'),{recursive:true});fs.mkdirSync(path.join(project,'assets/backgrounds'),{recursive:true});fs.mkdirSync(path.join(project,'assets/sprites'),{recursive:true});
 fs.writeFileSync(path.join(project,'affine.gbaproj'),JSON.stringify({name:'affine_smoke'}));
 const pixels=new Uint8Array(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
  const index=(y*256+x)*4, pattern=(Math.floor(x/8)+Math.floor(y/8))%3;
  pixels[index]=pattern===0?240:32;pixels[index+1]=pattern===1?240:32;pixels[index+2]=pattern===2?240:32;pixels[index+3]=255;
 }
 fs.writeFileSync(path.join(project,'assets/backgrounds/probe.bmp'),encodeSpriteBmp(pixels,256,256));
 const actorPixels=new Uint8Array(16*16*4);
 for(let index=0;index<256;index++) {actorPixels[index*4]=index%3?32:220;actorPixels[index*4+1]=220;actorPixels[index*4+2]=32;actorPixels[index*4+3]=255;}
 fs.writeFileSync(path.join(project,'assets/sprites/hero.bmp'),encodeSpriteBmp(actorPixels,16,16));
 const event=(command,args)=>({id:command,command,args});
 const resources=[
  {_resourceType:'background',id:'bg',filename:'probe.bmp',name:'probe',imageWidth:256,imageHeight:256},
  {_resourceType:'sprite',id:'hero',name:'hero',filename:'hero.bmp',imageWidth:16,imageHeight:16,playerFrameWidth:16,playerFrameHeight:16},
  {_resourceType:'settings',id:'settings',startSceneId:'stage',startX:6,startY:6,colorMode:'mono',playerSpriteId:'hero'},
  {_resourceType:'scene',id:'stage',name:'Affine Smoke',sceneType:'Adventure',width:256,height:256,backgrounds:[{layerId:0,backgroundId:'bg',x:0,y:0}],actors:[{id:'npc',spriteId:'hero',x:150,y:80}],triggers:[],
   script:[event('EVENT_FADE_IN',{speed:1}),event('EVENT_BACKGROUND_SET_SCALE',{layerId:0,x:140,y:120}),event('EVENT_BACKGROUND_SET_ROTATION',{layerId:0,angle:25}),event('EVENT_BACKGROUND_SET_SHEAR',{layerId:0,x:15,y:0}),event('EVENT_BACKGROUND_SCROLL',{layerId:0,x:8,y:-8}),
    event('EVENT_SPRITE_EFFECT',{actorId:'npc',scale:125,rotation:30,visible:true,fadeColor:'none',fadeIntensity:0,durationFrames:1}),
    event('EVENT_ACTOR_SET_TINT',{actorId:'npc',value:50,color:'#ff0000'}),event('EVENT_ACTOR_SET_SATURATION',{actorId:'npc',value:50}),event('EVENT_ACTOR_SET_BRIGHTNESS',{actorId:'npc',value:10}),event('EVENT_ACTOR_SET_OPACITY',{actorId:'npc',value:65}),event('EVENT_SET_ACTOR_PRIORITY',{actorId:'npc',priority:2}),event('EVENT_WAIT',{units:'frames',frames:120}),{...event('EVENT_FADE_OUT',{speed:1}),id:'smoke-fade-out'},{...event('EVENT_FADE_IN',{speed:1}),id:'smoke-fade-in-after-opacity'}],
   tileAnimations:[{id:'animation',name:'Probe',layerId:0,targetTilesetId:'bg',targetTileIndex:0,frameTileIndices:[1,2],frameTilesetIds:['bg','bg'],durationFrames:8,initialFrame:0,loop:true}]},
 ];
 for(const resource of resources)fs.writeFileSync(path.join(project,'project',resource._resourceType+'.gbasres'),JSON.stringify(resource));
 const result=await transcodeProject({projectDir:project,outputDir:output,parallel:2});assert.ok(result.success,result.message);
 const sceneHeader=fs.readFileSync(path.join(output,'include','scene_stage_res.h'),'utf8');
 assert.match(sceneHeader,/true, "affine_stage_l0"/);assert.match(sceneHeader,/TileAnimation/);
 assert.ok(fs.existsSync(path.join(output,'build','bn_affine_bg_items_affine_stage_l0.h')));
 // Inspect real Butano objects inside this generated diagnostic ROM. No probe
 // code is added to the template or to the saved project.
 const graphicsHeader=path.join(output,'include/graphics_manager.h');
 fs.writeFileSync(graphicsHeader,fs.readFileSync(graphicsHeader,'utf8').replace('public:','public:\n    void verify_visual_smoke();'));
 const graphicsSource=path.join(output,'src/graphics_manager.cpp');
 fs.appendFileSync(graphicsSource,`\nvoid GraphicsManager::verify_visual_smoke() {
  BN_ASSERT(player_slot >= 0 && actor_count == 1, "Missing smoke actors");
  auto palette = sprites[actor_slots[0]]->palette();
  BN_ASSERT(palette.id() == sprites[player_slot]->palette().id(), "Sprite palette sharing must be preserved");
  BN_ASSERT(palette.grayscale_intensity() == bn::fixed(50) / 100, "Saturation did not apply");
  BN_ASSERT(palette.fade_intensity() == bn::fixed(50) / 100, "Tint did not apply");
  BN_ASSERT(palette.colors()[1] == bn::color(27, 27, 6), "Brightness did not apply to the source colors");
  BN_ASSERT(set_actor_visual_effect("npc", 2, 10, 0) && palette.colors()[1] == bn::color(27, 27, 6), "Brightness must not accumulate");
  BN_ASSERT(set_actor_visual_effect("npc", 2, 0, 0) && palette.colors()[1] == bn::color(27, 27, 4), "Brightness reset must restore the source colors");
  BN_ASSERT(set_actor_visual_effect("npc", 2, 10, 0), "Brightness reapply failed");
  BN_ASSERT(sprites[actor_slots[0]]->horizontal_scale() == bn::fixed(125) / 100, "Actor scale did not apply");
  BN_ASSERT(sprites[actor_slots[0]]->rotation_angle() == 30, "Actor rotation did not apply");
  BN_ASSERT(sprites[actor_slots[0]]->blending_enabled() && !sprites[player_slot]->blending_enabled(), "Opacity must select its actor");
  BN_ASSERT(bn::blending::transparency_alpha() == bn::fixed(65) / 100, "Opacity did not apply");
  BN_ASSERT(current_affine_bgs[0].has_value(), "Layer was not converted to affine");
  BN_ASSERT(current_affine_bgs[0]->rotation_angle() == 25, "Background rotation did not apply");
  BN_ASSERT(current_affine_bgs[0]->horizontal_scale() == bn::fixed(140) / 100, "Background scale did not apply");
  BN_ASSERT(current_affine_bgs[0]->horizontal_shear() == bn::fixed(15) / 100, "Background shear did not apply");
  BN_LOG("[VISUAL_SMOKE_OK]");
}\n`);
 const gameSource=path.join(output,'src/game.cpp');
 fs.writeFileSync(gameSource,fs.readFileSync(gameSource,'utf8').replace('        update();','        update();\n        static int visual_probe_frames = 0;\n        ++visual_probe_frames;\n        if(visual_probe_frames == 120 || visual_probe_frames == 360) GraphicsManager::instance().verify_visual_smoke();'));
 if(process.argv.includes('--build')) {
  const devkit=process.env.DEVKITPRO;assert.ok(devkit);const arm=process.env.DEVKITARM||path.join(devkit,'devkitARM');
  const env={...process.env};const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';
  env[key]=[path.join(devkit,'msys2/usr/bin'),path.join(devkit,'tools/bin'),path.join(arm,'bin'),env[key]].join(path.delimiter);
  env.DEVKITPRO=devkit.replaceAll('\\','/');env.DEVKITARM=arm.replaceAll('\\','/');env.BUTANO=path.join(root,'tools/butano').replaceAll('\\','/');
  const build=spawnSync(path.join(devkit,'msys2/usr/bin/make.exe'),['-j2'],{cwd:output,env,stdio:'inherit',windowsHide:true});assert.equal(build.status,0,'Affine smoke ROM compilation failed');
  const elf=fs.readdirSync(output).find(file=>file.endsWith('.elf'));assert.ok(elf);const memory=inspectGbaMemory(path.join(output,elf));console.log(formatGbaMemoryReport(memory));assert.deepEqual(memory.errors,[]);
  if(process.argv.includes('--emulate')) {
   const run=spawnSync(process.execPath,['tests/runtime-monitor-emulator.mjs',path.join(output,path.basename(elf,'.elf')+'.gba'),'--hud','--visual-effects'],{cwd:root,stdio:'inherit',windowsHide:true});assert.equal(run.status,0);
  }
 }
 console.log('Affine background smoke passed: automatic conversion, animated tile substitution, scale, rotation, shear and scroll.');console.log(output);
} finally {
 if(!process.argv.includes('--keep')) {assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-affine-smoke-'));fs.rmSync(temp,{recursive:true,force:true});}
}
