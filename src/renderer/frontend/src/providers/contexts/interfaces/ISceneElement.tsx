import { IResourceSettings } from "./IBaseSettings";

export enum ETypeScene {
    TOPDOWN = 'Top Down',
    PLATFORM = 'Platformer',
    ADVENTURE = 'Adventure',
    SHMUP = 'Shoot Em\'Up',
    POINTNCLICK = 'Point Click',
    LOGO = 'Logo'
}

export enum EImageType {
    PALETTE_BITMAP_BG = 'palette_bitmap_bg',
    DP_DIRECT_BITMAP_BG = 'dp_direct_bitmap_bg'
}

export interface IBackgroundElement {
    layerId: number;
    backgroundId?: string;
}

interface IPosAndWidth {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ISceneSettings extends IResourceSettings {
    _index: number;
    backgroundId?: string;  // Made optional
    background?: string;    // Made optional
    backgrounds?: IBackgroundElement[];
    x: number;
    y: number;
    width: number;
    height: number;
    // Schema on Frontend
    tileseId?: string;
    sceneType?: ETypeScene;
    paletteIds?: string[];
    spritePaletteIds?: string[];
    collisions?: IPosAndWidth[];
    triggers?: IPosAndWidth[];
    autoFadeSpeed?: number;
    script?: object[];
    playerHit1Script?: object[],
    playerHit2Script?: object[],
    playerHit3Script?: object[],
    // Tiles editor fields
    imageType?: EImageType;
    selectedTilesetId?: string;
    tileMap?: number[][];
    isEditingMap?: boolean;
}

export interface SceneContextType {
    // Scene Settings
    scenes: ISceneSettings[];
    setScenes: React.Dispatch<React.SetStateAction<ISceneSettings[]>>;
}