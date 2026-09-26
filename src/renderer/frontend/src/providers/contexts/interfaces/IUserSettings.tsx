import { IBaseSettings } from "./IBaseSettings";

export interface IUserSettings extends IBaseSettings{
    worldScrollX: number;
    worldScrollY: number;
    zoom: number;
    favoriteEvents?: string[];
    /** Hidden only in the editor canvas; never emitted to the game template. */
    hiddenBackgroundLayers?: string[];
    /** Scene grids hidden in the World tile editor; never emitted to the game template. */
    hiddenTileGridSceneIds?: string[];
}

export interface SettingUtilsContextType {
    userSettings: IUserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<IUserSettings>>;
}
