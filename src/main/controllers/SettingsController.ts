import { SettingsUtilsManager } from "@/managers/SettingsUtilsManager";

export class SettingsController extends SettingsUtilsManager {
    public static getInstance(): SettingsController {
        if (!SettingsController.instance) {
            SettingsController.instance = new SettingsController();
        }
        return SettingsController.instance;
    }

    public addNewItem<T>(newItem: T): void {
        this.addItem(newItem);
    }

    public updateSettings<T>(newData: Partial<T>): T {
        return this.update(newData) as unknown as T;
    }

    public getSettingsData<T>(type: 'main' | 'settings' | 'project' | 'scene' | 'all'): T | T[] {
        switch (type) {
            case 'main':
                return this.getLocalSettingsUtils() as unknown as T;
            case 'settings':
            case 'project':
                return this.getDataByType(type) as unknown as T;
            case 'scene':
                return this.getAllDataByType(type) as unknown as T[];
            case 'all':
                return this.getDataArray() as unknown as T[];
            default:
                throw new Error('..: getSettings invalid settings type');
        }
    }

    public deleteSettings(type: 'scene', idOrResourceType: string): boolean {
        switch (type) {
            case 'scene':
                return this.removeItemByIdOrResourceType(idOrResourceType);
            default:
                throw new Error('..: deleteSettings invalid settings type');
        }
    }

}