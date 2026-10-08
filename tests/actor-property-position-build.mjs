import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { default: ResourceBuilder } = await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-actor-property-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const headers = [], checks = [];
  const property = axis => ({ kind: 'property', actorId: '__PLAYER__', property: axis });
  for (const [index, command] of ['EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO', 'EVENT_ACTOR_SET_POSITION', 'EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO'].entries()) {
    const unit = index < 3 ? 'pixels' : 'tiles';
    const offset = index < 3 ? 2 : 32;
    const result = builder.processResourceObject({ _resourceType: 'scene', id: `property_${index}`, backgrounds: [], script: [{
      id: 'move', command, args: { actorId: '__PLAYER__', xUnit: unit, yUnit: unit,
        x: property('x'), y: { kind: 'expression', operation: 'add', left: property('y'), right: { kind: 'number', value: 2 } } },
    }] });
    const header = result.headerContent.toString();
    const payload = header.match(/static const ActorMoveEventData (\w+) =/)[1];
    const metadata = header.match(/static const NumericEventValues (\w+) =/)[1];
    headers.push(header);
    checks.push(`{
      ActorMoveEventData target{}; NumericEventCache cache;
      assert(resolve_numeric_event(${metadata}, &${payload}, &${payload}, &target, sizeof(target), cache));
      assert(target.x == player_x && target.y == player_y + ${offset});
      player_y += 10; cache.reset();
      assert(resolve_numeric_event(${metadata}, &${payload}, &${payload}, &target, sizeof(target), cache));
      assert(target.y == player_y + ${offset});
    }`);
    if (unit === 'pixels') assert.doesNotMatch(header, /op_multiply/, 'Pixel position properties must not be scaled');
  }
  const numeric = builder.processResourceObject({ _resourceType: 'scene', id: 'literal_tiles', backgrounds: [], script: [{ id: 'move', command: 'EVENT_MOVE_ACTOR', args: { actorId: '__PLAYER__', x: 2, y: 3, xUnit: 'tiles', yUnit: 'tiles' } }] });
  assert.match(numeric.headerContent.toString(), /ActorMoveEventData[^\n]*"__PLAYER__", 32, 48/);
  const file = path.join(temp, 'test.cpp'), executable = path.join(temp, 'test.exe');
  fs.writeFileSync(file, `#include <cassert>\n#include <cstring>\n${headers.join('\n')}
    int player_x = 70, player_y = 140;
    int property_read(const char* id, int axis) { assert(std::strcmp(id, "__PLAYER__") == 0); return axis == 0 ? player_x : player_y; }
    int main() { numeric_runtime_hooks.property = property_read; ${checks.join('\n')} }
  `);
  const build = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', 'tests/native/support', '-I', 'tests/native/scheduler', '-I', 'tools/butano/template/include', file, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log('Actor position expressions use current player pixels plus the offset in the selected units; literal tile coordinates retain scaling.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
