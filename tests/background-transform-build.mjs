import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceBuilder } from '../dist/main/utils/builders/ResourceBuilder.js';
import { prepareAffineBackgrounds, convertAffineTiles, materializeAffineBackgrounds } from '../dist/main/utils/builders/AffineBackgroundAssets.js';
import { toRuntimeScene } from '../dist/main/utils/types/RuntimeResources.js';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-affine-build-'));
try {
  fs.mkdirSync(path.join(temp, 'include')); fs.mkdirSync(path.join(temp, 'src'));
  const builder = new ResourceBuilder(temp, path.resolve('tools/butano/template'));
  const event = (command, args = {}, children) => ({ id: command, command, args, ...(children ? { children } : {}) });
  const emit = script => builder.processResourceObject({ _resourceType: 'scene', id: 'affine', backgrounds: [], script }).headerContent.toString();
  const code = emit([event('EVENT_BACKGROUND_SET_SCALE'), event('EVENT_BACKGROUND_SET_ROTATION'), event('EVENT_BACKGROUND_SET_SHEAR')]);
  assert.match(code, /BackgroundTransformEventData[^\n]*= \{ 0, 100, 100 \}/);
  assert.match(code, /"EVENT_BACKGROUND_SET_SCALE", &/);
  assert.match(emit([event('EVENT_BACKGROUND_SET_ROTATION', { layerId: 2, angle: -90 })]), /BackgroundTransformEventData[^\n]*= \{ 2, -90, 0 \}/);
  assert.match(emit([event('EVENT_BACKGROUND_SET_SCALE', { x: { kind: 'variable', variableId: 'scale' } })]), /offsetof\(BackgroundTransformEventData, x\)/);
  for (const [command,args] of [['EVENT_BACKGROUND_SET_SCALE',{x:0}], ['EVENT_BACKGROUND_SET_SCALE',{x:801}], ['EVENT_BACKGROUND_SET_ROTATION',{angle:361}], ['EVENT_BACKGROUND_SET_SHEAR',{y:-201}], ['EVENT_BACKGROUND_SET_SCALE',{layerId:4}]])
    assert.throws(()=>emit([event(command,args)]),/Invalid EVENT_BACKGROUND/);
  const words = [0x76543210, ...Array(7).fill(0), ...Array(8).fill(0x11111111)];
  const cells = Array(1024).fill(0); cells[1] = 1024 | 4096;
  const converted = convertAffineTiles(words, cells, Array(32).fill(0), 32, 32, 4, [{layerId:0,targetTileIndex:0,frameTileIndices:[0,1],durationFrames:3,initialFrame:0,loop:true}]);
  const animated = converted.animations.find(animation=>animation.targetTileIndex===converted.cells[1]);
  assert.ok(animated, 'Baked flipped targets must retain their own animation');
  assert.equal(converted.tiles[converted.cells[1]][0],23); // palette bank 1, flipped pixel 7
  assert.equal(converted.tiles[converted.cells[0]][0],0); // transparent index stays zero
  assert.deepEqual(converted.tiles[animated.frameTileIndices[1]],Array(64).fill(17));
  assert.notEqual(animated.frameTileIndices[1],animated.targetTileIndex,'Animation destination must stay separate from static source tiles');
  const many = Array.from({length:257*16},(_,index)=>index);
  assert.throws(()=>convertAffineTiles(many,Array.from({length:1024},(_,index)=>index%257),Array(256).fill(0),32,32,8),/requires 257 unique tiles;.*256 unique tiles/);
  const overflow = Array.from({length:300*16},(_,index)=>index);
  assert.throws(()=>convertAffineTiles(overflow,Array.from({length:1024},(_,index)=>index%300),Array(256).fill(0),32,32,8),/requires 300 unique tiles;.*direct bitmap scene/);
  const background={_resourceType:'background',id:'bg',filename:'bg.png',imageWidth:256,imageHeight:256};
  const scene={_resourceType:'scene',id:'scene',name:'Scene',backgrounds:[{layerId:0,backgroundId:'bg'}],script:[event('EVENT_CALL_SCRIPT',{scriptId:'shared'})]};
  const shared={_resourceType:'scripts',scripts:[{id:'shared',events:[event('EVENT_BACKGROUND_SET_ROTATION',{layerId:0,angle:45})]}]};
  fs.writeFileSync(path.join(temp,'bg.json'),JSON.stringify({type:'regular_bg'}));
  const resources=[background,scene,shared].map(jsonContent=>({jsonContent}));
  const plans=prepareAffineBackgrounds(resources,temp);
  assert.equal(plans.length,1);assert.equal(scene.backgrounds[0].__affine,true);
  assert.equal(prepareAffineBackgrounds([{jsonContent:background},{jsonContent:{...structuredClone(scene),sceneType:'POINTNCLICK'}},{jsonContent:shared}],temp).length,0,'Direct bitmap scenes use native transforms without affine tile conversion');
  assert.equal(toRuntimeScene(scene).backgrounds[0].affine,true,'Preparation flags must survive runtime projection');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'bg.json'))).tiles_compression,'none');
  const crowded=structuredClone(scene);crowded.backgrounds.push(...[1,2,3].map(layerId=>({layerId,backgroundId:'bg'})));
  assert.throws(()=>prepareAffineBackgrounds([{jsonContent:background},{jsonContent:crowded},{jsonContent:shared}],temp),/hardware limit exceeded/);
  const commented=structuredClone(shared);commented.scripts[0].events[0].args.__comment=true;
  assert.equal(prepareAffineBackgrounds([{jsonContent:background},{jsonContent:structuredClone({...scene,backgrounds:[{layerId:0,backgroundId:'bg'}]})},{jsonContent:commented}],temp).length,0);
  fs.writeFileSync(path.join(temp,'bn_regular_bg_items_bg.h'),'regular_bg_tiles_item(span<const tile>(bg_bn_gfxTiles, 2), bpp_mode::BPP_4, compression_type::NONE), regular_bg_map_item(bg_bn_gfxMap[0], size(32, 32), compression_type::NONE)');
  fs.writeFileSync(path.join(temp,'bg_bn_gfx.s'),`bg_bn_gfxTiles:\n.word ${words.join(',')}\n\nbg_bn_gfxMap:\n.hword ${cells.join(',')}\n\nbg_bn_gfxPal:\n.hword ${Array(32).fill(0).join(',')}\n\n`);
  materializeAffineBackgrounds(plans,temp);
  const header=fs.readFileSync(path.join(temp,`bn_affine_bg_items_${plans[0].name}.h`),'utf8');
  assert.match(header,/affine_bg_tiles_item/);assert.match(header,/bpp_mode::BPP_8/);
  console.log('Background transformations passed: typed defaults and validation, reachable scripts, hardware limits, 4bpp palettes/flips, isolated animation tiles and affine header generation.');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
