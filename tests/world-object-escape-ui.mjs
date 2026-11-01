import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

// Exercise the production keyboard handler with real browser focus and bubbling.
const source = ts.createSourceFile('GameWorld.tsx', fs.readFileSync('src/renderer/frontend/src/components/gameWorld/GameWorld.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleKeyDown') {
    assert.equal(handler, undefined);
    handler = `const ${node.getText(source)};`;
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler);
const sceneId = 'd47b02c6-4fb3-4cc3-b8ea-f5b36348440a';
const objectId = 'e5a5d338-5362-47fb-bac1-04892e10d3c6';
const bundle = await build({ stdin: { resolveDir: path.resolve('src/renderer/frontend/src'), loader: 'ts', contents: `
import { isModalOpen } from './utils/isModalOpen';
let cleanup=()=>{};
window.mountKeyboard=(type)=>{
 cleanup();
 const scene={id:${JSON.stringify(sceneId)},name:'Current scene',actors:[],triggers:[]};
 const scenes=[scene],selectedScene=scene,settings={};
 let settingUtils={activeButton:'select',activeSubButton:'',tileEditSceneId:scene.id,tileEditLayerId:4,selectedSceneIds:[scene.id],activeSceneObject:{sceneId:scene.id,type,id:${JSON.stringify(objectId)}},activeTriggerId:type==='trigger'?${JSON.stringify(objectId)}:null};
 let elementSelected=scene;
 const setElementSelected=value=>{elementSelected=value;};
 const setSettingUtils=update=>{settingUtils=update(settingUtils);};
 ${handler}
 document.addEventListener('keydown',handleKeyDown);
 cleanup=()=>document.removeEventListener('keydown',handleKeyDown);
 window.currentSelection=()=>({utils:settingUtils,scene:elementSelected});
};
` }, bundle: true, write: false, platform: 'browser', format: 'iife' });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<button id="canvas-focus">Scene</button><input id="field"><div id="modal" role="dialog" style="display:none">Dialog</div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const type of ['actor', 'trigger']) {
    await page.evaluate(type => window.mountKeyboard(type), type);
    await page.locator('#canvas-focus').focus();
    await page.keyboard.press('Escape');
    const { utils, scene } = await page.evaluate(() => window.currentSelection());
    assert.equal(utils.activeSceneObject, null);
    assert.equal(utils.activeTriggerId, null);
    assert.equal(utils.activeButton, 'select');
    assert.equal(scene.id, sceneId);
    assert.equal(utils.tileEditSceneId, sceneId, 'Keep edit mode active');
    assert.equal(utils.tileEditLayerId, 4);
    assert.deepEqual(utils.selectedSceneIds, [sceneId]);
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => window.currentSelection())).scene.id, sceneId);
  }
  await page.evaluate(() => window.mountKeyboard('actor'));
  await page.locator('#field').focus();
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => window.currentSelection())).utils.activeSceneObject.type, 'actor');
  await page.locator('#canvas-focus').focus();
  await page.locator('#modal').evaluate(el => { el.style.display = 'block'; });
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => window.currentSelection())).utils.activeSceneObject.type, 'actor');
  await page.locator('#modal').evaluate(el => { el.style.display = 'none'; });
  await page.locator('#canvas-focus').evaluate(el => el.addEventListener('keydown', event => event.preventDefault(), { once: true }));
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => window.currentSelection())).utils.activeSceneObject.type, 'actor');
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => window.currentSelection())).utils.activeSceneObject, null);
  console.log('Escape deselects actors and triggers, keeps scene/edit layer selected, and respects field editing, modal dialogs and handled keys.');
} finally { await browser.close(); }
