import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-menu-layout-'));
try {
  const bundle = path.join(temporary, 'layout.mjs');
  await build({ stdin: { contents: `export * from './src/shared/menuLayout'; export * from './src/shared/events/eventCatalog'; export * from './src/shared/events/eventAttention'; export * from './src/renderer/frontend/src/utils/fontMetrics';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: bundle });
  const { getMenuLayout, getMenuLayoutIssues, menuPromptLines, menuOptionCell, moveMenuSelection, countEventAttention, measureFontText, EVENT_DEFAULTS } = await import(pathToFileURL(bundle).href);
  assert.ok(EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE.prompt && EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE.optionA && EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE.optionB);
  assert.equal(EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE.columns, undefined);
  assert.equal(getMenuLayout({ columns: 4 }, false).columns, 1);
  assert.deepEqual(menuPromptLines('A'.repeat(56)), ['A'.repeat(28), 'A'.repeat(28)]);
  assert.equal(menuPromptLines('A'.repeat(57)).length, 3);
  assert.deepEqual(menuPromptLines('A\n'), ['A', '']);
  assert.equal(getMenuLayout({ columns: 4, showTitle: false }).capacity, 12);
  assert.equal(getMenuLayout({ columns: 4, prompt: 'Title' }).capacity, 8);
  assert.equal(getMenuLayout({ columns: 4, prompt: 'A'.repeat(56) }).capacity, 4);
  assert.equal(getMenuLayout({ columns: 4, showTitle: false, options: Array(32).fill('Yes') }).pages, 3);
  assert.deepEqual(['dialogue', 'full-screen', 'left', 'right'].map(position => getMenuLayout({ position, showTitle: false, options: Array(32).fill('Yes') }).position), ['dialogue', 'full-screen', 'left', 'right']);
  assert.equal(getMenuLayout({ position: 'full-screen', columns: 4, showTitle: false, options: Array(32).fill('Yes') }).capacity, 36);
  assert.equal(getMenuLayout({ position: 'left', showTitle: false, options: ['Yes'] }).optionCharacters, 5);
  assert.equal(getMenuLayout({ position: 'left', columns: 2, showTitle: false, options: ['Yes'] }).areaWidth, 120);
  assert.equal(getMenuLayout({ position: 'right', columns: 2, showTitle: false, options: ['Yes'] }).columns, 2);
  assert.equal(getMenuLayout({ position: 'left', showTitle: false, options: Array(20).fill('Yes') }).capacity, 8);
  assert.equal(getMenuLayout({ position: 'left', columns: 2, prompt: 'A'.repeat(30) }).promptRows, 2);
  const sideRowOrder = getMenuLayout({ position: 'left', columns: 2, optionOrder: 'rows', prompt: 'A'.repeat(30), options: Array(12).fill('A') });
  assert.deepEqual([menuOptionCell(0, sideRowOrder).x, menuOptionCell(0, sideRowOrder).y, menuOptionCell(1, sideRowOrder).x, menuOptionCell(2, sideRowOrder).x, menuOptionCell(2, sideRowOrder).y], [0, 48, 64, 0, 64]);
  const sideColumnOrder = getMenuLayout({ position: 'right', columns: 2, optionOrder: 'columns', prompt: 'A'.repeat(30), options: Array(12).fill('A') });
  assert.deepEqual([menuOptionCell(0, sideColumnOrder).x, menuOptionCell(1, sideColumnOrder).x, menuOptionCell(1, sideColumnOrder).y, menuOptionCell(6, sideColumnOrder).x], [120, 120, 64, 184]);
  assert.equal(getMenuLayout({ position: 'left', columns: 1, optionOrder: 'columns' }).columnMajor, false);
  assert.equal(menuOptionCell(0, getMenuLayout({ position: 'right', showTitle: false, options: ['Yes'] })).x, 180);
  for (const font of ['fixed8x8', 'fixed8x16', 'variable8x8', 'variable8x16', 'variable16x16']) {
    assert.equal(measureFontText(font, 'A A').width, measureFontText(font, 'AA').width + measureFontText(font, ' ').width);
  }
  for (let columns = 1; columns <= 4; ++columns) {
    const max = getMenuLayout({ columns }).optionCharacters;
    assert.deepEqual(getMenuLayoutIssues({ columns, options: ['A'.repeat(max)] }), []);
    assert.ok(getMenuLayoutIssues({ columns, options: ['A'.repeat(max + 1)] }).some(issue => issue.code === 'optionWidth'));
  }
  assert.equal(countEventAttention([{ command: 'EVENT_MENU_OPEN', args: { resultVariable: 'result', columns: 4, options: ['Too long'] } }]), 1);
  assert.equal(countEventAttention([{ command: 'EVENT_MENU_OPEN', args: { resultVariable: 'result', columns: 4, options: ['Yes'] } }]), 0);
  let hash = 0;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let count = 1; count <= 32; ++count) for (let cols = 1; cols <= 4; ++cols) for (let rows = 1; rows <= 3; ++rows) for (const columnMajor of [false, true]) {
    const layout = getMenuLayout({ columns: cols, optionOrder: columnMajor ? 'columns' : 'rows', prompt: 'T\n'.repeat(3 - rows).replace(/\n$/, '') });
    // Use explicit row geometry to cover all title heights.
    Object.assign(layout, { rows, promptRows: 3 - rows, capacity: cols * rows });
    const cells = new Set();
    const reachable = new Set([0]), queue = [0];
    for (let index = 0; index < count; ++index) {
      const cell = menuOptionCell(index, layout);
      const key = `${cell.page}:${cell.x}:${cell.y}`;
      assert.ok(!cells.has(key)); cells.add(key);
      assert.ok(cell.x >= 8 && cell.x + layout.cellWidth <= 232 && cell.y >= 0 && cell.y <= 32);
      for (const [dx, dy] of directions) {
        const next = moveMenuSelection(index, count, cols, rows, columnMajor, dx, dy);
        assert.ok(next >= 0 && next < count);
        hash = (Math.imul(hash, 31) + next) >>> 0;
      }
    }
    while (queue.length) for (const [dx, dy] of directions) {
      const next = moveMenuSelection(queue[0], count, cols, rows, columnMajor, dx, dy);
      if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
      if (dx === 0 && dy === -1) queue.shift();
    }
    assert.equal(reachable.size, count, 'Every option, including incomplete final pages, must be reachable');
  }
  const cpp = path.join(temporary, 'navigation.cpp'), executable = path.join(temporary, 'navigation.exe');
  fs.writeFileSync(cpp, `#include "menu_layout.h"
#include <cstdint>
#include <cstdio>
int main(){ if(menu_layout::visible_rows(0,2)!=1||menu_layout::visible_rows(1,2)!=7||menu_layout::visible_rows(2,2)!=6||menu_layout::columns_for_position(4,2)!=2||menu_layout::width_for_position(2,1)!=60||menu_layout::width_for_position(3,2)!=120)return 2; uint32_t hash=0; const int directions[4][2]={{1,0},{-1,0},{0,1},{0,-1}};
for(int count=1;count<=32;++count)for(int cols=1;cols<=4;++cols)for(int rows=1;rows<=3;++rows)for(int order=0;order<2;++order)for(int index=0;index<count;++index)for(const auto& direction:directions) hash=hash*31+menu_layout::move(index,count,cols,rows,order,direction[0],direction[1]);
printf("%u",hash); }`);
  const compiled = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Itools/butano/template/include', cpp, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(Number(run.stdout), hash, 'Editor and native navigation must agree for every geometry and selection');
  console.log('Menu layout passed: 1–4 columns, 0–2 title rows, 1–32 options, all four directions, incomplete pages, width validation, hierarchy warnings and real-space font advances.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('gba-studio-menu-layout-'));
  fs.rmSync(temporary, { recursive: true, force: true });
}
