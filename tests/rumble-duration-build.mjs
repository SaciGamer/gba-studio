import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {ResourceBuilder} from '../dist/main/utils/builders/ResourceBuilder.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-rumble-duration-'));
try {
 fs.mkdirSync(path.join(temp,'include'));
 const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));
 for(const [durationFrames,durationUnit] of [[8,undefined],[30,'seconds'],[120,'frames']]) {
  const args={durationFrames,intensity:25,...durationUnit?{durationUnit}:{}};
  const result=builder.processResourceObject({_resourceType:'scene',id:'rumble',backgrounds:[],script:[{id:'rumble',command:'EVENT_RUMBLE',version:1,args}]});
  assert.match(result.headerContent.toString(),new RegExp(`RumbleEventData .* = \\{ ${durationFrames}, 25 \\}`));
 }
 console.log('Rumble duration build passed: legacy and unit-aware editor values emit the same frame-based native ABI.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
