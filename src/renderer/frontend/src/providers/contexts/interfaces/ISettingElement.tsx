import { IBaseSettings } from "./IBaseSettings";

// Interface centralizada
export enum EColorMode {
    Mono = "mono",
    Mixed = "mixed",
}

export interface IMainSettings extends IBaseSettings {
    _resourceType: 'settings';
    startSceneId: string;
    startX: number;
    startY: number;
    startMoveSpeed: number | string;
    startAnimSpeed: number;
    startDirection: 'up' | 'down' | 'left' | 'right';
    colorMode: EColorMode;
}

export interface MainSettingsContextType {
    // Main Settings
    settings?: IMainSettings;
    setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}