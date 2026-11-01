import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const frontend=path.resolve('src/renderer/frontend/src');
const bundle=await build({stdin:{resolveDir:frontend,loader:'tsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{App,ConfigProvider}from'antd';
import{I18nProvider}from'./i18n/I18n';import Notice from './components/events/BackgroundCompatibilityNotice';import Menu from './components/events/MenuEventItem';
import{inspectAffineLayer}from'./utils/backgroundCompatibility';import useValidation from './utils/useBackgroundCompatibilityValidation';
window.inspect=inspectAffineLayer;
function Validator(){useValidation(false);return null;}
function Harness(){const[scenes,setScenes]=useState([]),[scripts,setScripts]=useState({scripts:[]}),[selected,setSelected]=useState(null),[language,setLanguage]=useState('en_US'),[source,setSource]=useState('');
 window.fixture={scenes,scripts,selected};window.load=(scene,path)=>{setScenes([scene]);setSelected(scene);setSource(path);};window.setLanguage=setLanguage;
 window.context={scenes,scripts,backgrounds:[{id:'image',name:'Fixture',filename:'image.png'}],palettes:{palettes:[]},settingUtils:{projectPathFile:'fixture',localImagePath:source},setScenes,setScripts,setElementSelected:setSelected,elementSelected:selected};
 const event=scenes[0]?.script[0];
 return <ConfigProvider theme={{token:{motion:false}}}><App><I18nProvider language={language}><Validator/>{event&&<><Menu event={event} hasClipboard={false}/><Notice args={event.args}/></>}</I18nProvider></App></ConfigProvider>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':frontend},define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty','.png':'dataurl'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppContexts$/},()=>({path:'context',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function useAppContexts(){return window.context}',loader:'js'}));}}]});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const count=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
   for(let i=0;i<1024;i++){const n=i%300;ctx.fillStyle='rgb('+(n%32*8)+','+(Math.floor(n/32)*8)+',0)';ctx.fillRect(i%32*8,Math.floor(i/32)*8,8,8);}
   window.imagePath=canvas.toDataURL()+'#';
   const scene={id:'scene',name:'Example',sceneType:'Top Down',backgrounds:[{layerId:0,backgroundId:'image'}],script:[{id:'scale',command:'EVENT_BACKGROUND_SET_SCALE',args:{layerId:0}}]};
   window.testScene=scene;window.load(scene,window.imagePath);
   return window.inspect(scene,scene.backgrounds[0],{id:'image',filename:'image.png'},{settingUtils:{localImagePath:window.imagePath},palettes:[]});
 });
 assert.equal(count,300);
 const animationCount=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,256,256);
   const scene={...window.testScene,tileAnimations:[{layerId:0,targetTileIndex:0,targetTilesetId:'image',frameTileIndices:[0],frameTilesetIds:['image']}]};
   return window.inspect(scene,scene.backgrounds[0],{id:'image',filename:'image.png'},{settingUtils:{localImagePath:canvas.toDataURL()+'#'},palettes:[]});
 });
 assert.equal(animationCount,2,'Animation destinations must be counted separately from shared static/frame tiles');

 await expect(page.getByRole('alert')).toContainText('300 unique tiles');
 await expect(page.getByRole('img',{name:/needs 300 unique tiles/})).toBeVisible();
 await page.evaluate(()=>window.setLanguage('pt_BR'));
 await expect(page.getByRole('alert')).toContainText('300 tiles únicos');
 await page.evaluate(()=>window.load({...window.testScene,backgrounds:[]},window.imagePath));
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.fixture.scenes[0].script[0].args.__backgroundCompatibility?.issues.length)).toBe(0);
 await page.evaluate(()=>window.load({...window.testScene,sceneType:'Logo'},window.imagePath));
 await expect(page.getByText(/Bitmap direto/)).toBeVisible();
 await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').fillRect(0,0,256,256);
   window.load({...window.testScene,script:[{id:'change',command:'EVENT_CHANGE_LAYER',args:{layerId:0,backgroundId:'image'}},...window.testScene.script]},canvas.toDataURL()+'#');
 });
 await expect(page.getByText('Compatível com transformações affine: Fixture (1/256 tiles únicos).',{exact:true})).toBeVisible();

 assert.deepEqual(errors,[]);
 console.log('Background compatibility UI passed: pixel tile count, automatic scan, event warning icon, Portuguese messages, empty-layer repair and bitmap bypass.');
}finally{await browser.close();}
