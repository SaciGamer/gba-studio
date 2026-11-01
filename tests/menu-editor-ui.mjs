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
function Harness(){const[language,setLanguage]=useState('en_US');const[event,setEvent]=useState({id:'choice',command:'EVENT_DIALOGUE_CHOICE',args:{...EVENT_DEFAULTS.EVENT_DIALOGUE_CHOICE}});
window.setLanguage=setLanguage;window.args=event.args;window.setEvent=setEvent;window.pending=()=>getEventPendingFields(event.command,event.args);
window.context={elementSelected:{id:'scene',actors:[]},variables:{variables:[]},settings:{},settingUtils:{},scenes:[],spriteResources:[],prefabs:{prefabs:[]}};
return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div data-testid="panel" style={{width:400,padding:20,marginLeft:400}}><Panel event={event} onValueChange={(_id,args)=>setEvent(previous=>({...previous,args}))}/></div></I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':frontend},loader:{'.png':'dataurl','.jpg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(builder){builder.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>window.context;',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.getByRole('textbox',{name:'Option A',exact:true})).toHaveValue('Yes');
 await expect(page.getByRole('textbox',{name:'Option B',exact:true})).toHaveValue('No');
 await expect(page.getByRole('textbox',{name:/Title \(max 56/})).toHaveValue('Choose an option');
 await expect(page.getByRole('radio',{name:'3',exact:true})).toHaveCount(0);

 const initial=page.getByRole('combobox',{name:/Initial selected option/});
 await initial.fill('No');await page.locator('.ant-select-dropdown:visible').getByText('2: No',{exact:true}).click();
 assert.equal(await page.evaluate(()=>window.args.initialSelection),1);
 await page.getByRole('switch',{name:'Show title',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.args.showTitle),false);
 await expect(page.getByRole('textbox',{name:/Title \(max 56/})).toBeDisabled();
 await page.getByRole('switch',{name:'Show title',exact:true}).click();
 const title=page.getByRole('textbox',{name:/Title \(max 56/});
 await title.fill('A'.repeat(80));
 await expect(title).toHaveValue('A'.repeat(56));
 await expect(title).toHaveAttribute('maxlength','56');
 await page.evaluate(()=>window.setEvent({id:'grid',command:'EVENT_MENU_OPEN',args:{showTitle:false,columns:4,options:Array.from({length:32},(_,i)=>'A'+String(i).padStart(2,'0')),resultVariable:'result'}}));
 await expect(page.getByRole('combobox',{name:'Options',exact:true})).toBeVisible();
 await page.mouse.move(0,0);await page.getByRole('radio',{name:'4',exact:true}).locator('..').hover();
 await expect(page.getByTestId('menu-preview')).toBeVisible();
 const position=page.getByRole('combobox',{name:'Menu position',exact:true});
 await position.click({force:true});await page.locator('.ant-select-dropdown:visible').getByText('Full screen',{exact:true}).click();
 assert.equal(await page.evaluate(()=>window.args.position),'full-screen');
 const selected=page.getByRole('combobox',{name:/Initial selected option/});
 await selected.fill('A31');await page.locator('.ant-select-dropdown:visible').getByText('32: A31',{exact:true}).click();
 await expect(selected.locator('xpath=../..')).toContainText('32: A31');
 assert.equal(await page.evaluate(()=>window.args.initialSelection),31);
 await position.click({force:true});await page.locator('.ant-select-dropdown:visible').getByText('Right side',{exact:true}).click();
 await expect(page.getByRole('radio',{name:'3',exact:true})).toHaveCount(0);

 assert.equal(await page.evaluate(()=>window.args.position),'right');
 await page.evaluate(()=>window.setEvent(old=>({...old,args:{...old.args,horizontalAlign:'right'}})));
 await expect(page.getByTestId('menu-cursor')).toHaveCSS('left','208px');
 await page.evaluate(()=>window.setEvent(old=>({...old,args:{...old.args,horizontalAlign:'center'}})));
 await expect(page.getByTestId('menu-cursor')).toHaveCSS('left','200px');
 await page.evaluate(()=>window.setEvent(old=>({...old,args:{...old.args,horizontalAlign:'right'}})));
 await expect(page.getByTestId('menu-cursor')).toHaveCSS('top','136px');
 await expect(page.getByRole('textbox',{name:/Title \(max 30/})).toHaveAttribute('maxlength','30');
 await position.click({force:true});await page.locator('.ant-select-dropdown:visible').getByText('Dialogue box',{exact:true}).click();
 await page.getByRole('radio',{name:'4',exact:true}).locator('..').click();
 await expect(page.getByRole('textbox',{name:/Title \(max 56/})).toHaveAttribute('maxlength','56');
 await page.mouse.move(0,0);await page.getByRole('radio',{name:'4',exact:true}).locator('..').hover();
 await expect(page.getByTestId('menu-preview').locator('[data-menu-option]')).toHaveCount(8);
 await expect(page.getByTestId('menu-preview').locator('[data-menu-option="31"]')).toHaveCSS('left','198px');
 await expect(page.getByTestId('menu-cursor')).toHaveCSS('left','200px');
 await expect(page.getByTestId('menu-cursor')).toHaveCSS('top','128px');
 await page.evaluate(()=>window.setEvent(old=>({...old,args:{...old.args,options:['Too long']}})));
 const warning=page.getByRole('img',{name:/Option 1 exceeds the cell width/});
 await expect(warning.locator('.ant-badge')).toHaveCount(1);
 await warning.focus();await expect(page.getByRole('tooltip')).toContainText('4 characters');
 await page.evaluate(()=>window.setLanguage('pt_BR'));
 await expect(page.getByRole('combobox',{name:'Opções',exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('Menu editor UI passed: Choice defaults, columns, optional title, 12 visible cells, selection on page 3, correct cursor coordinates, AntD Badge field warning and Portuguese controls.');

}finally{await browser.close();}
