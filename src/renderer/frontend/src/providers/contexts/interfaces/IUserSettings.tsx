import { IBaseSettings } from "./IBaseSettings";

export interface SpriteCenterLayout {
    sizes: [number, number];
    sections: { tiles: boolean; frames: boolean };
    expandedSizes: [number, number];
}

export interface IUserSettings extends IBaseSettings{
    worldScrollX: number;
    worldScrollY: number;
    zoom: number;
    favoriteEvents?: string[];
    /** Hidden only in the editor canvas; never emitted to the game template. */
    hiddenBackgroundLayers?: string[];
    /** Animation visibility only in the Scene editor, keyed by scene ID and animation ID. */
    hiddenTileAnimations?: string[];
    /** Global World tile editor grid visibility; never emitted to the game template. */
    showTileEditorGrid?: boolean;
    /** Global display-only tile grid size; does not change tile map data. */
    tileEditorGridSize?: 8 | 16;
    /** Per-tileset editor view preferences; never emitted to the game template. */
    tilesetViews?: Record<string, { cellSize: 8 | 16 | 32; zoom: number; showGrid: boolean }>;
    /** Right panel scroll offsets per scene/object; editor-only project preferences. */
    eventEditorFocus?: Record<string, string | undefined>;
    rightPanelScrollPositions?: Record<string, number>;
    /** Expanded state nodes in the sprite editor, keyed by sprite ID. */
    spriteStateExpandedKeys?: Record<string, string[]>;
    spriteSidebarLayout?: { sizes: [number, number]; sections: { sprites: boolean; states: boolean } };
    spriteCenterLayout?: SpriteCenterLayout;
}

export interface SettingUtilsContextType {
    userSettings: IUserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<IUserSettings>>;
}
