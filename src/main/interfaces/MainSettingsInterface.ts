export interface IBaseSettings {
    _resourceType: string;
}

export interface ISettingsUtils extends IBaseSettings {
    saved: boolean;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
}

export interface IMainSettings extends IBaseSettings {
    startSceneId: string;
    startX: number;
    startY: number;
    startMoveSpeed: number;
    startAnimSpeed: number;
    startDirection: 'up' | 'down' | 'left' | 'right';
    fadeDirection: 0 | 1;
    inputMap?: Record<string, string[]>;
    inputMapsBySceneType?: import('../../shared/inputMap').SceneInputMaps;
    inputGroups?: import('../../shared/inputGroups').InputGroups;
    demoAudioVolume?: number;
    demoAudioMuted?: boolean;
    demoShowCPU?: boolean;
    demoJoystick?: { id: string; index: number };
    playerSpriteId?: string | null;
    uiCursorImage?: string | null;
    uiFrameImage?: string | null;
    font8x8Image?: string | null;
    font8x16Image?: string | null;
    font8x8VariablesImage?: string | null;
    font8x16VariablesImage?: string | null;
    font16x16VariablesImage?: string | null;
    playerAnimationStripOrientation?: 'horizontal' | 'vertical';
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
    palettes?: Array<{
        id: string;
        name: string;
        colors: string[];
        custom?: boolean;
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

export interface IUserSettings extends IBaseSettings {
    worldScrollX: number,
    worldScrollY: number,
    zoom: number,
    favoriteEvents: Array<string>;
}

export interface IProjectSettings extends IFileSettings {
    name: string | null;
    author: string;
    notes: string;
    cartridgeImage?: string | null;
}

export interface IFileSettings extends IBaseSettings {
    _version: string | null;
    _release: string;
}

export type EVariableType = 'number' | 'boolean' | 'string';

export interface IVariableDefinition {
    id: string;
    name: string;
    symbol: string;
    type: EVariableType;
    initialValue: number | boolean | string;
}

export interface IVariablesSettings extends IBaseSettings {
    _resourceType: 'variables';
    _version: string;
    variables: IVariableDefinition[];
}
