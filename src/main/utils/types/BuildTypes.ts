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
  tileMap?: number[][];
  selectedTilesetId?: string;
  imageType?: string;
  backgrounds?: any[];
  script?: any[];
  colorMode?: 'mono' | 'mixed' | undefined;
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
  }>;
}

export interface ResourceFile {
  resourceName: string;
  resourceType: string;
  headerContent: Buffer;
  jsonContent?: JsonResourceDefault;
}
