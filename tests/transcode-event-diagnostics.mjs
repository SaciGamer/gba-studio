import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventDiagnosticIndex, withEventContext } from '../dist/main/utils/events/EventDiagnostics.js';
import { toRuntimeScripts } from '../dist/main/utils/types/RuntimeScript.js';
import { transcodeProject } from '../dist/main/utils/projectTranscoder/transcode-project.js';

const bad = { id: 'failing-event-uuid', command: 'EVENT_WAIT', args: { __name: 'Pause before greeting', frames: { kind: 'number', value: 'invalid' }, units: 'frames' } };
const scene = { _resourceType: 'scene', id: 'scene-uuid', name: 'Forest Entrance', width: 240, height: 160, sceneType: 'Logo', backgrounds: [], actors: [{ id: 'actor-uuid', name: 'Village Guard', onInteractScript: [bad] }], triggers: [], script: [] };
const index = new EventDiagnosticIndex(); index.remember(scene);
let error;
try { toRuntimeScripts([bad]); } catch (caught) { error = caught; }
assert.ok(error);
const diagnostic = index.format(error);
for (const value of ['"Pause before greeting"', '"Village Guard"', '"Forest Entrance"', 'EVENT_WAIT', 'On Interact']) assert.ok(diagnostic.includes(value), diagnostic);
assert.doesNotMatch(diagnostic, /failing-event-uuid/);
index.remember({ _resourceType: 'sprite', id: 'sprite-uuid', name: 'Player Hero' });
assert.equal(index.format(new Error("Scene scene-uuid layer 0: missing sprite 'sprite-uuid'")), 'Error: Scene "Forest Entrance" layer 0: missing sprite "Player Hero"');
assert.equal(index.format(new Error('Actor actor-uuid: invalid sprite player_hero')), 'Error: Actor "Village Guard": invalid sprite "Player Hero"');
assert.equal(index.format(new Error('Scene forest_entrance layer 0: missing unknown-uuid')), 'Error: Scene "Forest Entrance" layer 0: missing unknown-uuid');
assert.equal(index.format(new Error('Unknown tool failed with code 1')), 'Error: Unknown tool failed with code 1');
assert.equal(withEventContext({ id: 'parent', command: 'EVENT_IF' }, error), error, 'Nested failures must retain the offending child');
assert.match(index.format(withEventContext({ ...bad, args: {} }, new Error('Emitter failure'))), /Pause before greeting/);
const unnamed = { ...bad, id: 'unnamed-event-uuid', args: {} };
assert.match(String(withEventContext(unnamed, new Error('Failure'))), /Wait/);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-diagnostics-'));
try {
  const project = path.join(temporary, 'source');
  fs.mkdirSync(path.join(project, 'project'), { recursive: true });
  fs.writeFileSync(path.join(project, 'project', 'scene.gbasres'), JSON.stringify(scene));
  const result = await transcodeProject({ projectDir: project, outputDir: path.join(temporary, 'build'), projectName: 'Diagnostics', includeAssets: false });
  assert.equal(result.success, false);
  for (const value of ['"Pause before greeting"', '"Village Guard"', '"Forest Entrance"']) assert.ok(result.message.includes(value), result.message);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log('Transcode event names, source locations and nested failures: passed');
