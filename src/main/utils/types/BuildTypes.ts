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
  tileMap?: number[][];
  selectedTilesetId?: string;
  imageType?: string;
  backgrounds?: any[];
  script?: any[];
  colorMode?: 'mono' | 'mixed' | undefined;
}

export interface ResourceFile {
  resourceName: string;
  resourceType: string;
  headerContent: Buffer;
  jsonContent?: JsonResourceDefault;
}
