import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { build } from 'esbuild';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-credits-startup-'));
const bundle=await build({entryPoints:['src/main/services/creditsService.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'credits-boundaries',setup(build){
  build.onResolve({filter:/^https$|^electron$/},args=>({path:args.path,namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='https'
    ? `export default {get:(...args)=>globalThis.creditsTest.get(...args)};`
    : `export const app={getAppPath:()=>globalThis.creditsTest.directory,getPath:()=>globalThis.creditsTest.directory};`}));
}}]});
const code='data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64');
const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
let scenario=0;
async function fixture(responses){
  const directory=path.join(temporary,String(++scenario));fs.mkdirSync(directory);
  const calls=[];
  globalThis.creditsTest={directory,get(url,options,callback){calls.push(url);assert.equal(options.headers.Accept,'application/json');const request=new EventEmitter();request.destroy=error=>{request.emit('error',error);request.emit('close');};
    queueMicrotask(()=>{const next=responses.shift();assert.ok(next,'unexpected extra network request');if(next.error){request.destroy(new Error(next.error));return;}const response=new PassThrough();response.statusCode=next.status;response.headers=next.location?{location:next.location}:{};callback(response);response.end(next.body??'');queueMicrotask(()=>request.emit('close'));});return request;
  }};
  return {api:await import(code+'#'+scenario),calls};
}
try{
  const document=JSON.stringify({version:1,credits:[{entry:'Contributor',href:'https://example.com/'}]});
  let {api,calls}=await fixture([{status:301,location:'https://credits.example/data.json'},{status:200,body:document}]);
  const simultaneous=await Promise.all(Array.from({length:12},()=>api.refreshLauncherCredits()));
  assert.equal(calls.length,2,'one refresh and its redirect, shared by all callers');assert.ok(calls[0].startsWith('https://sacigamer.github.io/'),'keep the GitHub Pages URL as requested');
  assert.equal(simultaneous[0][0].entry,'Contributor');await api.refreshLauncherCredits();assert.equal(calls.length,2,'successful refreshes are cached');
  assert.equal((await api.loadLauncherCredits())[0].entry,'Contributor','local reads immediately reuse refreshed content');
  ({api,calls}=await fixture([{status:404},{status:404}]));
  assert.equal(await api.refreshLauncherCredits(),null);await api.refreshLauncherCredits();assert.equal(calls.length,1,'failed refreshes must not cause a startup retry storm');
  now+=61000;await api.refreshLauncherCredits();assert.equal(calls.length,2,'retry is allowed after the cooldown');assert.ok((await api.loadLauncherCredits()).length>0);
  ({api,calls}=await fixture([{status:302,location:'http://unsafe.example/credits.json'}]));
  assert.equal(await api.refreshLauncherCredits(),null);assert.equal(calls.length,1,'do not follow HTTPS downgrades');
  ({api,calls}=await fixture([{status:301,location:'https://loop.example/file'},{status:302,location:'https://loop.example/file'}]));
  assert.equal(await api.refreshLauncherCredits(),null);assert.equal(calls.length,2,'redirect cycles are bounded');
  ({api,calls}=await fixture([{status:200,body:JSON.stringify({version:1,credits:[{entry:'Unsafe',href:'javascript:alert(1)'}]})}]));
  assert.equal(await api.refreshLauncherCredits(),null,'redirect support must preserve document validation');
  ({api,calls}=await fixture([{status:200,body:'x'.repeat(65537)}]));
  assert.equal(await api.refreshLauncherCredits(),null,'document size limit remains enforced');
  console.log('Credits startup: GitHub URL, 301/302 redirects, 12 shared callers, cache/cooldown, local fallback, cycles, HTTPS-only, schema and size guards passed.');
}finally{Date.now=originalNow;assert.equal(path.dirname(temporary),path.resolve(os.tmpdir()));fs.rmSync(temporary,{recursive:true,force:true});}
