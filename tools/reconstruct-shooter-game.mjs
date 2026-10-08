import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'projeto_exemplo');
const target = path.join(root, 'templateEngineGame', 'shooter_game');
const graphicsSource = path.join(source, 'graphics');
const audioSource = path.join(source, 'audio');
const backgroundsDir = path.join(target, 'project', 'backgrounds');
const spritesDir = path.join(target, 'project', 'sprites');
const scenesDir = path.join(target, 'project', 'scenes');

const copyTree = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

const readBmpSize = file => {
  const data = fs.readFileSync(file);
  if (data.toString('ascii', 0, 2) !== 'BM') return { width: 16, height: 16 };
  return { width: Math.abs(data.readInt32LE(18)), height: Math.abs(data.readInt32LE(22)) };
};

const stableId = name => crypto.createHash('sha1').update(`original-shooter:${name}`).digest('hex').slice(0, 16);
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const uuid = name => `${stableId(name).slice(0, 8)}-${stableId(name).slice(8, 12)}-4${stableId(name).slice(12, 15)}-8${stableId(name).slice(1, 4)}-${stableId(name).slice(4, 16)}`;
let eventSequence = 0;
const event = (command, args = {}) => ({ id: uuid(`${command}:${JSON.stringify(args)}:${eventSequence++}`), version: 1, command, args });

if (!fs.existsSync(graphicsSource) || !fs.existsSync(audioSource)) throw new Error('projeto_exemplo graphics/audio are required');
for (const dir of [path.join(target, 'assets'), path.join(target, 'project'), path.join(target, 'reference_assets')]) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
fs.mkdirSync(path.join(target, 'assets', 'backgrounds'), { recursive: true });
fs.mkdirSync(path.join(target, 'assets', 'sprites'), { recursive: true });
fs.mkdirSync(path.join(target, 'assets', 'musics'), { recursive: true });
fs.mkdirSync(path.join(target, 'assets', 'sounds'), { recursive: true });
for (const audio of fs.readdirSync(audioSource)) {
  const destination = /\.(mod|xm|s3m|it)$/i.test(audio) ? 'musics' : 'sounds';
  fs.copyFileSync(path.join(audioSource, audio), path.join(target, 'assets', destination, audio));
}

const graphicFiles = fs.readdirSync(graphicsSource).filter(file => file.endsWith('.bmp'));
const backgrounds = [];
const sprites = [];
const validSpriteSizes = new Set(['8x8', '16x16', '32x32', '64x64', '16x8', '32x8', '32x16', '8x16', '8x32', '16x32', '32x64']);
const included = [];
for (const filename of graphicFiles) {
  const stem = path.basename(filename, '.bmp');
  const metadataFile = path.join(graphicsSource, `${stem}.json`);
  const metadata = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, 'utf8')) : {};
  const size = readBmpSize(path.join(graphicsSource, filename));
  const id = `original_${stem}`;
  const frameHeight = Number(metadata.height) > 0 ? Number(metadata.height) : Math.min(size.height, 16);
  const valid = metadata.type === 'regular_bg'
    ? size.width >= 256 && size.height >= 256 && size.width % 256 === 0 && size.height % 256 === 0
    : validSpriteSizes.has(`${size.width}x${frameHeight}`);
  if (!valid) continue;
  const assetType = metadata.type === 'regular_bg' ? 'backgrounds' : 'sprites';
  fs.copyFileSync(path.join(graphicsSource, filename), path.join(target, 'assets', assetType, filename));
  included.push(filename);
  if (metadata.type === 'regular_bg') {
    backgrounds.push({ id, stem, filename, width: size.width, height: size.height });
    writeJson(path.join(backgroundsDir, stem, 'background.gbasres'), {
      _resourceType: 'background', id, name: stem, filename,
      imageWidth: size.width, imageHeight: size.height, hd: false, tileColors: '', _deleted: false,
    });
  } else {
    sprites.push({ id, stem, filename, width: size.width, height: size.height });
    const framesPerDirection = Math.max(1, Math.floor(size.height / Math.max(1, frameHeight * 4)));
    const directions = ['down', 'left', 'right', 'up'];
    const animations = directions.flatMap((direction, directionIndex) => {
      const firstFrame = directionIndex * framesPerDirection;
      const idleFrame = {
        id: `canvas-frame-${id}-idle-${direction}`,
        width: size.width,
        height: frameHeight,
        pieces: [{ id: `piece-${id}-idle-${direction}`, sourceX: 0, sourceY: firstFrame * frameHeight, width: size.width, height: frameHeight, x: 0, y: 0 }],
      };
      return [
        { id: `idle-${direction}`, name: `Idle ${direction[0].toUpperCase()}${direction.slice(1)}`, type: 'idle', frames: [firstFrame], canvasFrames: [idleFrame] },
        { id: `moving-${direction}`, name: `Moving ${direction[0].toUpperCase()}${direction.slice(1)}`, type: 'movement', frames: Array.from({ length: framesPerDirection }, (_, index) => firstFrame + index), canvasFrames: [] },
      ];
    });
    writeJson(path.join(spritesDir, stem, 'sprite.gbasres'), {
      _resourceType: 'sprite', _deleted: false, id, name: stem,
      filename, imageWidth: size.width, imageHeight: size.height,
      playerFrameWidth: size.width, playerFrameHeight: frameHeight, playerFramesPerDirection: framesPerDirection,
      playerAnimSpeed: 6, playerIdleFrame: 0, playerCanvasOriginX: Math.floor(size.width / 2),
      playerCanvasOriginY: Math.floor(frameHeight / 2), playerCollisionX: -Math.floor(size.width / 2),
      playerCollisionY: -Math.floor(frameHeight / 2), playerCollisionWidth: size.width,
      playerCollisionHeight: frameHeight,
      playerAnimations: animations,
      playerAnimationStates: [{ id: 'default', name: 'Default', type: 'default', animations }],
    });
  }
}

