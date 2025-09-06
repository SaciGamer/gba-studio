import { ISettingsUtils } from '@/interfaces/MainSettingsInterface';
import { ABaseSettingsManager } from './ABaseSettingsManager';
import { defaultSettingsUtils } from '@/structs/defaultValuesInterface';

export abstract class SettingsUtilsManager extends ABaseSettingsManager<any> {
    protected localSettingsUtils: ISettingsUtils = defaultSettingsUtils;

    protected getLocalSettingsUtils(): ISettingsUtils {
        return this.localSettingsUtils;
    }

    public isSaved(): boolean {
        return this.localSettingsUtils.saved;
    }

    public setIsSaved(isSaved: boolean) {
        this.localSettingsUtils.saved = isSaved;
    }

    public getProjectFile(): string | null {
        return this.localSettingsUtils.projectPathFile;
    }

    public setProjectFile(file: string): string | null {
        return this.localSettingsUtils.projectPathFile = file;
    }

    public setProjectDirectory(path: string): string | null {
        return this.localSettingsUtils.projectDirectory = path;
    }

    public getProjectDirectory(): string | null {
        return this.localSettingsUtils.projectDirectory;
    }

    public getBaseTitle(): string {
        return this.localSettingsUtils.baseTitle;
    }

}