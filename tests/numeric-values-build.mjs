import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync}from'node:child_process';import {pathToFileURL}from'node:url';
import {catalog}from'./helpers/event-catalog.mjs';
const root=path.resolve('.');const {default:ResourceBuilder}=await import(pathToFileURL(path.join(root,'dist/main/utils/builders/ResourceBuilder.js')));
const {NUMERIC_EVENT_FIELDS}=await import(pathToFileURL(path.join(root,'dist/shared/numericEventFields.js')));
const number=value=>({kind:'number',value});const expression={kind:'expression',operation:'add',left:{kind:'variable',variableId:'source'},right:number(1)};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gba-numeric-build-'));fs.mkdirSync(path.join(temp,'include'));fs.mkdirSync(path.join(temp,'src'));const headers=[];
const originalLog=console.log;console.log=(...args)=>{if(!String(args[0]).startsWith('..: Generated in-memory'))originalLog(...args);};
try{const builder=new ResourceBuilder(temp,path.resolve('tools/butano/template'));let count=0;
 const actorMove=args=>builder.processResourceObject({_resourceType:'scene',id:'actor-units',backgrounds:[],script:[{id:'move',command:'EVENT_MOVE_ACTOR',args:{actorId:'__PLAYER__',...args}}]}).headerContent.toString();
 assert.match(actorMove({x:3,y:5,xUnit:'tiles',yUnit:'pixels'}),/ActorMoveEventData[^\n]*"__PLAYER__", 48, 5/);
 assert.match(actorMove({x:3,y:5}),/ActorMoveEventData[^\n]*"__PLAYER__", 3, 5/,'legacy events remain pixels');
 assert.match(actorMove({x:{type:'number',value:48},y:{kind:'literal',type:'number',value:80},xUnit:'pixels',yUnit:'pixels'}),/ActorMoveEventData[^\n]*"__PLAYER__", 48, 80/,'legacy numeric inputs keep their coordinates in pixel mode');
 assert.match(actorMove({x:number(3),y:5,xUnit:'tiles'}),/ActorMoveEventData[^\n]*"__PLAYER__", 48, 5/);
 const dynamicActor=actorMove({x:expression,y:5,xUnit:'tiles'});assert.match(dynamicActor,/op_number, 16/);assert.match(dynamicActor,/op_multiply/);headers.push(dynamicActor);
 assert.equal(catalog.EVENT_DEFAULTS.EVENT_MOVE_ACTOR.xUnit,'tiles');assert.equal(catalog.EVENT_DEFAULTS.EVENT_ACTOR_MOVE_TO.yUnit,'tiles');
 for(const[command,fields]of Object.entries(NUMERIC_EVENT_FIELDS))for(const[key,field]of Object.entries(fields)){
  const defaults={...structuredClone(catalog.EVENT_DEFAULTS[command]??{}),sceneId:'target',actorId:'__PLAYER__',uiId:'ui',variableId:'target',x:0,y:0,fadeSpeed:2,operator:'==',left:{kind:'literal',type:'number',value:0},right:{kind:'literal',type:'number',value:0}};
  defaults[key]=expression;
  const file=builder.processResourceObject({_resourceType:'scene',id:'numeric-case-'+count,backgrounds:[],script:[{id:'event-'+count,command,args:defaults}]});
  const header=file.headerContent.toString();assert.ok(header.includes(`offsetof(${field.payload}, ${field.member})`),command+'.'+key);assert.match(header,/NumericProgram/);assert.match(header,/NUMERIC_VALUES \}/);headers.push(header);count++;
  assert.equal(catalog.EVENT_CATALOG_BY_CODE[command].payload[key]?.numericValue,true,command+'.'+key+' must advertise variations');
 }
 const invalid=[{kind:'expression',operation:'unknown',left:number(0)},{kind:'expression',operation:'add',left:number(0)},{kind:'variable',variableId:''},{kind:'constant',constant:'__proto__'},{kind:'engine',field:'invalid'},number(1.5)];
 for(const x of invalid)assert.throws(()=>builder.processResourceObject({_resourceType:'scene',id:'invalid',backgrounds:[],script:[{id:'invalid',command:'EVENT_PAN_CAMERA',args:{x,y:0}}]}));
 const variables=builder.processResourceObject({_resourceType:'variables',variables:[{id:'source',type:'number',initialValue:20},{id:'flag',type:'boolean',initialValue:false},{id:'text',type:'string',initialValue:''}]});
 const referenceScene=x=>builder.processResourceObject({_resourceType:'scene',id:'references',name:'References',width:256,height:256,backgrounds:[],script:[{id:'pan',command:'EVENT_PAN_CAMERA',args:{x,y:0}}]});
 await assert.rejects(()=>builder.generateResourceRegistryClass([referenceScene({kind:'variable',variableId:'missing'}),variables],{projectName:'numeric'}),/missing or string variable/);
 await assert.rejects(()=>builder.generateResourceRegistryClass([referenceScene({kind:'variable',variableId:'text'}),variables],{projectName:'numeric'}),/missing or string variable/);
 await assert.rejects(()=>builder.generateResourceRegistryClass([referenceScene({kind:'property',actorId:'removed',property:'x'}),variables],{projectName:'numeric'}),/missing actor/);
 await builder.generateResourceRegistryClass([referenceScene(expression),variables],{projectName:'numeric'});
 assert.throws(()=>builder.processResourceObject({_resourceType:'scene',id:'unsupported',backgrounds:[],script:[{id:'invalid',command:'EVENT_INPUT_ENABLE',args:{group:expression}}]}));
 const source=path.join(temp,'test.cpp');fs.writeFileSync(source,headers.join('\n')+'\nint main(){return 0;}');
 const result=spawnSync(process.env.CXX||'g++',['-std=c++17','-Wall','-Wextra','-Werror','-I',path.join(root,'tests/native/support'),'-I',path.join(root,'tests/native/scheduler'),'-I',path.join(root,'tools/butano/template/include'),source,'-o',path.join(temp,'test.exe')],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr);
 console.log(`Numeric value compiler passed: ${count} event fields, native offsets/layouts, catalog coverage, malformed values, unsupported fields and legacy defaults.`);
}finally{console.log=originalLog;fs.rmSync(temp,{recursive:true,force:true});}
