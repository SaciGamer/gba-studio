import { IChangeScene } from "@/components/events/interfaces/IScene";
import { IFade, IFadeOptions } from "@/components/events/interfaces/IFade";
import { IWait } from "@/components/events/interfaces/IWaiting";
import { IResourceSettings } from "./IBaseSettings";
import { IChangeBackgroundArgs, IChangePaletteBackgroundArgs, IVisibleBackgroundArgs, LayerMultiProps } from "@/components/events/interfaces/ILayer";
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
    /** Image top-left position in scene coordinates. */
    x?: number;
    y?: number;
    paletteId?: string | null;
    /** Reconstructible tile edits applied over this layer at build time. */
    tileMap?: number[][];
    /** Palette selected for each painted 8×8 cell; all scene layers share 16 palette banks. */
    tilePaletteIds?: Array<Array<string | null>>;
    paintPaletteId?: string | null;
    selectedTilesetId?: string;
    selectedTiles?: number[];
}
export interface IArgs {
    [key: string]: any;
    __comment?: boolean;
    /** Marks the Fade In inserted when a scene is created. */
    __automatic?: boolean;
    __name?: string;
    __collapse?: boolean;
    __x?: number;
    __y?: number;
    animationSpeed?: number;
    showCamera?: boolean;
}

export type IConditionValue =
    | { kind: 'literal'; value: VariableValue; type: EVariableType }
    | { kind: 'variable'; variableId: string; symbol: string; type: EVariableType }
    | { kind: 'button'; button: string; type: 'boolean' };

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
    version?: 1;
    command: string;
    args?: IArgs & (IFade | IFadeOptions | IChangeScene | IWait | LayerMultiProps | IChangeBackgroundArgs | IVisibleBackgroundArgs | IChangePaletteBackgroundArgs | IIfArgs | IVariableSetValueArgs | IVariableBooleanArgs | IVariableResetAllArgs);
    children?: IIfChildren;
    position?: { x: number; y: number };
}
interface IPosAndWidth {
    id?: string;
    sceneId?: string;
    name?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    collisionSide?: 'solid' | 'top' | 'down' | 'left' | 'right';
    activation?: 'enter' | 'exit' | 'stay' | 'interact' | 'touch' | 'input' | 'timer';
    enabled?: boolean;
    once?: boolean;
    cooldownFrames?: number;
    script?: IScriptsElement[];
    onEnterScript?: IScriptsElement[];
    onLeaveScript?: IScriptsElement[];
}

export interface ISceneTrigger extends IPosAndWidth {
    id: string;
    activation: 'enter' | 'exit' | 'stay' | 'interact' | 'touch' | 'input' | 'timer';
    enabled: boolean;
    once: boolean;
    cooldownFrames: number;
    onEnterScript?: IScriptsElement[];
    onLeaveScript?: IScriptsElement[];
    onInteractScript?: IScriptsElement[];
    onInitScript?: IScriptsElement[];
    onUpdateScript?: IScriptsElement[];
}

export interface IScriptGraphEdge {
    id: string;
    source: string;
    sourceHandle: 'next' | 'then' | 'else';
    target: string;
    targetHandle: 'input';
}

export interface IScriptGraph {
    version: 1;
    entryNodeId: string | null;
    nodes: IScriptsElement[];
    edges: IScriptGraphEdge[];
}

export interface ISceneActor extends IPosAndWidth {
    actorId?: string;
    direction?: string;
    moveSpeed?: number;
    animationSpeed?: number;
    spriteId?: string;
}

export interface ISceneSpawnPoint {
    id: string;
    name: string;
    x: number;
    y: number;
    direction?: string;
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
    triggers?: ISceneTrigger[];
    actors?: ISceneActor[];
    spawnPoints?: ISceneSpawnPoint[];
    editorPosition?: { x: number; y: number };
    renderMode?: 'regular_tilemap' | 'palette_bitmap' | 'direct_bitmap';
    gridSize?: 8 | 16;
    autoFadeSpeed?: number;
    playerSpriteId?: string;
    interactionButton?: string;
    script?: IScriptsElement[];
    playerHit1Script?: IScriptsElement[],
    playerHit2Script?: IScriptsElement[],
    playerHit3Script?: IScriptsElement[],
    eventGraphs?: Record<string, IScriptGraph>;
    // Tiles editor fields
    imageType?: EImageType;
    selectedTilesetId?: string;
    selectedTiles?: number[];
    tileMap?: number[][];
    isEditingMap?: boolean;
}
export interface SceneContextType {
    // Scene Settings
    scenes: ISceneSettings[];
    setScenes: React.Dispatch<React.SetStateAction<ISceneSettings[]>>;
}
