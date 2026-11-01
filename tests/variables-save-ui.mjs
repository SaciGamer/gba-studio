import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'./i18n/I18n';import Panel from'./components/events/RuntimeEventPanel';
import{getEventPendingFields}from'../../../shared/events/eventPendingFields';
window.electronAPI=new Proxy({getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:'success',fileImages:[],projects:[],sounds:[],localPath:''}))});
function Harness(){const[language,setLanguage]=useState('en_US');const[event,setEvent]=useState({id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_VARIABLES_SAVE',args:{slot:7,allVariables:false,variableIds:[]}});
window.setEvent=setEvent;window.setLanguage=setLanguage;window.args=event.args;window.pending=getEventPendingFields(event.command,event.args);
window.context={elementSelected:{id:'scene',actors:[{id:'placed',name:'Placed',spriteId:'hero'}]},variables:{variables:[{id:'3e089418-5bba-4e48-b24b-3e59e313a9d4',name:'Deaths',symbol:'deaths',type:'number'},{id:'8ef704a3-7ca0-4e09-af41-c49783b842b8',name:'Deleted',symbol:'deleted',type:'number',_deleted:true}]},settings:{},settingUtils:{},scenes:[],spriteResources:[],prefabs:{prefabs:[{id:'enemy',name:'Enemy prefab',type:'actor',actor:{spriteId:'hero'}},{id:'trigger',name:'Trigger prefab',type:'trigger'},{id:'deleted',name:'Deleted prefab',type:'actor',_deleted:true}]}};
return <ConfigProvider><App><I18nProvider language={language}><div style={{width:400,padding:20}}><Panel event={event} onValueChange={(_id,args)=>setEvent(previous=>({...previous,args}))}/></div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.context;',loader:'js'}));}}]});

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 assert.deepEqual(await page.evaluate(()=>window.pending),['variableIds']);
 const variables=page.getByRole('combobox',{name:'Variables',exact:true});await variables.press('ArrowDown');
 await expect(page.locator('.ant-select-dropdown:visible').getByText('Deleted',{exact:true})).toHaveCount(0);
 await page.locator('.ant-select-dropdown:visible').getByText('Deaths',{exact:true}).click();await page.keyboard.press('Escape');
 assert.deepEqual(await page.evaluate(()=>window.args.variableIds),['3e089418-5bba-4e48-b24b-3e59e313a9d4']);
 assert.deepEqual(await page.evaluate(()=>window.pending),[]);
 await page.getByRole('switch',{name:'All global variables',exact:true}).click();
 await expect(variables).toHaveCount(0);assert.equal(await page.evaluate(()=>window.args.allVariables),true);
 await page.evaluate(()=>window.setLanguage('pt_BR'));
 await expect(page.getByRole('switch',{name:'Todas as vari\u00e1veis globais',exact:true})).toBeVisible();
 await page.evaluate(()=>window.setEvent({id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_VARIABLES_LOAD',args:{slot:7,allVariables:false,variableIds:[]}}));
 await expect(page.getByRole('combobox',{name:'Vari\u00e1veis',exact:true})).toBeVisible();
 console.log('Variables Save/Load UI: global selection, deleted filtering, all globals, pending fields and translations passed.');
}finally{await browser.close();}
