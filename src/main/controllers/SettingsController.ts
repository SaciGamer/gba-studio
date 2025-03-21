import { MainSettings, ProjectSettings, SettingsUtils } from "@/interfaces/MainSettingsInterface";
import { MainSettingsManager } from "@/managers/MainSettingsManager";
import { ProjectManager } from "@/managers/ProjectManager";
import { SettingsUtilsManager } from "@/managers/SettingsUtilsManager";

export class SettingsController {
    private static instance: SettingsController | null = null;
    private projectManager = ProjectManager.getInstance();
    private mainSettingsManager = MainSettingsManager.getInstance();
    private settingsUtilsManager = SettingsUtilsManager.getInstance();

    private constructor() {}

    public static getInstance(): SettingsController {
        if (!SettingsController.instance) {
            SettingsController.instance = new SettingsController();
        }
        return SettingsController.instance;
    }

    public updateSettings<T>(type: 'main' | 'settings' | 'project', newData: Partial<T>): T {
        switch (type) {
            case 'main':
                this.settingsUtilsManager.updateData(newData as Partial<SettingsUtils>);
                return this.settingsUtilsManager.getData() as unknown as T;
            case 'settings':
                this.mainSettingsManager.updateData(newData as Partial<MainSettings>);
                return this.mainSettingsManager.getData() as unknown as T;
            
            case 'project':
                this.projectManager.updateData(newData as Partial<ProjectSettings>);
                return this.projectManager.getData() as unknown as T;

            default:
                throw new Error('..: updateSettings invalid settings type');
        }
    }

    public getSettings<T>(type: 'main' | 'settings' | 'project'): T {
        switch (type) {
            case 'main':
                return this.settingsUtilsManager as unknown as T;
            case 'settings':
                return this.mainSettingsManager as unknown as T;
            case 'project':
                return this.projectManager as unknown as T;
            default:
                throw new Error('..: getSettings invalid settings type');
        }
    }

    public getSettingsData<T>(type: 'main' | 'settings' | 'project'): T {
        switch (type) {
            case 'main':
                return this.settingsUtilsManager.getData() as unknown as T;
            case 'settings':
                return this.mainSettingsManager.getData() as unknown as T;
            case 'project':
                return this.projectManager.getData() as unknown as T;
            default:
                throw new Error('..: getSettings invalid settings type');
        }
    }
}