const bg = name => backgrounds.find(item => item.stem === name)?.id ?? `original_${name}`;
const sprite = name => sprites.find(item => item.stem === name)?.id ?? `original_${name}`;
const stageSpecs = [
  { name: 'stage_1', title: 'Stage 1 - Forest', music: 'cyberrid', enemies: ['stage_1_monsters_1', 'stage_1_monsters_2'] },
  { name: 'stage_2', title: 'Stage 2 - Ruins', music: 'basic_instinct', enemies: ['stage_2_monsters_1', 'stage_2_monsters_2'] },
  { name: 'stage_3', title: 'Stage 3 - Snow', music: 'fruit', enemies: ['stage_3_monsters_1', 'stage_3_monsters_2'] },
  { name: 'stage_4', title: 'Stage 4 - Space', music: 'soda7_xcopy_ohc', enemies: ['stage_4_enemies_1', 'stage_4_enemies_2'] },
];
const stageSceneIds = new Map(stageSpecs.map(stage => [stage.name, uuid(`scene:${stage.name}`)]));
const introSceneId = uuid('scene:intro');
const titleSceneId = uuid('scene:title');
const howToPlaySceneId = uuid('scene:how-to-play');
const creditsSceneId = uuid('scene:credits');
const sceneDefaults = (id, index, name, backgroundId, script, actors = []) => ({
  _resourceType: 'scene', id, _index: index, _deleted: false, name,
  backgroundId, backgrounds: [{ layerId: 0, backgroundId, name: '', path: '' }],
  x: index * 256, y: 0, width: 256, height: 256, sceneType: 'Top Down', showCamera: true,
  editorPosition: { x: index * 256, y: 0 }, renderMode: 'regular_tilemap', gridSize: 8,
  paletteIds: [], spritePaletteIds: [], spawnPoints: [], autoFadeSpeed: 2,
  interactionButton: 'A', eventGraphs: {}, script, actors, collisions: [], triggers: [], tileAnimations: [],
  spawnerTimelines: [], cameraPosition: { x: 0, y: 0 },
});

const stageOneId = stageSceneIds.get('stage_1');
const introScript = [
  event('EVENT_FADE_OPTIONS', { color: 'black', __collapse: true }),
  event('EVENT_PLAY_MUSIC', { musicId: 'battle_clean', volume: 60 }),
  event('EVENT_FADE_IN', { speed: 1, __automatic: true, __collapse: true }),
  event('EVENT_WAIT', { units: 'frames', frames: 120 }),
  event('EVENT_CHANGE_SCENE', { sceneId: titleSceneId, x: { type: 'number', value: 120 }, y: { type: 'number', value: 136 }, direction: 'right', fadeSpeed: 2 }),
];
writeJson(path.join(scenesDir, 'intro', 'scene.gbasres'), sceneDefaults(introSceneId, 0, 'Intro', bg('butano_background'), introScript));

const titleActors = sprites.some(item => item.stem === 'stage_1_intro')
  ? [{ id: uuid('title:hero'), actorId: uuid('title:hero'), name: 'Title Artwork', x: 120, y: 90, width: 64, height: 64, anchor: 'center', direction: 'right', spriteId: sprite('stage_1_intro') }]
  : [];
