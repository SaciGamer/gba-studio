import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('bool GraphicsManager::remove_prefab_actors(');
assert.ok(start >= 0);
const method = source.slice(start, source.indexOf('\n}\n', start) + 2);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-remove-prefab-'));
try {
  const file = path.join(temporary, 'main.cpp');
  const executable = path.join(temporary, 'test.exe');
  fs.writeFileSync(file, `
#include <cassert>
#include <cstring>
#include <set>
#include <string>
struct SceneActor { const char* id; const char* spawn_prefab_id; };
struct Scene { int actors_count; const SceneActor* actors; };
namespace actor_motion { bool same_text(const char* a, const char* b) { return !std::strcmp(a,b); } }
class GraphicsManager { public:
 const Scene* currentScene = nullptr;
 std::set<std::string> enabled, removed;
 bool remove_actor(const char* id) { removed.insert(id); enabled.erase(id); return true; }
 bool remove_prefab_actors(const char*);
};
${method}
int main() {
 GraphicsManager manager;
 assert(!manager.remove_prefab_actors("enemy"));
 const SceneActor actors[] = {{"placed",nullptr},{"first","enemy"},{"second","enemy"},{"offscreen","enemy"},{"other","other"}};
 const Scene scene{5,actors}; manager.currentScene=&scene;
 manager.enabled={"placed","first","second","offscreen","other"};
 assert(!manager.remove_prefab_actors(nullptr));
 assert(!manager.remove_prefab_actors(""));
 assert(!manager.remove_prefab_actors("missing"));
 assert(manager.remove_prefab_actors("enemy"));
 assert((manager.removed==std::set<std::string>{"first","second","offscreen"}));
 assert((manager.enabled==std::set<std::string>{"placed","other"}));
 assert(manager.remove_prefab_actors("enemy"));
 manager.enabled.insert("first");
 assert(manager.remove_prefab_actors("enemy"));
 assert(!manager.enabled.count("first"));
}
`);
  const built = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', file, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Prefab removal native: multiple instances, offscreen definitions, unrelated actors, empty pools and reuse passed.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
