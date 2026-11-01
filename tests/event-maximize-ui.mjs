import assert from 'node:assert/strict';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import CollapseEventManager from './components/events/CollapseEventManager';import RightPanelScroll from './components/RightPanelScroll';
const ids=JSON.parse('{"scene": "2153d318-5f73-4be5-b6b3-cdd816a564d5", "inner": "c0c768c7-3990-476b-93e5-a1b740803d6d", "outer": "e23d8b93-8587-43ed-863a-ed16c5b33537", "before": "501721cd-11d0-4b05-9428-cf5e4fbf927b", "after": "735612cf-7c86-482b-abd2-25db0566d393", "waits": ["86758242-0861-4de8-a30c-41c060096f0d", "77c9047e-7ee7-4691-8b90-38e301c85956", "37eeb870-f483-4f8b-a205-fdde1891c21c", "82ab0d95-5f47-4e75-be45-ca7bf03953b3", "463c1e58-f7d9-4ca5-8e58-96c7ca4d3039", "7da48c9a-df94-480d-961e-8b2ff1dcc255", "e369f63e-31d3-475d-88f2-5e6136e0a564", "aee214e6-40b8-483b-ae0a-1c8dbbddd5e6", "f51c127b-98c8-4f5f-a57f-caa864aed511", "9c3c84ed-02b1-49b2-99d0-929e94923f96", "64919a95-068e-488a-bde5-29bd459b85d9", "11a5da19-1733-4f9d-ae29-da5351b188cf"]}');
const wait=(id)=>({id,command:'EVENT_WAIT',args:{frames:10,__collapse:true,__name:'Wait '+id}});
const nested={id:ids.inner,command:'EVENT_IF',args:{__collapse:true,__name:'Inner'},children:{then:ids.waits.map(wait),else:[]}};
const initial=[wait(ids.before),{id:ids.outer,command:'EVENT_IF',args:{__collapse:true,__name:'Outer'},children:{then:[nested],else:[]}},wait(ids.after)];
function Harness(){const [events,setEvents]=useState(initial),[settings,setSettings]=useState({}),[mount,setMount]=useState(0),[language,setLanguage]=useState('en_US');const ref=useRef(settings);ref.current=settings;
window.remount=()=>setMount(value=>value+1);window.events=events;window.saved=settings;window.language=setLanguage;window.removeInner=()=>setEvents(list=>list.map(event=>event.id===ids.outer?{...event,children:{then:[],else:[]}}:event));
window.eventContext={elementSelected:{id:ids.scene,_resourceType:'scene',actors:[]},settingUtils:{projectPathFile:'project'},scenes:[{id:ids.scene}],scripts:{scripts:[]},variables:{variables:[]},userSettings:settings,userSettingsRef:ref,setUserSettings:setSettings,setSettingUtils:()=>{},setScenes:()=>{},setElementSelected:()=>{}};
return <ConfigProvider theme={{token:{motion:false}}}><I18nProvider language={language}><div style={{width:420,height:320}}><RightPanelScroll key={mount}><CollapseEventManager scripts={events} onScriptsChange={setEvents}/></RightPanelScroll></div></I18nProvider></ConfigProvider>}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{ name: 'isolated-event-forms', setup(build) {
    build.onResolve({ filter: /providers\/contexts\/AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/PanelEvents$|^\.\/FlowEditorManager$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: frontend, contents: args.path === 'context'
      ? 'export default function useAppContexts(){return window.eventContext;}'
      : args.path.includes('PanelEvents') ? 'export default function Panel({event,onValueChange}){return <input aria-label={event.id} style={{height:90}} value={event.args?.frames ?? 0} onChange={e=>onValueChange(event.id,{...event.args,frames:Number(e.target.value)})}/>;}'
        : 'export default function Flow(){return null;}' }));
  } }],
});
const app = express();
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });

const ids={"scene": "2153d318-5f73-4be5-b6b3-cdd816a564d5", "inner": "c0c768c7-3990-476b-93e5-a1b740803d6d", "outer": "e23d8b93-8587-43ed-863a-ed16c5b33537", "before": "501721cd-11d0-4b05-9428-cf5e4fbf927b", "after": "735612cf-7c86-482b-abd2-25db0566d393", "waits": ["86758242-0861-4de8-a30c-41c060096f0d", "77c9047e-7ee7-4691-8b90-38e301c85956", "37eeb870-f483-4f8b-a205-fdde1891c21c", "82ab0d95-5f47-4e75-be45-ca7bf03953b3", "463c1e58-f7d9-4ca5-8e58-96c7ca4d3039", "7da48c9a-df94-480d-961e-8b2ff1dcc255", "e369f63e-31d3-475d-88f2-5e6136e0a564", "aee214e6-40b8-483b-ae0a-1c8dbbddd5e6", "f51c127b-98c8-4f5f-a57f-caa864aed511", "9c3c84ed-02b1-49b2-99d0-929e94923f96", "64919a95-068e-488a-bde5-29bd459b85d9", "11a5da19-1733-4f9d-ae29-da5351b188cf"]};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const label=id=>page.locator(`[data-reference-event="${id}"]`);
 const panel=id=>label(id).locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-collapse-item ")][1]');
 const button=(id,name)=>panel(id).locator(':scope > .ant-collapse-header').getByRole('button',{name,exact:true});
 const scroll=page.getByTestId('right-panel-scroll');
 await expect(label(ids.inner)).toBeVisible();
 await scroll.evaluate(el=>{el.scrollTop=80;el.dispatchEvent(new Event('scroll'));});
 await expect.poll(()=>page.evaluate(id=>window.saved.rightPanelScrollPositions?.[id],ids.scene)).toBe(80);
 await button(ids.inner,'Maximize event').click();
 await expect(label(ids.outer)).toHaveCount(0);await expect(label(ids.before)).toHaveCount(0);
 await expect(button(ids.inner,'Restore event')).toHaveAttribute('aria-pressed','true');
 await expect(label(ids.waits[0])).toBeVisible();
 // Editing a promoted nested parent must update the original tree.
 await page.getByRole('textbox',{name:ids.inner,exact:true}).fill('42');
 await expect.poll(()=>page.evaluate(()=>window.events[1].children.then[0].args.frames)).toBe(42);
 await scroll.evaluate(el=>{el.scrollTop=140;el.dispatchEvent(new Event('scroll'));});
 await expect.poll(()=>page.evaluate(id=>window.saved.rightPanelScrollPositions?.[id+':focus:'+window.events[1].children.then[0].id],ids.scene)).toBe(140);
 await page.evaluate(()=>window.remount());
 await expect(button(ids.inner,'Restore event')).toBeVisible();
 await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBe(140);
 await button(ids.inner,'Restore event').click();
 await expect(label(ids.outer)).toHaveCount(1);await expect(label(ids.before)).toHaveCount(1);
 await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBe(80);
 await button(ids.inner,'Maximize event').click();
 await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBe(140);
 // Deleting a focused parent falls back to the full tree.
 await page.evaluate(()=>window.removeInner());
 await expect(label(ids.outer)).toHaveCount(1);await expect(label(ids.before)).toHaveCount(1);
 await expect.poll(()=>page.evaluate(()=>Object.values(window.saved.eventEditorFocus).filter(Boolean).length)).toBe(0);
 for(const [language,name] of [['pt_BR','Maximizar evento'],['es_ES','Maximizar evento'],['fr_FR','Agrandir l\u2019\u00e9v\u00e9nement']]){
  await page.evaluate(language=>window.language(language),language);await expect(button(ids.outer,name)).toHaveCount(1);
 }
 assert.deepEqual(errors,[]);
 console.log('Event maximize: nested focus, in-place edits, restore, persisted remount, independent scroll offsets, deleted target fallback and translations passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
