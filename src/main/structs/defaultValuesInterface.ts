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
    colorMode: 'mono',
    fadeDirection: 0,
    inputMap: {
        move_left: ['LEFT'], move_right: ['RIGHT'], move_up: ['UP'], move_down: ['DOWN'],
        confirm: ['A'], cancel: ['B'], jump: ['B'], shoot: ['B'], pause: ['START'], menu: ['SELECT'],
    },
    playerSpriteId: null,
    uiCursorImage: null,
    uiFrameImage: null,
    font8x8Image: null,
    font8x16Image: null,
    font8x8VariablesImage: null,
    font8x16VariablesImage: null,
    font16x16VariablesImage: null,
    playerFrameWidth: 16,
    playerFrameHeight: 16,
    playerFramesPerDirection: 4,
    playerAnimSpeed: 4,
    playerIdleFrame: 0
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
