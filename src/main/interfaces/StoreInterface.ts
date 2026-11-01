export interface IPreferences {
    theme: string;
    language: string;
    recentProjects: IRecentProject[];
    tempBuildPath?: string;
    tempProjectBackupLimit?: number;
    historyLimit?: number;
    gameWorldPanInertia?: boolean;
    gameWorldMovementMode?: 'free' | 'grid';
    sceneObjectSnapSize?: 8 | 16;
    gameWorldRecenterEnabled?: boolean;
    gameWorldRecenterScenes?: boolean;
    gameWorldRecenterActors?: boolean;
    gameWorldRecenterTriggers?: boolean;
}
export interface IRecentProject {
    path: string;
    title: string;
    lastOpened: Date;
    hasCartridgeImage?: boolean;
    cartridgeImage?: string | null;
}
export interface IStoreData {
    preferences: IPreferences;
    __lastUsedPath: string;
    __lastUsedSplashTab: string;
    navigatorSidebarWidth: number;
    worldSidebarWidth: number;
    filesSidebarWidth: number;
}
