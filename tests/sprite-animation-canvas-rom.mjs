import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawnSync}from'node:child_process';
import{inspectGbaMemory,formatGbaMemoryReport}from'../tools/verify-gba-memory.mjs';
const root=path.resolve('.'),template=path.join(root,'tools/butano/template'),dist=path.join(root,'dist/main/utils/builders');
const{default:TemplateBuilder}=await import(pathToFileURL(path.join(dist,'TemplateBuilder.js')));const{default:ResourceBuilder}=await import(pathToFileURL(path.join(dist,'ResourceBuilder.js')));const{default:CppBuilder}=await import(pathToFileURL(path.join(dist,'CppBuilder.js')));const{AssetBuilder}=await import(pathToFileURL(path.join(dist,'AssetBuilder.js')));const{encodeSpriteBmp}=await import(pathToFileURL(path.join(dist,'spriteCanvasPixels.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-studio-sprite-rom-')),project=path.join(temp,'project'),output=path.join(temp,'output'),assets=path.join(project,'assets');
try {
fs.mkdirSync(path.join(assets,'sprites'),{recursive:true});fs.mkdirSync(path.join(assets,'backgrounds'),{recursive:true});
const source=new Uint8Array(16*16*4);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const at=(y*16+x)*4;source[at]=x<8?255:0;source[at+1]=y>=8?255:0;source[at+2]=x>=8?255:0;source[at+3]=255;}fs.writeFileSync(path.join(assets,'sprites/source.bmp'),encodeSpriteBmp(source,16,16));
const bgWidth=process.argv.includes('--map-padding')?730:256,bgHeight=process.argv.includes('--map-padding')?200:256;
const bg=new Uint8Array(bgWidth*bgHeight*4);for(let at=0;at<bg.length;at+=4){bg[at]=8;bg[at+1]=16;bg[at+2]=32;bg[at+3]=255;}fs.writeFileSync(path.join(assets,'backgrounds/ground.bmp'),encodeSpriteBmp(bg,bgWidth,bgHeight));
const config={projectName:'sprite_canvas',authorName:'GBA Studio',version:'1',useAudio:true,useGraphics:true};
await new TemplateBuilder({templateDir:template,buildDir:output,romTitle:'CANVAS SPRITE',romCode:'SPCV'}).initializeBuildDirectory({projectDir:project,projectName:config.projectName,targetDir:output,romTitle:'CANVAS SPRITE',romCode:'SPCV'});
const builder=new ResourceBuilder(output,template);
let files=[
 builder.processResourceObject({_resourceType:'settings',id:'settings',startSceneId:'scene',startX:8,startY:4,startMoveSpeed:1,startAnimSpeed:6,startDirection:'down',colorMode:'mono',fadeDirection:1,playerSpriteId:'hero'}),
 builder.processResourceObject({_resourceType:'sprite',id:'hero',name:'hero',filename:'source.bmp',imageWidth:16,imageHeight:16,playerFrameWidth:16,playerFrameHeight:16,playerAnimSpeed:6,playerCanvasOriginX:0,playerCanvasOriginY:8,playerAnimationStripOrientation:'horizontal',playerAnimationStates:[{id:'main',type:'fixed-direction',animations:[{id:'idle',type:'idle',frames:[],canvasFrames:[{id:'red',width:16,height:16,pieces:[{id:'r',sourceX:0,sourceY:0,width:8,height:8,x:4,y:4,flipX:true}]},{id:'empty',width:16,height:16,pieces:[]},{id:'blue',width:16,height:16,pieces:[{id:'b',sourceX:8,sourceY:0,width:8,height:8,x:4,y:4,flipY:true}]}]}]}]}),
 builder.processResourceObject({_resourceType:'background',id:'ground',name:'ground',filename:'ground.bmp',imageWidth:bgWidth,imageHeight:bgHeight,autoColor:true,tileColors:'16'}),
 builder.processResourceObject({_resourceType:'scene',id:'scene',name:'scene',width:bgWidth,height:bgHeight,sceneType:'Top Down',backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],script:[{id:'fade',command:'EVENT_FADE_IN',args:{speed:1}}]})
];
if(process.argv.includes('--numeric-values')) {
 const number=value=>({kind:'number',value});
 files.push(builder.processResourceObject({_resourceType:'variables',variables:[{id:'local-0',name:'Local 0',symbol:'LOCAL0',type:'number',initialValue:20},{id:'flag',name:'Flag',type:'boolean',initialValue:false}]}));
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.script.unshift({id:'numeric-pan',command:'EVENT_PAN_CAMERA',args:{x:{kind:'expression',operation:'add',left:{kind:'expression',operation:'modulo',left:{kind:'variable',variableId:'local-0'},right:number(7)},right:number(15)},y:{kind:'variable',variableId:'local-0'}}});
 if(process.argv.includes('--formula')) { scene.script[0].args.x={kind:'formula',source:'($LOCAL0 % 7) + 15',variables:{LOCAL0:'local-0'}};scene.script[0].args.y={kind:'formula',source:'$LOCAL0',variables:{LOCAL0:'local-0'}}; }
 scene.script.push({id:'numeric-boolean',command:'EVENT_VARIABLE',args:{variableId:'flag',value:{kind:'expression',operation:'not',left:number(0)}}});
 scene.script.push({id:'numeric-boolean-read',command:'EVENT_PAN_CAMERA',args:{x:{kind:'engine',field:'cameraX'},y:{kind:'expression',operation:'add',left:{kind:'engine',field:'cameraY'},right:{kind:'variable',variableId:'flag'}}}});
 scene.script.push({id:'numeric-player',command:'EVENT_ACTOR_SET_POSITION',args:{actorId:'__PLAYER__',x:{kind:'expression',operation:'add',left:{kind:'property',actorId:'__PLAYER__',property:'x'},right:{kind:'engine',field:'cameraX'}},y:number(80)}});
 if(process.argv.includes('--actor-move')) {
  for(const [id,args] of [['pixels',{x:{type:'number',value:48},y:{kind:'literal',type:'number',value:80},xUnit:'pixels',yUnit:'pixels'}],['tiles',{x:{kind:'formula',source:'3 + 1'},y:{type:'number',value:6},xUnit:'tiles',yUnit:'tiles'}]]) {
   scene.script.push({id:'move-'+id,command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',...args}});
   scene.script.push({id:'read-move-'+id,command:'EVENT_PAN_CAMERA',args:{x:{kind:'property',actorId:'__PLAYER__',property:'x'},y:{kind:'property',actorId:'__PLAYER__',property:'y'}}});
  }
 }
}
if(process.argv.includes('--motion')) {
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.collisions=[{id:'wall',x:160,y:32,width:8,height:128,collisionSide:'solid'}];
 const property=axis=>({kind:'property',actorId:'__PLAYER__',property:axis});
 scene.script.push(
  {id:'animated-camera',command:'EVENT_PAN_CAMERA',args:{x:40,y:16,animated:true,speed:2}},
  {id:'animated-actor',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:200,y:72,xUnit:'pixels',yUnit:'pixels',animated:true,speed:2}},
  {id:'report-arrival',command:'EVENT_PAN_CAMERA',args:{x:property('x'),y:property('y')}},
  {id:'blocked-actor',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:164,y:72,xUnit:'pixels',yUnit:'pixels',animated:true,speed:2}},
  {id:'offset-actor',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:property('x'),y:{kind:'expression',operation:'add',left:property('y'),right:{kind:'number',value:2}},xUnit:'tiles',yUnit:'tiles'}},
  {id:'report-offset',command:'EVENT_PAN_CAMERA',args:{x:property('x'),y:property('y')}},
  {id:'animated-edge',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:10000,y:10000,animated:true,speed:4}},
  {id:'report-edge',command:'EVENT_PAN_CAMERA',args:{x:property('x'),y:property('y')}},
  {id:'instant-edge',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:-10000,y:-10000}},
  {id:'report-origin',command:'EVENT_PAN_CAMERA',args:{x:property('x'),y:property('y')}});
}
await new AssetBuilder(path.join(root,'dist'),output,path.join(root,'bin/image-magick/magick.exe')).copyAssets(assets,files,{preserveStructure:false});
files=files.map(file=>builder.processResourceObject(file.jsonContent));const baked=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent.__spriteCanvas;
const names=[`bn_sprite_items_${baked.graphicsName}.h`,'bn_regular_bg_items_ground.h'];await new CppBuilder(output,template,names).generateProjectStructure(config);await builder.writeResourceHeader(files);await builder.generateResourceRegistryClass(files,config);fs.writeFileSync(path.join(output,'include/graphics_items.h'),'#ifndef GENERATED_GRAPHICS_H\n#define GENERATED_GRAPHICS_H\n'+names.map(name=>`#include "${name}"`).join('\n')+'\n#endif\n');
if(process.argv.includes('--numeric-values')||process.argv.includes('--motion')) {
 // Trace only the verification ROM, leaving production gameplay logging unchanged.
 const runtime=path.join(output,'src/numeric_values.cpp');
 let source=fs.readFileSync(runtime,'utf8').replace('return VariableManager::instance().get_number(id);','{ const int value=VariableManager::instance().get_number(id); BN_LOG("[NUMERIC_TEST:VARIABLE]",value); return value; }').replace('return VariableManager::instance().get_boolean(id) ? 1 : 0;', '{ const int value=VariableManager::instance().get_boolean(id) ? 1 : 0; BN_LOG("[NUMERIC_TEST:BOOLEAN]",value); return value; }').replace('return GraphicsManager::instance().read_numeric_actor_property(id, property);','const int value=GraphicsManager::instance().read_numeric_actor_property(id, property); BN_LOG("[NUMERIC_TEST:PROPERTY]",value); return value;').replace('case 0: return graphics.get_camera_x();','case 0: BN_LOG("[NUMERIC_TEST:CAMERA]",graphics.get_camera_x()); return graphics.get_camera_x();');
 fs.writeFileSync(runtime,source);
}
assert.ok(!fs.existsSync(path.join(output,'graphics/source.bmp')));
if(process.argv.includes('--build')){
 const devkit=process.env.DEVKITPRO,arm=process.env.DEVKITARM||path.join(devkit,'devkitARM');assert.ok(devkit);const env={...process.env};const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';env[key]=[path.join(devkit,'msys2/usr/bin'),path.join(devkit,'tools/bin'),path.join(arm,'bin'),env[key]].join(path.delimiter);env.DEVKITPRO=devkit.replaceAll('\\','/');env.DEVKITARM=arm.replaceAll('\\','/');env.BUTANO=path.join(root,'tools/butano').replaceAll('\\','/');
 const result=spawnSync(path.join(devkit,'msys2/usr/bin/make.exe'),['-j2'],{cwd:output,env,stdio:'inherit',windowsHide:true});assert.equal(result.status,0,result.error?.message??'Sprite canvas ROM build failed');
 const memory=inspectGbaMemory(path.join(output,config.projectName+'.elf'));console.log(formatGbaMemoryReport(memory));assert.equal(memory.errors.length,0);
 const header=fs.readFileSync(path.join(output,'build',names[0]),'utf8');assert.match(header,/, 3\)/,'Butano must expose the three baked animation frames');console.log('Generated sprite canvas ROM passed.');
}
console.log('SPRITE_CANVAS_ROM='+path.join(output,config.projectName+'.gba'));

if(process.argv.includes('--emulate')) {
 const run=spawnSync(process.execPath,[path.join(root,'tests/runtime-monitor-emulator.mjs'),path.join(output,config.projectName+'.gba'),...(process.argv.includes('--numeric-values')?['--numeric-values']:[]),...(process.argv.includes('--actor-move')?['--actor-move']:[]),...(process.argv.includes('--motion')?['--motion']:[])],{cwd:root,stdio:'inherit',windowsHide:true});
 assert.equal(run.status,0,'Real emulator verification failed');
}
} finally {
 if(!process.argv.includes('--keep')) {
  const resolved=path.resolve(temp),expectedRoot=path.resolve(os.tmpdir())+path.sep;
  assert.ok(resolved.startsWith(expectedRoot)&&path.basename(resolved).startsWith('gba-studio-sprite-rom-'),'Unexpected temporary verification directory');
  fs.rmSync(resolved,{recursive:true,force:true});
  console.log('Temporary ROM verification directory removed.');
 }
}
