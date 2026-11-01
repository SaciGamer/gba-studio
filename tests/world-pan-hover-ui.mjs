import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const source=ts.createSourceFile('GameElement.tsx',fs.readFileSync('src/renderer/frontend/src/components/gameWorld/GameElement.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions={};
function visit(node){if(ts.isVariableDeclaration(node)&&['updateTriggerDrag','updatePrefabPlacementHover'].includes(node.name.getText(source)))functions[node.name.getText(source)]=`const ${node.getText(source)};`;if(ts.isFunctionDeclaration(node)&&node.name?.text==='getCanvasTilePosition')functions.position=node.getText(source);ts.forEachChild(node,visit);}visit(source);
assert.equal(Object.keys(functions).length,3);
const bundle=await build({stdin:{resolveDir:path.resolve('src/renderer/frontend/src'),loader:'tsx',contents:`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
${functions.position}
function Harness(){window.renders=(window.renders??0)+1;const canvasRef=useRef(null),tileHoverRef=useRef(null),triggerStartRef=useRef(null),triggerEndRef=useRef(null),areaToolRef=useRef(null),tileSelectionDragRef=useRef(null),autoTileStrokeRef=useRef(null),tileStrokeRef=useRef(null),colorizeStrokeRef=useRef(null);
const[hover,setHover]=useState(null),[prefabHover,setPrefabPlacementHover]=useState(null);const sceneElement={id:'selected',gridSize:8},settingUtils={activeButton:'select'},isSelected=true;
const setTileHover=value=>{window.hoverUpdates++;setHover(value);};const onSceneMouseMove=()=>window.positionUpdates++;
const setTriggerEnd=()=>{},setTileSelectionPreview=()=>{},paintAutoTileStroke=()=>window.paints++,paintTiles=()=>window.paints++,paintColorize=()=>window.paints++;
const prefabs={prefabs:[]};
${functions.updateTriggerDrag}
${functions.updatePrefabPlacementHover}
window.enablePaint=()=>tileStrokeRef.current={};
return <div><canvas ref={canvasRef} data-testid="selected-scene" width={240} height={160} onPointerMove={e=>{updateTriggerDrag(e);updatePrefabPlacementHover(e);}}/>{Array.from({length:200},(_,i)=><span key={i}>{i}</span>)}</div>;
}window.hoverUpdates=0;window.positionUpdates=0;window.paints=0;createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});const canvas=page.getByTestId('selected-scene');await canvas.waitFor();
 await canvas.evaluate(element=>{window.geometryReads=0;const original=element.getBoundingClientRect.bind(element);element.getBoundingClientRect=()=>{window.geometryReads++;return original();};});
 // Dispatch on the selected canvas as the camera is moved with middle held.
 const before=await page.evaluate(()=>window.renders);
 for(let i=0;i<30;i++)await canvas.dispatchEvent('pointermove',{buttons:4,clientX:20+i,clientY:30});
 assert.equal(await page.evaluate(()=>window.geometryReads),0);assert.equal(await page.evaluate(()=>window.hoverUpdates),0);assert.equal(await page.evaluate(()=>window.positionUpdates),0);assert.equal(await page.evaluate(()=>window.renders),before);
 await canvas.dispatchEvent('pointermove',{buttons:0,clientX:20,clientY:30});await expect.poll(()=>page.evaluate(()=>window.hoverUpdates)).toBe(1);
 for(let i=0;i<10;i++)await canvas.dispatchEvent('pointermove',{buttons:0,clientX:20,clientY:30});assert.equal(await page.evaluate(()=>window.hoverUpdates),1,'Repeated movement in the same tile must not update hover state');
 await page.evaluate(()=>window.enablePaint());await canvas.dispatchEvent('pointermove',{buttons:1,clientX:40,clientY:30});await expect.poll(()=>page.evaluate(()=>window.paints)).toBe(1);
 console.log('Selected-scene pan hover passed: zero geometry reads, hover updates or scene rerenders on middle-button motion; hover resumes and normal painting remains active.');
} finally {await browser.close();}
