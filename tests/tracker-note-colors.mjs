import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=path.resolve('src/renderer/frontend/src');
const editor=fs.readFileSync(path.join(root,'components/resourceEditors/GBABeatEditor.tsx'),'utf8');
const callbacks=[...editor.matchAll(/^  (on\w+)\??:/gm)].map(match=>match[1]);
const template=fs.readFileSync('tests/tracker-fx-grid.mjs','utf8').match(/const fixture = `([\s\S]*?)`;\r?\nconst bundle/)[1];
let fixture=Function('callbacks',`return \`${template}\`;`)(callbacks);
fixture=fixture.replace('const [channel, setChannel] = useState(0);',`const [channel, setChannel] = useState(0);
const [colors,setColors]=useState({Duty:{1:'#123456'},Noise:{1:'#ff0000'}});window.setColors=setColors;`);
fixture=fixture.replace('<GBABeatEditor {...handlers}',`<GBABeatEditor {...handlers}
instrumentColors={colors} channelInstrumentTypes={{0:'Noise'}}
instrumentCategories={Object.fromEntries(project.instruments.map(item=>[item.index+1,item.starterCategory]))}
instrumentPresetColors={Object.fromEntries(project.instruments.map(item=>[item.index+1,item.starterColor]))}`);
const antd=createRequire(import.meta.url).resolve('antd',{paths:[path.resolve('src/renderer/frontend')]});
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'colors-memory',platform:'browser',format:'iife',alias:{'@':root,antd},define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<body style="margin:0"><div id="root"></div></body>');
 for(const file of bundle.outputFiles.filter(file=>file.path.endsWith('.css')))await page.addStyleTag({content:file.text});
 await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
 const note=page.locator('button.gba-beat-note[data-note]').first();await note.waitFor();
 assert.equal(await note.evaluate(node=>node.style.background),'rgb(18, 52, 86)','instrument category wins over channel category');
 await page.evaluate(()=>window.setColors({Duty:{1:'#abcdef'}}));
 await page.waitForFunction(()=>document.querySelector('button.gba-beat-note[data-note]').style.background==='rgb(171, 205, 239)');
 await page.evaluate(()=>window.setColors({}));
 await page.waitForFunction(()=>document.querySelector('button.gba-beat-note[data-note]').style.background==='rgb(92, 231, 189)');
 const grid=page.locator('.gba-beat-grid');
 await note.scrollIntoViewIfNeeded();
 const point=await grid.evaluate(node=>{const box=node.getBoundingClientRect();return {x:box.left+30*20+10,y:box.top+(96-61)*20+10};});
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 assert.equal(await page.locator('.gba-beat-note.drag-preview').evaluate(node=>node.style.background),'rgb(92, 231, 189)','new note preview uses factory color');
 await page.mouse.up();
 await page.waitForFunction(()=>window.__fxProject.patterns[0].notes.length===2);
 assert.deepEqual(await page.locator('button.gba-beat-note[data-note]').evaluateAll(nodes=>nodes.map(node=>node.style.background)),['rgb(92, 231, 189)','rgb(92, 231, 189)'],'new and existing notes match instrument color');
 assert.deepEqual(errors,[]);
 console.log('Roll notes: instrument category, custom colors, live color changes, factory fallback and newly inserted note/preview colors passed.');
}finally{await browser.close();}
