import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const load=async filename=>{
 const bundle=await build({entryPoints:[path.resolve('src/renderer/frontend/src/utils',filename)],bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'worklet',setup(b){b.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default "mock";'}));}}]});
 return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const [tracker,{TrackerPreviewPlayer},pitch]=await Promise.all(['trackerModule.ts','trackerPreviewPlayer.ts','trackerXmMaxmodPitch.ts'].map(load));
const maxmodSource=fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c','utf8');
const maxmodArmSource=fs.readFileSync('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas_arm.c','utf8');
assert.match(maxmodSource,/case 7:\s*return mppe_Glissando\(param, period, act_ch, channel, layer\);/,'Maxmod dispatches XM 3xx to Gxx glissando');
assert.match(maxmodSource,/case 12:\s*return mppe_PortaVolume\(param, period, act_ch, channel, layer\);/,'Maxmod dispatches XM 5xx to portamento plus volume slide');
assert.match(maxmodSource,/static mm_word mppe_PortaVolume[\s\S]*?mm_word mem = channel->memory\[MPP_XM_IT_GLIS\];[\s\S]*?period = mppe_Glissando\(mem, period, act_ch, channel, layer\);/,'Maxmod XM 5xx reuses Gxx speed memory');
const parseMaxmodTable=name=>{
 const body=maxmodSource.match(new RegExp(`mpp_TABLE_${name}Table\\[\\] = \\{([\\s\\S]*?)\\};`))?.[1];
 assert.ok(body,`Maxmod defines ${name} table`);
 return [...body.replace(/\/\/.*$/gm,'').matchAll(/-?\d+/g)].map(value=>Number(value[0])).slice(0,256);
};
const upTable=parseMaxmodTable('LinearSlideUp');
const downTable=parseMaxmodTable('LinearSlideDown');
for(let parameter=0;parameter<256;parameter++)for(const direction of ['up','down']){
 let period=65536;
 if(direction==='up'&&parameter>=192)period*=2;
 const factor=direction==='up'?upTable[parameter]:downTable[parameter];
 const scaled=Math.floor((period>>5)*factor);
 const expected=direction==='up'?Math.min(1<<21,Math.floor(scaled/2048)+period):Math.floor(scaled/2048);
 assert.equal(pitch.trackerXmMaxmodLinearSlidePeriod(65536,parameter,direction),expected,`XM linear ${direction} slide parameter ${parameter} matches Maxmod`);
}
const pitchTableBody=maxmodArmSource.match(/IT_PitchTable\[\]\s*=\s*\{([\s\S]*?)\};/)?.[1];
assert.ok(pitchTableBody,'Maxmod defines the IT/XM linear pitch table');
const pitchTable=[...pitchTableBody.replace(/\/\/.*$/gm,'').matchAll(/-?\d+/g)].map(value=>Number(value[0]));
for(let note=0;note<120;note++)assert.equal(pitch.trackerXmMaxmodLinearPeriod(note-12),pitchTable[note*2]+pitchTable[note*2+1]*65536,`XM linear note ${note} period matches Maxmod`);
const mocks=fs.readFileSync('tests/tracker-preview-formats.mjs','utf8');
const {Context}=await import(`data:text/javascript;base64,${Buffer.from("import assert from 'node:assert/strict';\n"+mocks.slice(mocks.indexOf('class Param'),mocks.indexOf('const pcm ='))+'\nexport {Context};').toString('base64')}`);
const bytes=fs.readFileSync('templateEngineGame/sample_project_example/assets/musics/galgox_snowheart_melody.xm');
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
const samples=tracker.parseXmSamples(buffer);
assert.equal(samples.get(2)?.linearPeriods,true,'Galgox XM header selects Maxmod linear periods');
for(const instrument of [2,10])for(const effect of [3,5]){
 const sample=samples.get(instrument);
 const before=Float32Array.from(sample.samples);
 const player=new TrackerPreviewPlayer();
 const event=(note,effect=0,parameter=0,volume=0)=>({note,instrument:note?instrument:0,volume,effect,parameter});
 const rows=effect===3
  ? [[event(57)],[event(59,3,10)],[event(0,3,10)],[event(0)]]
  : [[event(57)],[event(59,3,10)],[event(59,5,0x20)],[event(0)]];
 await player.play(rows,1,4,115,[],samples,'XM');
 const voices=Context.latest.sources;
 const initialPitch=56+(sample.fineTune??0)/128;
 const expected=pitch.trackerXmMaxmodPlaybackRateScale(sample.sampleRate,initialPitch+sample.rootNote-48,48);
 assert.ok(Math.abs(voices[0].playbackRate.scheduledValues[0]-expected)<1e-10);
 assert.equal(voices.length,1,`XM ${effect===3?'3xx':'5xx'} preserves the active sample voice`);
 const values=voices[0].playbackRate.scheduledValues;
 assert.ok(Math.abs(values[1]-values[0])<1e-10,`XM ${effect===3?'3xx':'5xx'} begins from the active note's current tuning`);
 assert.ok(values.every(value=>value>expected*.9&&value<expected*1.3),`XM ${effect===3?'3xx':'5xx'} slide stays in the expected pitch range`);
 assert.ok(values.at(-1)>values[0],`XM ${effect===3?'3xx':'5xx'} moves toward the higher target using Maxmod Gxx speed memory`);
 let expectedPeriod=pitch.trackerXmMaxmodLinearPeriod(initialPitch+sample.rootNote-48);
 const targetPeriod=pitch.trackerXmMaxmodLinearPeriod(58+(sample.fineTune??0)/128+sample.rootNote-48);
 for(let tick=0;tick<6;tick++){
  const direction=expectedPeriod<targetPeriod?'up':'down';
  const next=pitch.trackerXmMaxmodLinearSlidePeriod(expectedPeriod,10,direction);
  expectedPeriod=direction==='up'?Math.min(targetPeriod,next):Math.max(targetPeriod,next);
 }
 const expectedEnd=pitch.trackerXmMaxmodPlaybackRateScale(sample.sampleRate,pitch.trackerXmMaxmodLinearPitch(expectedPeriod),48);
 assert.ok(Math.abs(values.at(-1)-expectedEnd)<1e-10,`XM ${effect===3?'3xx':'5xx'} follows Maxmod's linear-period slide table and tick count`);
 assert.deepEqual(sample.samples,before,'preview does not change imported PCM');
 player.stop();
}
// Exercise both possible pattern-number conventions around the reported edge:
// actual patterns 2/3/4, with the song's instrument/effect memory intact.
Context.prototype.resume=async function(){this.state='running';this.currentTime=10000;};
const transitionRows=tracker.parseTrackerPlaybackRows(buffer,'XM',65536).slice(128,320).map(row=>[row[3],row[4]]);
const transitionSnapshot=JSON.stringify(transitionRows);
const channelHasVoice=new Set();
let expectedVoices=0;
for(const row of transitionRows)row.forEach((event,channel)=>{
 if(event.note<=0||event.note>=97)return;
 if((event.effect===3||event.effect===5)&&channelHasVoice.has(channel))return;
 expectedVoices+=1;
 channelHasVoice.add(channel);
});
const transitionPlayer=new TrackerPreviewPlayer();
await transitionPlayer.play(transitionRows,2,4,115,[],samples,'XM');
const transitionContext=Context.latest;
const deadline=Date.now()+3000;
while(transitionContext.sources.length<expectedVoices&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(transitionContext.sources.length,expectedVoices,'actual Galgox transitions keep legato notes on the existing voice');
for(const source of transitionContext.sources){
 const rates=source.playbackRate.scheduledValues;
 assert.ok(rates.every(rate=>rate>rates[0]*.5),'actual Galgox portamento must not fall several octaves outside the melody');
}
assert.equal(JSON.stringify(transitionRows),transitionSnapshot,'song event data remains unchanged');
transitionPlayer.stop();
console.log('Real Galgox instruments 2/10: Maxmod XM 3xx/5xx glissando memory, continuous pitch, and imported PCM immutability passed.');
console.log('Actual Galgox pattern transitions 2 -> 3 -> 4 match Maxmod note-trigger and voice counts.');
