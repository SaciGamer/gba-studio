import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'./i18n/I18n';import Panel from'./components/events/RuntimeEventPanel';
import{EVENT_DEFAULTS}from'../../../shared/events/eventCatalog';import{getEventPendingFields}from'../../../shared/events/eventPendingFields';
window.electronAPI=new Proxy({getCommonFontImages:async()=>({})},{get:(target,key)=>target[key]??(async()=>({status:'success',fileImages:[],projects:[],sounds:[],localPath:''}))});
function Harness(){const[language,setLanguage]=useState('en_US');const[fadeDirection,setFadeDirection]=useState(0);window.setFadeDirection=setFadeDirection;const[event,setEvent]=useState({id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_DISPLAY_DIALOGUE',args:{text:''}});
window.setLanguage=setLanguage;window.args=event.args;window.setEvent=setEvent;window.pending=()=>getEventPendingFields(event.command,event.args);
window.context={elementSelected:{id:'scene',actors:[]},variables:{variables:[{id:'3e089418-5bba-4e48-b24b-3e59e313a9d4',symbol:'score',name:'Score',type:'number',initialValue:42},{id:'8ef704a3-7ca0-4e09-af41-c49783b842b8',symbol:'hero',name:'Hero name',type:'string',initialValue:'Ada'},{id:'b9d13543-5457-4bd4-a01f-fc30d073d6cf',symbol:'deleted',name:'Deleted',type:'number',_deleted:true}]},settings:{fadeDirection},settingUtils:{},scenes:[],spriteResources:[],prefabs:{prefabs:[]}};
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div data-testid="panel" style={{width:400,padding:20,marginLeft:400}}><Panel event={event} onValueChange={(_id,args)=>setEvent(previous=>({...previous,args}))}/></div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.context;',loader:'js'}));}}]});

const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const command of ['EVENT_DISPLAY_DIALOGUE','EVENT_UI_SET_TEXT']) {
  await page.evaluate(command=>window.setEvent({id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command,args:{text:''}}),command);
  const text=page.getByRole('textbox',{name:'Text',exact:true});
  await text.fill('${3e089418-5bba-4e48-b24b-3e59e313a9d4}');await expect(text).toHaveValue('${score}');
  await text.fill('x'.repeat(253)+'${score}');await expect(text).toHaveValue('x'.repeat(253)+'${score}');
  await expect(page.locator('.ant-input-data-count')).toContainText('255/255 bytes');
  await text.fill('${hero} ${score}');await expect(page.locator('.ant-input-data-count')).toContainText('6/255 bytes');
  await text.fill('$');await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.getByRole('option').filter({hasText:'Score'}).click();
  await expect(text).toHaveValue('${score}');
  await text.fill('Hello  friend');await text.evaluate(el=>{el.focus();el.setSelectionRange(6,6);});
  await text.pressSequentially('$her');
  await expect(page.getByRole('option')).toHaveCount(1);await text.press('Enter');
  await expect(text).toHaveValue('Hello ${hero} friend');
  await expect.poll(()=>text.evaluate(el=>el.selectionStart)).toBe(13);
  await page.mouse.move(0,0);await text.fill('$');await text.press('ArrowDown');await text.press('Enter');
  await expect(text).toHaveValue('${hero}');
  await text.fill('$');await text.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);
  await text.fill('Cost $100');await expect(text).toHaveValue('Cost $100');await expect(page.getByRole('listbox')).toHaveCount(0);
 }
 assert.deepEqual(errors,[]);console.log('Dialogue and UI text: dollar autocomplete, short symbol insertion, cursor and suffix preservation, mouse/keyboard, deleted-variable filtering and literal dollars passed.');
} finally {await browser.close();}
