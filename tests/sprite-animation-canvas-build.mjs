import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';import{deflateSync}from'node:zlib';
const root=path.resolve('.'),dist=path.join(root,'dist/main/utils/builders');
const {createSpriteCanvasPlan}=await import(pathToFileURL(path.join(dist,'spriteCanvasPlan.js')));
const {composeSpriteCanvas,encodeSpriteBmp,indexedTransparency}=await import(pathToFileURL(path.join(dist,'spriteCanvasPixels.js')));
const {AssetBuilder}=await import(pathToFileURL(path.join(dist,'AssetBuilder.js')));
const {ResourceBuilder}=await import(pathToFileURL(path.join(dist,'ResourceBuilder.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-studio-sprite-canvas-'));const assets=path.join(temp,'assets'),output=path.join(temp,'output'),magick=path.join(root,'bin/image-magick/magick.exe');fs.mkdirSync(path.join(assets,'sprites'),{recursive:true});fs.mkdirSync(path.join(output,'graphics'),{recursive:true});fs.mkdirSync(path.join(output,'build'),{recursive:true});fs.mkdirSync(path.join(output,'include'),{recursive:true});fs.mkdirSync(path.join(output,'src'),{recursive:true});
const width=16,height=16,pixels=new Uint8Array(width*height*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const at=(y*width+x)*4;pixels[at+(x<4?0:2)]=255;pixels[at+3]=255;}
const piece={id:'piece',sourceX:0,sourceY:0,width:8,height:8,x:4,y:3,flipX:true};
const resource={_resourceType:'sprite',id:'hero',name:'hero',filename:'source.bmp',imageWidth:16,imageHeight:16,playerFrameWidth:16,playerFrameHeight:16,playerAnimSpeed:8,playerIdleFrame:0,playerAnimationStates:[{id:'normal',type:'fixed-direction',animations:[{id:'idle',type:'idle',frames:[],canvasFrames:[{id:'composed',width:16,height:16,pieces:[piece]},{id:'empty',width:16,height:16,pieces:[]}]}]},{id:'other',type:'fixed-direction',animations:[{id:'idle-other',type:'idle',frames:[0]}]}]};
try{
 const plan=createSpriteCanvasPlan(resource,width,height);assert.equal(plan.frames.length,3);assert.equal(plan.width,48);assert.equal(plan.height,16);assert.deepEqual(plan.animations.map(a=>a.frames),[[0,1],[2]]);
 for(const id of ['idle','running']) {
  const platform=createSpriteCanvasPlan({...resource,playerAnimationStates:[{id:'platform-player',flipRightToCreateLeftFacingFrames:true,animations:[{id,type:id==='idle'?'idle':'movement',canvasFrames:[{id:'small',width:12,height:16,pieces:[{...piece,x:0}]}]}]}]},width,height);
  assert.equal(platform.frames.length,2);assert.equal(platform.animations[1].id,id==='idle'?'idle-left':'moving-left');assert.equal(platform.frames[1].pieces[0].x,4);assert.equal(platform.frames[1].pieces[0].flipX,false);
 }
 const rgba=composeSpriteCanvas(pixels,width,height,plan);const pixel=(x,y)=>Array.from(rgba.slice((y*plan.width+x)*4,(y*plan.width+x)*4+4));assert.deepEqual(pixel(4,3),[0,0,255,255]);assert.deepEqual(pixel(11,3),[255,0,0,255]);assert.deepEqual(pixel(16,0),[0,0,0,0]);assert.deepEqual(pixel(32,0),[255,0,0,255]);
 const vertical=createSpriteCanvasPlan({...resource,playerAnimationStripOrientation:'vertical'},width,height);assert.equal(vertical.width,16);assert.equal(vertical.height,48);const verticalPixels=composeSpriteCanvas(pixels,width,height,vertical);assert.deepEqual(Array.from(verticalPixels.slice((35*16+4)*4,(35*16+4)*4+4)),[0,0,255,255]);
 const padded=createSpriteCanvasPlan({...resource,playerAnimationStates:[{id:'padded',animations:[{id:'idle-right',type:'idle',canvasFrames:[{id:'frame',width:24,height:16,pieces:[piece]}]}]}]},16,16);
 assert.equal(padded.frameWidth,32);assert.deepEqual(padded.animations.map(animation=>animation.id),['idle-right','idle-left']);
 const left=padded.frames[padded.animations[1].frames[0]];assert.equal(left.pieces[0].x,12);assert.equal(left.pieces[0].flipX,false);
 const source=path.join(assets,'sprites/source.bmp');fs.writeFileSync(source,encodeSpriteBmp(pixels,width,height));const original=fs.readFileSync(source);
 fs.writeFileSync(path.join(output,'graphics/source.bmp'),original);fs.writeFileSync(path.join(output,'graphics/source.json'),'{}');fs.writeFileSync(path.join(output,'build/bn_sprite_items_source.h'),'stale');
 const builder=new ResourceBuilder(output,path.join(root,'tools/butano/template'));const file=builder.processResourceObject(resource);
 const assetBuilder = new AssetBuilder(path.join(root,'dist'),output,magick);
 await assetBuilder.copyAssets(assets,[file],{preserveStructure:false});
 const baked=file.jsonContent.__spriteCanvas;assert.ok(baked);assert.ok(baked.graphicsName.length<64);assert.equal(fs.existsSync(path.join(output,'graphics/source.bmp')),false);assert.equal(fs.existsSync(path.join(output,'build/bn_sprite_items_source.h')),false);assert.deepEqual(fs.readFileSync(source),original);
 const generatedSpritePath=path.join(output,'graphics',baked.graphicsName+'.bmp');const generatedSpriteMtime=fs.statSync(generatedSpritePath).mtimeMs;
 await assetBuilder.copyAssets(assets,[file],{preserveStructure:false});
 assert.equal(fs.statSync(generatedSpritePath).mtimeMs,generatedSpriteMtime,'An unchanged sprite canvas is reused between builds');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'graphics',baked.graphicsName+'.json'))),{type:'sprite',width:16,height:16});
 const bmp=fs.readFileSync(path.join(output,'graphics',baked.graphicsName+'.bmp'));const mask=indexedTransparency(bmp);assert.equal(mask[3*48+4],0);assert.equal(mask[16],1);
 const regenerated=builder.processResourceObject(file.jsonContent);const header=regenerated.headerContent.toString();assert.match(header,/ANIMATION_0_FRAMES\[\] = \{ 0, 1 \}/);assert.match(header,/ANIMATION_1_FRAMES\[\] = \{ 2 \}/);assert.doesNotMatch(header,/SpriteCanvasPiece|SpriteCanvasFrameDefinition|__SPRITECANVAS/);
 await builder.generateResourceRegistryClass([regenerated],{projectName:'sprite_canvas'});const registry=fs.readFileSync(path.join(output,'src/resource_registry.cpp'),'utf8');assert.ok(registry.includes(baked.graphicsName));assert.match(registry,new RegExp(`"${baked.graphicsName}", 16, 16, 8, 0,`));
 assert.throws(()=>createSpriteCanvasPlan({...resource,playerAnimationStates:[{id:'x',animations:[{id:'bad',frames:[99]}]}]},16,16),/outside/);
 assert.throws(()=>createSpriteCanvasPlan({...resource,playerAnimationStates:[{id:'x',animations:[{id:'bad',canvasFrames:[{id:'big',width:128,height:16,pieces:[]}]}]}]},16,16),/supported/);
 assert.throws(()=>createSpriteCanvasPlan({...resource,playerFrameWidth:1.5},16,16),/integers/);
 // Packed PNG indices, including Adam7 passes, preserve duplicate palette colors.
 for(const depth of [1,2,4,8])for(const interlace of [0,1]){
  const w=9,h=7,chunks=[];const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  for(const[sx,sy,dx,dy]of passes){const pw=Math.max(0,Math.ceil((w-sx)/dx)),ph=Math.max(0,Math.ceil((h-sy)/dy));if(!pw||!ph)continue;for(let y=0;y<ph;y++){const row=Buffer.alloc(1+Math.ceil(pw*depth/8));for(let x=0;x<pw;x++){const index=((sx+x*dx)+(sy+y*dy))%2;row[1+((x*depth)>>3)]|=index<<(8-depth-((x*depth)&7));}chunks.push(row);}}
  const chunk=(type,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);return out;};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=depth;ihdr[9]=3;ihdr[12]=interlace;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',Buffer.from([0,0,0,0,0,0])),chunk('IDAT',deflateSync(Buffer.concat(chunks))),chunk('IEND',Buffer.alloc(0))]);const mask=indexedTransparency(png);for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.equal(mask[y*w+x],(x+y)%2===0?1:0);
 }
 console.log('Sprite canvas export passed: composition, flips, empty frames, state offsets, both orientations, original-source exclusion, palette indices and generated runtime registry.');
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gba-studio-sprite-canvas-'));fs.rmSync(temp,{recursive:true,force:true});}
