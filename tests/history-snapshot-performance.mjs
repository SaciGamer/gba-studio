import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { performance } from 'node:perf_hooks';
const bundled = await build({entryPoints:['src/renderer/frontend/src/providers/historySnapshot.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const { createHistorySnapshotCache } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const cache=createHistorySnapshotCache();
const sceneId=randomUUID(), otherSceneId=randomUUID(), actorId=randomUUID(), spriteId=randomUUID();
const initial={scenes:[{id:sceneId,_saved:true,actors:[{id:actorId,x:1}]},{id:otherSceneId,_saved:true,actors:[]}],sprites:[{id:spriteId,_saved:true,tiles:Array(1000).fill(0)}],selected:{id:sceneId},variables:[]};
const first=cache.capture(initial);
assert.equal(first.scenes[0]._saved,false);
assert.notEqual(first.scenes,initial.scenes,'history owns copies of live containers');
const edited={...initial,scenes:[{...initial.scenes[0],actors:[{id:actorId,x:2}]},initial.scenes[1]]};
const second=cache.capture(edited);
assert.equal(second.sprites,first.sprites);
assert.equal(second.scenes[1],first.scenes[1]);
assert.equal(first.scenes[0].actors[0].x,1);
assert.equal(cache.capture({...edited,scenes:edited.scenes.map(scene=>({...scene,_saved:false}))}),second,'save flags cannot create history steps');
const restored=cache.restore(first,edited);
assert.equal(restored.sprites,edited.sprites,'undo must retain unaffected live resources');
assert.equal(restored.scenes[1],edited.scenes[1]);
assert.equal(restored.scenes[0].actors[0].x,1);
assert.equal(restored.scenes[0]._saved,false,'restored changes must be saved');
assert.equal(cache.capture(restored),first);
const redone=cache.restore(second,restored);
assert.equal(redone.scenes[0].actors[0].x,2);
assert.equal(redone.sprites,initial.sprites);
const reordered=cache.restore(cache.capture({...initial,scenes:[initial.scenes[1],initial.scenes[0]]}),initial);
assert.equal(reordered.scenes[0],initial.scenes[1],'reordering must preserve unchanged resources by ID');
assert.equal(reordered.scenes[1],initial.scenes[0]);

let reads=0;
const heavy={id:randomUUID(),get data(){reads++;return Array(10000).fill('tile');}};
const warmed=createHistorySnapshotCache();warmed.capture({heavy,position:0});reads=0;
for(let i=1;i<=100;i++)warmed.capture({heavy,position:i});
assert.equal(reads,0,'unchanged assets must not be traversed during editing');

const project = {
 scenes: Array.from({length:150}, () => ({
  id: randomUUID(), _saved:true,
  actors: Array.from({length:40}, (_,j) => ({
   id: randomUUID(), x:j,
   script: Array.from({length:8}, (_,k) => ({id:randomUUID(),command:'WAIT',args:{frames:k}})),
  })),
 })),
};
const benchmark=createHistorySnapshotCache();benchmark.capture(project);
let value=project;
const edits=40;
let started=performance.now();
for(let i=0;i<edits;i++){
 value={...value,scenes:[{...value.scenes[0],x:i},...value.scenes.slice(1)]};
 JSON.parse(JSON.stringify(value));
}
const fullCloneMs=performance.now()-started;
value=project;started=performance.now();
for(let i=0;i<edits;i++){
 value={...value,scenes:[{...value.scenes[0],x:i},...value.scenes.slice(1)]};
 benchmark.capture(value);
}
const sharedMs=performance.now()-started;
console.log(`History snapshots passed: isolation, structural sharing, save acknowledgements, dirty restore, redo, reorder and zero traversal of unchanged assets. Synthetic ${edits}-edit benchmark: full JSON copies ${fullCloneMs.toFixed(1)} ms; incremental snapshots ${sharedMs.toFixed(1)} ms.`);
