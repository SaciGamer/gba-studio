import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve('src/renderer/frontend/src');
const editor = fs.readFileSync(path.join(root, 'components/resourceEditors/GBABeatEditor.tsx'), 'utf8');
const callbacks = [...editor.matchAll(/^  (on\w+)\??:/gm)].map(match => match[1]);
const template = fs.readFileSync('tests/tracker-fx-grid.mjs', 'utf8').match(/const fixture = `([\s\S]*?)`;\r?\nconst bundle/)[1];
let fixture = Function('callbacks', `return \`${template}\`;`)(callbacks);
fixture = `import {createTrackerProjectPackage,parseTrackerProjectPackage} from '@/utils/trackerProjectPackage';
import {readMusicEditorSettings} from '@/utils/musicEditorSettings';\n` + fixture;
fixture = fixture.replace('const [channel, setChannel] = useState(0);', `
const [channel, setChannel] = useState(0);
const [editorKey,setEditorKey]=useState(0);
const [settings,setSettings]=useState(readMusicEditorSettings());
window.saveSettings=()=>createTrackerProjectPackage({editorSettings:window.currentSettings});
window.loadSettings=bytes=>{setSettings(readMusicEditorSettings(bytes ? parseTrackerProjectPackage(new Uint8Array(bytes)).editorSettings : undefined));setEditorKey(key=>key+1);};
window.validateSettings=readMusicEditorSettings;
`);
fixture = fixture.replace('<GBABeatEditor {...handlers}', '<GBABeatEditor {...handlers} key={editorKey} initialEditorSettings={settings} onEditorSettingsChange={value=>{window.currentSettings=value;}}');
const antd = createRequire(import.meta.url).resolve('antd', { paths: [path.resolve('src/renderer/frontend')] });
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
  outdir: 'settings-memory', platform: 'browser', format: 'iife', alias: { '@': root, antd }, define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<body><div id="root"></div></body>');
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({content:file.text});
  await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
  await page.locator('.gba-music-fx-grid').waitFor();
  const defaults=await page.evaluate(()=>window.currentSettings);
  await page.getByRole('switch',{name:'Loop',exact:true}).click();
  await page.getByRole('switch',{name:'Scale snap',exact:true}).click();
  await page.getByRole('button',{name:/Ghost Layer:/}).click();
  const zoomHandle=page.locator('.ant-slider-handle[aria-valuemin="12"][aria-valuemax="72"]');
  await zoomHandle.focus(); await page.keyboard.press('ArrowRight');
  for(const [name,option] of [['Scale root','D'],['Scale','Minor']]) {
    await page.evaluate(()=>document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.mouse.move(1,899);
    await page.waitForFunction(()=>![...document.querySelectorAll('[role="tooltip"]')].some(node=>node.getClientRects().length && getComputedStyle(node).visibility!=='hidden'));
    await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name,exact:true})}).locator('.ant-select-selector').click();
    await page.locator('.ant-select-item-option').filter({hasText:new RegExp(`^${option}$`)}).click();
  }
  await page.getByRole('button',{name:'Eraser: delete notes',exact:true}).click();
  await page.getByText('Keyboard',{exact:true}).click();
  const saved=await page.evaluate(()=>Array.from(window.saveSettings()));
  const expected=await page.evaluate(()=>window.currentSettings);
  assert.equal(expected.view,'keyboard'); assert.equal(expected.tool,'eraser');
  assert.equal(expected.scaleRoot,2); assert.equal(expected.scaleMode,2);
  assert.equal(expected.snapToScale,true); assert.equal(expected.loop,true); assert.equal(expected.ghostLayer,true); assert.equal(expected.zoom,21);
  await page.evaluate(()=>window.loadSettings(null));
  await page.waitForFunction(()=>window.currentSettings.view==='roll');
  assert.deepEqual(await page.evaluate(()=>window.currentSettings),defaults,'another/legacy beat starts with defaults');
  await page.evaluate(bytes=>window.loadSettings(bytes),saved);
  await page.waitForFunction(()=>window.currentSettings.view==='keyboard');
  assert.deepEqual(await page.evaluate(()=>window.currentSettings),expected,'every preference survives package round-trip and remount');
  await page.getByText('Piano roll',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/Ghost Layer:/}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Eraser: delete notes',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await zoomHandle.getAttribute('aria-valuenow'),'21');
  assert.deepEqual(await page.evaluate(()=>window.validateSettings({zoom:Infinity,scaleRoot:-1,tool:'bad',view:'bad',loop:'true'})),defaults);
  assert.deepEqual(errors,[]);
  console.log('Per-beat settings: view, tool, scale/root/snap, Loop, GL, zoom, archive round-trip, legacy defaults and validation passed.');
} finally {await browser.close();}
