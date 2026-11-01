import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const load=async filename=>{
 const bundle=await build({entryPoints:[path.resolve('src/renderer/frontend/src/utils',filename)],bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'worklet',setup(b){b.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default "mock";'}));}}]});
 return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const [{TrackerPreviewPlayer},{trackerS3mMaxmodAmigaPeriod,trackerS3mMaxmodMixerStepQ12,trackerS3mMaxmodMixerStepQ12FromPeriod}]=await Promise.all(['trackerPreviewPlayer.ts','trackerS3mMaxmodPitch.ts'].map(load));
const maxmod=fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c','utf8');
assert.match(maxmod,/static mm_word mppe_glis_backdoor[\s\S]*?mpph_PitchSlide_Down\(channel->period, param, layer\)[\s\S]*?mpph_PitchSlide_Up\(channel->period, param, layer\)/,'Maxmod Gxx slides the active Amiga period toward its target');
assert.match(maxmod,/mm_word delta = slide_value << 4;/,'Maxmod regular Amiga portamento moves by speed shifted four bits');
const mocks=fs.readFileSync('tests/tracker-preview-formats.mjs','utf8');
const {Context}=await import(`data:text/javascript;base64,${Buffer.from("import assert from 'node:assert/strict';\n"+mocks.slice(mocks.indexOf('class Param'),mocks.indexOf('const pcm ='))+'\nexport {Context};').toString('base64')}`);
const sample={samples:Float32Array.from([0,.5,-.5,0]),sampleRate:8363,loopStart:0,loopEnd:0,loopType:0,rootNote:49,sixteenBit:false,volume:64,maxmodSampleGlobalVolume:64,maxmodInstrumentGlobalVolume:128};
const event=(note,effect=0,parameter=0)=>({note,instrument:note?1:0,volume:0,effect,parameter});
const rows=[[event(0x40)],[event(0x42,7,2)],[event(0,7,0)],[event(0)]];
const player=new TrackerPreviewPlayer();
await player.play(rows,1,4,125,[],new Map([[1,sample]]),'S3M');
const voice=Context.latest.sources[0];
const values=voice.playbackRate.scheduledValues;
const sampleRate=sample.sampleRate;
const startPeriod=trackerS3mMaxmodAmigaPeriod(sampleRate,49);
const targetPeriod=trackerS3mMaxmodAmigaPeriod(sampleRate,51);
let period=startPeriod;
for(let tick=0;tick<6;tick++)period=period<targetPeriod?Math.min(targetPeriod,period+(2<<4)):Math.max(targetPeriod,period-(2<<4));
const expected=trackerS3mMaxmodMixerStepQ12FromPeriod(period)/trackerS3mMaxmodMixerStepQ12(sampleRate,49);
assert.equal(Context.latest.sources.length,1,'S3M Gxx holds the existing Maxmod voice');
assert.ok(Math.abs(values.at(-1)-expected)<1e-10,`S3M Gxx preview follows Maxmod Amiga-period steps and the quantized GBA mixer rate (${values.at(-1)} vs ${expected}; ${values.join(',')})`);
player.stop();
console.log('S3M Gxx preview uses Maxmod Amiga-period target, speed<<4 tick steps, and GBA mixer pitch quantization.');
