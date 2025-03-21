export interface BaseSettings {
    _resourceType: string;
}

export interface SettingsUtils extends BaseSettings {
    _resourceType: 'main';
    saved: boolean;
    projectPathFile: string | null;
    projectDirectory: string | null;
    baseTitle: string;
}

export interface MainSettings extends BaseSettings {
    _resourceType: 'settings';
    startSceneId: string;
    startX: number;
    startY: number;
    startMoveSpeed: number;
    startAnimSpeed: number;
    startDirection: 'up' | 'down' | 'left' | 'right';
    colorMode: string;
}

export interface ProjectSettings extends FileSettings {
    _resourceType: 'project';
    name: string | null;
    author: string;
    notes: string;
}

export interface FileSettings extends BaseSettings {
    _version: string | null;
    _release: string;
}