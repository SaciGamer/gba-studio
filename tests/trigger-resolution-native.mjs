import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const method = signature => { const start = source.indexOf(signature);assert.ok(start >= 0);return source.slice(start, source.indexOf('\n}\n', start) + 2); };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-trigger-resolution-'));
try {
  const cpp = path.join(temporary, 'main.cpp'), exe = path.join(temporary, 'test.exe');
  fs.writeFileSync(cpp, `
#include <cassert>
#include <iostream>
#include <cstring>
namespace actor_motion { bool same_text(const char* a,const char* b){return a&&b&&!std::strcmp(a,b);} }
struct ScriptTrigger {int x,y,width,height;bool enabled;int cooldown_frames;const void* on_enter;const char* id;};
struct Scenes {const ScriptTrigger* triggers;int triggers_count;};
struct GraphicsManager {
 struct TriggerValues {int values[5]{};bool active=false;};TriggerValues trigger_values[64];
 const Scenes* currentScene=nullptr;
 ScriptTrigger get_script_trigger(int,const ScriptTrigger&)const;
 const ScriptTrigger& resolve_script_trigger(int,const ScriptTrigger&,ScriptTrigger&)const;
 int read_numeric_trigger_property(const char*,int)const;
 bool write_numeric_trigger_property(const char*,int,int);
};
${method('ScriptTrigger GraphicsManager::get_script_trigger(')}
${method('const ScriptTrigger& GraphicsManager::resolve_script_trigger(')}
${method('int GraphicsManager::read_numeric_trigger_property(')}
${method('bool GraphicsManager::write_numeric_trigger_property(')}
int main(){
 GraphicsManager graphics;int program=0;ScriptTrigger authored{1,2,3,4,true,60,&program,"0265a5f1-b33c-450d-88a8-aa3d353de808"},scratch{};
 assert(&graphics.resolve_script_trigger(0,authored,scratch)==&authored);
 assert(&graphics.resolve_script_trigger(-1,authored,scratch)==&authored);
 assert(&graphics.resolve_script_trigger(64,authored,scratch)==&authored);
 graphics.trigger_values[0]={{10,20,30,40,0},true};
 const auto& changed=graphics.resolve_script_trigger(0,authored,scratch);
 assert(&changed==&scratch&&changed.x==10&&changed.y==20&&changed.width==30&&changed.height==40&&!changed.enabled);
 assert(changed.cooldown_frames==60&&changed.on_enter==&program&&changed.id==authored.id);
 assert(authored.x==1&&authored.enabled);
 const auto copy=graphics.get_script_trigger(0,authored);assert(copy.x==10&&copy.on_enter==&program);
 graphics.trigger_values[0].active=false;assert(&graphics.resolve_script_trigger(0,authored,scratch)==&authored);
 const Scenes scene{&authored,1};graphics.currentScene=&scene;
 assert(graphics.write_numeric_trigger_property(authored.id,4,0));
 assert(graphics.read_numeric_trigger_property(authored.id,4)==0);
 const auto disabled=graphics.get_script_trigger(0,authored);
 assert(!disabled.enabled&&disabled.x==1&&disabled.width==3&&disabled.on_enter==&program);
 assert(graphics.write_numeric_trigger_property(authored.id,4,1));
 assert(graphics.read_numeric_trigger_property(authored.id,4)==1);
 assert(!graphics.write_numeric_trigger_property("missing",4,1));
 assert(authored.enabled);
 std::cout<<"Trigger resolution passed: authored ROM reference, event overrides, unchanged script metadata, bounds and by-value compatibility.\\n";
}
`);
  const built = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', cpp, '-o', exe], { encoding: 'utf8', windowsHide: true });assert.equal(built.status, 0, built.error?.message ?? built.stdout + built.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });assert.equal(run.status, 0, run.error?.message ?? run.stdout + run.stderr);process.stdout.write(run.stdout);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
