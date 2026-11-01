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
function Harness(){const[language,setLanguage]=useState('en_US');const[fadeDirection,setFadeDirection]=useState(0);window.setFadeDirection=setFadeDirection;const[event,setEvent]=useState({id:'f42e7a80-bbd0-4bfd-a513-b122e5be2fd8',command:'EVENT_DIALOGUE_CHOICE',args:{...EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE}});
window.setLanguage=setLanguage;window.args=event.args;window.setEvent=setEvent;window.pending=()=>getEventPendingFields(event.command,event.args);
window.context={elementSelected:{id:'scene',actors:[]},variables:{variables:[]},settings:{fadeDirection},settingUtils:{},scenes:[],spriteResources:[],prefabs:{prefabs:[]}};
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div data-testid="panel" style={{width:400,padding:20,marginLeft:400}}><Panel event={event} onValueChange={(_id,args)=>setEvent(previous=>({...previous,args}))}/></div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.context;',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(8000);
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('textbox',{name:'Option A',exact:true}).hover();
 const preview=page.getByTestId('menu-preview');
 await expect(preview).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.evaluate(()=>window.setFadeDirection(1));
 await expect(preview).toHaveCSS('background-color','rgb(0, 0, 0)');
 const font=page.getByRole('combobox',{name:'Font',exact:true});
 const select=font.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-select ")][1]');
 await expect(select).toHaveClass(/ant-select-lg/);
 await expect(select.locator('[aria-hidden]').first()).toBeAttached();
 await select.click();await page.locator('.ant-select-dropdown:visible').getByText('Font S',{exact:true}).click();
 assert.equal(await page.evaluate(()=>window.args.dialogueFont),'fixed8x8');
 await expect(select).toContainText('Font S');
 await page.evaluate(()=>window.setEvent({id:'74736d3c-e705-42cb-a529-92522f73b553',command:'EVENT_MENU_OPEN',args:{options:['One','Two']}}));
 await page.getByRole('combobox',{name:'Options',exact:true}).hover();
 await expect(preview).toHaveCSS('background-color','rgb(0, 0, 0)');
 await page.evaluate(()=>window.setFadeDirection(0));
 await expect(preview).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.evaluate(()=>window.setEvent({id:'61673e92-455a-4d2a-967d-3f649c343892',command:'EVENT_DISPLAY_DIALOGUE',args:{text:'ilMW',dialogueFont:'fixed8x8'}}));
 await page.getByRole('textbox',{name:'Text',exact:true}).hover();
 await expect(page.getByLabel('Dialogue preview',{exact:true})).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.evaluate(()=>window.setFadeDirection(1));
 await expect(page.getByLabel('Dialogue preview',{exact:true})).toHaveCSS('background-color','rgb(0, 0, 0)');
 await expect(select).toContainText('Font S');
 console.log('Dialogue, Choice and Menu fade backgrounds and shared font selector passed.');
}finally{await browser.close();}
