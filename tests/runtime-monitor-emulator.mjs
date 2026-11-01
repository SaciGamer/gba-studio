import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron } from '@playwright/test';
const rom = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2] && fs.existsSync(rom), 'Pass a monitoring-enabled .gba ROM');
const root = path.resolve('.'), frontend = path.join(root, 'src/renderer/frontend/src');
const checkHud = process.argv.includes('--hud');
const bundle = await build({ stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ConfigProvider } from 'antd'; import { I18nProvider } from './i18n/I18n'; import RuntimeMonitor from './components/pages/emulator/RuntimeMonitor'; import Emulator from './components/pages/emulator/Emulator'; const monitor = location.hash.includes('runtime-monitor'); createRoot(document.getElementById('root')).render(<ConfigProvider><I18nProvider language="pt_BR">{monitor ? <RuntimeMonitor/> : <Emulator/>}</I18nProvider></ConfigProvider>);`, resolveDir: frontend, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-origin', setup(bundler) { bundler.onLoad({ filter: /pages[\\/]emulator[\\/]Emulator\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replaceAll('http://localhost:3000', ''), loader: 'tsx', resolveDir: path.dirname(args.path) })); } }] });
const serverApp = express();
serverApp.use('/emulatorjs-data', express.static(path.join(root, 'src/renderer/frontend/public/emulatorjs/data')));
serverApp.get('/game.gba', (_, response) => response.sendFile(rom));
serverApp.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
serverApp.get('/', (_, response) => response.type('html').send(`<!doctype html><html><meta charset="utf-8"><style>html,body,#root{height:100%;width:100%}</style><body style="margin:0;background:#202020"><div id="root"></div><script>window.metrics=[];window.addEventListener('gba-studio:runtime-monitor',e=>window.metrics.push(e.detail));if(!location.hash.includes('runtime-monitor'))localStorage.setItem('appSettings',JSON.stringify({demoShowMenu:!location.hash.includes('hide-menu'),demoShowFPS:${checkHud},demoShowCPU:${checkHud}&&!location.hash.includes('hide-menu')}));</script><script src="/app.js"></script></body></html>`));
const server = await new Promise(resolve => { const listener = serverApp.listen(0, '127.0.0.1', () => resolve(listener)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-monitor-window-'));
const harness = path.join(temp, 'main.cjs');
fs.writeFileSync(harness, `const {app,BrowserWindow,ipcMain}=require('electron');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const {RuntimeMonitorWindow,registerRuntimeMonitorIpc}=await import(${JSON.stringify(pathToFileURL(path.join(root,'dist/main/managers/RuntimeMonitorWindow.js')).href)});
 global.owner = new BrowserWindow({width:720,height:480,show:false,webPreferences:{preload:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},nodeIntegration:false,contextIsolation:true,webSecurity:false,backgroundThrottling:false,offscreen:true}});
 global.manager=new RuntimeMonitorWindow({preloadPath:${JSON.stringify(path.join(root,'dist/main/preload/preload.js'))},iconPath:${JSON.stringify(path.join(root,'icon/defaultImgIcon.png'))},rendererUrl:${JSON.stringify(origin+'/#/runtime-monitor')},onWindowChange:win=>{global.monitor=win;}});
 global.manager.attach(global.owner);registerRuntimeMonitorIpc(ipcMain,global.manager);
 await global.owner.loadURL(${JSON.stringify(origin+'/#/emulator?rom='+encodeURIComponent(origin+'/game.gba'))});
});`);
let electronApp;
const logs = [];
const numericMessages = [];
const scenarioMessages = [];
const platformMessages = [];
const dropMessages = [];
const movementOptionsMessages = [];
const gameSaveMessages = [];
const prefabMessages = [];
const visualMessages = [];
const backgroundAnimationMessages = [];
const inputPerformanceMessages = [];
let scenarioEvidence;
try {
 electronApp = await electron.launch({args:[harness]});
 const emulator = await electronApp.firstWindow();
 emulator.on('console', message=>{logs.push(message.text());if(message.text().includes('[BACKGROUND_ANIMATION_OK]'))backgroundAnimationMessages.push(message.text());if(message.text().includes('[VISUAL_SMOKE_OK]'))visualMessages.push(message.text());if(message.text().includes('[PREFAB_'))prefabMessages.push(message.text());if(message.text().includes('[NUMERIC_TEST:'))numericMessages.push(message.text());if(message.text().includes('[SCENARIO_'))scenarioMessages.push(message.text());if(message.text().includes('[PLATFORM_STEP]'))platformMessages.push(message.text());if(message.text().includes('[DROP_TEST]'))dropMessages.push(message.text());if(message.text().includes('[MOVE_OPTIONS_'))movementOptionsMessages.push(message.text());if(message.text().includes('[GAME_SAVE_'))gameSaveMessages.push(message.text());if(logs.length>25)logs.shift();});
 emulator.on('pageerror', error=>logs.push(error.message));
 emulator.on('console', message=>{if(message.text().includes('[INPUT_PERFORMANCE]'))inputPerformanceMessages.push(message.text());});
 const audioCaptureRequested=process.argv.includes('--music-audio')||process.argv.includes('--sfx-audio');
 if(audioCaptureRequested) {
  const gameReadyDeadline=Date.now()+45000;
  while(!logs.some(line=>line.includes('Game RUN'))&&Date.now()<gameReadyDeadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(logs.some(line=>line.includes('Game RUN')),'The GBA game must finish startup before audio capture begins');
  await emulator.waitForFunction(()=>{
  const audio=window.EJS_emulator?.Module?.AL?.currentCtx;
  return Boolean(audio?.audioCtx&&Object.values(audio.sources??{}).some(source=>source?.gain&&typeof source.gain.connect==='function'));
  },null,{timeout:45000});
 }
 else await emulator.waitForFunction(()=>window.metrics.length>=2,null,{timeout:45000});
 if(audioCaptureRequested) {
  const tap=await emulator.evaluate(()=>{
   const audio=window.EJS_emulator?.Module?.AL?.currentCtx;
   if(!audio?.audioCtx)return null;
   const context=audio.audioCtx;
   const sources=Object.values(audio.sources??{}).filter(source=>source?.gain&&typeof source.gain.connect==='function');
   if(!sources.length)return null;
   const processors=[],silentGains=[];
   const capture={sampleRate:context.sampleRate,samples:0,leftSquares:0,rightSquares:0,squareSum:0,peak:0};
   for(const source of sources){
    const processor=context.createScriptProcessor(2048,2,2),silentGain=context.createGain();
    silentGain.gain.value=0;
    processor.onaudioprocess=event=>{
     const left=event.inputBuffer.getChannelData(0);
     const right=event.inputBuffer.numberOfChannels>1?event.inputBuffer.getChannelData(1):left;
     for(let index=0;index<left.length;index++){
      const a=left[index],b=right[index];capture.leftSquares+=a*a;capture.rightSquares+=b*b;capture.squareSum+=a*a+b*b;capture.peak=Math.max(capture.peak,Math.abs(a),Math.abs(b));
     }
     capture.samples+=left.length*2;
    };
    source.gain.connect(processor);processor.connect(silentGain);silentGain.connect(context.destination);
    processors.push(processor);silentGains.push(silentGain);
   }
   window.__musicSceneAudioCapture={capture,processors,silentGains};
   return {sources:sources.length,sampleRate:context.sampleRate,contextState:context.state,volume:window.EJS_emulator?.volume,muted:window.EJS_emulator?.muted};
  });
  assert.ok(tap?.sources,'The game scene must expose an active Maxmod OpenAL source');
  await emulator.waitForFunction(()=>window.metrics.length>=2,null,{timeout:45000});
  await emulator.waitForTimeout(process.argv.includes('--sfx-audio')?4000:2500);
  const audio=await emulator.evaluate(()=>{
   const capture=window.__musicSceneAudioCapture;
   if(!capture)return null;
   for(const processor of capture.processors)processor.disconnect();
   for(const gain of capture.silentGains)gain.disconnect();
   const {sampleRate,samples,leftSquares,rightSquares,squareSum,peak}=capture.capture;
   window.__musicSceneAudioCapture=undefined;
   const channelSamples=samples/2;
   return {sampleRate,samples,durationSeconds:channelSamples/sampleRate,rms:Math.sqrt(squareSum/Math.max(1,samples)),leftRms:Math.sqrt(leftSquares/Math.max(1,channelSamples)),rightRms:Math.sqrt(rightSquares/Math.max(1,channelSamples)),peak};
  });
  const audioDescription=process.argv.includes('--sfx-audio')?'EVENT_PLAY_SOUND editor WAV':'EVENT_PLAY_MUSIC in game scene';
  console.log(audioDescription+' Maxmod audio capture: '+JSON.stringify({tap,...audio}));
  assert.ok(audio?.durationSeconds>=1,'Capture at least one second of game-scene audio');
  assert.ok(audio.rms>0.0001,`${audioDescription} must produce PCM output`);
  assert.ok(audio.peak>0.001,`${audioDescription} must not be digital silence`);
 }
 if(process.argv.includes('--default-palettes')) {
  const deadline = Date.now() + 30000;
  while(!scenarioMessages.some(message => message.includes('[SCENARIO_PALETTES]1')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(scenarioMessages.some(message => message.includes('[SCENARIO_PALETTES]0')), 'Both backgrounds must use the replacement palette while the identical palette in slot 1 stays unchanged');
  assert.ok(scenarioMessages.some(message => message.includes('[SCENARIO_PALETTES]1')), 'Empty event fields must restore both backgrounds to Settings defaults');
  console.log('Default palette slot propagation and restore passed in the GBA emulator.');
 }
 if(process.argv.includes('--local-variables')) {
  const deadline=Date.now()+25000;
  while(numericMessages.filter(message=>message.includes('[NUMERIC_TEST:VARIABLE]')).length<4&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const values=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:VARIABLE\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(values.sort((a,b)=>a-b),[0,13,29,41],'Actors and trigger retain separate locals across waits; reset clears only its owner');
  console.log('Real mGBA locals passed: independent actors and trigger, WAIT persistence and owner-only reset.');
 }
 if(process.argv.includes('--game-save')) {
  const deadline=Date.now()+25000;
  while(numericMessages.filter(message=>message.includes('[NUMERIC_TEST:VARIABLE]')).length<10&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const values=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:VARIABLE\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(values,[2,50,2,50,3,50,3,50,1,0],'Save actions run once; Load restores variables and runs its own actions with WAIT before resuming; legacy On Load does not repeat them');
  assert.ok(gameSaveMessages.some(message=>message.includes('[GAME_SAVE_WORLD]2,64,80,96,112,0,2,7,9')),'Player, hidden actor, animation frame and camera must actually be restored across scenes');
  assert.ok(gameSaveMessages.some(message=>message.includes('[GAME_SAVE_REMOVED]0,false')),'Removing a slot must invalidate its SRAM data');
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.restart());
  const rebootDeadline=Date.now()+30000;
  while(!gameSaveMessages.some(message=>message.includes('[GAME_SAVE_BOOT]'))&&Date.now()<rebootDeadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(gameSaveMessages.some(message=>message.includes('[GAME_SAVE_BOOT]')),'Game slot 7 must survive an emulated hardware reset');
  while(numericMessages.filter(message=>message.includes('[NUMERIC_TEST:VARIABLE]')).length<12&&Date.now()<rebootDeadline)await new Promise(resolve=>setTimeout(resolve,50));
  const restored=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:VARIABLE\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(restored.slice(-2),[3,50]);
  assert.ok(gameSaveMessages.some(message=>message.includes('[GAME_SAVE_WORLD]2,64,80,96,112,1,2,3,50')));
  console.log('Real mGBA game save passed: SRAM across reset, scene/player/actor/camera restoration, separate save/load actions with WAIT, automatic execution and legacy no-op and slot removal.');
 }
 if(process.argv.includes('--movement-options')) {
  const deadline=Date.now()+25000;
  while(numericMessages.filter(message=>message.includes('[NUMERIC_TEST:PROPERTY]')).length<24&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const values=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:PROPERTY\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(values,[40,72,2,4,48,80,48,80,48,80,64,80,64,96,112,64,96,4,112,64,96,64,112,64],'Pixel/tile properties, movement modes, axis locks and independent collision options must finish correctly');
  const first=[];let capture=false;for(const message of movementOptionsMessages){if(message.includes('[MOVE_OPTIONS_BEGIN]'))capture=true;else if(capture&&message.includes('[MOVE_OPTIONS_STEP]')){first.push(message.match(/\[MOVE_OPTIONS_STEP\](\d+),(\d+)/).slice(1).map(Number));capture=false;}}
  assert.deepEqual(first.slice(0,3),[[41,72],[32,65],[33,65]],'Horizontal first, vertical first and diagonal must start on the configured axes');
  console.log('Real mGBA movement options passed: pixel properties, H/V locks, horizontal/vertical priorities, diagonal, walls, actors and combined collisions.');
 }
 if(process.argv.includes('--nearest-motion')) {
  const deadline=Date.now()+20000;
  while(!numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]152'))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
  const values=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:PROPERTY\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(values,[240,172,240,168,152,168],'Player must read the door coordinates, stop above the floor with its configured collision margin, then approach an inaccessible target');
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')&&!message.includes('event failed')));
  console.log('Real mGBA nearest movement passed: actor properties, player collision margin, blocked door anchor and closest destination behind a sealed wall.');
 }
 if(process.argv.includes('--platform-paths')){
  const deadline=Date.now()+20000;
  while(!numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]112'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const values=numericMessages.flatMap(message=>message.match(/\[NUMERIC_TEST:PROPERTY\](-?\d+)/)?.slice(1).map(Number)??[]);
  assert.deepEqual(values,[40,44,40,108,112,108],'NPC must climb, descend and complete the obstacle crossing after changing scene');
  assert.ok(platformMessages.some(message=>message.includes('[PLATFORM_STEP]40,44,true,')),'The ladder destination must be reached while climbing');
  assert.ok(platformMessages.some(message=>/\[PLATFORM_STEP\]\d+,\d+,false,-\d+/.test(message)),'The obstacle path must actually jump with upward velocity');
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')&&!message.includes('event failed')));
  console.log('Real platform paths passed: ladder ascent/descent, scene transition, jump over an obstacle and exact NPC destinations.');
 }
 if(process.argv.includes('--drop-through-platform')){
  const deadline=Date.now()+15000;
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,5,1));
  while(!dropMessages.some(message=>message.includes('[DROP_TEST]'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,5,0));
  while(!dropMessages.some(message=>/\[DROP_TEST\]\d+,true,false,0\b/.test(message))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  const states=dropMessages.map(message=>message.match(/\[DROP_TEST\](-?\d+),(true|false),(true|false),(-?\d+)/)?.slice(1)).filter(Boolean)
   .map(([y,grounded,active,velocity])=>[Number(y),grounded==='true',active==='true',Number(velocity)]);
  assert.ok(states.some(([,grounded,active,velocity])=>!grounded&&active&&velocity>0),'Down input must release the player and leave gravity active');
  assert.ok(states.some(([y,grounded,active])=>y>100&&!grounded&&active),'Gravity must carry the player through the platform without reattaching');
  assert.ok(states.some(([y,grounded,active,velocity])=>y>100&&grounded&&!active&&velocity===0),'The player must land on the next top platform under gravity');
  console.log('Real platform drop-through passed: down releases the upper platform, gravity crosses it, and the lower platform catches the player.');
 }
 if(process.argv.includes('--tile-composition')){
  const deadline=Date.now()+45000;
  while(!logs.some(line=>line.includes('Game RUN'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const counts=[];
  for(let index=0;index<10;index++){
   const screenshot=path.join(temp,'tile-composition-'+index+'.png');
   await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
   const pixels=execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-depth','8','RGB:-'],{windowsHide:true});
   let red=0,green=0;
   for(let at=0;at<pixels.length;at+=3){
    if(pixels[at]>200&&pixels[at+1]<50&&pixels[at+2]<50)red++;
    if(pixels[at+1]>200&&pixels[at]<50&&pixels[at+2]<50)green++;
   }
   counts.push({red,green});
   await emulator.waitForTimeout(35+index*7);
  }
  assert.ok(counts.some(frame=>frame.green>=64&&frame.red>=32),'Replacement frames must appear while the identical red autotile stays unchanged: '+JSON.stringify(counts));
  assert.ok(counts.some(frame=>frame.green===0&&frame.red>=128),'The first animation frame must reappear: '+JSON.stringify(counts));
  console.log('Real tile composition passed: missing cross-tileset frame alternates and identical autotile remains red.',JSON.stringify(counts));
 }
 if(process.argv.includes('--dynamic-tiles')){
  const colors=[];
  for(let index=0;index<4;index++){
   const screenshot=path.join(temp,`dynamic-tile-${index}.png`);await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
   const rgb=execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-format','%[fx:p{19,35}.r],%[fx:p{19,35}.g],%[fx:p{19,35}.b]','info:'],{encoding:'utf8',windowsHide:true}).split(',').map(Number);
   fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.copyFileSync(screenshot,path.join(root,'test-results',`dynamic-tile-${index}.png`));
   console.log('DYNAMIC_TILE_RGB='+rgb.join(','));
   colors.push(rgb[1]>0.8&&rgb[2]<0.2?'green':rgb[2]>0.8&&rgb[0]<0.2?'blue':'other');
   const count=await emulator.evaluate(()=>window.metrics.length);await emulator.waitForFunction(previous=>window.metrics.length>previous,count,{timeout:15000});
  }
  assert.ok(colors.includes('blue')&&colors.includes('green'),`Dynamic tile must display both frames, got ${colors}`);
  console.log('Real dynamic tiles passed: map-cell override and alternating blue/green tile frames visible in the framebuffer.');
 }
 if(process.argv.includes('--dialogue-ui-audio')) {
  const waitForTrace=async text=>{
   const deadline=Date.now()+15000;
   while(!scenarioMessages.some(message=>message.includes(text))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
   assert.ok(scenarioMessages.some(message=>message.includes(text)),`Expected native scenario trace ${text}`);
  };
  await waitForTrace('[SCENARIO_BEGIN]EVENT_DISPLAY_DIALOGUE');
  assert.ok(!scenarioMessages.some(message=>message.includes('[SCENARIO_DONE]EVENT_DISPLAY_DIALOGUE')),'Interactive dialogue must block before input');
  const shown=path.join(temp,'dialogue-ui.png');await emulator.locator('canvas.ejs_canvas').screenshot({path:shown});
  const red=Number(execFileSync(path.join(root,'bin/image-magick/magick.exe'),[shown,'-format','%[fx:mean.r]','info:'],{encoding:'utf8',windowsHide:true}));
  assert.ok(red>0.04,`The native dialogue/UI must produce visible pixels above the dark background: ${red}`);
  const dialoguePixels=execFileSync(path.join(root,'bin/image-magick/magick.exe'),[shown,'-resize','240x160!','-crop','240x64+0+96','+repage','-depth','8','RGB:-'],{windowsHide:true});
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,1));
  await waitForTrace('[SCENARIO_DONE]EVENT_DISPLAY_DIALOGUE');
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,0));
  await waitForTrace('[SCENARIO_DONE]EVENT_STOP_MUSIC');
  for(const command of ['EVENT_DIALOGUE_SHOW','EVENT_UI_SET_TEXT','EVENT_UI_ANIMATE','EVENT_UI_HIDE','EVENT_UI_SHOW','EVENT_DIALOGUE_CLOSE','EVENT_DISPLAY_DIALOGUE','EVENT_MUSIC_PAUSE','EVENT_MUSIC_RESUME','EVENT_MUSIC_FADE','EVENT_UI_DESTROY'])
   assert.ok(scenarioMessages.some(message=>message.includes('[SCENARIO_DONE]'+command)),`Scenario must complete ${command}`);
  for(const [command,playing] of [['EVENT_PLAY_MUSIC',true],['EVENT_MUSIC_PAUSE',false],['EVENT_MUSIC_RESUME',true],['EVENT_STOP_MUSIC',false]])
   assert.ok(scenarioMessages.some(message=>message.includes(`[SCENARIO_DONE]${command},music=${playing}`)),`Native audio state after ${command}`);
  for(const frame of [0,1,2])assert.ok(scenarioMessages.some(message=>message.includes(`[SCENARIO_FRAME]dialogue_frame_sprite,frame=${frame}`)),`Materialized dialogue frame ${frame} must create a native sprite`);
  scenarioEvidence={dialoguePixelHash:createHash('sha256').update(dialoguePixels).digest('hex'),visiblePixelMeanRed:red,
   completedEvents:scenarioMessages.flatMap(message=>message.match(/\[SCENARIO_DONE\](.*)$/)?.slice(1)??[]),frameIndices:[0,1,2],interactiveInputPassed:true};
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')&&!message.includes('event failed')));
  console.log('Real dialogue/UI/audio passed: persistent and interactive text, selected font pixels, actual A input, UI animation/visibility/destruction and music play/pause/resume/fade/stop.');
 }
 if(process.argv.includes('--camera-scene-scope')) {
  const scenes=["6b83edbf-4bc5-4dd2-98d8-738f5968d2b8", "040ab6ff-fee7-42ed-b12b-d4393216c5fc", "4f7019e0-5383-426a-bb11-5634e5432eca"];
  const expected=[scenes[0]+',0,24,16',scenes[1]+',1,40,4',scenes[2]+',0,56,32',...(process.argv.includes('--camera-stop-follow')?[scenes[1]+',0,40,4']:[])];
  const deadline=Date.now()+20000;
  while(!expected.every(state=>scenarioMessages.some(message=>message.includes('[SCENARIO_CAMERA_SCOPE]'+state)))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
  for(const state of expected) assert.ok(scenarioMessages.some(message=>message.includes('[SCENARIO_CAMERA_SCOPE]'+state)), 'Camera scene scope must reach '+state);
  console.log('Real mGBA camera scene scope passed: default reset, explicit persistence with axis lock/dead zone, and reset restored by turning persistence off.');
 }
 if(process.argv.includes('--follow-axis-locks')) {
  const expected=process.argv.includes('--follow-activation')?['1,0,60,4','0,1,48,70','1,1,60,70','0,0,48,4']:['1,0,40,-16','0,1,8,60','1,1,40,60','0,0,8,-16'];
  const deadline=Date.now()+15000;
  while(!expected.every(state=>scenarioMessages.some(message=>message.includes('[SCENARIO_FOLLOW_LOCK]'+state)))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
  for(const state of expected) assert.ok(scenarioMessages.some(message=>message.includes('[SCENARIO_FOLLOW_LOCK]'+state)), 'Independent camera axis locks must produce '+state);
  console.log(process.argv.includes('--follow-activation') ? 'Real mGBA camera follow activation passed: actual viewport retained on locked axes, only free axes move to the edge of the 80x40 central area.' : 'Real mGBA camera follow passed: X locked, Y locked, both locked and both free through compiled events.');
 }
 if(process.argv.includes('--fractional-start')) {
  assert.ok(scenarioMessages.some(message=>message.includes('[SCENARIO_START]136,68')), 'Fractional tile start 8.5/4.25 must anchor at 136/68 pixels, displaying the sprite at 136/60 with its 0/8 canvas origin');
  console.log('Real mGBA fractional start passed: tile fractions preserved as 136/68px anchored at the custom sprite origin, matching the editor marker.');
 }
 if(process.argv.includes('--painted-map')) {
  const screenshot=path.join(temp,'painted-map.png');
  await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
  const channels=execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-format','%[fx:mean.r],%[fx:mean.g],%[fx:mean.b]','info:'],{encoding:'utf8',windowsHide:true}).split(',').map(Number);
  assert.ok(channels[1]>0.7&&channels[0]<0.2&&channels[2]<0.2,`Painted background must be visible as green pixels, got RGB means ${channels}`);
  console.log('Real painted tile map passed: the EmulatorJS framebuffer displays the materialized green tiles.');
 }
 if(process.argv.includes('--offset-background')) {
  const screenshot=path.join(temp,'offset-background.png');await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
  const at=(x,y)=>Number(execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-format',`%[fx:p{${x},${y}}.g>0.5&&p{${x},${y}}.r<0.2&&p{${x},${y}}.b<0.2]`,'info:'],{encoding:'utf8',windowsHide:true}));
  assert.equal(at(25,30),1,'Image contents must appear at the layer offset');
  for(const [x,y] of [[5,30],[25,5],[160,30]])assert.equal(at(x,y),0,`Transparent padding/offset outside the image at ${x},${y}`);
  console.log('Real offset background passed: 128x80 image, transparent padding, 17/9 layer offsets and a 512x256 logical scene.');
 }
 if(process.argv.includes('--bitmap-scenes')) {
  const pixel=async(filename,x,y,channel)=>{
   const screenshot=path.join(temp,filename);await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
   return Number(execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-format',`%[fx:p{${x},${y}}.${channel}]`,'info:'],{encoding:'utf8',windowsHide:true}));
  };
  assert.ok(await pixel('logo.png',25,30,'g')>0.8,'Logo must render its own green bitmap at its offset');
  assert.ok(await pixel('logo-outside.png',5,30,'g')<0.2,'Logo offset must leave the area before the image empty');
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,1));
  await emulator.waitForFunction(()=>window.metrics.length>=5,null,{timeout:15000});
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,0));
  assert.ok(await pixel('point-click.png',25,30,'b')>0.8,'Point Click must load its distinct blue bitmap after the scene transition');
  assert.ok(await pixel('point-click-outside.png',160,30,'b')<0.2,'Point Click must preserve its image size and offset');
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')));
  console.log('Real bitmap scenes passed: green Logo, A-triggered transition, distinct blue Point Click background and independent image offsets.');
 }
 if(process.argv.includes('--layer-matrix')) {
  const screenshot=path.join(temp,'layer-matrix.png');await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
  for(const [x,channel] of [[3,'b'],[35,'r'],[67,'g']]){
   const otherChannels=['r','g','b'].filter(value=>value!==channel);
   const predicate=`p{${x},3}.${channel}>0.8&&p{${x},3}.${otherChannels[0]}<0.2&&p{${x},3}.${otherChannels[1]}<0.2`;
   const value=Number(execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-format',`%[fx:${predicate}]`,'info:'],{encoding:'utf8',windowsHide:true}));
   assert.equal(value,1,`Layer at ${x},3 must retain only its ${channel} channel`);
  }
  console.log('Real layer matrix passed: ordinary blue tileset, red autotile and green Colorize on three independent layers.');
 }
 if(process.argv.includes('--actor-states')) {
  const check=async(filename,flipped)=>{
   const screenshot=path.join(temp,filename);await emulator.locator('canvas.ejs_canvas').screenshot({path:screenshot});
   fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.copyFileSync(screenshot,path.join(root,'test-results',filename));
   for(const [baseX,y] of [[48,54],[flipped?84:72,78]])for(const [offset,channel] of [[2,flipped?'b':'r'],[6,flipped?'r':'b'],[12,'g']]){
    const other=['r','g','b'].filter(value=>value!==channel);const x=baseX+offset;
    const predicate=`p{${x},${y}}.${channel}>0.8&&p{${x},${y}}.${other[0]}<0.2&&p{${x},${y}}.${other[1]}<0.2`;
    const value=Number(execFileSync(path.join(root,'bin/image-magick/magick.exe'),[screenshot,'-resize','240x160!','-format',`%[fx:${predicate}]`,'info:'],{encoding:'utf8',windowsHide:true}));
    assert.equal(value,1,`Composed actor at ${x},${y}, flipped=${flipped}, expected ${channel}`);
   }
  };
  await check('actor-main.png',false);
  const count=await emulator.evaluate(()=>window.metrics.length);await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,1));
  await emulator.waitForFunction(previous=>window.metrics.length>previous,count,{timeout:15000});
  await emulator.evaluate(()=>window.EJS_emulator.gameManager.simulateInput(0,8,0));await check('actor-other.png',true);
  console.log('Real actor states passed: player/NPC, composed pieces, selected states, baked horizontal flip, custom origin and movement using the 6x5 collision body beside a wall.');
 }
 if(process.argv.includes('--motion')) {
  const deadline=Date.now()+15000;
  while(!numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]8'))&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  for(const coordinate of [200,72,104,240,248,0,8]) assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]'+coordinate)), 'Scripted motion must reach '+coordinate);
  assert.ok(logs.every(message=>!message.includes('ASSERTION FAILED')&&!message.includes('Illegal opcode')));
  console.log('Real mGBA motion passed: camera, actor detour, blocked target, Property offsets and sprite bounds for instant/animated moves.');
 }
 if(process.argv.includes('--numeric-values')) {
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:VARIABLE]20')), 'ROM must read the selected variable');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]128')), 'ROM must read the current player X');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:CAMERA]21')), 'ROM must apply (20 % 7) + 15 to camera X before the next expression');
  assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:BOOLEAN]1')), 'ROM must assign and read a computed boolean');
  if(process.argv.includes('--actor-move')) for(const coordinate of [48,80,64,96]) assert.ok(numericMessages.some(message=>message.includes('[NUMERIC_TEST:PROPERTY]'+coordinate)), 'Move Actor must reach '+coordinate+' in pixels and tiles');
  console.log('Real mGBA numeric expressions passed: variable 20, player property 128 and computed camera X 21.');
 }
 if(process.argv.includes('--prefab-spawn')) {
  const deadline=Date.now()+45000;
  while(!prefabMessages.some(message=>message.includes('[PREFAB_STAGE]done'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  const created=prefabMessages.filter(message=>message.includes('[PREFAB_CREATED]'));
  const removed=prefabMessages.filter(message=>message.includes('[PREFAB_REMOVED]'));
  const initialized=prefabMessages.filter(message=>message.includes('[PREFAB_INITIALIZED]'));
  console.log(prefabMessages.join('\n'));
  assert.equal(created.length,32,'Two rounds must each create 16 independent actors');
  assert.equal(initialized.length,32,'Every instance must run its own prefab initialization');
  assert.equal(removed.length,32,'Every instance must remove itself and release its slot');
  assert.ok(created.every(message=>message.includes('[PREFAB_CREATED]true,')),'Prefab definitions must not spawn automatically on scene load');
  assert.ok(prefabMessages.some(message=>message.includes('[PREFAB_STAGE]done')),'Capacity failures must not stall the scene script');
  console.log('Prefab ROM: independent copies, inherited Self scripts, 16-actor capacity, slot reuse and continuation to the next scene passed.');
 }
 await emulator.evaluate(()=>window.EJS_emulator.menu.open(true));
 const icon=emulator.getByRole('button',{name:'Monitor de recursos',exact:true});
 await icon.waitFor({state:'attached'});
 if(checkHud) {
  await emulator.waitForFunction(()=>Array.from(document.querySelectorAll('div')).some(el=>el.childElementCount===0 && /^FPS: [1-9]/.test(el.textContent)));
  await emulator.evaluate(()=>window.EJS_emulator.forwardRuntimeMonitor('[GBAS_MONITOR:1]120,14000,512,1024,17000,64000,1000,180000,160000,12,116,100,924,2,30,12,100,2,0,16000,400,600;'));
  const fps=emulator.getByText(/^FPS: /);
  const cpu=emulator.getByText(/média 40\.0%/);
  await cpu.waitFor();
  assert.equal(await fps.evaluate(el=>getComputedStyle(el).font),await cpu.evaluate(el=>getComputedStyle(el).font),'FPS and CPU must use the same screen-space font');
  const viewport=await emulator.evaluate(()=>({width:innerWidth,height:innerHeight,gameWidth:document.querySelector('#root-demo-game').clientWidth,gameHeight:document.querySelector('#root-demo-game').clientHeight}));
  assert.equal(viewport.width,viewport.gameWidth);assert.equal(viewport.height,viewport.gameHeight);
  fs.mkdirSync('test-results',{recursive:true});await emulator.screenshot({path:'test-results/runtime-monitor-hud.png'});
 }
 if(process.argv.includes('--background-animation')) {
  const deadline=Date.now()+15000;
  while(backgroundAnimationMessages.length<1 && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(backgroundAnimationMessages.length,1,'The ROM must confirm background sheet animation in regular, affine and bitmap layers, cancellation and scene cleanup');
  console.log(logs.filter(message=>message.includes('[ANIMATION_CPU]')).join('\n'));
  const timing=logs.map(message=>message.match(/\[ANIMATION_CPU\] samples=(\d+) avg_tenths=(\d+) peak_tenths=(\d+)/)).find(Boolean);
  if(timing && Number(timing[1])>=100) {
    assert.ok(Number(timing[2])<1000,'Full startup sheet playback must fit the average frame CPU budget');
    assert.ok(Number(timing[3])<1000,'Steady animation frames must fit the peak frame CPU budget');
  }
 }
 if(process.argv.includes('--input-performance')) {
  const deadline=Date.now()+15000;
  while(inputPerformanceMessages.length<1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(inputPerformanceMessages.length,1,'The real ROM must finish the input benchmark');
  console.log(inputPerformanceMessages.join('\n'));
  const match=inputPerformanceMessages[0].match(/queries=(\d+) attach=(\d+) sink=(\d+)/);
  assert.ok(match);
  const reportPath=process.argv.indexOf('--input-performance-report');
  if(reportPath>=0)fs.writeFileSync(process.argv[reportPath+1],JSON.stringify({queries:Number(match[1]),attach:Number(match[2]),sink:Number(match[3])},null,2)+'\n');
 }
 if(process.argv.includes('--visual-effects')) {
  const deadline=Date.now()+15000;
  while(visualMessages.length<2 && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(visualMessages.length,2,'The ROM must confirm affine transforms, shared actor palette effects and opacity restored after a complete fade cycle');
 }
 const monitorPromise=electronApp.waitForEvent('window');
 monitorPromise.catch(()=>{});
 await icon.evaluate(element=>element.click());
 const monitor=await monitorPromise;
 await monitor.getByRole('region',{name:'Monitor de recursos'}).waitFor();
 await monitor.getByText('Pico de pilha observado:',{exact:false}).waitFor();
 assert.equal(await monitor.getByText('Orçamento de processamento por frame',{exact:true}).count(),0,'The resource monitor must not duplicate the CPU overlay');
 const props=await electronApp.evaluate(()=>({resizable:global.monitor.isResizable(),maximizable:global.monitor.isMaximizable(),fullscreenable:global.monitor.isFullScreenable(),parent:global.monitor.getParentWindow()===global.owner}));
 assert.deepEqual(props,{resizable:false,maximizable:false,fullscreenable:false,parent:true});
 const firstId=await electronApp.evaluate(()=>global.monitor.id);
 await icon.evaluate(element=>element.click());assert.equal(await electronApp.evaluate(()=>global.monitor.id),firstId);
 const messages=await emulator.evaluate(()=>window.metrics.slice(-2));
 await emulator.evaluate(()=>window.EJS_emulator.gameManager.toggleMainLoop(0));
 await emulator.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,2000,64000,240000,8000,8000,120,8,1000,24,31,1,120,1000,31,0,2000;'));
 await monitor.getByText('Uso cr\u00edtico de recursos',{exact:true}).waitFor();
 fs.mkdirSync('test-results',{recursive:true});await monitor.screenshot({path:'test-results/runtime-monitor-window.png'});
 const monitorClosed=monitor.waitForEvent('close');
 await electronApp.evaluate(()=>new Promise(resolve=>{
  const window=global.monitor;
  window.once('closed',()=>setImmediate(resolve));
  window.close();
 }));
 await monitorClosed;
 assert.equal(await electronApp.evaluate(()=>global.monitor),null);
 const reopenedPromise=electronApp.waitForEvent('window');reopenedPromise.catch(()=>{});await icon.evaluate(element=>element.click());const reopened=await reopenedPromise;
 await reopened.getByText('Uso cr\u00edtico de recursos',{exact:true}).waitFor();
 // Forged telemetry from the monitor itself must not overwrite emulator data.
 await reopened.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,6000,64000,160000,40000,40000,104,24,820,204,26,6,104,820,26,0,6000;'));
 assert.equal(await reopened.getByText('Uso cr\u00edtico de recursos',{exact:true}).count(),1);
 await emulator.evaluate(()=>window.electronAPI.send('runtime-monitor-metrics','[GBAS_MONITOR:1]120,14000,512,1024,6000,64000,160000,40000,40000,104,24,820,204,26,6,104,820,26,0,6000;'));
 await reopened.getByText('Recursos pr\u00f3ximos do limite',{exact:true}).waitFor();
 await emulator.evaluate(()=>window.EJS_emulator.toggleMainLoop?.(0));
 // Menu hidden: reload only the renderer and wait until the core has started.
 await emulator.goto(origin+'/#/emulator?hide-menu=1&rom='+encodeURIComponent(origin+'/game.gba'));
 await emulator.reload();await emulator.waitForFunction(()=>window.EJS_emulator?.started===true,null,{timeout:45000});
 assert.equal(await emulator.getByRole('button',{name:'Monitor de recursos',exact:true}).count(),0);
 const closed=reopened.waitForEvent('close');await electronApp.evaluate(()=>global.owner.destroy());await closed;
 assert.equal(await electronApp.evaluate(()=>global.monitor),null);
 console.log('Real Electron/EmulatorJS monitor passed: menu visibility, metrics IPC, fixed window, singleton/reopen, retained sample, alert states and emulator-owned destruction.');
 console.log(messages.join('\n'));
 const reportIndex=process.argv.indexOf('--scenario-report');
 if(reportIndex>=0){assert.ok(scenarioEvidence);fs.writeFileSync(process.argv[reportIndex+1],JSON.stringify(scenarioEvidence,null,2)+'\n');}
} catch(error) { console.error(logs.join('\n'));if(electronApp?.windows().length){fs.mkdirSync('test-results',{recursive:true});await electronApp.windows()[0].screenshot({path:'test-results/runtime-monitor-failure.png'}).catch(()=>{});}throw error; }
finally { if(electronApp)await electronApp.close();await new Promise(resolve=>server.close(resolve));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-studio-monitor-window-'));fs.rmSync(temp,{recursive:true,force:true}); }
