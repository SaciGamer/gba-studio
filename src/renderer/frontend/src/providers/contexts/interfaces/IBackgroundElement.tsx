import { IResourceSettings } from "./IBaseSettings";

export interface IBackgroundSettings extends IResourceSettings {
    _resourceType: 'background';
    imageWidth: number;
    imageHeight: number;
    tileColors: string;
    autoColor: boolean;
}

export interface BackgroundContextType {
    // Images Settings
    backgrounds: IBackgroundSettings[];
    setBackgrounds: React.Dispatch<React.SetStateAction<IBackgroundSettings[]>>;
}