for (const [stem, x, y, width, height] of [
  ['butano_big_sprite', 54, 58, 64, 64], ['butano_big_silhouette', 186, 58, 64, 64], ['butano_fire', 120, 118, 32, 32],
]) {
  if (sprites.some(item => item.stem === stem)) titleActors.push({ id: uuid(`title:${stem}`), actorId: uuid(`title:${stem}`), name: `Title ${stem}`, x, y, width, height, anchor: 'center', direction: 'right', spriteId: sprite(stem) });
}
const menuResultVariable = uuid('menu-result');
const branchOnMenuResult = (value, children) => event('EVENT_IF', {
  left: { kind: 'variable', variableId: menuResultVariable }, operator: '==',
  right: { kind: 'literal', type: 'number', value },
  children: { then: children, else: [] },
});
const leaveTitle = destination => [
  event('EVENT_HBE_EFFECT_DISABLE', { __collapse: true }),
  event('EVENT_CHANGE_SCENE', { sceneId: destination, x: { type: 'number', value: 120 }, y: { type: 'number', value: 136 }, direction: 'right', fadeSpeed: 2 }),
];
const titleScript = [
  event('EVENT_HBE_EFFECT_ENABLE', { preset: 'mosaic_wave', intensity: 6, layerId: 0, __collapse: true }),
  event('EVENT_FADE_IN', { speed: 2, __automatic: true, __collapse: true }),
  event('EVENT_MENU_OPEN', {
    prompt: 'BUTANO FIGHTER', options: ['START', 'HOW TO PLAY', 'CREDITS', 'RUMBLE ON/OFF'],
    resultVariable: menuResultVariable, __collapse: true,
  }),
  branchOnMenuResult(0, leaveTitle(stageOneId).map((item, index) => index === 1 ? { ...item, args: { ...item.args, direction: 'up' } } : item)),
  branchOnMenuResult(1, leaveTitle(howToPlaySceneId)),
  branchOnMenuResult(2, leaveTitle(creditsSceneId)),
  branchOnMenuResult(3, [event('EVENT_RUMBLE', { durationFrames: 12, intensity: 70 }), ...leaveTitle(titleSceneId)]),
];
writeJson(path.join(scenesDir, 'title', 'scene.gbasres'), sceneDefaults(titleSceneId, 1, 'Title', bg('butano_background'), titleScript, titleActors));

const howToActors = [
  ['hero_bullets', 64, 92, 32, 32], ['hero_weapons', 176, 92, 64, 32], ['hero_shield', 64, 92, 32, 32],
  ['hero_bomb_icon', 176, 92, 32, 32], ['experience_bar', 120, 116, 64, 16],
].filter(([stem]) => sprites.some(item => item.stem === stem)).map(([stem, x, y, width, height]) => ({
  id: uuid(`how-to:${stem}`), actorId: uuid(`how-to:${stem}`), name: `How To Play ${stem}`, x, y, width, height, anchor: 'center', direction: 'right', spriteId: sprite(stem), visible: false,
}));
const howToActor = stem => howToActors.find(actor => actor.name.endsWith(stem));
const showHowToActor = (stem, visible) => {
  const actor = howToActor(stem);
  return actor ? event('EVENT_ACTOR_SET_VISIBLE', { actorId: actor.id, visible, __collapse: true }) : null;
};
const howToPage = (actorStem, text) => [showHowToActor(actorStem, true), event('EVENT_DISPLAY_DIALOGUE', { text, dialogueFont: 'fixed8x8', showFrame: true, horizontalAlign: 'center', verticalAlign: 'center', animate: true }), showHowToActor(actorStem, false)].filter(Boolean);
const howToPlayScript = [
  event('EVENT_FADE_IN', { speed: 2, __automatic: true, __collapse: true }),
  ...howToPage('hero_bullets', 'HOW TO PLAY\\nMove with the D-pad. Press A to fire and B to launch a bomb.'),
  ...howToPage('hero_weapons', 'Collect gems to gain experience and improve your weapon. Protect the hero from enemy fire.'),
  ...howToPage('hero_shield', 'Each stage ends with a boss. Use movement, shots and bombs to survive the encounter.'),
  ...howToPage('hero_bomb_icon', 'Bombs clear enemy bullets and damage every enemy on screen. Save them for dangerous waves.'),
  ...howToPage('experience_bar', 'The experience bar shows your progress. Defeat enemies and collect gems to level up.'),
  event('EVENT_CHANGE_SCENE', { sceneId: titleSceneId, x: { type: 'number', value: 120 }, y: { type: 'number', value: 136 }, direction: 'left', fadeSpeed: 2 }),
];
writeJson(path.join(scenesDir, 'how_to_play', 'scene.gbasres'), sceneDefaults(howToPlaySceneId, 2, 'How To Play', bg('butano_background'), howToPlayScript, howToActors));

