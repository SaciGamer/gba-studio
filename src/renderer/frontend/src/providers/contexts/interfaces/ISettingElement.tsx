import { IBaseSettings } from "./IBaseSettings";

// Interface centralizada
export enum EColorMode {
    Mono = "mono",
    Mixed = "mixed",
}

export interface ISpriteAnimation {
    id: string;
    name: string;
    frames: number[];
    type?: string;
    canvasFrames?: ISpriteCanvasFrame[];
}

export interface ISpriteFramePiece {
    id: string;
    sourceX: number;
    sourceY: number;
    width: number;
    height: number;
    x: number;
    y: number;
}

export interface ISpriteCanvasFrame {
    id: string;
    width: number;
    height: number;
    pieces: ISpriteFramePiece[];
}

export interface ISpriteAnimationState {
    id: string;
    name: string;
    type: string;
    flipRightToCreateLeftFacingFrames?: boolean;
    animations: ISpriteAnimation[];
}

export interface IPaletteDefinition {
    id: string;
    name: string;
    colors: string[];
    createdAt?: number;
    custom?: boolean;
}

export interface IMainSettings extends IBaseSettings {
    _resourceType: 'settings';
    startSceneId: string;
    startX: number;
    startY: number;
    startMoveSpeed: number | string;
    startAnimSpeed: number;
    startDirection: 'up' | 'down' | 'left' | 'right';
    colorMode: EColorMode;
    fadeDirection: 0 | 1;
    controls?: Object[];
    demoShowFPS?: boolean;
    demoFilter?: string;
    demoAudioVolume?: number;
    demoAudioMuted?: boolean;
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
    playerAnimations?: ISpriteAnimation[];
    playerAnimationStates?: ISpriteAnimationState[];
    palettes?: IPaletteDefinition[];
    paletteIds?: string[];
}

export interface MainSettingsContextType {
    // Main Settings
    settings?: IMainSettings;
    setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}
