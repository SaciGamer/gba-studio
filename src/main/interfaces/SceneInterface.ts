import { IBaseSettings } from "./MainSettingsInterface";

export enum ETypeScene {
    TOPDOWN,
    PLATFORM,
    ADVENTURE,
    SHMUP,
    POINTNCLICK,
    LOGO
}

export interface ISceneSettings extends IBaseSettings {
    _resourceType: 'scene';
    _index: number;
    id: string;
    name: string;
    backgroundId: string;
    tileseId: string;
    width: number;
    height: number;
    type: ETypeScene;
    paletteIds: string[];
    spritePaletteIds: string[];
    collisions: string[];
    autoFadeSpeed: number;
    symbol: string;
    x: number;
    y: number;
    script: object[];
    playerHit1Script: object[],
    playerHit2Script: object[],
    playerHit3Script: object[]
}