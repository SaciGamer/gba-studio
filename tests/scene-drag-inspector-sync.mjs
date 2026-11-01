import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const filename='src/renderer/frontend/src/components/gameWorld/GameWorld.tsx';
const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let declaration;
function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='handleDragEnd')declaration=node;ts.forEachChild(node,find);}find(source);
assert.ok(declaration);
const code=ts.transpileModule(`const ${declaration.getText(source)}; export {handleDragEnd};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
for(const group of [false,true]) {
 const initial=[{id:'a',x:20,y:40,editorPosition:{x:20,y:40},name:'A'}, {id:'b',x:100,y:120,name:'B'}];
 let scenes=structuredClone(initial);
 let selected={...initial[group?1:0],name:'Current inspector edit',_recenterTarget:{x:5,y:6}};
 const ref={current:scenes};
 const context={exports:{},scenes,scenesRef:ref,selectedSceneIds:group?['a','b']:['a'],draggingSceneOffset:{id:'a',x:32,y:-16},
  getSceneWorldMovement:()=>{throw Error('Use the final displayed drag offset');},
  setScenes:update=>{scenes=update(scenes);ref.current=scenes;},
  setElementSelected:update=>{selected=update(selected);},
  calculateWorldSize:()=>({width:1000,height:1000}),worldSize:{width:1000,height:1000},
  restoreInspectorHover:()=>{},setWorldSize:()=>{},setIsMovedBackground:()=>{},setDraggingSceneOffset:()=>{},sceneDragScaleRef:{current:1}};
 vm.runInNewContext(code,context);
 context.exports.handleDragEnd({active:{id:'a'},delta:{x:999,y:999}});
 const moved=scenes.find(scene=>scene.id===selected.id);
 assert.equal(selected.x,moved.x);assert.equal(selected.y,moved.y);
 assert.equal(selected.editorPosition.x,moved.x);assert.equal(selected.editorPosition.y,moved.y);
 assert.equal(selected.name,'Current inspector edit');assert.equal(selected._recenterTarget.x,5);
 assert.equal(selected._saved,false);
 // Mirror the inspector's spread of the selection into the scene after a field edit.
 selected={...selected,showCamera:true};scenes=scenes.map(scene=>scene.id===selected.id?{...scene,...selected}:scene);
 assert.equal(scenes.find(scene=>scene.id===selected.id).x,initial[group?1:0].x+32);
 assert.equal(scenes.find(scene=>scene.id===selected.id).y,initial[group?1:0].y-16);
}
console.log('Scene drag/inspector synchronization passed: selected scene and grouped movement retain final positions after inspector edits, without losing current fields.');
