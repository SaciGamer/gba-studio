import { IChangeScene } from "@/components/events/interfaces/IChangeScene";
import { IFade } from "@/components/events/interfaces/IFade";
import { IWait } from "@/components/events/interfaces/IWaiting";
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
    backgroundId?: string | null;
}

export interface IArgs extends IFade, IChangeScene, IWait {
  __comment?: boolean;
  __collapse?: boolean;
}

export interface IScriptsElement {
    id: string;
    command: string;
    args?: IArgs;
    children?: Object[];
}

interface IPosAndWidth {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ISceneSettings extends IResourceSettings {
    _index: number;
    backgroundId?: string;  // REMOVER
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
    script?: IScriptsElement[];
    playerHit1Script?: IScriptsElement[],
    playerHit2Script?: IScriptsElement[],
    playerHit3Script?: IScriptsElement[],
    // Tiles editor fields
    imageType?: EImageType;
    selectedTilesetId?: string;
    tileMap?: number[][];
    isEditingMap?: boolean;
    cameraPosition?: { x: number; y: number };
}

export interface SceneContextType {
    // Scene Settings
    scenes: ISceneSettings[];
    setScenes: React.Dispatch<React.SetStateAction<ISceneSettings[]>>;
}