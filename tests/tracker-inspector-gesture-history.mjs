import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
const root='src/renderer/frontend/src/';
function parse(path){const text=fs.readFileSync(root+path,'utf8');return ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
const panel=parse('components/RightPanel.tsx');let change,complete;
function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(panel)==='Slider'&&n.attributes.properties.some(p=>p.name?.getText(panel)==='aria-label'&&p.initializer?.getText(panel).includes("music.inspector.pitch"))){for(const p of n.attributes.properties){if(p.name?.getText(panel)==='onChange')change=p.initializer.expression.getText(panel);if(p.name?.getText(panel)==='onChangeComplete')complete=p.initializer.expression.getText(panel);}}ts.forEachChild(n,visit);}visit(panel);
assert.ok(change&&complete);
const edits=[],events=[];const context={setNotePitchDraft:()=>{},editNote:patch=>edits.push(patch),CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},window:{dispatchEvent:event=>events.push(event)}};
vm.createContext(context);vm.runInContext(ts.transpile(`var change=${change};var complete=${complete};`,{target:ts.ScriptTarget.ES2022}),context);
for(const pitch of [50,52,55,61])context.change(pitch);
assert.equal(edits.length,0,'dragging pitch only previews and cannot invalidate selection between steps');assert.equal(events.length,4);
context.complete(61);assert.equal(edits.length,1,'one gesture creates one undo step');assert.equal(edits[0].note,61);assert.equal(events.at(-1).detail.clear,true);
const history=parse('providers/HistoryProvider.tsx');let keyHandler;
function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(history)==='onKeyDown'&&n.initializer?.getText(history).includes('gba-studio:editor-undo'))keyHandler=n.initializer.getText(history);ts.forEachChild(n,find);}find(history);
assert.ok(keyHandler);
Object.assign(context,{document:{querySelector:()=>({})},HTMLInputElement:class{},HTMLTextAreaElement:class{}});
vm.runInContext(ts.transpile(`var keyDown=${keyHandler};`,{target:ts.ScriptTarget.ES2022}),context);
for(const [key,shiftKey,action]of [['z',false,'gba-studio:editor-undo'],['z',true,'gba-studio:editor-redo']]){let prevented=false;context.keyDown({key,shiftKey,ctrlKey:true,metaKey:false,altKey:false,target:{closest:()=>null},preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.equal(events.at(-1).type,action,'inspector/body focus must use music history');}
console.log('Pitch gesture commits once; Ctrl+Z / Ctrl+Shift+Z route to music history from outside the center panel.');
