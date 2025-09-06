export interface IBaseSettings {
    _resourceType: string;
    _saved: boolean;
    _deleted: boolean;
}

export interface IFileSettings extends IBaseSettings {
    _version: string | null;
    _release: string;
}

export interface IResourceSettings extends IBaseSettings {
    id: string;
    name: string;
    symbol?: string;
    filename?: string;
}