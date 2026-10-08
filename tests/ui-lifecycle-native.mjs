import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const template = path.resolve('tools/butano/template');
const source = fs.readFileSync(path.join(template, 'src/dialogue_manager.cpp'), 'utf8').replaceAll('\r\n', '\n');
const header = fs.readFileSync(path.join(template, 'include/dialogue_manager.h'), 'utf8');
const types = fs.readFileSync(path.join(template, 'include/resource_types.h'), 'utf8');
const state = header.match(/struct UiElementState \{[\s\S]*?\n    \};/)[0];
const structs = ['UiSetTextEventData', 'UiAnimateEventData', 'UiTargetEventData', 'UiAnimationStopEventData'].map(name => types.match(new RegExp(`struct ${name} \\{[\\s\\S]*?\\n\\};`))[0]).join('\n');
function method(name) {
  const start = source.indexOf(`bool DialogueManager::${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n}\n', start) + 2;
  return source.slice(start, end);
}
// Compile the actual production UI methods and per-frame animation loop. Only
// the Butano hardware sprite/string containers are replaced by host stand-ins.
const animationStart = source.indexOf('    for(UiElementState& ui : ui_elements)', source.indexOf('void DialogueManager::render()'));
const animationEnd = source.indexOf('    if(has_ui && trace_ui_render)', animationStart);
const animations = source.slice(animationStart, animationEnd);
const cpp = `
#include <cassert>
#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <vector>
#include <iostream>
#define BN_LOG(...) do {} while(false)
namespace bn {
  template<int N> using string = std::string;
  using std::max; using std::clamp;
  struct sprite_ptr {
    struct state { bool visible = true; int x = 0, y = 0; };
    std::shared_ptr<state> value = std::make_shared<state>();
    void set_visible(bool visible) { value->visible = visible; }
    int x() const { return value->x; } int y() const { return value->y; }
    void set_x(int x) { value->x = x; } void set_y(int y) { value->y = y; }
  };
}
${structs}
class DialogueManager {
public:
  ${state}
  std::array<UiElementState, 16> ui_elements{};
  std::vector<bn::sprite_ptr> ui_rendered_sprites;
  const char* last_ui_id = nullptr;
  bool set_ui_text(const UiSetTextEventData& data);
  bool animate_ui(const UiAnimateEventData& data);
  bool stop_ui_animation(const UiAnimationStopEventData& data);
  bool set_ui_hidden(const UiTargetEventData& data, bool hidden);
  bool destroy_ui(const UiTargetEventData& data);
  void advance() { [[maybe_unused]] bool has_ui = false, trace_ui_render = false; ${animations} }
};
${['set_ui_text', 'animate_ui', 'stop_ui_animation', 'set_ui_hidden', 'destroy_ui'].map(method).join('\n')}
int main() {
  DialogueManager manager;
  assert(manager.set_ui_text({ "first", "A", 0, 0, "fixed8x16" }));
  assert(manager.set_ui_text({ "middle", "B", 10, 10, "fixed8x16" }));
  assert(manager.set_ui_text({ "last", "C", 20, 20, "fixed8x16" }));
  for(int i = 0; i < 3; ++i) {
    auto& ui = manager.ui_elements[i];
    ui.sprite_start = i * 2; ui.sprite_count = 2; ui.rendered = true; ui.dirty = false;
    manager.ui_rendered_sprites.emplace_back(); manager.ui_rendered_sprites.emplace_back();
  }
  auto& middle = manager.ui_elements[1];
  middle.storage = "Owned text";
  assert(manager.animate_ui({ "middle", "move", 100, 100, 16, 0 }));
  assert(manager.animate_ui({ "middle", "blink", 0, 0, 16, 0 }));
  std::weak_ptr<bn::sprite_ptr::state> first = manager.ui_rendered_sprites[0].value;
  std::weak_ptr<bn::sprite_ptr::state> destroyed = manager.ui_rendered_sprites[2].value;
  std::weak_ptr<bn::sprite_ptr::state> last = manager.ui_rendered_sprites[4].value;
  assert(manager.set_ui_hidden({ "middle" }, true));
  assert(!manager.ui_rendered_sprites[2].value->visible && !destroyed.expired());
  assert(middle.move_active && middle.blink_active && middle.storage == "Owned text");
  manager.advance();
  assert(middle.text.x == 11 && middle.move_elapsed == 1 && middle.blink_elapsed == 1);
  assert(!manager.ui_rendered_sprites[2].value->visible);
  assert(manager.set_ui_hidden({ "middle" }, false));
  assert(manager.ui_rendered_sprites[2].value->visible);
  middle.blink_visible = false;
  assert(manager.set_ui_hidden({ "middle" }, false));
  assert(!manager.ui_rendered_sprites[2].value->visible); // Respect blink phase.
  assert(manager.destroy_ui({ "middle" }));
  assert(destroyed.expired() && !first.expired() && !last.expired());
  assert(manager.ui_rendered_sprites.size() == 4 && manager.ui_elements[2].sprite_start == 2);
  assert(!middle.id && !middle.text.text && middle.storage.empty());
  assert(!middle.move_active && !middle.blink_active && middle.sprite_count == 0);
  assert(middle.move_elapsed == 0 && middle.blink_elapsed == 0);
  manager.advance(); assert(manager.ui_elements[2].id == std::string("last"));
  assert(!manager.animate_ui({ "middle", "move", 50, 50, 16, 0 }));
  assert(!manager.destroy_ui({ "missing" }) && !manager.set_ui_hidden({ "missing" }, true));
  assert(!manager.destroy_ui({ nullptr }) && !manager.set_ui_hidden({ "" }, true));
  assert(manager.set_ui_text({ "replacement", "D", 0, 0, "fixed8x16" }));
  assert(middle.id == std::string("replacement") && !middle.hidden && !middle.move_active);
  assert(manager.destroy_ui({ "replacement" }) && !manager.last_ui_id);
  assert(!manager.animate_ui({ "__LAST_UI__", "move", 50, 50, 16, 0 }));
  assert(manager.destroy_ui({ "first" }) && first.expired());
  assert(manager.ui_elements[2].sprite_start == 0);
  assert(manager.destroy_ui({ "last" }) && last.expired() && manager.ui_rendered_sprites.empty());
  for(int cycle = 0; cycle < 64; ++cycle) {
    assert(manager.set_ui_text({ "reused", "E", 0, 0, "fixed8x16" }));
    assert(manager.destroy_ui({ "reused" }));
  }
  std::cout << "Production UI lifecycle: hide/show, animations, resource release, cache compaction, target errors and slot reuse passed.\\n";
}
`;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-ui-native-'));
try {
  const file = path.join(output, 'ui.cpp'), executable = path.join(output, process.platform === 'win32' ? 'ui.exe' : 'ui');
  fs.writeFileSync(file, cpp);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', file, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally { fs.rmSync(output, { recursive: true, force: true }); }
