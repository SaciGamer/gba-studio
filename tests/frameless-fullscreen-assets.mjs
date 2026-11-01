import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AssetBuilder } from '../dist/main/utils/builders/AssetBuilder.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-frameless-menu-'));
try {
 const graphics=path.join(temp,'graphics');fs.mkdirSync(graphics);
 const magick=path.resolve('bin/image-magick/magick.exe');
 execFileSync(magick,['-size','32x32','gradient:#284060-#80a040',`BMP3:${path.join(graphics,'frame.bmp')}`],{windowsHide:true});
 for(const extension of ['bmp','json']) fs.writeFileSync(path.join(graphics,`menu_frame_fullscreen_sprite.${extension}`),'old build artifact');
 const builder=new AssetBuilder(path.resolve('.'),temp,magick);
 await builder.materializeDialogueFrame('frame.bmp');
 for(const extension of ['bmp','json']) assert.equal(fs.existsSync(path.join(graphics,`menu_frame_fullscreen_sprite.${extension}`)),false);
 for(const name of ['dialogue_frame_sprite','menu_frame_side_1_sprite','menu_frame_side_2_sprite']) {
  assert.ok(fs.existsSync(path.join(graphics,`${name}.bmp`)));
  assert.ok(fs.existsSync(path.join(graphics,`${name}.json`)));
 }
 await builder.materializeDialogueFrame('frame.bmp');
 assert.equal(fs.existsSync(path.join(graphics,'menu_frame_fullscreen_sprite.bmp')),false);
 const runtime=fs.readFileSync('tools/butano/template/src/dialogue_manager.cpp','utf8');
 assert.doesNotMatch(runtime,/menu_frame_fullscreen_sprite/);
 assert.match(runtime,/render_frame = show_frame && !\(choice_visible && choice_data.menu_position == 1\)/);
 console.log('Full-screen frame is not generated; old assets are removed and dialogue/side frames remain available.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
