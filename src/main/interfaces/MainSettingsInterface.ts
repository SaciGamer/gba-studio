export interface IBaseSettings {
    _resourceType: string;
}

export interface ISettingsUtils extends IBaseSettings {
    saved: boolean;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
}

export interface IMainSettings extends IBaseSettings {
    startSceneId: string;
    startX: number;
    startY: number;
    startMoveSpeed: number;
    startAnimSpeed: number;
    startDirection: 'up' | 'down' | 'left' | 'right';
    colorMode: string;
}

export interface IProjectSettings extends IFileSettings {
    name: string | null;
    author: string;
    notes: string;
}

export interface IFileSettings extends IBaseSettings {
    _version: string | null;
    _release: string;
}