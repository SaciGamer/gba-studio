import { IResourceSettings } from "./IBaseSettings";

enum ETypeScene {
    TOPDOWN = 'Top Down',
    PLATFORM = 'Platformer',
    ADVENTURE = 'Adventure',
    SHMUP = 'Shoot Em\'Up',
    POINTNCLICK = 'Point Click',
    LOGO = 'Logo'
}

export interface ISceneSettings extends IResourceSettings {
    _index: number;
    backgroundId: string;
    background: string;
    x: number;
    y: number;
    width: number;
    height: number;
    // Schema on Frontend
    tileseId?: string;
    type?: ETypeScene;
    paletteIds?: string[];
    spritePaletteIds?: string[];
    collisions?: string[];
    autoFadeSpeed?: number;
    script?: object[];
    playerHit1Script?: object[],
    playerHit2Script?: object[],
    playerHit3Script?: object[]
}

export interface SceneContextType {
    // Scene Settings
    scenes: ISceneSettings[];
    setScenes: React.Dispatch<React.SetStateAction<ISceneSettings[]>>;
}