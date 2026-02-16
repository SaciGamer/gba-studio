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

export interface ISettingUtils extends IBaseSettings, IActiveButtons, IImages {
    _resourceType: string;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
}

export interface SettingUtilsContextType {
    // Main Settings
    settingUtils: ISettingUtils;
    setSettingUtils: React.Dispatch<React.SetStateAction<ISettingUtils>>;
}
