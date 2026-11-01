import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fs.readFileSync('tools/butano/template/src/dialogue_manager.cpp', 'utf8');
const start = source.indexOf('bool DialogueManager::show_choice(');
const complete = source.slice(start, source.indexOf('    if(choice_visible ||', start)) + '    return false;\n}\n';
const acknowledge = source.slice(source.indexOf('bool DialogueManager::acknowledge_choice()'), source.indexOf('\n#endif', source.indexOf('bool DialogueManager::cancel_choice()')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-menu-cancel-'));
try {
  fs.writeFileSync(path.join(temp, 'main.cpp'), `#include <cassert>
struct DialogueChoiceEventData {const char* result_variable="result";bool allow_cancel=true;};
struct VariableManager {int value=99;static VariableManager& instance(){static VariableManager manager;return manager;}void set_number(const char*,int next){value=next;}};
struct DialogueManager {
 bool choice_visible=true,choice_acknowledged=false,choice_cancelled=false,choice_render_ready=true,choice_options_visible=true;
 int frame_animation=8,choice_index=2;DialogueChoiceEventData choice_data;
 bool acknowledge_choice();bool cancel_choice();bool show_choice(const DialogueChoiceEventData&);
};
${complete}${acknowledge}
int main(){
 DialogueManager menu;assert(menu.cancel_choice());assert(!menu.acknowledge_choice());
 assert(menu.show_choice(menu.choice_data));assert(!menu.choice_visible);assert(VariableManager::instance().value==-1);
 menu=DialogueManager{};menu.choice_data.allow_cancel=false;assert(!menu.cancel_choice());assert(menu.choice_visible);
 assert(menu.acknowledge_choice());assert(menu.show_choice(menu.choice_data));assert(VariableManager::instance().value==2);
 menu=DialogueManager{};menu.frame_animation=0;menu.choice_render_ready=false;assert(menu.cancel_choice());
 assert(menu.show_choice(menu.choice_data));assert(VariableManager::instance().value==-1);
}`);
  const executable = path.join(temp, 'test.exe');
  const build = spawnSync('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', path.join(temp, 'main.cpp'), '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  console.log('Menu cancellation passed: -1 result, closed menu, simultaneous confirmation ignored, early cancellation and required choice.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
