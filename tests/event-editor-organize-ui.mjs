import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { build } from 'esbuild';
import { _electron as electron, expect } from '@playwright/test';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd'; import { I18nProvider } from './i18n/I18n';
import CollapseEventManager from './components/events/CollapseEventManager';
const wait=(id)=>({id,command:'EVENT_WAIT',args:{__name:id,__collapse:true,frames:10}});
const initial=()=>[wait('first'), {id:'outer',command:'EVENT_IF',args:{__name:'outer',__collapse:true},children:{then:[wait('nested'),wait('nested-two')],else:[]}}, wait('last')];
function Harness(){
 const [resource,setResource]=useState('scene'); const [lists,setLists]=useState({scene:initial(),actor:[wait('actor-target')],trigger:[wait('trigger-target')],other:[wait('scene-target')]});
 const [language,setLanguage]=useState('en_US'); const [visible,setVisible]=useState(true);
 window.selectResource=setResource; window.setLanguage=setLanguage; window.showEditor=setVisible;
 window.resetEvents=()=>{setLists({scene:initial(),actor:[wait('actor-target')],trigger:[wait('trigger-target')],other:[wait('scene-target')]});setResource('scene');};
 window.lists=lists;
 window.replaceEvents=events=>setLists(previous=>({...previous,[resource]:events}));
 window.eventContext={elementSelected:{id:resource==='other'?'other-scene':'scene',_resourceType:'scene',actors:resource==='other'?[]:[{id:'actor',name:'Actor'}],triggers:[{id:'trigger'}]},settingUtils:{activeSceneObject:resource==='actor'?{sceneId:'scene',type:'actor',id:'actor'}:resource==='trigger'?{sceneId:'scene',type:'trigger',id:'trigger'}:null},scenes:[{id:'scene'},{id:'other-scene'}],scripts:{scripts:[]},variables:{variables:[]},userSettings:{favoriteEvents:[]},setUserSettings:()=>{},setSettingUtils:()=>{},setScenes:()=>{},setElementSelected:()=>{}};
 return <ConfigProvider theme={{token:{motion:false}}}><I18nProvider language={language}><div style={{width:480,padding:20}}>{visible&&<CollapseEventManager key={resource} scripts={lists[resource]} onScriptsChange={events=>setLists(previous=>({...previous,[resource]:events}))}/>}</div></I18nProvider></ConfigProvider>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{ name: 'isolated-event-forms', setup(build) {
    build.onResolve({ filter: /providers\/contexts\/AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/PanelEvents$|^\.\/FlowEditorManager$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: frontend, contents: args.path === 'context'
      ? 'export default function useAppContexts(){return window.eventContext;}'
      : args.path.includes('PanelEvents') ? 'export default function Panel(){return <div style={{height:90}}>Event fields</div>;}'
        : 'export default function Flow(){return null;}' }));
  } }],
});
const app = express();
app.get('/app.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.send('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>'));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-event-organize-ui-'));
fs.writeFileSync(path.join(temporary, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:800,height:1400,show:false,webPreferences:{backgroundThrottling:false,offscreen:true}});window.loadURL('http://127.0.0.1:${server.address().port}');});`);
let electronApp;
try {
  electronApp = await electron.launch({ args: [path.join(temporary, 'main.cjs')] });
  const page = await electronApp.firstWindow();
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const label = id => page.locator(`[data-reference-event="${id}"]`);
  const panel = id => label(id).locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," ant-collapse-item ")][1]');
  async function menu(id, name = 'Event options') {
    await panel(id).locator(':scope > .ant-collapse-header').getByRole('button', { name, exact: true }).click();
  }
  const item = name => page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').getByRole('menuitem', { name, exact: true });
  await expect(label('nested')).toBeVisible();
  const picker = () => page.locator('.ant-drawer-open');
  async function chooseWait(category = false) {
    if (category) await picker().getByRole('menuitem').filter({hasText:/^Timer$/}).click();
    else await picker().locator('input').first().fill('Wait');
    await picker().last().getByRole('menuitem').filter({ hasText: /^Wait$/ }).click();
    await expect(picker()).toHaveCount(0);
  }
  await menu('first'); await item('Add Event Before').click(); await chooseWait();
  let added = await page.evaluate(() => window.lists.scene);
  assert.equal(added[0].command, 'EVENT_WAIT'); assert.equal(added[1].id, 'first'); assert.notEqual(added[0].id, 'first');
  await menu('last'); await item('Add Event After').click(); await chooseWait(true);
  added = await page.evaluate(() => window.lists.scene);
  assert.equal(added.at(-2).id, 'last'); assert.equal(added.at(-1).command, 'EVENT_WAIT');
  await menu('nested'); await item('Add Event Before').click(); await chooseWait();
  added = await page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then);
  assert.equal(added[1].id, 'nested'); assert.equal(added[0].command, 'EVENT_WAIT');
  await menu('nested-two'); await item('Add Event After').click(); await chooseWait();
  added = await page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then);
  assert.equal(added.at(-2).id, 'nested-two'); assert.equal(added.at(-1).command, 'EVENT_WAIT');
  // Cancelling must not insert anything or reuse the previous destination.
  await menu('nested'); await item('Add Event Before').click();
  await page.keyboard.press('Escape'); await expect(picker()).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then.length), 4);
  await page.evaluate(() => window.resetEvents());
  await menu('nested');
  await expect(item('Paste Before')).toHaveCount(0);
  await item('Copy Event').click();
  await menu('first'); await item('Paste Before').click();
  await expect.poll(() => page.evaluate(() => window.lists.scene.map(e => e.args.__name))).toEqual(['nested', 'first', 'outer', 'last']);
  await menu('last'); await item('Paste After').click();
  const ids = await page.evaluate(() => [window.lists.scene[0].id, window.lists.scene.at(-1).id]);
  assert.notEqual(ids[0], ids[1]); assert.notEqual(ids[0], 'nested');
  await menu('nested'); await item('Paste Before').click();
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then.length)).toBe(3);
  await menu('nested-two'); await item('Paste After').click();
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then.map(e=>e.args.__name))).toEqual(['nested','nested','nested-two','nested']);

  // A complete copied subtree survives editor unmounts and owner/scene changes.
  await menu('outer'); await item('Copy Event').click();
  await page.evaluate(() => window.showEditor(false));
  await expect(label('outer')).toHaveCount(0);
  await page.evaluate(() => { window.selectResource('actor'); window.showEditor(true); });
  await menu('actor-target'); await item('Paste After').click();
  await expect.poll(() => page.evaluate(() => window.lists.actor.length)).toBe(2);
  const actorCopy = await page.evaluate(() => window.lists.actor[1]);
  assert.equal(actorCopy.children.then.length, 4); assert.notEqual(actorCopy.children.then[0].id, 'nested');
  await page.evaluate(() => window.selectResource('trigger'));
  await menu('trigger-target'); await item('Paste Before').click();
  await expect.poll(() => page.evaluate(() => window.lists.trigger[0].command)).toBe('EVENT_IF');
  await page.evaluate(() => window.selectResource('other'));
  await menu('scene-target'); await item('Paste After').click();
  await expect.poll(() => page.evaluate(() => window.lists.other.length)).toBe(2);
  await page.keyboard.press('Escape');
  await menu('scene-target'); await expect(item('Paste Before')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Localize the new actions in every supported language.
  for (const [language, options, copy] of [['pt_BR','Opções do evento','Copiar evento'],['es_ES','Opciones del evento','Copiar evento'],['fr_FR','Options de l’événement','Copier l’événement']]) {
    await page.evaluate(language => window.setLanguage(language), language);
    await menu('scene-target', options); await expect(item(copy)).toBeVisible(); await page.keyboard.press('Escape');
  }
  await page.evaluate(() => { window.setLanguage('en_US'); window.resetEvents(); });

  // Drag a nested event to the root end, then into the empty ELSE branch.
  const collapsedRootHeader = await panel('first').locator(':scope > .ant-collapse-header').boundingBox();
  const rootDropZone = await page.locator('[data-event-drop-zone="list:root"]').boundingBox();
  const collapsedNestedHeader = await panel('nested').locator(':scope > .ant-collapse-header').boundingBox();
  const emptyBranchDropZone = await page.locator('[data-event-drop-zone="list:outer:else"]').boundingBox();
  assert.equal(rootDropZone.height, collapsedRootHeader.height, 'root destination matches a collapsed event row');
  assert.equal(emptyBranchDropZone.height, collapsedNestedHeader.height, 'branch destination matches a collapsed subevent row');
  async function grab(id) {
    await label(id).hover();
    const handle = label(id).getByRole('button', { name: `Reorder ${id}`, exact: true });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 4 });
  }
  async function dropAfter(id) {
    const box = await panel(id).locator(':scope > .ant-collapse-header').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, { steps: 18 });
    await page.mouse.up();
  }
  await grab('first'); await dropAfter('last');
  await expect.poll(() => page.evaluate(() => window.lists.scene.map(e=>e.id))).toEqual(['outer','last','first']);
  await page.evaluate(() => window.resetEvents());
  await grab('nested'); await dropAfter('nested-two');
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then.map(e=>e.id))).toEqual(['nested-two','nested']);
  await page.evaluate(() => window.resetEvents());
  await grab('nested');
  const rootEnd = page.locator('[data-event-drop-zone="list:root"]');
  let box = await rootEnd.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.lists.scene.at(-1).id)).toBe('nested');
  assert.deepEqual(await page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.then.map(e=>e.id)), ['nested-two']);
  await grab('nested');
  const branchEnd = page.locator('[data-event-drop-zone="list:outer:else"]');
  box = await branchEnd.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='outer').children.else.map(e=>e.id))).toEqual(['nested']);
  // The compact preview stays beside the pointer when dragging an expanded event.
  await grab('outer');
  await page.mouse.move(600, 300, { steps: 10 });
  const overlay = page.locator('[style*="position: fixed"][style*="z-index: 999"]');
  await expect(overlay).toHaveCount(1);
  const overlayBox = await overlay.boundingBox();
  assert.ok(Math.abs(overlayBox.x - (600 - 16)) < 3, `preview x ${overlayBox.x}`);
  assert.ok(Math.abs(overlayBox.y - (300 - 16)) < 3, `preview y ${overlayBox.y}`);
  await page.keyboard.press('Escape'); await page.mouse.up();

  await page.evaluate(() => window.replaceEvents([
    {id:'save',command:'EVENT_SAVE_WRITE',args:{__name:'save',__collapse:true},children:{then:[{id:'saved-child',command:'EVENT_WAIT',args:{__name:'saved-child'}}],else:[{id:'loaded-child',command:'EVENT_WAIT',args:{__name:'loaded-child'}}]}},
  ]));
  await expect(page.getByRole('tab', {name:'On Save',exact:true})).toBeVisible();
  await expect(label('saved-child')).toBeVisible();
  await page.getByRole('tab', {name:'On Load',exact:true}).click();
  await expect(label('loaded-child')).toBeVisible();
  await grab('loaded-child');
  let saveRootBox = await rootEnd.boundingBox();
  await page.mouse.move(saveRootBox.x + saveRootBox.width / 2, saveRootBox.y + saveRootBox.height / 2, {steps:18});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.lists.scene.at(-1).id)).toBe('loaded-child');
  await grab('loaded-child');
  let loadBranchBox = await page.locator('[data-event-drop-zone="list:save:else"]').boundingBox();
  await page.mouse.move(loadBranchBox.x + loadBranchBox.width / 2, loadBranchBox.y + loadBranchBox.height / 2, {steps:18});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.lists.scene[0].children.else[0]?.id)).toBe('loaded-child');

  // Receiving list constraints apply to menu paste as well as drag.
  await page.evaluate(() => window.replaceEvents([
    {id:'switch',command:'EVENT_SWITCH',args:{__name:'switch',__collapse:true,value:{kind:'literal',type:'number',value:0}},children:{then:[{id:'case',command:'EVENT_SWITCH_CASE',args:{__name:'case',__collapse:true,value:{kind:'literal',type:'number',value:1}},children:{then:[]}}],else:[]}},
    {id:'loop',command:'EVENT_WHILE',args:{__name:'loop',__collapse:true},children:{then:[{id:'break',command:'EVENT_BREAK',args:{__name:'break'}}]}},
    {id:'plain',command:'EVENT_WAIT',args:{__name:'plain'}},
    {id:'local-actor',command:'EVENT_ACTOR_SET_POSITION',args:{__name:'local-actor',actorId:'actor',x:0,y:0}},
  ]));
  await menu('plain'); await item('Copy Event').click();
  await menu('plain'); await item('Add Event Before').click();
  await picker().locator('input').first().fill('Break');
  await expect(picker().getByRole('menuitem').filter({hasText:'Break'})).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');
  await menu('break'); await item('Add Event Before').click();
  await picker().locator('input').first().fill('Break');
  await expect(picker().getByRole('menuitem').filter({hasText:'Break'})).not.toHaveAttribute('aria-disabled','true');
  await picker().getByText('Break', {exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='loop').children.then.map(e=>e.command))).toEqual(['EVENT_BREAK','EVENT_BREAK']);
  await menu('case'); await item('Add Event After').click();
  await picker().getByRole('menuitem').click();
  await expect.poll(() => page.evaluate(() => window.lists.scene.find(e=>e.id==='switch').children.then.length)).toBe(2);
  const addedCase = await page.evaluate(() => window.lists.scene.find(e=>e.id==='switch').children.then[1]);
  assert.equal(addedCase.command, 'EVENT_SWITCH_CASE'); assert.equal(addedCase.args.value.type, 'number');
  assert.notEqual(addedCase.id, 'case');
  await menu('plain'); await item('Copy Event').click();
  await menu('case'); await expect(item('Paste Before')).toHaveAttribute('aria-disabled','true'); await page.keyboard.press('Escape');
  await menu('case'); await item('Copy Event').click();
  await menu('plain'); await expect(item('Paste After')).toHaveAttribute('aria-disabled','true'); await page.keyboard.press('Escape');
  await menu('break'); await item('Copy Event').click();
  await menu('plain'); await expect(item('Paste Before')).toHaveAttribute('aria-disabled','true'); await page.keyboard.press('Escape');
  await menu('local-actor'); await item('Copy Event').click();
  await page.evaluate(() => window.selectResource('other'));
  await menu('scene-target'); await item('Paste After').click();
  const repaired = await page.evaluate(() => window.lists.other[1]);
  assert.equal(repaired.command, 'EVENT_ACTOR_SET_POSITION');
  assert.equal(repaired.args.actorId, undefined);
  assert.ok(repaired.args.__referenceWarnings.actorId, 'missing local actor must be shown as pending');
  // Esc must clear the session clipboard even while no event editor is mounted.
  await page.evaluate(() => window.showEditor(false));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.showEditor(true));
  await menu('scene-target'); await expect(item('Paste Before')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('Event editor UI: add before/after via search/categories, nested insertion, cancel, Switch/loop restrictions, copy/paste, subtree IDs, scene/actor/trigger persistence, Esc, translations, nested externalize/internalize and pointer alignment passed.');
} finally {
  await electronApp?.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