const creditsScript = [
  event('EVENT_PLAY_MUSIC', { musicId: 'fruit', volume: 70 }),
  event('EVENT_CREDITS_PLAY', { text: 'BUTANO FIGHTER\\n\\nOriginal game and art\\nButano sample project\\n\\nReconstructed with GBA Studio events\\n\\nPress A after the credits to return.', dialogueFont: 'fixed8x8', showFrame: false, horizontalAlign: 'center', verticalAlign: 'center', animate: true, animationSpeed: 'slow' }),
  event('EVENT_CHANGE_SCENE', { sceneId: titleSceneId, x: { type: 'number', value: 120 }, y: { type: 'number', value: 136 }, direction: 'left', fadeSpeed: 2 }),
];
writeJson(path.join(scenesDir, 'credits', 'scene.gbasres'), sceneDefaults(creditsSceneId, 3, 'Credits', bg('butano_background'), creditsScript));

for (const [index, stage] of stageSpecs.entries()) {
  const sceneId = stageSceneIds.get(stage.name);
  const timelineId = `wave_${stage.name}`;
  const actors = [
    { id: uuid(`${stage.name}:player`), actorId: uuid(`${stage.name}:player`), name: 'Hero', x: 120, y: 136, width: 16, height: 16, anchor: 'center', direction: 'up', spriteId: sprite('hero_body_flying') },
  ];
  const entries = stage.enemies.filter(name => sprites.some(item => item.stem === name)).map((name, enemyIndex) => ({
    frame: enemyIndex * 45, archetypeId: sprite(name), x: 48 + enemyIndex * 96, y: 32,
    patternId: stage.name === 'stage_4' && enemyIndex === 1 ? 'boss' : (enemyIndex ? 'sine' : 'straight'), dropId: sprite('gem'),
  }));
  const script = [
    event('EVENT_FADE_IN', { speed: 2, __automatic: true, __collapse: true }),
    event('EVENT_SHOOTER_LOAD_STAGE', { waveId: timelineId, musicId: stage.music, musicVolume: 80, backgroundId: bg(stage.name), backgroundLayer: 0 }),
    event('EVENT_SHOOTER_START', { waveId: timelineId }),
    event('EVENT_WAIT', { units: 'frames', frames: 180 }),
    event('EVENT_SHOOTER_SPAWN_BOSS', { archetypeId: sprite(stage.enemies[1]), x: 120, y: 32, dropId: sprite('gem') }),
    event('EVENT_SHOOTER_WAIT_SIGNAL', { signal: 'boss_defeated', timeoutFrames: 1800 }),
  ];
  const nextStage = stageSpecs[index + 1];
  if (nextStage) {
    script.push(event('EVENT_CHANGE_SCENE', {
      sceneId: stageSceneIds.get(nextStage.name), x: { type: 'number', value: 120 }, y: { type: 'number', value: 136 }, direction: 'up', fadeSpeed: 2,
    }));
  } else {
    script.push(event('EVENT_SHOOTER_STOP'));
  }
  const stageScene = sceneDefaults(sceneId, index + 2, `Stage${index + 1}_${stage.name}`, bg(stage.name), script, actors);
  stageScene.spawnerTimelines = [{ id: timelineId, entries }];
  writeJson(path.join(scenesDir, stage.name, 'scene.gbasres'), stageScene);
}

const firstScene = introSceneId;
writeJson(path.join(target, 'project', 'settings.gbasres'), {
  _resourceType: 'settings', startSceneId: firstScene, startX: 120, startY: 136,
  startMoveSpeed: 2, startAnimSpeed: 4, startDirection: 'up', colorMode: false,
  playerSpriteId: sprite('hero_body_flying'), demoAudioMuted: false, demoAudioVolume: 0.8,
  demoShowMenu: true, shooterConfig: { defaultWaveId: 'wave_stage_1', projectileSpriteId: sprite('hero_bullets'), playerHitPoints: 3, defaultDamage: 1, bossHitPoints: 48 },
});
writeJson(path.join(target, 'project', 'variables.gbasres'), { _resourceType: 'variables', _version: '1.0', variables: [
  { id: uuid('score'), name: 'score', symbol: 'variable_score', type: 'number', initialValue: 0 },
  { id: menuResultVariable, name: 'Menu result', symbol: 'menu_result', type: 'number', initialValue: 0 },
] });
writeJson(path.join(target, 'project', 'scripts.gbasres'), { _resourceType: 'scripts', scripts: [] });
writeJson(path.join(target, 'project', 'user_settings.gbasres'), { _resourceType: 'user_settings' });
writeJson(path.join(target, 'shooter_game.gbaproj'), { _resourceType: 'project', name: 'ShooterGameOriginal', author: 'GBA Studio', notes: 'Reconstructed from projeto_exemplo using engine ShooterKit resources.', _version: '0.5.0', _release: '1' });
console.log(`Reconstructed shooter package: ${graphicFiles.length} source graphics (${included.length} build-compatible), ${fs.readdirSync(audioSource).length} audio files, ${stageSpecs.length} stages.`);
