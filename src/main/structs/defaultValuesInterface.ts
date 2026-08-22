import { IMainSettings, IProjectSettings, ISettingsUtils, IUserSettings } from "@/interfaces/MainSettingsInterface";
import os from 'os';

export const defaultSettingsUtils: ISettingsUtils = {
    _resourceType: 'main',
    saved: true,
    projectPathFile: null,
    projectDirectory: null,
    baseTitle: 'GBA Studio'
};

export const defaultMainSettings: IMainSettings = {
    _resourceType: 'settings',
    startSceneId: '',
    startX: 9,
    startY: 9,
    startMoveSpeed: 1,
    startAnimSpeed: 4,
    startDirection: 'right',
    colorMode: 'mono'
};

export const defaultUserSettings: IUserSettings = {
    _resourceType: 'user_settings',
    worldScrollX: 0,
    worldScrollY: 0,
    zoom: 100,
    favoriteEvents: []
};

export const defaultProjectSettings: IProjectSettings = {
    _resourceType: "project",
    name: null,
    author: os.userInfo().username,
    notes: "",
    _version: "",
    _release: "1"
};

// export const defaultVariablesSettings: IVariablesSettings = {
//     _resourceType: 'variables',
//     variables: []
// };
