import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

globalThis.titleTest = { language: 'en_US', locale: 'en-US', saved: true, title: '', sent: [] };
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `export * from './src/main/mainI18n'; export * from './src/main/services/saveSettingsService';` }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'title-boundaries', setup(build) {
  build.onResolve({ filter: /^@\/|^electron$/ }, args => args.path === '@/mainI18n'
    ? { path: path.resolve('src/main/mainI18n.ts') } : { path: args.path, namespace: 'fixture' });
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: ({
    electron: `export const app={getLocale:()=>globalThis.titleTest.locale};`,
    '@/main': `export const windows={main:{setTitle:title=>globalThis.titleTest.title=title,webContents:{send:(...args)=>globalThis.titleTest.sent.push(args)}}};export const directoryPathProject='';export const originalProjectDirectory='';`,
    '@/controllers/SettingsController': `export class SettingsController{static getInstance(){return {setIsSaved:value=>globalThis.titleTest.saved=value,isSaved:()=>globalThis.titleTest.saved};}}`,
    '@/handlers/preferenceHandlers': `export const getPreferences=()=>({language:globalThis.titleTest.language});export const updatePreferences=()=>{};`,
    '@/structs/projectSettingsStruct': `export const createGenericSettingsStruct=()=>({});`,
    '@/states/tempProjectState': `export const setCurrentActiveSandboxDirectory=()=>{};`,
  })[args.path], loader: 'js' }));
} }] });
const { formatMainWindowTitle, updateWindowTitle, refreshWindowTitle, requestSaveChanges } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const translations = [['en_US','Saving...','Modified'],['pt_BR','Salvando...','Modificado'],['es_ES','Guardando...','Modificado'],['fr_FR','Enregistrement...','Modifié']];
for (const [language, saving, modified] of translations) {
  assert.equal(formatMainWindowTitle('GBA Studio','Project',true,false,language),'GBA Studio - Project');
  assert.equal(formatMainWindowTitle('GBA Studio','Project',false,false,language),`GBA Studio - Project (${modified})`);
  assert.equal(formatMainWindowTitle('GBA Studio','Project',true,true,language),`GBA Studio - Project (${saving})`);
  titleTest.language=language;updateWindowTitle('GBA Studio','Project',false);
  assert.equal(titleTest.title,`GBA Studio - Project (${modified})`);
}
titleTest.locale='fr-FR';assert.equal(formatMainWindowTitle('GBA Studio','Project',false,false,'systemDefault'),'GBA Studio - Project (Modifié)');
assert.equal(formatMainWindowTitle('GBA Studio','Project',false,false,'unsupported'),'GBA Studio - Project (Modified)');
requestSaveChanges({source:'save'});
for (const [language,saving] of translations) {
  titleTest.language=language;refreshWindowTitle();
  assert.equal(titleTest.title,`GBA Studio - Project (${saving})`,'language changes must refresh the saving title immediately');
  assert.equal(titleTest.saved,false,'refresh must preserve dirty state');
}
assert.equal(titleTest.sent[0][0],'get-data');
console.log('Window title: saved/modified/saving, four languages, system fallback and language switching during save passed.');
