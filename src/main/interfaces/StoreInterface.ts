export interface Preferences {
    theme: string;
    language: string;
    recentProjects: RecentProject[];
}
export interface RecentProject {
    path: string;
    name: string;
    lastOpened: Date;
}
export interface StoreData {
    preferences: Preferences;
    __lastUsedPath: string;
    __lastUsedSplashTab: string;
    navigatorSidebarWidth: number;
    worldSidebarWidth: number;
    filesSidebarWidth: number;
}