import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const path='src/renderer/frontend/src/components/resourceEditors/GBABeatEditor.tsx';
const ast=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='editFromInspector')handler=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
assert.ok(handler);
let calls=[],selected,group;
const context={selectedNote:{row:2,note:49},selectedNotes:[{row:2,note:49},{row:8,note:56}],selectedChannel:1,
 findExistingNote:n=>({...n,patternIndex:3}),props:{onEditNoteProperties:(notes,patch)=>{calls.push({notes,patch});return true;}},
 setSelectedNote:n=>selected=n,setSelectedNotes:n=>group=n,selectionAnchor:{current:null},setInstrument:()=>{},};
vm.createContext(context);vm.runInContext(ts.transpile(`var edit=${handler}`,{target:ts.ScriptTarget.ES2022}),context);
context.edit({detail:{transpose:12}});
assert.equal(calls.length,1);assert.equal(calls[0].notes.length,2);assert.equal(calls[0].patch.transpose,12);
assert.equal(selected.note,61);assert.deepEqual(Array.from(group,n=>n.note),[61,68]);
for(const patch of [{instrument:5},{volume:35},{pan:-0.5}]){context.edit({detail:patch});assert.equal(calls.at(-1).notes.length,2);for(const [k,v]of Object.entries(patch))assert.equal(calls.at(-1).patch[k],v);}
context.selectedNotes=[{row:2,note:49},{row:8,note:95}];context.edit({detail:{transpose:12}});assert.equal(calls.at(-1).patch.transpose,1);assert.deepEqual(Array.from(group,n=>n.note),[50,96]);
context.props.onEditNoteProperties=()=>false;selected=null;context.edit({detail:{transpose:-1}});assert.equal(selected,null,'rejected batch keeps selection unchanged');
console.log('Grouped inspector edits: instrument, pitch, volume, pan, range clamp and rejection passed.');

const source = fs.readFileSync(path, 'utf8');
assert.ok(source.includes('[props.filename, format]'), 're-exporting a module title must not reset note selection');
assert.ok(source.indexOf('[props.filename, format]') > source.indexOf('const cutSelected') - 1000);
const panel = fs.readFileSync('src/renderer/frontend/src/components/RightPanel.tsx', 'utf8');
assert.equal((panel.match(/noteSelection.count === 1 && <div/g) ?? []).length, 2, 'Row and Length are single-note controls');
assert.ok(!source.includes('{activeEditorInstrumentSample && <Button size="small"'), 'remove center sample-editor button');
assert.ok(!source.includes('value={noteLength} onChange={setNoteLength} style={{ width: 90 }}'), 'remove center row snap control');
