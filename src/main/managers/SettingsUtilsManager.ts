import { SettingsUtils } from '@/interfaces/MainSettingsInterface';
import { BaseManager as BaseManager } from './BaseManager';

const defaultSettingsUtils: SettingsUtils = {
    _resourceType: 'main',
    saved: true,
    projectPathFile: null,
    projectDirectory: null,
    baseTitle: 'GBA Studio'
};

export class SettingsUtilsManager extends BaseManager<SettingsUtils> {
    protected static instance: SettingsUtilsManager | null = null;

    private constructor() {
        super(defaultSettingsUtils);
    }

    public static getInstance(): SettingsUtilsManager {
        if (!SettingsUtilsManager.instance) {
            SettingsUtilsManager.instance = new SettingsUtilsManager();
        }
        return SettingsUtilsManager.instance;
    }

    public isSaved(): boolean {
        return this.data.saved;
    }

    public getProjectFile(): string | null {
        return this.data.projectPathFile;
    }

    public setProjectFile(file: string): string | null {
        return this.data.projectPathFile = file;
    }

    public setProjectDirectory(path: string): string | null {
        return this.data.projectDirectory = path;
    }

    public getProjectDirectory(): string | null {
        return this.data.projectDirectory;
    }

    public getBaseTitle(): string {
        return this.data.baseTitle;
    }

}