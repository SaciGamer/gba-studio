import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist', 'main', 'utils', 'builders', 'ResourceBuilder.js')).href);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-event-flow-'));

try {
  fs.mkdirSync(path.join(tempDir, 'include'), { recursive: true });
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  const builder = new ResourceBuilder(tempDir, path.join(root, 'tools', 'butano', 'template'));
  const scene = {
    _resourceType: 'scene', id: 'characterization', name: 'characterization',
    sceneType: 'POINTNCLICK', backgrounds: [],
    script: [
      { id: 'wait', command: 'EVENT_WAIT', args: { units: 'frames', frames: 3 } },
      { id: 'branch', command: 'EVENT_IF', args: {
        left: { kind: 'literal', type: 'number', value: 1 }, operator: '==',
        right: { kind: 'literal', type: 'number', value: 1 },
      }, children: {
        then: [{ id: 'fade', command: 'EVENT_FADE_OUT', args: { speed: 2 } }],
        else: [{ id: 'variable', command: 'EVENT_VARIABLE', args: {
          variableId: 'score', value: { kind: 'literal', type: 'number', value: 7 },
        } }],
      } },
      { id: 'change', command: 'EVENT_CHANGE_SCENE', args: {
        sceneId: 'next', x: 4, y: 8, direction: 'right', fadeSpeed: 2,
      } },
    ],
  };

  const result = builder.processResourceObject(scene);
  const header = result.headerContent.toString('utf8');
  assert.match(header, /CHARACTERIZATION_SCRIPTS_COUNT = 5/);
  assert.match(header, /EVENT_WAIT/);
  assert.match(header, /static const WaitEventData SCENE_CHARACTERIZATION_ARGS_4 = \{ 0, 3, "frames" \};/);
  assert.match(header, /EVENT_IF/);
  assert.match(header, /EVENT_FADE_OUT/);
  assert.match(header, /static const FadeEventData SCENE_CHARACTERIZATION_ARGS_2 = \{ 2 \};/);
  assert.match(header, /EVENT_VARIABLE/);
  assert.match(header, /VariableSetValueData.*7, false/);
  assert.match(header, /EVENT_CHANGE_SCENE/);
  assert.match(header, /static const SceneChangeEventData SCENE_CHARACTERIZATION_ARGS_0 = \{ "next", 4, 8, "right", 2 \};/);
  assert.match(header, /CHARACTERIZATION_SCRIPTS\[\]/);
  assert.match(header, /\{ "wait", "EVENT_WAIT", &SCENE_CHARACTERIZATION_ARGS_4, 0, 1, 1, 5, -1 \}/);
  assert.match(header, /\{ "branch", "EVENT_IF", [^,]+, 0, 1, 2, 4, -1 \}/);
  assert.match(header, /\{ "fade", "EVENT_FADE_OUT", [^,]+, 0, 1, 3, 5, -1 \}/);
  assert.match(header, /\{ "change", "EVENT_CHANGE_SCENE", [^,]+, 0, 1, 5, 5, -1 \}/);
  assert.match(header, /\{ "variable", "EVENT_VARIABLE", [^,]+, 0, 1, 3, 5, -1 \}/);
  const cameraHeader = builder.processResourceObject({
    _resourceType: 'scene', id: 'camera-characterization', backgrounds: [],
    script: [{ id: 'camera', command: 'EVENT_PAN_CAMERA', args: { x: 12, y: 24 } }],
  }).headerContent.toString('utf8');
  assert.match(cameraHeader, /static const CameraEventData SCENE_CAMERA_CHARACTERIZATION_ARGS_0 = \{ 12, 24 \};/);
  const actorHeader = builder.processResourceObject({
    _resourceType: 'scene', id: 'actor-characterization', backgrounds: [],
    script: [{ id: 'move-actor', command: 'EVENT_MOVE_ACTOR', args: { actorId: 'npc', x: 20, y: 30 } }],
  }).headerContent.toString('utf8');
  assert.match(actorHeader, /static const ActorMoveEventData SCENE_ACTOR_CHARACTERIZATION_ARGS_0 = \{ "npc", 20, 30 \};/);
  const actorLifecycleHeader = builder.processResourceObject({
    _resourceType: 'scene', id: 'actor-lifecycle', backgrounds: [],
    script: [
      { id: 'spawn', command: 'EVENT_SPAWN_ACTOR', args: { actorId: 'npc', x: 4, y: 5 } },
      { id: 'visible', command: 'EVENT_VISIBLE_ACTOR', args: { actorId: 'npc', visible: false } },
      { id: 'remove', command: 'EVENT_REMOVE_ACTOR', args: { actorId: 'npc' } },
    ],
  }).headerContent.toString('utf8');
  assert.match(actorLifecycleHeader, /ActorSpawnEventData.*"npc", 4, 5/);
  assert.match(actorLifecycleHeader, /ActorVisibilityEventData.*"npc", false/);
  assert.match(actorLifecycleHeader, /ActorRemoveEventData.*"npc"/);
  const animationHeader = builder.processResourceObject({
    _resourceType: 'scene', id: 'actor-animation', backgrounds: [],
    script: [{ id: 'speed', command: 'EVENT_SET_ANIMATION_SPEED', args: { actorId: 'npc', speed: 12 } }],
  }).headerContent.toString('utf8');
  assert.match(animationHeader, /ActorAnimationSpeedEventData.*"npc", 12/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid-event', backgrounds: [],
    script: [{ id: 'bad-fade', command: 'EVENT_FADE_OUT', args: { speed: 7 } }],
  }), /EVENT_FADE_OUT.*speed.*above 6/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'invalid-version', backgrounds: [],
    script: [{ id: 'bad-version', version: 2, command: 'EVENT_FADE_OUT', args: { speed: 2 } }],
  }), /EVENT_FADE_OUT.*unsupported schema version 2/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'dialogue-too-long', backgrounds: [],
    script: [{ id: 'long', command: 'EVENT_DISPLAY_DIALOGUE', args: { text: 'x'.repeat(256) } }],
  }), /EVENT_DISPLAY_DIALOGUE.*exceeds 255 UTF-8 bytes/);
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'dialogue-utf8-too-long', backgrounds: [],
    script: [{ id: 'long-utf8', command: 'EVENT_DISPLAY_DIALOGUE', args: { text: 'a'.repeat(235) + 'á'.repeat(11) } }],
  }), /EVENT_DISPLAY_DIALOGUE.*exceeds 255 UTF-8 bytes/);
  builder.processResourceObject({
    _resourceType: 'scene', id: 'graph-valid', backgrounds: [], script: [],
    eventGraphs: { script: { version: 1, entryNodeId: 'a', nodes: [{ id: 'a', command: 'EVENT_WAIT' }], edges: [] } },
  });
  assert.throws(() => builder.processResourceObject({
    _resourceType: 'scene', id: 'graph-invalid', backgrounds: [], script: [],
    eventGraphs: { script: { version: 1, entryNodeId: 'missing', nodes: [], edges: [] } },
  }), /Invalid event graph 'script'.*entry node does not exist/);
  await assert.rejects(() => builder.generateResourceRegistryClass([
    { resourceName: 'scene_bad_res.h', resourceType: 'gbasres', headerContent: Buffer.from(''), jsonContent: {
      _resourceType: 'scene', id: 'scene-a', script: [{ id: 'bad-scene', command: 'EVENT_CHANGE_SCENE', args: { sceneId: 'missing' } }],
    } },
  ], { projectName: 'test', authorName: '', version: '1.0.0' }), /scene 'missing' does not exist/);
  console.log('Event-flow characterization passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
