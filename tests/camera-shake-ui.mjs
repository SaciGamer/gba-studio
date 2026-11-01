import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import CameraShakeEvent from './components/events/CameraShakeEvent';
window.context={variables:{variables:[]},scenes:[],scripts:{scripts:[]},settingUtils:{}};
function Harness(){const[args,setArgs]=useState({frames:8,amplitude:2}),[language,setLanguage]=useState('en_US');window.args=args;window.setArgs=setArgs;window.setLanguage=setLanguage;return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div style={{width:320}}><CameraShakeEvent args={args} onChange={patch=>setArgs(old=>({...old,...patch}))}/></div></I18nProvider></App></ConfigProvider>;}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function useAppContexts(){return window.context}',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await expect(page.getByRole('radio',{name:'Default',exact:true})).toBeChecked();await expect(page.getByRole('spinbutton')).toHaveCount(0);
 await page.getByText('Custom',{exact:true}).click();await page.getByText('Horizontal',{exact:true}).click();assert.equal(await page.evaluate(()=>window.args.axis),'horizontal');
 const amplitude=page.getByRole('spinbutton',{name:'Intensity (px)',exact:true}),duration=page.getByRole('spinbutton',{name:'Duration (frames)',exact:true});
 await expect(amplitude).toHaveAttribute('aria-valuemax','8');await expect(duration).toHaveAttribute('aria-valuemax','120');
 await amplitude.fill('6');await amplitude.press('Tab');await duration.fill('60');await duration.press('Tab');assert.equal(await page.evaluate(()=>window.args.amplitude),6);assert.equal(await page.evaluate(()=>window.args.frames),60);
 await page.getByText('Vertical',{exact:true}).click();assert.equal(await page.evaluate(()=>window.args.axis),'vertical');
 await page.getByText('Default',{exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.args),{frames:8,amplitude:2,axis:'both',customShake:false});
 await page.evaluate(()=>window.setArgs({frames:30,amplitude:4}));await expect(page.getByRole('radio',{name:'Custom',exact:true})).toBeChecked();await expect(amplitude).toHaveValue('4');
 await page.evaluate(()=>window.setLanguage('pt_BR'));await expect(page.getByRole('spinbutton',{name:'Intensidade (px)',exact:true})).toBeVisible();await expect(page.getByText('Direção',{exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);console.log('Camera shake UI passed: default/custom modes, axes, bounded duration/intensity, default restoration, legacy settings and localization.');
} finally {await browser.close();}
