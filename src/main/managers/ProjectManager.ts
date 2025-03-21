import os from 'os';
import { ProjectSettings } from '@/interfaces/MainSettingsInterface';
import { BaseManager } from './BaseManager';

let userProjectSettingDefault: ProjectSettings = {
    _resourceType: "project",
    name: null,
    author: os.userInfo().username,
    notes: "",
    _version: "", // pegar versão do sistema versionApplication
    _release: "1"
};

export class ProjectManager extends BaseManager<ProjectSettings> {
    protected constructor() {
        super(userProjectSettingDefault);
    }

    public static getInstance(): ProjectManager {
        if (!ProjectManager.instance) {
            ProjectManager.instance = new ProjectManager();
        }
        return ProjectManager.instance;
    }

    public setProjectName(name: string): string | null {
        return this.data.name = name;
    }

    public getProjectName(): string | null {
        return this.data.name;
    }

}