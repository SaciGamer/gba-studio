import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main/main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/main/preload/preload.ts'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx'), 'utf8');

for (const extension of ['.mod', '.xm', '.s3m', '.it']) {
  if (!main.includes(extension)) throw new Error(`save-tracker-module must allow ${extension}`);
}
if (!main.includes("ipcMain.handle('save-tracker-module'")) throw new Error('tracker save IPC handler missing');
if (!main.includes("path.join(root, 'assets', 'musics'")) throw new Error('tracker save must target project musics');
if (!main.includes('A music asset with this name already exists.')) throw new Error('tracker save must preserve source and reject overwrite');
if (!preload.includes('saveTrackerModule')) throw new Error('tracker save preload bridge missing');
if (!viewer.includes('Save edited copy to project')) throw new Error('Music Editor project-save action missing');
if (!viewer.includes('-edited')) throw new Error('Music Editor project-save must use an explicit derived filename');
if (!viewer.includes('gba-studio-tracker-mixer:')) throw new Error('Music Editor channel mixer persistence missing');
if (!viewer.includes('localStorage.setItem(mixerStorageKey')) throw new Error('Music Editor channel mixer save missing');

console.log('Tracker project-save contract passed.');
