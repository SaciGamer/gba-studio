import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';
import { build } from 'esbuild';

const ipc = new EventEmitter(); const calls = []; const pending = [];
ipc.invoke = (channel, ...args) => { calls.push([channel,...args]); return new Promise((resolve,reject)=>pending.push({channel,args,resolve,reject})); };
let api;
const preload = ts.transpileModule(fs.readFileSync('src/main/preload/preload.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(preload,{require:()=>({ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(_,value)=>{api=value;}},webUtils:{}}),structuredClone});
const count = channel => calls.filter(call=>call[0]===channel).length;
const reads=Array.from({length:12},()=>api.loadPreferences());
assert.equal(count('loadPreferences'),1);
pending.shift().resolve({theme:'dark',recentProjects:[]});
const results=await Promise.all(reads);results[0].recentProjects.push({path:'mutated'});
assert.deepEqual(results[1].recentProjects,[]);
assert.deepEqual((await api.loadPreferences()).recentProjects,[]);
assert.equal(count('loadPreferences'),1,'sequential startup components share the loaded snapshot too');
ipc.emit('preferences-updated');const refreshed=api.loadPreferences();pending.shift().resolve({theme:'light'});
assert.equal((await refreshed).theme,'light');assert.equal(count('loadPreferences'),2);
ipc.emit('preferences-updated');const stale=api.loadPreferences();const old=pending.shift();
ipc.emit('preferences-updated');const latest=api.loadPreferences();const current=pending.shift();
old.resolve({theme:'stale'});current.resolve({theme:'latest'});
assert.equal((await stale).theme,'latest','invalidation during IPC must not reintroduce an old snapshot');
assert.equal((await latest).theme,'latest');
ipc.emit('preferences-updated');const failed=api.loadPreferences();pending.shift().reject(new Error('IPC failure'));await assert.rejects(failed,/IPC failure/);
const retried=api.loadPreferences();pending.shift().resolve({theme:'recovered'});assert.equal((await retried).theme,'recovered');
for(const method of ['loadCredits','loadLastSplashTab','getVersionsAPI']){
  const before=calls.length;const concurrent=[api[method](),api[method]()];assert.equal(calls.length,before+1);
  pending.shift().resolve([]);await Promise.all(concurrent);
}
const splitters=[api.loadLastPositionSplitters('a'),api.loadLastPositionSplitters('a'),api.loadLastPositionSplitters('b')];
assert.equal(count('loadLastPositionSplitters'),2);pending.shift().resolve({});pending.shift().resolve({});await Promise.all(splitters);

globalThis.preferenceTest={stored:{preferences:{theme:'dark',recentProjects:[]}},reads:0,updates:[],notices:[]};
const bundle=await build({entryPoints:['src/main/handlers/preferenceHandlers.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'preferences-boundaries',setup(build){
  build.onResolve({filter:/^electron$|^electron-store$|^@\/states\/tempProjectState$/},args=>({path:args.path,namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:({
    electron:`export const ipcMain={handle:()=>{}};export const webContents={getAllWebContents:()=>[{isDestroyed:()=>false,send:channel=>globalThis.preferenceTest.notices.push(channel)}]};`,
    'electron-store':`export default class Store{get(key,fallback){if(key==='preferences')globalThis.preferenceTest.reads++;return structuredClone(globalThis.preferenceTest.stored[key]??fallback);}set(key,value){globalThis.preferenceTest.stored[key]=structuredClone(value);globalThis.preferenceTest.updates.push(key);}}`,
    '@/states/tempProjectState':`export const getCurrentActiveSandboxDirectory=()=>'';`,
  })[args.path]}));
}}]});
const {getPreferences,updatePreferences,setGameWorldPreferences}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const first=getPreferences();first.recentProjects.push({path:'not-saved'});
for(let index=0;index<12;index++)assert.deepEqual(getPreferences().recentProjects,[]);
assert.equal(preferenceTest.reads,1,'internal BE consumers must not reread storage on every call');
updatePreferences('language','fr_FR');assert.equal(getPreferences().language,'fr_FR');assert.equal(preferenceTest.stored.preferences.language,'fr_FR');
setGameWorldPreferences({panInertia:false,movementMode:'free'});assert.equal(getPreferences().gameWorldPanInertia,false);
assert.deepEqual(preferenceTest.notices,['preferences-updated','preferences-updated']);assert.equal(preferenceTest.reads,1);
console.log('Startup preferences: 12 concurrent/sequential FE reads -> 1 IPC; BE consumers -> 1 store read; updates, isolation, in-flight invalidation, retry and startup request sharing passed.');
