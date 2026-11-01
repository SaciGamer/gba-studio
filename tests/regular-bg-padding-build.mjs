import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const dist=path.resolve('dist/main/utils/builders');
const {regularBgDimensions,fitRegularBgBmp}=await import(pathToFileURL(path.join(dist,'regularBgDimensions.js')));
const {encodeSpriteBmp,indexedTransparency}=await import(pathToFileURL(path.join(dist,'spriteCanvasPixels.js')));
const {AssetBuilder}=await import(pathToFileURL(path.join(dist,'AssetBuilder.js')));
const {default:ResourceBuilder}=await import(pathToFileURL(path.join(dist,'ResourceBuilder.js')));
assert.deepEqual(regularBgDimensions(730,200),{width:768,height:256});
assert.deepEqual(regularBgDimensions(256,256),{width:256,height:256});
assert.deepEqual(regularBgDimensions(1,1),{width:256,height:256});
assert.deepEqual(regularBgDimensions(513,257),{width:768,height:512});
assert.throws(()=>regularBgDimensions(16385,256));assert.throws(()=>regularBgDimensions(0,256));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-map-padding-')),assets=path.join(temp,'assets'),output=path.join(temp,'output');
const magick=path.resolve('bin/image-magick/magick.exe');
fs.mkdirSync(path.join(assets,'tilesets'),{recursive:true});fs.mkdirSync(path.join(assets,'backgrounds'),{recursive:true});fs.mkdirSync(path.join(output,'include'),{recursive:true});fs.mkdirSync(path.join(output,'src'),{recursive:true});
const solid=(w,h,r,g,b)=>{const a=new Uint8Array(w*h*4);for(let i=0;i<a.length;i+=4){a[i]=r;a[i+1]=g;a[i+2]=b;a[i+3]=255;}return encodeSpriteBmp(a,w,h);};
const original=solid(730,200,255,0,0);fs.writeFileSync(path.join(assets,'backgrounds/base.bmp'),original);fs.writeFileSync(path.join(assets,'tilesets/tiles.bmp'),solid(8,8,0,0,255));
const resource=jsonContent=>({resourceName:'test.h',resourceType:'gbasres',headerContent:Buffer.from(''),jsonContent});
const scene={_resourceType:'scene',id:'map',name:'map',width:730,height:200,gridSize:8,sceneType:'Platformer',backgrounds:[{layerId:0,x:17,y:9,selectedTilesetId:'tiles',tileMap:Array.from({length:25},()=>Array(92).fill(0))}],collisions:[{id:'edge',x:722,y:192,width:8,height:8,collisionSide:'solid'}]};
const background={_resourceType:'background',id:'base',name:'base',filename:'base.bmp',imageWidth:730,imageHeight:200,autoColor:true};
const settings={_resourceType:'settings',id:'settings',startSceneId:'map',startX:40,startY:5,startDirection:'right',startMoveSpeed:1,startAnimSpeed:6,colorMode:'mono',fadeDirection:1};
scene.backgrounds[0].tilePaletteIds=[['custom']];
const palettes={_resourceType:'palettes',palettes:[{id:'custom',colors:Array(16).fill('#00ff00')}]};
try {
 const builder=new AssetBuilder(path.resolve('dist'),output,magick),files=[resource(scene),resource(background),resource(settings),resource(palettes)];
 await builder.copyAssets(assets,files,{preserveStructure:false});
 assert.deepEqual([background.imageWidth,background.imageHeight],[768,256]);
 assert.deepEqual(fs.readFileSync(path.join(assets,'backgrounds/base.bmp')),original);
 const mask=indexedTransparency(fs.readFileSync(path.join(output,'graphics/base.bmp')));assert.equal(mask[0],0);assert.equal(mask[729],0);assert.equal(mask[730],1);assert.equal(mask[200*768],1);
 const derived=await builder.materializeTileLayerEdits(files);assert.equal(derived.length,1);assert.deepEqual([derived[0].imageWidth,derived[0].imageHeight],[768,256]);
 assert.deepEqual([scene.width,scene.height,scene.backgrounds[0].x,scene.backgrounds[0].y,settings.startX,settings.startY],[730,200,17,9,40,5]);
 const bitmap=path.join(output,'graphics',derived[0].filename),derivedMask=indexedTransparency(fs.readFileSync(bitmap));
 assert.equal(derivedMask[0],0);assert.equal(derivedMask[199*768+729],0);assert.equal(derivedMask[730],1);assert.equal(derivedMask[200*768],1);
 assert.match(execFileSync(magick,[bitmap,'-format','%[pixel:p{0,0}]','info:'],{encoding:'utf8',windowsHide:true}),/0,255,0/);
 assert.match(execFileSync(magick,[bitmap,'-format','%[pixel:p{8,0}]','info:'],{encoding:'utf8',windowsHide:true}),/0,0,255/);
 // Expanding an existing 256px background must not clip new painted columns.
 fs.writeFileSync(path.join(output,'graphics/small.bmp'),solid(256,256,255,0,0));
 files.push(resource({_resourceType:'background',id:'small',name:'small',filename:'small.bmp',imageWidth:256,imageHeight:256}));
 scene.backgrounds[0].backgroundId='small';
 const expanded=await builder.materializeTileLayerEdits(files);
 const expandedMask=indexedTransparency(fs.readFileSync(path.join(output,'graphics',expanded[0].filename)));
 assert.equal(expandedMask[199*768+729],0);
 assert.match(execFileSync(magick,[path.join(output,'graphics',expanded[0].filename),'-format','%[pixel:p{729,199}]','info:'],{encoding:'utf8',windowsHide:true}),/0,0,255/);
 // Reducing the playable map clips painted cells without shifting any origin.
 scene.width=320;scene.height=100;scene.backgrounds[0].backgroundId=undefined;
 const smaller=await builder.materializeTileLayerEdits(files);assert.deepEqual([smaller[0].imageWidth,smaller[0].imageHeight],[512,256]);
 const smallMask=indexedTransparency(fs.readFileSync(path.join(output,'graphics',smaller[0].filename)));assert.equal(smallMask[99*512+319],0);assert.equal(smallMask[320],1);assert.equal(smallMask[100*512],1);
 const compiler=new ResourceBuilder(output,path.resolve('tools/butano/template'));
 scene.width=730;scene.height=200;const compiled=[scene,settings,derived[0]].map(json=>compiler.processResourceObject(json));
 await compiler.generateResourceRegistryClass(compiled,{projectName:'padding'});
 const headers=compiled.map(file=>file.headerContent.toString()).join('\n');assert.match(headers,/IMAGEWIDTH[^\n]*768/);assert.match(headers,/IMAGEHEIGHT[^\n]*256/);assert.match(headers,/WIDTH[^\n]*730/);assert.match(headers,/HEIGHT[^\n]*200/);
 // Top-down BMP rows and palette bytes retain their exact index convention.
 const topDown=Buffer.from(original),offset=topDown.readUInt32LE(10),stride=Math.ceil(730*8/32)*4;
 topDown.writeInt32LE(-200,22);for(let y=0;y<200;y++)original.copy(topDown,offset+y*stride,offset+(199-y)*stride,offset+(200-y)*stride);
 assert.deepEqual(fitRegularBgBmp(topDown).data,fitRegularBgBmp(original).data);
 console.log('Regular BG padding passed: 730x200 -> 768x256, palette indices, transparent padding, shrink clipping, original assets and unchanged player/layer/scene coordinates.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
