export interface IPreferences {
    theme: string;
    language: string;
    recentProjects: IRecentProject[];
    tempBuildPath?: string;
    tempProjectBackupLimit?: number;
}
export interface IRecentProject {
    path: string;
    name: string;
    lastOpened: Date;
}
export interface IStoreData {
    preferences: IPreferences;
    __lastUsedPath: string;
    __lastUsedSplashTab: string;
    navigatorSidebarWidth: number;
    worldSidebarWidth: number;
    filesSidebarWidth: number;
}