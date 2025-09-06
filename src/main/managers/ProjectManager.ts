import { defaultProjectSettings } from '@/structs/defaultValuesInterface';
import { BaseManager } from './BaseManager';
import { IProjectSettings } from '@/interfaces/MainSettingsInterface';

export class ProjectManager extends BaseManager<IProjectSettings> {
    protected constructor() {
        super(defaultProjectSettings);
    }

    public static getInstance(): ProjectManager {
        if (!ProjectManager.instance) {
            ProjectManager.instance = new ProjectManager();
        }
        return ProjectManager.instance;
    }

    public setProjectName(name: string): string | null {
        let response = this.getData();
        return response ? response.name = name : null;
    }

    public getProjectName(): string | null {
        let response = this.getData();
        return response ? response.name : null;
    }

}