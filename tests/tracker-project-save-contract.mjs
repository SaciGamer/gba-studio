import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main/main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/main/preload/preload.ts'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx'), 'utf8');
const mixerState = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/utils/trackerMixerState.ts'), 'utf8');
const library = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/resourceEditors/AssetLibraryEditor.tsx'), 'utf8');
const compositionImporter = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/utils/trackerCompositionImport.ts'), 'utf8');
const eventPanel = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/components/events/RuntimeEventPanel.tsx'), 'utf8');
const assetBuilder = fs.readFileSync(path.join(root, 'src/main/utils/builders/AssetBuilder.ts'), 'utf8');
const transcoder = fs.readFileSync(path.join(root, 'src/main/utils/projectTranscoder/transcode-project.ts'), 'utf8');

if (!main.includes('normalizeTrackerProjectRelativePath') || !main.includes("path.resolve(root, 'project', 'musics', ...relativePath.split('/')")) throw new Error('tracker projects must support safe nested folders');
if (!main.includes('readTrackerProjectDescriptor') || !main.includes('id: parsed.id')) throw new Error('Music project lists must expose the package UUID and target format for event selection');
if (!main.includes('requestedFolder}_${suffix++}') || !main.includes('descriptor.id === incoming.id')) throw new Error('Tracker project saves must reuse matching UUIDs and distinguish same-name projects with scene-style numbered folders');
if (!preload.includes('listTrackerProjects') || !preload.includes('deleteTrackerProject')) throw new Error('Music project list or delete preload bridge missing');
if (!main.includes("ipcMain.handle('delete-tracker-project'")) throw new Error('The Music Projects library must delete nested .gbatracker files from project/musics');
if (!main.includes("ipcMain.handle('load-music-editor-source'")) throw new Error('Music Editor source load IPC handler missing');
if (!main.includes("'music-source'")) throw new Error('Music Editor source documents must live outside build assets');
if (!main.includes("gba-studio/music-source")) throw new Error('Music Editor source schema validation missing');
if (!viewer.includes('previousSource?.moduleFingerprint === currentSource.moduleFingerprint')) throw new Error('Music Editor source must be paired with the exact XM asset');
if (!viewer.includes('onSave={() => void saveEditedTrackerProject()}')) throw new Error('Music Editor project-save action is not connected to the editor');
if (!viewer.includes('-project.gbatracker')) throw new Error('Music Editor project-save must use an explicit derived project filename');
if (!viewer.includes('trackerMixerStorageKey(url,') || !mixerState.includes('gba-studio-tracker-mixer:')) throw new Error('Music Editor channel mixer persistence missing');
if (!viewer.includes('importedAudioSources,')) throw new Error('Saved Music Editor projects must persist the imported audio source list');
if (!viewer.includes('composition: canonicalComposition') || !library.includes('importTrackerModuleComposition(') || !compositionImporter.includes('createMusicCompositionFromImportedModule')) throw new Error('Imported and saved tracker projects must contain the normalized canonical composition and exact source module');
if (!viewer.includes("Object.hasOwn(project, 'format')") || !viewer.includes("Object.hasOwn(project, 'moduleData')")
  || !viewer.includes("Object.hasOwn(project, 'originalModuleData')") || !viewer.includes("Object.hasOwn(project, 'moduleFingerprint')")) throw new Error('The editor must reject legacy root-level target and module-cache fields');
if (!viewer.includes('exportMusicComposition(composition, moduleFormat).moduleData') || viewer.includes('project.moduleData')) throw new Error('The editor must materialize its active tracker module from canonical composition data');

if (!library.includes("await window.electronAPI.fetchImages('musics')")) throw new Error('Music library must load original music assets');
if (!library.includes("musicRole: kind === 'music' ? 'project'")) throw new Error('Music library must keep Music Projects grouped separately from Originals');
if (library.includes('music-exported') || library.includes('music.library.authored') || library.includes('Export to assets')) throw new Error('Manual export folder and authored classification must be removed');
if (!eventPanel.includes('window.electronAPI.listTrackerProjects()') || !eventPanel.includes('project.id')) throw new Error('Music events must offer .gbatracker projects by UUID');
if (!eventPanel.includes("window.electronAPI.fetchImages('musics')") || !eventPanel.includes("window.electronAPI.fetchImages('sounds')")) throw new Error('Music and SFX event choices must remain separated by asset type');
if (!assetBuilder.includes('materializeTrackerProjects') || !assetBuilder.includes('`${musicAssetSymbol(project.id)}.${extension}`')) throw new Error('Tracker project build must materialize target-format audio under its Butano-safe UUID symbol');
if (!transcoder.includes("assetBuilder.materializeTrackerProjects(path.join(projectDir, 'project', 'musics'))")) throw new Error('Project transcode must prepare .gbatracker modules for the Butano build');
if (main.includes('music-exported') || preload.includes('music-exported')) throw new Error('The removed music-exported folder must not remain in the app contract');

console.log('Tracker project build and music event contract passed.');
