import { IFileSettings } from "./IBaseSettings";

export interface IProjectSettings extends IFileSettings {
    _resourceType: 'project';
    name: string;
    author: string;
    notes: string;
}

export interface ProjectContextType {
    // Project Settings
    project: IProjectSettings | null;
    setProject: React.Dispatch<React.SetStateAction<IProjectSettings | null>>;
}