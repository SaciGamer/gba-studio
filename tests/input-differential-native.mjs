import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-input-differential-'));
try {
 const reference=fs.readFileSync('tests/native/input/reference_input_manager.cpp','utf8').replaceAll('InputManager','ReferenceInputManager').replaceAll('InputSnapshot','ReferenceInputSnapshot').replace('"input_manager.h"','"reference_input_manager.h"').replace('int bindings_count)', 'int bindings_count, const unsigned short*)');
 fs.writeFileSync(path.join(temp,'reference.cpp'),reference);
 fs.writeFileSync(path.join(temp,'reference_input_manager.h'),fs.readFileSync('tools/butano/template/include/input_manager.h','utf8').replaceAll('INPUT_MANAGER_H','REFERENCE_INPUT_MANAGER_H').replaceAll('InputManager','ReferenceInputManager').replaceAll('InputSnapshot','ReferenceInputSnapshot'));
 fs.writeFileSync(path.join(temp,'main.cpp'),`#include <cassert>
#include "input_manager.h"
#include "reference_input_manager.h"
#include "resource_types.h"
#include "bn_keypad.h"
int main(){auto&fast=InputManager::instance();auto&old=ReferenceInputManager::instance();
const char*buttons[]={"A","B","L","R","START","SELECT","UP","DOWN","LEFT","RIGHT"};
const char*queries[]={"A","B","L","R","START","SELECT","UP","DOWN","LEFT","RIGHT","move_left","move_right","move_up","move_down","jump","shoot","confirm","cancel","interact","pause","menu","dash","missing",nullptr};
const char*left[]={"LEFT","A"};const char*confirm[]={"B"};const char*dash[]={"R","L"};const char*alias[]={"dash"};
const InputBinding bindings[]={{"move_left",left,2},{"confirm",confirm,1},{"dash",dash,2},{"alias",alias,1}};
bool*states[]={&bn::keypad::a_pressed_state,&bn::keypad::b_pressed_state,&bn::keypad::l_pressed_state,&bn::keypad::r_pressed_state,&bn::keypad::start_pressed_state,&bn::keypad::select_pressed_state,&bn::keypad::up_pressed_state,&bn::keypad::down_pressed_state,&bn::keypad::left_pressed_state,&bn::keypad::right_pressed_state};
unsigned seed=12345;auto random=[&](){seed=seed*1664525+1013904223;return seed;};
for(int trial=0;trial<200;trial++){
fast.clear_overrides();old.clear_overrides();fast.configure(trial%3?bindings:nullptr,trial%3?4:0);old.configure(trial%3?bindings:nullptr,trial%3?4:0);
const char*groups[]={"gameplay","menu","interaction","all"};for(const char*group:groups){bool enabled=(random()&4)!=0;fast.set_group_enabled(group,enabled);old.set_group_enabled(group,enabled);}
for(int step=0;step<5;step++){
for(int i=0;i<10;i++){*states[i]=(random()&16)!=0;bool override=(random()&32)!=0;fast.set_override(buttons[i],override);old.set_override(buttons[i],override);}
const char*target=buttons[random()%10];const char*source=buttons[random()%10];assert(fast.queue_default_action(target,source)==old.queue_default_action(target,source));
fast.poll();old.poll();if(step%2){fast.clear_button_actions(source);old.clear_button_actions(source);}
for(const char*q:queries){assert(fast.pressed(q)==old.pressed(q));assert(fast.held(q)==old.held(q));assert(fast.binding_pressed(q)==old.binding_pressed(q));assert(fast.binding_held(q)==old.binding_held(q));assert(fast.action_pressed(q)==old.action_pressed(q));assert(fast.action_held(q)==old.action_held(q));assert(fast.is_blocked(q)==old.is_blocked(q));}
assert(fast.pressed("alias")==old.pressed("alias"));
}}
}`);
 const exe=path.join(temp,'test.exe');const args=['-std=c++17','-O2','-Wall','-Wextra','-Werror','-I'+temp,'-Itests/native/input','-Itests/native/support','-Itools/butano/template/include','tools/butano/template/src/input_manager.cpp',path.join(temp,'reference.cpp'),path.join(temp,'main.cpp'),'-o',exe];
 const built=spawnSync('g++',args,{encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.stderr);const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
 console.log('Input differential passed: 1000 frame sequences match the prior runtime for physical/logical keys, groups, overrides, multi-key mappings, aliases, held remaps and generated actions.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
