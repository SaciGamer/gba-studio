import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-game-save-'));
try{
 const executable=path.join(temp,'save.exe');
 const build=spawnSync(process.env.CXX||'g++',['-std=c++23','-Wall','-Wextra','-Werror','-I','tools/butano/template/include','-I','tools/butano/butano/include','tools/butano/template/src/variable_manager.cpp','tools/butano/template/src/save_manager.cpp','tools/butano/template/src/save_game.cpp','tests/native/game_save_main.cpp','-o',executable],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(executable,[],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-game-save-'));fs.rmSync(temp,{recursive:true,force:true});}
