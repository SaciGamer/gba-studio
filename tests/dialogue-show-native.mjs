import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fs.readFileSync('tools/butano/template/src/dialogue_manager.cpp', 'utf8');
const declaration = fs.readFileSync('tools/butano/template/include/dialogue_manager.h', 'utf8').match(/bool show\([^;]+;/)[0];
const show = source.slice(source.indexOf('bool DialogueManager::show('), source.lastIndexOf('#if GBA_STUDIO_FEATURE_CHOICES', source.indexOf('bool DialogueManager::show_choice(')));
const hide = source.slice(source.indexOf('void DialogueManager::hide()'), source.indexOf('void DialogueManager::clear_rendered()'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-dialogue-show-'));
try {
  const cpp = path.join(temp, 'test.cpp');
  fs.writeFileSync(cpp, `#define GBA_STUDIO_FEATURE_CHOICES 1
#include <string>
#include <array>
#include <algorithm>
#include <cassert>
namespace bn { using std::clamp; template<int N> struct string : std::string { using std::string::string; using std::string::operator=; int size() const { return int(std::string::size()); } }; }
std::string sanitize_utf8(const std::string& value) { return value; }
std::string interpolate(const std::string& value) { return value; }
int dialogue_page_count(const std::string&) { return 1; }
struct DialogueManager {
  bn::string<256> text, full_text;
  bool visible=false, acknowledged=false, manual_close=false, animate_text=false;
  bool closing=false, close_finished=false, show_frame=false;
  bool choice_visible=false, choice_acknowledged=false, choice_cancelled=false, choice_options_visible=false;
  bn::string<256> choice_prompt_text; int choice_reveal_count=0,choice_reveal_tick=0;
  int page_index=0, page_count=0, reveal_count=0, reveal_tick=0, animation_interval=0;
  int frame_animation=0, frame_tick=0, choice_index=0, choice_options_count=0;
  const char* dialogue_font=nullptr; const char* horizontal_align=nullptr; const char* vertical_align=nullptr;
  std::array<bn::string<64>,8> choice_options;
  void load_page() { text=full_text; reveal_count=animate_text?0:int(text.size()); }
  void clear_rendered() {}
  ${declaration}
  const char* avatar_image="",*avatar_placement="",*avatar_anchor="";int avatar_size=16,avatar_x=0,avatar_y=0;
  int choice_option_reveal_tick=0,choice_options_revealed=0;bool choice_render_cached=false;
  bool acknowledge(); void hide();
};
${show}
${hide}
int main() {
  DialogueManager manager;
  assert(manager.show("Hello", "fixed8x16", true, "left", "bottom", true, "medium", true));
  assert(manager.visible && manager.manual_close && manager.reveal_count==0);
  for(int i=0;i<10;++i) assert(!manager.acknowledge());
  assert(manager.visible && !manager.acknowledged && manager.reveal_count==0);
  manager.reveal_count=manager.text.size();
  assert(!manager.acknowledge() && manager.visible);
  assert(manager.show("Replacement", "fixed8x16", false, "left", "bottom", false, "medium", true));
  assert(manager.text=="Replacement" && manager.visible);
  manager.hide(); assert(!manager.visible && !manager.manual_close);
  assert(!manager.show("Interactive", "fixed8x16", false, "left", "bottom", false, "medium", false));
  assert(manager.acknowledge());
  assert(!manager.show("Interactive", "fixed8x16", false, "left", "bottom", false, "medium", false));
  assert(manager.closing);
}
`);
  const exe = path.join(temp, 'test.exe');
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', cpp, '-o', exe], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Dialogue Show: immediate completion, ignored input, replacement, explicit close and interactive Display Dialogue passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
