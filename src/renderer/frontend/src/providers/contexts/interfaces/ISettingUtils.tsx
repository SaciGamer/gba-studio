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
    _resourceType: string;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
    /** Scene currently edited as a tile layout; editor-only state. */
    tileEditSceneId?: string | null;
    /** Layer being painted inside the scene tile editor. */
    tileEditLayerId?: number | null;
    /** Independent selections used by the Events-layer collision tool. */
    collisionBrushSize?: '8px' | 'bucket';
    collisionSide?: 'solid' | 'top' | 'down' | 'left' | 'right';
    /** Runtime-only Colorize palette-bank accounting for the edited scene. */
    colorizePaletteUsage?: { sceneId: string; originalSlots: number; colorizePaletteIds: string[]; usedSlots: number } | null;
    /** Trigger selected while editing the active tile layout. */
    activeTriggerId?: string | null;
    activeSceneObject?: { sceneId: string; type: 'actor' | 'trigger'; id: string } | null;
    /** Scene IDs selected in the world graph; the last one is the active scene. */
    selectedSceneIds?: string[];
}

export interface SettingUtilsContextType {
    settingUtils: ISettingUtils;
    setSettingUtils: React.Dispatch<React.SetStateAction<ISettingUtils>>;
}
