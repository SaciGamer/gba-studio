import { IBaseSettings } from "./IBaseSettings";

export interface IUserSettings extends IBaseSettings{
    worldScrollX: number;
    worldScrollY: number;
    zoom: number;
    favoriteEvents?: string[];
}

export interface SettingUtilsContextType {
    userSettings: IUserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<IUserSettings>>;
}
