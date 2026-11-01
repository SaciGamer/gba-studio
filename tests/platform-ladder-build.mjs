import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const {default:ResourceBuilder}=await import(pathToFileURL(path.resolve('dist/main/utils/builders/ResourceBuilder.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-ladder-build-'));
try {
 fs.mkdirSync(path.join(temp,'include'),{recursive:true});
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 const scene=builder.processResourceObject({_resourceType:'scene',id:'platform',name:'platform',sceneType:'Platformer',width:256,height:256,collisions:[{id:'stairs',x:32,y:16,width:16,height:112,collisionSide:'ladder'}]});
 await builder.writeResourceHeader([scene]);
 const files=fs.readdirSync(path.join(temp,'include'));
 const contents=files.map(file=>fs.readFileSync(path.join(temp,'include',file),'utf8')).join('\n');
 assert.match(contents,/"stairs",\s*32,\s*16,\s*16,\s*112,\s*"ladder"/);
 console.log('Platform ladder scene collision survives native resource generation.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
