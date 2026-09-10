import { IChangeScene } from "@/components/events/interfaces/IScene";
import { IFade } from "@/components/events/interfaces/IFade";
import { IWait } from "@/components/events/interfaces/IWaiting";
import { IResourceSettings } from "./IBaseSettings";
import { LayerMultiProps } from "@/components/events/interfaces/ILayer";
import { EVariableType, VariableValue } from "./IVariablesElement";

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
export interface IArgs {
    __comment?: boolean;
    __collapse?: boolean;
    __x?: number;
    __y?: number;
}

export type IConditionValue =
    | { kind: 'literal'; value: VariableValue; type: EVariableType }
    | { kind: 'variable'; variableId: string; symbol: string; type: EVariableType };

export interface IIfArgs extends IArgs {
    left: IConditionValue;
    operator: '==' | '!=' | '>' | '>=' | '<' | '<=';
    right: IConditionValue;
}

export interface IIfChildren {
    then: IScriptsElement[];
    else?: IScriptsElement[];
    thenCollapsed?: boolean;
    elseCollapsed?: boolean;
}

export interface IVariableReference {
    kind: 'variable';
    variableId: string;
    symbol: string;
    type: EVariableType;
}

export interface IVariableLiteral {
    kind: 'literal';
    type: EVariableType;
    value: VariableValue;
}

export type IVariableValue = IVariableReference | IVariableLiteral;

export interface IVariableSetValueArgs extends IArgs {
    variableId: string;
    variableSymbol: string;
    value: IVariableValue;
}

export interface IVariableBooleanArgs extends IArgs {
    variableId: string;
    variableSymbol: string;
}

export interface IVariableResetAllArgs extends IArgs {
    scope: 'ALL' | 'GLOBAL' | 'LOCAL' | 'TEMP';
}
export interface IScriptsElement {
    id: string;
    command: string;
    args?: IArgs & (IFade | IChangeScene | IWait | LayerMultiProps | IIfArgs | IVariableSetValueArgs | IVariableBooleanArgs | IVariableResetAllArgs);
    children?: IIfChildren;
    position?: { x: number; y: number };
}
interface IPosAndWidth {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ICameraSettings {
    cameraPosition?: { x: number; y: number };
    showCamera?: boolean;
}
export interface ISceneSettings extends IResourceSettings, ICameraSettings {
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
}
export interface SceneContextType {
    // Scene Settings
    scenes: ISceneSettings[];
    setScenes: React.Dispatch<React.SetStateAction<ISceneSettings[]>>;
}
