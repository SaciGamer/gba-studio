import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {transcodeProject} from '../../dist/main/utils/projectTranscoder/transcode-project.js';
import {inspectGbaMemory,formatGbaMemoryReport} from './verify-gba-memory.mjs';
const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const temp=argument('--reuse')?path.dirname(path.resolve(argument('--reuse'))):fs.mkdtempSync(path.join(os.tmpdir(),'gba-input-performance-'));
assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-input-performance-'));
const output=path.join(temp,'output'),project=path.join(temp,'project'),root=path.resolve('.');
try {
 fs.mkdirSync(path.join(project,'project'),{recursive:true});fs.writeFileSync(path.join(project,'input.gbaproj'),JSON.stringify({name:'input_performance'}));
 const keys=['A','B','L','R','START','SELECT','UP','DOWN','LEFT','RIGHT'];
 const resources=[{_resourceType:'settings',id:'settings',startSceneId:'stage'},
  {_resourceType:'scene',id:'stage',name:'Input performance',sceneType:'Adventure',width:240,height:160,actors:[],triggers:[],backgrounds:[],script:keys.map((key,i)=>({id:'attach'+i,command:'EVENT_WAIT_FOR_BUTTON',args:{buttons:[key],overrideButton:true},children:{then:[{id:'wait'+i,command:'EVENT_WAIT',args:{units:'frames',frames:2}}]}}))}];
 for(let i=0;i<resources.length;i++)fs.writeFileSync(path.join(project,'project',i+'.gbasres'),JSON.stringify(resources[i]));
 const result=await transcodeProject({projectDir:project,outputDir:output,parallel:2});assert.ok(result.success,result.message);
 if(argument('--baseline'))fs.copyFileSync(path.resolve(argument('--baseline')),path.join(output,'src/input_manager.cpp'));
 // Switching reference/current sources can restore an older template mtime.
 // Force recompilation so an incremental benchmark cannot reuse the old object.
 fs.utimesSync(path.join(output,'src/input_manager.cpp'),new Date(),new Date());
 const game=path.join(output,'src/game.cpp');let source=fs.readFileSync(game,'utf8');source='#include "bn_timer.h"\n'+source;
 source=source.replace('        update();',`        update();
        static int input_benchmark_frames=0;
        if(++input_benchmark_frames==120){
            const char* actions[]={"move_left","move_right","move_up","move_down","confirm","cancel","jump","shoot","pause","menu"};
            const char* buttons[]={"A","B","L","R","START","SELECT","UP","DOWN","LEFT","RIGHT"};
            auto& input=InputManager::instance();
            volatile int sink=0;
            bn::timer timer;
            for(int repeat=0;repeat<4;++repeat){
                for(const char* action:actions){sink+=input.pressed(action);sink+=input.held(action);}
                for(const char* button:buttons){sink+=input.binding_pressed(button);sink+=input.binding_held(button);}
            }
            const int queries_ticks=timer.elapsed_ticks();
            timer.restart();
            for(int repeat=0;repeat<4;++repeat) ScriptCommand::instance().update_button_bindings("stage");
            const int attach_ticks=timer.elapsed_ticks();
            BN_LOG("[INPUT_PERFORMANCE] queries=",queries_ticks," attach=",attach_ticks," sink=",sink);
        }`);
 fs.writeFileSync(game,source);
 const devkit=process.env.DEVKITPRO;assert.ok(devkit);const arm=process.env.DEVKITARM||path.join(devkit,'devkitARM');const env={...process.env};const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';env[key]=[path.join(devkit,'msys2/usr/bin'),path.join(devkit,'tools/bin'),path.join(arm,'bin'),env[key]].join(path.delimiter);env.DEVKITPRO=devkit.replaceAll('\\','/');env.DEVKITARM=arm.replaceAll('\\','/');env.BUTANO=path.join(root,'tools/butano').replaceAll('\\','/');
 const built=spawnSync(path.join(devkit,'msys2/usr/bin/make.exe'),['-j2'],{cwd:output,env,stdio:'inherit',windowsHide:true});assert.equal(built.status,0);
 const elf=fs.readdirSync(output).find(file=>file.endsWith('.elf'));const memory=inspectGbaMemory(path.join(output,elf));console.log(formatGbaMemoryReport(memory));assert.deepEqual(memory.errors,[]);
 const reportPath=path.join(output,'input-performance.json');
 const run=spawnSync(process.execPath,['tests/runtime-monitor-emulator.mjs',path.join(output,path.basename(elf,'.elf')+'.gba'),'--input-performance','--input-performance-report',reportPath,'--hud'],{stdio:'inherit',windowsHide:true});assert.equal(run.status,0);
 if(argument('--compare')) {
  const bytes=fs.readFileSync(argument('--compare'));
  const text=bytes[0]===255&&bytes[1]===254?bytes.toString('utf16le'):bytes.toString('utf8');
  const before=text.match(/queries=(\d+) attach=(\d+) sink=(\d+)/);assert.ok(before);
  const after=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  assert.equal(after.sink,Number(before[3]));assert.ok(after.queries<Number(before[1]));assert.ok(after.attach<Number(before[2]));
  console.log(`Input benchmark reduction: queries ${(100*(1-after.queries/Number(before[1]))).toFixed(1)}%, Attach ${(100*(1-after.attach/Number(before[2]))).toFixed(1)}%.`);
 }
 console.log(output);
} finally {if(!process.argv.includes('--keep'))fs.rmSync(temp,{recursive:true,force:true});}
