import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const filename='src/renderer/frontend/src/components/gameWorld/GameWorld.tsx';
const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['getTileCoordinate','triggerPreviewScriptKeys','collectChangeScenePreviews','updateChangeSceneEvent','moveChangeScenePreview'];
const helpers=source.statements.filter(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>names.includes(declaration.name.getText(source)))).map(statement=>statement.getText(source)).join('\n');
assert.equal(helpers.includes('const collectChangeScenePreviews'),true);
const code=ts.transpileModule(helpers+`\nexport {${names.join(',')}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};vm.runInNewContext(code,context);
const {collectChangeScenePreviews:collect,moveChangeScenePreview:move}=context.exports;
const change=id=>({id,command:'EVENT_CHANGE_SCENE',args:{sceneId:'destination',x:{type:'number',value:4},y:{type:'number',value:6},direction:'left'}});
const enter=change('enter');
const scene={id:'source',_saved:true,script:[change('scene')],triggers:[{
 id:'trigger',script:[change('legacy')],onEnterScript:[enter],
 onLeaveScript:[{id:'branch',command:'EVENT_IF',children:{then:[change('leave')],else:[{...change('commented'),args:{...change('commented').args,__comment:true}}]}}],
 onInteractScript:[change('interact')],onInitScript:[change('init')],onUpdateScript:[change('update')]
}],playerHit1Script:[change('player')],eventGraphs:{init:{nodes:[enter,change('graph'),{id:'disabled-branch',command:'EVENT_IF',args:{__comment:true},children:{then:[change('disabled-child')]}}]}}};
const before=JSON.stringify(scene);
const previews=collect(scene);
assert.deepEqual(Array.from(previews,event=>event.id),['scene','legacy','enter','leave','interact','init','update','player','graph']);
assert.equal(previews.find(event=>event.id==='enter').targetSceneId,'destination');
assert.equal(previews.find(event=>event.id==='enter').x,4);
assert.equal(previews.find(event=>event.id==='enter').y,6);
for(const [id,key] of [['legacy','script'],['enter','onEnterScript'],['leave','onLeaveScript'],['interact','onInteractScript'],['init','onInitScript'],['update','onUpdateScript']]){
 const moved=move(scene,id,'other_scene',8,12);
 const preview=collect(moved).find(event=>event.id===id);
 assert.equal(preview.targetSceneId,'other_scene');assert.equal(preview.x,8);assert.equal(preview.y,12);assert.equal(preview.direction,'left');
 assert.equal(moved._saved,false);assert.ok(moved.triggers[0][key]);
 if(id==='enter')assert.equal(moved.eventGraphs.init.nodes[0].args.x.value,8);
}
assert.equal(JSON.stringify(scene),before,'Dragging a preview must not mutate the original scene');
console.log('Change Scene trigger previews passed: every trigger flow, nested branches, commented events, graph deduplication and drag updates.');
