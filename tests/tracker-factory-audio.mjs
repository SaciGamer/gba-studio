import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const load = async filename => {
  const result=await build({entryPoints:[path.resolve('src/renderer/frontend/src/utils',filename)],bundle:true,write:false,platform:'node',format:'esm',
    plugins:[{name:'worklet',setup(b){b.onResolve({filter:/\?url$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default "mock";'}));}}]});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [factory,legacy,composition,exporter,tracker,modLib,preview,tuning]=await Promise.all([
  'trackerInstrumentLibrary.ts','trackerLegacyInstrumentLibrary.ts','trackerComposition.ts','trackerCompositionExport.ts','trackerModule.ts','modPlayer.ts','trackerPreviewPlayer.ts','trackerFactoryTuning.ts',
].map(load));
const viewerPath='src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx';
const viewerAst=ts.createSourceFile(viewerPath,fs.readFileSync(viewerPath,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let buildSamples;
const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(viewerAst)==='buildInstrumentSamples')buildSamples=node.initializer.getText(viewerAst);ts.forEachChild(node,visit);};visit(viewerAst);assert.ok(buildSamples);
const buildViewerSamples=project=>{
 const context={projectPackage:true,musicComposition:{current:project},info:{format:project.targetFormat},mod:null,trackerSamples:new Map(),
  Float32Array,Uint8Array,DataView,Map,base64ToBytes:encoded=>new Uint8Array(Buffer.from(encoded,'base64')),
  isMusicCompositionDocument:composition.isMusicCompositionDocument,factorySamplePreviewTuning:tuning.factorySamplePreviewTuning};
 vm.createContext(context);vm.runInContext(ts.transpile(`var buildInstrumentSamples = ${buildSamples};`,{target:ts.ScriptTarget.ES2022}),context);
 return context.buildInstrumentSamples(true);
};
// Exercise real Web Audio scheduling and Maxmod-converted PCM, without an audio device.
const audioTest=fs.readFileSync('tests/tracker-preview-formats.mjs','utf8');
const mocks=audioTest.slice(audioTest.indexOf('class Param'),audioTest.indexOf('const pcm ='));
const {Context}=await import(`data:text/javascript;base64,${Buffer.from("import assert from 'node:assert/strict';\n"+mocks+'\nexport {Context};').toString('base64')}`);

const signed=bytes=>Float32Array.from(bytes,value=>(value>127?value-256:value)/128);
const rms=values=>Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
const cents=(actual,expected)=>1200*Math.log2(actual/expected);
function pitch(samples,rate,expected) {
  const period=rate/expected;
  if(samples.length<period*8)samples=Float32Array.from({length:Math.ceil(period*16)},(_,index)=>samples[index%samples.length]);
  const low=Math.max(2,Math.floor(period*0.85)),high=Math.ceil(period*1.15);
  const difference=lag=>{
    let sum=0; const count=Math.floor(Math.min(samples.length-high-1,4096)/Math.round(period))*Math.round(period);
    for(let index=0;index<count;index++)sum+=(samples[index]-samples[index+lag])**2;
    return sum/Math.max(1,count);
  };
  let best=low;for(let lag=low+1;lag<=high;lag++)if(difference(lag)<difference(best))best=lag;
  const a=difference(best-1),b=difference(best),c=difference(best+1);
  const fraction=(a-c)/(2*(a-2*b+c));
  return rate/(best+(Number.isFinite(fraction)?Math.max(-0.5,Math.min(0.5,fraction)):0));
}
const bank=factory.createTrackerStarterInstrumentBank();
assert.equal(bank.length,42);
const melodic=bank.filter((preset,index)=>preset.category==='Wave'||preset.category==='Duty'&&index<=8);
const expectedC4=440*2**(-9/12);
for(const preset of melodic){
  const start=preset.loopStart||0;
  const values=signed(preset.pcm).slice(start);
  const hz=pitch(values,factory.TRACKER_FACTORY_SAMPLE_RATE,expectedC4);
  assert.ok(Math.abs(cents(hz,expectedC4))<4,`${preset.category} ${preset.name}: C4 ${hz.toFixed(2)} Hz`);
}
const wave=bank.filter(item=>item.category==='Wave');
for(const [index,width] of [[0,.125],[1,.25],[2,.3125],[3,.375],[4,.4375],[5,.5]]){
  assert.equal([...signed(wave[index].pcm).slice(0,32)].filter(value=>value>0).length/32,width,`${wave[index].name} has the named duty cycle`);
}
assert.ok(Math.abs(rms(signed(wave[6].pcm))/rms(signed(wave[5].pcm))-5/15)<.015);
assert.ok(Math.abs(rms(signed(wave[7].pcm))/rms(signed(wave[5].pcm))-3/15)<.015);
assert.ok(Math.abs(rms(signed(wave[8].pcm))/rms(signed(wave[5].pcm))-1/15)<.015);
const duty=bank.filter(item=>item.category==='Duty');
assert.ok(rms(signed(duty[2].pcm).slice(0,128))<rms(signed(duty[2].pcm).slice(-128))*.7,'fade-in grows');
for(const index of [0,1])assert.ok(rms(signed(duty[index].pcm).slice(0,128))>rms(signed(duty[index].pcm).slice(-128))*1.5,'fade-out decays');
for(const index of [3,4,5,10])assert.equal(duty[index].loop,false,'short hits and bass drum do not loop');
for(const index of [11,12,13]){
  assert.notDeepEqual(duty[index].pcm.slice(128,384),duty[index].pcm.slice(1024,1280),'sweeps actually change pitch');
  const hz=pitch(signed(duty[index].pcm).slice(duty[index].loopStart),factory.TRACKER_FACTORY_SAMPLE_RATE,expectedC4);
  assert.ok(Math.abs(cents(hz,expectedC4))<4,'sweeps settle to the played note');
}
const noise=bank.filter(item=>item.category==='Noise');
assert.equal(new Set(noise.map(item=>Buffer.from(item.pcm).toString('base64'))).size,14);
assert.ok(noise.every(item=>!item.loop&&item.pcm.at(-1)===0),'percussion releases without looping');
assert.ok(rms(signed(noise[3].pcm).slice(1024))>rms(signed(noise[0].pcm).slice(1024))*3,'open hi-hat rings longer than closed');

const nativeModules=new Map();
for(const format of ['MOD','XM','S3M','IT']){
  for(const id of ['sine-lead','pulse-lead','triangle-bass','electric-guitar','acoustic-guitar','keyboard','saxophone','violin']){
   for(const note of [49,58,61]) {
    let project=composition.createMusicCompositionForTarget(format);
    project=composition.addMusicCompositionInstrumentPreset(project,id);
    const instrument=project.instruments.at(-1);
    project=composition.editMusicCompositionNotes(project,0,[{start:0,end:8,pitch:note,channelIndex:0,instrumentIndex:instrument.index+1}]);
    const buffer=exporter.exportMusicComposition(project,format).moduleData;
    if(id==='sine-lead'&&note===49)nativeModules.set(format,buffer);
    const samples=format==='XM'?tracker.parseXmSamples(buffer):format==='S3M'?tracker.parseS3mSamples(buffer):format==='IT'?tracker.parseItSamples(buffer):new Map();
    let row;
    if(format==='MOD'){
      const module=modLib.parseModModule(buffer);
      module.samples.forEach((sample,index)=>samples.set(index+1,{samples:Float32Array.from(module.bytes.slice(sample.dataOffset,sample.dataOffset+sample.length),value=>(value>127?value-256:value)/128),sampleRate:8363,rootNote:49,fineTune:sample.finetune,volume:sample.volume,loopStart:sample.loopStart,loopEnd:sample.loopStart+sample.loopLength,loopType:sample.loopLength>2?1:0}));
      row=module.patterns[0][0].map(event=>({note:event.period?Math.round(49+12*Math.log2(428/event.period)):0,period:event.period,instrument:event.sample,volume:0,effect:event.effect,parameter:event.parameter}));
    }else row=(format==='XM'?tracker.parseXmPatternRows(buffer,0,64):format==='S3M'?tracker.parseS3mPatternRows(buffer,0,64):tracker.parseItPatternRows(buffer,0,64))[0];
    const player=new preview.TrackerPreviewPlayer();
    await player.play([row],project.channels.length,6,125,[],samples,format);
    const source=Context.latest.sources[0];
    assert.ok(source,`${format} ${id} schedules audio`);
    const rate=source.buffer.sampleRate*(source.playbackRate.scheduledValues[0]??source.playbackRate.value);
    const data=source.buffer.getChannelData(0);
    const expected=expectedC4*2**((note-49)/12);
    const hz=pitch(data.slice(id==='violin'?Math.floor(data.length*.55):0),rate,expected);
    assert.ok(Math.abs(cents(hz,expected))<8,`${format} ${id} note ${note} is ${hz.toFixed(2)} Hz (${cents(hz,expected).toFixed(2)} cents)`);
    player.stop();
    const canonicalSamples=buildViewerSamples(project);
    await player.auditionNote(note,instrument.index+1,canonicalSamples,format);
    const audition=Context.latest.sources[0];
    const auditionData=audition.buffer.getChannelData(0);
    const auditionHz=pitch(auditionData.slice(id==='violin'?Math.floor(auditionData.length*.55):0),audition.buffer.sampleRate*audition.playbackRate.value,expected);
    assert.ok(Math.abs(cents(auditionHz,expected))<8,`${format} canonical ${id} note ${note} matches the exported tuning (${auditionHz.toFixed(2)} Hz)`);
    player.stop();
   }
  }
}
// Factory upgrades preserve user-edited audio and tuning, and are idempotent.
let old=composition.createMusicCompositionWithStarterBank('XM');
const oldBank=legacy.createLegacyTrackerStarterInstrumentBank();
old={...old,samples:old.samples.map((sample,index)=>({...sample,pcmData:Buffer.from(oldBank[index].pcm).toString('base64'),sampleRate:8363,tuningFormat:undefined,loopStart:oldBank[index].loopStart,loopEnd:oldBank[index].loopEnd,loopType:oldBank[index].loop?'forward':'none'}))};
old.samples[1]={...old.samples[1],fineTune:8};
old.samples[2]={...old.samples[2],pcmData:Buffer.from(new Uint8Array(2048)).toString('base64')};
const upgraded=composition.repairMusicCompositionStarterLoops(old);
assert.equal(upgraded.samples[0].sampleRate,factory.TRACKER_FACTORY_SAMPLE_RATE);
assert.equal(upgraded.samples[1],old.samples[1]);assert.equal(upgraded.samples[2],old.samples[2]);
assert.equal(composition.repairMusicCompositionStarterLoops(upgraded),upgraded);
const editable=upgraded.samples[0];
for(let value=-8;value<=7;value++)assert.equal(tuning.factorySamplePreviewTuning({...editable,...tuning.factorySampleTuningEdit(editable,'MOD',{fineTune:value})},'MOD').fineTune,value,'MOD tuning edits preserve the displayed value');
for(let value=-128;value<=127;value+=17){
 const result=tuning.factorySamplePreviewTuning({...editable,...tuning.factorySampleTuningEdit(editable,'XM',{fineTune:value})},'XM');
 assert.ok(Math.abs(result.rootNote-48+result.fineTune/128-value/128)<1/128,'XM tuning edits preserve the requested pitch');
}
const mmutil=path.join(process.env.DEVKITPRO??'','tools','bin',process.platform==='win32'?'mmutil.exe':'mmutil');
assert.ok(fs.existsSync(mmutil),'native factory audit requires DEVKITPRO/mmutil');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gba-studio-factory-audio-'));
try {
 for(const [format,buffer] of nativeModules){
  const input=path.join(directory,`factory.${format.toLowerCase()}`),output=path.join(directory,`factory-${format}.bin`);
  fs.writeFileSync(input,new Uint8Array(buffer));
  const result=spawnSync(mmutil,[input,`-o${output}`],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,`${format} native conversion: ${result.stderr}`);
  assert.ok(fs.statSync(output).size>2048,`${format} native bank retains factory audio`);
 }
}finally{
 assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
 assert.ok(path.basename(directory).startsWith('gba-studio-factory-audio-'));
 fs.rmSync(directory,{recursive:true,force:true});
}
console.log('42 factory instruments audited: pitch, duty widths, envelopes, volume steps, sweeps, percussion variation, 192 exported/canonical preset auditions (C4/A4/C5 within 8 cents) and non-destructive upgrades passed.');
console.log('Native mmutil conversion passed for factory MOD/XM/S3M/IT modules.');
