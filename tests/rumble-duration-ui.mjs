import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{resolveDir:path.resolve('src/renderer/frontend/src'),loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';import{I18nProvider}from'./i18n/I18n';import RumbleEvent from './components/events/RumbleEvent';
function Harness(){const[args,setArgs]=useState({durationFrames:8,intensity:100}),[language,setLanguage]=useState('en_US');window.args=args;window.setLanguage=setLanguage;return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><div style={{width:320}}><RumbleEvent args={args} onChange={patch=>setArgs(old=>({...old,...patch}))}/></div></I18nProvider></App></ConfigProvider>;}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':path.resolve('src/renderer/frontend/src')},define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const unit=page.getByRole('button',{name:'Rumble time unit',exact:true}),duration=page.getByRole('spinbutton',{name:'Duration',exact:true});
 await expect(unit).toHaveText('Frames');await expect(duration).toHaveValue('8');
 await unit.click();await expect(page.getByRole('menuitem')).toHaveCount(2);await page.getByRole('menuitem',{name:'Seconds',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.args.durationFrames),8);await expect(duration).toHaveValue('0.1333');
 await duration.fill('0.5');await duration.press('Tab');assert.equal(await page.evaluate(()=>window.args.durationFrames),30);
 await unit.click();await page.getByRole('menuitem',{name:'Frames',exact:true}).click();await expect(duration).toHaveValue('30');
 await duration.fill('120');await duration.press('Tab');await unit.click();await page.getByRole('menuitem',{name:'Seconds',exact:true}).click();await expect(duration).toHaveValue('2.0000');
 assert.equal(await duration.getAttribute('aria-valuemax'),'2');
 const intensity=page.getByRole('spinbutton',{name:'Intensity (%)',exact:true});await intensity.fill('25');await intensity.press('Tab');assert.equal(await page.evaluate(()=>window.args.intensity),25);assert.equal(await page.evaluate(()=>window.args.durationUnit),'seconds');
 await page.evaluate(()=>window.setLanguage('pt_BR'));await expect(page.getByRole('button',{name:'Unidade de tempo da vibração'})).toHaveText('Segundos');await expect(page.getByRole('spinbutton',{name:'Duração',exact:true})).toHaveValue('2.0000');
 console.log('Rumble duration UI passed: legacy frames, seconds conversion, preserved duration on unit changes, 2-second limit, independent intensity and Portuguese labels.');
} finally {await browser.close();}
