import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'tools/butano/template/src/graphics_manager.cpp'), 'utf8');
const start = source.indexOf('void GraphicsManager::change_single_layer(');
const end = source.indexOf('\nvoid GraphicsManager::change_palette_layer(', start);
assert.ok(start >= 0 && end > start, 'Actual Change Background implementation must be present');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-layer-runtime-'));
try {
  const fixture = `
#include <algorithm>
#include <cassert>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
#define BN_LOG(...) ((void) 0)
int creations = 0;
bool allocation_fails = false;
namespace bn {
template<int N> using string = std::string;
using string_view = std::string_view;
template<class T> using optional = std::optional<T>;
template<class T, int N> class vector : public std::vector<T> {
public:
  void push_back(const T& value) { assert(this->size() < N); std::vector<T>::push_back(value); }
  T& operator[](int index) { return this->at(index); }
  const T& operator[](int index) const { return this->at(index); }
  int size() const { return static_cast<int>(std::vector<T>::size()); }
};
int clamp(int v, int a, int b) { return std::clamp(v, a, b); }
struct regular_bg_item { std::string name; };
struct State {
  std::string item = "old";
  bool visible = false;
  bool blending = false;
  int priority = 0, z_order = 17, x = 0, y = 0, replacements = 0;
};
struct regular_bg_ptr {
  std::shared_ptr<State> state = std::make_shared<State>();
  static optional<regular_bg_ptr> create_optional(const regular_bg_item& item) {
    if(allocation_fails) return {};
    ++creations;
    regular_bg_ptr bg; bg.state->item = item.name; return bg;
  }
  void set_item(const regular_bg_item& item) { state->item = item.name; ++state->replacements; }
  void set_visible(bool v) { state->visible = v; }
  bool visible() const { return state->visible; }
  void set_priority(int v) { state->priority = v; }
  void set_z_order(int v) { state->z_order = v; }
  void set_blending_enabled(bool v) { state->blending = v; }
  void set_position(int x, int y) { state->x = x; state->y = y; }
};
}
struct Scenes { const char* scene_type; };
struct Backgrounds { const char* id; const char* name; int image_width; int image_height; };
const Backgrounds backgrounds[] = {{"old", "old", 256, 256}, {"new", "new", 512, 256}, {"missing-item", "missing", 256, 256}};
const Backgrounds* get_background_by_id(const bn::string<64>& id) {
  for(const auto& background : backgrounds) if(id == background.id) return &background;
  return nullptr;
}
bn::optional<bn::regular_bg_item> get_bg_item_from_name(const bn::string<64>& name) {
  if(name == "missing") return {};
  return bn::regular_bg_item{name};
}
struct LayerArgs { int layer_id; bn::string<64> background_id; bool visible; };
class GraphicsManager {
public:
  const Scenes* currentScene = nullptr;
  bn::vector<bn::optional<bn::regular_bg_ptr>, 4> current_bgs;
  bn::vector<bn::string<64>, 4> current_bgs_id;
  bn::vector<int, 4> current_bgs_x, current_bgs_y, current_bgs_parallax_x, current_bgs_parallax_y;
  int camera_x = 20, camera_y = 12, whole_scene_loads = 0;
  void change_single_layer(int, const bn::string<64>&, bool);
  void change_layer(const bn::vector<LayerArgs, 4>&) { ++whole_scene_loads; }
};
${source.slice(start, end)}
int main() {
  const Scenes regular{"Top Down"};
  GraphicsManager graphics;
  graphics.currentScene = &regular;
  for(int i = 0; i < 4; ++i) {
    graphics.current_bgs.push_back(bn::regular_bg_ptr{});
    graphics.current_bgs_id.push_back("old");
    graphics.current_bgs_x.push_back(i == 2 ? 128 : 0);
    graphics.current_bgs_y.push_back(0);
    graphics.current_bgs_parallax_x.push_back(50);
    graphics.current_bgs_parallax_y.push_back(100);
  }
  auto target = graphics.current_bgs[2]->state;
  auto neighbor = graphics.current_bgs[0]->state;
  graphics.change_single_layer(2, "new", true);
  assert(graphics.current_bgs[2]->state == target);
  assert(target->item == "new" && target->replacements == 1 && target->visible);
  assert(target->x == 254 && target->y == 36 && target->z_order == 17);
  assert(target->priority == 1 && target->blending);
  assert(graphics.current_bgs_id[2] == "new");
  for(int i : {0, 1, 3}) {
    assert(graphics.current_bgs_id[i] == "old");
    assert(!graphics.current_bgs[i]->visible());
    assert(graphics.current_bgs[i]->state->replacements == 0);
  }
  assert(graphics.current_bgs[0]->state == neighbor);
  assert(creations == 0 && graphics.whole_scene_loads == 0);
  graphics.change_single_layer(2, "new", false);
  assert(!target->visible && target->replacements == 1);
  graphics.change_single_layer(2, "missing-resource", true);
  graphics.change_single_layer(2, "missing-item", true);
  assert(target->item == "new" && graphics.current_bgs_id[2] == "new");
  graphics.change_single_layer(2, "", false);
  assert(!graphics.current_bgs[2] && graphics.current_bgs_id[2].empty());
  allocation_fails = true;
  graphics.change_single_layer(2, "new", true);
  assert(!graphics.current_bgs[2] && graphics.current_bgs_id[2].empty());
  allocation_fails = false;
  graphics.change_single_layer(2, "new", true);
  assert(graphics.current_bgs[2] && creations == 1);
  graphics.change_single_layer(99, "new", true);
  assert(graphics.current_bgs_id[3] == "new");
  GraphicsManager sparse;
  sparse.change_single_layer(2, "new", true);
  assert(sparse.current_bgs.empty());
  sparse.currentScene = &regular;
  for(int i = 0; i < 4; ++i) sparse.current_bgs_id.push_back("");
  sparse.change_single_layer(2, "new", true);
  assert(sparse.current_bgs.size() == 4 && sparse.current_bgs[2]);
  assert(sparse.current_bgs_x.size() == 4 && sparse.current_bgs_y.size() == 4);
  assert(sparse.current_bgs_parallax_x.size() == 4 && sparse.current_bgs_parallax_y.size() == 4);
  assert(sparse.whole_scene_loads == 0);
  std::cout << "Change Background runtime checks passed: native slot reuse, four active layers, offsets/parallax, sparse slots, missing resources and allocation failure.\\n";
}
`;
  const input = path.join(output, 'change-background.cpp');
  const executable = path.join(output, process.platform === 'win32' ? 'change-background.exe' : 'change-background');
  fs.writeFileSync(input, fixture);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', input, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, `Change Background native compilation failed:\n${build.error ?? ''}${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 0, `Change Background native execution failed:\n${run.error ?? ''}${run.stdout}${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
