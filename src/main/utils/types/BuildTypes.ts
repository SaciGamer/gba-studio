import type { CanvasAnimationPlan } from '../builders/spriteCanvasPlan';
/**
 * Types and interfaces for GBA project building using Butano template structure
 */

export interface ProjectResource {
  resourceType: string;
  name: string;
  path: string;
  content?: string;
}

export interface ProjectAsset {
  path: string;
  base64?: string;
  buffer?: Buffer;
}

export interface ProjectData {
  name: string;
  resources: ProjectResource[];
  assets: ProjectAsset[];
}

export interface BuildConfig {
  projectDir: string;
  projectName: string;
  targetDir: string;
  romTitle?: string;
  romCode?: string;
}

export interface TranscodeOptions {
  /** Explicit complete-template diagnostic mode; selective analysis never falls back silently. */
  runtimeMode?: 'selective' | 'full';
  parallel?: number;
  onProgress?: (message: string, messageKey?: string, messageParams?: Record<string, string | number>) => void;
  projectDir: string;
  markerProjectDir?: string;
  outputDir?: string;
  projectName?: string;
  includeAssets?: boolean;
}

export interface TranscodeResult {
  success: boolean;
  message: string;
  outputDir?: string;
  buildDir?: string;
  sourceFiles?: string[];
  assetFiles?: string[];
}

export interface CompileOptions {
  buildDir: string;
  parallel?: number;
  verbose?: boolean;
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3' | 'Og' | 'Os';
}

export interface CompileResult {
  success: boolean;
  stdout: string;
  stderr: string;
  gbaPath?: string | null;
  elfPath?: string | null;
  mapPath?: string | null;
}

export interface TemplateConfig {
  templateDir: string;
  buildDir: string;
  srcDir?: string;
  includeDirs?: string[];
  graphicsDirs?: string[];
  audioDirs?: string[];
  romTitle: string;
  romCode: string;
}

export interface GameConfig {
  projectName: string;
  authorName?: string;
  version?: string;
  useThreads?: boolean;
  useAudio?: boolean;
  useGraphics?: boolean;
}

export interface JsonResourceDefault {
  /** Only attached to the build copy; never serialized into project assets. */
  __spriteCanvas?: { graphicsName: string; width: number; height: number; frameWidth: number; frameHeight: number; canvasWidth: number; canvasHeight: number; partsColumns: number; partsRows: number; idleFrame: number; animations: CanvasAnimationPlan[] };
  playerAnimationStripOrientation?: 'horizontal' | 'vertical';
  _resourceType: string;
  _deleted?: boolean;
  id?: string;
  name?: string;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
  width?: number;
  height?: number;
  cameraPosition?: { x?: number; y?: number };
  sceneType?: string;
  backgrounds?: any[];
  script?: any[];
  fadeDirection?: 0 | 1;
  startAnimSpeed?: number;
  playerSpriteId?: string | null;
  uiCursorImage?: string | null;
  uiFrameImage?: string | null;
  font8x8Image?: string | null;
  font8x16Image?: string | null;
  font8x8VariablesImage?: string | null;
  font8x16VariablesImage?: string | null;
  font16x16VariablesImage?: string | null;
  playerFrameWidth?: number;
  playerFrameHeight?: number;
  playerFramesPerDirection?: number;
  playerAnimSpeed?: number;
  playerIdleFrame?: number;
  playerCanvasOriginX?: number;
  playerCanvasOriginY?: number;
  playerCollisionX?: number;
  playerCollisionY?: number;
  playerCollisionWidth?: number;
  playerCollisionHeight?: number;
  playerAnimations?: Array<{ id: string; name: string; frames: number[]; canvasFrames?: SpriteCanvasFrame[] }>;
  playerAnimationStates?: Array<{
    id: string;
    name: string;
    type: string;
    flipRightToCreateLeftFacingFrames?: boolean;
    animations: Array<{ id: string; name: string; frames: number[]; type?: string; canvasFrames?: SpriteCanvasFrame[] }>;
  }>;
  inputMap?: Record<string, string[]>;
    inputMapsBySceneType?: import('../../../shared/inputMap').SceneInputMaps;
    inputGroups?: import('../../../shared/inputGroups').InputGroups;
  combatConfig?: {
    maxProjectiles?: number;
    maxEnemies?: number;
    maxPickups?: number;
    playerHitPoints?: number;
    defaultDamage?: number;
    bossHitPoints?: number;
    collisionRules?: Array<{ sourceGroup: string; targetGroup: string }>;
  };
  shooterConfig?: {
    defaultWaveId?: string;
    projectileSpriteId?: string;
    playerHitPoints?: number;
    defaultDamage?: number;
    bossHitPoints?: number;
  };
}

interface SpriteCanvasFrame {
  id: string;
  width: number;
  height: number;
  pieces: Array<{
    id: string;
    sourceX: number;
    sourceY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    flipX?: boolean;
    flipY?: boolean;
  }>;
}

export interface ResourceFile {
  resourceName: string;
  resourceType: string;
  headerContent: Buffer;
  jsonContent?: JsonResourceDefault;
}
