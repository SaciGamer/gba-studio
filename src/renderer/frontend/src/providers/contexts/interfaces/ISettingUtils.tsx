import { IBaseSettings } from "./IBaseSettings";

interface IActiveButtons {
    activeButton: string | number;
    activeSubButton: string | number;
}

interface IImages {
    images: string[] | null;
    imagesHD: string[] | null;
    localImagePath: string;
    localImagePathHD: string;
}

interface IZoom {
    buttonZoomPressed: boolean;
}

export interface ISettingUtils extends IBaseSettings, IActiveButtons, IImages, IZoom {
    referenceTarget?: { eventId?: string; tab?: string; requestId: number };
    _resourceType: string;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
    /** Scene currently edited as a tile layout; editor-only state. */
    tileEditSceneId?: string | null;
    /** Layer being painted inside the scene tile editor. */
    tileEditLayerId?: number | null;
    /** Tile source hovered in the scene editor's per-layer tileset list. */
    tileSourceHover?: { sceneId: string; layerId: number; tilesetId: string; color?: string } | null;
    /** Auto-tile slot selected for placement in the active scene. */
    selectedAutoTileSlot?: { sceneId: string; slotIndex: number } | null;
    /** Auto-tile slot hovered in the view, highlighted on the edited layer. */
    autoTileSlotHover?: { sceneId: string; layerId: number; slotIndex: number } | null;
    /** Tile stamp flips stay independent from the selected paint brush. */
    tileFlipHorizontal?: boolean;
    tileFlipVertical?: boolean;
    /** Independent selections used by the Events-layer collision tool. */
    collisionBrushSize?: '8px' | 'bucket';
    collisionSide?: 'solid' | 'top' | 'down' | 'left' | 'right' | 'ladder';
    /** Runtime-only Colorize palette-bank accounting for the edited scene. */
    colorizePaletteUsage?: { sceneId: string; originalSlots: number; colorizePaletteIds: string[]; usedSlots: number } | null;
    /** Trigger selected while editing the active tile layout. */
    activeTriggerId?: string | null;
    activeSceneObject?: { sceneId: string; type: 'actor' | 'trigger'; id: string } | null;
    /** Prefab currently following the pointer for placement in a scene. */
    pendingPrefabPlacement?: string | null;
    /** Scene IDs selected in the world graph; the last one is the active scene. */
    selectedSceneIds?: string[];
    /** Transient scene-name filter for the central Game World view. */
    worldSceneSearch?: string;
}

export interface SettingUtilsContextType {
    settingUtils: ISettingUtils;
    setSettingUtils: React.Dispatch<React.SetStateAction<ISettingUtils>>;
}
