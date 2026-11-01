import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const load = async filename => {
  const result = await build({ entryPoints: [path.resolve('src/renderer/frontend/src/utils', filename)], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [options, library, composition, exporter, tracker] = await Promise.all([
  'trackerInstrumentOptions.ts', 'trackerInstrumentLibrary.ts', 'trackerComposition.ts', 'trackerCompositionExport.ts', 'trackerModule.ts',
].map(load));
const categories = Object.fromEntries(Array.from({length:42},(_,index)=>[index+1,index<14?'Duty':index<28?'Wave':'Noise']));
assert.equal(options.trackerInstrumentHierarchyNumber(43,categories),1);
assert.equal(options.trackerInstrumentHierarchyNumber(44,categories),2);
assert.equal(options.trackerInstrumentHierarchyNumber(15,categories),1);
assert.equal(options.trackerInstrumentHierarchyNumber(29,categories),1);
assert.equal(options.trackerInstrumentHierarchyNumber(3,{}),3,'uncategorized imported modules keep sequential numbering');
const names=Object.fromEntries(Array.from({length:44},(_,index)=>[index+1,`Instrument ${index+1}`]));
const other=options.trackerInstrumentOptions(names,categories,{},0,key=>key).find(group=>group.label==='music.instruments.other');
assert.deepEqual(other.options.map(option=>[option.value,option.label.slice(0,2)]),[[43,'01'],[44,'02']]);
const preset=library.TRACKER_INSTRUMENT_PRESETS.find(preset=>preset.id==='violin');
assert.ok(preset);
const pcm=library.createTrackerInstrumentPresetPcm('violin');
assert.deepEqual(pcm,library.createTrackerInstrumentPresetPcm('violin'),'factory audio is deterministic');
assert.ok(new Set(pcm).size>64,'violin contains non-silent PCM');
assert.deepEqual(pcm.slice(preset.loopStart,preset.loopStart+64),pcm.slice(-64),'sustain loop repeats the same complete waveform');
for(const format of ['MOD','XM','S3M','IT']) {
  const base=composition.createMusicCompositionWithStarterBank(format);
  const withViolin=composition.addMusicCompositionInstrumentPreset(base,'violin');
  const instrument=withViolin.instruments.at(-1), sample=withViolin.samples.at(-1);
  assert.equal(instrument.name,'Violin');
  assert.equal(options.trackerInstrumentHierarchyNumber(instrument.index+1,categories),1);
  assert.equal(sample.loopType,'forward'); assert.equal(sample.loopStart,1024); assert.equal(sample.loopEnd,2048);
  const authored=composition.editMusicCompositionNotes(withViolin,0,[{start:0,end:8,pitch:61,channelIndex:0,instrumentIndex:instrument.index+1}]);
  const exported=exporter.exportMusicComposition(authored,format);
  const info=tracker.parseTrackerModule(exported.moduleData,format);
  assert.equal(info.format,format);
  assert.ok(exported.moduleData.byteLength>2048);
}
console.log('Other instrument numbering starts at 01 without changing IDs; violin preset PCM, sustain loop and MOD/XM/S3M/IT export passed.');
