import { BaseSettings } from "@/interfaces/MainSettingsInterface";

export abstract class BaseManager<T extends BaseSettings> {
    protected data: T;
    protected static instance: any = null;

    protected constructor(initialData: T) {
        this.data = initialData;
    }

    public getData(): T {
        return this.data;
    }

    public updateData(newData: Partial<T>): T {
        this.data = { ...this.data, ...newData };
        return this.data;
    }

    public getResourceType(): string {
        return this.data._resourceType;
    }
}