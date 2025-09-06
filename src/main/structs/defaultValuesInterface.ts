import os from 'os';
import { IMainSettings, IProjectSettings, ISettingsUtils } from "@/interfaces/MainSettingsInterface";

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

export const defaultProjectSettings: IProjectSettings = {
    _resourceType: "project",
    name: null,
    author: os.userInfo().username,
    notes: "",
    _version: "",
    _release: "1"
};
