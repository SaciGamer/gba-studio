import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ids=JSON.parse(fs.readFileSync('tools/verification/fixtures/actor-capacity-ids.json','utf8'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-actor-capacity-'));
try {
  const cpp=path.join(temporary,'main.cpp'),exe=path.join(temporary,'test.exe');
  fs.writeFileSync(cpp,`#include <cassert>
#include <iostream>
#include "actor_manager.h"
const char* ids[]={${ids.map(id=>JSON.stringify(id)).join(',')}};
int main(){auto& actors=ActorManager::instance();ActorHandle handles[128];
 for(int i=0;i<128;++i){handles[i]=actors.spawn(ids[i],i,i*2);assert(handles[i].slot==i);}
 assert(actors.spawn(ids[128],0,0).slot<0);
 auto same=actors.spawn(ids[127],400,800);assert(same.slot==127);int x=0,y=0;assert(actors.get_position(same,x,y)&&x==400&&y==800);
 assert(actors.set_visible_by_id(ids[127],false));assert(actors.set_visible_by_id(ids[127],true));assert(actors.set_animation_speed_by_id(ids[127],8));
 for(int i=0;i<128;i+=2){assert(actors.remove(handles[i]));assert(!actors.get_position(handles[i],x,y));}
 for(int i=0;i<128;i+=2){auto replacement=actors.spawn(ids[i],10,20);assert(replacement.slot==i&&replacement.generation!=handles[i].generation);assert(!actors.set_position(handles[i],1,2));}
 actors.reset();for(int i=0;i<128;++i)assert(actors.spawn(ids[i],i,0).slot==i);
 std::cout<<"Actor capacity passed: all 128 slots, duplicate identity, visibility, animation speed, full-pool refusal, generation-safe reuse and reset.\\n";
}`);
  const built=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-I','tests/native/support','-I','tools/butano/template/include','tools/butano/template/src/actor_manager.cpp',cpp,'-o',exe],{encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.error?.message??built.stdout+built.stderr);
  const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.error?.message??run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
