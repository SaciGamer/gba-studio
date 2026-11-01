import crypto from 'node:crypto';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawnSync}from'node:child_process';
import{inspectGbaMemory,formatGbaMemoryReport}from'../tools/verification/verify-gba-memory.mjs';
const {toRuntimeResource,validateRuntimeReferences}=await import(pathToFileURL(path.resolve('dist/main/utils/types/RuntimeResources.js')));
const {createRuntimeFeatureManifest,selectNativeRuntime}=await import(pathToFileURL(path.resolve('dist/main/utils/builders/RuntimeFeatureManifest.js')));
const root=path.resolve('.'),template=path.join(root,'tools/butano/template'),dist=path.join(root,'dist/main/utils/builders');
const{default:TemplateBuilder}=await import(pathToFileURL(path.join(dist,'TemplateBuilder.js')));const{default:ResourceBuilder}=await import(pathToFileURL(path.join(dist,'ResourceBuilder.js')));const{default:CppBuilder}=await import(pathToFileURL(path.join(dist,'CppBuilder.js')));const{AssetBuilder}=await import(pathToFileURL(path.join(dist,'AssetBuilder.js')));const{encodeSpriteBmp}=await import(pathToFileURL(path.join(dist,'spriteCanvasPixels.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-studio-sprite-rom-')),project=path.join(temp,'project'),output=path.join(temp,'output'),assets=path.join(project,'assets');
const dialogueScenario=process.argv.includes('--dialogue-ui-audio');
const cameraStopScenario=process.argv.includes('--camera-stop-follow');
const cameraScopeScenario=process.argv.includes('--camera-scene-scope');
const followActivationScenario=process.argv.includes('--follow-activation');
const followAxisScenario=process.argv.includes('--follow-axis-locks');
const fractionalStartScenario=process.argv.includes('--fractional-start');
const offsetScenario=process.argv.includes('--offset-background');
const bitmapScenario=process.argv.includes('--bitmap-scenes');
const layerScenario=process.argv.includes('--layer-matrix');
const actorScenario=process.argv.includes('--actor-states');
const platformScenario=process.argv.includes('--platform-paths');
const nearestScenario=process.argv.includes('--nearest-motion');
const movementOptionsScenario=process.argv.includes('--movement-options');
const localScenario=process.argv.includes('--local-variables');
const gameSaveScenario=process.argv.includes('--game-save');
const dropThroughScenario=process.argv.includes('--drop-through-platform');
const tileScenario=process.argv.includes('--dynamic-tiles');
const prefabScenario=process.argv.includes('--prefab-spawn');
const reportIndex=process.argv.indexOf('--report');const reportPath=reportIndex<0?null:path.resolve(process.argv[reportIndex+1]);
let memoryEvidence;let emulatorPassed=false;
try {
fs.mkdirSync(path.join(assets,'sprites'),{recursive:true});fs.mkdirSync(path.join(assets,'backgrounds'),{recursive:true});
if(dialogueScenario) {
 fs.mkdirSync(path.join(assets,'musics'),{recursive:true});fs.mkdirSync(path.join(assets,'fonts'),{recursive:true});
 const sampleAssets=path.join(root,'templateEngineGame/sample_project_example/assets');
 fs.copyFileSync(path.join(sampleAssets,'musics/cyberrid.mod'),path.join(assets,'musics/cyberrid.mod'));
 fs.copyFileSync(path.join(sampleAssets,'fonts/customized_8x16_font.bmp'),path.join(assets,'fonts/selected_font.bmp'));
}
if(process.argv.includes('--painted-map')) {
 fs.mkdirSync(path.join(assets,'tilesets'),{recursive:true});
 const pixels=new Uint8Array(8*8*4);for(let at=0;at<pixels.length;at+=4){pixels[at+1]=255;pixels[at+3]=255;}
 fs.writeFileSync(path.join(assets,'tilesets/painted_tiles.bmp'),encodeSpriteBmp(pixels,8,8));
}
if(layerScenario){
 for(const [folder,name,channel] of [['tilesets','matrix_tiles',2],['auto-tiles','matrix_auto',0]]){
  fs.mkdirSync(path.join(assets,folder),{recursive:true});const pixels=new Uint8Array(8*8*4);
  for(let at=0;at<pixels.length;at+=4){pixels[at+channel]=255;pixels[at+3]=255;}
  fs.writeFileSync(path.join(assets,folder,name+'.bmp'),encodeSpriteBmp(pixels,8,8));
 }
}
const source=new Uint8Array(16*16*4);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const at=(y*16+x)*4;source[at]=x<8?255:0;source[at+1]=y>=8?255:0;source[at+2]=x>=8?255:0;source[at+3]=255;}fs.writeFileSync(path.join(assets,'sprites/source.bmp'),encodeSpriteBmp(source,16,16));
if(actorScenario){for(let y=0;y<16;y++)for(let x=0;x<16;x++){const at=(y*16+x)*4;source[at]=x<4?255:0;source[at+1]=x>=8?255:0;source[at+2]=x>=4&&x<8?255:0;}fs.writeFileSync(path.join(assets,'sprites/source.bmp'),encodeSpriteBmp(source,16,16));}
const bgWidth=offsetScenario||bitmapScenario?128:process.argv.includes('--map-padding')?730:256,bgHeight=offsetScenario||bitmapScenario?80:process.argv.includes('--map-padding')?200:256;
const bg=new Uint8Array(bgWidth*bgHeight*4);for(let at=0;at<bg.length;at+=4){bg[at]=offsetScenario||bitmapScenario?0:8;bg[at+1]=offsetScenario||bitmapScenario?255:16;bg[at+2]=offsetScenario||bitmapScenario?0:32;bg[at+3]=255;}
if(tileScenario){for(let y=0;y<bgHeight;y++)for(let x=0;x<bgWidth;x++){const at=(y*bgWidth+x)*4;const animated=x>=8&&x<16&&y<8;bg[at]=0;bg[at+1]=animated?255:0;bg[at+2]=animated?0:255;}}
const bgFolder=bitmapScenario?'backgrounds-hd':'backgrounds';fs.mkdirSync(path.join(assets,bgFolder),{recursive:true});fs.writeFileSync(path.join(assets,bgFolder,'ground.bmp'),encodeSpriteBmp(bg,bgWidth,bgHeight));
if(bitmapScenario){const click=new Uint8Array(bg.length);for(let at=0;at<click.length;at+=4){click[at+2]=255;click[at+3]=255;}fs.writeFileSync(path.join(assets,bgFolder,'click_bg.bmp'),encodeSpriteBmp(click,bgWidth,bgHeight));}
const config={projectName:'sprite_canvas',authorName:'GBA Studio',version:'1',useAudio:true,useGraphics:true};
const templateBuilder=new TemplateBuilder({templateDir:template,buildDir:output,romTitle:'CANVAS SPRITE',romCode:'SPCV'});await templateBuilder.initializeBuildDirectory({projectDir:project,projectName:config.projectName,targetDir:output,romTitle:'CANVAS SPRITE',romCode:'SPCV'},{deferNativeFiles:true});
const builder=new ResourceBuilder(output,template);
let files=[
 builder.processResourceObject({_resourceType:'settings',id:'settings',startSceneId:'scene',startX:fractionalStartScenario?8.5:dropThroughScenario?3:8,startY:fractionalStartScenario?4.25:dropThroughScenario?6:4,startMoveSpeed:1,startAnimSpeed:6,startDirection:'down',colorMode:'mono',fadeDirection:1,playerSpriteId:'hero'}),
 builder.processResourceObject({_resourceType:'sprite',id:'hero',name:'hero',filename:'source.bmp',imageWidth:16,imageHeight:16,playerFrameWidth:16,playerFrameHeight:16,playerAnimSpeed:6,playerCanvasOriginX:0,playerCanvasOriginY:8,playerAnimationStripOrientation:'horizontal',playerAnimationStates:[{id:'main',type:'fixed-direction',animations:[{id:'idle',type:'idle',frames:[],canvasFrames:[{id:'red',width:16,height:16,pieces:[{id:'r',sourceX:0,sourceY:0,width:8,height:8,x:4,y:4,flipX:true}]},{id:'empty',width:16,height:16,pieces:[]},{id:'blue',width:16,height:16,pieces:[{id:'b',sourceX:8,sourceY:0,width:8,height:8,x:4,y:4,flipY:true}]}]}]}]}),
 builder.processResourceObject({_resourceType:'background',id:'ground',name:'ground',filename:'ground.bmp',imageWidth:bgWidth,imageHeight:bgHeight,autoColor:true,tileColors:'16'}),
 builder.processResourceObject({_resourceType:'scene',id:'scene',name:'scene',width:bgWidth,height:bgHeight,sceneType:'Top Down',backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],script:[{id:'fade',command:'EVENT_FADE_IN',args:{speed:1}}]})
];
if(cameraScopeScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 const destinations=["6b83edbf-4bc5-4dd2-98d8-738f5968d2b8", "040ab6ff-fee7-42ed-b12b-d4393216c5fc", "4f7019e0-5383-426a-bb11-5634e5432eca"],ids=["30ff504f-1f92-49c0-b630-68869e8d3ceb", "62d2f5ba-0355-4f31-ad8b-ec99576a31de", "11d6ca2f-48f0-432b-88f6-a8329345da55", "29ea3d7b-5f9d-401c-a467-19c20c10cc89", "4d09ebb4-bef7-4d1d-9966-c09995b09190", "37f2a0cf-761a-4af4-a762-51654fe152da", "d1c3508a-00ea-4523-9834-4c853365ed91", "4cd98b30-cca1-4fcf-835a-6b74cf034c3c", "c5974d72-96fe-4326-a372-810c1c4d38e7", "27fe9d28-7b5d-47ff-a403-5dc7c7185373", "94249294-9ade-41b6-83d8-a721e42ee209", "1168f27a-2670-403f-9362-b96c91c665e2", "9357e5d1-2e87-4955-b870-ecb0f319061a", "7d3fc131-ee18-4789-887d-01eac27f745d", "15ac75c0-4246-4a33-a793-c29a0ea42df2", "52aa6334-3387-43d4-9914-5ccb159b4adf"];
 let next=0;const event=(command,args)=>({id:ids[next++],version:1,command,args});
 const wait=()=>event('EVENT_WAIT',{units:'frames',frames:12});
 const follow=persistAcrossScenes=>event('EVENT_CAMERA_FOLLOW',{enabled:true,actorId:'__PLAYER__',clampToScene:false,lockX:true,lockY:false,deadZoneWidth:80,deadZoneHeight:40,persistAcrossScenes});
 const shake=()=>event('EVENT_CAMERA_SHAKE',{frames:120,amplitude:8,axis:'vertical',customShake:true});
 const change=sceneId=>event('EVENT_CHANGE_SCENE',{sceneId,x:8,y:4,direction:'down',fadeSpeed:1});
 scene.script=[...scene.script,follow(false),wait(),shake(),change(destinations[0])];
 const scripts=[
  [wait(),follow(true),wait(),shake(),change(destinations[1])],
  [wait(),cameraStopScenario?event('EVENT_CAMERA_STOP_FOLLOW',{}):follow(false),wait(),change(destinations[2])],
  [wait()],
 ];
 for(let index=0;index<3;++index)files.push(builder.processResourceObject({_resourceType:'scene',id:destinations[index],name:'Camera scope '+index,width:256,height:256,sceneType:'Top Down',cameraPosition:{x:24+index*16,y:16+index*8},backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],script:scripts[index]}));
}
if(followAxisScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 const ids=["c3deddf6-541b-4ce6-8567-78de0d1bdf21", "0ce7e211-57c4-4615-ac3e-cecac18d65a4", "9f40ab60-e919-4ee3-91f8-05097109a9e2", "c8e1399f-f073-4e12-936d-898d5f436dc0", "86193139-32af-4a39-9f2c-6616ec3db9c3", "198df6ae-67d7-4038-af29-e65ae7bb398c", "96ecfd3a-e021-4201-a8af-157f2bb4d92e", "ada2a4e0-93b7-4011-91d5-4ac02f4b547b", "6a887197-ad92-4d5d-b5fa-64318f0a3b61", "d6c3570d-5350-4431-98ff-d0c9ee035d5f", "204b8d62-c8b9-4e03-a6af-e5c3fc514c8a", "b64daa0e-ca56-4c60-ad31-7622544d0c93"];
 scene.script=[...scene.script,...[[true,false],[false,true],[true,true],[false,false]].flatMap(([lockX,lockY],index)=>[
  {id:ids[index*3],version:1,command:'EVENT_CAMERA_MOVE_TO',args:{x:40,y:60}},
  {id:ids[index*3+1],version:1,command:'EVENT_CAMERA_FOLLOW',args:{enabled:true,actorId:'__PLAYER__',clampToScene:false,deadZoneWidth:followActivationScenario?80:0,deadZoneHeight:followActivationScenario?40:0,lockX,lockY}},
  {id:ids[index*3+2],version:1,command:'EVENT_WAIT',args:{units:'frames',frames:6}},
 ])];
}
if(prefabScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 const spawn=index=>({id:'spawn-'+index,version:1,command:'EVENT_SPAWN_ACTOR',args:{source:'prefab',prefabId:'enemy',x:16+(index%8)*24,y:48+Math.floor(index%16/8)*32}});
 scene.script=[{id:'fade',command:'EVENT_FADE_IN',args:{speed:1}},...Array.from({length:18},(_,i)=>spawn(i)),{id:'wait-first',command:'EVENT_WAIT',args:{units:'frames',frames:90}},...Array.from({length:18},(_,i)=>spawn(i+18)),{id:'wait-second',command:'EVENT_WAIT',args:{units:'frames',frames:90}},{id:'finish',command:'EVENT_CHANGE_SCENE',args:{sceneId:'done',x:2,y:2,direction:'right',fadeSpeed:1}}];
 files.push({resourceName:'prefabs',resourceType:'gbasres',headerContent:Buffer.alloc(0),jsonContent:{_resourceType:'prefabs',prefabs:[{id:'enemy',name:'Enemy',type:'actor',actor:{spriteId:'hero',animationSpeed:3,onInitScript:[{id:'state',command:'EVENT_ACTOR_SET_STATE',args:{actorId:'__SELF__',stateId:'main'}},{id:'speed',command:'EVENT_SET_ANIMATION_SPEED',args:{actorId:'__SELF__',speed:0}}],onUpdateScript:[{id:'wait',command:'EVENT_WAIT',args:{units:'frames',frames:8}},{id:'remove',command:'EVENT_REMOVE_ACTOR',args:{actorId:'__SELF__'}}]}}]}});
 files.push(builder.processResourceObject({_resourceType:'scene',id:'done',name:'Done',width:256,height:256,sceneType:'Top Down',backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],script:[{id:'done-fade',command:'EVENT_FADE_IN',args:{speed:1}}]}));
 const {preparePrefabSpawns}=await import(pathToFileURL(path.join(dist,'PrefabSpawns.js')));preparePrefabSpawns(files);
}
if(tileScenario){const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.backgrounds[0].tileMapCellOverrides=[{index:130,tileIndex:0,horizontalFlip:false,verticalFlip:false,paletteId:0}];
 scene.tileAnimations=[{layerId:0,targetTileIndex:0,frameTileIndices:[1,2],durationFrames:60,loop:true,initialFrame:0}];
}
if(platformScenario){
 const sprite=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent;
 sprite.playerCollisionX=-4;sprite.playerCollisionY=-4;sprite.playerCollisionWidth=8;sprite.playerCollisionHeight=8;
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.width=160;scene.height=128;scene.sceneType='Platformer';
 scene.actors=[{id:'npc',spriteId:'hero',x:40,y:108,anchor:'center'}];
 scene.collisions=[{id:'floor',x:0,y:112,width:160,height:16,collisionSide:'solid'},{id:'ladder',x:32,y:40,width:16,height:72,collisionSide:'ladder'}];
 const report=id=>({id,command:'EVENT_PAN_CAMERA',args:{x:{kind:'property',actorId:'npc',property:'x'},y:{kind:'property',actorId:'npc',property:'y'}}});
 const move=(id,x,y)=>({id,command:'EVENT_MOVE_ACTOR',args:{actorId:'npc',x,y,xUnit:'pixels',yUnit:'pixels',animated:true,speed:1}});
 scene.script.push(move('up',40,44),report('report-up'),move('down',40,108),report('report-down'),
 {id:'jump-scene',command:'EVENT_CHANGE_SCENE',args:{sceneId:'jump-scene',x:2,y:6,direction:'right',fadeSpeed:1}});
 files.push(builder.processResourceObject({_resourceType:'scene',id:'jump-scene',name:'jump-scene',width:160,height:128,sceneType:'Platformer',backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],
 actors:[{id:'npc',spriteId:'hero',x:32,y:108,anchor:'center'}],collisions:[{id:'floor',x:0,y:112,width:160,height:16,collisionSide:'solid'},{id:'obstacle',x:64,y:88,width:8,height:24,collisionSide:'solid'}],
 script:[{id:'fade-jump',command:'EVENT_FADE_IN',args:{speed:1}},move('jump',112,108),report('report-jump')]}));
}
if(dropThroughScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.sceneType='Platformer';scene.collisions=[
  {id:'upper-platform',x:0,y:100,width:80,height:4,collisionSide:'top'},
  {id:'lower-platform',x:0,y:128,width:80,height:4,collisionSide:'top'},
 ];
}
if(actorScenario){
 const sprite=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent;
 sprite.playerCanvasOriginX=8;sprite.playerCanvasOriginY=8;sprite.playerCollisionX=-3;sprite.playerCollisionY=-2;sprite.playerCollisionWidth=6;sprite.playerCollisionHeight=5;
 sprite.playerAnimationStates=['main','other'].map(state=>({id:state,type:'fixed-direction',flipRightToCreateLeftFacingFrames:false,animations:[{id:'idle',type:'idle',canvasFrames:[{id:state,width:16,height:16,pieces:[
 {sourceX:0,sourceY:0,width:8,height:8,x:0,y:4,flipX:state==='other'},
 {sourceX:8,sourceY:0,width:8,height:8,x:8,y:4}]}]}]}));
 const settings=files.find(file=>file.jsonContent._resourceType==='settings').jsonContent;settings.startX=3;settings.startY=3;
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.actors=[{id:'npc',spriteId:'hero',x:80,y:80,anchor:'center'}];
 scene.collisions=[{id:'near-npc',x:96,y:72,width:8,height:24,collisionSide:'solid'}];
 scene.script.push({id:'state-input',command:'EVENT_WAIT_INPUT',args:{action:'confirm',timeoutFrames:0}},
 {id:'npc-state',command:'EVENT_ACTOR_SET_STATE',args:{actorId:'npc',stateId:'other'}},
 {id:'player-state',command:'EVENT_ACTOR_SET_STATE',args:{actorId:'__PLAYER__',stateId:'other'}},
 {id:'custom-body',command:'EVENT_MOVE_ACTOR',args:{actorId:'npc',x:92,y:80,xUnit:'pixels',yUnit:'pixels',animated:true,speed:2}});
}
if(offsetScenario){const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.width=512;scene.height=256;scene.backgrounds[0].x=17;scene.backgrounds[0].y=9;}
if(layerScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.gridSize=8;
 scene.backgrounds=[{layerId:0,x:0,y:0,selectedTilesetId:'matrix_tiles',tileMap:[[0]]},
 {layerId:1,x:32,y:0,selectedTilesetId:'auto-tile:matrix_auto',tileMap:[[0]]},
 {layerId:2,x:64,y:0,selectedTilesetId:'matrix_tiles',tileMap:[[0]],tilePaletteIds:[['matrix-green']]}];
 files.push(builder.processResourceObject({_resourceType:'palette',id:'matrix-green',colors:Array(16).fill('#00ff00')}));
}
if(bitmapScenario){
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.width=240;scene.height=160;scene.sceneType='Logo';scene.backgrounds=[{layerId:2,backgroundId:'ground',x:17,y:9}];
 scene.script.push({id:'confirm',command:'EVENT_WAIT_INPUT',args:{action:'confirm',timeoutFrames:0}},{id:'change',command:'EVENT_CHANGE_SCENE',args:{sceneId:'click-scene',x:0,y:0,direction:'right',fadeSpeed:1}});
 files.push(builder.processResourceObject({_resourceType:'background',id:'click-bg',name:'click-bg',filename:'click_bg.bmp',imageWidth:128,imageHeight:80}));
 files.push(builder.processResourceObject({_resourceType:'scene',id:'click-scene',name:'click-scene',width:240,height:160,sceneType:'Point Click',backgrounds:[{layerId:2,backgroundId:'click-bg',x:7,y:5}],script:[{id:'click-fade',command:'EVENT_FADE_IN',args:{speed:1}}]}));
}
if(process.argv.includes('--painted-map')) {
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.gridSize=8;scene.backgrounds[0].selectedTilesetId='painted_tiles';scene.backgrounds[0].tileMap=Array.from({length:32},()=>Array(32).fill(0));
}
if(dialogueScenario) {
 const settings=files.find(file=>file.jsonContent._resourceType==='settings').jsonContent;settings.font8x16Image='selected_font.bmp';
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.script.push(
  {id:'music',command:'EVENT_PLAY_MUSIC',args:{musicId:'cyberrid',volume:40}},
  {id:'persistent',command:'EVENT_DIALOGUE_SHOW',args:{text:'Persistent text',dialogueFont:'fixed8x16',showFrame:true,animate:false}},
  {id:'hud',command:'EVENT_UI_SET_TEXT',args:{text:'HUD READY',x:8,y:8,font:'fixed8x16'}},
  {id:'ui-motion',command:'EVENT_UI_ANIMATE',args:{uiId:'hud',animation:'move',x:32,y:8,speed:2}},
  {id:'hold',command:'EVENT_WAIT',args:{units:'frames',frames:12}},
  {id:'hide-hud',command:'EVENT_UI_HIDE',args:{uiId:'hud'}},
  {id:'show-hud',command:'EVENT_UI_SHOW',args:{uiId:'hud'}},
  {id:'close',command:'EVENT_DIALOGUE_CLOSE',args:{}},
  {id:'interactive',command:'EVENT_DISPLAY_DIALOGUE',args:{text:'Press A to continue',dialogueFont:'fixed8x16',showFrame:true,animate:false}},
  {id:'pause',command:'EVENT_MUSIC_PAUSE',args:{}},
  {id:'resume',command:'EVENT_MUSIC_RESUME',args:{}},
  {id:'fade-music',command:'EVENT_MUSIC_FADE',args:{targetVolume:20,durationFrames:8}},
  {id:'destroy-hud',command:'EVENT_UI_DESTROY',args:{uiId:'hud'}},
  {id:'stop',command:'EVENT_STOP_MUSIC',args:{}});
}
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
if(nearestScenario) {
 const sprite=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent;
 Object.assign(sprite,{playerCanvasOriginX:8,playerCanvasOriginY:8,playerCollisionX:-8,playerCollisionY:-8,playerCollisionWidth:16,playerCollisionHeight:16});
 const settings=files.find(file=>file.jsonContent._resourceType==='settings').jsonContent;settings.startX=14;settings.startY=10;
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;scene.width=256;scene.height=256;scene.sceneType='Platformer';
 scene.collisions=[{id:'floor',x:0,y:176,width:256,height:16,collisionSide:'solid'},{id:'right',x:248,y:96,width:8,height:80,collisionSide:'solid'},{id:'sealed',x:128,y:0,width:16,height:176,collisionSide:'solid'}];
 scene.actors=[{id:'door',name:'a_door',spriteId:'hero',x:240,y:172,anchor:'center',direction:'right'}];
 const property=(actorId,property)=>({kind:'property',actorId,property});
 const report=id=>({id,command:'EVENT_PAN_CAMERA',args:{x:property('__PLAYER__','x'),y:property('__PLAYER__','y')}});
 scene.script.push({id:'door-move',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:property('door','x'),y:property('door','y'),xUnit:'tiles',yUnit:'tiles',animated:true,speed:1}},report('door-arrival'),
 {id:'sealed-move',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',x:64,y:168,xUnit:'pixels',yUnit:'pixels',animated:true,speed:1}},report('nearest-arrival'));
}
if(movementOptionsScenario) {
 const sprite=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent;
 Object.assign(sprite,{playerCanvasOriginX:8,playerCanvasOriginY:8,playerCollisionX:-8,playerCollisionY:-8,playerCollisionWidth:16,playerCollisionHeight:16});
 const settings=files.find(file=>file.jsonContent._resourceType==='settings').jsonContent;settings.startX=2;settings.startY=4;
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.collisions=[{id:'wall',x:80,y:48,width:8,height:32,collisionSide:'solid'}];
 scene.actors=[{id:'blocker',name:'Blocker',spriteId:'hero',x:96,y:64,anchor:'center',direction:'right'}];
 const property=property=>({kind:'property',actorId:'__PLAYER__',property});
 const report=id=>({id,command:'EVENT_PAN_CAMERA',args:{x:property('x'),y:property('y')}});
 const move=(id,x,y,patch={})=>({id,command:'EVENT_ACTOR_MOVE_TO',args:{actorId:'__PLAYER__',x,y,xUnit:'pixels',yUnit:'pixels',animated:true,speed:1,collideWalls:false,collideActors:false,...patch}});
 const reset=id=>({id,command:'EVENT_ACTOR_SET_POSITION',args:{actorId:'__PLAYER__',x:32,y:64}});
 scene.script.push({id:'pixel-properties',command:'EVENT_PAN_CAMERA',args:{x:property('xPixels'),y:property('yPixels')}},
 {id:'tile-properties',command:'EVENT_PAN_CAMERA',args:{x:property('xTiles'),y:property('yTiles')}},
 move('horizontal-first',48,80,{movementType:'horizontal-first'}),report('report-horizontal'),reset('reset-h'),
 move('vertical-first',48,80,{movementType:'vertical-first'}),report('report-vertical'),reset('reset-v'),
 move('diagonal',48,80,{movementType:'diagonal'}),report('report-diagonal'),
 move('lock-h',64,96,{lockDirection:'horizontal'}),report('report-h'),move('lock-v',128,96,{lockDirection:'vertical'}),report('report-v'),
 move('no-collisions',112,64),report('report-free'),move('actor-collision',{kind:'property',actorId:'blocker',property:'xPixels'},{kind:'property',actorId:'blocker',property:'yTiles'},{collideActors:true,yUnit:'tiles'}),report('report-actor'),
 move('wall-collision',84,64,{collideWalls:true}),report('report-wall'),
 move('approach-both',64,96),move('both-collisions',112,64,{collideWalls:true,collideActors:true}),report('report-both'));
}
if(gameSaveScenario) {
 files.push(builder.processResourceObject({_resourceType:'variables',id:'variables',variables:['coins','callback','done','booted'].map(id=>({id,name:id,symbol:id.toUpperCase(),type:'number',initialValue:0}))}));
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 scene.actors=[{id:'door',spriteId:'hero',x:96,y:112,anchor:'center',direction:'right'}];
 const set=(id,value)=>({id:'set-'+id+'-'+value,command:'EVENT_VARIABLE',args:{variableId:id,value:{kind:'literal',type:'number',value}}});
 const report=id=>({id,command:'EVENT_PAN_CAMERA',args:{x:{kind:'variable',variableId:'callback'},y:{kind:'variable',variableId:'coins'}}});
 scene.script.push(set('coins',50),{id:'player-save-position',command:'EVENT_ACTOR_SET_POSITION',args:{actorId:'__PLAYER__',x:64,y:80}},
 {id:'door-frame',command:'EVENT_ACTOR_SET_ANIMATION',args:{actorId:'door',action:'frame',stateId:'main',animationId:'idle',frame:2,speed:6}},
 {id:'hide-door',command:'EVENT_HIDE_ACTOR',args:{actorId:'door'}},{id:'save-camera',command:'EVENT_PAN_CAMERA',args:{x:7,y:9}},
 {id:'37de40da-5bde-4976-8b68-d034df38c31e',command:'EVENT_VARIABLES_SAVE',args:{slot:7,allVariables:false,variableIds:['coins']}},
 {id:'checkpoint',command:'EVENT_SAVE_WRITE',args:{slot:0},children:{then:[set('callback',2),{id:'save-wait',command:'EVENT_WAIT',args:{units:'frames',frames:2}}],else:[set('callback',99)]}},
 report('report-save'),{id:'go-menu',command:'EVENT_CHANGE_SCENE',args:{sceneId:'menu',x:200,y:120,direction:'right',fadeSpeed:1,xUnit:'pixels',yUnit:'pixels'}});
 files.push(builder.processResourceObject({_resourceType:'scene',id:'menu',name:'Menu',width:256,height:256,sceneType:'Top Down',backgrounds:[{layerId:0,backgroundId:'ground',x:0,y:0}],script:[
 {id:'menu-fade',command:'EVENT_FADE_IN',args:{speed:1}},set('coins',99),{id:'3cf90cb7-7f40-42cc-9b53-f5f4183a2dbd',command:'EVENT_VARIABLES_LOAD',args:{slot:7,allVariables:false,variableIds:['coins']}},report('baab2dcd-24dd-44df-9d71-8a2569f6232f'),set('coins',99),{id:'load-checkpoint',command:'EVENT_SAVE_LOAD',args:{slot:0},children:{then:[set('callback',3),{id:'load-wait',command:'EVENT_WAIT',args:{units:'frames',frames:3}},{id:'show-door',command:'EVENT_SHOW_ACTOR',args:{actorId:'door'}}]}},
 report('report-restored'),{id:'run-on-load',command:'EVENT_SAVE_ON_LOAD',args:{}},report('report-loaded'),
 {id:'remove-checkpoint',command:'EVENT_SAVE_REMOVE',args:{slot:0}},set('done',1),
 {id:'save-final',command:'EVENT_SAVE_WRITE',args:{slot:7},children:{then:[],else:[{id:'boot-fade',command:'EVENT_FADE_IN',args:{speed:1}},set('booted',1),report('report-boot')]}},
 {id:'report-done',command:'EVENT_PAN_CAMERA',args:{x:{kind:'variable',variableId:'done'},y:{kind:'variable',variableId:'booted'}}},
 ]}));
}
if(localScenario) {
 const scene=files.find(file=>file.jsonContent._resourceType==='scene').jsonContent;
 const set=value=>({id:crypto.randomUUID(),version:1,command:'EVENT_VARIABLE',args:{variableId:'__LOCAL__:A',value:{kind:'literal',type:'number',value}}});
 const wait=frames=>({id:crypto.randomUUID(),version:1,command:'EVENT_WAIT',args:{units:'frames',frames}});
 const report=()=>({id:crypto.randomUUID(),version:1,command:'EVENT_PAN_CAMERA',args:{x:{kind:'variable',variableId:'__LOCAL__:A'},y:0}});
 scene.actors=[{id:crypto.randomUUID(),spriteId:'hero',x:80,y:60,anchor:'center',direction:'right',onInitScript:[set(13),wait(3),report(),{id:crypto.randomUUID(),version:1,command:'EVENT_LOCAL_VARIABLE_RESET',args:{}},report()]},
 {id:crypto.randomUUID(),spriteId:'hero',x:112,y:60,anchor:'center',direction:'left',onInitScript:[set(29),wait(9),report()]}];
 scene.triggers=[{id:crypto.randomUUID(),x:0,y:0,width:240,height:160,activation:'enter',enabled:true,once:true,onEnterScript:[set(41),wait(6),report()]}];
}
const assetBuilder=new AssetBuilder(path.join(root,'dist'),output,path.join(root,'bin/image-magick/magick.exe'));
await assetBuilder.copyAssets(assets,files,{preserveStructure:false});
if(dialogueScenario) {
 await assetBuilder.prepareUiDefaults(assets,[path.join(root,'templateEngineGame/sample_project_example/assets/ui')]);
 await assetBuilder.applyFontOverrides(assets,files.find(file=>file.jsonContent._resourceType==='settings').jsonContent);
 await assetBuilder.materializeDialogueFrame();
}
const derived=await assetBuilder.materializeTileLayerEdits(files);
const preparedSprite=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent.__spriteCanvas;
const preparedFrameCount=(preparedSprite.width/preparedSprite.frameWidth)*(preparedSprite.height/preparedSprite.frameHeight);
if(layerScenario)assert.equal(derived.length,3,'Each edited layer must produce its own prepared background');
for(const resource of derived)files.push({resourceName:'derived',resourceType:'gbasres',headerContent:Buffer.alloc(0),jsonContent:resource});
if(process.argv.includes('--painted-map'))assert.equal(derived.length,1,'Painted layer must become a real background');
const runtimeResources=files.map(file=>toRuntimeResource(file.jsonContent)).filter(Boolean);validateRuntimeReferences(runtimeResources);
if(actorScenario){const sprite=runtimeResources.find(resource=>resource._resourceType==='sprite');assert.deepEqual([sprite.playerCanvasOriginX,sprite.playerCanvasOriginY,sprite.playerCollisionX,sprite.playerCollisionY,sprite.playerCollisionWidth,sprite.playerCollisionHeight],[8,8,-3,-2,6,5]);assert.equal(sprite.animations.length,2);}
if(offsetScenario){const scene=runtimeResources.find(resource=>resource._resourceType==='scene');const background=runtimeResources.find(resource=>resource._resourceType==='background');assert.deepEqual([scene.width,scene.height,scene.backgrounds[0].x,scene.backgrounds[0].y,background.imageWidth,background.imageHeight],[512,256,17,9,256,256]);}
const selection=selectNativeRuntime(createRuntimeFeatureManifest(runtimeResources,process.argv.includes('--full')?'full':'selective'));templateBuilder.copyNativeRuntime(selection.manifest,selection.featureHeader);
fs.writeFileSync(path.join(output,'runtime-feature-manifest.json'),JSON.stringify(selection.manifest,null,2));
files=runtimeResources.map(resource=>builder.processRuntimeResource(resource));const baked=files.find(file=>file.jsonContent._resourceType==='sprite').jsonContent.__spriteCanvas;
const names=[`bn_sprite_items_${baked.graphicsName}.h`,bitmapScenario?'bn_direct_bitmap_items_ground.h':'bn_regular_bg_items_ground.h',...(bitmapScenario?['bn_direct_bitmap_items_click_bg.h']:[]),...(dialogueScenario?['bn_sprite_items_cursor.h','bn_sprite_items_frame.h','bn_sprite_items_dialogue_frame_sprite.h']:[]),...derived.map(resource=>`bn_regular_bg_items_${resource.filename.replace(/\.bmp$/,'')}.h`)];await new CppBuilder(output,template,names).generateProjectStructure(config,selection.manifest.sourceFiles);await builder.writeResourceHeader(files);await builder.generateResourceRegistryClass(files,config);fs.writeFileSync(path.join(output,'include/graphics_items.h'),'#ifndef GENERATED_GRAPHICS_H\n#define GENERATED_GRAPHICS_H\n'+names.map(name=>`#include "${name}"`).join('\n')+'\n#endif\n');
if(prefabScenario){
 const file=path.join(output,'src/graphics_manager.cpp');let graphics=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 graphics=graphics.replace('    ++actor_count;','    ++actor_count;\n    BN_LOG("[PREFAB_CREATED]",from_prefab,",",actor_count,",",x);');
 graphics=graphics.replace('            --actor_count;','            --actor_count;\n            BN_LOG("[PREFAB_REMOVED]",actor_count);');
 graphics=graphics.replace('        actor_initialization[index] = 2;','        actor_initialization[index] = 2;\n        BN_LOG("[PREFAB_INITIALIZED]",actor.id);');
 graphics=graphics.replace('    setScene(scene);','    setScene(scene);\n    BN_LOG("[PREFAB_STAGE]",scene->id);');fs.writeFileSync(file,graphics);
}
if(process.argv.includes('--numeric-values')||process.argv.includes('--motion')||platformScenario||nearestScenario||movementOptionsScenario||gameSaveScenario||localScenario) {
 // Trace only the verification ROM, leaving production gameplay logging unchanged.
 const runtime=path.join(output,'src/numeric_values.cpp');
 let source=fs.readFileSync(runtime,'utf8').replace('return VariableManager::instance().get_number(id);','{ const int value=VariableManager::instance().get_number(id); BN_LOG("[NUMERIC_TEST:VARIABLE]",value); return value; }').replace('return VariableManager::instance().get_boolean(id) ? 1 : 0;', '{ const int value=VariableManager::instance().get_boolean(id) ? 1 : 0; BN_LOG("[NUMERIC_TEST:BOOLEAN]",value); return value; }').replace('return GraphicsManager::instance().read_numeric_actor_property(id, property);','const int value=GraphicsManager::instance().read_numeric_actor_property(id, property); BN_LOG("[NUMERIC_TEST:PROPERTY]",value); return value;').replace('case 0: return graphics.get_camera_x();','case 0: BN_LOG("[NUMERIC_TEST:CAMERA]",graphics.get_camera_x()); return graphics.get_camera_x();');
 fs.writeFileSync(runtime,source);
}
assert.ok(!fs.existsSync(path.join(output,'graphics/source.bmp')));
if(gameSaveScenario) {
 const gameFile=path.join(output,'src/game.cpp');let game=fs.readFileSync(gameFile,'utf8');
 const initialization='    initialize_variables();';assert.ok(game.includes(initialization));
 game=game.replace(initialization,initialization+'\n    if(SaveManager::instance().has_game(7)) { static const GameDataEventData load{7,0}; static const ScriptCommandData boot[]={{"EVENT_SAVE_LOAD",&load,-1,-1,-1}}; ScriptCommand::instance().execute("save-test-boot",boot,1); BN_LOG("[GAME_SAVE_BOOT]"); }');fs.writeFileSync(gameFile,game);
 const file=path.join(output,'src/save_game.cpp');let saved=fs.readFileSync(file,'utf8');
 saved='#include "bn_log.h"\n'+saved;
 saved=saved.replace('loaded_self_actor = loaded.header.self_actor; last_operation = 2; return true;','loaded_self_actor = loaded.header.self_actor; last_operation = 2; GameWorldState observed; game_hooks.capture(observed); BN_LOG("[GAME_SAVE_WORLD]",observed.actors_count,",",observed.actors[0].x,",",observed.actors[0].y,",",observed.actors[1].x,",",observed.actors[1].y,",",observed.actors[1].visible,",",observed.actors[1].frame,",",observed.camera_x,",",observed.camera_y); return true;');
 saved=saved.replace('last_operation = 3; loaded_save_point = 0; return true;','last_operation = 3; loaded_save_point = 0; BN_LOG("[GAME_SAVE_REMOVED]",slot,",",has_game(slot)); return true;');fs.writeFileSync(file,saved);
}
if(movementOptionsScenario) {
 const file=path.join(output,'src/actor_motion_manager.cpp');let source=fs.readFileSync(file,'utf8');
 const start='job->path_size = -1; job->frame = job->searches = 0; owner.active = true;';assert.ok(source.includes(start));
 source=source.replace(start,start+'\n        BN_LOG("[MOVE_OPTIONS_BEGIN]",data.movement_type,",",data.lock_axis,",",data.collide_walls,",",data.collide_actors);');
 const step='if(!graphics.apply_script_actor_state(job->actor_id, job->state, next_action.action))';assert.ok(source.includes(step));
 source=source.replace(step,'BN_LOG("[MOVE_OPTIONS_STEP]",job->state.x,",",job->state.y);\n    '+step);fs.writeFileSync(file,source);
}
if(dialogueScenario) {
 const runtime=path.join(output,'src/script_command_manager.cpp');let source=fs.readFileSync(runtime,'utf8');
 source='#include "audio_manager.h"\n'+source;
 const start='const bn::string<64> command = current.command ? current.command : "";';
 assert.ok(source.includes(start));source=source.replace(start,start+'\n    static int last_scenario_index=-1; if(last_scenario_index!=instance.current_index){ last_scenario_index=instance.current_index; BN_LOG("[SCENARIO_BEGIN]",command.data()); }');
 const end='if(finished || !handled)\n    {';assert.ok(source.includes(end));source=source.replace(end,end+'\n        BN_LOG("[SCENARIO_DONE]",command.data(),",music=",AudioManager::instance().is_playing());');
 fs.writeFileSync(runtime,source);
 const graphicsPath=path.join(output,'src/graphics_manager.cpp');let graphics=fs.readFileSync(graphicsPath,'utf8').replaceAll('\r\n','\n');
 const createFrame='return item->create_sprite(x, y, frame);';assert.ok(graphics.includes(createFrame));
 graphics=graphics.replace(createFrame,'BN_LOG("[SCENARIO_FRAME]",graphics_name,",frame=",frame); '+createFrame);fs.writeFileSync(graphicsPath,graphics);
}
if(platformScenario){
 const graphicsPath=path.join(output,'src/graphics_manager.cpp');let graphics=fs.readFileSync(graphicsPath,'utf8');
 const anchor='bool GraphicsManager::apply_script_actor_state(const char* actor_id, const actor_motion::State& state, actor_motion::Action action)\n{';
 assert.ok(graphics.includes(anchor));graphics=graphics.replace(anchor,anchor+'\n    BN_LOG("[PLATFORM_STEP]",state.x,",",state.y,",",state.climbing,",",state.velocity_q8);');fs.writeFileSync(graphicsPath,graphics);
}
if(dropThroughScenario){
 const graphicsPath=path.join(output,'src/graphics_manager.cpp');let graphics=fs.readFileSync(graphicsPath,'utf8').replaceAll('\r\n','\n');
 const start='void GraphicsManager::move_player_from_input()\n{';assert.ok(graphics.includes(start));
 graphics=graphics.replace(start,start+'\n    static bool drop_test_trace=false; if(InputManager::instance().pressed("move_down")) drop_test_trace=true;');
 const end='sprites[player_slot]->set_position(player_world_x - camera_x - 120 + offset_x, player_world_y - camera_y - 80 + offset_y);';
 const movementStart=graphics.indexOf(start),movementEnd=graphics.indexOf(end,movementStart);assert.ok(movementEnd>=0);
 graphics=graphics.slice(0,movementEnd)+end+'\n    if(drop_test_trace) { BN_LOG("[DROP_TEST]",player_world_y,",",player_grounded,",",player_drop_through_active,",",player_vertical_velocity_q8); if(player_grounded && player_world_y > 96) drop_test_trace=false; }'+graphics.slice(movementEnd+end.length);
 fs.writeFileSync(graphicsPath,graphics);
}
if(cameraScopeScenario){
 const cameraPath=path.join(output,'src/camera_manager.cpp');let camera=fs.readFileSync(cameraPath,'utf8').replaceAll('\r\n','\n');
 const anchor='    int render_x = x;';assert.ok(camera.includes(anchor));
 camera='#include "bn_log.h"\n'+camera.replace(anchor,'    if(const auto* scene = GraphicsManager::instance().getScene()) { BN_LOG("[SCENARIO_CAMERA_SCOPE]",scene->id,",",int(follow_player),",",x,",",y); }\n'+anchor);
 fs.writeFileSync(cameraPath,camera);
}
if(followAxisScenario){
 const cameraPath=path.join(output,'src/camera_manager.cpp');let camera=fs.readFileSync(cameraPath,'utf8').replaceAll('\r\n','\n');
 const anchor='    int render_x = x;';assert.ok(camera.includes(anchor));
 camera='#include "bn_log.h"\n'+camera.replace(anchor,'    if(follow_player) { BN_LOG("[SCENARIO_FOLLOW_LOCK]",int(lock_x),",",int(lock_y),",",x,",",y); }\n'+anchor);
 fs.writeFileSync(cameraPath,camera);
 if(followActivationScenario){
  // Simulate a scene viewport changed directly before Follow activates.
  const handlerPath=path.join(output,'src/script_event_handlers.cpp');let handler=fs.readFileSync(handlerPath,'utf8').replaceAll('\r\n','\n');
  const follow='bool CameraEventHandler::follow(const CameraFollowEventData& data)\n{';assert.ok(handler.includes(follow));
  handler=handler.replace(follow,follow+'\n    GraphicsManager::instance().set_camera_position(60,70);');fs.writeFileSync(handlerPath,handler);
 }

}
if(fractionalStartScenario){
 const graphicsPath=path.join(output,'src/graphics_manager.cpp');let graphics=fs.readFileSync(graphicsPath,'utf8').replaceAll('\r\n','\n');
 const anchor='    player_vertical_velocity_q8 = 0;';assert.ok(graphics.includes(anchor));
 graphics=graphics.replace(anchor,'    BN_LOG("[SCENARIO_START]", player_world_x, ",", player_world_y);\n'+anchor);
 fs.writeFileSync(graphicsPath,graphics);
}
if(process.argv.includes('--build')){
 const devkit=process.env.DEVKITPRO,arm=process.env.DEVKITARM||path.join(devkit,'devkitARM');assert.ok(devkit);const env={...process.env};const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';env[key]=[path.join(devkit,'msys2/usr/bin'),path.join(devkit,'tools/bin'),path.join(arm,'bin'),env[key]].join(path.delimiter);env.DEVKITPRO=devkit.replaceAll('\\','/');env.DEVKITARM=arm.replaceAll('\\','/');env.BUTANO=path.join(root,'tools/butano').replaceAll('\\','/');
 const result=spawnSync(path.join(devkit,'msys2/usr/bin/make.exe'),['-j2'],{cwd:output,env,stdio:'inherit',windowsHide:true});assert.equal(result.status,0,result.error?.message??'Sprite canvas ROM build failed');
 const memory=inspectGbaMemory(path.join(output,config.projectName+'.elf'));console.log(formatGbaMemoryReport(memory));assert.equal(memory.errors.length,0);memoryEvidence={regions:memory.regions,singletons:memory.singletons};
 const header=fs.readFileSync(path.join(output,'build',names[0]),'utf8');assert.match(header,new RegExp(`, ${preparedFrameCount}\\)`),'Butano must expose every prepared animation frame');console.log('Generated sprite canvas ROM passed.');
}
console.log('SPRITE_CANVAS_ROM='+path.join(output,config.projectName+'.gba'));

if(process.argv.includes('--emulate')) {
 const run=spawnSync(process.execPath,[path.join(root,'tests/runtime-monitor-emulator.mjs'),path.join(output,config.projectName+'.gba'),...(fractionalStartScenario?['--fractional-start']:[]),...(followAxisScenario?['--follow-axis-locks']:[]),...(followActivationScenario?['--follow-activation']:[]),...(cameraScopeScenario?['--camera-scene-scope']:[]),...(cameraStopScenario?['--camera-stop-follow']:[]),...(process.argv.includes('--numeric-values')?['--numeric-values']:[]),...(process.argv.includes('--actor-move')?['--actor-move']:[]),...(process.argv.includes('--motion')?['--motion']:[]),...(nearestScenario?['--nearest-motion']:[]),...(movementOptionsScenario?['--movement-options']:[]),...(gameSaveScenario?['--game-save']:[]),...(localScenario?['--local-variables']:[]),...(process.argv.includes('--painted-map')?['--painted-map']:[]),...(offsetScenario?['--offset-background']:[]),...(bitmapScenario?['--bitmap-scenes']:[]),...(layerScenario?['--layer-matrix']:[]),...(actorScenario?['--actor-states']:[]),...(platformScenario?['--platform-paths']:[]),...(dropThroughScenario?['--drop-through-platform']:[]),...(tileScenario?['--dynamic-tiles']:[]),...(prefabScenario?['--prefab-spawn']:[]),...(dialogueScenario?['--dialogue-ui-audio',...(reportPath?['--scenario-report',path.join(temp,'scenario.json')]:[])]:[])],{cwd:root,stdio:'inherit',windowsHide:true});
 assert.equal(run.status,0,'Real emulator verification failed');
 emulatorPassed=true;
}
if(reportPath){fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify({mode:selection.manifest.mode,
 scenario:prefabScenario?'prefab-spawn':dialogueScenario?'dialogue-ui-audio':process.argv.includes('--painted-map')?'painted-map':'sprite-canvas',memory:memoryEvidence,emulatorPassed,
 romBytes:fs.statSync(path.join(output,config.projectName+'.gba')).size,elfBytes:fs.statSync(path.join(output,config.projectName+'.elf')).size,
 behavior:dialogueScenario&&emulatorPassed?JSON.parse(fs.readFileSync(path.join(temp,'scenario.json'),'utf8')):undefined},null,2)+'\n');}
} finally {
 if(!process.argv.includes('--keep')) {
  const resolved=path.resolve(temp),expectedRoot=path.resolve(os.tmpdir())+path.sep;
  assert.ok(resolved.startsWith(expectedRoot)&&path.basename(resolved).startsWith('gba-studio-sprite-rom-'),'Unexpected temporary verification directory');
  fs.rmSync(resolved,{recursive:true,force:true});
  console.log('Temporary ROM verification directory removed.');
 }
}
